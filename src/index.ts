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
import { checkTandoorVersion } from './lib/version-check.js';
import { buildInstructions } from './lib/instructions.js';
import { registerAllTools } from './lib/register-all.js';
import { createHttpTransport, resolveHttpConfig } from './lib/http-transport.js';

// dotenv is a dev convenience — only load it if it's available (it's a
// devDependency, not a production dep). Real deployments inject env via the
// MCP client config.
try {
  const { config } = await import('dotenv');
  config();
} catch {
  // dotenv not installed — fine in production installs.
}

const TANDOOR_URL = process.env.TANDOOR_URL;
const TANDOOR_TOKEN = process.env.TANDOOR_TOKEN;

if (!TANDOOR_URL || !TANDOOR_TOKEN) {
  console.error('Error: TANDOOR_URL and TANDOOR_TOKEN must be set in .env file');
  process.exit(1);
}

const tandoorClient = new TandoorClient({
  url: TANDOOR_URL,
  token: TANDOOR_TOKEN,
});

function resolveTransportMode(raw: string | undefined): 'stdio' | 'http' {
  return (raw || '').toLowerCase() === 'http' ? 'http' : 'stdio';
}
const transportMode = resolveTransportMode(process.env.TANDOOR_MCP_TRANSPORT);
const httpCfg = transportMode === 'http' ? resolveHttpConfig() : undefined;

// Resolve once at startup so the instructions string (sent to the client on
// initialize) and the operator-facing startup log show the same effective
// numbers — including any overrides from TANDOOR_MCP_STASH_*.
const stashCfgAtBoot = getStashConfig();

// Probe the Tandoor version before building the server so an incompatibility
// warning can ride along in the instructions string (the LLM sees it) as well
// as stderr (the operator sees it). Inconclusive results never block startup.
const versionCheck = await checkTandoorVersion(tandoorClient);
if (versionCheck.status !== 'ok') {
  console.error(`[tandoor-mcp] ${versionCheck.level === 'warning' ? 'WARNING' : 'NOTE'}: ${versionCheck.detail}`);
}

const server = new McpServer(
  {
    name: pkg.name,
    version: pkg.version,
  },
  {
    instructions: buildInstructions(versionCheck, stashCfgAtBoot, {
      mode: transportMode,
      bind: httpCfg ? `${httpCfg.host}:${httpCfg.port}` : undefined,
      requireAuth: httpCfg?.requireAuth ?? false,
    }),
  }
);

// Tool-group profile. Every MCP client loads every tool schema into context
// on `list_tools`, so ~135 tools × ~400 tokens each is a real cost for small
// workflows. TANDOOR_MCP_PROFILE controls visibility.
//   - "core"  (default): only ~25 always-on tools are visible; the rest are
//     registered-but-disabled and revealed on demand via enable_tool_group.
//   - "basic": skip admin/misc tool families entirely (legacy lever).
//   - "full":  every tool visible at boot. Highest context cost.
function resolveProfile(raw: string | undefined): 'core' | 'basic' | 'full' {
  const v = (raw || '').toLowerCase();
  if (v === 'basic') return 'basic';
  if (v === 'full') return 'full';
  return 'core';
}
const profile = resolveProfile(process.env.TANDOOR_MCP_PROFILE);

registerAllTools(server, tandoorClient, { profile, pkg, versionCheck });

async function main() {
  const stashLine = stashCfgAtBoot.enabled
    ? `stash=on(>${stashCfgAtBoot.thresholdBytes}B, ttl=${stashCfgAtBoot.ttlMs}ms, max=${stashCfgAtBoot.maxEntries}, maxBytes=${stashCfgAtBoot.maxBytes})`
    : 'stash=off';

  if (transportMode === 'http' && httpCfg) {
    const handle = createHttpTransport(server);
    await handle.start();
    console.error(
      `[tandoor-mcp] ${pkg.name}@${pkg.version} on http://${httpCfg.host}:${httpCfg.port}${httpCfg.path} | auth=${httpCfg.requireAuth ? 'required' : 'disabled'} | api=${tandoorClient.getBaseUrl()} | tandoor=${versionCheck.version ?? versionCheck.status} | profile=${profile} | ${stashLine} | max_body=${httpCfg.maxBodyBytes}B | max_conns=${httpCfg.maxConnections} | drain=${httpCfg.drainMs}ms | dynamic-gating=disabled`,
    );
    const shutdown = (signal: string) => {
      console.error(`[tandoor-mcp] ${signal} received, draining`);
      handle.stop().then(() => process.exit(0));
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    return;
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error(
    `[tandoor-mcp] ${pkg.name}@${pkg.version} on stdio | api=${tandoorClient.getBaseUrl()} | tandoor=${versionCheck.version ?? versionCheck.status} | profile=${profile} | ${stashLine}`,
  );
}

main().catch((error) => {
  console.error('Fatal error in main():', error);
  process.exit(1);
});
