import { setTimeout as sleep } from 'node:timers/promises';
import { z } from 'zod';
import { agentGameResponseSchema } from './protocol.js';
import { CredentialStore, type Credential } from './credentials.js';
import { CliError, cliErrorMessage } from './errors.js';

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
const serverMessageSchema = z.object({
  error: z.object({ message: z.string() }).optional(),
});
const schemaVersionSchema = z.object({ schema_version: z.string() });

// Keep in step with the public agent contract the CLI bundles.
const supportedSchemaVersion = { major: 3, minor: 2 };

function serverMessage(body: unknown): string | undefined {
  const parsed = serverMessageSchema.safeParse(body);
  return parsed.success ? parsed.data.error?.message : undefined;
}

function needsUpdate(body: unknown): boolean {
  const parsed = schemaVersionSchema.safeParse(body);
  if (!parsed.success) return false;
  const [major = 0, minor = 0] = parsed.data.schema_version
    .split('.')
    .map(Number);
  return (
    major > supportedSchemaVersion.major ||
    (major === supportedSchemaVersion.major &&
      minor > supportedSchemaVersion.minor)
  );
}

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
    if (!parsed.success) throw new CliError('INVALID_RESPONSE');
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
    if (!parsed.success) throw new CliError('INVALID_RESPONSE');
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
    let token: string;
    try {
      token = await this.accessToken();
    } catch (error) {
      if (!(error instanceof CliError)) throw error;
      // Without a token the game request is never sent, so a failure here
      // cannot have changed the game. The shared transport marks a lost
      // request as an unknown outcome, which does not apply to this step.
      throw new CliError(error.code, { ...error.detail, outcome: 'not_sent' });
    }
    const response = await this.send(`/api/v1/${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    });
    const body: unknown = await response.json().catch(() => undefined);
    const message = serverMessage(body);
    if (response.status === 401)
      throw new CliError('AUTH_REQUIRED', {
        message: message
          ? `${message} Run auth login and try again.`
          : cliErrorMessage('AUTH_REQUIRED'),
      });
    if (response.status === 429)
      throw new CliError('RATE_LIMITED', {
        retry_after: response.headers.get('Retry-After'),
        ...(message ? { message } : {}),
      });
    if (response.status >= 500)
      throw new CliError('SERVICE_UNAVAILABLE', message ? { message } : {});
    if (body === undefined)
      throw new CliError('INVALID_RESPONSE', {
        message: 'The server returned a response that was not valid JSON.',
        operation: path,
        http_status: response.status,
      });
    const parsed = agentGameResponseSchema.safeParse(body);
    if (!parsed.success) {
      if (needsUpdate(body))
        throw new CliError('UPDATE_REQUIRED', {
          operation: path,
          http_status: response.status,
        });
      throw new CliError('INVALID_RESPONSE', {
        message:
          "The server response did not match this CLI's expected format.",
        operation: path,
        http_status: response.status,
        fields: [
          ...new Set(parsed.error.issues.map((issue) => issue.path.join('.'))),
        ],
      });
    }
    return parsed.data;
  }

  // Public reads stay usable before authorization and are not agent responses.
  async readDocument<Output>(
    path: string,
    schema: z.ZodType<Output>,
  ): Promise<Output> {
    const response = await this.send(`/api/v1/${path}`, { method: 'GET' });
    const body: unknown = await response.json().catch(() => undefined);
    if (response.status === 429)
      throw new CliError('RATE_LIMITED', {
        retry_after: response.headers.get('Retry-After'),
      });
    if (response.status >= 500) throw new CliError('SERVICE_UNAVAILABLE');
    const parsed = schema.safeParse(body);
    if (parsed.success) return parsed.data;
    const message = serverMessage(body);
    if (response.status === 400 && message)
      throw new CliError('INVALID_ARGUMENTS', { message });
    if (body === undefined)
      throw new CliError('INVALID_RESPONSE', {
        message: 'The server returned a response that was not valid JSON.',
        operation: path,
        http_status: response.status,
      });
    throw new CliError('INVALID_RESPONSE', {
      message: "The server response did not match this CLI's expected format.",
      operation: path,
      http_status: response.status,
      fields: [
        ...new Set(parsed.error.issues.map((issue) => issue.path.join('.'))),
      ],
    });
  }
}
