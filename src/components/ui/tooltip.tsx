"use client";

import type { ReactNode } from "react";
import { Tooltip as TooltipPrimitive } from "radix-ui";

export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <TooltipPrimitive.Provider delayDuration={350} skipDelayDuration={120}>
      {children}
    </TooltipPrimitive.Provider>
  );
}

export function Tooltip({
  label,
  children,
  side = "bottom",
}: {
  label: string;
  children: ReactNode;
  side?: "top" | "bottom" | "left" | "right";
}) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content className="ui-tooltip-content" side={side} sideOffset={6}>
          {label}
          <TooltipPrimitive.Arrow className="ui-tooltip-arrow" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
