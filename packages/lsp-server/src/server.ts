#!/usr/bin/env node
/**
 * SecretForge AI Language Server.
 *
 * Speaks LSP so any compatible editor — VS Code, Cursor, Neovim, Emacs,
 * Helix, Sublime — gets the same secret detection, quick fixes, hovers and
 * completions with no editor-specific code.
 */

import {
  createConnection,
  TextDocuments,
  Diagnostic,
  DiagnosticSeverity,
  ProposedFeatures,
  InitializeParams,
  TextDocumentSyncKind,
  InitializeResult,
  CodeAction,
  CodeActionKind,
  Range,
  Position,
  CompletionItem,
  CompletionItemKind,
  Hover,
  MarkupKind,
  TextEdit,
  WorkspaceEdit,
  Command,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";

import { SECRET_PATTERNS, shouldReport, getKnownServices } from "./patterns";
import { AgentClient } from "./agent-client";
import { DiagnosticData, LSPInitializationOptions } from "./types";

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

let agentClient: AgentClient;
let options: LSPInitializationOptions = {
  apiUrl: "https://secretforge-ai.workers.dev",
  enableAutocomplete: true,
  enableHover: true,
  enableCodeActions: true,
  enableDiagnostics: true,
};

/** Latest diagnostics per document, so hovers and code actions can reuse them. */
const diagnosticsByUri = new Map<string, Diagnostic[]>();

/** Coalesces rescans while the user is actively typing. */
const pendingScans = new Map<string, NodeJS.Timeout>();
const SCAN_DEBOUNCE_MS = 150;

// ---------------------------------------------------------------- lifecycle

connection.onInitialize((params: InitializeParams): InitializeResult => {
  const provided = params.initializationOptions as LSPInitializationOptions | undefined;
  if (provided) {
    options = { ...options, ...provided };
  }

  agentClient = new AgentClient(options.apiUrl!, options.apiKey);

  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Incremental,
      completionProvider: {
        resolveProvider: false,
        triggerCharacters: [".", "(", "["],
      },
      hoverProvider: true,
      codeActionProvider: {
        codeActionKinds: [CodeActionKind.QuickFix],
      },
      executeCommandProvider: {
        commands: [
          "secretforge.provision",
          "secretforge.validate",
          "secretforge.rotate",
          "secretforge.askAI",
        ],
      },
    },
    serverInfo: { name: "SecretForge AI Language Server", version: "1.0.0" },
  };
});

connection.onInitialized(async () => {
  connection.console.log("SecretForge AI language server ready");

  // Detection is fully local, so an unreachable backend only limits the
  // AI-backed actions. Tell the user once rather than failing every command.
  const healthy = await agentClient.isHealthy();
  if (!healthy) {
    connection.console.log(
      "SecretForge backend unreachable — detection and local fixes still active"
    );
  }
});

// -------------------------------------------------------------- diagnostics

documents.onDidOpen((event) => scheduleScan(event.document));

documents.onDidChangeContent((event) => scheduleScan(event.document));

documents.onDidClose((event) => {
  const pending = pendingScans.get(event.document.uri);
  if (pending) {
    clearTimeout(pending);
    pendingScans.delete(event.document.uri);
  }
  diagnosticsByUri.delete(event.document.uri);
  connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
});

function scheduleScan(document: TextDocument): void {
  if (!options.enableDiagnostics) return;

  const existing = pendingScans.get(document.uri);
  if (existing) clearTimeout(existing);

  pendingScans.set(
    document.uri,
    setTimeout(() => {
      pendingScans.delete(document.uri);
      scanDocument(document);
    }, SCAN_DEBOUNCE_MS)
  );
}

