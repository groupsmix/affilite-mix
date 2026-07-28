"use client";

import * as React from "react";
import { Switch as SwitchPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

function Switch({
  className,
  size = "default",
  checked,
  ...props
}: React.ComponentProps<typeof SwitchPrimitive.Root> & {
  size?: "sm" | "default";
}) {
  const isChecked = !!checked;
  const sizeClasses =
    size === "sm"
      ? { root: "h-3.5 w-6", thumb: "size-3" }
      : { root: "h-[1.15rem] w-8", thumb: "size-4" };
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      data-size={size}
      data-state={isChecked ? "checked" : "unchecked"}
      className={cn(
        "peer group/switch inline-flex shrink-0 items-center rounded-full border border-transparent shadow-xs transition-all outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
        sizeClasses.root,
        isChecked ? "bg-primary" : "bg-input dark:bg-input/80",
        className,
      )}
      checked={checked}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block rounded-full bg-background ring-0 transition-transform",
          sizeClasses.thumb,
          isChecked
            ? "translate-x-[calc(100%-2px)] dark:bg-primary-foreground"
            : "translate-x-0 dark:bg-foreground",
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export { Switch };
