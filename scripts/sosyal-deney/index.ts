/**
 * Sosyal medya varyant deneyi — Faz 1 (elle yayın, elle ölçüm girişi, otomatik skor).
 *
 *   npm run deney -- yeni "Kural Köşesi: ofsayt" --sure 20 \
 *       --v "A=Ofsayt mı değil mi? 3 sn'de karar ver" --v "B=Bu pozisyonda VAR ne dedi?" --v "C=Herkes yanlış biliyor"
 *   npm run deney -- olcum <id> A izlenme=1200 sure=8.5 paylasim=14 kaydet=20 begeni=90 yorum=3 takip=5
 *   npm run deney -- karar <id>
 *   npm run deney -- liste
 *
 * Veri: ~/Desktop/Scor3-sosyal-medya/deney/deneyler.json (SOSYAL_DENEY_DOSYA ile değişir).
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  AGIRLIK,
  MIN_FARK,
  MIN_IZLENME,
  PENCERE_SAAT,
  karar,
  skorla,
  type Deney,
  type Varyant,
} from './skor';

const DOSYA =
  process.env.SOSYAL_DENEY_DOSYA ??
  path.join(os.homedir(), 'Desktop/Scor3-sosyal-medya/deney/deneyler.json');

function oku(): Deney[] {
  if (!fs.existsSync(DOSYA)) return [];
  return JSON.parse(fs.readFileSync(DOSYA, 'utf8')) as Deney[];
}
function yaz(d: Deney[]) {
  fs.mkdirSync(path.dirname(DOSYA), { recursive: true });
  fs.writeFileSync(DOSYA, JSON.stringify(d, null, 2) + '\n');
}
function bul(liste: Deney[], id: string): Deney {
  const d = liste.find((x) => x.id === id);
  if (!d) {
    console.error(`Deney bulunamadı: ${id}\n(npm run deney -- liste)`);
    process.exit(1);
  }
  return d;
}

/** "--ad değer" bayrakları (tekrarlanabilir) ve kalan konumsal argümanlar. */
function ayikla(argv: string[]) {
  const bayrak: Record<string, string[]> = {};
  const konum: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      (bayrak[argv[i].slice(2)] ??= []).push(argv[++i] ?? '');
    } else konum.push(argv[i]);
  }
  return { bayrak, konum };
}

/** "19:00" ya da "2026-11-24 19:00" (yerel saat) → ISO. Boşsa şimdi. */
function zamanAyristir(s?: string): string {
  if (!s) return new Date().toISOString();
  const tam = /^\d{1,2}:\d{2}$/.test(s)
    ? `${new Date().toLocaleDateString('sv-SE')} ${s}`
    : s;
  const t = new Date(tam.replace(' ', 'T'));
  if (Number.isNaN(t.getTime())) {
    console.error(`Zaman anlaşılamadı: ${s} (örn. "19:00" ya da "2026-11-24 19:00")`);
    process.exit(1);
  }
  return t.toISOString();
}

function yeni(argv: string[]) {
  const { bayrak, konum } = ayikla(argv);
  const konu = konum[0];
  const vler = bayrak.v ?? [];
  if (!konu || vler.length < 2) {
    console.error('Kullanım: yeni "<konu>" --v "A=hook" --v "B=hook" [--sure 20] [--platform instagram] [--yayin "19:00"]');
    process.exit(1);
  }
  const videoSn = Number(bayrak.sure?.[0] ?? 20);
  const platform = bayrak.platform?.[0] ?? 'instagram';
  const yayinZamani = zamanAyristir(bayrak.yayin?.[0]);
  const varyantlar: Varyant[] = vler.map((s) => {
    const [kod, ...hook] = s.split('=');
    return { kod: kod.trim().toUpperCase(), hook: hook.join('=').trim(), platform, videoSn, yayinZamani };
  });
  const liste = oku();
  const id = `${new Date().toLocaleDateString('sv-SE')}-${liste.filter((d) => d.olusturma.slice(0, 10) === new Date().toISOString().slice(0, 10)).length + 1}`;
  liste.push({ id, konu, olusturma: new Date().toISOString(), varyantlar });
  yaz(liste);
  const ol = new Date(Date.parse(yayinZamani) + PENCERE_SAAT[0] * 3_600_000);
  const ol2 = new Date(Date.parse(yayinZamani) + PENCERE_SAAT[1] * 3_600_000);
  console.log(`Deney oluşturuldu: ${id}  (${konu})`);
  for (const v of varyantlar) console.log(`  ${v.kod}: ${v.hook}`);
  console.log(
    `\nÖlçüm penceresi: ${ol.toLocaleString('tr-TR')} – ${ol2.toLocaleString('tr-TR')}\n` +
      `Ölçümü girmek için: npm run deney -- olcum ${id} A izlenme=… sure=… paylasim=… kaydet=… begeni=… yorum=… takip=…`,
  );
}

