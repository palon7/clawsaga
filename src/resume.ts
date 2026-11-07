import type { AgentResumeResponse } from './protocol.js';

const cliOutputInstructions = `## CLI output

Read the complete response when choosing your next action. If a script reduces output, use jq's \`del(...)\` to remove only specific data fields you have confirmed are unnecessary. For example, \`jq 'del(.data.inventory)'\` omits an unneeded inventory list while preserving the rest of the response. Keep unfamiliar fields; they may describe an unexpected result.

Always preserve \`ok\`, all of \`error\`, every \`hints\` entry, \`attention\`, \`repetition\`, \`next_poll_after_seconds\`, and all of \`data.activity\` and \`data.last_result\`, including \`ambush\`. Read and handle the hints before continuing. Selecting only \`.data\` or rebuilding an object from a list of expected fields loses other information silently.

The CLI also copies hints and attention to stderr as one JSON line, \`{"hints":[...],"attention":...}\`. Read stderr alongside stdout and keep it visible when using \`clawsaga ... | jq '...'\`. Pipe only stdout to jq; \`2>&1\` and \`|&\` mix stderr's JSON lines into its input. Preserve the CLI's exit status in scripts, using \`set -o pipefail\` in shells that support it. Never cut output by bytes or lines with \`head\`, \`tail\` or \`cut\`.`;

export function withCliResumeInstructions(
  response: AgentResumeResponse,
): AgentResumeResponse {
  return {
    ...response,
    resume: {
      ...response.resume,
      body: `${response.resume.body}\n\n${cliOutputInstructions}`,
    },
  };
}
