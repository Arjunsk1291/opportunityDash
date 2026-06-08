import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { RefreshCw, Plus, X, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { PAGE_GROUPS, PAGE_LABELS, PageKey } from '@/config/navigation';
import { useAuth, UserRole, UserPageOverride } from '@/contexts/AuthContext';

const ROLE_OPTIONS: UserRole[] = ['Master', 'Admin', 'ProposalHead', 'SVP', 'BDTeam', 'Basic', 'TempUser'];

const VIEW_ONLY_PAGES = new Set<PageKey>(['dashboard', 'analytics', 'advanced_analytics', 'tender_updates']);

interface PermissionsPanelProps {
  token: string | null;
}

export function PermissionsPanel({ token }: PermissionsPanelProps) {
  const { user, pageViewAccess, pageEditAccess, userPageOverrides, pageEditActionMap, updatePermissionsV2, reloadPagePermissions } = useAuth();
  const isMaster = user?.role === 'Master';

  const [draftView, setDraftView] = useState<Record<PageKey, UserRole[]>>({} as Record<PageKey, UserRole[]>);
  const [draftEdit, setDraftEdit] = useState<Record<PageKey, UserRole[]>>({} as Record<PageKey, UserRole[]>);
  const [draftOverrides, setDraftOverrides] = useState<UserPageOverride[]>([]);
  const [newOverrideEmail, setNewOverrideEmail] = useState<Partial<Record<PageKey, string>>>({});
  const [newOverrideAccess, setNewOverrideAccess] = useState<Partial<Record<PageKey, 'view' | 'edit'>>>({});
  const [saving, setSaving] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    setDraftView({ ...pageViewAccess } as Record<PageKey, UserRole[]>);
    setDraftEdit({ ...pageEditAccess } as Record<PageKey, UserRole[]>);
    setDraftOverrides([...(userPageOverrides || [])]);
  }, [pageViewAccess, pageEditAccess, userPageOverrides]);

  const allPages = PAGE_GROUPS.flatMap((g) => g.pages);

  const toggleView = (pageKey: PageKey, role: UserRole, checked: boolean) => {
    setDraftView((prev) => {
      const current = prev[pageKey] || [];
      const next = checked ? [...current, role] : current.filter((r) => r !== role);
      const nextEdit = draftEdit[pageKey] || [];
      if (!checked) {
        setDraftEdit((e) => ({ ...e, [pageKey]: nextEdit.filter((r) => r !== role) }));
      }
      return { ...prev, [pageKey]: next };
    });
  };

  const toggleEdit = (pageKey: PageKey, role: UserRole, checked: boolean) => {
    const viewRoles = draftView[pageKey] || [];
    if (checked && !viewRoles.includes(role)) return;
    setDraftEdit((prev) => {
      const current = prev[pageKey] || [];
      const next = checked ? [...current, role] : current.filter((r) => r !== role);
      return { ...prev, [pageKey]: next };
    });
  };

  const addOverride = (pageKey: PageKey) => {
    const email = (newOverrideEmail[pageKey] || '').trim().toLowerCase();
    const access = newOverrideAccess[pageKey] || 'view';
    if (!email) return;
    setDraftOverrides((prev) => {
      const filtered = prev.filter((o) => !(o.email === email && o.pageKey === pageKey));
      return [...filtered, { email, pageKey, access }];
    });
    setNewOverrideEmail((prev) => ({ ...prev, [pageKey]: '' }));
  };

  const removeOverride = (email: string, pageKey: PageKey) => {
    setDraftOverrides((prev) => prev.filter((o) => !(o.email === email && o.pageKey === pageKey)));
  };

  const handleSave = useCallback(async () => {
    if (!isMaster) return;
    setSaving(true);
    setProgress(10);
    try {
      setProgress(40);
      await updatePermissionsV2(draftView, draftEdit, draftOverrides);
      setProgress(90);
      await reloadPagePermissions();
      setProgress(100);
      toast.success('Permissions saved');
    } catch (e) {
      toast.error((e as Error).message || 'Failed to save permissions');
    } finally {
      setSaving(false);
      setTimeout(() => setProgress(0), 1500);
    }
  }, [isMaster, updatePermissionsV2, draftView, draftEdit, draftOverrides, reloadPagePermissions]);

  const pageOverridesByKey = useCallback((pageKey: PageKey) =>
    draftOverrides.filter((o) => o.pageKey === pageKey), [draftOverrides]);

  return (
    <TooltipProvider>
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Page Permissions — View &amp; Edit by Role</CardTitle>
          <CardDescription>
            V = can view/access the page. E = can perform write actions on the page.
            Edit requires View to be enabled for the same role. Pages with no write actions have Edit disabled.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 pr-4 min-w-[160px]">Page</th>
                  {ROLE_OPTIONS.map((role) => (
                    <th key={role} className="text-center py-1 px-2 min-w-[80px]">
                      <span className="text-xs">{role}</span>
                      <div className="flex justify-center gap-1 mt-0.5">
                        <span className="text-[10px] text-muted-foreground w-5 text-center">V</span>
                        <span className="text-[10px] text-muted-foreground w-5 text-center">E</span>
                      </div>
                    </th>
                  ))}
                  <th className="text-left py-2 pl-3 min-w-[220px]">User Overrides</th>
                </tr>
              </thead>
              <tbody>
                {PAGE_GROUPS.map((group) =>
                  group.pages.map((pageKey, index) => {
                    const isViewOnly = VIEW_ONLY_PAGES.has(pageKey) || (pageEditActionMap[pageKey]?.length === 0);
                    const overrides = pageOverridesByKey(pageKey);
                    return (
                      <tr key={pageKey} className="border-b hover:bg-muted/20">
                        <td className="py-2 pr-4">
                          {index === 0 && (
                            <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                              {group.label}
                            </div>
                          )}
                          <div className="font-medium text-sm">{PAGE_LABELS[pageKey]}</div>
                        </td>
                        {ROLE_OPTIONS.map((role) => {
                          const hasView = (draftView[pageKey] || []).includes(role);
                          const hasEdit = (draftEdit[pageKey] || []).includes(role);
                          return (
                            <td key={role} className="text-center py-2 px-2">
                              <div className="flex justify-center gap-1 items-center">
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div>
                                      <Checkbox
                                        checked={hasView}
                                        onCheckedChange={(c) => toggleView(pageKey, role, Boolean(c))}
                                        disabled={!isMaster || role === 'Master'}
                                        className="h-4 w-4"
                                      />
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent>{role === 'Master' ? 'Master always has access' : `${hasView ? 'Remove' : 'Grant'} view access`}</TooltipContent>
                                </Tooltip>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <div>
                                      <Checkbox
                                        checked={hasEdit}
                                        onCheckedChange={(c) => toggleEdit(pageKey, role, Boolean(c))}
                                        disabled={!isMaster || role === 'Master' || isViewOnly || !hasView}
                                        className={`h-4 w-4 ${isViewOnly ? 'opacity-30' : ''}`}
                                      />
                                    </div>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {isViewOnly ? 'This page has no write operations' :
                                     role === 'Master' ? 'Master always has edit access' :
                                     !hasView ? 'Enable View first' :
                                     `${hasEdit ? 'Remove' : 'Grant'} edit access`}
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                            </td>
                          );
                        })}
                        <td className="py-2 pl-3">
                          <div className="space-y-1">
                            {overrides.map((o) => (
                              <div key={o.email} className="flex items-center gap-1.5 text-xs">
                                <Badge variant={o.access === 'edit' ? 'default' : 'secondary'} className="text-[10px] px-1">
                                  {o.access}
                                </Badge>
                                <span className="font-mono truncate max-w-[120px]" title={o.email}>{o.email}</span>
                                {isMaster && (
                                  <button
                                    onClick={() => removeOverride(o.email, pageKey)}
                                    className="text-muted-foreground hover:text-destructive ml-auto"
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                )}
                              </div>
                            ))}
                            {isMaster && (
                              <div className="flex items-center gap-1 mt-1">
                                <Input
                                  value={newOverrideEmail[pageKey] || ''}
                                  onChange={(e) => setNewOverrideEmail((prev) => ({ ...prev, [pageKey]: e.target.value }))}
                                  placeholder="email@…"
                                  className="h-6 text-xs w-28 px-1.5"
                                />
                                <select
                                  value={newOverrideAccess[pageKey] || 'view'}
                                  onChange={(e) => setNewOverrideAccess((prev) => ({ ...prev, [pageKey]: e.target.value as 'view' | 'edit' }))}
                                  className="h-6 text-xs border rounded px-1 bg-background"
                                >
                                  <option value="view">view</option>
                                  {!isViewOnly && <option value="edit">edit</option>}
                                </select>
                                <button
                                  onClick={() => addOverride(pageKey)}
                                  className="text-primary hover:text-primary/80"
                                  title="Add override"
                                >
                                  <Plus className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex items-start gap-1.5 text-xs text-muted-foreground">
            <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <span>
              User overrides apply only when the user's role already has at least View access.
              Edit overrides are ignored for view-only pages. Master role always has full access.
            </span>
          </div>

          {isMaster && (
            <div className="mt-4 space-y-2">
              <Button onClick={handleSave} disabled={saving} className="gap-2">
                {saving && <RefreshCw className="h-4 w-4 animate-spin" />}
                {saving ? `Saving… ${progress}%` : 'Save Permissions'}
              </Button>
              {progress > 0 && <Progress value={progress} className="h-1.5 max-w-xs transition-all" />}
            </div>
          )}
        </CardContent>
      </Card>
    </TooltipProvider>
  );
}
