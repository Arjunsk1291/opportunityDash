import { Target, Trophy, XCircle, Clock, ThumbsDown, Zap, Play, CheckCircle, AlertTriangle, FileText } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { useCurrency } from '@/contexts/CurrencyContext';
import aedSymbol from '@/assets/aed-symbol.png';

interface KPICardsProps {
  stats: {
    totalTenders: number;
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
  onKPIClick?: (kpiType: 'alltenders' | 'active' | 'awarded' | 'lost' | 'regretted' | 'working' | 'tostart' | 'ongoing' | 'submission') => void;
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
          <img src={aedSymbol} alt="AED" className="h-3 sm:h-4 w-3 sm:w-4 inline-block dark:invert" />
          {formatted.value}
        </span>
      );
    }
    return <span>{formatted.symbol}{formatted.value}</span>;
  };

  const AedIcon = () => (
    <img src={aedSymbol} alt="AED" className="h-3 sm:h-4 w-3 sm:w-4 dark:invert" />
  );

  const DollarIcon = () => (
    <span className="text-xs sm:text-sm font-bold">$</span>
  );

  const kpis = [
    { 
      label: 'Total Tenders', 
      displayValue: stats.totalTenders,
      Icon: FileText, 
      color: 'text-slate-600 dark:text-slate-400', 
      bgColor: 'bg-slate-100 dark:bg-slate-900/40', 
      type: 'alltenders' as const 
    },
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
      displayValue: stats.awardedCount,
      Icon: Trophy, 
      color: 'text-success', 
      bgColor: 'bg-success/10', 
      type: 'awarded' as const 
    },
    { 
      label: 'Lost', 
      displayValue: stats.lostCount,
      Icon: XCircle, 
      color: 'text-destructive', 
      bgColor: 'bg-destructive/10', 
      type: 'lost' as const 
    },
    { 
      label: 'Regretted', 
      displayValue: stats.regrettedCount,
      Icon: ThumbsDown, 
      color: 'text-muted-foreground', 
      bgColor: 'bg-muted', 
      type: 'regretted' as const 
    },
    { 
      label: 'Working', 
      displayValue: stats.workingCount,
      Icon: Zap, 
      color: 'text-warning', 
      bgColor: 'bg-warning/10', 
      type: 'working' as const 
    },
    { 
      label: 'To Start', 
      displayValue: stats.toStartCount,
      Icon: Play, 
      color: 'text-pending', 
      bgColor: 'bg-pending/10', 
      type: 'tostart' as const 
    },
    { 
      label: 'Ongoing', 
      displayValue: stats.ongoingCount,
      Icon: CheckCircle, 
      color: 'text-cyan-600 dark:text-cyan-400', 
      bgColor: 'bg-cyan-600/10', 
      type: 'ongoing' as const 
    },
    { 
      label: 'Submission Near', 
      displayValue: stats.submissionNearCount,
      Icon: AlertTriangle, 
      color: 'text-orange-600 dark:text-orange-400', 
      bgColor: 'bg-orange-600/10', 
      type: 'submission' as const 
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-10 gap-1.5 sm:gap-2">
      {kpis.map((kpi, index) => (
        <Card 
          key={kpi.label} 
          className={`p-1.5 sm:p-2 transition-all duration-300 hover:-translate-y-0.5 animate-fade-in min-h-[88px] sm:min-h-[96px] ${onKPIClick ? 'cursor-pointer hover:shadow-md hover:ring-2 hover:ring-primary/20' : ''}`}
          style={{ animationDelay: `${index * 50}ms` }}
          onClick={() => onKPIClick?.(kpi.type)}
        >
          <div className="flex flex-col items-start gap-1">
            <div className={`p-1 rounded-md ${kpi.bgColor}`}>
              <div className={`h-3.5 sm:h-4 w-3.5 sm:w-4 flex items-center justify-center ${kpi.color}`}>
                <kpi.Icon />
              </div>
            </div>
            <div className="min-w-0 w-full">
              <p className="text-[11px] sm:text-xs text-muted-foreground truncate leading-tight">{kpi.label}</p>
              <p className={`text-sm sm:text-base font-bold ${kpi.color} break-words leading-tight`}>
                {kpi.isCurrency ? (
                  <CurrencyDisplay value={kpi.currencyValue!} />
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
