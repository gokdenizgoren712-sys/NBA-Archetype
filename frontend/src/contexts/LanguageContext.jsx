import { createContext, useContext, useState } from "react";
import { tr } from "../i18n/tr";
import { en } from "../i18n/en";

const TRANSLATIONS = { tr, en };

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [lang, setLang] = useState(
    () => localStorage.getItem("nba_lang") || "en"
  );

  const toggle = () => {
    const next = lang === "tr" ? "en" : "tr";
    localStorage.setItem("nba_lang", next);
    setLang(next);
  };

  const t = (key) => {
    const dict = TRANSLATIONS[lang] || tr;
    return dict[key] ?? TRANSLATIONS["en"][key] ?? key;
  };

  return (
    <LanguageContext.Provider value={{ lang, toggle, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLang() {
  return useContext(LanguageContext);
}
