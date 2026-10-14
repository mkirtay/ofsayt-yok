import LegalDocPage from '@/components/LegalPage/LegalDocPage';
import { legalPagePath } from '@/config/legalPages';

export default function MesafeliSatisPage() {
  return <LegalDocPage docKey="distanceSales" path={legalPagePath('distanceSales')} />;
}
