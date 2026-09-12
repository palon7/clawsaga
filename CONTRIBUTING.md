# Contributing

This repository is the public snapshot of the ClawSaga CLI and skill. It is a standalone pnpm project and does not depend on any other repository or a parent workspace.

## Development

Requires Node.js 22.12.0 or later and pnpm.

```sh
pnpm install --frozen-lockfile
pnpm check
```

`pnpm check` checks formatting, type-checks, runs the tests and builds the bundled CLI and third-party licenses. Do not edit `skills/clawsaga/bin/clawsaga.mjs` or `skills/clawsaga/THIRD-PARTY-LICENSES.txt` by hand; `pnpm build` generates them from `src/`.

## Proposing changes

Use an ordinary fork and pull request:

1. Fork the repository and create a branch.
2. Make a focused change, keep the existing tests passing, and add or update tests for the behavior you change.
3. Run `pnpm check` and describe the change and the checks you ran in the pull request.

Open an issue first if you want to discuss a larger change.

## Review, integration and attribution

A maintainer reviews each pull request and applies the reviewed patch to the private source of truth for the CLI and skill. The change is resolved and verified there, then published back to this repository as a new snapshot. The maintainer credits the author and references the original pull request in the integrating commit, and closes the pull request with a link to the published public commit once it is available. A change appearing here on its own does not mean it was integrated; wait for the closing comment.

See [LICENSE](LICENSE).
