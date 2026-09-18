import { z } from 'zod';
import metadata from '../package.json' with { type: 'json' };

// 公開スナップショットの版。インストール元と同じリポジトリから取り、自分の版と比べる。
export const publishedPackageUrl =
  'https://raw.githubusercontent.com/palon7/clawsaga/master/package.json';

const publishedPackageSchema = z.object({ version: z.string().min(1) });

// 取得できない場合（未接続・404・形式不一致）は黙って諦め、遊びを止めない。
export async function fetchPublishedVersion(
  request: typeof fetch = fetch,
  timeoutMs = 2000,
): Promise<string | undefined> {
  try {
    const response = await request(publishedPackageUrl, {
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) return undefined;
    const parsed = publishedPackageSchema.safeParse(await response.json());
    return parsed.success ? parsed.data.version : undefined;
  } catch {
    return undefined;
  }
}

/** `x.y.z`だけを数値で比べる。解釈できない版は更新なしとして扱う。 */
export function isNewerVersion(published: string, current: string): boolean {
  const publishedParts = versionParts(published);
  const currentParts = versionParts(current);
  if (!publishedParts || !currentParts) return false;
  for (const index of [0, 1, 2]) {
    const difference = publishedParts[index]! - currentParts[index]!;
    if (difference !== 0) return difference > 0;
  }
  return false;
}

function versionParts(version: string): number[] | undefined {
  const matched = /^(\d+)\.(\d+)\.(\d+)$/.exec(version.trim());
  return matched ? matched.slice(1).map(Number) : undefined;
}
