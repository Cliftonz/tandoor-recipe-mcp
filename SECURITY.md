# Security Policy

## Supported versions

Only the latest minor release gets security fixes.

| Version | Supported |
| ------- | --------- |
| 3.3.x   | Yes       |
| < 3.3   | No        |

## Reporting a vulnerability

Do not open a public issue for a security problem. Report it privately through a [GitHub private security advisory](https://github.com/Cliftonz/tandoor-recipe-mcp/security/advisories/new).

Include the version, how you run the server (local or remote, and how it is installed), steps to reproduce, and the impact you expect. Do not include real tokens.

The goal is to acknowledge a report within 7 days. This is a goal, not a guarantee.

## Scope

In scope:

- The MCP server code in this repository, in local (stdio) and remote (HTTP) mode
- The remote-mode sign-in server: OAuth flows, consent, token storage and token handling
- Protections on downloads from web addresses, such as the private-network block
- The Claude plugin, the Claude Desktop extension and the Docker image built from this repository

Out of scope:

- Tandoor itself. Report Tandoor problems to the [Tandoor project](https://github.com/TandoorRecipes/recipes).
- Claude, ChatGPT and other MCP clients
- A deployment's own setup, such as its reverse proxy, TLS or host security

## Remote mode threat model

- **The sign-in server is reachable from the internet.** Anyone who can reach the public URL can start the sign-in flow.
- **The Tandoor token is the real credential.** Anyone who completes consent with a valid Tandoor API token gets that token's full Tandoor access through the server. Protect Tandoor tokens as you would a password.
- **The secret key protects stored tokens at rest.** `TANDOOR_MCP_SECRET_KEY` encrypts the Tandoor tokens in `oauth.json`. Back up the key separately from `oauth.json`. Anyone with both can read the stored tokens.
- **Revoking a connection does not revoke the Tandoor token.** It removes the server's grant only. Delete the token in Tandoor as well.
- **Tandoor content is untrusted.** A malicious Tandoor instance, or malicious content stored in one, can return text that tries to instruct the assistant (prompt injection).
