import LegalDocPage from '@/components/LegalPage/LegalDocPage';
import { legalPagePath } from '@/config/legalPages';

export default function CerezPolitikasiPage() {
  return <LegalDocPage docKey="cookies" path={legalPagePath('cookies')} />;
}
