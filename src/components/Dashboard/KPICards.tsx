import { TrendingUp, TrendingDown, DollarSign, Target, Trophy, XCircle, AlertTriangle, Clock } from 'lucide-react';
import { Card } from '@/components/ui/card';

interface KPICardsProps {
  stats: {
    totalActive: number;
    totalPipelineValue: number;
    weightedPipeline: number;
    wonCount: number;
    wonValue: number;
    lostCount: number;
    lostValue: number;
    atRiskCount: number;
    avgDaysToSubmission: number;
  };
}

export function KPICards({ stats }: KPICardsProps) {
  const formatCurrency = (value: number) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
    return `$${value}`;
  };

  const kpis = [
    { label: 'Active Opportunities', value: stats.totalActive, icon: Target, color: 'text-primary', bgColor: 'bg-primary/10' },
    { label: 'Pipeline Value', value: formatCurrency(stats.totalPipelineValue), icon: DollarSign, color: 'text-info', bgColor: 'bg-info/10' },
    { label: 'Weighted Pipeline', value: formatCurrency(stats.weightedPipeline), icon: TrendingUp, color: 'text-pending', bgColor: 'bg-pending/10' },
    { label: 'Won', value: `${stats.wonCount} (${formatCurrency(stats.wonValue)})`, icon: Trophy, color: 'text-success', bgColor: 'bg-success/10' },
    { label: 'Lost', value: `${stats.lostCount} (${formatCurrency(stats.lostValue)})`, icon: XCircle, color: 'text-destructive', bgColor: 'bg-destructive/10' },
    { label: 'At Risk', value: stats.atRiskCount, icon: AlertTriangle, color: 'text-warning', bgColor: 'bg-warning/10' },
    { label: 'Avg Days to Submit', value: `${stats.avgDaysToSubmission}d`, icon: Clock, color: 'text-muted-foreground', bgColor: 'bg-muted' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
      {kpis.map((kpi, index) => (
        <Card key={kpi.label} className="p-4 hover:shadow-lg transition-all duration-300 hover:-translate-y-1 animate-fade-in" style={{ animationDelay: `${index * 50}ms` }}>
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded-lg ${kpi.bgColor}`}>
              <kpi.icon className={`h-4 w-4 ${kpi.color}`} />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground truncate">{kpi.label}</p>
              <p className={`text-lg font-bold ${kpi.color}`}>{kpi.value}</p>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
