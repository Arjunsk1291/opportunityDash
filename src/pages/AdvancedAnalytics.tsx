import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from 'recharts';
import { useData } from '@/contexts/DataContext';
import { useCurrency } from '@/contexts/CurrencyContext';
import { Badge } from '@/components/ui/badge';
import { TrendingUp, Users, Target, BarChart3, Globe, Briefcase } from 'lucide-react';
import { STAGE_ORDER } from '@/data/opportunityData';
import { normalizeCanonicalStatus, getDisplayStatus } from '@/lib/opportunityStatus';

const COLORS = ['#2dd4bf', '#818cf8', '#f59e0b', '#34d399', '#fb7185', '#38bdf8', '#a855f7', '#6366f1'];

const AdvancedAnalytics = () => {
  const { opportunities, isLoading } = useData();
  const { formatCurrency } = useCurrency();

  const verticalData = React.useMemo(() => {
    const counts: Record<string, number> = {};
    opportunities.forEach(opp => {
      const v = opp.groupClassification || 'Other';
      counts[v] = (counts[v] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [opportunities]);

  const clientTypeData = React.useMemo(() => {
    const counts: Record<string, number> = {};
    opportunities.forEach(opp => {
      const t = opp.clientType || 'Other';
      counts[t] = (counts[t] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [opportunities]);

  const statusByVertical = React.useMemo(() => {
    const map: Record<string, Record<string, number>> = {};
    const verticals = Array.from(new Set(opportunities.map(o => o.groupClassification || 'Other')));

    verticals.forEach(v => {
      map[v] = {};
      STAGE_ORDER.forEach(s => map[v][s] = 0);
    });

    opportunities.forEach(opp => {
      const v = opp.groupClassification || 'Other';
      const s = normalizeCanonicalStatus(getDisplayStatus(opp));
      if (map[v] && map[v][s] !== undefined) {
        map[v][s]++;
      }
    });

    return Object.entries(map).map(([name, stats]) => ({
      name,
      ...stats
    }));
  }, [opportunities]);

  if (isLoading) {
    return <div className="p-8 text-center text-muted-foreground">Loading advanced intelligence...</div>;
  }

  return (
    <div className="space-y-8 pb-20">
      <div className="flex flex-col gap-2">
        <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
          <BarChart3 className="h-8 w-8 text-primary" />
          Advanced Business Intelligence
        </h1>
        <p className="text-muted-foreground max-w-2xl">
          Deep-dive analysis of organizational performance, market segmentation, and pipeline velocity.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Volume', value: opportunities.length, icon: Briefcase, color: 'text-blue-500' },
          { label: 'Market Verticals', value: verticalData.length, icon: Globe, color: 'text-emerald-500' },
          { label: 'Client Segments', value: clientTypeData.length, icon: Users, color: 'text-amber-500' },
          { label: 'Data Points', value: opportunities.length * 12, icon: Target, color: 'text-violet-500' },
        ].map(stat => (
          <Card key={stat.label} className="border-border/50 bg-card/50 backdrop-blur-sm">
            <CardContent className="p-6 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{stat.label}</p>
                <p className="text-3xl font-black mt-1">{stat.value}</p>
              </div>
              <div className={`p-3 rounded-2xl bg-muted/50 ${stat.color}`}>
                <stat.icon className="h-6 w-6" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <Card className="rounded-[2rem] border-border/50 shadow-xl overflow-hidden">
          <CardHeader className="border-b bg-muted/10 p-6">
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Vertical Performance Distribution
            </CardTitle>
          </CardHeader>
          <CardContent className="p-8 h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={verticalData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: 'hsl(var(--muted-foreground))', fontSize: 12}} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: 'hsl(var(--muted-foreground))', fontSize: 12}} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '1rem', border: '1px solid hsl(var(--border))' }}
                />
                <Bar dataKey="value" fill="hsl(var(--primary))" radius={[10, 10, 0, 0]} barSize={40} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="rounded-[2rem] border-border/50 shadow-xl overflow-hidden">
          <CardHeader className="border-b bg-muted/10 p-6">
            <CardTitle className="text-lg font-bold flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              Client Segmentation
            </CardTitle>
          </CardHeader>
          <CardContent className="p-8 h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={clientTypeData}
                  cx="50%"
                  cy="50%"
                  innerRadius={80}
                  outerRadius={120}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {clientTypeData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '1rem', border: '1px solid hsl(var(--border))' }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap justify-center gap-4 mt-4">
              {clientTypeData.map((entry, index) => (
                <div key={entry.name} className="flex items-center gap-2">
                  <div className="h-3 w-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />
                  <span className="text-xs font-medium text-muted-foreground">{entry.name}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[2rem] border-border/50 shadow-xl overflow-hidden lg:col-span-2">
          <CardHeader className="border-b bg-muted/10 p-6">
            <CardTitle className="text-lg font-bold">Market Vertical x Lifecycle Stage</CardTitle>
          </CardHeader>
          <CardContent className="p-8 h-[500px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={statusByVertical} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="hsl(var(--border))" />
                <XAxis type="number" axisLine={false} tickLine={false} tick={{fill: 'hsl(var(--muted-foreground))', fontSize: 12}} />
                <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{fill: 'hsl(var(--muted-foreground))', fontSize: 12}} />
                <Tooltip
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '1rem', border: '1px solid hsl(var(--border))' }}
                />
                {STAGE_ORDER.map((stage, index) => (
                  <Bar key={stage} dataKey={stage} stackId="a" fill={COLORS[index % COLORS.length]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AdvancedAnalytics;
