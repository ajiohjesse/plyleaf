// The languages OCR PDF offers, by Tesseract's codes, and which to start with. Each needs its @tesseract.js-data
// package as a dependency (scripts/ocr-data.ts serves the data). Pure, for the page and tests.

export type LanguageCode =
  | "ara"
  | "ces"
  | "chi_sim"
  | "chi_tra"
  | "deu"
  | "ell"
  | "eng"
  | "fra"
  | "heb"
  | "hin"
  | "ind"
  | "ita"
  | "jpn"
  | "kor"
  | "nld"
  | "pol"
  | "por"
  | "rus"
  | "spa"
  | "swe"
  | "tur"
  | "ukr"
  | "vie";

export interface Language {
  code: LanguageCode;
  /** Its name in English… */
  name: string;
  /** …and in itself. */
  native: string;
  /** The BCP 47 language its users' browsers ask for. */
  bcp47: string;
  /** Its reading data, roughly, in MB (what the first use downloads). */
  size: number;
}

/** In order of their English names. */
export const LANGUAGES: readonly Language[] = [
  { code: "ara", name: "Arabic", native: "العربية", bcp47: "ar", size: 1.7 },
  { code: "chi_sim", name: "Chinese (Simplified)", native: "简体中文", bcp47: "zh-Hans", size: 1.7 },
  { code: "chi_tra", name: "Chinese (Traditional)", native: "繁體中文", bcp47: "zh-Hant", size: 1.7 },
  { code: "ces", name: "Czech", native: "Čeština", bcp47: "cs", size: 2.2 },
  { code: "nld", name: "Dutch", native: "Nederlands", bcp47: "nl", size: 3.0 },
  { code: "eng", name: "English", native: "English", bcp47: "en", size: 3.0 },
  { code: "fra", name: "French", native: "Français", bcp47: "fr", size: 0.7 },
  { code: "deu", name: "German", native: "Deutsch", bcp47: "de", size: 1.3 },
  { code: "ell", name: "Greek", native: "Ελληνικά", bcp47: "el", size: 1.3 },
  { code: "heb", name: "Hebrew", native: "עברית", bcp47: "he", size: 0.6 },
  { code: "hin", name: "Hindi", native: "हिन्दी", bcp47: "hi", size: 1.4 },
  { code: "ind", name: "Indonesian", native: "Bahasa Indonesia", bcp47: "id", size: 1.2 },
  { code: "ita", name: "Italian", native: "Italiano", bcp47: "it", size: 1.7 },
  { code: "jpn", name: "Japanese", native: "日本語", bcp47: "ja", size: 2.0 },
  { code: "kor", name: "Korean", native: "한국어", bcp47: "ko", size: 1.6 },
  { code: "pol", name: "Polish", native: "Polski", bcp47: "pl", size: 2.6 },
  { code: "por", name: "Portuguese", native: "Português", bcp47: "pt", size: 1.4 },
  { code: "rus", name: "Russian", native: "Русский", bcp47: "ru", size: 2.7 },
  { code: "spa", name: "Spanish", native: "Español", bcp47: "es", size: 2.1 },
  { code: "swe", name: "Swedish", native: "Svenska", bcp47: "sv", size: 2.5 },
  { code: "tur", name: "Turkish", native: "Türkçe", bcp47: "tr", size: 2.1 },
  { code: "ukr", name: "Ukrainian", native: "Українська", bcp47: "uk", size: 2.1 },
  { code: "vie", name: "Vietnamese", native: "Tiếng Việt", bcp47: "vi", size: 1.4 },
];

/** At most this many languages are read at once: each slows reading down and adds its data to download. */
export const MAX_LANGUAGES = 3;

/**
 * The languages to start with: the browser's own languages that we have, then English, at most two in all (a
 * document in a reader's language often has English in it too).
 */
export function startingLanguages(browser: readonly string[]): LanguageCode[] {
  const chosen: LanguageCode[] = [];
  for (const tag of browser) {
    const language = matchLanguage(tag);
    if (language && !chosen.includes(language)) chosen.push(language);
    if (chosen.length >= 1) break;
  }
  if (!chosen.includes("eng")) chosen.push("eng");
  return chosen.slice(0, 2);
}

/** Ours for a BCP 47 tag ("pt-BR" → Portuguese; "zh-TW" and "zh-HK" → Traditional Chinese), or null. */
export function matchLanguage(tag: string): LanguageCode | null {
  const lower = tag.toLowerCase();
  if (lower.startsWith("zh")) {
    return /hant|-tw|-hk|-mo/.test(lower) ? "chi_tra" : "chi_sim";
  }
  const primary = lower.split("-")[0];
  if (primary === "iw") return "heb";
  if (primary === "in") return "ind";
  return LANGUAGES.find((language) => language.bcp47 === primary)?.code ?? null;
}
