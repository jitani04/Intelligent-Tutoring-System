import { createContext, useContext, useState, ReactNode } from "react";
import {
  FontSize,
  FontFamily,
  getStoredFontSize,
  getStoredFontFamily,
  getStoredBionic,
  applyFontSize,
  applyFontFamily,
  saveBionic,
} from "./readingPrefs";

interface ReadingPrefsValue {
  fontSize: FontSize;
  fontFamily: FontFamily;
  bionic: boolean;
  setFontSize: (size: FontSize) => void;
  setFontFamily: (family: FontFamily) => void;
  setBionic: (enabled: boolean) => void;
}

const ReadingPrefsContext = createContext<ReadingPrefsValue | null>(null);

export function ReadingPrefsProvider({ children }: { children: ReactNode }) {
  const [fontSize, setFontSizeState] = useState<FontSize>(getStoredFontSize);
  const [fontFamily, setFontFamilyState] = useState<FontFamily>(getStoredFontFamily);
  const [bionic, setBionicState] = useState<boolean>(getStoredBionic);
  function setFontSize(size: FontSize) {
    applyFontSize(size);
    setFontSizeState(size);
  }

  function setFontFamily(family: FontFamily) {
    applyFontFamily(family);
    setFontFamilyState(family);
  }

  function setBionic(enabled: boolean) {
    saveBionic(enabled);
    setBionicState(enabled);
  }

  return (
    <ReadingPrefsContext.Provider value={{ fontSize, fontFamily, bionic, setFontSize, setFontFamily, setBionic }}>
      {children}
    </ReadingPrefsContext.Provider>
  );
}

export function useReadingPrefs(): ReadingPrefsValue {
  const ctx = useContext(ReadingPrefsContext);
  if (!ctx) throw new Error("useReadingPrefs must be used within ReadingPrefsProvider");
  return ctx;
}
