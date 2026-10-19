/**
 * Client for the SecretForge AI backend (Cloudflare Workers).
 *
 * Every method degrades gracefully: the LSP must keep detecting secrets and
 * offering local fixes even when the backend is unreachable.
 */

import { ValidationResult, ProvisionedSecret } from "./types";

const REQUEST_TIMEOUT_MS = 10_000;

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/**
 * Validates the configured endpoint before anything is sent to it.
 *
 * The endpoint arrives through LSP `initializationOptions`, which any editor
 * can set — in VS Code it comes from a setting, and a setting can be supplied
 * by the workspace, i.e. by a cloned repository. Since `validateSecret` posts
 * a detected credential to this host, an unvalidated endpoint turns opening a
 * hostile repository into credential exfiltration.
 *
 * Plain HTTP is accepted only for loopback, so `wrangler dev` still works.
 */
export function assertSafeApiUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`SecretForge endpoint is not a valid URL: ${raw}`);
  }

  if (url.protocol === "https:") {
    return url.origin + url.pathname.replace(/\/+$/, "");
  }

  if (url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname)) {
    return url.origin + url.pathname.replace(/\/+$/, "");
  }

  throw new Error(
    `SecretForge endpoint must use https (got ${url.protocol}//${url.hostname}); ` +
      "plain http is allowed only for localhost"
  );
}

export class AgentClient {
  private readonly apiUrl: string;
  private readonly apiKey?: string;
  /** Set when the endpoint failed validation; no request is ever attempted. */
  private readonly rejectedReason?: string;

  constructor(apiUrl: string, apiKey?: string) {
    this.apiKey = apiKey;

    try {
      this.apiUrl = assertSafeApiUrl(apiUrl);
    } catch (error) {
      // Detection and the env-var fix are local, so a rejected endpoint
      // disables only the AI-backed calls rather than the whole server.
      this.apiUrl = "";
      this.rejectedReason = error instanceof Error ? error.message : String(error);
    }
  }

  /** Why the endpoint was rejected, if it was. */
  get unavailableReason(): string | undefined {
    return this.rejectedReason;
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.apiKey) {
      headers["Authorization"] = `Bearer ${this.apiKey}`;
    }
    return headers;
  }

  /** Turns a non-2xx response into an Error carrying whatever detail it gave. */
  private static async toError(response: Response): Promise<Error> {
    const detail = await response.text().catch(() => "");
    return new Error(`${response.status} ${response.statusText} ${detail}`.trim());
  }

  private async request<T>(
    path: string,
    options: { method?: string; body?: unknown } = {}
  ): Promise<T> {
    if (this.rejectedReason) {
      throw new Error(this.rejectedReason);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(`${this.apiUrl}${path}`, {
        method: options.method ?? "GET",
        headers: this.buildHeaders(),
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw await AgentClient.toError(response);
      }

      return (await response.json()) as T;
    } catch (error) {
      // An aborted fetch surfaces as AbortError; report it as the timeout it is.
      if (error instanceof Error && error.name === "AbortError") {
        throw new Error("SecretForge API request timed out");
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Ask the backend to assess a detected credential. Falls back to generic
   * local advice when the backend cannot be reached.
   */
  async validateSecret(secret: string): Promise<ValidationResult> {
    try {
      return await this.request<ValidationResult>(
        "/api/verification/validate-secret",
        { method: "POST", body: { secret } }
      );
    } catch {
      return {
        valid: false,
        score: 0,
        recommendations: [
          "Move this credential into an environment variable",
          "Rotate it — assume it is compromised once committed",
          "Purge it from git history before publishing the repository",
        ],
      };
    }
  }

  async provisionSecret(
    service: string,
    environment = "development"
  ): Promise<ProvisionedSecret> {
    const result = await this.request<{ secret: ProvisionedSecret }>("/api/secrets", {
      method: "POST",
      body: { service, environment, userId: "lsp-user" },
    });
    return result.secret;
  }

  async askAgent(agent: string, question: string): Promise<string> {
    const result = await this.request<{ answer?: string; result?: string }>(
      `/api/agent/${agent}`,
      { method: "POST", body: { action: "answer_query", payload: { question } } }
    );
    return result.answer ?? result.result ?? "No response from agent.";
  }

  async isHealthy(): Promise<boolean> {
    try {
      const result = await this.request<{ status: string }>("/health");
      return result.status === "healthy" || result.status === "degraded";
    } catch {
      return false;
    }
  }
}
