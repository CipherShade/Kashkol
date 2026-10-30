"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { Toast as ToastPrimitive } from "radix-ui";
import { useLocale } from "next-intl";
import { Icon, type IconName } from "./icon";

export type ToastTone = "info" | "success" | "warning" | "danger";

export type ToastInput = {
  title: string;
  description?: string;
  tone?: ToastTone;
};

type ToastItem = ToastInput & { id: number };

const ToastContext = createContext<((toast: ToastInput) => void) | null>(null);

const TONE_ICON: Record<ToastTone, IconName> = {
  info: "info",
  success: "checkCircle",
  warning: "alert",
  danger: "xCircle",
};

/**
 * The toast provider. Toasts stack, auto-dismiss after 2.6 s (the prototype
 * behaviour), and sit above the safe area on mobile (F-P0-05 AC-5).
 */
export function ToastProvider({
  children,
  closeLabel,
}: {
  children: ReactNode;
  closeLabel: string;
}) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const locale = useLocale();

  const push = useCallback((toast: ToastInput) => {
    setItems((current) => [...current, { ...toast, id: Date.now() + current.length }]);
  }, []);
  const value = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      <ToastPrimitive.Provider swipeDirection={locale === "ar" ? "left" : "right"}>
        {children}
        {items.map((item) => (
          <ToastPrimitive.Root
            key={item.id}
            className="ui-toast"
            data-tone={item.tone ?? "info"}
            duration={2600}
            type={item.tone === "danger" ? "foreground" : "background"}
            onOpenChange={(open) => {
              if (!open) setItems((current) => current.filter((toast) => toast.id !== item.id));
            }}
          >
            <Icon
              name={TONE_ICON[item.tone ?? "info"]}
              size={17}
              className="ui-toast-icon"
            />
            <div className="ui-toast-body">
              <ToastPrimitive.Title className="ui-toast-title">
                {item.title}
              </ToastPrimitive.Title>
              {item.description ? (
                <ToastPrimitive.Description className="ui-toast-description">
                  {item.description}
                </ToastPrimitive.Description>
              ) : null}
            </div>
            <ToastPrimitive.Close className="ui-toast-close" aria-label={closeLabel}>
              <Icon name="x" size={15} />
            </ToastPrimitive.Close>
          </ToastPrimitive.Root>
        ))}
        <ToastPrimitive.Viewport className="ui-toast-viewport" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}

export function useToast(): (toast: ToastInput) => void {
  const push = useContext(ToastContext);
  if (!push) {
    // A missing provider is a programming error. Returning a no-op keeps a
    // page renderable rather than crashing the whole tree in production.
    return () => undefined;
  }
  return push;
}
