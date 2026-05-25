import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Search, X } from 'lucide-react';

export interface UserMultiEmailPickerUser {
  id?: string;
  email: string;
  displayName?: string;
  role?: string;
}

interface UserMultiEmailPickerProps {
  title: string;
  description?: string;
  selectedEmails: string[];
  onSelectionChange: (emails: string[]) => void;
  allUsers: UserMultiEmailPickerUser[];
  disabled?: boolean;
  manualEntryPlaceholder?: string;
}

const normalizeEmailList = (value: string[]): string[] =>
  [...new Set(value.map((entry) => String(entry || '').trim().toLowerCase()).filter(Boolean))];

export function UserMultiEmailPicker({
  title,
  description,
  selectedEmails,
  onSelectionChange,
  allUsers,
  disabled = false,
  manualEntryPlaceholder = 'email@company.com',
}: UserMultiEmailPickerProps) {
  const [showUserPicker, setShowUserPicker] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [manualEmail, setManualEmail] = useState('');

  const normalizedSelected = useMemo(() => normalizeEmailList(selectedEmails), [selectedEmails]);

  const availableUsers = useMemo(
    () => allUsers.filter((user) => Boolean(String(user.email || '').trim())),
    [allUsers],
  );

  const filteredUsers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return availableUsers;
    return availableUsers.filter((user) => {
      const email = String(user.email || '').toLowerCase();
      const name = String(user.displayName || '').toLowerCase();
      return email.includes(query) || name.includes(query);
    });
  }, [availableUsers, searchQuery]);

  const toggleUserSelection = (email: string) => {
    const normalized = String(email || '').trim().toLowerCase();
    if (!normalized) return;
    const next = normalizedSelected.includes(normalized)
      ? normalizedSelected.filter((e) => e !== normalized)
      : normalizeEmailList([...normalizedSelected, normalized]);
    onSelectionChange(next);
  };

  const removeEmail = (email: string) => {
    const normalized = String(email || '').trim().toLowerCase();
    onSelectionChange(normalizedSelected.filter((e) => e !== normalized));
  };

  const addManualEmail = () => {
    const candidate = manualEmail.trim().toLowerCase();
    if (!candidate) return;
    if (normalizedSelected.includes(candidate)) {
      setManualEmail('');
      return;
    }
    onSelectionChange(normalizeEmailList([...normalizedSelected, candidate]));
    setManualEmail('');
  };

  return (
    <div className="space-y-2 sm:space-y-3">
      <div className="space-y-1">
        <p className="text-xs sm:text-sm font-medium">{title}</p>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
        <div className="rounded-lg border bg-muted/50 p-2 sm:p-3 min-h-[56px] w-full">
          {normalizedSelected.length === 0 ? (
            <p className="text-sm text-muted-foreground italic">No recipients selected</p>
          ) : (
            <div className="flex flex-wrap gap-1 sm:gap-2">
              {normalizedSelected.map((email) => (
                <Badge key={email} variant="secondary" className="flex items-center gap-1 py-1 px-2 max-w-full">
                  <span className="text-xs sm:text-sm truncate" title={email}>{email}</span>
                  {!disabled && (
                    <button
                      type="button"
                      onClick={() => removeEmail(email)}
                      className="hover:text-destructive cursor-pointer shrink-0"
                      aria-label={`Remove ${email}`}
                    >
                      <X className="h-3 w-3 sm:h-4 sm:w-4" />
                    </button>
                  )}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setShowUserPicker((prev) => !prev)}
        className="gap-2 w-full sm:w-auto h-10 text-xs sm:text-sm px-3 sm:px-4"
        disabled={disabled}
      >
        <Plus className="h-4 w-4 shrink-0" />
        {showUserPicker ? 'Hide User Picker' : 'Add from Users'}
      </Button>

      {showUserPicker && (
        <Card className="border-dashed">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Pick users</CardTitle>
            <CardDescription className="text-xs">Search and select any approved authorized user</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 p-3 sm:p-4">
            <div className="relative">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground shrink-0" />
              <Input
                placeholder="Search by email or name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-9 text-xs sm:text-sm"
                disabled={disabled}
              />
            </div>

            <div className="space-y-2 max-h-56 overflow-y-auto">
              {filteredUsers.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  {availableUsers.length === 0 ? 'No users available' : 'No users match your search'}
                </p>
              ) : (
                filteredUsers.map((user) => (
                  <label key={user.id || user.email} className="flex items-center gap-3 p-2 rounded hover:bg-muted cursor-pointer transition-colors">
                    <Checkbox
                      checked={normalizedSelected.includes(String(user.email || '').toLowerCase())}
                      onCheckedChange={() => toggleUserSelection(user.email)}
                      disabled={disabled}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs sm:text-sm font-medium truncate" title={user.displayName || user.email}>
                        {user.displayName || user.email}
                      </p>
                      <p className="text-xs text-muted-foreground truncate" title={user.email}>{user.email}</p>
                    </div>
                    {user.role && <Badge variant="outline" className="text-xs">{user.role}</Badge>}
                  </label>
                ))
              )}
            </div>

            <div className="space-y-2 border-t pt-3">
              <p className="text-xs sm:text-sm font-medium">Or add manually:</p>
              <div className="flex flex-col sm:flex-row gap-2">
                <Input
                  placeholder={manualEntryPlaceholder}
                  value={manualEmail}
                  onChange={(e) => setManualEmail(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addManualEmail()}
                  className="text-xs sm:text-sm h-9"
                  disabled={disabled}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={addManualEmail}
                  disabled={disabled || !manualEmail.trim()}
                  className="h-9 text-xs sm:text-sm px-3 w-full sm:w-auto"
                >
                  Add
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

