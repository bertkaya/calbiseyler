import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { cookies, headers } from "next/headers";
import { Footer, LangProvider, Nav } from "@/components/LangProvider";
import { UI_LANG_COOKIE, pickLang } from "@/lib/ui-i18n";
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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const lang = pickLang((await cookies()).get(UI_LANG_COOKIE)?.value, (await headers()).get("accept-language"));
  return (
    <html lang={lang}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght,SOFT@9..144,500..700,0..100&family=Manrope:wght@400..800&display=swap"
        />
      </head>
      <body>
        <LangProvider initial={lang}>
          <div className="shell">
            <header className="topbar">
              <Link href="/" className="brand" aria-label="AI Music Sommelier">
                <span className="brand-mark" aria-hidden>♪</span>
                <span>Sommelier</span>
              </Link>
              <Nav />
            </header>
            {children}
            <Footer />
          </div>
        </LangProvider>
      </body>
    </html>
  );
}
