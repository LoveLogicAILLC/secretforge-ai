import * as fs from "fs";
import * as path from "path";
import { commands, window, workspace, ExtensionContext } from "vscode";
import {
  LanguageClient,
  LanguageClientOptions,
  ServerOptions,
  TransportKind,
} from "vscode-languageclient/node";

let client: LanguageClient | undefined;

export async function activate(context: ExtensionContext): Promise<void> {
  const serverModule = resolveServerModule(context);
  if (!serverModule) {
    window.showErrorMessage(
      "SecretForge AI: language server bundle not found. Run `pnpm --filter @secretforge/lsp-server build`."
    );
    return;
  }

  await startClient(context, serverModule);

  context.subscriptions.push(
    commands.registerCommand("secretforge.restartServer", async () => {
      await stopClient();
      await startClient(context, serverModule);
      window.showInformationMessage("SecretForge AI: language server restarted.");
    }),

    commands.registerCommand("secretforge.askAI", async () => {
      const question = await window.showInputBox({
        prompt: "Ask SecretForge AI about secret management",
        placeHolder: "How should I rotate a leaked Stripe key?",
      });
      if (!question || !client) return;

      await client.sendRequest("workspace/executeCommand", {
        command: "secretforge.askAI",
        arguments: [question],
      });
    }),

    commands.registerCommand("secretforge.scanWorkspace", async () => {
      // Opening each document makes the server scan it and publish diagnostics.
      const files = await workspace.findFiles(
        "**/*.{js,jsx,ts,tsx,py,java,go,rb,php,env}",
        "**/node_modules/**",
        200
      );
      await Promise.all(files.map((file) => workspace.openTextDocument(file)));
      window.showInformationMessage(
        `SecretForge AI: scanned ${files.length} file(s). See the Problems panel.`
      );
    }),

    // The server reads its settings once at initialization, so apply changes
    // by restarting it.
    workspace.onDidChangeConfiguration(async (event) => {
      if (!event.affectsConfiguration("secretforge")) return;
      await stopClient();
      await startClient(context, serverModule);
    })
  );
}

export function deactivate(): Thenable<void> | undefined {
  return stopClient();
}

async function startClient(
  context: ExtensionContext,
  serverModule: string
): Promise<void> {
  const config = workspace.getConfiguration("secretforge");

  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.ipc },
    debug: {
      module: serverModule,
      transport: TransportKind.ipc,
      options: { execArgv: ["--nolazy", "--inspect=6009"] },
    },
  };

  const clientOptions: LanguageClientOptions = {
    documentSelector: [
      { scheme: "file", language: "javascript" },
      { scheme: "file", language: "javascriptreact" },
      { scheme: "file", language: "typescript" },
      { scheme: "file", language: "typescriptreact" },
      { scheme: "file", language: "python" },
      { scheme: "file", language: "java" },
      { scheme: "file", language: "go" },
      { scheme: "file", language: "ruby" },
      { scheme: "file", language: "php" },
      { scheme: "file", language: "yaml" },
      { scheme: "file", language: "json" },
      { scheme: "file", pattern: "**/.env" },
      { scheme: "file", pattern: "**/.env.*" },
    ],
    synchronize: {
      fileEvents: workspace.createFileSystemWatcher("**/.env*"),
    },
    initializationOptions: {
      apiUrl: config.get<string>("apiUrl") || "https://secretforge-ai.workers.dev",
      apiKey: config.get<string>("apiKey") || undefined,
      enableDiagnostics: config.get<boolean>("enableDiagnostics", true),
      enableHover: config.get<boolean>("enableHover", true),
      enableAutocomplete: config.get<boolean>("enableAutocomplete", true),
      enableCodeActions: config.get<boolean>("enableCodeActions", true),
    },
  };

  client = new LanguageClient(
    "secretforgeLanguageServer",
    "SecretForge AI Language Server",
    serverOptions,
    clientOptions
  );

  await client.start();
  context.subscriptions.push(client);
}

async function stopClient(): Promise<void> {
  if (!client) return;
  const running = client;
  client = undefined;
  await running.stop();
}

/**
 * Published builds bundle the server under `server/`; a monorepo checkout
 * resolves it from the sibling lsp-server package instead.
 */
function resolveServerModule(context: ExtensionContext): string | undefined {
  const candidates = [
    context.asAbsolutePath(path.join("server", "server.js")),
    context.asAbsolutePath(path.join("..", "lsp-server", "dist", "server.js")),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate));
}
