import { MasterShell } from '@/components/MasterShell';
import { OverviewPanel } from '@/components/Admin/OverviewPanel';
import { useAuth } from '@/contexts/AuthContext';

export default function MasterOverviewRoute() {
  const { token, isMaster, user } = useAuth();
  return (
    <MasterShell activeKey="overview">
      <OverviewPanel token={token} isMaster={isMaster} user={user} />
    </MasterShell>
  );
}
