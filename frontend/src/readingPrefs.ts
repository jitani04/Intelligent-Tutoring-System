export type FontSize = "small" | "medium" | "large";
export type FontFamily = "sans" | "serif" | "mono";

const FONT_SIZE_KEY = "sapient-font-size";
const FONT_FAMILY_KEY = "sapient-font-family";
const BIONIC_KEY = "sapient-bionic";

const FONT_SIZE_VALUES: Record<FontSize, string> = {
  small: "14px",
  medium: "16px",
  large: "18px",
};

const FONT_FAMILY_VALUES: Record<FontFamily, string> = {
  sans: '"Instrument Sans", "Avenir Next", system-ui, sans-serif',
  serif: '"Newsreader", Georgia, serif',
  mono: 'ui-monospace, "SF Mono", Consolas, "Courier New", monospace',
};

export function getStoredFontSize(): FontSize {
  const v = localStorage.getItem(FONT_SIZE_KEY);
  return v === "small" || v === "large" ? v : "medium";
}

export function getStoredFontFamily(): FontFamily {
  const v = localStorage.getItem(FONT_FAMILY_KEY);
  return v === "serif" || v === "mono" ? v : "sans";
}

export function getStoredBionic(): boolean {
  return localStorage.getItem(BIONIC_KEY) === "true";
}

export function applyFontSize(size: FontSize): void {
  document.documentElement.style.setProperty("--base-font-size", FONT_SIZE_VALUES[size]);
  localStorage.setItem(FONT_SIZE_KEY, size);
}

export function applyFontFamily(family: FontFamily): void {
  document.documentElement.style.setProperty("--base-font-family", FONT_FAMILY_VALUES[family]);
  localStorage.setItem(FONT_FAMILY_KEY, family);
}

export function saveBionic(enabled: boolean): void {
  localStorage.setItem(BIONIC_KEY, String(enabled));
}


export function applyReadingPrefs(): void {
  applyFontSize(getStoredFontSize());
  applyFontFamily(getStoredFontFamily());
}
