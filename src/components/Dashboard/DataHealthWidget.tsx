import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Shield, Download, AlertCircle } from 'lucide-react';

interface DataHealthProps {
  healthScore: number;
  imputedCount: number;
  missingRows: Array<{ id: string; refNo: string; missingFields: string[] }>;
}

export function DataHealthWidget({ healthScore, imputedCount, missingRows }: DataHealthProps) {
  const getHealthColor = (score: number) => {
    if (score >= 80) return 'text-success';
    if (score >= 60) return 'text-warning';
    return 'text-destructive';
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Shield className="h-5 w-5 text-primary" />
          Data Health
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className={`text-3xl font-bold ${getHealthColor(healthScore)}`}>{healthScore}%</p>
            <p className="text-xs text-muted-foreground">Mandatory fields complete</p>
          </div>
          <div className="text-right">
            <p className="text-lg font-semibold text-warning">{imputedCount}</p>
            <p className="text-xs text-muted-foreground">Imputed values</p>
          </div>
        </div>
        <Progress value={healthScore} className="h-2" />
        
        {missingRows.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              Rows needing attention ({missingRows.length})
            </p>
            <div className="max-h-24 overflow-auto space-y-1 scrollbar-thin">
              {missingRows.slice(0, 5).map((row) => (
                <div key={row.id} className="text-xs p-1.5 bg-muted/50 rounded flex justify-between">
                  <span className="font-mono">{row.refNo}</span>
                  <span className="text-muted-foreground truncate ml-2">{row.missingFields.join(', ')}</span>
                </div>
              ))}
            </div>
          </div>
        )}
        
        <Button variant="outline" size="sm" className="w-full">
          <Download className="h-4 w-4 mr-2" />
          Export Data Health Report
        </Button>
      </CardContent>
    </Card>
  );
}
