import { cn } from "@/lib/utils";
import { useBrand } from "@/contexts/BrandContext";

type BrandCornerLogoProps = {
  className?: string;
  sizeClassName?: string;
};

export function BrandCornerLogo({ className, sizeClassName = "h-7 sm:h-8" }: BrandCornerLogoProps) {
  const { activeBrand } = useBrand();
  return (
    <div
      className={cn(
        "pointer-events-none fixed bottom-4 right-4 z-40 flex items-center justify-center rounded-full bg-white/80 px-3 py-2 shadow-lg ring-1 ring-black/5 backdrop-blur-sm",
        className,
      )}
      aria-hidden="true"
    >
      <img src={activeBrand.logo} alt={activeBrand.label} className={cn("w-auto", sizeClassName)} />
    </div>
  );
}
