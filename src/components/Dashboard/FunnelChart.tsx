import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

interface FunnelData {
  stage: string;
  count: number;
  value: number;
  conversionRate: number;
}

interface FunnelChartProps {
  data: FunnelData[];
}

export function FunnelChart({ data }: FunnelChartProps) {
  const maxCount = Math.max(...data.map(d => d.count));
  const colors = ['bg-info', 'bg-warning', 'bg-pending', 'bg-success'];
  
  const formatCurrency = (value: number) => {
    if (value >= 1000000) return `AED ${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `AED ${(value / 1000).toFixed(0)}K`;
    return `AED ${value}`;
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg">Pipeline Funnel</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {data.map((item, index) => {
            const width = maxCount > 0 ? (item.count / maxCount) * 100 : 0;
            return (
              <div key={item.stage} className="relative">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm font-medium">{item.stage}</span>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{item.count} opps</span>
                    <span className="font-semibold text-foreground">{formatCurrency(item.value)}</span>
                    {index > 0 && (
                      <span className="text-primary">{item.conversionRate}%</span>
                    )}
                  </div>
                </div>
                <div className="h-8 bg-muted rounded-lg overflow-hidden">
                  <div 
                    className={`h-full ${colors[index]} transition-all duration-500 rounded-lg flex items-center justify-center`}
                    style={{ width: `${Math.max(width, 5)}%` }}
                  >
                    <span className="text-xs font-bold text-white">{item.count}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
