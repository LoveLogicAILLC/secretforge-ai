/**
 * Scope Optimizer
 * Analyzes codebase to determine minimal required API permissions
 * Uses AST parsing to find actual API usage
 */

export interface ScopeAnalysisResult {
  service: string;
  recommendedScopes: string[];
  usedEndpoints: string[];
  unusedScopes: string[];
  confidence: number;
  suggestions: string[];
}

export interface APICall {
  service: string;
  method: string;
  endpoint: string;
  requiredScope: string;
  location: {
    file: string;
    line: number;
  };
}

/**
 * Service-specific scope mappings
 * Maps API endpoints/methods to required scopes
 */
const SCOPE_MAPPINGS: Record<string, Record<string, string[]>> = {
  stripe: {
    "customers.create": ["customers:write"],
    "customers.retrieve": ["customers:read"],
    "customers.list": ["customers:read"],
    "customers.update": ["customers:write"],
    "customers.delete": ["customers:write"],
    "charges.create": ["charges:write"],
    "charges.retrieve": ["charges:read"],
    "charges.list": ["charges:read"],
    "paymentIntents.create": ["payment_intents:write"],
    "paymentIntents.retrieve": ["payment_intents:read"],
    "paymentIntents.confirm": ["payment_intents:write"],
    "subscriptions.create": ["subscriptions:write"],
    "subscriptions.retrieve": ["subscriptions:read"],
    "subscriptions.list": ["subscriptions:read"],
    "subscriptions.update": ["subscriptions:write"],
    "subscriptions.cancel": ["subscriptions:write"],
  },
  aws: {
    "s3.putObject": ["s3:PutObject"],
    "s3.getObject": ["s3:GetObject"],
    "s3.listObjects": ["s3:ListBucket"],
    "s3.deleteObject": ["s3:DeleteObject"],
    "lambda.invoke": ["lambda:InvokeFunction"],
    "lambda.createFunction": ["lambda:CreateFunction"],
    "dynamodb.putItem": ["dynamodb:PutItem"],
    "dynamodb.getItem": ["dynamodb:GetItem"],
    "dynamodb.scan": ["dynamodb:Scan"],
    "dynamodb.query": ["dynamodb:Query"],
    "sns.publish": ["sns:Publish"],
    "sqs.sendMessage": ["sqs:SendMessage"],
  },
  openai: {
    "chat.completions.create": ["chat.completions:write"],
    "embeddings.create": ["embeddings:write"],
    "images.generate": ["images:write"],
    "audio.transcriptions.create": ["audio:write"],
    "files.create": ["files:write"],
    "files.retrieve": ["files:read"],
    "fine_tuning.jobs.create": ["fine_tuning:write"],
  },
  twilio: {
    "messages.create": ["messages:write"],
    "messages.list": ["messages:read"],
    "calls.create": ["calls:write"],
    "calls.list": ["calls:read"],
    "verify.services.create": ["verify:write"],
  },
  sendgrid: {
    "send": ["mail:send"],
    "templates.create": ["templates:write"],
    "templates.list": ["templates:read"],
    "lists.create": ["marketing:write"],
  },
};

/**
 * Analyze JavaScript/TypeScript code for API usage
 */
export function analyzeJavaScriptCode(code: string, service: string): ScopeAnalysisResult {
  const apiCalls = extractJavaScriptAPICalls(code, service);
  return buildScopeAnalysis(service, apiCalls);
}

/**
 * Analyze Python code for API usage
 */
export function analyzePythonCode(code: string, service: string): ScopeAnalysisResult {
  const apiCalls = extractPythonAPICalls(code, service);
  return buildScopeAnalysis(service, apiCalls);
}

/**
 * Analyze Go code for API usage
 */
export function analyzeGoCode(code: string, service: string): ScopeAnalysisResult {
  const apiCalls = extractGoAPICalls(code, service);
  return buildScopeAnalysis(service, apiCalls);
}

/**
 * Extract API calls from JavaScript/TypeScript code
 * Uses regex-based AST-like parsing
 * Optimized: Early exits, pattern caching
 */
function extractJavaScriptAPICalls(code: string, service: string): APICall[] {
  // Early exit for empty code
  if (!code || code.trim().length === 0) {
    return [];
  }

  const calls: APICall[] = [];
  const lines = code.split("\n");

  const servicePatterns = getServicePatterns(service);
  
  // Early exit if no patterns for service
  if (servicePatterns.length === 0) {
    return [];
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Skip empty lines and comments early
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith('//') || trimmedLine.startsWith('*')) {
      continue;
    }

    for (const pattern of servicePatterns) {
      const matches = line.matchAll(pattern.regex);
      for (const match of matches) {
        const method = match[1] || match[2] || "unknown";
        const endpoint = pattern.name + "." + method;
        const scopes = SCOPE_MAPPINGS[service]?.[endpoint] || [];

        if (scopes.length > 0) {
          calls.push({
            service,
            method,
            endpoint,
            requiredScope: scopes[0],
            location: {
              file: "analysis",
              line: i + 1,
            },
          });
        }
      }
    }
  }

  return calls;
}

