import { Target, Trophy, XCircle, Clock, ThumbsDown, Zap, Play, CheckCircle, AlertTriangle } from 'lucide-react';
import type { CSSProperties } from 'react';
import { Card } from '@/components/ui/card';
import { useCurrency } from '@/contexts/CurrencyContext';
import aedSymbol from '@/assets/aed-symbol.png';

interface KPICardsProps {
  stats: {
    totalActive: number;
    activeTenderCount: number;
    activeEoiCount: number;
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
  onKPIClick?: (kpiType: 'active' | 'quoted' | 'awarded' | 'lost' | 'regretted' | 'working' | 'tostart' | 'ongoing' | 'submission') => void;
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
      meta: [
        { label: 'Tender', value: stats.activeTenderCount, tone: 'bg-blue-500' },
        { label: 'EOI', value: stats.activeEoiCount, tone: 'bg-amber-500' },
      ],
      Icon: Target, 
      color: 'text-primary', 
      bgColor: 'bg-primary/10', 
      type: 'active' as const 
    },
    { 
      label: 'Total Quoted Value', 
      currencyValue: stats.totalPipelineValue, 
      isCurrency: true,
      Icon: currency === 'AED' ? AedIcon : DollarIcon,
      color: 'text-info', 
      bgColor: 'bg-info/10', 
      type: 'quoted' as const 
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
    <div className="overflow-x-auto">
      <div className="grid min-w-[760px] sm:min-w-0 grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-9 gap-2 sm:gap-2.5 md:gap-3 p-2 sm:p-3 md:p-4">
        {kpis.map((kpi, index) => (
          <Card
            key={kpi.label}
            className={`p-2 sm:p-3 md:p-4 transition-all duration-300 hover:-translate-y-1 animate-fade-in [animation-delay:var(--kpi-delay)] sm:[animation-delay:calc(var(--kpi-delay)+40ms)] md:[animation-delay:calc(var(--kpi-delay)+80ms)] ${onKPIClick ? 'cursor-pointer hover:shadow-lg hover:ring-2 hover:ring-primary/20' : ''}`}
            style={{ '--kpi-delay': `${index * 50}ms` } as CSSProperties}
            onClick={() => onKPIClick?.(kpi.type)}
          >
            <div className="flex min-w-0 flex-col items-start gap-2 sm:gap-2.5 md:gap-3">
              <div className={`p-2 rounded-lg ${kpi.bgColor}`}>
                <div className={`h-4 w-4 flex items-center justify-center ${kpi.color}`}>
                  <kpi.Icon />
                </div>
              </div>
              <div className="min-w-0 w-full">
                <p className="text-xs sm:text-sm text-muted-foreground truncate">{kpi.label}</p>
                <p className={`text-sm font-bold ${kpi.color} break-words`}>
                  {kpi.isCurrency ? (
                    <CurrencyDisplay value={kpi.currencyValue!} />
                  ) : (
                    kpi.displayValue
                  )}
                </p>
                {kpi.meta ? (
                  <div className="mt-2 flex flex-wrap gap-2 text-[10px] sm:text-[11px] text-muted-foreground">
                    {kpi.meta.map((item) => (
                      <span key={item.label} className="inline-flex items-center gap-1 rounded-full border border-border/60 px-2 py-0.5">
                        <span className={`h-2 w-2 rounded-full ${item.tone}`} />
                        {item.label} {item.value}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
