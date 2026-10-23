"use client";

import { ReducedMotionProvider } from "@/lib/motion";
import { SmoothScroll } from "@/components/smooth-scroll";
import { WalletProvider } from "@/lib/wallet";
import { NetworkProvider } from "@/lib/network";
import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }): ReactNode {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <ReducedMotionProvider>
        <NetworkProvider>
          <WalletProvider>
            <SmoothScroll>{children}</SmoothScroll>
          </WalletProvider>
        </NetworkProvider>
      </ReducedMotionProvider>
    </ThemeProvider>
  );
}
