import * as core from '@actions/core';
import * as github from '@actions/github';
import { SecretDetector, type SecretMatch as DetectorMatch } from '@secretforge/shared/scanner';

/** Finding shape used by this action. Deliberately has no raw secret value. */
interface SecretMatch {
  line: number;
  file: string;
  type: string;
  masked: string;
  confidence: number;
  service?: string;
}

const detector = new SecretDetector();

/** Map detector rule ids to SecretForge service names (for auto-provisioning). */
const RULE_SERVICE: Record<string, string> = {
  'aws-access-key-id': 'aws',
  'aws-secret-access-key': 'aws',
  'stripe-live-secret': 'stripe',
  'stripe-test-secret': 'stripe',
  'openai-api-key': 'openai',
  'anthropic-api-key': 'anthropic',
  'github-token': 'github',
  'github-fine-grained-pat': 'github',
  'sendgrid-api-key': 'sendgrid',
  'twilio-api-key': 'twilio',
};

function toFinding(m: DetectorMatch): SecretMatch {
  return {
    line: m.location.line,
    file: m.location.file,
    type: m.type,
    masked: m.maskedValue,
    confidence: m.confidence,
    service: RULE_SERVICE[m.ruleId] ?? 'unknown',
  };
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

    // All changed files (listFiles is paginated at 30 per page; the previous
    // code only ever looked at the first page).
    const files = await octokit.paginate(octokit.rest.pulls.listFiles, {
      owner: context.repo.owner,
      repo: context.repo.repo,
      pull_number: context.payload.pull_request.number,
      per_page: 100,
    });

    const allSecrets: SecretMatch[] = [];

    for (const file of files) {
      if (file.status === 'removed') continue;

      if (file.patch) {
        // Scan only the lines this PR adds, with correct line numbers.
        const diff = `+++ b/${file.filename}\n${file.patch}`;
        allSecrets.push(...detector.scanDiff(diff).map(toFinding));
        continue;
      }

      // GitHub omits `patch` for large/binary diffs — fall back to the file.
      const { data: content } = await octokit.rest.repos.getContent({
        owner: context.repo.owner,
        repo: context.repo.repo,
        path: file.filename,
        ref: context.payload.pull_request.head.sha,
      });
      if ('content' in content && content.content) {
        const decoded = Buffer.from(content.content, 'base64').toString('utf-8');
        allSecrets.push(...detector.scanFile(decoded, file.filename).map(toFinding));
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
          // SecretForge API keys (sf_...) are sent as X-API-Key; the Bearer
          // header is for JWTs, so provisioning always 401'd before.
          'X-API-Key': apiKey,
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

      if (!response.ok) {
        throw new Error(`SecretForge API returned ${response.status}`);
      }
      const data = (await response.json()) as { secret: { id: string } };
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

| File | Line | Type | Value (masked) | Confidence |
|------|------|------|----------------|------------|
`;

  secrets.forEach((secret) => {
    comment += `| \`${secret.file}\` | ${secret.line} | ${secret.type} | \`${secret.masked}\` | ${(secret.confidence * 100).toFixed(0)}% |\n`;
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
