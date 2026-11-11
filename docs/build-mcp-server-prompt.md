# Build a production-grade MCP server for {SERVICE}

You are building an MCP server that wraps the {SERVICE} API, from empty repo to published,
listed, and trusted. We already did this once for Tandoor Recipes (307 tools, 1655 tests,
npm + Docker + MCP Registry). It took 113 commits and far too many retrofits. This brief
exists so you take the short path. Reference implementation, read it instead of inventing:
`Cliftonz/tandoor-recipe-mcp` on GitHub.
Copy its structure, workflows, and guard tests; adapt names.

## 1. Rules

1. **Verify backend behavior against the real thing.** Every claim about how {SERVICE}
   behaves is checked against its server source or a live instance. The OpenAPI spec lied
   to us repeatedly; real-backend e2e later found four shipped tools that never worked.
2. **Test first, test behavior.** Failing test, then smallest change. Assert what crosses
   a boundary: the request sent to {SERVICE}, or the tool output returned to the client.
   No mocked internals, no call counts.
3. **Every tool is complete on its first commit:** a title, all four annotation hints
   (readOnly, destructive, idempotent, openWorld), a `.describe()` on every parameter, and
   a description that states what it does, what it returns, side effects, limits, and
   which sibling tool to use instead. We retrofitted these across 307 tools in four
   separate passes. Never again.
4. **stdout belongs to the MCP transport.** All logging goes to stderr. Never log tokens.
5. **Forward the request AbortSignal** to every backend call.
6. **No defensive error handling** without a test for that path. One registration adapter
   converts thrown errors into `isError` results; handlers do not catch.
7. **Security guards are not optional:** SSRF check on any user-supplied URL, path guard
   on any file path, no tool that evaluates arbitrary caller input (our jq tool only reads
   server-stashed handles), Host and Origin checks plus rate limits on any HTTP mode.
8. **Git safety.** Work in git worktrees created from origin/main; never switch branches
   in the main checkout. Never `rm -rf`; use `mv`. A typo'd path once deleted the repo.
9. **You draft, the human submits.** Anything sent to a repo, catalog, or directory the
   human does not own is prepared as a step-by-step handoff, not submitted.
10. **The human owns** version numbers, changelog wording, and every edge case. Surface
    them as specific questions; do not pick defaults.
11. **No em-dashes or en-dashes** anywhere. Add the guard test on day one.

## 2. Tips that would have saved us the most time

- **Walking skeleton first.** One tool, through unit test, stdio protocol test, real
  backend e2e, CI, Docker, and a full release of `0.0.1`. Only then add tools. We debugged
  the release pipeline across eight release candidates of a real version.
- **Three files per domain:** `src/clients/<domain>.ts` (HTTP), `src/handlers/<domain>.ts`
  (pure `(client, args, ctx) => string`), `src/tools/<domain>.ts` (zod shapes and
  registration). One shared `src/lib/register.ts` adapter. Domains then never share
  files, so they build in parallel lanes.
- **Design the tool surface before 1.0.** Do not show every tool at startup. We expose 46
  of 307 by default, grouped in sections set per env var (`off`, `simple`, `full`), with
  `list_tool_groups` and `enable_tool_group` meta tools. Adding this late was a breaking
  3.0 release.
- **Protect the model's context.** Slim responses by default with `format: "full"` as the
  escape hatch. Payloads over about 5KB return a stash handle and schema summary.
- **Write the server `instructions` string**, plus a few resources and prompts for the
  top workflows. Tools alone make the model scan the whole list.
- **One Node and npm major everywhere:** `engines`, CI, Dockerfile, release job. Lockfile
  mismatch between npm majors cost us six CI-fix commits.
- **Kill flakes by construction:** sockets listen on port 0 and read the real port; tests
  of rate limits or TTLs freeze the clock; vitest uses `pool: 'forks'` capped at 2
  workers on CI; tests that spawn the server never use `.concurrent`; pack tests get a
  long setup timeout on Windows.
- **Treat Glama's per-tool critiques as free review.** Fix descriptions until the score
  is high, verifying each claim against the backend source.

## 3. Tooling setup

TypeScript ESM, `@modelcontextprotocol/sdk`, zod, vitest with v8 coverage, oxlint with
`--deny-warnings`, tsc for build. Scripts: `build`, `lint`, `test`, `test:ci` (sets
`CI=1` so snapshots are strict), `test:coverage`, `test:e2e` (separate vitest config,
serial). A `version` script syncs the version into every manifest (plugin, marketplace,
desktop extension, `server.json`) so `npm version` is the only bump.

Structural guard tests, cheap and written early:
- snapshot of tool count, every description, every input schema
- annotations follow a name-prefix rule, with an explicit list of ruled overrides
- every tool maps to exactly one section
- manifests agree on version; `server.json`, `glama.json`, `.mcp.json` have the right shape
- Dockerfile assertions (multi-stage, non-root, no baked secrets, exec-form CMD, healthcheck)
- pack smoke: `npm pack`, install into a temp dir, spawn from a foreign cwd, initialize
- stdio protocol test: spawn the built server against a stub HTTP backend
- shipped skills name only real tools
- no em-dashes in client-visible text or tracked files

