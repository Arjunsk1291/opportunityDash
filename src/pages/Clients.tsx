import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Building2, Search, TrendingUp, FileText, DollarSign } from 'lucide-react';
import { getClientData } from '@/data/opportunityData';
import { useData } from '@/contexts/DataContext';

const Clients = () => {
  const { opportunities } = useData();
  const [search, setSearch] = useState('');
  
  const clientStats = useMemo(() => {
    const stats: Record<string, {
      count: number;
      value: number;
      won: number;
      lost: number;
      inProgress: number;
      submitted: number;
    }> = {};

    opportunities.forEach(o => {
      if (!stats[o.clientName]) {
        stats[o.clientName] = { count: 0, value: 0, won: 0, lost: 0, inProgress: 0, submitted: 0 };
      }
      stats[o.clientName].count++;
      stats[o.clientName].value += o.opportunityValue;
      if (o.canonicalStage === 'Awarded') stats[o.clientName].won++;
      if (o.canonicalStage === 'Lost/Regretted') stats[o.clientName].lost++;
      if (o.canonicalStage === 'In Progress') stats[o.clientName].inProgress++;
      if (o.canonicalStage === 'Submitted') stats[o.clientName].submitted++;
    });

    return Object.entries(stats)
      .map(([name, data]) => ({
        name,
        ...data,
        winRate: data.won + data.lost > 0 
          ? Math.round((data.won / (data.won + data.lost)) * 100) 
          : 0,
      }))
      .sort((a, b) => b.value - a.value);
  }, [opportunities]);

  const filteredClients = useMemo(() => {
    if (!search) return clientStats;
    return clientStats.filter(c => 
      c.name.toLowerCase().includes(search.toLowerCase())
    );
  }, [clientStats, search]);

  const totalValue = clientStats.reduce((sum, c) => sum + c.value, 0);
  const totalOpps = clientStats.reduce((sum, c) => sum + c.count, 0);
  const maxValue = Math.max(...clientStats.map(c => c.value));

  const formatCurrency = (value: number) => {
    if (value >= 1000000) return `$${(value / 1000000).toFixed(1)}M`;
    if (value >= 1000) return `$${(value / 1000).toFixed(0)}K`;
    return `$${value}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Clients</h1>
        <p className="text-muted-foreground">{clientStats.length} clients in your pipeline</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Clients</p>
                <p className="text-2xl font-bold">{clientStats.length}</p>
              </div>
              <Building2 className="h-8 w-8 text-primary opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Opportunities</p>
                <p className="text-2xl font-bold">{totalOpps}</p>
              </div>
              <FileText className="h-8 w-8 text-primary opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Total Pipeline Value</p>
                <p className="text-2xl font-bold">{formatCurrency(totalValue)}</p>
              </div>
              <DollarSign className="h-8 w-8 text-success opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Avg per Client</p>
                <p className="text-2xl font-bold">{formatCurrency(totalValue / clientStats.length)}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-warning opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search clients..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Client List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredClients.map((client, index) => (
          <Card key={client.name} className="hover:shadow-lg transition-shadow">
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-muted-foreground w-6 h-6 rounded-full bg-muted flex items-center justify-center">
                    {index + 1}
                  </span>
                  <CardTitle className="text-base truncate max-w-[180px]">{client.name}</CardTitle>
                </div>
                {client.winRate > 0 && (
                  <Badge variant={client.winRate >= 50 ? "default" : "secondary"}>
                    {client.winRate}% win
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">{client.count} opportunities</span>
                <span className="font-semibold">{formatCurrency(client.value)}</span>
              </div>
              <Progress value={(client.value / maxValue) * 100} className="h-1.5" />
              <div className="flex gap-2 flex-wrap">
                {client.won > 0 && (
                  <Badge variant="outline" className="text-success border-success/30 bg-success/10 text-xs">
                    {client.won} Won
                  </Badge>
                )}
                {client.submitted > 0 && (
                  <Badge variant="outline" className="text-[hsl(var(--pending))] border-[hsl(var(--pending))]/30 bg-[hsl(var(--pending))]/10 text-xs">
                    {client.submitted} Submitted
                  </Badge>
                )}
                {client.inProgress > 0 && (
                  <Badge variant="outline" className="text-warning border-warning/30 bg-warning/10 text-xs">
                    {client.inProgress} In Progress
                  </Badge>
                )}
                {client.lost > 0 && (
                  <Badge variant="outline" className="text-destructive border-destructive/30 bg-destructive/10 text-xs">
                    {client.lost} Lost
                  </Badge>
                )}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default Clients;
