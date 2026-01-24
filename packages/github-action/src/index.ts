import * as core from '@actions/core';
import * as github from '@actions/github';
import { Anthropic } from '@anthropic-ai/sdk';

interface SecretMatch {
  line: number;
  file: string;
  type: string;
  value: string;
  confidence: number;
  service?: string;
}

interface ProvisionResult {
  service: string;
  environment: string;
  secretId: string;
  envVar: string;
}

async function run(): Promise<void> {
  try {
    const githubToken = core.getInput('github-token', { required: true });
    const autoProvision = core.getInput('auto-provision') === 'true';
    const secretforgeApiKey = core.getInput('secretforge-api-key');
    const failOnSecrets = core.getInput('fail-on-secrets') === 'true';

    const octokit = github.getOctokit(githubToken);
    const context = github.context;

    // Only run on pull requests
    if (!context.payload.pull_request) {
      core.info('Not a pull request, skipping...');
      return;
    }

    core.info('🔍 SecretForge Shield: Scanning for exposed secrets...');

    // Get PR diff
    const { data: files } = await octokit.rest.pulls.listFiles({
      owner: context.repo.owner,
      repo: context.repo.repo,
      pull_number: context.payload.pull_request.number,
    });

    // Scan all changed files
    const allSecrets: SecretMatch[] = [];

    for (const file of files) {
      if (file.status === 'removed') continue;

      // Get file content
      const { data: content } = await octokit.rest.repos.getContent({
        owner: context.repo.owner,
        repo: context.repo.repo,
        path: file.filename,
        ref: context.payload.pull_request.head.sha,
      });

      if ('content' in content) {
        const decoded = Buffer.from(content.content, 'base64').toString('utf-8');
        const secrets = await detectSecrets(decoded, file.filename);
        allSecrets.push(...secrets);
      }
    }

    core.info(`Found ${allSecrets.length} potential secrets`);

    // Set outputs
    core.setOutput('secrets-found', allSecrets.length);

    if (allSecrets.length === 0) {
      await commentOnPR(octokit, context, generateSuccessComment());
      return;
    }

    // Auto-provision if enabled
    let provisionedSecrets: ProvisionResult[] = [];
    if (autoProvision && secretforgeApiKey) {
      core.info('🚀 Auto-provisioning secure replacements...');
      provisionedSecrets = await provisionSecrets(allSecrets, secretforgeApiKey);
      core.setOutput('provisioned-count', provisionedSecrets.length);
    }

    // Comment on PR
    const comment = generateWarningComment(allSecrets, provisionedSecrets);
    await commentOnPR(octokit, context, comment);

    // Fail the check if configured
    if (failOnSecrets && allSecrets.length > 0) {
      core.setFailed(
        `❌ Found ${allSecrets.length} exposed secrets. Use SecretForge to secure them!`
      );
    }
  } catch (error) {
    if (error instanceof Error) {
      core.setFailed(error.message);
    }
  }
}

async function detectSecrets(content: string, filename: string): Promise<SecretMatch[]> {
  const secrets: SecretMatch[] = [];
  const lines = content.split('\n');

  // Pattern-based detection (fast pass)
  const patterns = [
    { type: 'aws', regex: /AKIA[0-9A-Z]{16}/, service: 'aws' },
    { type: 'stripe', regex: /sk_live_[0-9a-zA-Z]{24,}/, service: 'stripe' },
    { type: 'stripe_test', regex: /sk_test_[0-9a-zA-Z]{24,}/, service: 'stripe' },
    { type: 'openai', regex: /sk-[a-zA-Z0-9]{48}/, service: 'openai' },
    { type: 'anthropic', regex: /sk-ant-[a-zA-Z0-9-]{95}/, service: 'anthropic' },
    { type: 'github', regex: /ghp_[a-zA-Z0-9]{36}/, service: 'github' },
    {
      type: 'generic_api_key',
      regex: /['"]?[a-zA-Z0-9_-]*api[_-]?key['"]?\s*[:=]\s*['"][a-zA-Z0-9_-]{20,}['"]/,
      service: 'unknown',
    },
    { type: 'jwt', regex: /eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/ },
  ];

  lines.forEach((line, index) => {
    // Skip comments and obvious false positives
    if (line.trim().startsWith('//') || line.trim().startsWith('#')) return;
    if (filename.includes('.env.example') || filename.includes('.env.template')) return;

    patterns.forEach((pattern) => {
      const matches = line.match(pattern.regex);
      if (matches) {
        secrets.push({
          line: index + 1,
          file: filename,
          type: pattern.type,
          value: matches[0].substring(0, 20) + '...',
          confidence: 0.9,
          service: pattern.service,
        });
      }
    });
  });

  // TODO: Add AI-powered detection for higher accuracy
  // const aiSecrets = await detectWithAI(content, filename);
  // secrets.push(...aiSecrets);

  return secrets;
}

async function provisionSecrets(
  secrets: SecretMatch[],
  apiKey: string
): Promise<ProvisionResult[]> {
  const results: ProvisionResult[] = [];

  for (const secret of secrets) {
    if (!secret.service || secret.service === 'unknown') continue;

    try {
      const response = await fetch('https://api.secretforge.ai/api/secrets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          service: secret.service,
          environment: 'production',
          scopes: [],
          metadata: {
            source: 'github-action',
            detected_type: secret.type,
          },
        }),
      });

      const data = await response.json();
      results.push({
        service: secret.service,
        environment: 'production',
        secretId: data.secret.id,
        envVar: `${secret.service.toUpperCase()}_API_KEY`,
      });
    } catch (error) {
      core.warning(`Failed to provision ${secret.service}: ${error}`);
    }
  }

  return results;
}

