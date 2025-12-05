import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Users } from 'lucide-react';

interface LeaderData {
  name: string;
  count: number;
  value: number;
  won: number;
  lost: number;
  winRate: number;
}

interface LeaderboardWidgetProps {
  data: LeaderData[];
}

export function LeaderboardWidget({ data }: LeaderboardWidgetProps) {
  const formatCurrency = (value: number) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
    return `$${value}`;
  };

  const topLeaders = data.slice(0, 6);
  const maxValue = Math.max(...topLeaders.map(l => l.value));

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          Top Internal Leads
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {topLeaders.map((leader, index) => (
            <div key={leader.name} className="space-y-1">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-muted-foreground w-4">{index + 1}</span>
                  <span className="text-sm font-medium">{leader.name}</span>
                </div>
                <div className="flex items-center gap-3 text-xs">
                  <span className="text-muted-foreground">{leader.count} opps</span>
                  <span className="font-semibold">{formatCurrency(leader.value)}</span>
                  <span className={leader.winRate >= 50 ? 'text-success' : 'text-muted-foreground'}>
                    {leader.winRate}% win
                  </span>
                </div>
              </div>
              <Progress value={(leader.value / maxValue) * 100} className="h-1.5" />
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
