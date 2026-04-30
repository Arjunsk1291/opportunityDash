import * as React from "react";
import Divider, { type DividerProps } from "@mui/material/Divider";

import { cn } from "@/lib/utils";

export type SeparatorProps = DividerProps & {
  decorative?: boolean;
};

const Separator = React.forwardRef<HTMLHRElement, SeparatorProps>(
  ({ className, orientation = "horizontal", decorative = true, ...props }, ref) => (
    <Divider
      ref={ref}
      role={decorative ? "presentation" : "separator"}
      orientation={orientation}
      className={cn(
        "shrink-0 bg-border",
        orientation === "horizontal" ? "h-[1px] w-full" : "h-full w-[1px]",
        className,
      )}
      {...props}
    />
  ),
);
Separator.displayName = "Separator";

export { Separator };
