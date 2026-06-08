import { MasterShell } from '@/components/MasterShell';
import { UsersPanel } from '@/components/Admin/UsersPanel';
import { useAuth } from '@/contexts/AuthContext';

export default function MasterUsersRoute() {
  const { token, isMaster, canPerformAction } = useAuth();
  return (
    <MasterShell activeKey="users">
      <UsersPanel
        token={token}
        isMaster={isMaster}
        canManageUsers={canPerformAction('users_manage')}
      />
    </MasterShell>
  );
}
