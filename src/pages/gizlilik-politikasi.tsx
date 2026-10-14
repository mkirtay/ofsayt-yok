import LegalDocPage from '@/components/LegalPage/LegalDocPage';
import { legalPagePath } from '@/config/legalPages';

export default function GizlilikPolitikasiPage() {
  return <LegalDocPage docKey="privacy" path={legalPagePath('privacy')} />;
}
