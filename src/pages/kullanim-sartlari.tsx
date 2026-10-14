import LegalDocPage from '@/components/LegalPage/LegalDocPage';
import { legalPagePath } from '@/config/legalPages';

export default function KullanimSartlariPage() {
  return <LegalDocPage docKey="terms" path={legalPagePath('terms')} />;
}
