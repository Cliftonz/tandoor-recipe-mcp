#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { TandoorClient } from './clients/index.js';

// Read the runtime version from package.json so the MCP server advertises the
// same version users installed. Works both in source (src/ → ../package.json
// walk) and in the published tarball (build/ → ../package.json).
const thisDir = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(thisDir, '..', 'package.json'), 'utf8')) as {
  name: string;
  version: string;
};
import { getStashConfig } from './lib/stash.js';
import { checkTandoorVersion, checkTandoorVersionWithoutToken } from './lib/version-check.js';
import { buildInstructions } from './lib/instructions.js';
import { registerAllTools } from './lib/register-all.js';
import { createHttpTransport, resolveHttpConfig, type HttpConfig } from './lib/http-transport.js';
import { isRemoteMode } from './lib/register.js';
import { instanceKey, loadSavedSections } from './lib/section-store.js';
import { SECTION_ENV_VARS, SectionSettingsError, formatSectionModes, parseSectionModes, type SectionModes } from './lib/sections.js';

// dotenv is a dev convenience — only load it if it's available (it's a
// devDependency, not a production dep). Real deployments inject env via the
// MCP client config.
try {
  const { config } = await import('dotenv');
  config();
} catch {
  // dotenv not installed — fine in production installs.
}

const pluginOptionOr = (pluginOption: string, envVar: string): string | undefined =>
  process.env[pluginOption]?.trim() ? process.env[pluginOption] : process.env[envVar];
const TANDOOR_URL = pluginOptionOr('CLAUDE_PLUGIN_OPTION_TANDOOR_URL', 'TANDOOR_URL');
const TANDOOR_TOKEN = pluginOptionOr('CLAUDE_PLUGIN_OPTION_TANDOOR_TOKEN', 'TANDOOR_TOKEN');

function resolveTransportMode(raw: string | undefined): 'stdio' | 'http' {
  return (raw || '').toLowerCase() === 'http' ? 'http' : 'stdio';
}
const transportMode = resolveTransportMode(process.env.TANDOOR_MCP_TRANSPORT);

function resolveHttpConfigOrExit(): HttpConfig {
  try {
    return resolveHttpConfig();
  } catch (error) {
    console.error(`Error: ${(error as Error).message}`);
    process.exit(1);
  }
}

function resolveTandoor() {
  if (isRemoteMode()) {
    if (transportMode !== 'http') {
      console.error('Error: TANDOOR_MCP_PUBLIC_URL requires TANDOOR_MCP_TRANSPORT=http.');
      process.exit(1);
    }
    if (!TANDOOR_URL) {
      console.error("Error: TANDOOR_URL must be set in .env file (or set the plugin's Tandoor URL setting)");
      process.exit(1);
    }
    if (TANDOOR_TOKEN?.trim()) {
      console.error('Error: TANDOOR_TOKEN is not used in remote mode; remove it. Each user connects with their own Tandoor token.');
      process.exit(1);
    }
    return { remote: true as const, origin: instanceKey(TANDOOR_URL), httpCfg: resolveHttpConfigOrExit() };
  }
  if (!TANDOOR_URL || !TANDOOR_TOKEN) {
    console.error("Error: TANDOOR_URL and TANDOOR_TOKEN must be set in .env file (or set the plugin's Tandoor URL and Tandoor API Token settings)");
    process.exit(1);
  }
  const client = new TandoorClient({ url: TANDOOR_URL, token: TANDOOR_TOKEN });
  return { remote: false as const, origin: client.getBaseUrl(), client };
}
const tandoor = resolveTandoor();

if (process.env.TANDOOR_MCP_PROFILE?.trim()) {
  console.error(
    `[tandoor-mcp] WARNING: TANDOOR_MCP_PROFILE is ignored. Choose tools with the section settings: ${SECTION_ENV_VARS}.`,
  );
}

function readSections(): SectionModes {
  try {
    return parseSectionModes(process.env, loadSavedSections(process.env, tandoor.origin));
  } catch (error) {
    if (!(error instanceof SectionSettingsError)) throw error;
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }
}
const sections = readSections();

