import * as PopoverPrimitive from "@radix-ui/react-popover";
import { type VariantProps, cva } from "class-variance-authority";
import type * as React from "react";
import { twMerge } from "tailwind-merge";

const popoverVariants = cva(
  "flex flex-col gap-6 rounded-base border-2 border-border py-6 font-base shadow-shadow",
  {
    variants: {
      variant: {
        default: "bg-secondary-background text-foreground",
        ghost: "bg-transparent border-transparent shadow-none text-foreground",
        yellow: "bg-[hsl(47,100%,95%)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Popover({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Root>) {
  return <PopoverPrimitive.Root data-slot="popover" {...props} />;
}

function PopoverTrigger({
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Trigger>) {
  return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

function PopoverContent({
  className,
  align = "center",
  sideOffset = 4,
  variant,
  ...props
}: React.ComponentProps<typeof PopoverPrimitive.Content> &
  VariantProps<typeof popoverVariants>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        data-slot="popover-content"
        align={align}
        sideOffset={sideOffset}
        className={twMerge(
          "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 w-72 origin-(--radix-popover-content-transform-origin) rounded-base border-2 border-border bg-main p-4 text-foreground outline-none data-[state=closed]:animate-out data-[state=open]:animate-in",
          popoverVariants({ variant }),
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}

export { Popover, PopoverContent, PopoverTrigger };
