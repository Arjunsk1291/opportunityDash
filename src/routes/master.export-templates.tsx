import Admin from '@/pages/Admin';
import { MasterShell } from '@/components/MasterShell';

export default function MasterExportTemplatesRoute() {
  return <MasterShell activeKey="export-templates"><Admin initialTab="export" /></MasterShell>;
}
