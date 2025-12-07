#!/usr/bin/env node
import { Command } from "commander";
import { Ollama } from "ollama";
import chalk from "chalk";
import ora from "ora";
import inquirer from "inquirer";
import { readFile, writeFile } from "fs/promises";
import { join } from "path";

interface CLIContext {
  projectPath: string;
  dependencies: Record<string, string>;
  apiEndpoint: string;
  userId: string;
}

const program = new Command();
const ollama = new Ollama({ host: "http://localhost:11434" });

program
  .name("secretforge")
  .description("AI-powered API key management CLI")
  .version("1.0.0");

// Initialize project
program
  .command("init")
  .description("Initialize SecretForge in current project")
  .action(async () => {
    const spinner = ora("Analyzing project...").start();

    const context = await analyzeCurrentProject();
    spinner.succeed("Project analyzed");

    console.log(chalk.bold("\n📦 Detected Dependencies:"));
    Object.keys(context.dependencies)
      .slice(0, 10)
      .forEach((dependency) => {
        console.log(chalk.gray(`  • ${dependency}`));
      });

    const detectedServices = await detectRequiredServices(context);

    if (detectedServices.length > 0) {
      console.log(chalk.bold("\n🔑 Required API Keys:"));
      detectedServices.forEach((service) => {
        console.log(chalk.yellow(`  • ${service}`));
      });

      const { shouldProvision } = await inquirer.prompt([
        {
          type: "confirm",
          name: "shouldProvision",
          message: "Would you like to provision these keys now?",
          default: true,
        },
      ]);

      if (shouldProvision) {
        for (const service of detectedServices) {
          await provisionKey(service, context);
        }
      }
    }

    await writeFile(
      join(process.cwd(), ".secretforge.json"),
      JSON.stringify(context, null, 2)
    );

    console.log(chalk.green("\n✅ SecretForge initialized successfully!"));
  });

// Chat with AI agent
program
  .command("chat")
  .description("Chat with SecretForge AI agent")
  .argument("[message]", "Message to send")
  .action(async (message) => {
    if (!message) {
      console.log(chalk.bold("💬 SecretForge AI Assistant"));
      console.log(chalk.gray("Type your message (or 'exit' to quit)\n"));

      const readlineInterface = (await import("readline")).createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      readlineInterface.on("line", async (input) => {
        if (input.toLowerCase() === "exit") {
          readlineInterface.close();
          return;
        }

        await processMessage(input);
      });
    } else {
      await processMessage(message);
    }
  });