## 4. Local testing

- Inner loop: `npm run lint && npm run build && npm run test:ci`.
- Real backend: write `scripts/{service}-bootstrap.sh` first. It boots a disposable
  {SERVICE} with docker compose, uses random per-run credentials, provisions a token, is
  idempotent, prints `export` lines locally and writes `$GITHUB_ENV` with `::add-mask::`
  in CI. Usage: `eval "$(scripts/{service}-bootstrap.sh)" && npm run test:e2e`.
- E2E coverage is accounted, not hoped for: a read sweep calls every `readOnlyHint` tool;
  every write tool is listed as covered by a named file, or as a reviewed skip with a
  reason. A test fails when any tool is unaccounted for.

## 5. CI pipeline

- `ci.yml`: 3 OS by 2 Node versions; `npm ci`, `npm audit --audit-level=high`, lint,
  build, `test:ci`; one leg runs coverage with thresholds that only ratchet up.
- `e2e.yml`: on PRs, dispatch, and `workflow_call`. A `changes` job path-filters, a
  matrix runs the minimum supported and latest {SERVICE} versions, and a final gate job
  is the single required check (green, or skipped because nothing relevant changed).
  Hard timeouts, log dump with the token scrubbed, teardown under `if: always()`.
- `e2e-nightly.yml`: calls e2e; opens, updates, and closes one tracking issue.
- `docker-smoke.yml`: build, `/healthz`, non-root, clean exit on SIGTERM, stdio initialize.
- `bootstrap-smoke.yml` (shellcheck plus weekly drift run), CodeQL, OpenSSF Scorecard,
  Dependabot weekly for npm, docker, and actions. All actions pinned to commit SHAs,
  base image pinned by digest, `permissions: contents: read` by default.
- `release.yml`: one workflow, triggered when the version in `package.json` changes on
  main. Order matters: e2e gate, build, test, pack artifacts, build image, and only then
  tag, `npm publish --provenance` through Trusted Publishing (prereleases to the `next`
  dist-tag), push and cosign-sign the multi-arch GHCR image, attest, create the GitHub
  release with SBOM and checksums. Everything that can fail runs before the tag, because
  npm never accepts the same version twice. Keep it one workflow: the default
  `GITHUB_TOKEN` cannot trigger a second workflow.
- `registry-publish.yml`: separate and manually re-runnable; waits until npm and GHCR
  serve the version, then publishes `server.json` to the MCP Registry.
- One-time human steps: configure the npm Trusted Publisher, make the GHCR package public.

## 6. Marketing and distribution

- README order: logo, one-sentence outcome pitch, badges (npm, downloads, Docker, MCP
  Registry, Glama score, CI, Scorecard, license), nav links, what's new, why this server,
  install per client, example conversations, destructive tools, gotchas.
- Ship from the repo: npm keywords and `mcpName`, `server.json`, `glama.json`, `.mcp.json`,
  `llms-install.md` for agent installs, a Claude plugin with skills, a Claude Desktop
  `.mcpb`, a Codex plugin, the Docker image, a compose example.
- Trust files: LICENSE, SECURITY, PRIVACY, SUPPORT, CONTRIBUTING, CHANGELOG, issue and PR
  templates. Add a "not affiliated" line if you show the upstream logo.
- Human-submitted listings, prepared by you as handoffs: awesome-mcp-servers, Docker MCP
  Catalog, Smithery, ChatGPT directory, Glama claim.

## 7. Workflow

Each phase ends when its exit check passes. Do not start a phase early.

0. **Interrogate.** Ask the human the questions in section 8. Read the {SERVICE} API
   source. Exit: answers recorded, domain list and tool naming scheme approved.
1. **Walking skeleton.** Repo, tooling, bootstrap script, one read tool, all guard tests,
   all workflows, Dockerfile. Exit: `0.0.1` published end to end from CI.
2. **Shared core.** Registration adapter, slim and full formats, stash, sections and meta
   tools, security guards, instructions. Exit: guard tests green with the core in place.
3. **Tools by domain, in parallel lanes.** One lane per domain, three files each, unit
   tests plus an e2e coverage entry per tool. Exit: coverage test accounts for every tool
   on both backend versions.
4. **Workflows layer.** Resources, prompts, skills. Exit: skills test green; the top
   three user workflows each run in one prompt against the live backend.
5. **Hardening.** HTTP or remote mode if in scope, security review, cross-OS CI green.
6. **Launch.** Human picks the version; release; listings handoffs; README final pass.
7. **Quality loop.** Glama critiques, nightly e2e issues, Dependabot.

## 8. Ask the human before writing code

- Which service, where is its API source, and what is the minimum supported version?
- Package name, npm scope, GitHub namespace, license?
- Transports: stdio only, or also HTTP and a remote mode with OAuth sign-in?
- Which tool sections are on by default, and what is the policy for destructive tools
  (preview siblings, confirmations, hidden by default)?
- Which listings are in scope for launch?
