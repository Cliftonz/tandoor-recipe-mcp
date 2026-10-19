import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'tandoor-bootstrap.sh');
const TOKEN = 'a'.repeat(43);

let root: string;

function stub(dir: string, name: string, body: string) {
  writeFileSync(path.join(dir, name), `#!/usr/bin/env bash\n${body}\n`, { mode: 0o755 });
}

beforeAll(() => {
  root = mkdtempSync(path.join(tmpdir(), 'bootstrap-export-'));
  const bin = path.join(root, 'bin');
  mkdirSync(bin);
  stub(bin, 'curl', 'echo 200');
  stub(bin, 'docker', `case "$*" in
  *showmigrations*) echo 0 ;;
  *"manage.py shell"*) echo "__TOKEN__:${TOKEN}" ;;
esac`);
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

describe('tandoor-bootstrap.sh local output', () => {
  it('exports the vars to child processes after the documented eval', () => {
    const testDir = path.join(root, 'tandoor test');
    const out = execFileSync(
      'bash',
      ['-c', 'eval "$("$SCRIPT")" && env'],
      {
        env: {
          PATH: `${path.join(root, 'bin')}:/usr/bin:/bin`,
          SCRIPT,
          TANDOOR_TEST_DIR: testDir,
          TANDOOR_TEST_PORT: '8123',
        },
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 20_000,
      },
    ).toString();
    const childEnv = Object.fromEntries(
      out.split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
    );
    expect(childEnv.TANDOOR_URL).toBe('http://127.0.0.1:8123');
    expect(childEnv.TANDOOR_TOKEN).toBe(TOKEN);
    expect(childEnv.TANDOOR_COMPOSE_FILE).toBe(path.join(testDir, 'docker-compose.yml'));
  });
});
