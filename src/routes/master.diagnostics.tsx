import Admin from '@/pages/Admin';
import { MasterShell } from '@/components/MasterShell';

export default function MasterDiagnosticsRoute() {
  return <MasterShell activeKey="diagnostics"><Admin initialTab="auth-diagnostics" /></MasterShell>;
}
