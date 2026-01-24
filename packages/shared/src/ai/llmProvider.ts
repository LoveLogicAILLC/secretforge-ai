/**
 * Enhanced LLM Integration
 * Supports OpenAI GPT-4o and Ollama (Llama 3.1) with automatic fallback
 */

export interface LLMConfig {
  provider: "openai" | "ollama" | "auto";
  openaiApiKey?: string;
  ollamaBaseUrl?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMResponse {
  content: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model: string;
  provider: string;
}

export interface StreamChunk {
  content: string;
  done: boolean;
}

/**
 * Universal LLM Provider
 * Abstracts OpenAI and Ollama APIs
 */
export class LLMProvider {
  private config: Required<LLMConfig>;

  constructor(config: LLMConfig) {
    this.config = {
      provider: config.provider || "auto",
      openaiApiKey: config.openaiApiKey || "",
      ollamaBaseUrl: config.ollamaBaseUrl || "http://localhost:11434",
      model: config.model || this.getDefaultModel(config.provider),
      temperature: config.temperature ?? 0.7,
      maxTokens: config.maxTokens ?? 2000,
    };
  }

  private getDefaultModel(provider: string): string {
    switch (provider) {
      case "openai":
        return "gpt-4o";
      case "ollama":
        return "llama3.1:70b";
      default:
        return "gpt-4o";
    }
  }

  /**
   * Generate completion (non-streaming)
   */
  async complete(messages: LLMMessage[]): Promise<LLMResponse> {
    const provider = await this.selectProvider();

    try {
      if (provider === "openai") {
        return await this.completeOpenAI(messages);
      } else {
        return await this.completeOllama(messages);
      }
    } catch (error) {
      // Fallback to other provider
      if (this.config.provider === "auto") {
        const fallbackProvider = provider === "openai" ? "ollama" : "openai";
        console.warn(`${provider} failed, falling back to ${fallbackProvider}`);

        if (fallbackProvider === "openai") {
          return await this.completeOpenAI(messages);
        } else {
          return await this.completeOllama(messages);
        }
      }

      throw error;
    }
  }

  /**
   * Generate streaming completion
   */
  async *stream(messages: LLMMessage[]): AsyncGenerator<StreamChunk> {
    const provider = await this.selectProvider();

    if (provider === "openai") {
      yield* this.streamOpenAI(messages);
    } else {
      yield* this.streamOllama(messages);
    }
  }

  /**
   * Select which provider to use
   */
  private async selectProvider(): Promise<"openai" | "ollama"> {
    if (this.config.provider !== "auto") {
      return this.config.provider;
    }

    // Check if Ollama is available
    try {
      const response = await fetch(`${this.config.ollamaBaseUrl}/api/tags`, {
        method: "GET",
        signal: AbortSignal.timeout(2000), // 2 second timeout
      });

      if (response.ok) {
        return "ollama"; // Prefer local Ollama for privacy and cost
      }
    } catch {
      // Ollama not available
    }

    // Fallback to OpenAI
    if (this.config.openaiApiKey) {
      return "openai";
    }

    throw new Error("No LLM provider available. Configure OpenAI API key or run Ollama locally.");
  }

  /**
   * OpenAI completion (non-streaming)
   */
  private async completeOpenAI(messages: LLMMessage[]): Promise<LLMResponse> {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.openaiApiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${error}`);
    }

    const data = await response.json() as any;

    return {
      content: data.choices[0].message.content,
      usage: {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      },
      model: data.model,
      provider: "openai",
    };
  }

  /**
   * Ollama completion (non-streaming)
   */
  private async completeOllama(messages: LLMMessage[]): Promise<LLMResponse> {
    const response = await fetch(`${this.config.ollamaBaseUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        stream: false,
        options: {
          temperature: this.config.temperature,
          num_predict: this.config.maxTokens,
        },
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Ollama API error: ${error}`);
    }

    const data = await response.json() as any;

    return {
      content: data.message.content,
      usage: {
        promptTokens: data.prompt_eval_count || 0,
        completionTokens: data.eval_count || 0,
        totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
      },
      model: data.model,
      provider: "ollama",
    };
  }

  /**
   * OpenAI streaming completion
   */
  private async *streamOpenAI(messages: LLMMessage[]): AsyncGenerator<StreamChunk> {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.openaiApiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens,
        stream: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (line.startsWith("data: ")) {
          const data = line.slice(6);
          if (data === "[DONE]") {
            yield { content: "", done: true };
            return;
          }

          try {
            const parsed = JSON.parse(data) as any;
            const content = parsed.choices[0]?.delta?.content || "";
            if (content) {
              yield { content, done: false };
            }
          } catch {
            // Ignore parse errors
          }
        }
      }
    }
  }

  /**
   * Ollama streaming completion
   */
  private async *streamOllama(messages: LLMMessage[]): AsyncGenerator<StreamChunk> {
    const response = await fetch(`${this.config.ollamaBaseUrl}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.config.model,
        messages,
        stream: true,
        options: {
          temperature: this.config.temperature,
          num_predict: this.config.maxTokens,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.statusText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");

    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const text = decoder.decode(value, { stream: true });
      const lines = text.split("\n").filter((line) => line.trim());

      for (const line of lines) {
        try {
          const parsed = JSON.parse(line) as any;
          const content = parsed.message?.content || "";

          if (content) {
            yield { content, done: parsed.done || false };
          }

          if (parsed.done) {
            return;
          }
        } catch {
          // Ignore parse errors
        }
      }
    }
  }
}

/**
 * Natural Language Command Parser
 * Extracts intent and parameters from user commands
 */
export interface ParsedCommand {
  intent:
    | "provision_secret"
    | "rotate_secret"
    | "list_secrets"
    | "analyze_project"
    | "check_compliance"
    | "help"
    | "unknown";
  confidence: number;
  parameters: {
    service?: string;
    environment?: string;
    secretId?: string;
    framework?: string;
    [key: string]: any;
  };
  originalQuery: string;
}

export class NaturalLanguageParser {
  private llm: LLMProvider;

