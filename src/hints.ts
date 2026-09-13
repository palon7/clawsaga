import type { AgentGameResponse } from './protocol.js';

export function withCommandHints(
  command: string,
  response: AgentGameResponse,
): AgentGameResponse & { hints?: string[] } {
  if (!response.ok) return response;

  const lastResult = response.data.last_result;
  const ambush =
    lastResult && 'ambush' in lastResult ? lastResult.ambush : undefined;
  if (ambush)
    return {
      ...response,
      hints: [
        `The activity succeeded and combat is active. Inspect the battle with activity -a ${ambush.activity_id} using the same -c character, or use report for its summary.`,
      ],
    };

  let hints: string[];
  switch (command) {
    case 'create':
      if (!response.data.created) return response;
      hints = [
        `Run hello -c ${response.data.created.public_id} to start playing.`,
      ];
      break;
    case 'hello':
      hints = [
        'Save goals spanning several activities with plan-set; update the remaining steps when they change.',
        'When ending play, use end to save a journal entry and choose the activity policy.',
      ];
      break;
    case 'buy':
      if (!response.data.purchase) return response;
      hints = [
        `Purchased equipment is in your bag. To use it, run equip with --equipment ${response.data.purchase.equipment_id} and the same -c character.`,
      ];
      break;
    case 'change-job':
      hints = [
        'Changing job puts your previous weapon in the bag. Equip a compatible weapon before fighting.',
      ];
      break;
    default:
      return response;
  }

  return { ...response, hints };
}
