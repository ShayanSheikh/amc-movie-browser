import type { Metadata } from "next";
import Link from "next/link";
import { Geist } from "next/font/google";
import { amcMode } from "@/lib/amc";
import "./globals.css";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "AMC Showtimes",
  description: "Track showtimes for movies you care about at your local AMCs",
};

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/", label: "Dashboard" },
  { href: "/movies", label: "Movies" },
  { href: "/theatres", label: "Theatres" },
  { href: "/settings", label: "Settings" },
];

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const mode = amcMode();
  return (
    <html lang="en">
      <body className={`${geist.variable} antialiased`}>
        <header className="border-b border-zinc-200 dark:border-zinc-800">
          <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
            <Link href="/" className="text-lg font-semibold">
              🍿 AMC Showtimes
            </Link>
            <nav className="flex gap-1 text-sm">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} className="rounded-md px-2.5 py-1.5 hover:bg-zinc-100 dark:hover:bg-zinc-800">
                  {n.label}
                </Link>
              ))}
            </nav>
            <span
              title={mode === "mock" ? "Using fake fixture data. Set AMC_API_KEY to go live." : "Using the live AMC API"}
              className={`ml-auto rounded-full px-2 py-0.5 text-xs font-medium ${
                mode === "mock"
                  ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300"
                  : "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
              }`}
            >
              {mode === "mock" ? "Mock data" : "Live API"}
            </span>
          </div>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
