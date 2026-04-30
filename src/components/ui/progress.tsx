import * as React from "react";
import LinearProgress, { type LinearProgressProps } from "@mui/material/LinearProgress";
import Box from "@mui/material/Box";

import { cn } from "@/lib/utils";

export type ProgressProps = Omit<LinearProgressProps, "value"> & {
  value?: number | null;
  className?: string;
};

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(({ className, value, ...props }, ref) => (
  <Box
    component="div"
    ref={ref}
    className={cn("relative h-4 w-full overflow-hidden rounded-full bg-secondary", className)}
  >
    <LinearProgress
      {...props}
      variant={typeof value === "number" ? "determinate" : "indeterminate"}
      value={typeof value === "number" ? value : undefined}
      className="h-full"
      sx={{
        backgroundColor: "transparent",
        "& .MuiLinearProgress-bar": { backgroundColor: "hsl(var(--primary))" },
      }}
    />
  </Box>
));
Progress.displayName = "Progress";

export { Progress };
