export const runtime = "edge";

import { getRequestContext } from "@cloudflare/next-on-pages";

type OAuthConfig = {
  authorize_url: string;
  token_url: string;
  client_id: string;
  client_secret: string;
  scopes?: string[];
  redirect_path?: string;
  extra_params?: Record<string, string>;
  token_headers?: Record<string, string>;
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function unauthorized(): Response {
  return json({ error: "Unauthorized" }, 401);
}

function getBearer(req: Request): string | null {
  const auth = req.headers.get("authorization") || req.headers.get("Authorization");
  if (!auth) return null;
  const m = auth.match(/^Bearer\s+(.*)$/i);
  return m?.[1] || null;
}

export async function GET(req: Request): Promise<Response> {
  const ctx = getRequestContext();
  const kv = (ctx.env as any)?.SECRETFORGE_KV as KVNamespace | undefined;
  const adminToken = (ctx.env as any)?.ADMIN_TOKEN as string | undefined;
  if (!kv) return json({ error: "KV binding 'SECRETFORGE_KV' not found" }, 500);
  const bearer = getBearer(req);
  if (!adminToken || !bearer || bearer !== adminToken) return unauthorized();

  const url = new URL(req.url);
  const provider = url.searchParams.get("provider");
  if (!provider) return json({ error: "Missing 'provider' query param" }, 400);

  const raw = await kv.get(`oauth:config:${provider}`);
  if (!raw) return json({ error: `No config for '${provider}'` }, 404);
  let cfg: OAuthConfig;
  try {
    cfg = JSON.parse(raw);
  } catch {
    return json({ error: "Stored config is not valid JSON" }, 500);
  }
  return json({ provider, config: cfg });
}

export async function POST(req: Request): Promise<Response> {
  const ctx = getRequestContext();
  const kv = (ctx.env as any)?.SECRETFORGE_KV as KVNamespace | undefined;
  const adminToken = (ctx.env as any)?.ADMIN_TOKEN as string | undefined;
  if (!kv) return json({ error: "KV binding 'SECRETFORGE_KV' not found" }, 500);
  const bearer = getBearer(req);
  if (!adminToken || !bearer || bearer !== adminToken) return unauthorized();

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Body must be valid JSON" }, 400);
  }

  const provider = (body?.provider || "").trim();
  const config = body?.config as OAuthConfig | undefined;
  if (!provider) return json({ error: "Missing 'provider'" }, 400);
  if (!config) return json({ error: "Missing 'config'" }, 400);
  if (!config.authorize_url || !config.token_url || !config.client_id || !config.client_secret) {
    return json({ error: "Config must include authorize_url, token_url, client_id, client_secret" }, 400);
  }

  await kv.put(`oauth:config:${provider}`, JSON.stringify(config));
  return json({ ok: true, provider });
}
