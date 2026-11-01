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

## Security issues

Do not open a public issue for a security problem. Report it privately through a [GitHub security advisory](https://github.com/Cliftonz/tandoor-recipe-mcp/security/advisories/new) on this repo.
