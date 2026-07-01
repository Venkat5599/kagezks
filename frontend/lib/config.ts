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
  tagline: "Agents that pay. Leak nothing.",
  description:
    "Private payments for autonomous agents on Stellar. An agent pays in USDC under a scoped key it can't drain, with the amount, the recipient, and the agent→payee link hidden in zero-knowledge.",

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
  badge: "Live on Stellar testnet",
  headline: {
    line1: "Agents that pay.",
    line2: "Leak",
    accent: "nothing.",
  },
  subheadline:
    "On a public ledger, an autonomous agent's payments are a leak — every counterparty, every amount, your whole treasury map. Veil gives the agent a scoped key it can't drain, and seals each payment in zero-knowledge.",
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
      href: "https://stellar.expert/explorer/testnet/contract/CCM4HXQHSV36S74B2B6WOZ2HNPBYEC47EAWABQRBNRQZSRD6BUWU23YD",
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
