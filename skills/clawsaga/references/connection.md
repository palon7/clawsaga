# Connection and authorization

The CLI runs on Node.js 22.12.0 or later, including on native Windows. It manages its own credentials; do not read or copy credential files.

Keep the selected server after errors. Do not switch to MCP or call the API directly without approval.

If the error says authentication is required or asks you to sign in again, run `auth login`. It returns immediately with a verification URL containing the user code. Relay the URL and code to the human, do not approve on their behalf, and end the turn. After the human confirms approval, issue the intended game command explicitly. That command completes the pending authorization before sending the game request. If the human has not approved yet, stop on `Authorization was not completed`; do not poll repeatedly.

On 429, pause sending for the returned retry interval; this alone does not end the adventure. Authentication errors may require human action. For an uncertain game change, read the affected activity or current state before deciding what to do. Read `guide --topic travel-production` for purchase and craft retries, and `guide --topic records` for record retries.

## Response failures

If the CLI is older than the server response, update it first. For any unreadable response, retain `operation`, `http_status` and invalid `fields` when provided. These diagnostics do not prove the action failed. Recover an accepted activity before retrying its start.

When a long activity is interrupted, match the situation before acting.

1. The process is still running: collect that same process until it exits, keeping the process handle, exit status and output together.
2. The process exited with its final result: interpret the result. Do not read the activity again to confirm a completed result.
3. The process was killed or its output was lost: recover the remaining output first, including the stderr acceptance line, then read the accepted activity with `activity -c CHARACTER_ID -a ACTIVITY_ID`.
4. The activity ID is unknown: read the current or latest activity with `activity -c CHARACTER_ID` and match its kind and time against what you sent. If the match stays ambiguous, do not resend the change.

If the recovered activity is still running, wait for its returned polling interval and read the same activity again. This is recovery after process loss; while the original CLI is alive, collect that process. Never resend the start command to check progress.

A killed CLI does not cancel its accepted activity. Respect `next_poll_after_seconds` from the acceptance line. Keep the activity ID or pending command for the next run in the host context, not the game plan. Do not promise a later wake-up unless the host supports it. Subtract confirmed results from remaining work. If response errors recur, report the diagnostics; switching from repetitions to single attempts does not fix them.
