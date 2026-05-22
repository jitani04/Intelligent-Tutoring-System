export type FontSize = "small" | "medium" | "large";
export type FontFamily = "sans" | "inter" | "newsreader" | "lora" | "mono" | "system";
export type LineSpacing = "compact" | "normal" | "relaxed" | "wide";
export type LetterSpacing = "tight" | "normal" | "wide";
export type ContentWidth = "narrow" | "medium" | "wide";

const FONT_SIZE_KEY = "sapient-font-size";
const FONT_FAMILY_KEY = "sapient-font-family";
const BIONIC_KEY = "sapient-bionic";
const LINE_SPACING_KEY = "sapient-line-spacing";
const LETTER_SPACING_KEY = "sapient-letter-spacing";
const CONTENT_WIDTH_KEY = "sapient-content-width";

const FONT_SIZE_VALUES: Record<FontSize, string> = {
  small: "14px",
  medium: "16px",
  large: "18px",
};

const FONT_FAMILY_VALUES: Record<FontFamily, string> = {
  sans: '"Instrument Sans", "Avenir Next", system-ui, sans-serif',
  inter: '"Inter", system-ui, sans-serif',
  newsreader: '"Newsreader", Georgia, serif',
  lora: '"Lora", Georgia, serif',
  mono: 'ui-monospace, "SF Mono", Consolas, "Courier New", monospace',
  system: 'system-ui, -apple-system, sans-serif',
};

const LINE_SPACING_VALUES: Record<LineSpacing, string> = {
  compact: "1.45",
  normal: "1.68",
  relaxed: "1.9",
  wide: "2.15",
};

const LETTER_SPACING_VALUES: Record<LetterSpacing, string> = {
  tight: "-0.01em",
  normal: "0em",
  wide: "0.04em",
};

const CONTENT_WIDTH_VALUES: Record<ContentWidth, string> = {
  narrow: "600px",
  medium: "800px",
  wide: "1080px",
};

export function getStoredFontSize(): FontSize {
  const v = localStorage.getItem(FONT_SIZE_KEY);
  return v === "small" || v === "large" ? v : "medium";
}

export function getStoredFontFamily(): FontFamily {
  const v = localStorage.getItem(FONT_FAMILY_KEY);
  const valid: FontFamily[] = ["sans", "inter", "newsreader", "lora", "mono", "system"];
  return valid.includes(v as FontFamily) ? (v as FontFamily) : "sans";
}

export function getStoredBionic(): boolean {
  return localStorage.getItem(BIONIC_KEY) === "true";
}

export function getStoredLineSpacing(): LineSpacing {
  const v = localStorage.getItem(LINE_SPACING_KEY);
  return v === "compact" || v === "relaxed" || v === "wide" ? v : "normal";
}

export function getStoredLetterSpacing(): LetterSpacing {
  const v = localStorage.getItem(LETTER_SPACING_KEY);
  return v === "tight" || v === "wide" ? v : "normal";
}

export function getStoredContentWidth(): ContentWidth {
  const v = localStorage.getItem(CONTENT_WIDTH_KEY);
  return v === "narrow" || v === "wide" ? v : "medium";
}

export function applyFontSize(size: FontSize): void {
  const value = FONT_SIZE_VALUES[size];
  document.documentElement.style.setProperty("--base-font-size", value);
  document.documentElement.style.fontSize = value;
  localStorage.setItem(FONT_SIZE_KEY, size);
}

export function applyFontFamily(family: FontFamily): void {
  const value = FONT_FAMILY_VALUES[family];
  document.documentElement.style.setProperty("--base-font-family", value);
  document.documentElement.style.fontFamily = value;
  localStorage.setItem(FONT_FAMILY_KEY, family);
}

export function saveBionic(enabled: boolean): void {
  localStorage.setItem(BIONIC_KEY, String(enabled));
}

export function applyLineSpacing(spacing: LineSpacing): void {
  document.documentElement.style.setProperty("--base-line-height", LINE_SPACING_VALUES[spacing]);
  localStorage.setItem(LINE_SPACING_KEY, spacing);
}

export function applyLetterSpacing(spacing: LetterSpacing): void {
  document.documentElement.style.setProperty("--base-letter-spacing", LETTER_SPACING_VALUES[spacing]);
  localStorage.setItem(LETTER_SPACING_KEY, spacing);
}

export function applyContentWidth(width: ContentWidth): void {
  document.documentElement.style.setProperty("--content-max-width", CONTENT_WIDTH_VALUES[width]);
  localStorage.setItem(CONTENT_WIDTH_KEY, width);
}

export function applyReadingPrefs(): void {
  applyFontSize(getStoredFontSize());
  applyFontFamily(getStoredFontFamily());
  applyLineSpacing(getStoredLineSpacing());
  applyLetterSpacing(getStoredLetterSpacing());
  applyContentWidth(getStoredContentWidth());
}
