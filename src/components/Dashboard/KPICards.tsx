import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, DollarSign, Award, XCircle, Clock } from 'lucide-react';
import { useCurrency } from '@/contexts/CurrencyContext';

interface SummaryStats {
  totalActive: number;
  totalPipelineValue: number;
  weightedPipeline: number;
  wonCount: number;
  wonValue: number;
  lostCount: number;
  lostValue: number;
  atRiskCount: number;
  avgDaysToSubmission: number;
}

interface KPICardsProps {
  stats: SummaryStats;
  onKPIClick?: (kpiType: 'active' | 'pipeline' | 'won' | 'closed' | 'upcoming') => void;
}

export function KPICards({ stats, onKPIClick }: KPICardsProps) {
  const { formatCurrency } = useCurrency();

  const kpis = [
    {
      title: 'Active Opportunities',
      value: stats.totalActive,
      subtitle: 'In pipeline',
      icon: TrendingUp,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
      clickType: 'active' as const,
    },
    {
      title: 'Total Pipeline Value',
      value: formatCurrency(stats.totalPipelineValue),
      subtitle: `Weighted: ${formatCurrency(stats.weightedPipeline)}`,
      icon: DollarSign,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
      clickType: 'pipeline' as const,
    },
    {
      title: 'Won Opportunities',
      value: stats.wonCount,
      subtitle: `Value: ${formatCurrency(stats.wonValue)}`,
      icon: Award,
      color: 'text-emerald-600',
      bgColor: 'bg-emerald-50',
      clickType: 'won' as const,
    },
    {
      title: 'Lost/Regretted',
      value: stats.lostCount,
      subtitle: `Value: ${formatCurrency(stats.lostValue)}`,
      icon: XCircle,
      color: 'text-red-600',
      bgColor: 'bg-red-50',
      clickType: 'closed' as const,
    },
    {
      title: 'At Risk',
      value: stats.atRiskCount,
      subtitle: 'Need attention',
      icon: Clock,
      color: 'text-orange-600',
      bgColor: 'bg-orange-50',
      clickType: 'upcoming' as const,
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
      {kpis.map((kpi) => {
        const Icon = kpi.icon;
        return (
          <Card
            key={kpi.title}
            className={`cursor-pointer hover:shadow-lg transition-shadow ${onKPIClick ? 'hover:border-primary' : ''}`}
            onClick={() => onKPIClick?.(kpi.clickType)}
          >
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{kpi.title}</CardTitle>
              <div className={`p-2 rounded-full ${kpi.bgColor}`}>
                <Icon className={`h-4 w-4 ${kpi.color}`} />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{kpi.value}</div>
              <p className="text-xs text-muted-foreground mt-1">{kpi.subtitle}</p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
