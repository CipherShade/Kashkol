"use client";

import type { ReactNode } from "react";
import { Tabs as TabsPrimitive } from "radix-ui";

export type TabItem = {
  value: string;
  label: string;
};

export function Tabs({
  items,
  defaultValue,
  value,
  onValueChange,
  label,
  children,
}: {
  items: TabItem[];
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  label: string;
  children: ReactNode;
}) {
  const initial = defaultValue ?? items[0]?.value;
  return (
    <TabsPrimitive.Root
      className="ui-tabs"
      defaultValue={value === undefined ? initial : undefined}
      value={value}
      onValueChange={onValueChange}
    >
      <TabsPrimitive.List className="ui-tabs-list" aria-label={label}>
        {items.map((item) => (
          <TabsPrimitive.Trigger key={item.value} value={item.value} className="ui-tab">
            {item.label}
          </TabsPrimitive.Trigger>
        ))}
      </TabsPrimitive.List>
      {children}
    </TabsPrimitive.Root>
  );
}

export function TabPanel({ value, children }: { value: string; children: ReactNode }) {
  return (
    <TabsPrimitive.Content className="ui-tab-panel" value={value}>
      {children}
    </TabsPrimitive.Content>
  );
}
