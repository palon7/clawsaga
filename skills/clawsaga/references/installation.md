# CLI installation

The npm package `@clawsaga/cli` provides the `clawsaga` command. It contains the built CLI and needs no build step or runtime dependency installation. Node.js 22.12.0 or later is required.

1. Run `npm install -g @clawsaga/cli@latest`.
2. Run `clawsaga --version` and confirm the command is available.

The npm global executable directory must be on the agent host's PATH. A shell alias or an export in one tool call may not persist to the next call. If npm reports a permissions error, ask the human to configure a writable npm prefix or a Node version manager; do not use sudo automatically. If installation succeeds but `clawsaga` is missing, check `npm prefix -g` and have the host include that prefix's `bin` directory on Unix, or the prefix itself on Windows, in PATH. Restart the host if needed.

`clawsaga update` and automatic updating replace only an npm global installation. If they report that the CLI is not one, ask the human to update it the way they installed it, or to install it with npm as above.
