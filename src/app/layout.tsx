import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: { default: "tty.store – apps for your terminal", template: "%s – tty.store" },
  description: "Browse command-line tools by category, check supported systems, and install with one command.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans text-[15px] leading-relaxed">
        <a
          href="#main"
          className="sr-only z-50 bg-ink px-3 py-2 text-bg focus:not-sr-only focus:fixed focus:left-4 focus:top-3"
        >
          Skip to content
        </a>
        <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur supports-[backdrop-filter]:bg-bg/75">
          <div className="mx-auto flex h-14 max-w-[1120px] items-center justify-between px-[clamp(16px,4vw,32px)]">
            <Link href="/" className="font-mono font-bold tracking-tight">
              tty<i className="not-italic text-accent">.</i>store
            </Link>
            <nav className="flex gap-5 text-sm text-mute">
              <Link href="/" className="transition-colors hover:text-ink">Apps</Link>
              <a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
                className="transition-colors hover:text-ink"
              >
                Submit an app <span aria-hidden="true">↗</span>
              </a>
            </nav>
          </div>
        </header>
        <main id="main" className="mx-auto w-full max-w-[1120px] flex-1 px-[clamp(16px,4vw,32px)] pb-18">
          {children}
        </main>
        <footer className="border-t border-line py-6 text-[13px] text-mute">
          <div className="mx-auto max-w-[1120px] px-[clamp(16px,4vw,32px)]">
            tty.store is a demo catalog. App data is a snapshot from the catalog database; GitHub figures may be stale.
          </div>
        </footer>
      </body>
    </html>
  );
}
