import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Search, X } from 'lucide-react';

interface SelectorUser {
  id?: string;
  email: string;
  displayName?: string;
  role?: string;
  assignedGroup?: string | null;
}

interface RecipientBlockSelectorProps {
  group: 'GES' | 'GDS' | 'GTS';
  selectedEmails: string[];
  onSelectionChange: (emails: string[]) => void;
  allUsers: SelectorUser[];
  disabled?: boolean;
}

export function RecipientBlockSelector({ group, selectedEmails, onSelectionChange, allUsers, disabled = false }: RecipientBlockSelectorProps) {
  const [showUserPicker, setShowUserPicker] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [manualEmail, setManualEmail] = useState('');

  const availableUsers = useMemo(
    () => allUsers.filter((user) => String(user.role || '').toUpperCase() === 'SVP' && String(user.assignedGroup || '').toUpperCase() === group),
    [allUsers, group],
  );

  const filteredUsers = useMemo(
    () => availableUsers.filter((user) => user.email.toLowerCase().includes(searchQuery.toLowerCase()) || (user.displayName || '').toLowerCase().includes(searchQuery.toLowerCase())),
    [availableUsers, searchQuery],
  );

  const toggleUserSelection = (email: string) => {
    const normalized = email.trim().toLowerCase();
    const next = selectedEmails.includes(normalized)
      ? selectedEmails.filter((e) => e !== normalized)
      : [...selectedEmails, normalized];
    onSelectionChange(next);
  };

  const removeEmail = (email: string) => {
    onSelectionChange(selectedEmails.filter((e) => e !== email));
  };

  const addManualEmail = () => {
    const candidate = manualEmail.trim().toLowerCase();
    if (!candidate || selectedEmails.includes(candidate)) return;
    onSelectionChange([...selectedEmails, candidate]);
    setManualEmail('');
  };

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <p className="text-sm font-medium">Selected Recipients ({group})</p>
        <div className="rounded-lg border bg-muted/50 p-3 min-h-[60px]">
          {selectedEmails.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No recipients selected</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {selectedEmails.map((email) => (
                <Badge key={email} variant="secondary" className="flex items-center gap-1 py-1 px-2">
                  <span className="text-xs">{email}</span>
                  {!disabled && (
                    <button type="button" onClick={() => removeEmail(email)} className="hover:text-destructive cursor-pointer" aria-label={`Remove ${email}`}>
                      <X className="h-3 w-3" />
                    </button>
                  )}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>

      <Button type="button" variant="outline" size="sm" onClick={() => setShowUserPicker((prev) => !prev)} className="gap-2 w-full sm:w-auto" disabled={disabled}>
        <Plus className="h-4 w-4" />
        {showUserPicker ? 'Hide User Picker' : 'Add from Users'}
      </Button>

      {showUserPicker && (
        <Card className="border-dashed">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Select {group} SVP Users</CardTitle>
            <CardDescription className="text-xs">Choose users from {group} group to add as recipients</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input placeholder="Search by email or name..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-8" disabled={disabled} />
            </div>

            <div className="space-y-2 max-h-48 overflow-y-auto">
              {filteredUsers.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {availableUsers.length === 0 ? `No SVP users assigned to ${group} group` : 'No users match your search'}
                </p>
              ) : (
                filteredUsers.map((user) => (
                  <label key={user.id || user.email} className="flex items-center gap-2 p-2 rounded hover:bg-muted cursor-pointer transition-colors">
                    <Checkbox checked={selectedEmails.includes(user.email.toLowerCase())} onCheckedChange={() => toggleUserSelection(user.email)} disabled={disabled} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{user.displayName || user.email}</p>
                      <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                    </div>
                  </label>
                ))
              )}
            </div>

            <div className="space-y-2 border-t pt-3">
              <p className="text-xs font-medium">Or add manually:</p>
              <div className="flex gap-2">
                <Input
                  placeholder="email@company.com"
                  value={manualEmail}
                  onChange={(e) => setManualEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addManualEmail()}
                  className="text-sm h-8"
                  disabled={disabled}
                />
                <Button type="button" size="sm" variant="secondary" onClick={addManualEmail} disabled={disabled || !manualEmail.trim()} className="h-8">
                  Add
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {selectedEmails.length > 0 && (
        <p className="text-xs text-muted-foreground">{selectedEmails.length} recipient{selectedEmails.length !== 1 ? 's' : ''} selected for {group}</p>
      )}
    </div>
  );
}
