import { TrackedActionStatus } from '@/hooks/useTrackedAction';

interface ActionProgressBarProps {
  status: TrackedActionStatus | null;
}

export function ActionProgressBar({ status }: ActionProgressBarProps) {
  if (!status) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] bg-background border-b shadow-sm">
      <div className="flex items-center gap-3 px-4 py-2 text-sm">
        <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-primary transition-all duration-300"
            style={{ width: `${status.percent}%` }}
          />
        </div>
        <span className="text-muted-foreground whitespace-nowrap min-w-0 shrink-0">
          {status.name}
          {status.detail ? ` — ${status.detail}` : ''}
          {' '}
          {status.percent < 100 ? `${Math.round(status.percent)}%` : '✓'}
        </span>
      </div>
    </div>
  );
}
