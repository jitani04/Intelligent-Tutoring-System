import { createContext, useContext, useState, ReactNode } from "react";
import {
  FontSize,
  FontFamily,
  LineSpacing,
  LetterSpacing,
  ContentWidth,
  getStoredFontSize,
  getStoredFontFamily,
  getStoredBionic,
  getStoredLineSpacing,
  getStoredLetterSpacing,
  getStoredContentWidth,
  applyFontSize,
  applyFontFamily,
  saveBionic,
  applyLineSpacing,
  applyLetterSpacing,
  applyContentWidth,
} from "./readingPrefs";

interface ReadingPrefsValue {
  fontSize: FontSize;
  fontFamily: FontFamily;
  bionic: boolean;
  lineSpacing: LineSpacing;
  letterSpacing: LetterSpacing;
  contentWidth: ContentWidth;
  setFontSize: (size: FontSize) => void;
  setFontFamily: (family: FontFamily) => void;
  setBionic: (enabled: boolean) => void;
  setLineSpacing: (spacing: LineSpacing) => void;
  setLetterSpacing: (spacing: LetterSpacing) => void;
  setContentWidth: (width: ContentWidth) => void;
}

const ReadingPrefsContext = createContext<ReadingPrefsValue | null>(null);

export function ReadingPrefsProvider({ children }: { children: ReactNode }) {
  const [fontSize, setFontSizeState] = useState<FontSize>(getStoredFontSize);
  const [fontFamily, setFontFamilyState] = useState<FontFamily>(getStoredFontFamily);
  const [bionic, setBionicState] = useState<boolean>(getStoredBionic);
  const [lineSpacing, setLineSpacingState] = useState<LineSpacing>(getStoredLineSpacing);
  const [letterSpacing, setLetterSpacingState] = useState<LetterSpacing>(getStoredLetterSpacing);
  const [contentWidth, setContentWidthState] = useState<ContentWidth>(getStoredContentWidth);

  function setFontSize(size: FontSize) { applyFontSize(size); setFontSizeState(size); }
  function setFontFamily(family: FontFamily) { applyFontFamily(family); setFontFamilyState(family); }
  function setBionic(enabled: boolean) { saveBionic(enabled); setBionicState(enabled); }
  function setLineSpacing(spacing: LineSpacing) { applyLineSpacing(spacing); setLineSpacingState(spacing); }
  function setLetterSpacing(spacing: LetterSpacing) { applyLetterSpacing(spacing); setLetterSpacingState(spacing); }
  function setContentWidth(width: ContentWidth) { applyContentWidth(width); setContentWidthState(width); }

  return (
    <ReadingPrefsContext.Provider value={{
      fontSize, fontFamily, bionic, lineSpacing, letterSpacing, contentWidth,
      setFontSize, setFontFamily, setBionic, setLineSpacing, setLetterSpacing, setContentWidth,
    }}>
      {children}
    </ReadingPrefsContext.Provider>
  );
}

export function useReadingPrefs(): ReadingPrefsValue {
  const ctx = useContext(ReadingPrefsContext);
  if (!ctx) throw new Error("useReadingPrefs must be used within ReadingPrefsProvider");
  return ctx;
}
