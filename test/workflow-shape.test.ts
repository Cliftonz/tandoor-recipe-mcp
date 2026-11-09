// Pins the release-gating chain in .github/workflows so a single-line YAML
// edit cannot silently restore the "publish on tag without live e2e" state.
//
// Uses a real YAML parser instead of regex so structural edits (`needs: [e2e,
// lint]`, multiline `needs:\n  - e2e`, reordered keys) are tolerated when
// they preserve the contract — and caught when they violate it.

import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
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

  describe('e2e Tandoor version matrix', () => {
    const triggers = () => e2e.on ?? e2e.true;

    it('runs on PRs to main, on dispatch and when called, with no schedule of its own', () => {
      expect(triggers().pull_request.branches).toEqual(['main']);
      expect(triggers()).not.toHaveProperty('schedule');
      expect(triggers()).toHaveProperty('workflow_dispatch');
      expect(triggers()).toHaveProperty('workflow_call');
    });

    it('detects PR changes from the merge commit with a shallow, credential-free checkout', () => {
      const changes = e2e.jobs.changes;
      expect(changes.steps[0].with).toEqual({ 'fetch-depth': 2, 'persist-credentials': false });
      const run = changes.steps.map((s: any) => s.run ?? '').join('\n').replaceAll('\\', '');
      expect(run).toContain('git diff --name-only HEAD^1 HEAD');
      expect(run).toMatch(/"\$EVENT" != pull_request/);
      for (const p of ['src/', 'test/e2e/', 'test/helpers/', 'test/global-config-home.ts', 'tsconfig.json', 'scripts/tandoor-bootstrap.sh', 'vitest.e2e.config.ts', '.github/workflows/e2e.yml']) {
        expect(run).toContain(p);
      }
    });

    it('tests Tandoor 2.6.0 and latest without failing fast, passing the tag to bootstrap', () => {
      const job = e2e.jobs.e2e;
      expect(job.strategy['fail-fast']).toBe(false);
      expect(job.strategy.matrix.tandoor).toEqual(['2.6.0', 'latest']);
      expect(job.name).toBe('e2e (tandoor ${{ matrix.tandoor }})');
      const steps = job.steps as any[];
      expect(steps[stepIndex(steps, 'Bootstrap Tandoor')].env.TANDOOR_IMAGE_TAG).toBe('${{ matrix.tandoor }}');
    });

    it('runs the matrix only when the changes job reports relevant changes', () => {
      expect(needsIncludes(e2e.jobs.e2e.needs, 'changes')).toBe(true);
      expect(e2e.jobs.e2e.if).toBe("needs.changes.outputs.changed == 'true'");
    });

    it('gives each leg a unique diagnostic artifact name', () => {
      const steps = e2e.jobs.e2e.steps as any[];
      expect(steps[stepIndex(steps, 'Upload diagnostic artifacts on failure')].with.name).toContain('${{ matrix.tandoor }}');
    });

    it('has an always-running e2e-gate job that tolerates a skipped matrix only when nothing changed', () => {
      const gate = e2e.jobs['e2e-gate'];
      expect(gate.if).toBe('always()');
      expect(needsIncludes(gate.needs, 'e2e')).toBe(true);
      expect(needsIncludes(gate.needs, 'changes')).toBe(true);
      const run = gate.steps.map((s: any) => s.run ?? '').join('\n');
      expect(run).toMatch(/success/);
      expect(run).toMatch(/skipped.*CHANGED.*false/);
    });

    it('requests only contents: read and leaves nightly reporting to e2e-nightly.yml', () => {
      expect(e2e.permissions).toEqual({ contents: 'read' });
      expect(Object.keys(e2e.jobs).sort()).toEqual(['changes', 'e2e', 'e2e-gate']);
      for (const job of Object.values(e2e.jobs) as any[]) expect(job.permissions).toBeUndefined();
    });

    it('release grants the called e2e workflow only contents: read', () => {
      expect(release.jobs.e2e.permissions).toEqual({ contents: 'read' });
      expect(release.jobs.e2e.permissions).not.toHaveProperty('issues');
    });
  });

  it('grants write permissions only to the publish job, which tags, publishes, pushes and signs', () => {
    expect(release.permissions).toEqual({ contents: 'read' });
    expect(release.jobs.detect.permissions).toBeUndefined();
    expect(release.jobs.publish.permissions).toEqual({
      contents: 'write',
      'id-token': 'write',
      packages: 'write',
      attestations: 'write',
    });
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

  describe('production-only npm-shrinkwrap.json', () => {
    const STEP = 'Write production-only npm-shrinkwrap.json';
    const RUN = "jq '.packages |= with_entries(select(.value.dev != true))' package-lock.json > npm-shrinkwrap.json";
    const lockPackages = () => JSON.parse(readFileSync(path.join(REPO, 'package-lock.json'), 'utf8')).packages;
    const shrinkwrapPackages = () => {
      const run = release.jobs.publish.steps.find((s: any) => s.name === STEP).run as string;
      const filter = run.match(/^jq '(.+)' package-lock\.json > npm-shrinkwrap\.json$/)![1];
      return JSON.parse(execFileSync('jq', [filter, path.join(REPO, 'package-lock.json')], { encoding: 'utf8' })).packages;
    };

    it('writes it from package-lock.json before npm publish, without npm shrinkwrap', () => {
      const steps = release.jobs.publish.steps as any[];
      expect(steps[stepIndex(steps, STEP)].run).toBe(RUN);
      expect(stepIndex(steps, STEP)).toBeLessThan(stepIndex(steps, 'Publish to npm'));
      expect(steps.filter((s) => typeof s.run === 'string' && /npm shrinkwrap/.test(s.run))).toEqual([]);
    });

    it('is listed in package.json files so npm packs it', () => {
      expect(JSON.parse(readFileSync(path.join(REPO, 'package.json'), 'utf8')).files).toContain('npm-shrinkwrap.json');
    });

    it('keeps the root and every production entry of the lock and drops every dev entry', () => {
      const lock = lockPackages();
      const shrinkwrap = shrinkwrapPackages();
      expect(Object.values(shrinkwrap).filter((p: any) => p.dev === true)).toEqual([]);
      expect(shrinkwrap['']).toEqual(lock['']);
      for (const [key, entry] of Object.entries(lock) as [string, any][]) {
        if (entry.dev !== true) expect(shrinkwrap[key], key).toEqual(entry);
      }
    });
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
    });
  });

  describe('MCP Registry publish', () => {
    let registry: any;
    let steps: any[];
    const named = (name: string) => stepIndex(steps, name);
    const isRegistryStep = (s: any) => typeof s.run === 'string' && /mcp-publisher|fileSha256/.test(s.run);

    beforeAll(() => {
      registry = readWorkflow('registry-publish.yml');
      steps = registry.jobs.publish.steps;
    });

    it('leaves no registry steps in the release publish job', () => {
      expect((release.jobs.publish.steps as any[]).filter(isRegistryStep)).toEqual([]);
    });

    it('release calls registry-publish.yml after publish, only for stable releases tagged in this run', () => {
      const job = release.jobs.registry;
      expect(job.uses).toBe('./.github/workflows/registry-publish.yml');
      expect(needsIncludes(job.needs, 'publish')).toBe(true);
      expect(job.with.version).toBe('${{ needs.detect.outputs.version }}');
      expect(job.if).toMatch(/needs\.publish\.outputs\.skip == 'false'/);
      expect(job.if).toMatch(/needs\.detect\.outputs\.prerelease != 'true'/);
      expect(job.permissions).toEqual({ contents: 'read', 'id-token': 'write' });
      expect(release.jobs.publish.outputs.skip).toBe('${{ steps.tagcheck.outputs.skip }}');
    });

    it('runs when called with a version or dispatched with a required version', () => {
      const triggers = registry.on ?? registry.true;
      expect(Object.keys(triggers).sort()).toEqual(['workflow_call', 'workflow_dispatch']);
      expect(triggers.workflow_call.inputs.version.required).toBe(true);
      expect(triggers.workflow_dispatch.inputs.version.required).toBe(true);
      expect(registry.permissions).toEqual({ contents: 'read', 'id-token': 'write' });
    });

    it('rejects a non-stable version and a missing tag before checking out the tag', () => {
      const validateIdx = named('Validate version and tag');
      const validate = steps[validateIdx].run as string;
      expect(validate).toContain('^[0-9]+\\.[0-9]+\\.[0-9]+$');
      expect(validate).toMatch(/git ls-remote --exit-code --tags .*refs\/tags\/v\$VERSION/);
      const checkoutIdx = steps.findIndex((s) => typeof s.uses === 'string' && s.uses.startsWith('actions/checkout@'));
      expect(steps[checkoutIdx].with.ref).toBe('refs/tags/v${{ inputs.version }}');
      expect(checkoutIdx).toBeGreaterThan(validateIdx);
    });

    it('waits, bounded, for npm to serve the version and for an anonymous GHCR pull to work', () => {
      const npm = steps[named('Wait for npm')].run as string;
      expect(npm).toMatch(/seq 1 20/);
      expect(npm).toMatch(/sleep 30/);
      expect(npm).toContain('npm view "@cliftonz/tandoor-recipes-mcp@$VERSION" version');
      expect(npm).toMatch(/exit 1/);
      const ghcr = steps[named('Wait for GHCR')].run as string;
      expect(ghcr).toMatch(/seq 1 20/);
      expect(ghcr).toMatch(/sleep 30/);
      expect(ghcr).toContain('docker manifest inspect "ghcr.io/cliftonz/tandoor-recipes-mcp:$VERSION"');
      expect(ghcr).not.toMatch(/docker login/);
      expect(ghcr).toMatch(/public.*CONTRIBUTING/);
      expect(ghcr).toMatch(/exit 1/);
    });

    it('writes the sha256 of the downloaded release mcpb into server.json', () => {
      const sha = steps[named('Write mcpb sha256 into server.json')];
      expect(sha.run).toMatch(/gh release download "v\$VERSION" .*tandoor-recipes-mcp\.mcpb/);
      expect(sha.env.GH_TOKEN).toBe('${{ secrets.GITHUB_TOKEN }}');
      expect(sha.run).toMatch(/sha256sum tandoor-recipes-mcp\.mcpb/);
      expect(sha.run).toContain('(.packages[] | select(.registryType == "mcpb")).fileSha256 = $sha');
      expect(named('Write mcpb sha256 into server.json')).toBeGreaterThan(named('Wait for GHCR'));
      expect(named('Wait for GHCR')).toBeGreaterThan(named('Wait for npm'));
    });

    it('installs a pinned mcp-publisher release verified against its Sigstore bundle', () => {
      const install = steps[named('Install mcp-publisher')];
      const cosignIdx = steps.findIndex((s) => typeof s.uses === 'string' && s.uses.startsWith('sigstore/cosign-installer@'));
      expect(steps[cosignIdx].uses).toBe(
        (release.jobs.publish.steps as any[]).find((s) => typeof s.uses === 'string' && s.uses.startsWith('sigstore/cosign-installer@')).uses,
      );
      expect(cosignIdx).toBeLessThan(named('Install mcp-publisher'));
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

    it('logs in with GitHub OIDC after writing the hash, then publishes last', () => {
      const loginIdx = named('Log in to the MCP Registry');
      const publishIdx = named('Publish to the MCP Registry');
      expect(steps[loginIdx].run).toMatch(/mcp-publisher login github-oidc/);
      expect(steps[publishIdx].run).toMatch(/mcp-publisher publish/);
      expect(loginIdx).toBeGreaterThan(named('Write mcpb sha256 into server.json'));
      expect(loginIdx).toBeGreaterThan(named('Install mcp-publisher'));
      expect(publishIdx).toBeGreaterThan(loginIdx);
      expect(publishIdx).toBe(steps.length - 1);
    });
  });
});