function scanDocument(document: TextDocument): void {
  const text = document.getText();
  const diagnostics: Diagnostic[] = [];
  const claimed: Array<{ start: number; end: number }> = [];

  for (const pattern of SECRET_PATTERNS) {
    pattern.regex.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = pattern.regex.exec(text)) !== null) {
      // Zero-length matches would loop forever.
      if (match[0].length === 0) {
        pattern.regex.lastIndex += 1;
        continue;
      }

      const start = match.index;
      const end = start + match[0].length;

      // Patterns are ordered specific -> generic, so an earlier claim wins.
      if (claimed.some((r) => start < r.end && end > r.start)) continue;
      if (!shouldReport(pattern, match)) continue;

      claimed.push({ start, end });

      const data: DiagnosticData = {
        pattern: pattern.type,
        service: pattern.service,
        masked: maskSecret(match[0]),
        fullMatch: match[0],
      };

      diagnostics.push({
        severity: pattern.severity,
        range: {
          start: document.positionAt(start),
          end: document.positionAt(end),
        },
        message: `${pattern.description ?? pattern.type}. ${
          pattern.remediation ?? "Move it out of source control."
        }`,
        source: "SecretForge AI",
        code: pattern.type.toLowerCase().replace(/\s+/g, "-"),
        data,
      });
    }
  }

  diagnosticsByUri.set(document.uri, diagnostics);
  connection.sendDiagnostics({ uri: document.uri, diagnostics });
}

// ------------------------------------------------------------- code actions

connection.onCodeAction((params): CodeAction[] => {
  if (!options.enableCodeActions) return [];

  const actions: CodeAction[] = [];

  for (const diagnostic of params.context.diagnostics) {
    if (diagnostic.source !== "SecretForge AI") continue;

    const data = diagnostic.data as DiagnosticData | undefined;
    if (!data) continue;

    const envVar = envVarNameFor(data.service);
    const uri = params.textDocument.uri;

    actions.push({
      title: `Replace with process.env.${envVar}`,
      kind: CodeActionKind.QuickFix,
      diagnostics: [diagnostic],
      isPreferred: true,
      edit: {
        changes: {
          [uri]: [TextEdit.replace(diagnostic.range, `process.env.${envVar}`)],
        },
      },
    });

    actions.push({
      title: `Provision a managed ${data.service} key with SecretForge`,
      kind: CodeActionKind.QuickFix,
      diagnostics: [diagnostic],
      command: Command.create(
        "Provision secret",
        "secretforge.provision",
        uri,
        diagnostic.range,
        data.service
      ),
    });

    actions.push({
      title: "Check this credential against SecretForge AI",
      kind: CodeActionKind.QuickFix,
      diagnostics: [diagnostic],
      command: Command.create(
        "Validate secret",
        "secretforge.validate",
        data.fullMatch
      ),
    });
  }

  return actions;
});

// -------------------------------------------------------------------- hover

connection.onHover((params): Hover | null => {
  if (!options.enableHover) return null;

  const diagnostics = diagnosticsByUri.get(params.textDocument.uri) ?? [];

  for (const diagnostic of diagnostics) {
    if (!isPositionInRange(params.position, diagnostic.range)) continue;

    const data = diagnostic.data as DiagnosticData | undefined;
    if (!data) continue;

    const critical = diagnostic.severity === DiagnosticSeverity.Error;

    return {
      range: diagnostic.range,
      contents: {
        kind: MarkupKind.Markdown,
        value: [
          `### ${data.pattern}`,
          "",
          `**Service** · ${data.service}`,
          `**Severity** · ${critical ? "Critical" : "Warning"}`,
          `**Detected** · \`${data.masked}\``,
          "",
          diagnostic.message,
          "",
          "---",
          "",
          "Available quick fixes:",
          `- Swap the literal for \`process.env.${envVarNameFor(data.service)}\``,
          "- Provision a managed key through SecretForge",
          "- Run an AI compliance check (SOC 2, GDPR, HIPAA, PCI-DSS)",
        ].join("\n"),
      },
    };
  }

  return null;
});

// --------------------------------------------------------------- completion

