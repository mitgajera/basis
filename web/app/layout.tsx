import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const sans = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  display: "swap",
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "basis. | cross-venue funding rate vault",
    template: "%s · basis.",
  },
  description: "Delta-neutral funding-rate yield on Solana. Cross-venue spreads, hedged in real time.",
  openGraph: {
    title: "basis.",
    description: "Delta-neutral funding-rate yield on Solana.",
    type: "website",
  },
  twitter: { card: "summary_large_image", title: "basis.", description: "Delta-neutral funding-rate yield on Solana." },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`dark ${sans.variable} ${mono.variable}`}>
      <body className="bg-bg-base text-text-primary min-h-screen font-sans antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
