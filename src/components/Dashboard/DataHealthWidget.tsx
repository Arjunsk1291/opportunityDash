import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { CheckCircle, AlertCircle } from 'lucide-react';

interface DataHealthWidgetProps {
  healthScore: number;
  missingRows: Array<{ id: string; refNo: string; missingFields: string[] }>;
  imputedCount: number;
  missingFieldCount: number;
  totalRecords: number;
  completeRecords: number;
}

export function DataHealthWidget({ healthScore, missingRows, imputedCount, missingFieldCount, totalRecords, completeRecords }: DataHealthWidgetProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CheckCircle className="h-5 w-5 text-primary" />
          Data Health
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium">Quality Score</p>
            <p className="text-sm font-bold">{healthScore}%</p>
          </div>
          <Progress value={healthScore} className="h-2" />
        </div>

        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between p-2 bg-muted rounded">
            <span className="text-muted-foreground">Complete Records</span>
            <span className="font-mono">{completeRecords}/{totalRecords}</span>
          </div>
          <div className="flex items-center justify-between p-2 bg-muted rounded">
            <span className="text-muted-foreground">Missing Fields</span>
            <span className="font-mono">{missingFieldCount}</span>
          </div>
          <div className="flex items-center justify-between p-2 bg-muted rounded">
            <span className="text-muted-foreground">Imputed Values</span>
            <span className="font-mono">{imputedCount}</span>
          </div>
        </div>

        {missingRows.length > 0 && (
          <div className="mt-4 pt-4 border-t space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Records missing mandatory columns:</p>
            <div className="space-y-1 max-h-[150px] overflow-y-auto">
              {missingRows.slice(0, 5).map((row) => (
                <div key={row.id} className="text-xs p-2 bg-warning/10 rounded flex items-start gap-2">
                  <AlertCircle className="h-3 w-3 mt-0.5 text-warning flex-shrink-0" />
                  <div>
                    <p className="font-mono text-xs">{row.refNo}</p>
                    <p className="text-muted-foreground">{row.missingFields.join(', ')}</p>
                  </div>
                </div>
              ))}
              {missingRows.length > 5 && (
                <p className="text-xs text-muted-foreground px-2">
                  +{missingRows.length - 5} more records with missing data
                </p>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
