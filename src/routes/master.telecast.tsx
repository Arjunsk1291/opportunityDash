import Admin from '@/pages/Admin';
import { MasterShell } from '@/components/MasterShell';

export default function MasterTelecastRoute() {
  return <MasterShell activeKey="telecast"><Admin initialTab="telecast" /></MasterShell>;
}
