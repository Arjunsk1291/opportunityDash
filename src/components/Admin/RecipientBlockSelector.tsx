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
    () => allUsers.filter((user) => Boolean(String(user.email || '').trim())),
    [allUsers],
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
    <div className="space-y-2 sm:space-y-3 md:space-y-4">
      <div className="space-y-1 sm:space-y-2">
        <p className="text-xs sm:text-sm md:text-base font-medium">Selected Recipients ({group})</p>
        <div className="rounded-lg border bg-muted/50 p-2 sm:p-3 md:p-4 min-h-[56px] sm:min-h-[60px] md:min-h-[72px] w-full">
          {selectedEmails.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No recipients selected</p>
          ) : (
            <div className="flex flex-wrap gap-1 sm:gap-2 md:gap-3">
              {selectedEmails.map((email) => (
                <Badge key={email} variant="secondary" className="flex items-center gap-1 sm:gap-2 py-1 px-2 sm:px-3 max-w-full">
                  <span className="text-xs sm:text-sm truncate" title={email}>{email}</span>
                  {!disabled && (
                    <button type="button" onClick={() => removeEmail(email)} className="hover:text-destructive cursor-pointer shrink-0" aria-label={`Remove ${email}`}>
                      <X className="h-3 w-3 sm:h-4 sm:w-4" />
                    </button>
                  )}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>

      <Button type="button" variant="outline" size="sm" onClick={() => setShowUserPicker((prev) => !prev)} className="gap-2 sm:gap-3 w-full sm:w-auto h-10 sm:h-11 md:h-12 text-xs sm:text-sm md:text-base px-3 sm:px-4" disabled={disabled}>
        <Plus className="h-4 w-4 sm:h-5 sm:w-5 shrink-0" />
        {showUserPicker ? 'Hide User Picker' : 'Add from Users'}
      </Button>

      {showUserPicker && (
        <Card className="border-dashed">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Select Users for {group} Notifications</CardTitle>
            <CardDescription className="text-xs">Search and add any authorized user as a recipient</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 sm:space-y-3 md:space-y-4 p-3 sm:p-4 md:p-6">
            <div className="relative">
              <Search className="absolute left-2 sm:left-3 top-2.5 sm:top-3 h-4 w-4 sm:h-5 sm:w-5 text-muted-foreground shrink-0" />
              <Input placeholder="Search by email or name..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-8 sm:pl-10 h-9 sm:h-10 md:h-11 text-xs sm:text-sm md:text-base" disabled={disabled} />
            </div>

            <div className="space-y-2 sm:space-y-3 max-h-48 sm:max-h-56 md:max-h-64 overflow-y-auto">
              {filteredUsers.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {availableUsers.length === 0 ? 'No users available' : 'No users match your search'}
                </p>
              ) : (
                filteredUsers.map((user) => (
                  <label key={user.id || user.email} className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded hover:bg-muted cursor-pointer transition-colors">
                    <Checkbox checked={selectedEmails.includes(user.email.toLowerCase())} onCheckedChange={() => toggleUserSelection(user.email)} disabled={disabled} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs sm:text-sm md:text-base font-medium truncate" title={user.displayName || user.email}>{user.displayName || user.email}</p>
                      <p className="text-xs sm:text-sm text-muted-foreground truncate" title={user.email}>{user.email}</p>
                    </div>
                  </label>
                ))
              )}
            </div>

            <div className="space-y-2 sm:space-y-3 border-t pt-3 sm:pt-4">
              <p className="text-xs sm:text-sm font-medium">Or add manually:</p>
              <div className="flex flex-col sm:flex-row gap-2 sm:gap-3">
                <Input
                  placeholder="email@company.com"
                  value={manualEmail}
                  onChange={(e) => setManualEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addManualEmail()}
                  className="text-xs sm:text-sm md:text-base h-9 sm:h-10 md:h-11"
                  disabled={disabled}
                />
                <Button type="button" size="sm" variant="secondary" onClick={addManualEmail} disabled={disabled || !manualEmail.trim()} className="h-9 sm:h-10 md:h-11 text-xs sm:text-sm md:text-base px-3 sm:px-4 w-full sm:w-auto">
                  Add
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {selectedEmails.length > 0 && (
        <p className="text-xs sm:text-sm text-muted-foreground">{selectedEmails.length} recipient{selectedEmails.length !== 1 ? 's' : ''} selected for {group}</p>
      )}
    </div>
  );
}
