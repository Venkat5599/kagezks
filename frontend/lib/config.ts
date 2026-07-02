/**
 * ============================================================================
 * SITE CONFIGURATION — Veil
 * ============================================================================
 *
 * Private payments for autonomous agents on Stellar. All marketing copy is centralized here.
 */

export const siteConfig = {
  // Brand
  name: "Veil",
  tagline: "Agent payments, proven in zero-knowledge.",
  description:
    "Zero-knowledge payments for autonomous agents on Stellar. Every payment is a Groth16 proof (Poseidon commitments, Merkle membership, nullifiers, BN254 verifier) — who was paid, how much, and the agent→payee link never touch the chain. The agent pays under a scoped key it can't drain.",

  // URLs
  url: "https://veil-pay.vercel.app",
  twitter: "@veilpay",

  // Navigation
  nav: {
    cta: {
      text: "Read the docs",
      href: "#how-it-works",
    },
    signIn: {
      text: "GitHub",
      href: "#",
    },
  },
};

export const heroConfig = {
  badge: "Real-World ZK · Live on Stellar testnet",
  headline: {
    line1: "Agent payments,",
    line2: "proven in",
    accent: "zero-knowledge.",
  },
  subheadline:
    "Every payment is a Groth16 proof: the payee proves it owns an unspent note in the pool without revealing which — so who was paid, how much, and the agent→payee link never touch the chain. Verified on-chain over BN254, enforced by math, not a custodian.",
  cta: {
    text: "See how it works",
    href: "#how-it-works",
  },
};

export const blurHeadlineConfig = {
  text: "Let an AI agent pay on a transparent chain and you publish its every counterparty, every amount, and a map of everything your treasury touches. Veil seals all of it — and bounds the agent so it can never drain you — enforced by math and the chain, not by trusting a custodian.",
};

export const howItWorksConfig = {
  title: "How it works",
  description:
    "A payee shares a scan key once. The agent pays into a shielded pool under a scoped key; the payee withdraws to a fresh stealth address. The chain never links the two.",
  cta: {
    text: "Read the architecture",
    href: "https://github.com",
  },
};

export const faqConfig = {
  title: "What judges usually ask",
  description: "The honest version — scope, trust assumptions, and why ZK is load-bearing.",
  cta: {
    primary: {
      text: "View on GitHub",
      href: "#",
    },
    secondary: {
      text: "View the contract",
      href: "https://stellar.expert/explorer/testnet/contract/CBRM3RK26Q3KLZC2KYRQ5OZ2HLCN7SV5A7EZMCUC27GL7QXUS32UB76B",
    },
  },
};

export const footerConfig = {
  cta: {
    headline: "Agent payments you can trust — and no one can read.",
    placeholder: "you@company.com",
    button: "Get early access",
  },
  copyright: `© ${new Date().getFullYear()} Veil. Stellar Hacks · Real-World ZK.`,
};

/**
 * ============================================================================
 * FEATURE FLAGS
 * ============================================================================
 */

export const features = {
  smoothScroll: true,
  parallaxHero: true,
  blurInHeadline: true,
};

/**
 * ============================================================================
 * THEME CONFIGURATION
 * ============================================================================
 */

export const themeConfig = {
  defaultTheme: "system" as "light" | "dark" | "system",
  enableSystemTheme: true,
};