  constructor(llmConfig: LLMConfig) {
    this.llm = new LLMProvider(llmConfig);
  }

  /**
   * Parse natural language command
   */
  async parse(query: string): Promise<ParsedCommand> {
    // Try rule-based parsing first (faster and free)
    const ruleResult = this.parseWithRules(query);
    if (ruleResult.confidence > 0.8) {
      return ruleResult;
    }

    // Fall back to LLM for complex queries
    return await this.parseWithLLM(query);
  }

  /**
   * Rule-based parsing (fast path)
   */
  private parseWithRules(query: string): ParsedCommand {
    const lower = query.toLowerCase();

    // Provision patterns
    if (
      lower.includes("provision") ||
      lower.includes("create") ||
      lower.includes("new secret") ||
      lower.includes("add key")
    ) {
      return {
        intent: "provision_secret",
        confidence: 0.9,
        parameters: {
          service: this.extractService(query),
          environment: this.extractEnvironment(query),
        },
        originalQuery: query,
      };
    }

    // Rotate patterns
    if (lower.includes("rotate") || lower.includes("refresh") || lower.includes("renew")) {
      return {
        intent: "rotate_secret",
        confidence: 0.9,
        parameters: {
          service: this.extractService(query),
          secretId: this.extractSecretId(query),
        },
        originalQuery: query,
      };
    }

    // List patterns
    if (
      lower.includes("list") ||
      lower.includes("show") ||
      lower.includes("get all") ||
      lower.includes("what secrets")
    ) {
      return {
        intent: "list_secrets",
        confidence: 0.9,
        parameters: {
          environment: this.extractEnvironment(query),
        },
        originalQuery: query,
      };
    }

    // Analyze patterns
    if (lower.includes("analyze") || lower.includes("scan") || lower.includes("detect")) {
      return {
        intent: "analyze_project",
        confidence: 0.9,
        parameters: {},
        originalQuery: query,
      };
    }

    // Compliance patterns
    if (lower.includes("compliance") || lower.includes("soc2") || lower.includes("gdpr")) {
      return {
        intent: "check_compliance",
        confidence: 0.9,
        parameters: {
          framework: this.extractComplianceFramework(query),
        },
        originalQuery: query,
      };
    }

    // Help patterns
    if (
      lower.includes("help") ||
      lower.includes("how to") ||
      lower.includes("what can") ||
      query === "?"
    ) {
      return {
        intent: "help",
        confidence: 1.0,
        parameters: {},
        originalQuery: query,
      };
    }

    return {
      intent: "unknown",
      confidence: 0.3,
      parameters: {},
      originalQuery: query,
    };
  }

  /**
   * LLM-based parsing (for complex queries)
   */
  private async parseWithLLM(query: string): Promise<ParsedCommand> {
    const systemPrompt = `You are an intent classifier for SecretForge AI, an API key management tool.

Available intents:
- provision_secret: Create a new API key
- rotate_secret: Rotate an existing key
- list_secrets: List all secrets
- analyze_project: Analyze project dependencies
- check_compliance: Validate security compliance
- help: Get help or information
- unknown: Query doesn't match any intent

Extract the intent and parameters from the user query. Respond with JSON only:
{
  "intent": "intent_name",
  "confidence": 0.95,
  "parameters": {
    "service": "stripe",
    "environment": "production"
  }
}`;

    const messages: LLMMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: query },
    ];

    const response = await this.llm.complete(messages);

    try {
      const parsed = JSON.parse(response.content);
      return {
        ...parsed,
        originalQuery: query,
      };
    } catch {
      return {
        intent: "unknown",
        confidence: 0.2,
        parameters: {},
        originalQuery: query,
      };
    }
  }

  /**
   * Extract service name from query
   */
  private extractService(query: string): string | undefined {
    const services = [
      "stripe",
      "openai",
      "aws",
      "anthropic",
      "twilio",
      "sendgrid",
      "supabase",
      "mongodb",
      "postgresql",
      "redis",
    ];

    const lower = query.toLowerCase();
    for (const service of services) {
      if (lower.includes(service)) {
        return service;
      }
    }

    return undefined;
  }

  /**
   * Extract environment from query
   */
  private extractEnvironment(query: string): "development" | "staging" | "production" | undefined {
    const lower = query.toLowerCase();

    if (lower.includes("prod") || lower.includes("production")) return "production";
    if (lower.includes("staging") || lower.includes("stage")) return "staging";
    if (lower.includes("dev") || lower.includes("development")) return "development";

    return undefined;
  }

  /**
   * Extract secret ID from query
   */
  private extractSecretId(query: string): string | undefined {
    // UUID pattern
    const uuidMatch = query.match(
      /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
    );
    if (uuidMatch) {
      return uuidMatch[0];
    }

    return undefined;
  }

  /**
   * Extract compliance framework from query
   */
  private extractComplianceFramework(query: string): string | undefined {
    const lower = query.toLowerCase();

    if (lower.includes("soc2") || lower.includes("soc 2")) return "SOC2";
    if (lower.includes("gdpr")) return "GDPR";
    if (lower.includes("hipaa")) return "HIPAA";
    if (lower.includes("pci") || lower.includes("pci-dss")) return "PCI-DSS";

    return undefined;
  }
}
