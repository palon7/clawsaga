# Contributing

This repository is the public snapshot of the ClawSaga CLI and skill. It is a standalone pnpm project and does not depend on any other repository or a parent workspace.

## Development

Requires Node.js 22.12.0 or later and pnpm.

```sh
pnpm install --frozen-lockfile
pnpm check
```

`pnpm check` checks formatting, type-checks, runs the tests and builds the bundled CLI and third-party licenses. It also packs the npm package, installs it offline into a temporary prefix and checks the `clawsaga` command from outside the source directory. This packaging check uses a Unix shell environment. Do not edit `bin/clawsaga.mjs` or `THIRD-PARTY-LICENSES.txt` by hand; `pnpm build` generates them from `src/`.

## Proposing changes

Use an ordinary fork and pull request:

1. Fork the repository and create a branch.
2. Make a focused change, keep the existing tests passing, and add or update tests for the behavior you change.
3. Run `pnpm check` and describe the change and the checks you ran in the pull request.

Open an issue first if you want to discuss a larger change.

## npm publication

The `Publish npm` workflow publishes `@clawsaga/cli` under the `next` tag when a non-prerelease GitHub Release is published. It checks out that release's tag, confirms that the tag matches the package version, and publishes the committed build through npm Trusted Publishing without rebuilding it. The game deployment waits until that exact version can be downloaded and executed.

After deployment approval, the game workflow changes `latest` to that existing version through OIDC without publishing it again. It checks the artifact from `latest` and then deploys the server and web app. There is still a window between promotion and deployment completion when a manually updated CLI may reject the old server's responses.

Review failures in this repository's Actions. Rerun a failed publish only if the version has not been submitted successfully; do not republish an already published or pending version or delete it to retry. If publication succeeded and scanning is still pending, wait for availability and rerun the game workflow's failed job.

One-time setup for a maintainer with publishing rights in the `clawsaga` npm organization:

1. Wait for the first npm-ready CLI release to be exported here. Check out its `vVERSION` tag in this public repository. Do not publish from the private game repository or an unreleased working tree.
2. Use the Node version in `.node-version`, run `pnpm install --frozen-lockfile` and `pnpm check`, then confirm `git diff --exit-code -- bin THIRD-PARTY-LICENSES.txt skills/clawsaga`.
3. Run `npm login` and `npm publish --access public --tag next`, completing npm's authentication prompt. This bootstraps the package; the first automatic workflow cannot authenticate until the next step is complete.
4. In the npm package's settings, add a GitHub Actions Trusted Publisher: owner `palon7`, repository `clawsaga`, workflow `publish-npm.yaml`, no environment name. Allow direct `npm publish`. Separately, configure the game's deployment workflow as a Trusted Publisher with dist-tag permission; this repository's workflow only publishes to `next`.
5. Subsequent GitHub Releases publish automatically. No `NPM_TOKEN` secret is required. Trusted Publishing requires npm 11.5.1+ and Node 22.14.0+; the workflow uses the newer Node version from `.node-version`. The CLI itself still supports Node 22.12.0+.

The npm archive includes only the built CLI, changelog, README, package metadata and licenses. The skill is distributed separately from `skills/clawsaga/` and contains no executable or runtime libraries. Runtime libraries are bundled in the CLI, so they remain development dependencies. To inspect an archive without publishing, run `npm pack --dry-run`.

## Review, integration and attribution

A maintainer reviews each pull request and applies the reviewed patch to the private source of truth for the CLI and skill. The change is resolved and verified there, then published back to this repository as a new snapshot. The maintainer credits the author and references the original pull request in the integrating commit, and closes the pull request with a link to the published public commit once it is available. A change appearing here on its own does not mean it was integrated; wait for the closing comment.

See [LICENSE](LICENSE).
