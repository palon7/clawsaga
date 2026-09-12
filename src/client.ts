import { setTimeout as sleep } from 'node:timers/promises';
import { z } from 'zod';
import { agentGameResponseSchema } from './protocol.js';
import { CredentialStore, type Credential } from './credentials.js';
import { CliError } from './errors.js';

const tokensSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string(),
  expires_in: z.number().positive(),
  scope: z.string(),
});
const deviceSchema = z.object({
  device_code: z.string(),
  user_code: z.string(),
  verification_uri: z.url(),
  expires_in: z.number().positive(),
  interval: z.number().positive().default(5),
});
const errorSchema = z.object({ error: z.string() });

export function serverOrigin(input: string) {
  const url = URL.parse(input);
  if (
    !url ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash ||
    (url.protocol !== 'https:' &&
      !(
        url.protocol === 'http:' &&
        ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
      ))
  )
    throw new CliError('INVALID_SERVER');
  return url.origin;
}

export class GameClient {
  constructor(
    readonly origin: string,
    private readonly credentials = new CredentialStore(),
    private readonly request: typeof fetch = fetch,
  ) {}

  private async send(path: string, init: RequestInit) {
    try {
      return await this.request(`${this.origin}${path}`, {
        ...init,
        redirect: 'error',
        signal: AbortSignal.timeout(30_000),
      });
    } catch {
      throw new CliError('NETWORK_ERROR', { outcome: 'unknown' });
    }
  }
  private async oauth(path: string, body: Record<string, string>) {
    const response = await this.send(`/api/auth${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body),
    });
    if (response.status >= 500) throw new CliError('SERVICE_UNAVAILABLE');
    if (response.status === 429)
      throw new CliError('RATE_LIMITED', {
        retry_after: response.headers.get('Retry-After'),
      });
    return response;
  }
  private async decodeTokens(response: Response): Promise<Credential> {
    if (!response.ok) throw new CliError('AUTH_REQUIRED');
    const parsed = tokensSchema.safeParse(
      await response.json().catch(() => null),
    );
    if (!parsed.success) throw new CliError('UPDATE_REQUIRED');
    return {
      ...parsed.data,
      expires_at: Date.now() + parsed.data.expires_in * 1000,
    };
  }
  async login(notify: (value: unknown) => void) {
    const response = await this.oauth('/device/code', {
      client_id: 'clawsaga-cli',
      scope: 'game:read game:play offline_access',
      resource: `${this.origin}/mcp`,
    });
    if (!response.ok) throw new CliError('AUTH_START_FAILED');
    const parsed = deviceSchema.safeParse(
      await response.json().catch(() => null),
    );
    if (!parsed.success) throw new CliError('UPDATE_REQUIRED');
    const device = parsed.data;
    if (new URL(device.verification_uri).origin !== this.origin)
      throw new CliError('INVALID_AUTH_SERVER');
    notify({
      verification_uri: device.verification_uri,
      user_code: device.user_code,
    });
    const deadline = Date.now() + device.expires_in * 1000;
    let interval = device.interval;
    while (Date.now() < deadline) {
      await sleep(interval * 1000);
      const polled = await this.oauth('/oauth2/token', {
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        client_id: 'clawsaga-cli',
        device_code: device.device_code,
      });
      if (polled.ok) {
        const credential = await this.decodeTokens(polled);
        await this.credentials.update((entries) => {
          entries[this.origin] = credential;
        });
        return { ok: true, authenticated: true };
      }
      const failure = errorSchema.safeParse(
        await polled.json().catch(() => null),
      );
      if (failure.success && failure.data.error === 'authorization_pending')
        continue;
      if (failure.success && failure.data.error === 'slow_down') {
        interval += 5;
        continue;
      }
      throw new CliError('AUTH_NOT_COMPLETED', {
        reason: failure.success ? failure.data.error : 'invalid_response',
      });
    }
    throw new CliError('AUTH_NOT_COMPLETED', { reason: 'expired_token' });
  }
  async accessToken() {
    return this.credentials.update(async (entries) => {
      let current = entries[this.origin];
      if (!current) throw new CliError('AUTH_REQUIRED');
      if (current.expires_at <= Date.now() + 30_000) {
        current = await this.decodeTokens(
          await this.oauth('/oauth2/token', {
            grant_type: 'refresh_token',
            client_id: 'clawsaga-cli',
            refresh_token: current.refresh_token,
          }),
        );
        entries[this.origin] = current;
      }
      return current.access_token;
    });
  }
  async invoke(path: string, input: unknown) {
    const token = await this.accessToken();
    const response = await this.send(`/api/v1/${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    });
    if (response.status === 401) throw new CliError('AUTH_REQUIRED');
    if (response.status === 429)
      throw new CliError('RATE_LIMITED', {
        retry_after: response.headers.get('Retry-After'),
      });
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new CliError('UPDATE_REQUIRED', {
        reason: 'invalid_json',
        operation: path,
        http_status: response.status,
      });
    }
    const parsed = agentGameResponseSchema.safeParse(body);
    if (!parsed.success)
      throw new CliError('UPDATE_REQUIRED', {
        reason: 'invalid_response',
        operation: path,
        http_status: response.status,
        fields: [
          ...new Set(parsed.error.issues.map((issue) => issue.path.join('.'))),
        ],
      });
    return parsed.data;
  }
}
