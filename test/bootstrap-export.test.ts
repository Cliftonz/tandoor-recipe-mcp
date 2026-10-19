import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'scripts', 'tandoor-bootstrap.sh');
const TOKEN = 'a'.repeat(43);

let root: string;

function run(command: string, env: Record<string, string> = {}) {
  return execFileSync('bash', ['-c', command], {
    env: {
      PATH: `${path.join(root, 'bin')}:/usr/bin:/bin`,
      SCRIPT,
      TANDOOR_TEST_DIR: path.join(root, 'tandoor test'),
      TANDOOR_TEST_PORT: '8123',
      ...env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 20_000,
  }).toString();
}

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

describe('tandoor-bootstrap.sh output', () => {
  it('exports the vars to child processes after the documented eval', () => {
    const out = run('eval "$("$SCRIPT")" && env');
    const childEnv = Object.fromEntries(
      out.split('\n').filter((l) => l.includes('=')).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]),
    );
    expect(childEnv.TANDOOR_URL).toBe('http://127.0.0.1:8123');
    expect(childEnv.TANDOOR_TOKEN).toBe(TOKEN);
    expect(childEnv.TANDOOR_COMPOSE_FILE).toBe(path.join(root, 'tandoor test', 'docker-compose.yml'));
  });

  it('writes KEY=value lines to GITHUB_ENV and prints no exports when GITHUB_ENV is set', () => {
    const githubEnv = path.join(root, 'github-env');
    writeFileSync(githubEnv, '');
    const out = run('"$SCRIPT"', { GITHUB_ENV: githubEnv });
    expect(out).not.toMatch(/^export /m);
    expect(readFileSync(githubEnv, 'utf8').split('\n')).toEqual(
      expect.arrayContaining([
        'TANDOOR_URL=http://127.0.0.1:8123',
        `TANDOOR_TOKEN=${TOKEN}`,
        `TANDOOR_COMPOSE_FILE=${path.join(root, 'tandoor test', 'docker-compose.yml')}`,
      ]),
    );
  });
});
