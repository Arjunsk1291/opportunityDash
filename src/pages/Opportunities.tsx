import { useState } from 'react';
import { useData } from '@/contexts/DataContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RefreshButton } from '@/components/RefreshButton';
import { useAutoRefresh } from '@/hooks/useAutoRefresh';

interface OpportunitiesProps {
  statusFilter?: string;
}

const Opportunities = ({ statusFilter }: OpportunitiesProps) => {
  const { opportunities } = useData();
  
  // Auto-refresh every 2 hours
  useAutoRefresh(120);

  const filteredOpportunities = statusFilter
    ? opportunities.filter(opp => opp.canonicalStage === statusFilter)
    : opportunities;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Opportunities</h1>
          {statusFilter && (
            <p className="text-muted-foreground">Filtered by: {statusFilter}</p>
          )}
        </div>
        <RefreshButton />
      </div>

      <div className="grid gap-4">
        {filteredOpportunities.map((opp) => (
          <Card key={opp.id}>
            <CardHeader>
              <div className="flex items-start justify-between">
                <div>
                  <CardTitle className="text-lg">{opp.tenderName}</CardTitle>
                  <p className="text-sm text-muted-foreground">{opp.clientName}</p>
                </div>
                <Badge>{opp.canonicalStage}</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Ref No</p>
                  <p className="font-medium">{opp.opportunityRefNo}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Value</p>
                  <p className="font-medium">${opp.opportunityValue.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Lead</p>
                  <p className="font-medium">{opp.internalLead || 'Unassigned'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Probability</p>
                  <p className="font-medium">{opp.probability}%</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default Opportunities;
