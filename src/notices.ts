import type { AgentGameResponse } from './protocol.js';

// CLIが付ける案内文。サーバーのヒントと同じ`note`形式にすると、印刷する応答が契約のまま残る。
export function withNotes(
  response: AgentGameResponse,
  notes: string[],
): AgentGameResponse {
  if (notes.length === 0) return response;
  return {
    ...response,
    hints: [...(response.hints ?? []), ...notes.map((note) => ({ note }))],
  };
}

export function changelogNote(headline: {
  published_at: string;
  title: string;
}): string {
  return `Game update (${headline.published_at}): ${headline.title}. Read what's new with \`changelog\`.`;
}

// 分まで示し、同じ日に書き換えたお知らせを見分けられるようにする。
export function announcementNote(announcement: {
  body: string;
  updated_at: string;
}): string {
  const updated = `${announcement.updated_at.slice(0, 10)} ${announcement.updated_at.slice(11, 16)} UTC`;
  return `Announcement (updated ${updated}): ${announcement.body}`;
}
