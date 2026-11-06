import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export default function isolateConfigHome(): () => void {
  const configHome = mkdtempSync(join(tmpdir(), 'tandoor-mcp-test-config-'));
  process.env.XDG_CONFIG_HOME = configHome;
  return () => rmSync(configHome, { recursive: true, force: true });
}
