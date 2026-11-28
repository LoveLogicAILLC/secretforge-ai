import { describe, expect, it } from 'vitest';

import {
  ENCRYPTED_PLACEHOLDER,
  parseProvisionResponse,
  readProvisionResponse,
} from '../provision.js';

describe('parseProvisionResponse', () => {
  it('returns the id and value of a well-formed response', () => {
    expect(parseProvisionResponse({ secret: { id: 'sec_1', value: 'abc123' } })).toEqual({
      id: 'sec_1',
      value: 'abc123',
    });
  });

  it.each([
    ['null body', null],
    ['no secret', {}],
    ['missing id', { secret: { value: 'abc123' } }],
    ['missing value', { secret: { id: 'sec_1' } }],
    ['empty id', { secret: { id: '', value: 'abc123' } }],
    ['empty value', { secret: { id: 'sec_1', value: '' } }],
    ['non-string value', { secret: { id: 'sec_1', value: 42 } }],
  ])('rejects %s', (_label, body) => {
    expect(() => parseProvisionResponse(body)).toThrow('Invalid secret response');
  });

  it('rejects the encrypted placeholder so it is never persisted as a credential', () => {
    expect(() =>
      parseProvisionResponse({ secret: { id: 'sec_1', value: ENCRYPTED_PLACEHOLDER } })
    ).toThrow('encrypted placeholder');
  });
});

describe('readProvisionResponse', () => {
  it('parses a successful response', async () => {
    const response = new Response(JSON.stringify({ secret: { id: 'sec_1', value: 'abc123' } }), {
      status: 201,
    });
    await expect(readProvisionResponse(response)).resolves.toEqual({
      id: 'sec_1',
      value: 'abc123',
    });
  });

  it('surfaces HTTP failures before touching the body', async () => {
    const response = new Response('{}', { status: 401, statusText: 'Unauthorized' });
    await expect(readProvisionResponse(response)).rejects.toThrow('HTTP 401 Unauthorized');
  });
});
