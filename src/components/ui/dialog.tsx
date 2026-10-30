"use client";

import { useId, type ReactNode } from "react";
import { AlertDialog, Dialog as DialogPrimitive } from "radix-ui";
import { Button } from "./button";
import { Icon } from "./icon";

/**
 * A modal dialog built on Radix Dialog: focus is trapped, Escape and a
 * backdrop click close it, focus returns to the trigger, and the panel scrolls
 * internally on short viewports (F-P0-05 AC-4).
 */
export function Dialog({
  trigger,
  title,
  description,
  children,
  footer,
  closeLabel = "Close",
  open,
  isOpen,
  onClose,
  onOpenChange,
  size,
}: {
  trigger?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  closeLabel?: string;
  open?: boolean;
  isOpen?: boolean;
  onClose?: () => void;
  onOpenChange?: (open: boolean) => void;
  size?: "sm" | "md" | "lg";
}) {
  const isEffectiveOpen = isOpen !== undefined ? isOpen : open;
  const effectiveOnOpenChange =
    onOpenChange ??
    (onClose
      ? (nextOpen: boolean) => {
          if (!nextOpen) onClose();
        }
      : undefined);

  return (
    <DialogPrimitive.Root open={isEffectiveOpen} onOpenChange={effectiveOnOpenChange}>
      {trigger ? <DialogPrimitive.Trigger asChild>{trigger}</DialogPrimitive.Trigger> : null}
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="ui-dialog-overlay" />
        <DialogPrimitive.Content className="ui-dialog-content" data-size={size ?? "md"}>
          <div className="ui-dialog-header">
            <div>
              <DialogPrimitive.Title className="ui-dialog-title">{title}</DialogPrimitive.Title>
              {description ? (
                <DialogPrimitive.Description className="ui-dialog-description">
                  {description}
                </DialogPrimitive.Description>
              ) : null}
            </div>
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon-sm" aria-label={closeLabel}>
                <Icon name="x" size={18} />
              </Button>
            </DialogPrimitive.Close>
          </div>
          {children ? <div className="ui-dialog-body">{children}</div> : null}
          {footer ? <div className="ui-dialog-footer">{footer}</div> : null}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export type ConfirmAction = (formData: FormData) => void | Promise<void>;

/**
 * A destructive confirmation. The confirm button submits a real server action
 * in the same gesture, so the dialog never claims an action it did not perform.
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  cancelLabel,
  closeLabel,
  action,
  fields,
  children,
  tone = "danger",
}: {
  trigger: ReactNode;
  title: ReactNode;
  description: ReactNode;
  confirmLabel: string;
  cancelLabel: string;
  closeLabel: string;
  action: ConfirmAction;
  fields?: Record<string, string>;
  children?: ReactNode;
  tone?: "danger" | "primary";
}) {
  const formId = useId().replaceAll(":", "");
  return (
    <AlertDialog.Root>
      <AlertDialog.Trigger asChild>{trigger}</AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="ui-dialog-overlay" />
        <AlertDialog.Content className="ui-dialog-content">
          <div className="ui-dialog-header">
            <div>
              <AlertDialog.Title className="ui-dialog-title">{title}</AlertDialog.Title>
              <AlertDialog.Description className="ui-dialog-description">
                {description}
              </AlertDialog.Description>
            </div>
            <AlertDialog.Cancel asChild>
              <Button variant="ghost" size="icon-sm" aria-label={closeLabel}>
                <Icon name="x" size={18} />
              </Button>
            </AlertDialog.Cancel>
          </div>
          {children ? <div className="ui-dialog-body">{children}</div> : null}
          <form id={formId} action={action} hidden>
            {Object.entries(fields ?? {}).map(([name, value]) => (
              <input key={name} type="hidden" name={name} value={value} />
            ))}
          </form>
          <div className="ui-dialog-footer">
            <AlertDialog.Cancel asChild>
              <Button variant="secondary">{cancelLabel}</Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button
                type="submit"
                form={formId}
                variant={tone === "danger" ? "danger" : "primary"}
              >
                {tone === "danger" ? <Icon name="trash" size={16} /> : null}
                <span>{confirmLabel}</span>
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
