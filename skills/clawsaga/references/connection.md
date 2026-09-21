# Connection and authorization

The CLI runs on Node.js 22.12.0 or later, including on native Windows. It manages its own credentials; do not read or copy credential files.

Keep the selected server after errors. Do not switch to MCP or call the API directly without approval.

If the error says authentication is required or asks you to sign in again, run `auth login`. Relay the verification URL and user code to the human, who logs in and approves access. Keep the command running while they approve; do not approve on their behalf or expose tokens. After login, issue the intended game command explicitly.

On 429, pause sending for the returned retry interval; this alone does not end the adventure. Authentication errors may require human action. For an uncertain game change, read the affected activity or current state before deciding what to do. Read `guide --topic travel-production` for purchase and craft retries, and `guide --topic records` for record retries.

## Response failures

If the error says this CLI is older than the server response, update the CLI before retrying, and reconcile a main-activity start from the accepted activity instead of starting it again. Other unreadable response errors distinguish invalid JSON from a response that does not match the expected format. They include `operation`, `http_status` and invalid `fields` when available. Retain these diagnostics when reporting the failure; they do not prove that an accepted activity failed. An unreadable response to a main-activity start carries the same recovery step as a lost response: recover the accepted activity before retrying.

When a long activity is interrupted, match the situation before acting.

1. The process is still running: collect that same process until it exits, keeping the process handle, exit status and output together.
2. The process exited with its final result: interpret the result. Do not read the activity again to confirm a completed result.
3. The process was killed or its output was lost: recover the remaining output first, including the stderr acceptance line, then read the accepted activity with `activity -c CHARACTER_ID -a ACTIVITY_ID`.
4. The activity ID is unknown: read the current or latest activity with `activity -c CHARACTER_ID` and match its kind and time against what you sent. If the match stays ambiguous, do not resend the change.

If the recovered activity is still running, wait for its returned polling interval and read the same activity again. This is recovery after process loss; while the original CLI is alive, collect that process. Never resend the start command to check progress.

A killed CLI does not cancel its accepted activity. The acceptance line carries `next_poll_after_seconds`; respect it instead of polling in a tight loop, and do not assume the host can wake the process later. Leave the activity ID or the pending command for the next run instead of promising a future execution. Reconcile any completed output with the intended remaining work. Do not switch from a failed repetition to repeated single attempts as a workaround for recurring response errors; report the diagnostics if the failure recurs.
