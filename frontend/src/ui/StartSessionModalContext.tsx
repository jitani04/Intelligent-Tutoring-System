import { createContext, useContext } from "react";

export interface StartSessionOptions {
  subject?: string;
}

export interface StartSessionModalContextValue {
  openStartSession: (options?: StartSessionOptions) => void;
  openNewSubject: () => void;
}

export const StartSessionModalContext = createContext<StartSessionModalContextValue | null>(null);

export function useStartSessionModal(): StartSessionModalContextValue {
  const context = useContext(StartSessionModalContext);
  if (!context) {
    throw new Error("useStartSessionModal must be used within StartSessionModalContext.Provider");
  }
  return context;
}