const localHttpCfg = !tandoor.remote && transportMode === 'http' ? resolveHttpConfigOrExit() : undefined;
const httpCfg = tandoor.remote ? tandoor.httpCfg : localHttpCfg;

// Resolve once at startup so the instructions string (sent to the client on
// initialize) and the operator-facing startup log show the same effective
// numbers — including any overrides from TANDOOR_MCP_STASH_*.
const stashCfgAtBoot = getStashConfig();

// Probe the Tandoor version at startup so an incompatibility
// warning can ride along in the instructions string (the LLM sees it) as well
// as stderr (the operator sees it). Inconclusive results never block startup.
const versionCheck = await (tandoor.remote ? checkTandoorVersionWithoutToken(tandoor.origin) : checkTandoorVersion(tandoor.client));
if (versionCheck.status !== 'ok') {
  console.error(`[tandoor-mcp] ${versionCheck.level === 'warning' ? 'WARNING' : 'NOTE'}: ${versionCheck.detail}`);
}

function buildServer(client: TandoorClient): McpServer {
  const server = new McpServer(
    {
      name: pkg.name,
      version: pkg.version,
    },
    {
      instructions: buildInstructions(versionCheck, stashCfgAtBoot, sections, {
        mode: transportMode,
        bind: httpCfg ? `${httpCfg.host}:${httpCfg.port}` : undefined,
        requireAuth: httpCfg?.requireAuth ?? false,
      }),
    }
  );
  registerAllTools(server, client, { sections, pkg, versionCheck });
  return server;
}

const stashLine = stashCfgAtBoot.enabled
  ? `stash=on(>${stashCfgAtBoot.thresholdBytes}B, ttl=${stashCfgAtBoot.ttlMs}ms, max=${stashCfgAtBoot.maxEntries}, maxBytes=${stashCfgAtBoot.maxBytes})`
  : 'stash=off';

async function serveHttp(cfg: HttpConfig, serve: Parameters<typeof createHttpTransport>[0]) {
  const handle = createHttpTransport(serve, tandoor.origin);
  await handle.start().catch((error: NodeJS.ErrnoException) => {
    if (error.code !== 'EADDRINUSE') throw error;
    console.error(`[tandoor-mcp] Error: port ${cfg.port} is already in use (TANDOOR_MCP_HTTP_PORT).`);
    process.exit(1);
  });
  const auth = tandoor.remote ? 'oauth' : cfg.requireAuth ? 'required' : 'disabled';
  console.error(
    `[tandoor-mcp] ${pkg.name}@${pkg.version} on http://${cfg.host}:${cfg.port}${cfg.path}${cfg.remote ? ` | public=${cfg.remote.publicUrl.href}` : ''} | auth=${auth} | api=${tandoor.origin} | tandoor=${versionCheck.version ?? versionCheck.status} | sections=${formatSectionModes(sections)} | ${stashLine} | max_body=${cfg.maxBodyBytes}B | max_conns=${cfg.maxConnections} | drain=${cfg.drainMs}ms | dynamic-gating=disabled`,
  );
  const shutdown = (signal: string) => {
    console.error(`[tandoor-mcp] ${signal} received, draining`);
    handle.stop().then(() => process.exit(0));
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

async function main() {
  if (tandoor.remote) return serveHttp(tandoor.httpCfg, { remote: buildServer });
  const { client } = tandoor;
  if (localHttpCfg) return serveHttp(localHttpCfg, () => buildServer(client));

  const transport = new StdioServerTransport();
  await buildServer(client).connect(transport);
  console.error(
    `[tandoor-mcp] ${pkg.name}@${pkg.version} on stdio | api=${tandoor.origin} | tandoor=${versionCheck.version ?? versionCheck.status} | sections=${formatSectionModes(sections)} | ${stashLine}`,
  );
}

main().catch((error) => {
  console.error('Fatal error in main():', error);
  process.exit(1);
});
