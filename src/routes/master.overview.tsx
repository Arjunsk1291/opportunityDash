import Admin from '@/pages/Admin';
import { MasterShell } from '@/components/MasterShell';

export default function MasterOverviewRoute() {
  return <MasterShell activeKey="overview"><Admin initialTab="general" /></MasterShell>;
}
