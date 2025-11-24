import { Context } from 'hono';

interface HealthCheck {
  name: string;
  healthy: boolean;
  latency: number;
  error?: string;
}

async function checkDatabase(): Promise<HealthCheck> {
  const start = Date.now();
  try {
    // @ts-ignore - env bindings are injected at runtime
    const result = await this.env?.DATABASE?.prepare('SELECT 1').first();
    return {
      name: 'database',
      healthy: !!result,
      latency: Date.now() - start,
    };
  } catch (error) {
    return {
      name: 'database',
      healthy: false,
      latency: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function checkKV(): Promise<HealthCheck> {
  const start = Date.now();
  try {
    // @ts-ignore
    await this.env?.SECRETS_VAULT?.get('__health_check__');
    return {
      name: 'kv',
      healthy: true,
      latency: Date.now() - start,
    };
  } catch (error) {
    return {
      name: 'kv',
      healthy: false,
      latency: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function checkVectorize(): Promise<HealthCheck> {
  const start = Date.now();
  try {
    // @ts-ignore
    const index = this.env?.VECTORIZE_INDEX;
    if (!index) throw new Error('Vectorize not configured');
    
    return {
      name: 'vectorize',
      healthy: true,
      latency: Date.now() - start,
    };
  } catch (error) {
    return {
      name: 'vectorize',
      healthy: false,
      latency: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

async function checkOllama(): Promise<HealthCheck> {
  const start = Date.now();
  const ollamaHost = process.env.OLLAMA_HOST || 'http://localhost:11434';
  
  try {
    const response = await fetch(`${ollamaHost}/api/tags`, {
      signal: AbortSignal.timeout(5000), // 5 second timeout
    });
    
    return {
      name: 'ollama',
      healthy: response.ok,
      latency: Date.now() - start,
    };
  } catch (error) {
    return {
      name: 'ollama',
      healthy: false,
      latency: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

export async function healthCheck(c: Context) {
  const startTime = Date.now();
  
  // Run all health checks in parallel
  const checks = await Promise.all([
    checkDatabase.call({ env: c.env }),
    checkKV.call({ env: c.env }),
    checkVectorize.call({ env: c.env }),
    checkOllama.call({ env: c.env }),
  ]);
  
  const healthy = checks.every(check => check.healthy);
  const criticalUnhealthy = checks
    .filter(c => ['database', 'kv'].includes(c.name) && !c.healthy)
    .length > 0;
  
  const responseTime = Date.now() - startTime;
  
  return c.json(
    {
      status: criticalUnhealthy ? 'unhealthy' : healthy ? 'healthy' : 'degraded',
      timestamp: new Date().toISOString(),
      version: c.env?.GIT_SHA || process.env.GIT_SHA || 'unknown',
      uptime: process.uptime?.() || 0,
      responseTime,
      checks: checks.reduce(
        (acc, check) => ({
          ...acc,
          [check.name]: {
            healthy: check.healthy,
            latency: check.latency,
            ...(check.error && { error: check.error }),
          },
        }),
        {}
      ),
    },
    criticalUnhealthy ? 503 : 200
  );
}

export async function readinessCheck(c: Context) {
  // Readiness: Can we accept traffic?
  const checks = await Promise.all([
    checkDatabase.call({ env: c.env }),
    checkKV.call({ env: c.env }),
  ]);
  
  const ready = checks.every(check => check.healthy);
  
  return c.json(
    {
      ready,
      timestamp: new Date().toISOString(),
    },
    ready ? 200 : 503
  );
}

export async function livenessCheck(c: Context) {
  // Liveness: Is the service alive?
  return c.json(
    {
      alive: true,
      timestamp: new Date().toISOString(),
    },
    200
  );
}
