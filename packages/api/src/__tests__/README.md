# Integration Tests

## Important: Secret Scanning Guidelines

When writing tests for SecretForge AI, **DO NOT** use mock API keys that match real secret patterns. GitHub's secret scanning will flag them as potential security vulnerabilities.

### ❌ Bad Practice
```typescript
const TEST_ENV = {
  OPENAI_API_KEY: 'sk-test-key',  // Matches OpenAI pattern!
  ANTHROPIC_API_KEY: 'sk-ant-test-key',  // Matches Anthropic pattern!
  GITHUB_TOKEN: 'ghp_test123',  // Matches GitHub token pattern!
};
```

### ✅ Good Practice
```typescript
const TEST_ENV = {
  OPENAI_API_KEY: 'TEST_OPENAI_KEY_NOT_REAL',
  ANTHROPIC_API_KEY: 'TEST_ANTHROPIC_KEY_NOT_REAL',
  GITHUB_TOKEN: 'TEST_GITHUB_TOKEN_NOT_REAL',
};
```

### Common Secret Patterns to Avoid in Tests

Refer to `packages/shared/src/constants.ts` for the current list of patterns:

- `sk_` - Stripe
- `sk-` - OpenAI
- `sk-ant-` - Anthropic
- `ghp_` - GitHub Personal Access Token
- `gho_` - GitHub OAuth Token
- `github_pat_` - GitHub Fine-grained PAT
- `AKIA` - AWS Access Key
- `sbp_` - Supabase

### Why This Matters

1. **False Positives**: Triggers security alerts and fails CI/CD workflows
2. **Developer Time**: Wastes time investigating non-issues
3. **Alert Fatigue**: Real security issues might be missed among false positives

### Best Practices

1. Use clearly fake values: `TEST_*_NOT_REAL`, `MOCK_*_VALUE`, `FAKE_*_KEY`
2. Never commit real API keys, even expired ones
3. Use environment variables for actual secrets
4. Review the secret scanning patterns before adding new mock credentials

---

**Last Updated**: March 2026  
**Related PR**: #159
