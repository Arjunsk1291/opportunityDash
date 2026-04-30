import * as React from "react";
import MuiSwitch, { type SwitchProps as MuiSwitchProps } from "@mui/material/Switch";

import { cn } from "@/lib/utils";

export type SwitchProps = Omit<MuiSwitchProps, "onChange"> & {
  onCheckedChange?: (checked: boolean) => void;
};

const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ className, onCheckedChange, ...props }, ref) => (
    <MuiSwitch
      {...props}
      ref={ref}
      onChange={(event, checked) => {
        props.onChange?.(event, checked);
        onCheckedChange?.(checked);
      }}
      className={cn(className)}
      disableRipple
    />
  ),
);
Switch.displayName = "Switch";

export { Switch };
