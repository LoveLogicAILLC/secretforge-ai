export const runtime = "edge";

import { getRequestContext } from "@cloudflare/next-on-pages";

type OAuthConfig = {
  authorize_url: string;
  token_url: string;
  client_id: string;
  client_secret: string;
  scopes?: string[];
  redirect_path?: string;
  token_headers?: Record<string, string>;
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function GET(req: Request): Promise<Response> {
  const ctx = getRequestContext();
  const kv = (ctx.env as any)?.SECRETFORGE_KV as KVNamespace | undefined;
  if (!kv) return json({ error: "KV binding 'SECRETFORGE_KV' not found" }, 500);

  const url = new URL(req.url);
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  if (!state || !code) return json({ error: "Missing 'state' or 'code'" }, 400);

  const stateRaw = await kv.get(`oauth:state:${state}`);
  if (!stateRaw) return json({ error: "Invalid or expired state" }, 400);
  let provider: string;
  try {
    ({ provider } = JSON.parse(stateRaw));
  } catch {
    return json({ error: "Stored state is not valid JSON" }, 500);
  }

  const raw = await kv.get(`oauth:config:${provider}`);
  if (!raw) return json({ error: `No config for '${provider}'` }, 404);
  let cfg: OAuthConfig;
  try {
    cfg = JSON.parse(raw);
  } catch {
    return json({ error: "Stored config is not valid JSON" }, 500);
  }

  const redirectPath = cfg.redirect_path || "/api/oauth/callback";
  const redirectUri = new URL(redirectPath, url.origin).toString();

  const body = new URLSearchParams({
    client_id: cfg.client_id,
    client_secret: cfg.client_secret,
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });

  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };
  for (const [k, v] of Object.entries(cfg.token_headers || {})) headers[k] = v;

  const resp = await fetch(cfg.token_url, { method: "POST", headers, body });
  const text = await resp.text();
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = text;
  }

  await kv.delete(`oauth:state:${state}`);
  return json({ provider, token_response: parsed, status: resp.status });
}
