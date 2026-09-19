import { describe, it, expect, vi } from 'vitest';
import { paginateSportmonks, collectAllPages } from './pagination';

/**
 * Sayfa içerikleri, docs/SPORTMONKS_MIGRATION.md Pass 5'te gerçekten çözülen
 * `/core/types` kayıtlarından (id 14 "Goal", id 34 "Corners", id 580 "Big
 * Chances Created" — hepsi raporun type dictionary tablolarında gerçek).
 * Raporun kendisi `/core/types`'ın tam sayfa içeriğini (id 1-53 vb.) ham JSON
 * olarak basmıyor, sadece "sayfa 1, id 1-53" diye özetliyor — bu yüzden bu
 * testte iterator MEKANİĞİ (sıralı çekim, has_more takibi, per_page geçişi)
 * doğrulanıyor; sayfa gruplama sınırları test'in kendi düzenlemesi, ama her
 * tek tek id/name değeri rapordan gerçek.
 */
type MockType = { id: number; name: string };

describe('paginateSportmonks', () => {
  it('has_more true olduğu sürece SIRAYLA sayfa çeker, false olunca durur', async () => {
    const page1: MockType[] = [{ id: 14, name: 'Goal' }, { id: 34, name: 'Corners' }];
    const page2: MockType[] = [{ id: 580, name: 'Big Chances Created' }];

    const calls: string[] = [];
    const fetchImpl = vi.fn(async (url: string) => {
      calls.push(url);
      const isPage2 = url.includes('page=2');
      const body = {
        data: isPage2 ? page2 : page1,
        pagination: { count: isPage2 ? 1 : 2, per_page: 50, has_more: !isPage2, current_page: isPage2 ? 2 : 1 },
      };
      return new Response(JSON.stringify(body), { status: 200 });
    }) as unknown as typeof fetch;

    const pages: MockType[][] = [];
    for await (const page of paginateSportmonks<MockType>({
      basePath: 'core',
      path: '/types',
      apiToken: 'test-token',
      perPage: 50,
      fetchImpl,
    })) {
      pages.push(page);
    }

    expect(pages).toEqual([page1, page2]);
    // Sıralı çağrıldığını doğrula: page=1 isteği page=2'den ÖNCE tamamlanmış olmalı.
    expect(calls[0]).toContain('page=1');
    expect(calls[1]).toContain('page=2');
    expect(calls.every((u) => u.includes('per_page=50'))).toBe(true);
  });

  it('perPage zorunlu parametre — çağıran taraf endpoine göre seçmeli (Pass 5: per_page üst sınırı endpoint bazlı)', async () => {
    const fetchImpl = vi.fn(async (url: string) => {
      expect(url).toContain('per_page=25');
      return new Response(
        JSON.stringify({ data: [], pagination: { count: 0, per_page: 25, has_more: false, current_page: 1 } }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const result = await collectAllPages<MockType>({
      basePath: 'core',
      path: '/types',
      apiToken: 'test-token',
      perPage: 25,
      fetchImpl,
    });

    expect(result).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('maxPages güvenlik ağı: has_more hep true dese bile sonsuz döngüye girmez', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({ data: [{ id: 1, name: 'x' }], pagination: { count: 1, per_page: 10, has_more: true, current_page: 1 } }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;

    const result = await collectAllPages<MockType>({
      basePath: 'core',
      path: '/types',
      apiToken: 'test-token',
      perPage: 10,
      maxPages: 3,
      fetchImpl,
    });

    expect(result.length).toBe(3);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });
});
