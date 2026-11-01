import { execSync } from 'node:child_process';

export default function buildOnce(): void {
  execSync('npm run build', { stdio: 'inherit' });
}
