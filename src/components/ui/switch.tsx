import * as React from "react";
import MuiSwitch, { type SwitchProps as MuiSwitchProps } from "@mui/material/Switch";

import { cn } from "@/lib/utils";

export type SwitchProps = Omit<MuiSwitchProps, "onChange"> & {
  onCheckedChange?: (checked: boolean) => void;
  onChange?: MuiSwitchProps["onChange"];
};

const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ className, onCheckedChange, onChange, ...props }, ref) => (
    <MuiSwitch
      {...props}
      ref={ref}
      onChange={(event, checked) => {
        onChange?.(event, checked);
        onCheckedChange?.(checked);
      }}
      className={cn(className)}
      disableRipple
    />
  ),
);
Switch.displayName = "Switch";

export { Switch };
