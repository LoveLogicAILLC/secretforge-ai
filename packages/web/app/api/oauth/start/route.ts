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

export async function GET(req: Request): Promise<Response> {
  const ctx = getRequestContext();
  const kv = (ctx.env as any)?.SECRETFORGE_KV as KVNamespace | undefined;
  if (!kv) return json({ error: "KV binding 'SECRETFORGE_KV' not found" }, 500);

  const url = new URL(req.url);
  const provider = url.searchParams.get("provider");
  if (!provider) return json({ error: "Missing 'provider'" }, 400);

  const raw = await kv.get(`oauth:config:${provider}`);
  if (!raw) return json({ error: `No config for '${provider}'` }, 404);
  let cfg: OAuthConfig;
  try {
    cfg = JSON.parse(raw);
  } catch {
    return json({ error: "Stored config is not valid JSON" }, 500);
  }

  const state = crypto.randomUUID();
  const redirectPath = cfg.redirect_path || "/api/oauth/callback";
  const redirectUri = new URL(redirectPath, url.origin).toString();

  await kv.put(
    `oauth:state:${state}`,
    JSON.stringify({ provider, createdAt: Date.now() }),
    { expirationTtl: 600 }
  );

  const params = new URLSearchParams({
    client_id: cfg.client_id,
    redirect_uri: redirectUri,
    response_type: "code",
    state,
  });
  if (cfg.scopes?.length) params.set("scope", cfg.scopes.join(" "));
  if (cfg.extra_params) {
    for (const [k, v] of Object.entries(cfg.extra_params)) params.set(k, v);
  }

  const location = `${cfg.authorize_url}${cfg.authorize_url.includes("?") ? "&" : "?"}${params.toString()}`;
  return new Response(null, { status: 302, headers: { Location: location } });
}
