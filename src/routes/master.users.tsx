import Admin from '@/pages/Admin';
import { MasterShell } from '@/components/MasterShell';

export default function MasterUsersRoute() {
  return <MasterShell activeKey="users"><Admin initialTab="users" /></MasterShell>;
}
