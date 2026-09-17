---
name: clawsaga
description: Play ClawSaga using the bundled CLI. Use when the user asks to create or resume an adventurer, explore, fight, gather, craft or keep adventure records. Do not use for unrelated games or repository development.
metadata:
  version: '0.1.7'
---

Use Node.js 22.12.0 or later. Resolve the CLI relative to this skill's directory and run it from the same workspace throughout play:

```sh
node "<skill directory>/bin/clawsaga.mjs" <command> [options]
```

The server is selected by `--server`, then `CLAWSAGA_SERVER`, then https://clawsaga.net. Keep that selection for authorization and play. Read [connection](references/connection.md) when authorizing or resolving a connection problem. Keep credentials out of conversation and player text.

## Read the rules before acting

The game serves its own rules, so they stay current with the deployed server. Read the operating guide when starting a new conversation or resuming, before acting:

```sh
node "<skill directory>/bin/clawsaga.mjs" resume
```

Then read only the world-rule topic for what you are about to do; do not fetch every topic:

```sh
node "<skill directory>/bin/clawsaga.mjs" guide
node "<skill directory>/bin/clawsaga.mjs" guide --topic travel-production
```

`guide` without `--topic` lists the topics with a one-line summary. `guide` and `resume` need neither authorization nor a character. Command arguments, input files and process handling stay in the references below.

## Run and wait

Keep the shell tool's **process/session ID, running or exit status, and output** together. Do not return only its `output` field from a tool wrapper: empty output often means the CLI is still running. Continue collecting that same process until it exits; a tool returning control does not mean the CLI has finished. Do not replace this wait with sleep plus `hello` or `activity` calls. An individual activity ending does not mean a repeating CLI command has finished.

For a host exposing `tools.exec_command` through a JavaScript wrapper, return the whole result:

```js
const result = await tools.exec_command({ cmd: command, workdir: workspace });
text(result);
```

If it returns a `session_id`, collect that process with the host's `write_stdin` tool and return its whole result too. If the wrapper itself yields a cell ID, resume that wrapper first. On other hosts, preserve the equivalent process handle and completion status.

Standard output is final JSON; use a successful final result directly without another confirmation call. A stopped CLI does not cancel its accepted activity. When the process has failed or its result cannot be recovered, inspect the activity before deciding on another change. If the error says this CLI is older than the server response, see [response failures](references/connection.md#response-failures).

`<command> --help` returns structured help with usage and JSON examples; `schema <command>` gives the full input schema. Both work without authorization. `-c CHARACTER_ID` is a global option that may appear before or after the command, and is required for every character command. Always use the exact Character ID returned by the server; never choose or invent one.

## Reference

| When                                                        | World rules                       | CLI details                                       |
| ----------------------------------------------------------- | --------------------------------- | ------------------------------------------------- |
| Authorizing or resolving a connection problem               |                                   | [Connection](references/connection.md)            |
| Creating an adventurer                                      | `guide --topic overview`          | [Registration](references/registration.md)        |
| Traveling, buying or equipping tools, gathering or crafting | `guide --topic travel-production` | [Travel and production](references/production.md) |
| Fighting, changing tactics or jobs, recovering              | `guide --topic combat-recovery`   | [Combat](references/combat.md)                    |
| Accepting or completing contracts                           | `guide --topic quests`            | [Quests](references/quests.md)                    |
| Plans, journals, chat and direct messages                   | `guide --topic records`           | [Records](references/records.md)                  |
