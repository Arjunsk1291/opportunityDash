import { Target, Trophy, XCircle, Clock, ThumbsDown, Zap, Play, CheckCircle, AlertTriangle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { useCurrency } from '@/contexts/CurrencyContext';
import aedSymbol from '@/assets/aed-symbol.png';

interface KPICardsProps {
  stats: {
    totalActive: number;
    totalPipelineValue: number;
    awardedCount: number;
    awardedValue: number;
    lostCount: number;
    lostValue: number;
    regrettedCount: number;
    regrettedValue: number;
    workingCount: number;
    workingValue: number;
    toStartCount: number;
    toStartValue: number;
    ongoingCount: number;
    ongoingValue: number;
    submissionNearCount: number;
  };
  onKPIClick?: (kpiType: 'active' | 'awarded' | 'lost' | 'regretted' | 'working' | 'tostart' | 'ongoing' | 'submission') => void;
}

export function KPICards({ stats, onKPIClick }: KPICardsProps) {
  const { currency, convertValue } = useCurrency();

  const formatCurrencyValue = (value: number) => {
    const converted = convertValue(value);
    if (currency === 'AED') {
      if (converted >= 1000000) return { symbol: 'aed', value: `${(converted / 1000000).toFixed(1)}M` };
      if (converted >= 1000) return { symbol: 'aed', value: `${(converted / 1000).toFixed(0)}K` };
      return { symbol: 'aed', value: converted.toFixed(0) };
    }
    if (converted >= 1000000) return { symbol: '$', value: `${(converted / 1000000).toFixed(1)}M` };
    if (converted >= 1000) return { symbol: '$', value: `${(converted / 1000).toFixed(0)}K` };
    return { symbol: '$', value: converted.toFixed(0) };
  };

  const CurrencyDisplay = ({ value }: { value: number }) => {
    const formatted = formatCurrencyValue(value);
    if (formatted.symbol === 'aed') {
      return (
        <span className="flex items-center gap-0.5">
          <img src={aedSymbol} alt="AED" className="h-4 w-4 inline-block dark:invert" />
          {formatted.value}
        </span>
      );
    }
    return <span>{formatted.symbol}{formatted.value}</span>;
  };

  const AedIcon = () => (
    <img src={aedSymbol} alt="AED" className="h-4 w-4 dark:invert" />
  );

  const DollarIcon = () => (
    <span className="text-sm font-bold">$</span>
  );

  const kpis = [
    { 
      label: 'Active Tenders', 
      displayValue: stats.totalActive,
      Icon: Target, 
      color: 'text-primary', 
      bgColor: 'bg-primary/10', 
      type: 'active' as const 
    },
    { 
      label: 'Total Active Value', 
      currencyValue: stats.totalPipelineValue, 
      isCurrency: true,
      Icon: currency === 'AED' ? AedIcon : DollarIcon,
      color: 'text-info', 
      bgColor: 'bg-info/10', 
      type: 'awarded' as const 
    },
    { 
      label: 'Awarded', 
      currencyValue: stats.awardedValue, 
      displayValue: stats.awardedCount,
      isCurrency: true,
      showCount: true,
      Icon: Trophy, 
      color: 'text-success', 
      bgColor: 'bg-success/10', 
      type: 'awarded' as const 
    },
    { 
      label: 'Lost', 
      currencyValue: stats.lostValue, 
      displayValue: stats.lostCount,
      isCurrency: true,
      showCount: true,
      Icon: XCircle, 
      color: 'text-destructive', 
      bgColor: 'bg-destructive/10', 
      type: 'lost' as const 
    },
    { 
      label: 'Regretted', 
      currencyValue: stats.regrettedValue, 
      displayValue: stats.regrettedCount,
      isCurrency: true,
      showCount: true,
      Icon: ThumbsDown, 
      color: 'text-muted-foreground', 
      bgColor: 'bg-muted', 
      type: 'regretted' as const 
    },
    { 
      label: 'Working', 
      currencyValue: stats.workingValue, 
      displayValue: stats.workingCount,
      isCurrency: true,
      showCount: true,
      Icon: Zap, 
      color: 'text-warning', 
      bgColor: 'bg-warning/10', 
      type: 'working' as const 
    },
    { 
      label: 'To Start', 
      currencyValue: stats.toStartValue, 
      displayValue: stats.toStartCount,
      isCurrency: true,
      showCount: true,
      Icon: Play, 
      color: 'text-pending', 
      bgColor: 'bg-pending/10', 
      type: 'tostart' as const 
    },
    { 
      label: 'Ongoing', 
      currencyValue: stats.ongoingValue, 
      displayValue: stats.ongoingCount,
      isCurrency: true,
      showCount: true,
      Icon: CheckCircle, 
      color: 'text-cyan-600', 
      bgColor: 'bg-cyan-600/10', 
      type: 'ongoing' as const 
    },
    { 
      label: 'Submission Near', 
      displayValue: stats.submissionNearCount,
      Icon: AlertTriangle, 
      color: 'text-orange-600', 
      bgColor: 'bg-orange-600/10', 
      type: 'submission' as const 
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-9 gap-3">
      {kpis.map((kpi, index) => (
        <Card 
          key={kpi.label} 
          className={`p-3 transition-all duration-300 hover:-translate-y-1 animate-fade-in ${onKPIClick ? 'cursor-pointer hover:shadow-lg hover:ring-2 hover:ring-primary/20' : ''}`}
          style={{ animationDelay: `${index * 50}ms` }}
          onClick={() => onKPIClick?.(kpi.type)}
        >
          <div className="flex flex-col items-start gap-2">
            <div className={`p-2 rounded-lg ${kpi.bgColor}`}>
              <div className={`h-4 w-4 flex items-center justify-center ${kpi.color}`}>
                <kpi.Icon />
              </div>
            </div>
            <div className="min-w-0 w-full">
              <p className="text-xs text-muted-foreground truncate">{kpi.label}</p>
              <p className={`text-sm font-bold ${kpi.color} break-words`}>
                {kpi.isCurrency ? (
                  kpi.showCount ? (
                    <span className="flex flex-col gap-0.5">
                      <span className="text-xs">{kpi.displayValue}</span>
                      <CurrencyDisplay value={kpi.currencyValue!} />
                    </span>
                  ) : (
                    <CurrencyDisplay value={kpi.currencyValue!} />
                  )
                ) : (
                  kpi.displayValue
                )}
              </p>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
