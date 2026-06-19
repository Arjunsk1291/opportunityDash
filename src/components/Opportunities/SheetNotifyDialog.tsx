import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { fetchNotifyRecipients, notifySheetUpload, type NotifyRecipient } from '@/lib/sheetNotify';

export type SheetArchiveMeta = {
  archiveId: string;
  filename: string;
  createdCount: number;
  updatedCount: number;
};

interface SheetNotifyDialogProps {
  token: string | null;
  archive: SheetArchiveMeta | null;
  onClose: () => void;
}

export function SheetNotifyDialog({ token, archive, onClose }: SheetNotifyDialogProps) {
  const [recipients, setRecipients] = useState<NotifyRecipient[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!archive || !token) return;
    setLoading(true);
    setSelected(new Set());
    fetchNotifyRecipients(token)
      .then(setRecipients)
      .catch((error) => toast.error(error instanceof Error ? error.message : 'Failed to load users'))
      .finally(() => setLoading(false));
  }, [archive, token]);

  const toggle = (email: string, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(email); else next.delete(email);
      return next;
    });
  };

  const handleSend = async () => {
    if (!token || !archive || !selected.size) return;
    setSending(true);
    try {
      const count = await notifySheetUpload(token, archive.archiveId, Array.from(selected));
      toast.success(`Sheet sent to ${count} recipient${count === 1 ? '' : 's'}.`);
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to send notification');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={Boolean(archive)} onOpenChange={(open) => { if (!open && !sending) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Send uploaded sheet?</DialogTitle>
          <DialogDescription>
            {archive ? (
              <>
                "{archive.filename}" was saved ({archive.createdCount} new, {archive.updatedCount} updated). Select who should
                receive this exact sheet by email.
              </>
            ) : null}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[45vh] rounded-md border">
          <div className="divide-y">
            {loading && <div className="px-3 py-4 text-sm text-muted-foreground">Loading users…</div>}
            {!loading && recipients.length === 0 && (
              <div className="px-3 py-4 text-sm text-muted-foreground">No users found.</div>
            )}
            {recipients.map((recipient) => (
              <label key={recipient.email} className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/30">
                <Checkbox
                  checked={selected.has(recipient.email)}
                  onCheckedChange={(checked) => toggle(recipient.email, checked)}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{recipient.displayName}</div>
                  <div className="text-xs text-muted-foreground truncate">{recipient.email}</div>
                </div>
                {recipient.role && <Badge variant="secondary">{recipient.role}</Badge>}
              </label>
            ))}
          </div>
        </ScrollArea>

        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" disabled={sending} onClick={onClose}>Skip</Button>
          <Button disabled={!selected.size || sending} onClick={() => void handleSend()}>
            {sending ? 'Sending…' : `Send to ${selected.size} Selected`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
