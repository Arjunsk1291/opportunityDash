import Admin from '@/pages/Admin';
import { MasterShell } from '@/components/MasterShell';

export default function MasterColumnsRoute() {
  return <MasterShell activeKey="columns"><Admin initialTab="export" /></MasterShell>;
}