/**
 * Extract API calls from Python code
 * Optimized: Early exit for empty code, skip empty lines and comments
 */
function extractPythonAPICalls(code: string, service: string): APICall[] {
  // Early exit for empty code
  if (!code || code.trim().length === 0) {
    return [];
  }

  const calls: APICall[] = [];
  const lines = code.split("\n");

  // Python-specific patterns
  const patterns: { name: string; regex: RegExp }[] = [];

  if (service === "stripe") {
    patterns.push(
      { name: "customers", regex: /stripe\.Customer\.(create|retrieve|list|update|delete)/g },
      { name: "charges", regex: /stripe\.Charge\.(create|retrieve|list)/g },
      { name: "subscriptions", regex: /stripe\.Subscription\.(create|retrieve|list|update|cancel)/g }
    );
  } else if (service === "openai") {
    patterns.push(
      { name: "chat.completions", regex: /client\.chat\.completions\.create/g },
      { name: "embeddings", regex: /client\.embeddings\.create/g },
      { name: "images", regex: /client\.images\.generate/g }
    );
  }

  // Early exit if no patterns for service
  if (patterns.length === 0) {
    return [];
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Skip empty lines and comments early
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith('#')) {
      continue;
    }

    for (const pattern of patterns) {
      const matches = line.matchAll(pattern.regex);
      for (const match of matches) {
        const method = match[1] || "create";
        const endpoint = pattern.name + "." + method;
        const scopes = SCOPE_MAPPINGS[service]?.[endpoint] || [];

        if (scopes.length > 0) {
          calls.push({
            service,
            method,
            endpoint,
            requiredScope: scopes[0],
            location: {
              file: "analysis",
              line: i + 1,
            },
          });
        }
      }
    }
  }

  return calls;
}

/**
 * Extract API calls from Go code
 * Optimized: Early exit for empty code, skip empty lines and comments
 */
function extractGoAPICalls(code: string, service: string): APICall[] {
  // Early exit for empty code
  if (!code || code.trim().length === 0) {
    return [];
  }

  const calls: APICall[] = [];
  const lines = code.split("\n");

  // Go-specific patterns
  const patterns: { name: string; regex: RegExp }[] = [];

  if (service === "stripe") {
    patterns.push(
      { name: "customers", regex: /customer\.(New|Get|List|Update|Del)/g },
      { name: "charges", regex: /charge\.(New|Get|List)/g }
    );
  } else if (service === "aws") {
    patterns.push(
      { name: "s3", regex: /s3Client\.(PutObject|GetObject|ListObjects|DeleteObject)/g },
      { name: "lambda", regex: /lambdaClient\.Invoke/g }
    );
  }

  // Early exit if no patterns for service
  if (patterns.length === 0) {
    return [];
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    
    // Skip empty lines and comments early
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith('//')) {
      continue;
    }

    for (const pattern of patterns) {
      const matches = line.matchAll(pattern.regex);
      for (const match of matches) {
        const method = match[1] || "unknown";
        const endpoint = pattern.name + "." + method;
        const scopes = SCOPE_MAPPINGS[service]?.[endpoint] || [];

        if (scopes.length > 0) {
          calls.push({
            service,
            method,
            endpoint,
            requiredScope: scopes[0],
            location: {
              file: "analysis",
              line: i + 1,
            },
          });
        }
      }
    }
  }

  return calls;
}

/**
 * Pattern cache for better performance
 */
const SERVICE_PATTERNS_CACHE: Map<string, Array<{ name: string; regex: RegExp }>> = new Map();

/**
 * Get service-specific regex patterns for JavaScript
 * Optimized: Memoized to avoid rebuilding patterns on every call
 */
function getServicePatterns(service: string): Array<{ name: string; regex: RegExp }> {
  // Return cached patterns if available
  if (SERVICE_PATTERNS_CACHE.has(service)) {
    return SERVICE_PATTERNS_CACHE.get(service)!;
  }

  const patterns: Array<{ name: string; regex: RegExp }> = [];

  switch (service) {
    case "stripe":
      patterns.push(
        { name: "customers", regex: /stripe\.customers\.(create|retrieve|list|update|del)/g },
        { name: "charges", regex: /stripe\.charges\.(create|retrieve|list)/g },
        {
          name: "paymentIntents",
          regex: /stripe\.paymentIntents\.(create|retrieve|confirm|cancel)/g,
        },
        {
          name: "subscriptions",
          regex: /stripe\.subscriptions\.(create|retrieve|list|update|cancel)/g,
        }
      );
      break;

    case "openai":
      patterns.push(
        { name: "chat.completions", regex: /openai\.chat\.completions\.create/g },
        { name: "embeddings", regex: /openai\.embeddings\.create/g },
        { name: "images", regex: /openai\.images\.generate/g }
      );
      break;

    case "aws":
      patterns.push(
        { name: "s3", regex: /s3\.(putObject|getObject|listObjects|deleteObject)/g },
        { name: "lambda", regex: /lambda\.invoke/g },
        { name: "dynamodb", regex: /dynamodb\.(putItem|getItem|scan|query)/g }
      );
      break;

    case "twilio":
      patterns.push(
        { name: "messages", regex: /twilio\.messages\.(create|list)/g },
        { name: "calls", regex: /twilio\.calls\.(create|list)/g }
      );
      break;

    case "sendgrid":
      patterns.push(
        { name: "send", regex: /sgMail\.send/g },
        { name: "templates", regex: /sgMail\.templates\.(create|list)/g }
      );
      break;
  }

  // Cache the patterns
  SERVICE_PATTERNS_CACHE.set(service, patterns);
  return patterns;
}

