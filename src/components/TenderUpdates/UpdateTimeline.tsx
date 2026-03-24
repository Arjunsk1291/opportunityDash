import type { ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ArrowRight, Building2, Trash2, Users } from 'lucide-react';
import type { TenderUpdate } from '@/lib/tenderUpdates';
import { cn } from '@/lib/utils';

const SUBTYPE_META: Record<string, { label: string; emoji: string }> = {
  contacted: { label: 'Contacted', emoji: '📞' },
  response: { label: 'Response', emoji: '✅' },
  note: { label: 'Note', emoji: '📝' },
  submission: { label: 'Submission', emoji: '📤' },
  extension: { label: 'Extension', emoji: '⏰' },
  clarification: { label: 'Clarification', emoji: '❓' },
};

type UpdateTimelineProps = {
  updates: TenderUpdate[];
  canEdit: boolean;
  onDelete: (id: string) => void;
};

export function UpdateTimeline({ updates, canEdit, onDelete }: UpdateTimelineProps) {
  const laneUpdates = {
    subcontractor: updates.filter((item) => item.type === 'subcontractor'),
    client: updates.filter((item) => item.type === 'client'),
  };

  return (
    <div className="grid gap-4 xl:grid-cols-2 2xl:gap-6">
      <TimelineLane
        title="Subcontractor"
        count={laneUpdates.subcontractor.length}
        icon={<Users className="h-4 w-4" />}
        className="text-info"
        lineClassName="border-info/30"
        accentClassName="bg-info"
        badgeClassName="border-info/40 text-info"
        updates={laneUpdates.subcontractor}
        canEdit={canEdit}
        onDelete={onDelete}
      />
      <TimelineLane
        title="Client"
        count={laneUpdates.client.length}
        icon={<Building2 className="h-4 w-4" />}
        className="text-success"
        lineClassName="border-success/30"
        accentClassName="bg-success"
        badgeClassName="border-success/40 text-success"
        updates={laneUpdates.client}
        canEdit={canEdit}
        onDelete={onDelete}
      />
    </div>
  );
}

type TimelineLaneProps = {
  title: string;
  count: number;
  icon: ReactNode;
  className: string;
  lineClassName: string;
  accentClassName: string;
  badgeClassName: string;
  updates: TenderUpdate[];
  canEdit: boolean;
  onDelete: (id: string) => void;
};

function TimelineLane({ title, count, icon, className, lineClassName, accentClassName, badgeClassName, updates, canEdit, onDelete }: TimelineLaneProps) {
  return (
    <div className="rounded-xl border border-border bg-card/80 p-3 backdrop-blur-sm sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className={cn("flex min-w-0 items-center gap-2 text-sm font-semibold uppercase tracking-wider", className)}>
          <span>{icon}</span>
          <span className="truncate">{title}</span>
        </div>
        <Badge variant="outline" className={cn("shrink-0 text-xs", badgeClassName)}>{count} updates</Badge>
      </div>
      <Separator className="my-3" />
      <div className={cn("relative pl-6 space-y-4 border-l-2", lineClassName)}>
        {updates.length === 0 && (
          <p className="text-xs text-muted-foreground">No updates yet.</p>
        )}
        {updates.map((update, index) => {
          const meta = SUBTYPE_META[update.subType] || { label: update.subType, emoji: '🗒️' };
          return (
            <div
              key={update.id}
              className="relative group animate-fade-in"
              style={{ animationDelay: `${index * 60}ms` }}
            >
              <div
                className={cn(
                  "absolute -left-[25px] top-5 h-3 w-3 rounded-full border-2 border-background transition-transform group-hover:scale-125",
                  accentClassName,
                )}
              />
              <div className="rounded-lg border border-border bg-card/30 backdrop-blur-sm p-3 shadow-sm">
                <div className={cn("h-1 w-full rounded-full mb-2", accentClassName)} />
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="text-base">{meta.emoji}</span>
                  <Badge variant="secondary" className="text-[11px]">{meta.label}</Badge>
                  <span className="font-mono text-muted-foreground">{update.date}</span>
                  {update.dueDate && (
                    <Badge className="bg-warning/15 text-warning text-[11px]">Due {update.dueDate}</Badge>
                  )}
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-sm font-medium">
                  <span className="break-words">{update.actor}</span>
                  <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
                  <span className="break-words text-muted-foreground">{update.subType}</span>
                </div>
                <details className="mt-2 text-xs text-muted-foreground">
                  <summary className="cursor-pointer text-[11px] uppercase tracking-wider">Details</summary>
                  <p className="mt-2 whitespace-pre-wrap break-words text-sm text-foreground">{update.details}</p>
                  <p className="mt-2 text-[11px] uppercase tracking-wider text-muted-foreground">Created by</p>
                  <p className="break-words text-xs">{update.createdBy} • {update.createdAt.slice(0, 10)}</p>
                  {canEdit && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-3 h-7 px-2 text-[11px] text-destructive"
                      onClick={() => onDelete(update.id)}
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      Delete
                    </Button>
                  )}
                </details>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
