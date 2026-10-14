import LegalDocPage from '@/components/LegalPage/LegalDocPage';
import { legalPagePath } from '@/config/legalPages';

export default function IadeVeIptalPage() {
  return <LegalDocPage docKey="refund" path={legalPagePath('refund')} />;
}
