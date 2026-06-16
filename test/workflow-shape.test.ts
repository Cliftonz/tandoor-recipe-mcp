// Pins the release-gating chain in .github/workflows so a single-line YAML
// edit cannot silently restore the "publish on tag without live e2e" state.
//
// Uses a real YAML parser instead of regex so structural edits (`needs: [e2e,
// lint]`, multiline `needs:\n  - e2e`, reordered keys) are tolerated when
// they preserve the contract — and caught when they violate it.

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readWorkflow(name: string): any {
  return parseYaml(readFileSync(path.join(REPO, '.github', 'workflows', name), 'utf8'));
}

function needsIncludes(needs: unknown, target: string): boolean {
  if (typeof needs === 'string') return needs === target;
  if (Array.isArray(needs)) return needs.includes(target);
  return false;
}

describe('release-gating workflow shape', () => {
  let publish: any;
  let e2e: any;

  beforeAll(() => {
    publish = readWorkflow('publish.yml');
    e2e = readWorkflow('e2e.yml');
  });

  it('publish job has an e2e job in its needs (bareword or array)', () => {
    expect(publish.jobs.publish).toBeDefined();
    expect(needsIncludes(publish.jobs.publish.needs, 'e2e')).toBe(true);
  });

  it('publish defines an e2e reusable-workflow job pointing at e2e.yml', () => {
    expect(publish.jobs.e2e).toBeDefined();
    expect(publish.jobs.e2e.uses).toBe('./.github/workflows/e2e.yml');
  });

  it('e2e workflow exposes workflow_call so publish can invoke it', () => {
    // YAML parses `on:` as a key; reusable-workflow trigger is `workflow_call`.
    // The key can be top-level `on: { workflow_call: ... }` or a list — both
    // shapes resolve to a key on `on`.
    const triggers = e2e.on ?? e2e.true; // js-yaml quirk: `on` sometimes parses as `true`
    expect(triggers).toBeDefined();
    expect(triggers.workflow_call !== undefined || Array.isArray(triggers) && triggers.includes('workflow_call')).toBe(true);
  });

  it('publish workflow runs strict CI snapshot mode via test:ci', () => {
    const steps = publish.jobs.publish.steps as any[];
    const hasTestCi = steps.some((s) => typeof s.run === 'string' && /\btest:ci\b/.test(s.run));
    expect(hasTestCi).toBe(true);
  });

  it('e2e workflow runs the bootstrap script before tests', () => {
    const steps = e2e.jobs.e2e.steps as any[];
    const bootstrapStep = steps.find((s) => typeof s.run === 'string' && /tandoor-bootstrap\.sh/.test(s.run));
    expect(bootstrapStep).toBeDefined();
    const testStep = steps.findIndex((s) => typeof s.run === 'string' && /\btest:e2e\b/.test(s.run));
    const bootstrapIdx = steps.indexOf(bootstrapStep);
    expect(bootstrapIdx).toBeGreaterThanOrEqual(0);
    expect(testStep).toBeGreaterThan(bootstrapIdx);
  });
});
