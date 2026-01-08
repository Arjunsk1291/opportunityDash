import { GoogleSheetsConfig } from '@/components/GoogleSheetsConfig';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useData } from '@/contexts/DataContext';
import { Database, Trash2, RotateCcw } from 'lucide-react';

const Admin = () => {
  const { clearAllData, resetToMockData, opportunities } = useData();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Admin Settings</h1>
        <p className="text-muted-foreground">Manage data sources and system configuration</p>
      </div>

      {/* Google Sheets Integration */}
      <GoogleSheetsConfig />

      {/* Data Management */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="w-5 h-5" />
            Data Management
          </CardTitle>
          <CardDescription>
            Manage your opportunity data
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 border rounded-lg">
            <div>
              <p className="font-medium">Current Data</p>
              <p className="text-sm text-muted-foreground">
                {opportunities.length} opportunities loaded
              </p>
            </div>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                onClick={resetToMockData}
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Reset to Mock Data
              </Button>
              <Button 
                variant="destructive" 
                onClick={clearAllData}
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Clear All Data
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Admin;
