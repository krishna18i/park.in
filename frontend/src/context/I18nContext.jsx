import { createContext, useCallback, useContext, useMemo, useState } from "react";
import en from "../i18n/en.json";
import hi from "../i18n/hi.json";
import mr from "../i18n/mr.json";
import ta from "../i18n/ta.json";
import pa from "../i18n/pa.json";
import { DEFAULT_LANG, LANGUAGES, isLang, langMeta } from "../i18n/languages";

const DICTS = { en, hi, mr, ta, pa };
const STORAGE_KEY = "parkin.lang";

const I18nContext = createContext(null);

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return isLang(saved) ? saved : DEFAULT_LANG;
  });

  const setLang = useCallback((next) => {
    const value = isLang(next) ? next : DEFAULT_LANG;
    localStorage.setItem(STORAGE_KEY, value);
    setLangState(value);
    document.documentElement.lang = value;
  }, []);

  // Look a key up in an explicit language. The picker uses this to preview a
  // language before the driver commits to it.
  const tIn = useCallback((code, key, vars) => {
    const dict = DICTS[code] || en;
    let text = dict[key] ?? en[key] ?? key;
    if (vars) {
      for (const [name, value] of Object.entries(vars)) {
        text = text.replaceAll(`{${name}}`, String(value));
      }
    }
    return text;
  }, []);

  const t = useCallback((key, vars) => tIn(lang, key, vars), [lang, tIn]);

  const value = useMemo(
    () => ({
      lang,
      setLang,
      t,
      tIn,
      languages: LANGUAGES,
      meta: langMeta(lang),
    }),
    [lang, setLang, t, tIn],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside <I18nProvider>");
  return ctx;
}