describe('workflow token permissions', () => {
  it('codeql grants security-events: write only to the analyze job', () => {
    const codeql = readWorkflow('codeql.yml');
    expect(codeql.permissions).toEqual({ contents: 'read' });
    expect(codeql.jobs.analyze.permissions).toEqual({ 'security-events': 'write', contents: 'read', actions: 'read' });
  });

  it('installs dependencies from the lockfile with npm ci in every workflow', () => {
    const installs = ['ci.yml', 'e2e.yml', 'release.yml', 'bootstrap-smoke.yml'].flatMap((name) =>
      (Object.values(readWorkflow(name).jobs) as any[]).flatMap((job) => job.steps ?? [])
        .filter((s: any) => s.name === 'Install' || s.name === 'Install dependencies')
        .map((s: any) => `${name}: ${s.run}`));
    expect(installs).toEqual([
      'ci.yml: npm ci --no-audit --no-fund',
      'e2e.yml: npm ci --no-audit --no-fund',
      'release.yml: npm ci --no-audit --no-fund',
      'bootstrap-smoke.yml: npm ci --no-audit --no-fund',
    ]);
  });
});

describe('nightly e2e workflow shape', () => {
  let wf: any;
  let report: any;
  let script: string;

  beforeAll(() => {
    wf = readWorkflow('e2e-nightly.yml');
    report = wf.jobs.report;
    script = (report.steps as any[]).map((s) => s.run ?? '').join('\n');
  });

  it('runs nightly and on dispatch', () => {
    const triggers = wf.on ?? wf.true;
    expect(Object.keys(triggers).sort()).toEqual(['schedule', 'workflow_dispatch']);
    expect(triggers.schedule[0].cron).toMatch(/^\d+ \d+ \* \* \*$/);
  });

  it('calls e2e.yml with only contents: read', () => {
    expect(wf.jobs.e2e.uses).toBe('./.github/workflows/e2e.yml');
    expect(wf.jobs.e2e.permissions).toEqual({ contents: 'read' });
    expect(wf.permissions).toEqual({ contents: 'read' });
  });

  it('scopes actions: read and issues: write to the report job', () => {
    expect(needsIncludes(report.needs, 'e2e')).toBe(true);
    expect(report.permissions).toEqual({ actions: 'read', issues: 'write' });
  });

  it('reports nothing when the e2e run was cancelled', () => {
    expect(report.if).toContain('always()');
    expect(report.if).toContain("needs.e2e.result != 'cancelled'");
  });

  it('lists failing matrix legs under their called-workflow names', () => {
    expect(script).toContain('startswith("e2e / e2e (tandoor ")');
  });

  it('says the change check failed instead of listing no failing versions', () => {
    expect(script).toContain('.name == "e2e / changes"');
    expect(script).toMatch(/change check failed/i);
  });

  it('opens or comments on the e2e-nightly issue on failure and closes it on success', () => {
    expect(script).toMatch(/gh issue create --title 'Nightly e2e failing' --label e2e-nightly/);
    expect(script).toMatch(/gh issue comment/);
    expect(script).toMatch(/gh issue close/);
  });
});

