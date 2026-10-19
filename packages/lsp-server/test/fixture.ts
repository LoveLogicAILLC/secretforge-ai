/**
 * Builds the scanner fixture at runtime.
 *
 * The credentials below are assembled here rather than committed as literals.
 * Detection needs realistic, high-entropy values, and a file containing those
 * is indistinguishable from a real leak — GitHub push protection blocks it,
 * and any scanner pointed at this repo reports it. Generating them keeps the
 * repository free of credential-shaped strings while still giving the server
 * genuine input.
 *
 * The generator is seeded, so every run produces the same document and test
 * failures stay reproducible.
 */

/** Deterministic PRNG (mulberry32) — no credential should depend on Math.random. */
function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const UPPER_NUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const ALPHA_NUM = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
const LOWER_NUM = "abcdefghijklmnopqrstuvwxyz0123456789";

/**
 * Markers the server's placeholder filter rejects. Generated values must avoid
 * them, otherwise the fixture would be silently filtered out and the tests
 * would assert nothing.
 */
const PLACEHOLDER_MARKERS = [
  "your-key", "your_key", "yourkey", "your-api", "your_api", "placeholder",
  "example", "changeme", "change-me", "replace-me", "replace_me", "insert-key",
  "dummy", "sample", "todo", "fixme", "xxxxx", "aaaaa", "12345", "abcdef",
  "<your", "test-key", "fake", "notreal", "redacted",
];

function isFiltered(value: string): boolean {
  const lower = value.toLowerCase();
  return PLACEHOLDER_MARKERS.some((marker) => lower.includes(marker));
}

export interface Fixture {
  /** Full document text to hand to textDocument/didOpen. */
  text: string;
  /** The generated credentials, keyed by the label used in assertions. */
  credentials: Record<string, string>;
}

export function buildFixture(seed = 0x5ec4e7): Fixture {
  const random = seededRandom(seed);

  const draw = (charset: string, length: number): string => {
    let out = "";
    for (let i = 0; i < length; i++) {
      out += charset[Math.floor(random() * charset.length)];
    }
    return out;
  };

  // Retry until the value clears the placeholder filter, so a generated
  // "abcdef" run cannot silently disable a test case.
  const make = (prefix: string, charset: string, length: number): string => {
    for (let attempt = 0; attempt < 100; attempt++) {
      const candidate = prefix + draw(charset, length);
      if (!isFiltered(candidate)) return candidate;
    }
    throw new Error(`Could not generate a clean value for prefix "${prefix}"`);
  };

  const credentials: Record<string, string> = {
    aws: make("AKIA", UPPER_NUM, 16),
    stripeLive: make("sk_live_", ALPHA_NUM, 28),
    stripeTest: make("sk_test_", ALPHA_NUM, 28),
    openai: make("sk-", ALPHA_NUM, 48),
    anthropic: make("sk-ant-api03-", ALPHA_NUM, 60),
    github: make("ghp_", ALPHA_NUM, 36),
    google: make("AIza", ALPHA_NUM, 35),
    slack: make("xoxb-", LOWER_NUM, 24),
    sendgrid: `${make("SG.", ALPHA_NUM, 22)}.${draw(ALPHA_NUM, 43)}`,
    generic: make("", ALPHA_NUM, 32),
  };

  const text = `// Generated fixture — every credential here is random and inert.
// Regenerate with: pnpm --filter @secretforge/lsp-server fixture

// --- Expected: Error diagnostics ---
const awsKey = "${credentials.aws}";
const stripeLive = "${credentials.stripeLive}";
const openaiKey = "${credentials.openai}";
const anthropicKey = "${credentials.anthropic}";
const githubToken = "${credentials.github}";
const googleKey = "${credentials.google}";
const slackToken = "${credentials.slack}";
const sendgridKey = "${credentials.sendgrid}";

// --- Expected: Warning diagnostics ---
const stripeTest = "${credentials.stripeTest}";
const serviceConfig = { api_key: "${credentials.generic}" };

// --- Expected: no diagnostics ---

// Read from the environment rather than embedded.
const fromEnv = process.env.STRIPE_API_KEY;

// Caught by the placeholder filter.
const placeholder = "your-api-key-here";

// AWS publishes this key in its own documentation. The AWS regex matches it,
// so this asserts the placeholder filter runs after the pattern.
const docsKey = "AKIAIOSFODNN7EXAMPLE";

// Caught by the entropy gate — repeated characters are not credentials.
const lowEntropy = { api_key: "aaaaaaaaaaaaaaaaaaaaaaaa" };
`;

  return { text, credentials };
}