function olcum(argv: string[]) {
  const [id, kod, ...kv] = argv;
  if (!id || !kod || kv.length === 0) {
    console.error('Kullanım: olcum <id> <kod> izlenme=… [sure=…] [paylasim=…] [kaydet=…] [begeni=…] [yorum=…] [takip=…] [zaman="2026-11-25 20:00"]');
    process.exit(1);
  }
  const liste = oku();
  const d = bul(liste, id);
  const v = d.varyantlar.find((x) => x.kod === kod.toUpperCase());
  if (!v) {
    console.error(`Varyant yok: ${kod} (var olanlar: ${d.varyantlar.map((x) => x.kod).join(', ')})`);
    process.exit(1);
  }
  const m: Record<string, string> = {};
  for (const p of kv) {
    const i = p.indexOf('=');
    if (i > 0) m[p.slice(0, i)] = p.slice(i + 1);
  }
  const sayi = (k: string) => Number(m[k] ?? 0);
  if (!m.izlenme || Number.isNaN(sayi('izlenme'))) {
    console.error('izlenme=… zorunlu');
    process.exit(1);
  }
  v.olcum = {
    zaman: zamanAyristir(m.zaman),
    izlenme: sayi('izlenme'),
    ortSureSn: m.sure != null ? Number(m.sure) : undefined,
    paylasim: sayi('paylasim'),
    kaydet: sayi('kaydet'),
    begeni: sayi('begeni'),
    yorum: sayi('yorum'),
    takip: sayi('takip'),
  };
  yaz(liste);
  console.log(`${id} / ${v.kod} ölçümü kaydedildi. Hepsi girildiyse: npm run deney -- karar ${id}`);
}

function kararVer(id?: string) {
  if (!id) {
    console.error('Kullanım: karar <id>');
    process.exit(1);
  }
  const d = bul(oku(), id);
  console.log(`\n${d.id} — ${d.konu}\n`);
  const eksik = d.varyantlar.filter((v) => !v.olcum).map((v) => v.kod);
  if (eksik.length) console.log(`Ölçümü girilmemiş: ${eksik.join(', ')}\n`);

  const yetersiz = d.varyantlar.filter((v) => v.olcum && v.olcum.izlenme < MIN_IZLENME).map((v) => v.kod);
  if (yetersiz.length) console.log(`${MIN_IZLENME} izlenmenin altında, skora girmedi: ${yetersiz.join(', ')}\n`);
  const satirlar = skorla(d.varyantlar.filter((v) => v.olcum && v.olcum.izlenme >= MIN_IZLENME));
  if (satirlar.length) {
    console.log('Varyant  Skor  İzlenme  Tamamlanma  Paylaş+Kaydet/1000  Takip/1000');
    for (const s of satirlar) {
      const hook = d.varyantlar.find((v) => v.kod === s.kod)!.hook;
      console.log(
        `${s.kod.padEnd(8)} ${String(s.skor).padEnd(5)} ${String(s.izlenme).padEnd(8)} ` +
          `${(s.oranlar.tamamlanma != null ? Math.round(s.oranlar.tamamlanma * 100) + '%' : '-').padEnd(11)} ` +
          `${(s.oranlar.paylasimKaydet * 1000).toFixed(1).padEnd(19)} ${(s.oranlar.takip * 1000).toFixed(1)}   ${hook}`,
      );
    }
    console.log();
  }

  const k = karar(d);
  for (const u of k.uyarilar) console.log(`⚠ ${u}`);
  if (k.tip === 'kazanan') {
    const v = d.varyantlar.find((x) => x.kod === k.kod)!;
    console.log(`\nKAZANAN: ${k.kod} (ikinciye göre +%${Math.round(k.fark * 100)})\n  Hook: ${v.hook}\n  → Bunu takipçilere aç / yeniden paylaş.`);
  } else {
    console.log(`\n${k.tip === 'belirsiz' ? 'KARAR YOK' : 'VERİ YOK'}: ${k.neden}`);
  }
  console.log(
    `\n(Ağırlıklar: tamamlanma %${AGIRLIK.tamamlanma * 100}, paylaşım/kaydetme %${AGIRLIK.paylasimKaydet * 100}, takip %${AGIRLIK.takip * 100}, yorum/beğeni %${AGIRLIK.yorumBegeni * 100}; ` +
      `min ${MIN_IZLENME} izlenme, min fark %${MIN_FARK * 100})`,
  );
}

function listele() {
  const liste = oku();
  if (!liste.length) return console.log('Henüz deney yok. npm run deney -- yeni …');
  for (const d of liste) {
    const girilen = d.varyantlar.filter((v) => v.olcum).length;
    console.log(`${d.id}  ${d.konu}  [${girilen}/${d.varyantlar.length} ölçüm]`);
  }
}

const [komut, ...geri] = process.argv.slice(2);
switch (komut) {
  case 'yeni': yeni(geri); break;
  case 'olcum': olcum(geri); break;
  case 'karar': kararVer(geri[0]); break;
  case 'liste': listele(); break;
  default:
    console.log('Komutlar: yeni | olcum | karar | liste  (başlık için dosya üstündeki yoruma bak)');
}
