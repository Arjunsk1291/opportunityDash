import { useMemo } from 'react';
import { useData } from '@/contexts/DataContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RefreshButton } from '@/components/RefreshButton';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';
import { 
  calculateSummaryStats, 
  getLeaderboardData,
  calculateFunnelData 
} from '@/data/opportunityData';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const Analytics = () => {
  const { opportunities } = useData();
  
  // Auto-refresh every 2 hours
  useAutoRefresh(120);

  const stats = useMemo(() => calculateSummaryStats(opportunities), [opportunities]);
  const leaderboard = useMemo(() => getLeaderboardData(opportunities), [opportunities]);
  const funnelData = useMemo(() => calculateFunnelData(opportunities), [opportunities]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Analytics</h1>
          <p className="text-muted-foreground">Team performance and pipeline insights</p>
        </div>
        <RefreshButton />
      </div>

      {/* Summary Stats */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Total Pipeline</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">${(stats.totalPipelineValue / 1000000).toFixed(1)}M</div>
            <p className="text-xs text-muted-foreground">{stats.totalActive} active opportunities</p>
          </CardContent>
        </Card>
        
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Won</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">${(stats.wonValue / 1000000).toFixed(1)}M</div>
            <p className="text-xs text-muted-foreground">{stats.wonCount} opportunities</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">At Risk</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.atRiskCount}</div>
            <p className="text-xs text-muted-foreground">opportunities need attention</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Avg Days to Submit</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.avgDaysToSubmission}</div>
            <p className="text-xs text-muted-foreground">days average</p>
          </CardContent>
        </Card>
      </div>

      {/* Team Leaderboard */}
      <Card>
        <CardHeader>
          <CardTitle>Team Leaderboard</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={leaderboard}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="value" fill="#8884d8" name="Pipeline Value" />
              <Bar dataKey="won" fill="#82ca9d" name="Won" />
              <Bar dataKey="lost" fill="#ff8042" name="Lost" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Funnel Conversion */}
      <Card>
        <CardHeader>
          <CardTitle>Pipeline Funnel</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {funnelData.map((stage) => (
              <div key={stage.stage}>
                <div className="flex justify-between mb-1">
                  <span className="font-medium">{stage.stage}</span>
                  <span className="text-sm text-muted-foreground">
                    {stage.count} opportunities • ${(stage.value / 1000000).toFixed(1)}M
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div 
                    className="bg-primary h-2 rounded-full" 
                    style={{ width: `${stage.conversionRate}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {stage.conversionRate}% conversion rate
                </p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Analytics;
