import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Building2, ListOrdered, CircleDollarSign } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import React from 'react';

interface ClientData {
  name: string;
  count: number;
  value: number;
}

interface ClientLeaderboardProps {
  data: ClientData[];
  onClientClick?: (clientName: string) => void;
}

export function ClientLeaderboard({ data, onClientClick }: ClientLeaderboardProps) {
  const [sortBy, setSortBy] = React.useState<'value' | 'count'>('value');

  const formatCurrency = (value: number) => {
    if (value >= 1000000) return 'AED ' + (value / 1000000).toFixed(1) + 'M';
    if (value >= 1000) return 'AED ' + (value / 1000).toFixed(0) + 'K';
    return 'AED ' + value;
  };

  const topClients = React.useMemo(() => {
    return [...data]
      .sort((a, b) => sortBy === 'value' ? b.value - a.value : b.count - a.count)
      .slice(0, 8);
  }, [data, sortBy]);

  const maxVal = Math.max(...topClients.map(c => c.value), 1);
  const maxCount = Math.max(...topClients.map(c => c.count), 1);

  return (
    <Card className="flex flex-col">
      <CardHeader className="pb-2 space-y-4">
        <div className="flex items-center justify-between gap-4">
          <CardTitle className="text-lg flex items-center gap-2 sm:gap-3">
            <Building2 className="h-5 w-5 text-primary" />
            Top Clients
          </CardTitle>
          <Tabs value={sortBy} onValueChange={(v) => setSortBy(v as 'value' | 'count')} className="h-8">
            <TabsList className="h-8 p-1 rounded-lg">
              <TabsTrigger value="value" className="h-6 text-[10px] px-2 gap-1 rounded-md">
                <CircleDollarSign className="h-3 w-3" /> Value
              </TabsTrigger>
              <TabsTrigger value="count" className="h-6 text-[10px] px-2 gap-1 rounded-md">
                <ListOrdered className="h-3 w-3" /> Count
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-hidden">
        <div className="space-y-1 sm:space-y-2">
          {topClients.length === 0 ? (
            <p className="text-xs sm:text-sm text-muted-foreground text-center py-8">No client intelligence found</p>
          ) : (
            topClients.map((client, index) => (
              <div
                key={client.name}
                className={`group space-y-1.5 p-2 sm:p-3 -mx-2 rounded-xl transition-all ${
                  onClientClick ? 'cursor-pointer hover:bg-primary/5' : ''
                }`}
                onClick={() => onClientClick?.(client.name)}
              >
                <div className="flex min-w-0 items-center justify-between gap-2 sm:gap-3">
                  <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                    <span className="text-[10px] font-bold text-muted-foreground/60 w-4 shrink-0">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span
                      className={`text-xs font-bold truncate max-w-[120px] sm:max-w-[150px] ${
                        onClientClick ? 'text-foreground group-hover:text-primary' : ''
                      }`}
                    >
                      {client.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] sm:text-xs shrink-0">
                    <span className={sortBy === 'count' ? 'font-black text-foreground' : 'text-muted-foreground'}>{client.count} opps</span>
                    <span className={`font-black ${sortBy === 'value' ? 'text-primary' : 'text-foreground'}`}>{formatCurrency(client.value)}</span>
                  </div>
                </div>
                <Progress
                  value={sortBy === 'value' ? (client.value / maxVal) * 100 : (client.count / maxCount) * 100}
                  className="h-1.5"
                />
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

