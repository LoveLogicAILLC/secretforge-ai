# Contributing to SecretForge AI

Thank you for your interest in contributing to SecretForge AI! This document provides guidelines and instructions for contributing.

## Code of Conduct

Be respectful, inclusive, and constructive in all interactions.

## Getting Started

1. **Fork the repository**
   ```bash
   git clone https://github.com/yourusername/secretforge-ai.git
   cd secretforge-ai
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Set up environment**
   ```bash
   cp .env.example .env
   # Edit .env with your API keys
   ```

4. **Start development**
   ```bash
   pnpm dev
   ```

## Development Workflow

### Create a Feature Branch
```bash
git checkout -b feature/your-feature-name
```

### Make Changes
- Write code following existing patterns
- Add tests for new functionality
- Update documentation as needed

### Run Tests
```bash
pnpm test
pnpm lint
pnpm build
```

### Commit Changes
```bash
git add .
git commit -m "feat: add your feature description"
```

We follow [Conventional Commits](https://www.conventionalcommits.org/):
- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation changes
- `test:` Adding tests
- `refactor:` Code refactoring
- `chore:` Maintenance tasks

### Push and Create PR
```bash
git push origin feature/your-feature-name
```

Then open a Pull Request on GitHub.

## Project Structure

```
secretforge-ai/
├── packages/
│   ├── api/          # Cloudflare Workers API
│   ├── cli/          # Command-line tool
│   ├── mcp-server/   # MCP integration
│   └── web/          # Next.js dashboard
```

## Coding Standards

### TypeScript
- Use strict TypeScript
- Prefer `const` over `let`
- Use explicit types for function parameters and return values
- Avoid `any` types

### Testing
- Write unit tests for business logic
- Aim for >80% code coverage
- Test edge cases and error conditions

### Documentation
- Add JSDoc comments for public APIs
- Update README.md for significant changes
- Include examples in documentation

## Pull Request Guidelines

### Before Submitting
- [ ] Tests pass (`pnpm test`)
- [ ] Linter passes (`pnpm lint`)
- [ ] Build succeeds (`pnpm build`)
- [ ] Documentation updated
- [ ] Commit messages follow conventions

### PR Description
Include:
- **What**: Description of changes
- **Why**: Reason for changes
- **How**: Implementation approach
- **Testing**: How you tested the changes

### Review Process
- PRs require 1 approval
- All CI checks must pass
- Address review feedback promptly

## Testing

### Unit Tests
```bash
pnpm test
```

### Coverage
```bash
pnpm test:coverage
```

### Watch Mode
```bash
pnpm test:watch
```

## Building

### Build All Packages
```bash
pnpm build
```

### Build Specific Package
```bash
pnpm --filter @secretforge/api build
```

## Deployment

### API (Cloudflare Workers)
```bash
cd packages/api
pnpm deploy
```

### Web (Vercel)
```bash
cd packages/web
vercel deploy
```

## Need Help?

- **Issues**: [GitHub Issues](https://github.com/yourusername/secretforge-ai/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/secretforge-ai/discussions)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
