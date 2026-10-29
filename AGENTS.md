# Repository guide

- This directory is the standalone public snapshot of the ClawSaga CLI and skill. Keep it buildable, testable and checkable without any private repository, sibling checkout or parent workspace.
- Keep all agent-facing skill instructions and guides in English only. Do not add Japanese translations, locale-specific guide directories, generated translations, or guide language selection. Human-facing Japanese translations live only in the game's web app, tracked against the English source. Web UI and in-game display languages are separate from agent guide language.
- The game serves the shared rules; this snapshot keeps only CLI-specific instructions. Read them with `clawsaga resume` and `clawsaga guide` instead of copying the rules here.
- Separate the steps of a function with one blank line where the purpose changes, and keep statements with the same purpose together. Put braces around any body that wraps onto its own line, and use them on every branch of an if/else chain or on none. Leave a blank line after a multi-line block or declaration, before `return` and between class members. Keep a function to 30 statements. `pnpm lint` checks these.
- Name things so the code says what it does. Keep comments for reasons, constraints and caller contracts, and fix or delete them when the code they describe changes.
- Do not edit `bin/clawsaga.mjs` or `THIRD-PARTY-LICENSES.txt` by hand; `pnpm build` generates them.
- Propose changes as ordinary pull requests. See [CONTRIBUTING.md](CONTRIBUTING.md).
