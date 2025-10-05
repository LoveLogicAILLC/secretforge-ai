import { describe, it, expect } from 'vitest';

function analyzeDependencies(dependencies: Record<string, string>): string[] {
  const serviceMap: Record<string, string[]> = {
    stripe: ['stripe', '@stripe/stripe-js'],
    openai: ['openai'],
    aws: ['aws-sdk', '@aws-sdk'],
    supabase: ['@supabase/supabase-js'],
    anthropic: ['@anthropic-ai/sdk'],
    sendgrid: ['@sendgrid/mail'],
    twilio: ['twilio'],
  };

  const detected: string[] = [];
  for (const [service, packages] of Object.entries(serviceMap)) {
    if (packages.some((pkg) => Object.keys(dependencies).some((d) => d.includes(pkg)))) {
      detected.push(service);
    }
  }
  return detected;
}

describe('analyzeDependencies', () => {
  it('should detect Stripe dependencies', () => {
    const deps = { stripe: '^12.0.0' };
    const result = analyzeDependencies(deps);
    expect(result).toContain('stripe');
  });

  it('should detect multiple services', () => {
    const deps = {
      stripe: '^12.0.0',
      openai: '^4.0.0',
      '@supabase/supabase-js': '^2.0.0',
    };
    const result = analyzeDependencies(deps);
    expect(result).toContain('stripe');
    expect(result).toContain('openai');
    expect(result).toContain('supabase');
    expect(result).toHaveLength(3);
  });

  it('should detect AWS SDK packages', () => {
    const deps = {
      '@aws-sdk/client-s3': '^3.0.0',
      '@aws-sdk/client-dynamodb': '^3.0.0',
    };
    const result = analyzeDependencies(deps);
    expect(result).toContain('aws');
  });

  it('should return empty array for no matches', () => {
    const deps = {
      react: '^18.0.0',
      next: '^14.0.0',
    };
    const result = analyzeDependencies(deps);
    expect(result).toEqual([]);
  });

  it('should handle empty dependencies', () => {
    const result = analyzeDependencies({});
    expect(result).toEqual([]);
  });

  it('should detect @stripe/stripe-js', () => {
    const deps = { '@stripe/stripe-js': '^2.0.0' };
    const result = analyzeDependencies(deps);
    expect(result).toContain('stripe');
  });

  it('should not duplicate services', () => {
    const deps = {
      stripe: '^12.0.0',
      '@stripe/stripe-js': '^2.0.0',
    };
    const result = analyzeDependencies(deps);
    const stripeCount = result.filter((s) => s === 'stripe').length;
    expect(stripeCount).toBe(1);
  });
});
