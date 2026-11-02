import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
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

// Windows runners have no bash on PATH; the bootstrap script is exercised on POSIX runners.
describe.skipIf(process.platform === 'win32')('tandoor-bootstrap.sh output', () => {
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
    expect(out).toBe(`::add-mask::${TOKEN}\n`);
    expect(readFileSync(githubEnv, 'utf8').split('\n')).toEqual(
      expect.arrayContaining([
        'TANDOOR_URL=http://127.0.0.1:8123',
        `TANDOOR_TOKEN=${TOKEN}`,
        `TANDOOR_COMPOSE_FILE=${path.join(root, 'tandoor test', 'docker-compose.yml')}`,
        `TANDOOR_BOOTSTRAP_LOG=${path.join(root, 'tandoor test', 'bootstrap-django.log')}`,
      ]),
    );
  });
});

// Windows runners have no bash on PATH; the bootstrap script is exercised on POSIX runners.
describe.skipIf(process.platform === 'win32')('tandoor-bootstrap.sh migration wait', () => {
  it('reports migrations settled when the container has none pending', () => {
    const bin = path.join(root, 'bin-container');
    const clock = path.join(root, 'clock');
    mkdirSync(bin);
    writeFileSync(clock, '1000');
    stub(bin, 'curl', 'echo 200');
    stub(bin, 'date', `cat "${clock}"`);
    stub(bin, 'sleep', `echo $(( $(cat "${clock}") + $1 )) > "${clock}"`);
    stub(bin, 'python', 'printf " [X]  cookbook.0001_initial\\n [X]  cookbook.0002_more\\n"');
    stub(bin, 'docker', `case "$*" in
  *"manage.py shell"*) echo "__TOKEN__:${TOKEN}" ;;
  exec*) bash -c 'cd() { :; }; source() { :; }; '"\${@: -1}" ;;
esac`);
    const result = spawnSync(SCRIPT, [], {
      env: {
        PATH: `${bin}:/usr/bin:/bin`,
        TANDOOR_TEST_DIR: path.join(root, 'tandoor migrations'),
        TANDOOR_TEST_PORT: '8124',
      },
      encoding: 'utf8',
      timeout: 20_000,
    });
    expect(result.stderr).toContain('migrations settled after 0s');
    expect(result.stderr).not.toContain('did not settle');
  });
});