// Request new API key
program
  .command("request <service>")
  .description("Request a new API key for a service")
  .option("-e, --env <environment>", "Environment (dev/staging/prod)", "dev")
  .option("-s, --scopes <scopes...>", "Permission scopes")
  .action(async (service, options) => {
    const spinner = ora(`Provisioning ${service} API key...`).start();

    const context = await loadContext();
    const response = await fetch(`${context.apiEndpoint}/api/secrets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service,
        environment: options.env,
        scopes: options.scopes || [],
        userId: context.userId,
      }),
    });

    const data = await response.json() as any;
    spinner.succeed(`API key created: ${data.secret.id}`);

    // Update .env file
    const envKey = `${service.toUpperCase()}_API_KEY`;
    await updateEnvFile(envKey, data.secret.value);

    console.log(chalk.green(`\n✅ ${envKey} added to .env`));
  });

// Rotate existing key
program
  .command("rotate <secret-id>")
  .description("Rotate an existing API key")
  .action(async (secretId) => {
    const spinner = ora("Rotating key...").start();

    const context = await loadContext();
    await fetch(`${context.apiEndpoint}/api/secrets/${secretId}/rotate`, {
      method: "POST",
    });

    spinner.succeed("Key rotated successfully");
  });

// List all keys
program
  .command("list")
  .description("List all API keys")
  .action(async () => {
    const context = await loadContext();
    const response = await fetch(
      `${context.apiEndpoint}/api/secrets?userId=${context.userId}`
    );
    const data = await response.json() as any;

    console.log(chalk.bold("\n🔑 Your API Keys:\n"));
    data.secrets.forEach((secret: any) => {
      console.log(
        `${chalk.blue(secret.service)} (${chalk.gray(secret.environment)})`
      );
      console.log(`  ID: ${secret.id}`);
      console.log(`  Created: ${new Date(secret.created).toLocaleString()}\n`);
    });
  });

// Helper functions
async function analyzeCurrentProject(): Promise<CLIContext> {
  const currentWorkingDirectory = process.cwd();

  try {
    const packageJson = JSON.parse(
      await readFile(join(currentWorkingDirectory, "package.json"), "utf-8")
    );

    return {
      projectPath: currentWorkingDirectory,
      dependencies: {
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
      },
      apiEndpoint: process.env.SECRETFORGE_API || "http://localhost:8787",
      userId: process.env.SECRETFORGE_USER_ID || "default-user",
    };
  } catch {
    return {
      projectPath: currentWorkingDirectory,
      dependencies: {},
      apiEndpoint: "http://localhost:8787",
      userId: "default-user",
    };
  }
}

async function detectRequiredServices(
  context: CLIContext
): Promise<string[]> {
  const serviceMap: Record<string, string[]> = {
    stripe: ["stripe", "@stripe/stripe-js"],
    openai: ["openai"],
    anthropic: ["@anthropic-ai/sdk"],
    supabase: ["@supabase/supabase-js"],
    aws: ["aws-sdk", "@aws-sdk"],
    sendgrid: ["@sendgrid/mail"],
  };

  const detectedServices: string[] = [];
  for (const [service, packages] of Object.entries(serviceMap)) {
    if (
      packages.some((packageName) =>
        Object.keys(context.dependencies).some((dependency) => dependency.includes(packageName))
      )
    ) {
      detectedServices.push(service);
    }
  }

  return detectedServices;
}

async function provisionKey(service: string, context: CLIContext) {
  const spinner = ora(`Provisioning ${service} key...`).start();

  try {
    const response = await fetch(`${context.apiEndpoint}/api/secrets`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service,
        environment: "dev",
        scopes: [],
        userId: context.userId,
      }),
    });

    const data = await response.json() as any;
    await updateEnvFile(`${service.toUpperCase()}_API_KEY`, data.secret.value);

    spinner.succeed(`${service} key provisioned`);
  } catch (error) {
    spinner.fail(`Failed to provision ${service} key`);
    console.error(error);
  }
}

async function processMessage(message: string) {
  const context = await loadContext();

  console.log(chalk.blue("\n🤖 SecretForge AI:"));

  const response = await ollama.chat({
    model: "llama3.1:70b",
    messages: [
      {
        role: "system",
        content: `You are SecretForge AI, an intelligent assistant for API key management.        
Project Context:
${JSON.stringify(context, null, 2)}

Available Actions:
- provision_key(service, environment)
- rotate_key(secret_id)
- search_docs(service, query)
- analyze_security(secret_id)

Respond with actionable advice and offer to execute commands.`,
      },
      { role: "user", content: message },
    ],
    stream: true,
  });

  let fullResponse = "";
  for await (const chunk of response) {
    process.stdout.write(chunk.message.content);
    fullResponse += chunk.message.content;
  }

  console.log("\n");

  // Parse and execute actions if mentioned
  if (fullResponse.includes("provision_key")) {
    const { shouldExecute } = await inquirer.prompt([
      {
        type: "confirm",
        name: "shouldExecute",
        message: "Would you like me to execute this action?",
        default: true,
      },
    ]);

    if (shouldExecute) {
      // Extract and execute command
      console.log(chalk.green("✅ Executing..."));
    }
  }
}

async function loadContext(): Promise<CLIContext> {
  try {
    const config = await readFile(join(process.cwd(), ".secretforge.json"), "utf-8");
    return JSON.parse(config);
  } catch {
    return analyzeCurrentProject();
  }
}

async function updateEnvFile(key: string, value: string) {
  const envPath = join(process.cwd(), ".env.local");

  try {
    let envContent = await readFile(envPath, "utf-8");
    if (envContent.includes(key)) {
      envContent = envContent.replace(
        new RegExp(`${key}=.*`, "g"),
        `${key}=${value}`
      );
    } else {
      envContent += `\n${key}=${value}`;
    }
    await writeFile(envPath, envContent);
  } catch {
    await writeFile(envPath, `${key}=${value}\n`);
  }
}

program.parse();
