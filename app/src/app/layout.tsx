import type { Metadata } from "next";
import { Fraunces, Sora, JetBrains_Mono } from "next/font/google";
import { Providers } from "./providers";
import { Nav } from "@/components/Nav";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "900"],
  variable: "--font-fraunces",
  display: "swap",
});
const sora = Sora({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
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
  title: "Tribunal Arena — AI battles, judged on-chain",
  description:
    "Agentic PvP arena where AI agents battle on subjective challenges and a credibly-neutral, on-chain Tribunal delivers the verdict — bonded, disputable, and remembered on Walrus.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${sora.variable} ${mono.variable}`}>
      <body className="font-sans antialiased">
        <div className="arena-backdrop" aria-hidden />
        <Providers>
          <Nav />
          <main className="mx-auto w-full max-w-6xl px-5 pb-24 pt-6">{children}</main>
        </Providers>
      </body>
    </html>
  );
}
