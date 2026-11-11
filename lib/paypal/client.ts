// PayPal REST client (sandbox only). OAuth client-credentials token, cached until shortly before expiry.
//
// Without PAYPAL_CLIENT_ID/SECRET the app runs in "mocked" mode (plan v2, Level 1): every helper in
// lib/paypal returns MOCK- ids and the UI labels those records as mocked.

export class PayPalError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message);
  }
}

export const paypalConfigured = () => Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);

export const isMockId = (id: string | null | undefined) => Boolean(id?.startsWith("MOCK-"));

function baseUrl() {
  // Zero spend and safety: this build never talks to live PayPal.
  if (process.env.PAYPAL_ENV && process.env.PAYPAL_ENV !== "sandbox") {
    throw new Error(`PAYPAL_ENV must be "sandbox" (got "${process.env.PAYPAL_ENV}")`);
  }
  return "https://api-m.sandbox.paypal.com";
}

let cachedToken: { value: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.value;
  const credentials = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString("base64");
  const response = await fetch(`${baseUrl()}/v1/oauth2/token`, {
    method: "POST",
    headers: { authorization: `Basic ${credentials}`, "content-type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
    signal: AbortSignal.timeout(20_000),
  });
  const body = (await response.json()) as { access_token?: string; expires_in?: number; error_description?: string };
  if (!response.ok || !body.access_token) {
    throw new PayPalError(`PayPal OAuth failed: ${body.error_description ?? response.status}`, response.status, body);
  }
  cachedToken = { value: body.access_token, expiresAt: Date.now() + (body.expires_in ?? 300) * 1000 };
  return cachedToken.value;
}

export interface PayPalRequest {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  /** multipart/form-data body (disputes evidence); overrides `body`. */
  form?: FormData;
  headers?: Record<string, string>;
  /** Sets PayPal-Request-Id so a retried call is not executed twice. */
  idempotencyKey?: string;
}

export async function paypalFetch<T = unknown>(path: string, request: PayPalRequest = {}): Promise<T> {
  const headers: Record<string, string> = {
    authorization: `Bearer ${await accessToken()}`,
    ...(request.form ? {} : { "content-type": "application/json" }),
    ...(request.idempotencyKey ? { "PayPal-Request-Id": request.idempotencyKey } : {}),
    ...request.headers,
  };
  const response = await fetch(`${baseUrl()}${path}`, {
    method: request.method ?? (request.body || request.form ? "POST" : "GET"),
    headers,
    body: request.form ?? (request.body === undefined ? undefined : JSON.stringify(request.body)),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  const body = text ? safeJson(text) : null;
  if (!response.ok) {
    const detail = body as { name?: string; message?: string; details?: { issue?: string; description?: string }[]; debug_id?: string } | null;
    const issue = detail?.details?.[0];
    throw new PayPalError(
      `PayPal ${request.method ?? "GET"} ${path.split("?")[0]} failed (${response.status}): ` +
        [detail?.name, issue?.issue, issue?.description ?? detail?.message].filter(Boolean).join(" - ") +
        (detail?.debug_id ? ` [debug_id ${detail.debug_id}]` : ""),
      response.status,
      body,
    );
  }
  return body as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export const mockId = (kind: string) => `MOCK-${kind}-${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
