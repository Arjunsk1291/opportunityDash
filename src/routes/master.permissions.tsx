import Admin from '@/pages/Admin';
import { MasterShell } from '@/components/MasterShell';

export default function MasterPermissionsRoute() {
  return <MasterShell activeKey="permissions"><Admin initialTab="users" /></MasterShell>;
}