describe('docker smoke workflow shape', () => {
  let wf: any;
  let smoke: any;
  let script: string;

  beforeAll(() => {
    wf = readWorkflow('docker-smoke.yml');
    smoke = wf.jobs.smoke;
    script = (smoke.steps as any[]).map((s) => s.run ?? '').join('\n');
  });

  it('runs on pull requests to main and on manual dispatch with read-only contents', () => {
    const triggers = wf.on ?? wf.true;
    expect(triggers.pull_request.branches).toEqual(['main']);
    expect(triggers).toHaveProperty('workflow_dispatch');
    expect(wf.permissions).toEqual({ contents: 'read' });
  });

  it('gates the smoke job on a changes job that diffs the PR merge commit and counts other events as changed', () => {
    expect(wf.jobs.changes.steps[0].with).toEqual({ 'fetch-depth': 2, 'persist-credentials': false });
    const changes = wf.jobs.changes.steps.map((s: any) => s.run ?? '').join('\n').replaceAll('\\', '');
    expect(changes).toContain('git diff --name-only HEAD^1 HEAD');
    expect(changes).toMatch(/"\$EVENT" != pull_request/);
    expect(JSON.stringify(wf.jobs.changes)).not.toContain('base.sha');
    for (const p of ['Dockerfile', '.dockerignore', 'src/', 'package.json', 'package-lock.json', 'tsconfig.json', 'LICENSE', '.github/workflows/docker-smoke.yml']) {
      expect(changes).toContain(p);
    }
    expect(needsIncludes(smoke.needs, 'changes')).toBe(true);
    expect(smoke.if).toMatch(/needs\.changes\.outputs\.changed == 'true'/);
  });

  it('builds linux/amd64 with buildx, loads the image and never pushes', () => {
    const build = (smoke.steps as any[]).find((s) => typeof s.uses === 'string' && s.uses.startsWith('docker/build-push-action@'));
    expect(build.with.platforms).toBe('linux/amd64');
    expect(build.with.load).toBe(true);
    expect(build.with.push).toBe(false);
    expect(build.with.tags).toBe('${{ env.IMAGE }}');
    expect((smoke.steps as any[]).some((s) => typeof s.uses === 'string' && s.uses.startsWith('docker/setup-buildx-action@'))).toBe(true);
  });

  it('proves remote mode is healthy, serves /healthz, runs non-root, stops cleanly and uses oauth', () => {
    expect(script).toMatch(/docker inspect .*Health\.Status/);
    expect(script).toMatch(/healthy/);
    expect(script).toMatch(/curl .*http:\/\/127\.0\.0\.1:.*\/healthz/);
    expect(script).toMatch(/id -u/);
    expect(script).toMatch(/docker stop -t 15/);
    expect(script).not.toMatch(/elapsed/);
    expect(script).toMatch(/auth=oauth/);
  });

  it('proves stdio mode answers an MCP initialize handshake within a bounded time', () => {
    const steps = smoke.steps as any[];
    const run = steps[stepIndex(steps, 'Stdio mode answers MCP initialize')].run as string;
    expect(run).toMatch(/"method":"initialize"/);
    expect(run).toMatch(/\| timeout \d+ docker run -i --rm /);
    expect(run).toMatch(/TANDOOR_MCP_TRANSPORT=stdio/);
    expect(run).toMatch(/TANDOOR_URL=/);
    expect(run).toMatch(/TANDOOR_TOKEN=/);
    expect(run).toContain('"serverInfo"');
    expect(run).toContain('@cliftonz/tandoor-recipes-mcp');
    expect(script).not.toMatch(/docker run -d -i/);
  });

  it('dumps logs on failure and always removes containers', () => {
    const steps = smoke.steps as any[];
    expect(steps.some((s) => s.if === 'failure()' && /docker logs/.test(s.run ?? ''))).toBe(true);
    expect(steps.some((s) => s.if === 'always()' && /docker rm -f/.test(s.run ?? ''))).toBe(true);
  });

  it('exposes one docker-smoke-gate required check that tolerates a skipped smoke job', () => {
    const gate = wf.jobs['docker-smoke-gate'];
    expect(gate.if).toBe('always()');
    expect(needsIncludes(gate.needs, 'smoke')).toBe(true);
    expect(needsIncludes(gate.needs, 'changes')).toBe(true);
    const run = gate.steps.map((s: any) => s.run ?? '').join('\n');
    expect(run).toMatch(/success/);
    expect(run).toMatch(/skipped.*CHANGED.*false/);
  });
});
