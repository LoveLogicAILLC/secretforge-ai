/**
 * Integration test: drives the built language server over stdio exactly as an
 * editor would, and asserts on the diagnostics it publishes.
 *
 * Requires `pnpm build` first — it runs against dist/server.js.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { buildFixture } from "./fixture";

const SERVER = path.join(__dirname, "..", "dist", "server.js");

// The server reads document text from didOpen, never from disk, so the fixture
// stays in memory under a virtual URI. Nothing credential-shaped is written to
// the working tree or committed.
const FIXTURE = buildFixture();
const FIXTURE_URI = "file:///virtual/secretforge/sample.ts";

/** Points at a closed port so the test never depends on a live backend. */
const OFFLINE_API = "http://127.0.0.1:9";

const SEVERITY_ERROR = 1;
const SEVERITY_WARNING = 2;

interface Diagnostic {
  severity: number;
  range: { start: { line: number; character: number } };
  message: string;
  data: { pattern: string; service: string; masked: string; fullMatch: string };
}

class LspHarness {
  private proc: ChildProcessWithoutNullStreams;
  private buffer = Buffer.alloc(0);
  private messages: any[] = [];

  constructor() {
    this.proc = spawn("node", [SERVER, "--stdio"], {
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.proc.stdout.on("data", (chunk) => this.consume(chunk));
  }

  private consume(chunk: Buffer): void {
    this.buffer = Buffer.concat([this.buffer, chunk]);
    for (;;) {
      const headerEnd = this.buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) return;

      const match = /Content-Length: (\d+)/i.exec(
        this.buffer.subarray(0, headerEnd).toString()
      );
      if (!match) return;

      const length = Number(match[1]);
      const start = headerEnd + 4;
      if (this.buffer.length < start + length) return;

      const body = this.buffer.subarray(start, start + length).toString();
      this.buffer = this.buffer.subarray(start + length);
      this.messages.push(JSON.parse(body));
    }
  }

  send(message: Record<string, unknown>): void {
    const body = JSON.stringify({ jsonrpc: "2.0", ...message });
    this.proc.stdin.write(
      `Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`
    );
  }

  /** Polls until `predicate` matches a received message, or the timeout hits. */
  async waitFor<T = any>(
    predicate: (message: any) => boolean,
    timeoutMs = 5000
  ): Promise<T> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const found = this.messages.find(predicate);
      if (found) return found;
      if (Date.now() > deadline) {
        throw new Error("Timed out waiting for LSP message");
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  }

  dispose(): void {
    this.proc.kill();
  }
}

describe("SecretForge language server", () => {
  let lsp: LspHarness;
  let diagnostics: Diagnostic[];
  let fixtureUri: string;

  beforeAll(async () => {
    if (!fs.existsSync(SERVER)) {
      throw new Error(`Build the server first — ${SERVER} not found`);
    }

    lsp = new LspHarness();
    fixtureUri = FIXTURE_URI;

    lsp.send({
      id: 1,
      method: "initialize",
      params: {
        processId: process.pid,
        rootUri: null,
        capabilities: {},
        initializationOptions: { apiUrl: OFFLINE_API },
      },
    });
    await lsp.waitFor((m) => m.id === 1);

    lsp.send({ method: "initialized", params: {} });
    lsp.send({
      method: "textDocument/didOpen",
      params: {
        textDocument: {
          uri: fixtureUri,
          languageId: "typescript",
          version: 1,
          text: FIXTURE.text,
        },
      },
    });

    const published = await lsp.waitFor(
      (m) => m.method === "textDocument/publishDiagnostics"
    );
    diagnostics = published.params.diagnostics;
  }, 20000);

  afterAll(() => lsp?.dispose());

  it("advertises the capabilities editors rely on", async () => {
    const init = await lsp.waitFor((m) => m.id === 1);
    const caps = init.result.capabilities;

    expect(caps.hoverProvider).toBe(true);
    expect(caps.codeActionProvider).toBeTruthy();
    expect(caps.completionProvider).toBeTruthy();
    expect(caps.executeCommandProvider.commands).toContain("secretforge.provision");
  });

  it.each([
    ["AWS Access Key", "aws"],
    ["Stripe Live Secret Key", "stripe"],
    ["OpenAI API Key", "openai"],
    ["Anthropic API Key", "anthropic"],
    ["GitHub Personal Access Token", "github"],
    ["Google API Key", "google"],
    ["Slack Token", "slack"],
    ["SendGrid API Key", "sendgrid"],
  ])("flags %s as an error", (pattern, service) => {
    const hit = diagnostics.find((d) => d.data.pattern === pattern);
    expect(hit, `expected a ${pattern} diagnostic`).toBeDefined();
    expect(hit!.severity).toBe(SEVERITY_ERROR);
    expect(hit!.data.service).toBe(service);
  });

  it("flags lower-risk credentials as warnings", () => {
    const testKey = diagnostics.find((d) => d.data.pattern === "Stripe Test Key");
    const generic = diagnostics.find((d) => d.data.pattern === "Generic API Key");

    expect(testKey?.severity).toBe(SEVERITY_WARNING);
    expect(generic?.severity).toBe(SEVERITY_WARNING);
  });

  it("ignores placeholders, documentation keys, and low-entropy literals", () => {
    const flagged = diagnostics.map((d) => d.data.fullMatch);

    // Obvious scaffolding.
    expect(flagged.some((v) => v.includes("your-api-key-here"))).toBe(false);
    // AWS ships this key in its own docs; the AWS pattern matches it, so this
    // asserts the placeholder filter runs after the regex.
    expect(flagged).not.toContain("AKIAIOSFODNN7EXAMPLE");
    // Repeated characters fall under the entropy threshold.
    expect(flagged.some((v) => v.includes("aaaaaaaa"))).toBe(false);
  });

  it("reports each credential once, preferring the most specific pattern", () => {
    const anthropic = diagnostics.filter((d) =>
      d.data.fullMatch.startsWith("sk-ant-")
    );

    expect(anthropic).toHaveLength(1);
    expect(anthropic[0].data.pattern).toBe("Anthropic API Key");
  });

  it("never echoes a full credential in the masked field", () => {
    for (const diagnostic of diagnostics) {
      expect(diagnostic.data.masked).not.toBe(diagnostic.data.fullMatch);
      expect(diagnostic.data.masked).toContain("*");
    }
  });

  it("offers a local env-var fix plus SecretForge actions", async () => {
    const awsDiagnostic = diagnostics.find((d) => d.data.service === "aws")!;

    lsp.send({
      id: 2,
      method: "textDocument/codeAction",
      params: {
        textDocument: { uri: fixtureUri },
        range: awsDiagnostic.range,
        context: { diagnostics: [awsDiagnostic] },
      },
    });

    const response = await lsp.waitFor((m) => m.id === 2);
    const titles = response.result.map((a: { title: string }) => a.title);

    expect(titles).toContain("Replace with process.env.AWS_API_KEY");
    expect(titles.some((t: string) => t.includes("Provision"))).toBe(true);

    const preferred = response.result.find(
      (a: { isPreferred?: boolean }) => a.isPreferred
    );
    expect(preferred.edit.changes[fixtureUri][0].newText).toBe(
      "process.env.AWS_API_KEY"
    );
  });

  it("explains the finding on hover", async () => {
    const awsDiagnostic = diagnostics.find((d) => d.data.service === "aws")!;

    lsp.send({
      id: 3,
      method: "textDocument/hover",
      params: {
        textDocument: { uri: fixtureUri },
        position: awsDiagnostic.range.start,
      },
    });

    const response = await lsp.waitFor((m) => m.id === 3);
    const value = response.result.contents.value;

    expect(value).toContain("AWS Access Key");
    expect(value).toContain("Critical");
    expect(value).not.toContain(awsDiagnostic.data.fullMatch);
  });

  it("completes credential env vars after process.env.", async () => {
    const lines = FIXTURE.text.split("\n");
    const line = lines.findIndex((l) => l.includes("process.env.STRIPE"));

    lsp.send({
      id: 4,
      method: "textDocument/completion",
      params: {
        textDocument: { uri: fixtureUri },
        position: {
          line,
          character: lines[line].indexOf("process.env.") + "process.env.".length,
        },
      },
    });

    const response = await lsp.waitFor((m) => m.id === 4);
    const labels = (response.result.items ?? response.result).map(
      (i: { label: string }) => i.label
    );

    expect(labels).toContain("STRIPE_API_KEY");
    expect(labels).toContain("AWS_API_KEY");
  });
});
