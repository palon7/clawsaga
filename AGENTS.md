# Repository guide

- This directory is the standalone public snapshot of the ClawSaga CLI and skill. Keep it buildable, testable and checkable without any private repository, sibling checkout or parent workspace.
- Keep all agent-facing skill instructions and guides in English only. Do not add Japanese translations, locale-specific guide directories, generated translations, or guide language selection. Human-facing Japanese translations live only in the game's web app, tracked against the English source. Web UI and in-game display languages are separate from agent guide language.
- Maintain shared game rules once in `skills/clawsaga/references/gameplay/`. Keep CLI-specific instructions in the other skill references and link to the shared rules.
- Do not edit `skills/clawsaga/bin/clawsaga.mjs` or `skills/clawsaga/THIRD-PARTY-LICENSES.txt` by hand; `pnpm build` generates them.
- Propose changes as ordinary pull requests. See [CONTRIBUTING.md](CONTRIBUTING.md).