/**
 * Build scope analysis from extracted API calls
 */
function buildScopeAnalysis(service: string, apiCalls: APICall[]): ScopeAnalysisResult {
  const usedEndpoints = [...new Set(apiCalls.map((call) => call.endpoint))];
  const requiredScopes = [...new Set(apiCalls.map((call) => call.requiredScope))];
  const allScopes = getAllScopesForService(service);
  const unusedScopes = allScopes.filter((scope) => !requiredScopes.includes(scope));

  // Calculate confidence based on number of API calls found
  const confidence = Math.min(0.5 + apiCalls.length * 0.1, 0.99);

  const suggestions = generateSuggestions(service, requiredScopes, unusedScopes, apiCalls);

  return {
    service,
    recommendedScopes: requiredScopes,
    usedEndpoints,
    unusedScopes,
    confidence,
    suggestions,
  };
}

/**
 * Get all available scopes for a service
 */
function getAllScopesForService(service: string): string[] {
  const scopeMapping = SCOPE_MAPPINGS[service];
  if (!scopeMapping) return [];

  const allScopes = new Set<string>();
  for (const scopes of Object.values(scopeMapping)) {
    scopes.forEach((scope) => allScopes.add(scope));
  }

  return Array.from(allScopes);
}

/**
 * Generate optimization suggestions
 */
function generateSuggestions(
  service: string,
  requiredScopes: string[],
  unusedScopes: string[],
  apiCalls: APICall[]
): string[] {
  const suggestions: string[] = [];

  if (requiredScopes.length === 0) {
    suggestions.push(`No API calls detected for ${service}. Consider removing this dependency.`);
  } else {
    suggestions.push(
      `Detected ${apiCalls.length} API call(s) requiring ${requiredScopes.length} scope(s).`
    );
  }

  if (unusedScopes.length > 0) {
    suggestions.push(
      `${unusedScopes.length} scope(s) can be removed: ${unusedScopes.slice(0, 3).join(", ")}${unusedScopes.length > 3 ? "..." : ""}`
    );
  }

  // Service-specific suggestions
  if (service === "stripe") {
    const hasRead = requiredScopes.some((s) => s.includes(":read"));
    const hasWrite = requiredScopes.some((s) => s.includes(":write"));

    if (hasRead && !hasWrite) {
      suggestions.push("Consider using a read-only Stripe key for better security.");
    }
  }

  if (service === "aws") {
    const hasS3Write = requiredScopes.includes("s3:PutObject");
    const hasS3Delete = requiredScopes.includes("s3:DeleteObject");

    if (hasS3Write || hasS3Delete) {
      suggestions.push(
        "Consider using separate IAM roles for read and write operations on S3."
      );
    }
  }

  return suggestions;
}

/**
 * Analyze entire project directory
 */
export interface ProjectAnalysisResult {
  services: Record<string, ScopeAnalysisResult>;
  summary: {
    totalServices: number;
    totalScopes: number;
    optimizationPotential: number; // Percentage of scopes that can be removed
  };
}

export function analyzeProject(files: Record<string, string>, services: string[]): ProjectAnalysisResult {
  const results: Record<string, ScopeAnalysisResult> = {};

  for (const service of services) {
    let mergedCalls: APICall[] = [];

    for (const [filename, code] of Object.entries(files)) {
      const ext = filename.split(".").pop();

      let serviceCalls: APICall[] = [];

      if (ext === "js" || ext === "ts" || ext === "jsx" || ext === "tsx") {
        serviceCalls = extractJavaScriptAPICalls(code, service);
      } else if (ext === "py") {
        serviceCalls = extractPythonAPICalls(code, service);
      } else if (ext === "go") {
        serviceCalls = extractGoAPICalls(code, service);
      }

      // Update locations
      serviceCalls.forEach((call) => {
        call.location.file = filename;
      });

      mergedCalls = [...mergedCalls, ...serviceCalls];
    }

    results[service] = buildScopeAnalysis(service, mergedCalls);
  }

  // Calculate summary
  const totalServices = Object.keys(results).length;
  const totalScopes = Object.values(results).reduce(
    (sum, r) => sum + r.recommendedScopes.length,
    0
  );
  const totalUnusedScopes = Object.values(results).reduce(
    (sum, r) => sum + r.unusedScopes.length,
    0
  );
  const optimizationPotential =
    totalScopes + totalUnusedScopes > 0
      ? (totalUnusedScopes / (totalScopes + totalUnusedScopes)) * 100
      : 0;

  return {
    services: results,
    summary: {
      totalServices,
      totalScopes,
      optimizationPotential,
    },
  };
}
