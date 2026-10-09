/**
 * Structured JSON logs for server code (stdout, collected by Docker/Coolify).
 * Never pass secrets, tokens, passwords, e-mail addresses or document contents as context.
 */
type Level = 'debug' | 'info' | 'warn' | 'error';

const REDACT = /(password|passphrase|token|secret|authorization|apikey|api_key|service_role|email|cookie)/i;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 3 || value === null || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, REDACT.test(k) ? '[redacted]' : redact(v, depth + 1)]));
}

export function log(level: Level, message: string, context: Record<string, unknown> = {}): void {
  if (level === 'debug' && process.env.NODE_ENV === 'production') return;
  const line = JSON.stringify({ timestamp: new Date().toISOString(), level, message, service: 'travelapp-web', ...(redact(context) as object) });
  (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)(line);
}

export function requestId(request: Request): string {
  return request.headers.get('x-request-id') ?? crypto.randomUUID();
}
