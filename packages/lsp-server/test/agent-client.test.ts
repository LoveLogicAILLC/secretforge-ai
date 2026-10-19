/**
 * Tests for endpoint validation.
 *
 * The endpoint arrives through LSP `initializationOptions`, so in VS Code it
 * can come from a setting — and a setting can be supplied by the workspace,
 * i.e. by a cloned repository. Because `validateSecret` posts a detected
 * credential to this host, redirecting it is credential exfiltration. These
 * tests pin the rules that stop it.
 */

import { describe, it, expect } from "vitest";

import { AgentClient, assertSafeApiUrl } from "../src/agent-client";

describe("assertSafeApiUrl", () => {
  it("accepts https endpoints", () => {
    expect(assertSafeApiUrl("https://secretforge-ai.workers.dev")).toBe(
      "https://secretforge-ai.workers.dev"
    );
  });

  it("strips trailing slashes so path joining stays correct", () => {
    expect(assertSafeApiUrl("https://api.example.com///")).toBe(
      "https://api.example.com"
    );
  });

  it("keeps a base path", () => {
    expect(assertSafeApiUrl("https://api.example.com/v1/")).toBe(
      "https://api.example.com/v1"
    );
  });

  it.each(["http://localhost:8787", "http://127.0.0.1:8787"])(
    "allows plain http on loopback for local development (%s)",
    (url) => {
      expect(assertSafeApiUrl(url)).toBe(url);
    }
  );

  it("rejects plain http to a remote host", () => {
    expect(() => assertSafeApiUrl("http://evil.example.com")).toThrow(/https/);
  });

  it("rejects a non-http scheme", () => {
    expect(() => assertSafeApiUrl("file:///etc/passwd")).toThrow(/https/);
  });

  it("rejects a malformed URL", () => {
    expect(() => assertSafeApiUrl("not a url")).toThrow(/not a valid URL/);
  });
});

describe("AgentClient with a rejected endpoint", () => {
  const hostile = "http://attacker.example.com";

  it("reports why it is unavailable", () => {
    const client = new AgentClient(hostile);
    expect(client.unavailableReason).toMatch(/https/);
  });

  it("never posts a credential to a rejected endpoint", async () => {
    const client = new AgentClient(hostile);

    // validateSecret swallows failures by design and returns local advice.
    // What matters is that it does so without performing a request.
    const result = await client.validateSecret("sk_live_would_be_exfiltrated");

    expect(result.valid).toBe(false);
    expect(result.score).toBe(0);
    expect(result.recommendations.length).toBeGreaterThan(0);
  });

  it("reports unhealthy rather than reaching out", async () => {
    const client = new AgentClient(hostile);
    expect(await client.isHealthy()).toBe(false);
  });

  it("surfaces the rejection on calls that do not have a fallback", async () => {
    const client = new AgentClient(hostile);
    await expect(client.provisionSecret("stripe")).rejects.toThrow(/https/);
  });

  it("accepts a valid endpoint without complaint", () => {
    const client = new AgentClient("https://secretforge-ai.workers.dev");
    expect(client.unavailableReason).toBeUndefined();
  });
});