async function commentOnPR(
  octokit: ReturnType<typeof github.getOctokit>,
  context: typeof github.context,
  comment: string
): Promise<void> {
  await octokit.rest.issues.createComment({
    owner: context.repo.owner,
    repo: context.repo.repo,
    issue_number: context.payload.pull_request!.number,
    body: comment,
  });
}

function generateSuccessComment(): string {
  return `## ✅ SecretForge Shield: All Clear!

No exposed secrets detected in this PR. Great job! 🎉

---

<sub>Protected by [SecretForge AI](https://secretforge.ai) | [Add to your repo](https://github.com/marketplace/actions/secretforge-shield)</sub>`;
}

function generateWarningComment(secrets: SecretMatch[], provisioned: ProvisionResult[]): string {
  let comment = `## ⚠️ SecretForge Shield: Secrets Detected!

Found **${secrets.length}** exposed secret${secrets.length > 1 ? 's' : ''} in this PR.

### 🚨 Detected Secrets:

| File | Line | Type | Confidence |
|------|------|------|------------|
`;

  secrets.forEach((secret) => {
    comment += `| \`${secret.file}\` | ${secret.line} | ${secret.type} | ${(secret.confidence * 100).toFixed(0)}% |\n`;
  });

  comment += '\n---\n\n';

  if (provisioned.length > 0) {
    comment += `### ✨ Auto-Provisioned Secure Replacements:\n\n`;
    provisioned.forEach((p) => {
      comment += `- ✅ **${p.service}**: Use \`process.env.${p.envVar}\` instead (Secret ID: \`${p.secretId}\`)\n`;
    });
    comment += '\n';
  } else {
    comment += `### 🛡️ Fix This Now:\n\n`;
    comment += `**Option 1: Auto-Fix (Recommended)**\n`;
    comment += `Enable auto-provisioning in your workflow:\n\n`;
    comment += '```yaml\n';
    comment += `- uses: secretforge/shield@v1
  with:
    github-token: \${{ secrets.GITHUB_TOKEN }}
    auto-provision: true
    secretforge-api-key: \${{ secrets.SECRETFORGE_API_KEY }}
\`\`\`\n\n`;
    comment += `**Option 2: Manual Fix**\n`;
    comment += `Use the SecretForge CLI:\n\n`;
    comment += '```bash\n';
    comment += 'npx @secretforge/cli init\n';
    comment += '```\n\n';
  }

  comment += `---

### 🎯 Why This Matters:

- Exposed API keys can cost you **thousands of dollars** in unauthorized usage
- Attackers scan GitHub for secrets **24/7**
- It takes **< 10 minutes** for exposed keys to be exploited

### 🚀 Get SecretForge:

- [Install CLI](https://www.npmjs.com/package/@secretforge/cli): \`npx @secretforge/cli init\`
- [MCP Integration](https://github.com/secretforge/mcp-server) for Claude & AI assistants
- [Dashboard](https://secretforge.ai): Manage all your secrets in one place

---

<sub>Protected by [SecretForge AI](https://secretforge.ai) | [Get it for your repo](https://github.com/marketplace/actions/secretforge-shield) | [Star us on GitHub](https://github.com/secretforge/secretforge-ai) ⭐</sub>`;

  return comment;
}

run();
