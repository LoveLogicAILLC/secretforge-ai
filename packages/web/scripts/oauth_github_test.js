/*
Quick script to seed a sample GitHub OAuth config via the admin API
and then verify that the OAuth start endpoint returns a redirect.

Usage:
  BASE_URL=http://localhost:8794 ADMIN_TOKEN=local-admin node scripts/oauth_github_test.js
*/

(async () => {
  const baseUrl = process.env.BASE_URL || 'http://localhost:8794';
  const adminToken = process.env.ADMIN_TOKEN || 'local-admin';

  const provider = 'github';
  const config = {
    authorize_url: 'https://github.com/login/oauth/authorize',
    token_url: 'https://github.com/login/oauth/access_token',
    client_id: process.env.GITHUB_CLIENT_ID || 'dummy-client-id',
    client_secret: process.env.GITHUB_CLIENT_SECRET || 'dummy-client-secret',
    scopes: ['read:user', 'user:email'],
  };

  const adminEndpoint = `${baseUrl}/api/admin/oauth-config`;
  const oauthStart = `${baseUrl}/api/oauth/start?provider=${encodeURIComponent(provider)}&redirect=${encodeURIComponent(baseUrl)}`;

  const log = (...args) => console.log('[oauth-test]', ...args);

  try {
    // POST config
    log('POST config to', adminEndpoint);
    const postRes = await fetch(adminEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${adminToken}`,
      },
      body: JSON.stringify({ provider, config }),
    });
    let postBodyText = await postRes.text();
    let postJson;
    try { postJson = JSON.parse(postBodyText); } catch { postJson = { raw: postBodyText }; }
    log('POST status:', postRes.status);
    log('POST body:', postJson);

    if (!postRes.ok) {
      log('POST failed; aborting redirect check.');
      process.exit(1);
    }

    // GET start
    log('GET start at', oauthStart);
    const startRes = await fetch(oauthStart, { redirect: 'manual' });
    const location = startRes.headers.get('location');
    const startBodyText = await startRes.text();
    log('START status:', startRes.status);
    log('START location:', location);
    if (startRes.status >= 300 && startRes.status < 400 && location) {
      log('Redirect detected OK');
      process.exit(0);
    } else {
      log('No redirect. Body:', startBodyText);
      process.exit(2);
    }
  } catch (err) {
    console.error('[oauth-test] Error:', err);
    process.exit(99);
  }
})();
