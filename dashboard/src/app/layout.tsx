import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Veridex Pay — Agent Dashboard",
  description:
    "Universal Agent Payment Protocol — Live dashboard for autonomous AI agent payments on Solana",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased min-h-screen bg-background text-foreground`}
      >
        <nav className="border-b border-card-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-2">
              <span className="text-lg font-bold bg-gradient-to-r from-accent to-purple-400 bg-clip-text text-transparent">
                Veridex Pay
              </span>
              <span className="text-xs text-muted bg-card border border-card-border rounded px-1.5 py-0.5">
                hackathon
              </span>
            </Link>
            <div className="flex items-center gap-4">
              <Link
                href="/"
                className="text-sm text-muted hover:text-foreground transition"
              >
                Dashboard
              </Link>
              <Link
                href="/setup"
                className="text-sm text-muted hover:text-foreground transition"
              >
                Setup
              </Link>
              <a
                href="https://github.com/Veridex-Protocol/veridex-colosseum-agent-hackathon"
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-muted hover:text-foreground transition"
              >
                GitHub
              </a>
            </div>
          </div>
        </nav>
        <main className="max-w-7xl mx-auto px-4 py-6">{children}</main>
        <footer className="border-t border-card-border mt-12 py-6 text-center text-muted text-xs">
          <p>
            Powered by{" "}
            <span className="text-accent-light">@veridex/agentic-payments</span>{" "}
            SDK
          </p>
          <p className="mt-1">
            x402 · UCP · ACP · AP2 — Multi-Protocol Payment Detection
          </p>
          <p className="mt-1">Colosseum Agent Hackathon 2026</p>
        </footer>
      </body>
    </html>
  );
}
