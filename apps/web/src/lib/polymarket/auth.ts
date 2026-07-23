/**
 * Polymarket CLOB API credential derivation via EIP-712 typed data signing.
 *
 * Flow: user connects wallet → signs a typed-data message (no tx, no gas) →
 * signature is sent to CLOB API to derive an API key + secret bound to
 * that wallet address.
 *
 * Credentials are session-scoped (sessionStorage) — cleared on tab close.
 * The backend never sees these credentials.
 */

const CLOB_BASE = "https://clob.polymarket.com";

const CLOB_AUTH_DOMAIN = {
  name: "ClobAuthDomain",
  version: "1",
  chainId: 137, // Polygon
} as const;

const CLOB_AUTH_TYPES = {
  ClobAuth: [
    { name: "address", type: "address" },
    { name: "timestamp", type: "string" },
    { name: "nonce", type: "uint256" },
    { name: "message", type: "string" },
  ],
} as const;

export type ClobCredentials = {
  apiKey: string;
  secret: string;
  passphrase: string;
};

const STORAGE_KEY = "plebs_clob_creds";

export function getCachedCredentials(): ClobCredentials | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as ClobCredentials;
  } catch {
    return null;
  }
}

function cacheCredentials(creds: ClobCredentials): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(creds));
  } catch {
    // sessionStorage full or unavailable
  }
}

export function clearCredentials(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(STORAGE_KEY);
}

export async function deriveClobCredentials(
  address: `0x${string}`,
  signTypedDataAsync: (args: {
    domain: typeof CLOB_AUTH_DOMAIN;
    types: typeof CLOB_AUTH_TYPES;
    primaryType: "ClobAuth";
    message: Record<string, unknown>;
  }) => Promise<`0x${string}`>,
): Promise<ClobCredentials> {
  const cached = getCachedCredentials();
  if (cached) return cached;

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = 0;
  const message = "This signature is safe and will not trigger a transaction or incur gas fees.";

  const signature = await signTypedDataAsync({
    domain: CLOB_AUTH_DOMAIN,
    types: CLOB_AUTH_TYPES,
    primaryType: "ClobAuth",
    message: {
      address,
      timestamp,
      nonce,
      message,
    },
  });

  const resp = await fetch(`${CLOB_BASE}/auth/derive-api-key`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      address,
      signature,
      timestamp,
      nonce: Number(nonce),
    }),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`CLOB auth failed (${resp.status}): ${text}`);
  }

  const data = await resp.json();
  const creds: ClobCredentials = {
    apiKey: data.apiKey,
    secret: data.secret,
    passphrase: data.passphrase,
  };

  cacheCredentials(creds);
  return creds;
}
