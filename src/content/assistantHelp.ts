/**
 * AI Asistan — site yardımı (`get_site_help` aracı). Fiyatlar config/creditPackages.ts'ten türetilir (tek kaynak).
 * Metinler olgusal ve kısa; asistan bunları kendi cümleleriyle aktarır.
 */
import { CREDIT_PACKAGES, PREMIUM_PLANS, formatTry } from '@/config/creditPackages';
import { ANALYSIS_UNLOCK_COST } from '@/lib/analysisUnlock';

export const ASSISTANT_HELP_TOPICS = ['credits', 'premium', 'analysis', 'account', 'assistant'] as const;
export type AssistantHelpTopic = (typeof ASSISTANT_HELP_TOPICS)[number];

export type AssistantHelpEntry = { facts: string[]; links: Array<{ label: string; href: string }> };

export function assistantHelp(topic: AssistantHelpTopic, locale: 'tr' | 'en'): AssistantHelpEntry {
  const tr = locale === 'tr';
  const packages = CREDIT_PACKAGES.map((p) => `${p.credits} ${tr ? 'kredi' : 'credits'}: ${formatTry(p.priceKurus)}`).join(' · ');
  const plans = PREMIUM_PLANS.map((p) => `${tr ? (p.key === 'monthly' ? 'aylık' : 'yıllık') : p.key}: ${formatTry(p.priceKurus)}`).join(' · ');
  const creditsLink = { label: tr ? 'Krediler' : 'Credits', href: '/credits' };
  switch (topic) {
    case 'credits':
      return {
        facts: tr
          ? [`Kredi paketleri (KDV dahil): ${packages}.`, `1 kredi = ${ANALYSIS_UNLOCK_COST} AI maç analizi açma.`, 'Krediler süresizdir.', 'Açılan analiz kullanıcıya kalıcı olarak açık kalır.']
          : [`Credit packs (VAT included): ${packages}.`, `1 credit unlocks ${ANALYSIS_UNLOCK_COST} AI match analysis.`, 'Credits do not expire.', 'An unlocked analysis stays unlocked for the user.'],
        links: [creditsLink],
      };
    case 'premium':
      return {
        facts: tr
          ? [`Premium (KDV dahil): ${plans}.`, 'Premium: sınırsız analiz açma, reklamsız kullanım ve daha yüksek günlük asistan mesaj hakkı.']
          : [`Premium (VAT included): ${plans}.`, 'Premium: unlimited analysis unlocks, no ads and a higher daily assistant message allowance.'],
        links: [creditsLink],
      };
    case 'analysis':
      return {
        facts: tr
          ? [
              'AI maç analizi öne çıkan maçlar için (Süper Lig, Türk takımlarının Avrupa maçları, büyük liglerin zirve maçları) maçtan yaklaşık 3 saat önce hazırlanır.',
              'Herkes ücretsiz önizlemeyi (kısa özet + en olası sonuç) görür; tamamı 1 krediyle ya da premium ile açılır.',
              'Maç bitince analiz herkese açılır.',
              'Analizler bilgi amaçlı istatistiksel tahmindir.',
            ]
          : [
              'AI match analyses are prepared about 3 hours before kick-off for featured matches (Süper Lig, Turkish clubs in Europe, top-of-the-table games in the big leagues).',
              'Everyone sees the free preview (short summary + most likely result); the full analysis unlocks with 1 credit or premium.',
              'After the match ends the analysis is open to everyone.',
              'Analyses are informational statistical predictions.',
            ],
        links: [{ label: tr ? 'AI analiz isabeti' : 'AI analysis accuracy', href: '/ai-istatistikleri' }, creditsLink],
      };
    case 'account':
      return {
        facts: tr
          ? ['Hesap ayarları, kredi geçmişi ve açılan analizler profil sayfasındadır.', 'Giriş e-posta/şifre ya da Google ile yapılır.']
          : ['Account settings, credit history and unlocked analyses are on the profile page.', 'Sign in with e-mail/password or Google.'],
        links: [{ label: tr ? 'Profil' : 'Profile', href: '/profile' }],
      };
    case 'assistant':
    default:
      return {
        facts: tr
          ? ['Asistan yalnız Ofsayt Yok verisini kullanır: fikstür, canlı skor, puan durumu, gol krallığı, takım bilgisi, hazır maç analizi ve futbol kuralları.', 'Günlük mesaj hakkı: misafir 3, üye 15, premium 50.']
          : ['The assistant only uses Ofsayt Yok data: fixtures, live scores, standings, top scorers, team info, ready match analyses and the laws of the game.', 'Daily messages: guest 3, member 15, premium 50.'],
        links: [],
      };
  }
}
