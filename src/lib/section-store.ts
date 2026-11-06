import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';
import { BaseClient } from '../clients/base.js';
import { SECTIONS, modesOf, type Section, type SectionMode } from './sections.js';

type Store = Record<string, Record<string, unknown>>;

interface ParsedStore {
  store: Store;
  key?: string;
}

export function sectionsFile(env: Record<string, string | undefined>): string {
  const configHome = env.XDG_CONFIG_HOME ?? '';
  return join(isAbsolute(configHome) ? configHome : join(homedir(), '.config'), 'tandoor-mcp', 'sections.json');
}

export function instanceKey(url: string): string {
  return new BaseClient({ url, token: '' }).getBaseUrl();
}

function matches(key: string, origin: string): boolean {
  try {
    return instanceKey(key) === origin;
  } catch {
    return false;
  }
}

const modeOf = (section: Section, value: unknown): SectionMode | undefined =>
  typeof value === 'string' ? modesOf(section).find((m) => m === value.trim().toLowerCase()) : undefined;

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

function parseStore(text: string, origin: string): ParsedStore {
  const store: unknown = JSON.parse(text);
  if (!isObject(store)) throw new Error('expected a JSON object keyed by TANDOOR_URL');
  for (const [url, saved] of Object.entries(store)) {
    if (!isObject(saved)) throw new Error(`entry for ${url} is not an object`);
    for (const section of SECTIONS) {
      const mode = saved[section.name];
      if (mode !== undefined && !modeOf(section, mode)) {
        throw new Error(`${url} ${section.name}=${JSON.stringify(mode)} is not valid. Valid values: ${modesOf(section).join(', ')}.`);
      }
    }
  }
  const keys = Object.keys(store).filter((key) => matches(key, origin));
  if (keys.length > 1) throw new Error(`more than one entry is for ${origin}: ${keys.join(', ')}`);
  return { store: store as Store, key: keys[0] };
}

function readText(file: string): string {
  try {
    return readFileSync(file, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return '{}';
    throw error;
  }
}

function readStoreForSave(file: string, origin: string): ParsedStore {
  const text = readText(file);
  try {
    return parseStore(text, origin);
  } catch {
    return { store: {} };
  }
}

export function saveSectionMode(env: Record<string, string | undefined>, origin: string, section: string, mode: SectionMode): void {
  const file = sectionsFile(env);
  const { store, key = origin } = readStoreForSave(file, origin);
  store[key] = { ...store[key], [section]: mode };
  mkdirSync(dirname(file), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  writeFileSync(temp, `${JSON.stringify(store, null, 2)}\n`);
  renameSync(temp, file);
}

export function loadSavedSections(env: Record<string, string | undefined>, origin: string): Partial<Record<string, SectionMode>> {
  const file = sectionsFile(env);
  try {
    const { store, key } = parseStore(readText(file), origin);
    const saved = key ? store[key]! : {};
    return Object.fromEntries(SECTIONS.map((s) => [s.name, modeOf(s, saved[s.name])]));
  } catch (error) {
    console.error(`[tandoor-mcp] WARNING: ignoring saved sections in ${file}: ${(error as Error).message}`);
    return {};
  }
}
