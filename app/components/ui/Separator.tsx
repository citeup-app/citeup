import { Separator as BaseUISeparator } from "@base-ui/react";
import type * as React from "react";
import { twMerge } from "tailwind-merge";

function Separator({
  className,
  orientation = "horizontal",
  ...props
}: React.ComponentProps<typeof BaseUISeparator>) {
  return (
    <BaseUISeparator
      data-slot="separator"
      orientation={orientation}
      className={twMerge(
        "shrink-0 bg-border data-[orientation=horizontal]:h-px data-[orientation=vertical]:h-full data-[orientation=horizontal]:w-full data-[orientation=vertical]:w-px",
        className?.toString(),
      )}
      {...props}
    />
  );
}

export { Separator };
