import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { execSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(process.argv[2]);
const staging = mkdtempSync(join(tmpdir(), 'tandoor-mcpb-staging-'));

for (const entry of ['manifest.json', 'package.json', 'package-lock.json', 'LICENSE', 'build']) {
  cpSync(join(root, entry), join(staging, entry), { recursive: true });
}
execSync('npm install --omit=dev --no-save --ignore-scripts --no-audit --no-fund', { cwd: staging, stdio: 'inherit' });
execSync(`npm run --silent mcpb -- pack "${staging}" "${output}"`, { cwd: root, stdio: 'inherit' });
rmSync(staging, { recursive: true });
