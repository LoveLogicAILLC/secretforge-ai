/**
 * Client for the SecretForge AI backend (Cloudflare Workers).
 *
 * Every method degrades gracefully: the LSP must keep detecting secrets and
 * offering local fixes even when the backend is unreachable.
 */

import { ValidationResult, ProvisionedSecret } from "./types";

const REQUEST_TIMEOUT_MS = 10_000;

export class AgentClient {
  private readonly apiUrl: string;
  private readonly apiKey?: string;

  constructor(apiUrl: string, apiKey?: string) {
    this.apiUrl = apiUrl.replace(/\/+$/, "");
    this.apiKey = apiKey;
  }

  private async request<T>(
    path: string,
    options: { method?: string; body?: unknown } = {}
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (this.apiKey) {
        headers["Authorization"] = `Bearer ${this.apiKey}`;
      }

      const response = await fetch(`${this.apiUrl}${path}`, {
        method: options.method ?? "GET",
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(`${response.status} ${response.statusText} ${detail}`.trim());
      }

      return (await response.json()) as T;
    } catch (error) {
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
