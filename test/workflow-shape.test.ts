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

function stepIndex(steps: any[], name: string): number {
  const matches = steps.filter((s) => s.name === name);
  expect(matches, `exactly one step named "${name}"`).toHaveLength(1);
  return steps.indexOf(matches[0]);
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
    const bootstrapIdx = stepIndex(steps, 'Bootstrap Tandoor');
    const testIdx = stepIndex(steps, 'Run E2E tests');
    expect(steps[bootstrapIdx].run).toMatch(/tandoor-bootstrap\.sh/);
    expect(steps[testIdx].run).toMatch(/\btest:e2e\b/);
    expect(testIdx).toBeGreaterThan(bootstrapIdx);
  });

  it('publish job tags the commit and pushes the tag before npm publish', () => {
    // The merged workflow is the only thing that creates the tag, so the
    // ordering matters: tag → push tag → npm publish ensures provenance and
    // GH release reference the same SHA, and a failure between npm publish
    // and gh release create leaves a recoverable npm-only state.
    const steps = release.jobs.publish.steps as any[];
    const tagIdx = stepIndex(steps, 'Tag commit and push tag');
    const publishIdx = stepIndex(steps, 'Publish to npm');
    expect(steps[tagIdx].run).toMatch(/git tag .* "v\$NEW"/);
    expect(steps[tagIdx].run).toMatch(/git push origin "v\$NEW"/);
    expect(steps[publishIdx].run).toMatch(/npm publish/);
    expect(publishIdx).toBeGreaterThan(tagIdx);
  });

  it('publish job routes prereleases to the next dist-tag', () => {
    const steps = release.jobs.publish.steps as any[];
    expect(steps[stepIndex(steps, 'Publish to npm')].run).toMatch(/--tag next/);
  });

  describe('GHCR image', () => {
    const IMAGE = 'ghcr.io/cliftonz/tandoor-recipes-mcp';
    let steps: any[];
    let buildIdx: number;
    let pushIdx: number;
    const named = (name: string) => stepIndex(steps, name);

    beforeAll(() => {
      steps = release.jobs.publish.steps;
      buildIdx = named('Build Docker image');
      pushIdx = named('Push Docker image');
    });

    it('grants packages: write for the GHCR push', () => {
      expect(release.permissions.packages).toBe('write');
    });

    it('builds for amd64 and arm64 before tagging, then pushes after npm publish and before the GitHub release', () => {
      for (const idx of [buildIdx, pushIdx]) {
        expect(steps[idx].uses).toMatch(/^docker\/build-push-action@/);
        expect(steps[idx].with.platforms).toBe('linux/amd64,linux/arm64');
      }
      expect(steps[buildIdx].with.push).toBe(false);
      expect(steps[pushIdx].with.push).toBe(true);
      expect(buildIdx).toBeLessThan(named('Tag commit and push tag'));
      expect(pushIdx).toBeGreaterThan(named('Publish to npm'));
      expect(pushIdx).toBeLessThan(named('Create GitHub release'));
    });

    it('tags the exact version always and latest only on stable releases', () => {
      const tags = steps[pushIdx].with.tags as string;
      expect(tags).toContain(`${IMAGE}:\${{ needs.detect.outputs.version }}`);
      const latestLine = tags.split('\n').find((l) => l.includes(`${IMAGE}:latest`));
      expect(latestLine).toMatch(/needs\.detect\.outputs\.prerelease != 'true' &&/);
    });

    it('pushes with max provenance and an SBOM', () => {
      expect(steps[pushIdx].with.provenance).toBe('mode=max');
      expect(steps[pushIdx].with.sbom).toBe(true);
    });

    it('signs the pushed digest with keyless cosign', () => {
      const signIdx = named('Sign Docker image');
      expect(steps[signIdx].run).toMatch(/cosign sign --yes/);
      expect(signIdx).toBeGreaterThan(pushIdx);
      expect(steps[signIdx].run).toContain(`${IMAGE}@`);
      expect(steps[signIdx].env.DIGEST).toBe(`\${{ steps.${steps[pushIdx].id}.outputs.digest }}`);
    });
  });

  describe('GitHub release assets', () => {
    const MCPB = 'tandoor-recipes-mcp.mcpb';
    const SBOM = 'tandoor-recipes-mcp.cdx.json';
    let steps: any[];
    const named = (name: string) => stepIndex(steps, name);

    beforeAll(() => {
      steps = release.jobs.publish.steps;
    });

    it('generates a production CycloneDX SBOM and a SHA256SUMS over the mcpb and SBOM after packing', () => {
      const idx = named('Generate SBOM and checksums');
      const packIdx = named('Pack Claude Desktop extension');
      expect(steps[packIdx].run).toMatch(/pack-mcpb\.js/);
      expect(idx).toBeGreaterThan(packIdx);
      const lines = (steps[idx].run as string).trim().split('\n');
      expect(lines[0]).toMatch(new RegExp(`^npm sbom --sbom-format cyclonedx --omit dev > ${SBOM}$`));
      expect(lines[1]).toMatch(/^sha256sum .* > SHA256SUMS$/);
      expect(lines[1]).toContain(` ${MCPB}`);
      expect(lines[1]).toContain(` ${SBOM}`);
    });

    it('attaches the mcpb, SBOM and SHA256SUMS in both the prerelease and stable branches', () => {
      const lines = (steps[named('Create GitHub release')].run as string).split('\n').filter((l) => l.includes('gh release create'));
      expect(lines).toHaveLength(2);
      expect(lines.filter((l) => l.includes('--prerelease'))).toHaveLength(1);
      for (const line of lines) {
        for (const asset of [MCPB, SBOM, 'SHA256SUMS']) expect(line).toContain(` ${asset}`);
      }
    });

    it('attests build provenance for the mcpb only when this run tags a release', () => {
      const attest = steps[named('Attest mcpb build provenance')];
      expect(attest.uses).toMatch(/^actions\/attest-build-provenance@[0-9a-f]{40}$/);
      expect(attest.with['subject-path']).toBe(MCPB);
      expect(attest.if).toMatch(/steps\.tagcheck\.outputs\.skip != 'true'/);
      expect(release.permissions.attestations).toBe('write');
      expect(release.permissions['id-token']).toBe('write');
    });
  });

  describe('MCP Registry publish', () => {
    let steps: any[];
    const named = (name: string) => stepIndex(steps, name);
    const isRegistryStep = (s: any) => typeof s.run === 'string' && /mcp-publisher|fileSha256/.test(s.run);

    beforeAll(() => {
      steps = release.jobs.publish.steps;
    });

    it('writes the packed mcpb sha256 into server.json, then logs in with GitHub OIDC, then publishes', () => {
      const shaIdx = named('Write mcpb sha256 into server.json');
      expect(steps[shaIdx].run).toMatch(/sha256sum tandoor-recipes-mcp\.mcpb/);
      expect(steps[shaIdx].run).toMatch(/fileSha256/);
      expect(steps[shaIdx].run).toMatch(/server\.json/);
      const loginIdx = named('Log in to the MCP Registry');
      const publishIdx = named('Publish to the MCP Registry');
      expect(steps[loginIdx].run).toMatch(/mcp-publisher login github-oidc/);
      expect(steps[publishIdx].run).toMatch(/mcp-publisher publish/);
      expect(loginIdx).toBeGreaterThan(shaIdx);
      expect(publishIdx).toBeGreaterThan(loginIdx);
      expect(release.permissions['id-token']).toBe('write');
    });

    it('runs only after the image is signed and the GitHub release holds the mcpb', () => {
      const firstRegistryIdx = steps.findIndex(isRegistryStep);
      const releaseIdx = named('Create GitHub release');
      expect(steps[releaseIdx].run).toMatch(/gh release create .*tandoor-recipes-mcp\.mcpb/);
      expect(firstRegistryIdx).toBeGreaterThan(named('Sign Docker image'));
      expect(firstRegistryIdx).toBeGreaterThan(releaseIdx);
    });

    it('runs only for stable releases that were tagged in this run', () => {
      const registrySteps = steps.filter(isRegistryStep);
      expect(registrySteps.length).toBeGreaterThanOrEqual(3);
      for (const s of registrySteps) {
        expect(s.if).toMatch(/steps\.tagcheck\.outputs\.skip != 'true'/);
        expect(s.if).toMatch(/needs\.detect\.outputs\.prerelease != 'true'/);
      }
    });

    it('installs a pinned mcp-publisher release verified against its Sigstore bundle', () => {
      const install = steps[named('Install mcp-publisher')];
      expect(install.run).toMatch(/tar xzf .*mcp-publisher/);
      expect(install.env.MCP_PUBLISHER_VERSION).toMatch(/^v\d+\.\d+\.\d+$/);
      expect(install.run).not.toMatch(/releases\/latest/);
      expect(install.run).toMatch(/releases\/download\/\$\{MCP_PUBLISHER_VERSION\}/);
      expect(install.run).toMatch(/cosign verify-blob/);
      expect(install.run).toContain(
        '--certificate-identity "https://github.com/modelcontextprotocol/registry/.github/workflows/release.yml@refs/tags/${MCP_PUBLISHER_VERSION}"',
      );
      expect(install.run).toContain('--certificate-oidc-issuer "https://token.actions.githubusercontent.com"');
    });
  });
});
