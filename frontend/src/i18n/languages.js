/**
 * Every language Park.in ships. `code` is what we persist and key dictionaries
 * by; `label` is what the picker shows (always in that language's own script so
 * a driver can find their language without reading English).
 */
export const LANGUAGES = [
  { code: "en", label: "English", english: "English", speech: "en-IN", locale: "en-IN" },
  { code: "hi", label: "हिन्दी", english: "Hindi", speech: "hi-IN", locale: "hi-IN" },
  { code: "mr", label: "मराठी", english: "Marathi", speech: "mr-IN", locale: "mr-IN" },
  { code: "ta", label: "தமிழ்", english: "Tamil", speech: "ta-IN", locale: "ta-IN" },
  { code: "pa", label: "ਪੰਜਾਬੀ", english: "Punjabi", speech: "pa-IN", locale: "pa-IN" },
];

export const DEFAULT_LANG = "en";

const BY_CODE = Object.fromEntries(LANGUAGES.map((item) => [item.code, item]));

export function isLang(code) {
  return Object.hasOwn(BY_CODE, code);
}

export function langMeta(code) {
  return BY_CODE[code] || BY_CODE[DEFAULT_LANG];
}
