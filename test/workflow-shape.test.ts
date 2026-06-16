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
  let release: any;
  let e2e: any;

  beforeAll(() => {
    // Merged workflow: release.yml owns detect → e2e → build → test → tag →
    // npm publish → gh release. The contract this file pins is "publish job
    // must depend on e2e" — same shape as the old two-workflow split, just
    // collapsed into one file (commit f8355a3).
    release = readWorkflow('release.yml');
    e2e = readWorkflow('e2e.yml');
  });

  it('publish job has an e2e job in its needs (bareword or array)', () => {
    expect(release.jobs.publish).toBeDefined();
    expect(needsIncludes(release.jobs.publish.needs, 'e2e')).toBe(true);
  });

  it('release workflow defines an e2e reusable-workflow job pointing at e2e.yml', () => {
    expect(release.jobs.e2e).toBeDefined();
    expect(release.jobs.e2e.uses).toBe('./.github/workflows/e2e.yml');
  });

  it('e2e workflow exposes workflow_call so release can invoke it', () => {
    // YAML parses `on:` as a key; reusable-workflow trigger is `workflow_call`.
    // The key can be top-level `on: { workflow_call: ... }` or a list — both
    // shapes resolve to a key on `on`.
    const triggers = e2e.on ?? e2e.true; // js-yaml quirk: `on` sometimes parses as `true`
    expect(triggers).toBeDefined();
    expect(triggers.workflow_call !== undefined || Array.isArray(triggers) && triggers.includes('workflow_call')).toBe(true);
  });

  it('publish job runs strict CI snapshot mode via test:ci', () => {
    const steps = release.jobs.publish.steps as any[];
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

  it('publish job tags the commit and pushes the tag before npm publish', () => {
    // The merged workflow is the only thing that creates the tag, so the
    // ordering matters: tag → push tag → npm publish ensures provenance and
    // GH release reference the same SHA, and a failure between npm publish
    // and gh release create leaves a recoverable npm-only state.
    const steps = release.jobs.publish.steps as any[];
    const tagIdx = steps.findIndex((s) => typeof s.run === 'string' && /git tag .* "v\$NEW"/.test(s.run));
    const publishIdx = steps.findIndex((s) => typeof s.run === 'string' && /npm publish/.test(s.run));
    expect(tagIdx).toBeGreaterThanOrEqual(0);
    expect(publishIdx).toBeGreaterThan(tagIdx);
  });

  it('publish job routes prereleases to the next dist-tag', () => {
    const steps = release.jobs.publish.steps as any[];
    const publishStep = steps.find((s) => typeof s.run === 'string' && /npm publish/.test(s.run));
    expect(publishStep).toBeDefined();
    expect(publishStep.run).toMatch(/--tag next/);
  });
});
