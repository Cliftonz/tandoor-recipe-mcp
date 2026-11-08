import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { TandoorClient } from '../src/clients/index.js';
import { registerAllTools } from '../src/lib/register-all.js';
import { parse } from 'yaml';
import { SECTIONS, parseSectionModes, sectionTools } from '../src/lib/sections.js';
import { _resetRegisteredNames } from '../src/lib/register.js';
import { ALL_SECTIONS_OPEN } from './helpers/mcp.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const skillsDir = path.join(root, 'plugins/claude/skills');

const TOOL_NAME = /^[a-z][a-z0-9]*(_[a-z0-9]+)+$/;
const HYPHENATED = /^[a-z][a-z0-9]*(-[a-z0-9]+)+$/;
const ALLOWED_HYPHENATED = new Set<string>();
const SECTION_TOOLS = new Map(SECTIONS.map((s) => [s.name, new Set(sectionTools(s))]));

const backticked = (text: string) => [...text.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]);
const cells = (line: string) => line.trim().slice(1, -1).split('|').map((c) => c.trim());

function toolSectionRows(body: string): [tools: string[], sections: string[]][] {
  const rows: [string[], string[]][] = [];
  let header: string[] = [];
  for (const line of body.split('\n')) {
    if (!line.startsWith('|')) header = [];
    else if (/^[|\s:-]+$/.test(line)) continue;
    else if (header.length === 0) header = cells(line);
    else if (header.includes('Tool') && header.includes('Section')) {
      const row = cells(line);
      rows.push([backticked(row[header.indexOf('Tool')]), backticked(row[header.indexOf('Section')])]);
    }
  }
  return rows;
}

function checkSkills(dir: string, tools: ReadonlySet<string>): string[] {
  const problems: string[] = [];
  for (const skill of existsSync(dir) ? readdirSync(dir).sort() : []) {
    const text = readFileSync(path.join(dir, skill, 'SKILL.md'), 'utf8').replace(/\r\n/g, '\n');
    const [, front, body] = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/.exec(text)!;
    const meta = parse(front);
    if (meta.name !== skill) problems.push(`${skill}: frontmatter name "${meta.name}" does not match the folder name`);
    if (!meta.description) problems.push(`${skill}: frontmatter has no description`);
    for (const token of new Set(backticked(body))) {
      if (TOOL_NAME.test(token) && !tools.has(token)) problems.push(`${skill}: \`${token}\` is not a registered tool`);
      if (HYPHENATED.test(token) && !SECTION_TOOLS.has(token) && !ALLOWED_HYPHENATED.has(token)) {
        problems.push(`${skill}: \`${token}\` is not a section name`);
      }
    }
    for (const [rowTools, rowSections] of toolSectionRows(body)) {
      for (const tool of rowTools.filter((t) => !rowSections.some((s) => SECTION_TOOLS.get(s)!.has(t)))) {
        problems.push(`${skill}: \`${tool}\` is not in the ${rowSections.map((s) => `\`${s}\``).join(' or ')} section`);
      }
    }
  }
  return problems;
}

let tools: Set<string>;
let scratch: string;

beforeAll(async () => {
  _resetRegisteredNames();
  const server = new McpServer({ name: 'skills', version: 'skills' });
  registerAllTools(server, new TandoorClient({ url: 'https://x.test', token: 't' }), {
    sections: parseSectionModes(ALL_SECTIONS_OPEN),
    pkg: { name: 'tandoor-mcp-test', version: '0.0.0-test' },
    versionCheck: { status: 'ok', level: 'note', detail: 'skills stub' },
  });
  const [clientSide, serverSide] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'skills-client', version: '1.0' });
  await Promise.all([server.connect(serverSide), client.connect(clientSide)]);
  tools = new Set((await client.listTools()).tools.map((t) => t.name));
  scratch = mkdtempSync(path.join(tmpdir(), 'tandoor-skills-test-'));
});

afterAll(() => {
  rmSync(scratch, { recursive: true, force: true });
});

describe('skills reference tools in backticks by exact name, and sections by name', () => {
  it('every shipped SKILL.md names only real tools and sections', () => {
    expect(checkSkills(skillsDir, tools)).toEqual([]);
  });

  it('ships the same skills folder in the Codex plugin, whose root is the repo root', () => {
    const codex = JSON.parse(readFileSync(path.join(root, '.codex-plugin/plugin.json'), 'utf8'));
    expect(path.join(root, codex.skills)).toBe(path.join(skillsDir, '/'));
  });

  it('reads SKILL.md files checked out with CRLF line endings', () => {
    const dir = path.join(scratch, 'crlf');
    for (const skill of readdirSync(skillsDir)) {
      mkdirSync(path.join(dir, skill), { recursive: true });
      const text = readFileSync(path.join(skillsDir, skill, 'SKILL.md'), 'utf8');
      writeFileSync(path.join(dir, skill, 'SKILL.md'), text.replace(/\n/g, '\r\n'));
    }
    expect(checkSkills(dir, tools)).toEqual([]);
  });

  it('passes when there is no skills folder', () => {
    expect(checkSkills(path.join(scratch, 'missing'), tools)).toEqual([]);
  });

  it('reports each broken rule in a bad SKILL.md', () => {
    const dir = path.join(scratch, 'bad');
    mkdirSync(path.join(dir, 'bad-skill'), { recursive: true });
    writeFileSync(
      path.join(dir, 'bad-skill', 'SKILL.md'),
      [
        '---',
        'name: other-name',
        '---',
        'Call `make_dinner_now`, then enable `meal-plans`.',
        '',
        '| Tool | Section |',
        '| --- | --- |',
        '| `list_meal_plans` | `shopping` |',
        '',
      ].join('\n'),
    );
    expect(checkSkills(dir, tools)).toEqual([
      'bad-skill: frontmatter name "other-name" does not match the folder name',
      'bad-skill: frontmatter has no description',
      'bad-skill: `make_dinner_now` is not a registered tool',
      'bad-skill: `meal-plans` is not a section name',
      'bad-skill: `list_meal_plans` is not in the `shopping` section',
    ]);
  });
});
