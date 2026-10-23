// The rules for the wallets kept in this browser, separate from React so they can be
// tested. Two wallets live side by side: one generated in the browser (its secret key
// exists only here) and a Freighter address. Nothing here ever overwrites a key.
export type WalletKind = "generated" | "freighter";

export type KeyStore = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export const KEYS = {
  legacyPub: "kage_owner",
  legacySecret: "kage_owner_secret",
  legacyReal: "kage_owner_real",
  genPub: "kage_gen_pub",
  genSecret: "kage_gen_secret",
  freighter: "kage_freighter_addr",
  active: "kage_active_wallet",
  sessionToken: "kage_session_token",
  sessionId: "kage_session_id",
} as const;

export type WalletState = { genPub: string | null; genSec: string | null; freighter: string | null; active: WalletKind | null };

/**
 * One-time move from the old single-slot layout (kage_owner*). A wallet created before
 * the two-wallet layout is carried over, never dropped. A legacy entry is only copied
 * when no newer layout exists yet, so an existing generated key can't be replaced.
 */
export function migrateLegacy(store: KeyStore): void {
  const legacy = store.getItem(KEYS.legacyPub);
  if (legacy && !store.getItem(KEYS.active)) {
    const legacySec = store.getItem(KEYS.legacySecret);
    if (store.getItem(KEYS.legacyReal) === "1") {
      store.setItem(KEYS.freighter, legacy);
      store.setItem(KEYS.active, "freighter");
    } else if (legacySec && !store.getItem(KEYS.genSecret)) {
      store.setItem(KEYS.genPub, legacy);
      store.setItem(KEYS.genSecret, legacySec);
      store.setItem(KEYS.active, "generated");
    }
  }
  // Only remove the legacy slot once its key is safely stored in the new one.
  const legacySec = store.getItem(KEYS.legacySecret);
  if (!legacySec || store.getItem(KEYS.genSecret) === legacySec || store.getItem(KEYS.legacyReal) === "1") {
    store.removeItem(KEYS.legacyPub);
    store.removeItem(KEYS.legacySecret);
    store.removeItem(KEYS.legacyReal);
  }
}

/** Which wallet to show: the one picked last time if it still exists, else whichever exists. */
export function pickActive(want: string | null, hasGenerated: boolean, hasFreighter: boolean): WalletKind | null {
  if (want === "generated" && hasGenerated) return "generated";
  if (want === "freighter" && hasFreighter) return "freighter";
  if (hasGenerated) return "generated";
  if (hasFreighter) return "freighter";
  return null;
}

export function loadWallets(store: KeyStore): WalletState {
  migrateLegacy(store);
  const gp = store.getItem(KEYS.genPub);
  const gs = store.getItem(KEYS.genSecret);
  const fr = store.getItem(KEYS.freighter) || null;
  const hasGen = !!(gp && gs);
  return { genPub: hasGen ? gp : null, genSec: hasGen ? gs : null, freighter: fr, active: pickActive(store.getItem(KEYS.active), hasGen, !!fr) };
}

export function saveActive(store: KeyStore, kind: WalletKind | null): void {
  if (kind) store.setItem(KEYS.active, kind);
  else store.removeItem(KEYS.active);
}

/** Store a new generated wallet. Refuses when one already exists: replacing it would strand its funds. */
export function saveGenerated(store: KeyStore, pub: string, secret: string): boolean {
  if (store.getItem(KEYS.genSecret)) return false;
  store.setItem(KEYS.genPub, pub);
  store.setItem(KEYS.genSecret, secret);
  saveActive(store, "generated");
  return true;
}

export function saveFreighter(store: KeyStore, address: string): void {
  store.setItem(KEYS.freighter, address);
  saveActive(store, "freighter");
}

/** Forget one wallet in this browser (nothing on chain changes) and return the wallet to show next. */
export function forgetWallet(store: KeyStore, kind: WalletKind, state: WalletState): WalletState {
  if (kind === "generated") {
    store.removeItem(KEYS.genPub);
    store.removeItem(KEYS.genSecret);
    // The per-user agent session was provisioned by this wallet's key.
    store.removeItem(KEYS.sessionToken);
    store.removeItem(KEYS.sessionId);
    const active = state.active === "generated" ? (state.freighter ? "freighter" : null) : state.active;
    saveActive(store, active);
    return { ...state, genPub: null, genSec: null, active };
  }
  store.removeItem(KEYS.freighter);
  const active = state.active === "freighter" ? (state.genPub ? "generated" : null) : state.active;
  saveActive(store, active);
  return { ...state, freighter: null, active };
}

/**
 * Forgetting the generated wallet deletes the only copy of its key, so the user must
 * prove they saved it: the last 4 characters of the secret, case-insensitive.
 */
export function canForgetGenerated(secret: string | null, typed: string): boolean {
  if (!secret || secret.length < 4) return false;
  return typed.trim().toUpperCase() === secret.slice(-4).toUpperCase();
}
