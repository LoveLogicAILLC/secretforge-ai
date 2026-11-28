/**
 * Placeholder the API returns in place of the plaintext value when a secret is created.
 * The real value stays encrypted server-side and is only released by an authenticated
 * `GET /api/secrets/:id`, so it must never be written to disk as if it were a credential.
 */
export const ENCRYPTED_PLACEHOLDER = '[ENCRYPTED]';

export interface ProvisionedSecret {
  id: string;
  value: string;
}

/**
 * Validate the body of a `POST /api/secrets` response and return the provisioned secret.
 * Throws if the id or value is missing, or if the value is the encrypted placeholder.
 */
export function parseProvisionResponse(data: unknown): ProvisionedSecret {
  const secret = (data as { secret?: { id?: unknown; value?: unknown } } | null)?.secret;

  if (
    typeof secret?.id !== 'string' ||
    secret.id.length === 0 ||
    typeof secret.value !== 'string' ||
    secret.value.length === 0
  ) {
    throw new Error('Invalid secret response: missing secret id or value');
  }

  if (secret.value === ENCRYPTED_PLACEHOLDER) {
    throw new Error(
      'The API returned an encrypted placeholder instead of the key value, so nothing was written. ' +
        'Retrieve the key with an authenticated GET /api/secrets/:id.'
    );
  }

  return { id: secret.id, value: secret.value };
}

/**
 * Read a `POST /api/secrets` response, surfacing HTTP failures (for example a 401 from the
 * authenticated API) before the body is parsed and validated.
 */
export async function readProvisionResponse(response: Response): Promise<ProvisionedSecret> {
  if (!response.ok) {
    throw new Error(`Provisioning request failed: HTTP ${response.status} ${response.statusText}`);
  }
  return parseProvisionResponse(await response.json());
}
