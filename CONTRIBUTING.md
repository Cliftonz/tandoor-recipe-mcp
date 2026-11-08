# Contributing

Contributions are welcome. I treat every pull request as a bug report plus a proposed fix. The report tells me what is wrong or missing, and the fix shows one way to solve it.

## How credit works

You get credit when your change lands, whichever way it lands.

- If I merge your PR, you are the author of the commit.
- If I reimplement the change to match the standards below, you are still credited. The commit carries a `Co-authored-by:` trailer with your name, `CHANGELOG.md` thanks you in the release entry, and I close the PR with a comment that links the change that replaced it.

Reimplementation is normal here and is not a rejection.

## Standards for merging a PR unchanged

A PR that meets all of these can merge as-is.

- **Test first.** Write a failing test, then make the smallest change that makes it pass.
- **Test behavior.** Assert what crosses a boundary: the request body sent to Tandoor, or the tool output returned to the client. Do not assert internals, mock private functions, or count calls.
- **No defensive error handling.** Do not add `try`/`catch`, null checks, fallbacks, or retries unless a test specifies that error path.
- **Forward the abort signal.** Pass the request `AbortSignal` to every client call that accepts one.
- **Verify Tandoor behavior.** Check every claim about how the Tandoor API behaves against the Tandoor server source or a real-Tandoor e2e test. To run the e2e suite locally, start a throwaway instance with `eval "$(scripts/tandoor-bootstrap.sh)"`, then run `npm run test:e2e`.
- **CI is green.** CI runs `npm audit --audit-level=high`, `npm run build`, and `npm run test:ci`.
- **Self-documenting code.** Names and structure carry the meaning. Add a comment only for a non-obvious external constraint, such as a Tandoor quirk.
- **No em-dashes.** Not in code, comments, docs, or commit messages.

## Releases

I pick version numbers and write the `CHANGELOG.md` entries. Do not bump the version in your PR.

## Releasing

These steps are for the maintainer. The release workflow (`.github/workflows/release.yml`) runs when a version change in `package.json` lands on `main`. It does the rest automatically, except for the steps below.

- **Make the image public once.** After the first image push, open the GHCR package `ghcr.io/cliftonz/tandoor-recipes-mcp` and set its visibility to public. The MCP Registry publish waits up to 10 minutes for the image to be pullable anonymously, then fails, because the registry must be able to read the image.
- **Update SECURITY.md.** On each minor release, update the supported-versions table in `SECURITY.md`.
- **Bind address in Docker.** Binding a specific address inside the container is not supported. Keep `TANDOOR_MCP_HTTP_HOST=0.0.0.0` and choose the address on the host with port mapping, for example `-p 127.0.0.1:3737:3737`.

### If a release fails after `npm publish`

The workflow pushes the tag before `npm publish`. If a later step fails, rerunning the job does not help: the tag check finds the tag and skips every step after it. The workflow has no `workflow_dispatch` trigger, and you cannot delete the tag and rerun, because npm refuses to publish the same version twice.

Do the remaining steps by hand from the tagged commit (`git checkout vX.Y.Z`). Run only the steps that did not finish, in this order:

1. **Image.** Log in with `docker login ghcr.io`, then run `docker buildx build --platform linux/amd64,linux/arm64 --provenance=mode=max --sbom=true -t ghcr.io/cliftonz/tandoor-recipes-mcp:X.Y.Z -t ghcr.io/cliftonz/tandoor-recipes-mcp:latest --push .`. Leave out the `latest` tag for a prerelease. Note the pushed digest.
2. **Sign.** Run `cosign sign --yes ghcr.io/cliftonz/tandoor-recipes-mcp@<digest>`. A local keyless signature uses your own identity, not the workflow's, so say so in the release notes.
3. **Attest.** The mcpb provenance attestation comes from `actions/attest-build-provenance`, which runs only inside GitHub Actions. You cannot recreate it by hand. Ship the release without it and say so in the release notes.
4. **GitHub release.** Run `npm ci && npm run build`, `node scripts/pack-mcpb.js tandoor-recipes-mcp.mcpb`, `npm sbom --sbom-format cyclonedx --omit dev > tandoor-recipes-mcp.cdx.json` and `sha256sum tandoor-recipes-mcp.cdx.json tandoor-recipes-mcp.mcpb > SHA256SUMS`. Then run `gh release create vX.Y.Z --verify-tag --generate-notes --title vX.Y.Z tandoor-recipes-mcp.mcpb tandoor-recipes-mcp.cdx.json SHA256SUMS`. Add `--prerelease` for a prerelease.
5. **MCP Registry (stable releases only).** Actions > Publish to MCP Registry > Run workflow, version X.Y.Z. The workflow waits for npm and GHCR to serve the version before it publishes.

## Security issues

See [SECURITY.md](SECURITY.md) for how to report a security problem privately.