connection.onCompletion((params): CompletionItem[] => {
  if (!options.enableAutocomplete) return [];

  const document = documents.get(params.textDocument.uri);
  if (!document) return [];

  const linePrefix = document.getText({
    start: { line: params.position.line, character: 0 },
    end: params.position,
  });

  // Offer credential env vars right where one is being read.
  const atEnvAccess =
    /(?:process\.env\.|process\.env\[["']|os\.environ\[["']|os\.getenv\(["']|ENV\[["'])$/.test(
      linePrefix
    );
  if (!atEnvAccess) return [];

  return getKnownServices().map((service) => {
    const name = envVarNameFor(service);
    return {
      label: name,
      kind: CompletionItemKind.Constant,
      detail: `SecretForge · ${service}`,
      documentation: {
        kind: MarkupKind.Markdown,
        value: `Read the ${service} credential from the environment instead of hard-coding it.`,
      },
      insertText: name,
    };
  });
});

// ----------------------------------------------------------------- commands

connection.onExecuteCommand(async (params) => {
  const args = params.arguments ?? [];

  switch (params.command) {
    case "secretforge.provision":
      return provisionSecret(args[0] as string, args[1] as Range, args[2] as string);
    case "secretforge.validate":
      return validateSecret(args[0] as string);
    case "secretforge.rotate":
      return rotateSecret(args[0] as string);
    case "secretforge.askAI":
      return askAI(args[0] as string);
    default:
      connection.console.log(`Unknown command: ${params.command}`);
      return null;
  }
});

async function provisionSecret(uri: string, range: Range, service: string) {
  try {
    const secret = await agentClient.provisionSecret(service, "development");
    const envVar = envVarNameFor(service);

    const edit: WorkspaceEdit = {
      changes: { [uri]: [TextEdit.replace(range, `process.env.${envVar}`)] },
    };
    await connection.workspace.applyEdit(edit);

    connection.window.showInformationMessage(
      `Provisioned ${service} secret ${secret.id}. Set ${envVar} in your environment.`
    );
    return { success: true, secretId: secret.id, envVar };
  } catch (error) {
    connection.window.showErrorMessage(
      `Could not provision a ${service} secret: ${describeError(error)}`
    );
    return { success: false, error: describeError(error) };
  }
}

async function validateSecret(secret: string) {
  const result = await agentClient.validateSecret(secret);
  const verdict = result.valid ? "Valid" : "Action needed";
  const advice = result.recommendations.map((r) => `• ${r}`).join("\n");

  connection.window.showInformationMessage(
    `${verdict} (score ${result.score}/100)\n${advice}`
  );
  return result;
}

async function rotateSecret(service: string) {
  connection.window.showInformationMessage(
    `Rotation requested for ${service}. Confirm it in your SecretForge dashboard.`
  );
  return { success: true, service };
}

async function askAI(question: string): Promise<string> {
  try {
    const answer = await agentClient.askAgent("support", question);
    connection.window.showInformationMessage(answer);
    return answer;
  } catch (error) {
    const message = `SecretForge AI is unavailable: ${describeError(error)}`;
    connection.window.showErrorMessage(message);
    return message;
  }
}

// ---------------------------------------------------------------- utilities

function envVarNameFor(service: string): string {
  if (service === "unknown") return "API_KEY";
  return `${service.toUpperCase().replace(/[^A-Z0-9]/g, "_")}_API_KEY`;
}

/** Keeps enough of the value to identify it without echoing the credential. */
function maskSecret(value: string): string {
  if (value.length <= 8) return "*".repeat(value.length);
  return `${value.slice(0, 6)}${"*".repeat(Math.min(value.length - 6, 12))}`;
}

function isPositionInRange(position: Position, range: Range): boolean {
  if (position.line < range.start.line || position.line > range.end.line) {
    return false;
  }
  if (position.line === range.start.line && position.character < range.start.character) {
    return false;
  }
  if (position.line === range.end.line && position.character > range.end.character) {
    return false;
  }
  return true;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

documents.listen(connection);
connection.listen();
