import { Footer } from "@/components/footer";
import { Hero } from "@/components/hero";
import { VeilLanding } from "@/components/veil-landing";
import { createMetadata, siteConfig } from "@/lib/metadata";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = createMetadata({
  title: "Veil — Send money, reveal nothing",
  description: `${siteConfig.name}. ${siteConfig.description}`,
  path: "/",
});

export default function HomePage(): ReactNode {
  return (
    <main id="main-content" className="flex-1">
      <Hero />
      <VeilLanding />
      <Footer />
    </main>
  );
}
