import { createContext, useContext } from "react";

export const LocaleContext = createContext("en-MY");

export function usePromptLocale() {
  return useContext(LocaleContext);
}
