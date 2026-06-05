import Admin from '@/pages/Admin';
import { MasterShell } from '@/components/MasterShell';

export default function MasterDataSyncRoute() {
  return <MasterShell activeKey="data-sync"><Admin initialTab="data-sync" /></MasterShell>;
}
