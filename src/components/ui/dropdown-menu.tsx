"use client";

import type { ReactNode } from "react";
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui";
import { Link } from "@/i18n/navigation";
import { Icon, type IconName } from "./icon";

export function DropdownMenu({
  trigger,
  label,
  children,
  align = "end",
  sideOffset = 8,
}: {
  trigger: ReactNode;
  label: string;
  children: ReactNode;
  align?: "start" | "center" | "end";
  sideOffset?: number;
}) {
  return (
    <DropdownMenuPrimitive.Root>
      <DropdownMenuPrimitive.Trigger asChild aria-label={label}>
        {trigger}
      </DropdownMenuPrimitive.Trigger>
      <DropdownMenuPrimitive.Portal>
        <DropdownMenuPrimitive.Content
          className="ui-menu-content"
          align={align}
          sideOffset={sideOffset}
        >
          {children}
        </DropdownMenuPrimitive.Content>
      </DropdownMenuPrimitive.Portal>
    </DropdownMenuPrimitive.Root>
  );
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return (
    <DropdownMenuPrimitive.Label className="ui-menu-label">{children}</DropdownMenuPrimitive.Label>
  );
}

export function MenuSeparator() {
  return <DropdownMenuPrimitive.Separator className="ui-menu-separator" />;
}

export function MenuHeader({ children }: { children: ReactNode }) {
  return <div className="ui-menu-header">{children}</div>;
}

export function MenuItem({
  tone,
  onSelect,
  asChild,
  children,
}: {
  tone?: "danger";
  onSelect?: (event: Event) => void;
  asChild?: boolean;
  children: ReactNode;
}) {
  return (
    <DropdownMenuPrimitive.Item
      className="ui-menu-item"
      data-tone={tone}
      onSelect={onSelect}
      asChild={asChild}
    >
      {children}
    </DropdownMenuPrimitive.Item>
  );
}

export function MenuLinkItem({
  href,
  icon,
  onSelect,
  children,
}: {
  href: string;
  icon?: IconName;
  onSelect?: (event: Event) => void;
  children: ReactNode;
}) {
  return (
    <DropdownMenuPrimitive.Item asChild onSelect={onSelect}>
      <Link href={href} className="ui-menu-item">
        {icon ? <Icon name={icon} size={16} className="ui-menu-item-icon" /> : null}
        <span>{children}</span>
      </Link>
    </DropdownMenuPrimitive.Item>
  );
}

export function MenuRadioGroup({
  value,
  onValueChange,
  children,
}: {
  value: string;
  onValueChange: (value: string) => void;
  children: ReactNode;
}) {
  return (
    <DropdownMenuPrimitive.RadioGroup value={value} onValueChange={onValueChange}>
      {children}
    </DropdownMenuPrimitive.RadioGroup>
  );
}

export function MenuRadioItem({
  value,
  icon,
  children,
}: {
  value: string;
  icon?: IconName;
  children: ReactNode;
}) {
  return (
    <DropdownMenuPrimitive.RadioItem className="ui-menu-item" value={value}>
      {icon ? <Icon name={icon} size={16} className="ui-menu-item-icon" /> : null}
      <span>{children}</span>
      <DropdownMenuPrimitive.ItemIndicator className="ui-menu-item-check">
        <Icon name="check" size={15} />
      </DropdownMenuPrimitive.ItemIndicator>
    </DropdownMenuPrimitive.RadioItem>
  );
}
