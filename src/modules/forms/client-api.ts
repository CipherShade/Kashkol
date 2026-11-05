"use client";

import { useCallback } from "react";
import { useTranslations } from "next-intl";

export { readErrorMessageKey } from "./api-errors";

/**
 * Resolves a server `messageKey` against the message catalogue, falling back to
 * a form-specific key when the server key is unknown.
 */
export function useApiErrorMessage() {
  const t = useTranslations();
  return useCallback(
    (messageKey: string | null, fallbackKey: string): string => {
      if (messageKey && t.has(messageKey)) return t(messageKey);
      return t(fallbackKey);
    },
    [t],
  );
}
