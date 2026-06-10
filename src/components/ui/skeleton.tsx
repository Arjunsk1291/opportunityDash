import { cn } from "@/lib/utils";
import MuiSkeleton, { type SkeletonProps as MuiSkeletonProps } from "@mui/material/Skeleton";

type SkeletonProps = MuiSkeletonProps & { className?: string };

function Skeleton({ className, animation = "wave", ...props }: SkeletonProps) {
  return <MuiSkeleton className={cn(className)} animation={animation} {...props} />;
}

export { Skeleton };
