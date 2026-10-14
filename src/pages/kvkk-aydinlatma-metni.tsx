import LegalDocPage from '@/components/LegalPage/LegalDocPage';
import { legalPagePath } from '@/config/legalPages';

export default function KvkkAydinlatmaPage() {
  return <LegalDocPage docKey="kvkk" path={legalPagePath('kvkk')} />;
}
