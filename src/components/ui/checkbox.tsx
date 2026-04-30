import * as React from "react";
import MuiCheckbox, { type CheckboxProps as MuiCheckboxProps } from "@mui/material/Checkbox";

import { cn } from "@/lib/utils";

export type CheckboxProps = Omit<MuiCheckboxProps, "onChange"> & {
  onCheckedChange?: (checked: boolean) => void;
};

const Checkbox = React.forwardRef<HTMLButtonElement, CheckboxProps>(
  ({ className, onCheckedChange, ...props }, ref) => (
    <MuiCheckbox
      {...props}
      ref={ref}
      onChange={(event, checked) => {
        props.onChange?.(event, checked);
        onCheckedChange?.(checked);
      }}
      className={cn("p-0", className)}
      disableRipple
      sx={{ "& .MuiSvgIcon-root": { fontSize: 18 } }}
    />
  ),
);
Checkbox.displayName = "Checkbox";

export { Checkbox };
