import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import enTranslations from "./locales/en.json";
import urTranslations from "./locales/ur.json";

const savedLang = typeof window !== "undefined" ? localStorage.getItem("mms_lang") || "en" : "en";
if (typeof document !== "undefined") {
  document.documentElement.dir = savedLang === "ur" || savedLang === "ar" ? "rtl" : "ltr";
  document.documentElement.lang = savedLang;
}

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: {
        translation: enTranslations,
      },
      ur: {
        translation: urTranslations,
      },
    },
    lng: savedLang,
    fallbackLng: "en",
    react: { useSuspense: false },
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
