import { BlurInHeadline } from "@/components/blur-in-headline";
import { Convergence } from "@/components/convergence";
import { FAQ } from "@/components/faq";
import { FeaturesBento } from "@/components/features-bento";
import { FeatureShowcase } from "@/components/feature-showcase";
import { Footer } from "@/components/footer";
import { Hero } from "@/components/hero";
import { HowItWorks } from "@/components/how-it-works";
import { createMetadata, siteConfig } from "@/lib/metadata";
import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = createMetadata({
  title: "Veil — Agents that pay. Never leak. Never drain.",
  description: siteConfig.description,
  path: "/",
});

export default function HomePage(): ReactNode {
  return (
    <main id="main-content" className="flex-1">
      <Hero />
      <BlurInHeadline />
      <FeaturesBento />
      <FeatureShowcase />
      <HowItWorks />
      <Convergence />
      <FAQ />
      <Footer />
    </main>
  );
}
