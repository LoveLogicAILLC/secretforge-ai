import path from 'path';
import { defineConfig } from 'vitest/config';

const mockCloudflarePath = path.resolve(import.meta.dirname, './src/__tests__/mocks/cloudflare.ts');

export default defineConfig({
  plugins: [
    {
      name: 'mock-cloudflare-plugin',
      enforce: 'pre',
      resolveId(id) {
        if (id === 'cloudflare:email' || id === 'cloudflare:workers') {
          return mockCloudflarePath;
        }
        return null;
      },
    },
  ],
  resolve: {
    alias: {
      'cloudflare:email': mockCloudflarePath,
      'cloudflare:workers': mockCloudflarePath,
      agents: path.resolve(import.meta.dirname, './src/__tests__/mocks/agents.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    alias: {
      'cloudflare:email': mockCloudflarePath,
      'cloudflare:workers': mockCloudflarePath,
      agents: path.resolve(import.meta.dirname, './src/__tests__/mocks/agents.ts'),
    },
    server: {
      deps: {
        inline: [
          /partyserver/,
          /agents/,
        ],
      },
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: ['node_modules/', 'dist/', '**/*.test.ts', '**/*.spec.ts'],
    },
  },
});
