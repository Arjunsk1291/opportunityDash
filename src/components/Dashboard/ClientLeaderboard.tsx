import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Building2 } from 'lucide-react';

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
  const formatCurrency = (value: number) => {
    if (value >= 1000000) return 'AED ' + (value / 1000000).toFixed(1) + 'M';
    if (value >= 1000) return 'AED ' + (value / 1000).toFixed(0) + 'K';
    return 'AED ' + value;
  };

  const topClients = data.slice(0, 8);
  const maxValue = Math.max(...topClients.map(c => c.value), 1);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2 sm:gap-3">
          <Building2 className="h-5 w-5 text-primary" />
          Top Clients by Value
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2 sm:space-y-3">
          {topClients.length === 0 ? (
            <p className="text-xs sm:text-sm text-muted-foreground text-center py-4">No clients found</p>
          ) : (
            topClients.map((client, index) => (
              <div
                key={client.name}
                className={`space-y-1 p-2 sm:p-3 -mx-2 sm:-mx-3 rounded-lg transition-colors ${
                  onClientClick ? 'cursor-pointer hover:bg-muted' : ''
                }`}
                onClick={() => onClientClick?.(client.name)}
              >
                <div className="flex min-w-0 items-center justify-between gap-2 sm:gap-3">
                  <div className="flex min-w-0 items-center gap-2 sm:gap-3">
                    <span className="text-xs sm:text-sm font-bold text-muted-foreground w-4 sm:w-5 shrink-0">
                      {index + 1}
                    </span>
                    <span
                      className={`text-xs sm:text-sm font-medium truncate max-w-[120px] sm:max-w-[150px] ${
                        onClientClick ? 'text-primary hover:underline' : ''
                      }`}
                    >
                      {client.name}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm shrink-0">
                    <span className="text-muted-foreground">{client.count} opps</span>
                    <span className="font-semibold">{formatCurrency(client.value)}</span>
                  </div>
                </div>
                <Progress value={(client.value / maxValue) * 100} className="h-1.5" />
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

