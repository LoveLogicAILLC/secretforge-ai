import { describe, it, expect } from 'vitest';

interface CLIContext {
  projectPath: string;
  dependencies: Record<string, string>;
  apiEndpoint: string;
  userId: string;
}

async function detectRequiredServices(context: CLIContext): Promise<string[]> {
  const serviceMap: Record<string, string[]> = {
    stripe: ['stripe', '@stripe/stripe-js'],
    openai: ['openai'],
    anthropic: ['@anthropic-ai/sdk'],
    supabase: ['@supabase/supabase-js'],
    aws: ['aws-sdk', '@aws-sdk'],
    sendgrid: ['@sendgrid/mail'],
  };

  const detected: string[] = [];
  for (const [service, packages] of Object.entries(serviceMap)) {
    if (
      packages.some((pkg) =>
        Object.keys(context.dependencies).some((d) => d.includes(pkg))
      )
    ) {
      detected.push(service);
    }
  }

  return detected;
}

describe('detectRequiredServices', () => {
  const baseContext: CLIContext = {
    projectPath: '/test/project',
    dependencies: {},
    apiEndpoint: 'http://localhost:8787',
    userId: 'test-user',
  };

  it('should detect OpenAI dependency', async () => {
    const context = {
      ...baseContext,
      dependencies: { openai: '^4.0.0' },
    };
    const services = await detectRequiredServices(context);
    expect(services).toContain('openai');
  });

  it('should detect multiple services', async () => {
    const context = {
      ...baseContext,
      dependencies: {
        stripe: '^12.0.0',
        '@anthropic-ai/sdk': '^1.0.0',
        '@sendgrid/mail': '^7.0.0',
      },
    };
    const services = await detectRequiredServices(context);
    expect(services).toHaveLength(3);
    expect(services).toContain('stripe');
    expect(services).toContain('anthropic');
    expect(services).toContain('sendgrid');
  });

  it('should return empty for no matches', async () => {
    const context = {
      ...baseContext,
      dependencies: {
        react: '^18.0.0',
        'next': '^14.0.0',
      },
    };
    const services = await detectRequiredServices(context);
    expect(services).toEqual([]);
  });

  it('should handle AWS SDK scoped packages', async () => {
    const context = {
      ...baseContext,
      dependencies: {
        '@aws-sdk/client-s3': '^3.0.0',
      },
    };
    const services = await detectRequiredServices(context);
    expect(services).toContain('aws');
  });
});
