import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Database, Bell, Info } from 'lucide-react';
import { STATUS_MAPPING, LEAD_MAPPING, GROUP_CLASSIFICATIONS, PROBABILITY_BY_STAGE } from '@/data/opportunityData';
import { toast } from 'sonner';

const AdminSettings = () => {
  const handleSave = () => {
    toast.success('Settings saved successfully');
  };

  return (
    <div className="space-y-6">
      <Tabs defaultValue="general">
        <TabsList className="grid grid-cols-4 w-full">
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="mappings">Mappings</TabsTrigger>
          <TabsTrigger value="imputation">Imputation</TabsTrigger>
          <TabsTrigger value="notifications">Notifications</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="mt-4 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Display Settings</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>Show Imputation Flags</Label>
                  <p className="text-sm text-muted-foreground">Display warning icons on imputed values</p>
                </div>
                <Switch defaultChecked />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <Label>Compact Table View</Label>
                  <p className="text-sm text-muted-foreground">Use smaller row height in tables</p>
                </div>
                <Switch />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <Label>Show At-Risk Highlights</Label>
                  <p className="text-sm text-muted-foreground">Highlight at-risk opportunities in red</p>
                </div>
                <Switch defaultChecked />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Currency & Format</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Currency Symbol</Label>
                  <Input defaultValue="$" />
                </div>
                <div className="space-y-2">
                  <Label>Date Format</Label>
                  <Input defaultValue="YYYY-MM-DD" />
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="mappings" className="mt-4 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Database className="h-5 w-5" />
                Status Mapping
              </CardTitle>
              <CardDescription>
                Maps raw status values to canonical stages
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[250px]">
                <div className="space-y-2">
                  {Object.entries(STATUS_MAPPING).map(([raw, canonical]) => (
                    <div key={raw} className="flex items-center justify-between p-2 bg-muted/50 rounded">
                      <code className="text-sm">{raw}</code>
                      <span className="text-muted-foreground">→</span>
                      <Badge>{canonical}</Badge>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Lead Name Mapping</CardTitle>
              <CardDescription>Normalizes lead name variants to canonical names</CardDescription>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[200px]">
                <div className="space-y-2">
                  {Object.entries(LEAD_MAPPING).slice(0, 20).map(([raw, canonical]) => (
                    <div key={raw} className="flex items-center justify-between p-2 bg-muted/50 rounded">
                      <code className="text-sm">{raw}</code>
                      <span className="text-muted-foreground">→</span>
                      <Badge variant="outline">{canonical}</Badge>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Group Classifications</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {GROUP_CLASSIFICATIONS.map((group) => (
                  <Badge key={group} variant="secondary" className="text-base px-4 py-2">
                    {group}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="imputation" className="mt-4 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Info className="h-5 w-5" />
                Probability by Stage
              </CardTitle>
              <CardDescription>
                Default probability values inferred from opportunity stage
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {Object.entries(PROBABILITY_BY_STAGE).map(([stage, prob]) => (
                  <div key={stage} className="flex items-center justify-between p-3 bg-muted/50 rounded">
                    <span className="text-sm font-medium">{stage}</span>
                    <Badge variant={prob >= 50 ? "default" : "secondary"}>{prob}%</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Imputation Rules</CardTitle>
              <CardDescription>
                Rules for filling missing values
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="p-4 bg-muted/50 rounded-lg space-y-2">
                <h4 className="font-medium">Opportunity Value</h4>
                <p className="text-sm text-muted-foreground">
                  If missing, use median value for same Client Type + Group Classification.
                  Fallback to overall dataset median.
                </p>
              </div>
              <div className="p-4 bg-muted/50 rounded-lg space-y-2">
                <h4 className="font-medium">Planned Submission Date</h4>
                <p className="text-sm text-muted-foreground">
                  If missing and date_tender_recd exists, set = date_tender_recd + 21 days
                  (median days_to_submit for group).
                </p>
              </div>
              <div className="p-4 bg-muted/50 rounded-lg space-y-2">
                <h4 className="font-medium">Last Contact Date</h4>
                <p className="text-sm text-muted-foreground">
                  Extract latest date from remarks/change history.
                  Fallback: date_tender_recd + 7 days.
                </p>
              </div>
              <div className="p-4 bg-muted/50 rounded-lg space-y-2">
                <h4 className="font-medium">Assigned Lead</h4>
                <p className="text-sm text-muted-foreground">
                  Assign most frequent lead for same Client/Group.
                  If none, flag as "needs assignment".
                </p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notifications" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Bell className="h-5 w-5" />
                Notification Preferences
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <Label>At-Risk Alerts</Label>
                  <p className="text-sm text-muted-foreground">Get notified when opportunities become at-risk</p>
                </div>
                <Switch defaultChecked />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <Label>Deadline Reminders</Label>
                  <p className="text-sm text-muted-foreground">Remind 7 days before submission deadline</p>
                </div>
                <Switch defaultChecked />
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <div>
                  <Label>Data Sync Alerts</Label>
                  <p className="text-sm text-muted-foreground">Notify on SharePoint sync completion/failures</p>
                </div>
                <Switch />
              </div>
              <Separator />
              <div className="space-y-2">
                <Label>Email for Notifications</Label>
                <Input placeholder="your@email.com" />
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <div className="flex justify-end">
        <Button onClick={handleSave}>Save All Settings</Button>
      </div>
    </div>
  );
};

export default AdminSettings;
