import { TrendingUp, TrendingDown, DollarSign, Target, Trophy, XCircle, AlertTriangle, Clock } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { useCurrency } from '@/contexts/CurrencyContext';

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
  onKPIClick?: (kpiType: 'active' | 'pipeline' | 'won' | 'closed' | 'upcoming') => void;
}

export function KPICards({ stats, onKPIClick }: KPICardsProps) {
  const { currency, convertValue } = useCurrency();

  const formatCurrencyValue = (value: number) => {
    const converted = convertValue(value);
    const symbol = currency === 'AED' ? 'د.إ' : '$';
    if (converted >= 1000000) return `${symbol}${(converted / 1000000).toFixed(1)}M`;
    if (converted >= 1000) return `${symbol}${(converted / 1000).toFixed(0)}K`;
    return `${symbol}${converted.toFixed(0)}`;
  };

  const kpis = [
    { label: 'Active Opportunities', value: stats.totalActive, icon: Target, color: 'text-primary', bgColor: 'bg-primary/10', type: 'active' as const },
    { label: 'Pipeline Value', value: formatCurrencyValue(stats.totalPipelineValue), icon: DollarSign, color: 'text-info', bgColor: 'bg-info/10', type: 'pipeline' as const },
    { label: 'Won', value: `${stats.wonCount} (${formatCurrencyValue(stats.wonValue)})`, icon: Trophy, color: 'text-success', bgColor: 'bg-success/10', type: 'won' as const },
    { label: 'Closed', value: `${stats.lostCount} (${formatCurrencyValue(stats.lostValue)})`, icon: XCircle, color: 'text-muted-foreground', bgColor: 'bg-muted', type: 'closed' as const },
    { label: 'Upcoming Deadlines', value: stats.atRiskCount, icon: Clock, color: 'text-pending', bgColor: 'bg-pending/10', type: 'upcoming' as const },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
      {kpis.map((kpi, index) => (
        <Card 
          key={kpi.label} 
          className={`p-4 transition-all duration-300 hover:-translate-y-1 animate-fade-in ${onKPIClick ? 'cursor-pointer hover:shadow-lg hover:ring-2 hover:ring-primary/20' : ''}`}
          style={{ animationDelay: `${index * 50}ms` }}
          onClick={() => onKPIClick?.(kpi.type)}
        >
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