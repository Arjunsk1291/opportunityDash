import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
  AreaChart,
  Area,
} from 'recharts';
import { Building2, Target, Calendar, DollarSign } from 'lucide-react';
import { 
  calculateSummaryStats,
  getClientData,
} from '@/data/opportunityData';
import { useData } from '@/contexts/DataContext';
import { useCurrency } from '@/contexts/CurrencyContext';

const COLORS = ['hsl(199, 89%, 48%)', 'hsl(38, 92%, 50%)', 'hsl(262, 83%, 58%)', 'hsl(142, 76%, 36%)', 'hsl(0, 84%, 60%)', 'hsl(220, 9%, 46%)'];

const Analytics = () => {
  const { opportunities } = useData();
  const { convertValue } = useCurrency();
  
  const stats = useMemo(() => calculateSummaryStats(opportunities), [opportunities]);
  const clientData = useMemo(() => getClientData(opportunities), [opportunities]);

  // Stage distribution
  const stageData = useMemo(() => {
    const counts: Record<string, number> = {};
    opportunities.forEach(o => {
      counts[o.canonicalStage] = (counts[o.canonicalStage] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [opportunities]);

  // Group distribution
  const groupData = useMemo(() => {
    const counts: Record<string, { count: number; value: number }> = {};
    opportunities.forEach(o => {
      if (!counts[o.groupClassification]) {
        counts[o.groupClassification] = { count: 0, value: 0 };
      }
      counts[o.groupClassification].count++;
      counts[o.groupClassification].value += o.opportunityValue;
    });
    return Object.entries(counts).map(([name, data]) => ({
      name,
      count: data.count,
      value: data.value / 1000000,
    }));
  }, [opportunities]);

  // Monthly trend
  const monthlyTrend = useMemo(() => {
    const months: Record<string, { count: number; value: number }> = {};
    opportunities.forEach(o => {
      if (o.dateTenderReceived) {
        const month = o.dateTenderReceived.substring(0, 7);
        if (!months[month]) {
          months[month] = { count: 0, value: 0 };
        }
        months[month].count++;
        months[month].value += o.opportunityValue;
      }
    });
    return Object.entries(months)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, data]) => ({
        month: new Date(month + '-01').toLocaleDateString('en-US', { month: 'short', year: '2-digit' }),
        count: data.count,
        value: data.value / 1000000,
      }));
  }, [opportunities]);

  // ✅ UPDATED: Format currency as AED
  const formatCurrencyAED = (value: number) => {
    const convertedValue = convertValue(value);
    if (convertedValue >= 1000000) return `AED ${(convertedValue / 1000000).toFixed(1)}M`;
    if (convertedValue >= 1000) return `AED ${(convertedValue / 1000).toFixed(0)}K`;
    return `AED ${convertedValue.toFixed(0)}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Analytics</h1>
        <p className="text-muted-foreground">Pipeline performance and insights</p>
      </div>

      {/* Summary Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold">{stats.totalActive}</p>
            <p className="text-xs text-muted-foreground">Active Opps</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold text-success">{stats.wonCount}</p>
            <p className="text-xs text-muted-foreground">Won</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold text-destructive">{stats.lostCount}</p>
            <p className="text-xs text-muted-foreground">Lost</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold text-warning">{stats.atRiskCount}</p>
            <p className="text-xs text-muted-foreground">At Risk</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold">{formatCurrencyAED(stats.totalPipelineValue)}</p>
            <p className="text-xs text-muted-foreground">Pipeline Value</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 text-center">
            <p className="text-2xl font-bold">{formatCurrencyAED(stats.weightedPipeline)}</p>
            <p className="text-xs text-muted-foreground">Weighted Value</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 1 */}
      <div className="grid grid-cols-1 gap-6">
        {/* Stage Distribution Pie */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Target className="h-5 w-5 text-primary" />
              Stage Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stageData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {stageData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Group Performance Bar */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Building2 className="h-5 w-5 text-primary" />
              Group Performance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={groupData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis type="number" tickFormatter={(v) => `AED ${v}M`} />
                  <YAxis type="category" dataKey="name" width={50} />
                  <Tooltip formatter={(v: number) => [`AED ${v.toFixed(1)}M`, 'Value']} />
                  <Bar dataKey="value" fill="hsl(217, 91%, 60%)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly Trend */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              Monthly Pipeline Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={monthlyTrend}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="month" />
                  <YAxis tickFormatter={(v) => `AED ${v}M`} />
                  <Tooltip formatter={(v: number) => [`AED ${v.toFixed(1)}M`, 'Value']} />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="hsl(217, 91%, 60%)"
                    fill="hsl(217, 91%, 60%)"
                    fillOpacity={0.2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>


      </div>

      {/* Top Clients */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <DollarSign className="h-5 w-5 text-primary" />
            Top Clients by Pipeline Value
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={clientData.slice(0, 10)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis type="number" tickFormatter={(v) => `AED ${(v / 1000000).toFixed(1)}M`} />
                <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => [`AED ${(v / 1000000).toFixed(2)}M`, 'Value']} />
                <Bar dataKey="value" fill="hsl(142, 76%, 36%)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Analytics;
