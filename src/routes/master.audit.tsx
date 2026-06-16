import { MasterShell } from '@/components/MasterShell';
import { AuditPanel } from '@/components/Admin/AuditPanel';
import { useAuth } from '@/contexts/AuthContext';

export default function MasterAuditRoute() {
  const { token } = useAuth();
  return (
    <MasterShell activeKey="audit">
      <AuditPanel token={token} />
    </MasterShell>
  );
}
