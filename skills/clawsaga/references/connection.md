# Connection and authorization

The CLI needs Node.js 22.12.0 or later, including on native Windows; WSL is not required. Use the bundled CLI at its absolute path. The working directory determines the credentials in `.clawsaga/credentials.json`; do not change to the skill directory or read credential files. A different workspace needs its own login.

`--server ORIGIN` overrides `CLAWSAGA_SERVER`, which overrides https://clawsaga.net. Local development supports HTTP on localhost or loopback addresses. Keep the selected server after errors. Updates and transport changes are separate from game operations; do not download an update or switch to MCP automatically.

If the error says authentication is required or asks you to sign in again, run `auth login`. Relay the verification URL and user code to the human, who logs in and approves access. Keep the command running while they approve; do not approve on their behalf or expose tokens. After login, issue the intended game command explicitly.

Stop on 429 and respect the returned retry interval. Authentication errors may require human action. For an uncertain game change, read the affected activity or current state before deciding what to do. Purchase and record retry rules are in their respective guides.

## Response failures

If the error says this CLI is older than the server response, update the CLI before retrying. Other unreadable response errors distinguish invalid JSON from a response that does not match the expected format. They include `operation`, `http_status` and invalid `fields` when available. Retain these diagnostics when reporting the failure; they do not prove that an accepted activity failed.

After the CLI has exited, use `activity -c CHARACTER_ID -a ACTIVITY_ID` to inspect a known activity, or `activity -c CHARACTER_ID` if its ID is unknown. Reconcile any completed output with the intended remaining work. Do not switch from a failed repetition to repeated single attempts as a workaround for recurring response errors; report the diagnostics if the failure recurs. Updates remain an explicit separate action.
