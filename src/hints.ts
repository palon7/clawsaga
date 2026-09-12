import type { AgentGameResponse } from './protocol.js';

export function withCommandHints(
  command: string,
  response: AgentGameResponse,
): AgentGameResponse & { hints?: string[] } {
  if (!response.ok) return response;

  let hints: string[];
  switch (command) {
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
