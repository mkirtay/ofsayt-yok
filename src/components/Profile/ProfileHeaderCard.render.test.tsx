import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import ProfileHeaderCard from './ProfileHeaderCard';
import type { ProfileDto } from '@/hooks/useProfile';
import type { UserSummaryDto } from '@/pages/api/user/summary';

const profile = { id: 'u1', email: 'a@b.c', name: 'Mücahid', username: 'mmmk7', bio: null, image: null, role: 'ADMIN' } as ProfileDto;
const summary = (over: Partial<UserSummaryDto> = {}): UserSummaryDto => ({
  memberSince: '2026-09-01T10:00:00.000Z',
  credits: 55,
  premium: false,
  premiumUntil: null,
  admin: true,
  counts: { analyses: 7, favoriteTeams: 2, favoriteLeagues: 1, posts: 3, followers: 12, following: 4 },
  ...over,
});
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

describe('<ProfileHeaderCard />', () => {
  it('ad, @kullanıcıadı, üyelik tarihi, kredi rozeti, istatistikler; yönetici rozeti (premium değil)', () => {
    const t = text(renderToStaticMarkup(<ProfileHeaderCard profile={profile} summary={summary()} onEdit={() => {}} />));
    expect(t).toContain('Mücahid');
    expect(t).toContain('@mmmk7');
    expect(t).toContain('Üyelik: Eylül 2026');
    expect(t).toContain('55 ⚡');
    expect(t).toContain('YÖNETİCİ');
    expect(t).not.toContain('PREMIUM');
    expect(t).toMatch(/Açılan analiz 7 .*Favori takım 2 .*Favori lig 1 .*Gündem gönderisi 3/);
    expect(t).toContain('Profili düzenle');
  });

  it('premium rozeti yalnız premium ise (isPremiumUser); e-posta görünmez', () => {
    const html = renderToStaticMarkup(
      <ProfileHeaderCard profile={profile} summary={summary({ premium: true, admin: false, premiumUntil: '2026-11-12T00:00:00.000Z' })} onEdit={() => {}} />,
    );
    expect(html).toContain('>PREMIUM<');
    expect(html).not.toContain('YÖNETİCİ');
    expect(html).not.toContain('a@b.c');
  });

  it('özet yüklenmeden: aynı satırlar boş / "—" (yer ayrılı), düzenle düğmesi çalışır', () => {
    const onEdit = vi.fn();
    const html = renderToStaticMarkup(<ProfileHeaderCard profile={profile} summary={null} onEdit={onEdit} />);
    expect(html).not.toContain('⚡');
    expect((html.match(/>—</g) ?? []).length).toBe(4);
  });

  it('CSS: kart yüksekliği sabit (290 px, iskelet aynı sınıf), masaüstünde 320 px yapışkan kolon', () => {
    const scss = readFileSync(path.resolve(__dirname, 'profile.module.scss'), 'utf8');
    expect(scss).toMatch(/\$profile-card-h: 290px;/);
    expect(scss).toMatch(/\.headerCard \{[^}]*grid-template-rows: 72px 32px 120px;[^}]*height: \$profile-card-h;/);
    expect(scss).toMatch(/grid-template-columns: 320px minmax\(0, 1fr\);/);
    const page = readFileSync(path.resolve(__dirname, '../../pages/profile.tsx'), 'utf8');
    expect(page).toContain('styles.headerCardSkeleton');
    expect(page).toMatch(/getElementById\('name'\)[\s\S]*focus\(\)/);
  });
});
