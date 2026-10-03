"use client";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useState } from "react";
import { UI_LANG_COOKIE, translate, type UiKey, type UiLang } from "@/lib/ui-i18n";

interface Ctx { lang: UiLang; t: (k: UiKey, v?: Record<string, string | number>) => string; setLang: (l: UiLang) => void }
const LangCtx = createContext<Ctx>({ lang: "en", t: (k) => translate("en", k), setLang: () => {} });

export function LangProvider({ initial, children }: { initial: UiLang; children: React.ReactNode }) {
  const [lang, setLangState] = useState<UiLang>(initial);
  const router = useRouter();
  const setLang = useCallback((l: UiLang) => {
    setLangState(l);
    document.cookie = `${UI_LANG_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
    document.documentElement.lang = l;
    router.refresh(); // re-render server components (share page) in the new language
  }, [router]);
  const t = useCallback((k: UiKey, v?: Record<string, string | number>) => translate(lang, k, v), [lang]);
  return <LangCtx.Provider value={{ lang, t, setLang }}>{children}</LangCtx.Provider>;
}

export const useT = () => useContext(LangCtx);

export function LangToggle() {
  const { lang, setLang, t } = useT();
  return (
    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setLang(lang === "tr" ? "en" : "tr")} aria-label="Switch language / Dili değiştir">
      🌐 {t("lang.switch")}
    </button>
  );
}

export function Nav() {
  const { t } = useT();
  return (
    <nav className="nav" aria-label="Main">
      <a href="/">{t("nav.create")}</a>
      <a href="/import">{t("nav.import")}</a>
      <a href="/me">{t("nav.taste")}</a>
      <LangToggle />
    </nav>
  );
}

export function Footer() {
  const { t } = useT();
  const feedback = process.env.NEXT_PUBLIC_FEEDBACK_URL;
  return (
    <footer className="footer">
      {t("footer")}
      {feedback && <> · <a href={feedback} target="_blank" rel="noopener noreferrer">{t("footer.feedback")}</a></>}
    </footer>
  );
}
