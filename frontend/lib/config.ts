/**
 * ============================================================================
 * SITE CONFIGURATION — Kage
 * ============================================================================
 *
 * Private payments for autonomous agents on Stellar. All marketing copy is centralized here.
 */

export const siteConfig = {
  // Brand
  name: "Kage",
  tagline: "Agent payments, proven in zero-knowledge.",
  description:
    "Stellar tools and private payments for AI agents. Assistants read wallets, prices and transactions through Kage's MCP servers, and pay through a scoped key they can't drain into a Groth16 pool that hides who they paid.",

  // URLs
  url: "https://kageai.me",
  twitter: "@Kage_stellar",

  // Navigation
  nav: {
    cta: {
      text: "Read the docs",
      href: "#how-it-works",
    },
    signIn: {
      text: "GitHub",
      href: "https://github.com/Venkat5599/kagezks",
    },
  },
};

export const heroConfig = {
  badge: "Live on Stellar mainnet",
  headline: {
    line1: "Agent payments,",
    line2: "proven in",
    accent: "zero-knowledge.",
  },
  subheadline:
    "Kage gives AI agents what they need on Stellar: live tools to read wallets, prices and transactions, and a way to pay through a key they can't drain. Each payment settles through a zero-knowledge pool, so the chain never learns who the agent paid.",
  cta: {
    text: "See how it works",
    href: "#how-it-works",
  },
};

export const blurHeadlineConfig = {
  text: "Let an AI agent pay on a transparent chain and you publish its every counterparty, every amount, and a map of everything your treasury touches. Kage hides who paid whom and bounds the agent so it can never drain you, enforced by math and the chain rather than a custodian.",
};

export const howItWorksConfig = {
  title: "How it works",
  description:
    "A payee shares a scan key once. The agent pays into a shielded pool under a scoped key; the payee withdraws to a fresh stealth address. The chain never links the two.",
  cta: {
    text: "Read the architecture",
    href: "https://github.com/Venkat5599/kagezks",
  },
};

export const faqConfig = {
  title: "Frequently asked questions",
  description: "The honest version: scope, trust assumptions, and why ZK is load-bearing.",
  cta: {
    primary: {
      text: "View on GitHub",
      href: "https://github.com/Venkat5599/kagezks",
    },
    secondary: {
      text: "View the contract",
      href: "https://stellar.expert/explorer/public/contract/CAEEKIMKQVRDX6NH2RZIRGWOUF4VDGL6OPF2MGNQ3V2TIGPYJNDGIXLV",
    },
  },
};

export const footerConfig = {
  cta: {
    headline: "Agent payments you can trust, and no one can read.",
    placeholder: "you@company.com",
    button: "Get early access",
  },
  copyright: `© ${new Date().getFullYear()} Kage`,
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
