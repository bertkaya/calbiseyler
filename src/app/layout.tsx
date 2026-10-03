import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Music Sommelier",
  description: "AI that understands why you want music and designs the listening experience around it.",
  applicationName: "AI Music Sommelier",
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbf7f2" },
    { media: "(prefers-color-scheme: dark)", color: "#120e0d" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght,SOFT@9..144,500..700,0..100&family=Manrope:wght@400..800&display=swap"
        />
      </head>
      <body>
        <div className="shell">
          <header className="topbar">
            <Link href="/" className="brand" aria-label="AI Music Sommelier — home">
              <span className="brand-mark" aria-hidden>♪</span>
              <span>Sommelier</span>
            </Link>
            <nav className="nav" aria-label="Main">
              <Link href="/">Create</Link>
              <Link href="/import">Import</Link>
              <Link href="/me">Taste</Link>
            </nav>
          </header>
          {children}
          <footer className="footer">
            AI Music Sommelier · Playlists are experiences, not lists. · Track features are editorial estimates.
          </footer>
        </div>
      </body>
    </html>
  );
}
