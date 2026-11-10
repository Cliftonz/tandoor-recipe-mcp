import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TandoorClient } from '../src/clients/index.js';
import { registerAllTools } from '../src/lib/register-all.js';
import { parseSectionModes } from '../src/lib/sections.js';
import { _resetRegisteredNames } from '../src/lib/register.js';
import { buildInstructions } from '../src/lib/instructions.js';
import { getStashConfig } from '../src/lib/stash.js';
import { ALL_SECTIONS_OPEN } from './helpers/mcp.js';

const EM_DASH = '\u2014';
const EN_DASH = '\u2013';
const REPO_ROOT = fileURLToPath(new URL('..', import.meta.url));

function trackedFilesContainingDashes(): string[] {
  const grep = spawnSync('git', ['grep', '-I', '-l', '-F', '-e', EM_DASH, '-e', EN_DASH], { cwd: REPO_ROOT, encoding: 'utf8' });
  if (grep.status !== 0 && grep.status !== 1) throw new Error(`git grep failed: ${grep.stderr}`);
  return grep.stdout.split('\n').filter(Boolean);
}

async function clientVisibleText(): Promise<Record<string, string>> {
  _resetRegisteredNames();
  const sections = parseSectionModes(ALL_SECTIONS_OPEN);
  const versionCheck = { status: 'ok', level: 'note', detail: 'stub' } as const;
  const server = new McpServer({ name: 'no-em-dash', version: '0' });
  registerAllTools(server, new TandoorClient({ url: 'https://x.test', token: 't' }), {
    sections,
    pkg: { name: 'tandoor-mcp-test', version: '0.0.0-test' },
    versionCheck,
  });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'no-em-dash-client', version: '1.0' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);

  const text: Record<string, string> = {
    instructions: buildInstructions(versionCheck, getStashConfig(), sections),
  };
  for (const tool of (await client.listTools()).tools) text[`tool ${tool.name}`] = JSON.stringify(tool);
  for (const resource of (await client.listResources()).resources) text[`resource ${resource.uri}`] = JSON.stringify(resource);
  for (const template of (await client.listResourceTemplates()).resourceTemplates) {
    text[`resource template ${template.uriTemplate}`] = JSON.stringify(template);
  }
  for (const prompt of (await client.listPrompts()).prompts) {
    const args = prompt.arguments ?? [];
    const required = Object.fromEntries(args.filter((a) => a.required).map((a) => [a.name, '1']));
    const all = Object.fromEntries(args.map((a) => [a.name, '1']));
    text[`prompt ${prompt.name}`] = JSON.stringify([
      prompt,
      await client.getPrompt({ name: prompt.name, arguments: required }),
      await client.getPrompt({ name: prompt.name, arguments: all }),
    ]);
  }
  await client.close();
  return text;
}

describe('client-visible text', () => {
  it('contains no em-dashes in tools, resources, prompts or instructions', async () => {
    const text = await clientVisibleText();
    const offenders = Object.entries(text)
      .filter(([, value]) => value.includes(EM_DASH))
      .map(([key]) => key);
    expect(offenders).toEqual([]);
  });
});

describe('repository text', () => {
  it('contains no em-dashes or en-dashes in any git-tracked text file', () => {
    expect(trackedFilesContainingDashes()).toEqual([]);
  });
});
