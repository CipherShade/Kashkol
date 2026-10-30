import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "danger"
  | "danger-ghost";
export type ButtonSize = "md" | "sm" | "xs" | "icon" | "icon-sm";

/**
 * The class used by the primitive. A link cannot carry `data-*` through the
 * component, so callers also set `data-variant` and `data-size` explicitly.
 */
export function buttonClassName(className?: string): string {
  return ["ui-button", className].filter(Boolean).join(" ");
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  children?: ReactNode;
};

/**
 * The shared button primitive. It defaults to `type="button"` so a button
 * inside a form never submits by accident; use `SubmitButton` for submits.
 */
export function Button({
  variant = "secondary",
  size = "md",
  className,
  type = "button",
  children,
  ...rest
}: ButtonProps) {
  const mappedVariant = variant === "outline" ? "secondary" : variant;
  const mappedSize = size === "xs" ? "sm" : size;
  return (
    <button
      type={type}
      className={buttonClassName(className)}
      data-variant={mappedVariant}
      data-size={mappedSize}
      {...rest}
    >
      {children}
    </button>
  );
}
