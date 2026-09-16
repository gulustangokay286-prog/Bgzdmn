/**
 * OGRENCI DEVAMSIZLIK DOKUMU — PDF (yazdirma penceresi).
 *
 * Gunluk / haftalik / aylik / yillik donem icin tek ogrencinin gun gun
 * sonucunu, giris-cikis saatlerini ve o gun veliye SMS gidip gitmedigini
 * A4 sayfaya basar. Gunluk raporla ayni yazdirma yaklasimi: HTML uretilir,
 * yeni pencerede window.print() cagrilir, kullanici "PDF olarak kaydet" der.
 */
import { attendanceBadge, attendanceSession } from './attendanceReport';

const TZ = 'Europe/Istanbul';
const gun = (iso) => new Date(String(iso).slice(0, 10) + 'T12:00:00+03:00');
const tarihUzun = (iso) => gun(iso).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' });
const tarihKisa = (iso) => gun(iso).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const gunAdi = (iso) => gun(iso).toLocaleDateString('tr-TR', { weekday: 'short' });
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export const DONEMLER = [
  { id: 'gun',   label: 'Günlük' },
  { id: 'hafta', label: 'Haftalık' },
  { id: 'ay',    label: 'Aylık' },
  { id: 'yil',   label: 'Yıllık' },
  { id: 'tum',   label: 'Tümü' },
];

/** Secili donemin [baslangic, bitis] tarih anahtarlari (YYYY-MM-DD). */
export function donemAraligi(donem, referans) {
  const d = gun(referans);
  const key = (x) => new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(x);
  if (donem === 'gun') return [key(d), key(d)];
  if (donem === 'hafta') {
    const pazartesi = new Date(d); pazartesi.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const pazar = new Date(pazartesi); pazar.setDate(pazartesi.getDate() + 6);
    return [key(pazartesi), key(pazar)];
  }
  if (donem === 'ay') return [key(new Date(d.getFullYear(), d.getMonth(), 1)), key(new Date(d.getFullYear(), d.getMonth() + 1, 0))];
  if (donem === 'yil') return [key(new Date(d.getFullYear(), 0, 1)), key(new Date(d.getFullYear(), 11, 31))];
  return ['0000-01-01', '9999-12-31'];
}

export function donemBasligi(donem, [bas, bit]) {
  if (donem === 'gun') return tarihUzun(bas);
  if (donem === 'hafta') return `${tarihKisa(bas)} – ${tarihKisa(bit)} haftası`;
  if (donem === 'ay') return gun(bas).toLocaleDateString('tr-TR', { month: 'long', year: 'numeric' });
  if (donem === 'yil') return `${gun(bas).getFullYear()} yılı`;
  return 'Tüm kayıtlar';
}

const smsOzeti = (row) => {
  const liste = (row.sms || []).filter((s) => s.durum === 'sent');
  if (!liste.length) return { metin: 'Gönderilmedi', sinif: 's-yok' };
  const turler = { gate: 'geçiş', absence: 'devamsızlık', correction: 'düzeltme', broadcast: 'duyuru' };
  const dagilim = {};
  for (const s of liste) dagilim[turler[s.tur] || s.tur] = (dagilim[turler[s.tur] || s.tur] || 0) + 1;
  return { metin: `${liste.length} SMS (${Object.entries(dagilim).map(([k, v]) => `${v} ${k}`).join(', ')})`, sinif: 's-var' };
};

const satirSinifi = (row) => {
  if (row.durum === 'izinli') return 'd-izin';
  if (row.durum === 'yok') return Number(row.agirlik) >= 1 ? 'd-yok' : 'd-yarim';
  if (row.durum === 'gec' || row.gec_kalan?.length) return 'd-gec';
  if (row.durum === 'var') return 'd-var';
  return '';
};

/**
 * @param {object} p
 * @param {string} p.ad  ogrenci adi
 * @param {string} p.okulNo
 * @param {string} p.sinif
 * @param {'gun'|'hafta'|'ay'|'yil'|'tum'} p.donem
 * @param {string} p.referans  donemin icindeki herhangi bir tarih (YYYY-MM-DD)
 * @param {Array}  p.gunler    attendanceDays() ciktisi (sunucu history kayitlari)
 */
export function devamsizlikRaporuHtml({ ad, okulNo, sinif, donem, referans, gunler }) {
  const aralik = donemAraligi(donem, referans);
  const satirlar = gunler
    .filter((r) => r.tarih >= aralik[0] && r.tarih <= aralik[1])
    .sort((a, b) => a.tarih.localeCompare(b.tarih));

  const ozet = satirlar.reduce((o, r) => {
    if (r.durum === 'yok') o.devamsiz += Math.min(1, Math.max(0, Number(r.agirlik) || 0));
    if (r.durum === 'izinli') o.izinli += 1;
    if (r.durum === 'var' || r.durum === 'gec') o.mevcut += 1;
    if (r.durum === 'gec' || r.gec_kalan?.length) o.gec += 1;
    if ((r.sms || []).some((s) => s.durum === 'sent')) o.smsGun += 1;
    o.smsAdet += (r.sms || []).filter((s) => s.durum === 'sent').length;
    return o;
  }, { devamsiz: 0, izinli: 0, mevcut: 0, gec: 0, smsGun: 0, smsAdet: 0 });

  const oturum = (r, k) => {
    const s = attendanceSession(r, k);
    return `<span>${esc(s.label)}</span><span class="saat">↓ ${esc(s.entry || '—')} · ↑ ${esc(s.exit || '—')}</span>`;
  };

  const govde = satirlar.map((r) => {
    const rozet = attendanceBadge(r);
    const sms = smsOzeti(r);
    const kaynak = r.kilitli ? 'İdare (kilitli)' : r.kaynak === 'manuel' ? 'Manuel' : 'Otomatik';
    return `<tr class="${satirSinifi(r)}">
      <td class="c-tarih"><b>${esc(tarihKisa(r.tarih))}</b><span class="gun">${esc(gunAdi(r.tarih))}</span></td>
      <td class="c-oturum">${r.rol === 'ogrenci' ? oturum(r, 'sabah') : '—'}</td>
      <td class="c-oturum">${r.rol === 'ogrenci' ? oturum(r, 'ogleden_sonra') : '—'}</td>
      <td class="c-durum">${esc(rozet.label)}<span class="kaynak">${esc(kaynak)}</span></td>
      <td class="c-sebep">${esc(r.sebep || '')}</td>
      <td class="c-sms ${sms.sinif}">${esc(sms.metin)}${(r.sms || []).filter((s) => s.durum === 'sent').map((s) => `<span class="sms-satir">${esc(s.saat)} · ${esc(s.ozet)}</span>`).join('')}</td>
    </tr>`;
  }).join('');

  const baslik = donemBasligi(donem, aralik);
  const uretim = new Date().toLocaleString('tr-TR', { timeZone: TZ, dateStyle: 'short', timeStyle: 'short' });
  return `<!DOCTYPE html><html lang="tr"><head><meta charset="utf-8">
<title>${esc(ad)} — Devamsızlık Dökümü (${esc(baslik)})</title>
<meta name="author" content="Chenkron"><meta name="subject" content="Öğrenci Devamsızlık Dökümü">
<style>
  @page { size: A4 portrait; margin: 10mm; }
  * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #0f172a; margin: 0; }
  .header { border-bottom: 1.5px solid #0f172a; padding-bottom: 8px; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: flex-end; }
  .header h1 { margin: 0; font-size: 15px; text-transform: uppercase; letter-spacing: .5px; }
  .header h2 { margin: 2px 0 0; font-size: 12px; font-weight: 400; color: #475569; }
  .kisi { text-align: right; font-size: 11.5px; color: #334155; }
  .kisi b { font-size: 14px; color: #0f172a; display: block; }
  .stats { display: grid; grid-template-columns: repeat(6, 1fr); gap: 6px; margin-bottom: 12px; }
  .stat { border: 1px solid #e2e8f0; border-radius: 4px; padding: 6px 8px; background: #f8fafc; }
  .stat .v { font-size: 16px; font-weight: 700; }
  .stat .l { font-size: 9.5px; text-transform: uppercase; letter-spacing: .3px; color: #64748b; }
  .stat.k .v { color: #b91c1c; } .stat.i .v { color: #475569; } .stat.m .v { color: #15803d; } .stat.s .v { color: #1d4ed8; }
  table { width: 100%; border-collapse: collapse; font-size: 10.5px; table-layout: fixed; }
  thead tr { background: #f1f5f9; border-bottom: 1px solid #cbd5e1; }
  th { text-align: left; padding: 5px 6px; font-size: 9.5px; text-transform: uppercase; letter-spacing: .3px; color: #475569; }
  td { padding: 5px 6px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
  td span { display: block; line-height: 1.35; }
  .c-tarih { width: 68px; } .c-tarih .gun { color: #64748b; font-size: 9.5px; }
  .c-oturum { width: 108px; } .c-oturum .saat { color: #475569; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .c-durum { width: 96px; font-weight: 600; } .c-durum .kaynak { font-weight: 400; color: #64748b; font-size: 9.5px; }
  .c-sebep { color: #475569; }
  .c-sms { width: 150px; } .c-sms .sms-satir { color: #64748b; font-size: 9px; }
  .s-var { color: #1d4ed8; font-weight: 600; } .s-yok { color: #94a3b8; }
  tbody td:first-child { border-left: 5px solid transparent; }
  tr.d-yok { background: rgba(220,38,38,.12); }   tr.d-yok td:first-child { border-left-color: #dc2626; }
  tr.d-yarim { background: rgba(245,158,11,.18); } tr.d-yarim td:first-child { border-left-color: #f59e0b; }
  tr.d-gec { background: rgba(138,90,43,.14); }   tr.d-gec td:first-child { border-left-color: #8a5a2b; }
  tr.d-var { background: rgba(22,163,74,.10); }   tr.d-var td:first-child { border-left-color: #16a34a; }
  tr.d-izin { background: rgba(71,85,105,.10); }  tr.d-izin td:first-child { border-left-color: #475569; }
  .bos { padding: 24px; text-align: center; color: #64748b; font-size: 12px; border: 1px dashed #cbd5e1; border-radius: 4px; }
  .foot { margin-top: 10px; font-size: 9.5px; color: #64748b; display: flex; justify-content: space-between; }
</style></head><body>
<div class="header">
  <div><h1>Boğaziçi Koleji — Öğrenci Devamsızlık Dökümü</h1><h2>${esc(baslik)}</h2></div>
  <div class="kisi"><b>${esc(ad)}</b>Okul No: ${esc(okulNo || '—')} · Sınıf: ${esc(sinif || '—')}</div>
</div>
<div class="stats">
  <div class="stat k"><div class="v">${ozet.devamsiz.toLocaleString('tr-TR')}</div><div class="l">Özürsüz gün</div></div>
  <div class="stat i"><div class="v">${ozet.izinli}</div><div class="l">İzinli / raporlu</div></div>
  <div class="stat m"><div class="v">${ozet.mevcut}</div><div class="l">Mevcut gün</div></div>
  <div class="stat"><div class="v">${ozet.gec}</div><div class="l">Geç kalınan</div></div>
  <div class="stat s"><div class="v">${ozet.smsGun}</div><div class="l">SMS gönderilen gün</div></div>
  <div class="stat s"><div class="v">${ozet.smsAdet}</div><div class="l">Toplam SMS</div></div>
</div>
${satirlar.length ? `<table><thead><tr>
  <th>Tarih</th><th>Sabah</th><th>Öğleden sonra</th><th>Durum</th><th>Açıklama</th><th>Veliye SMS</th>
</tr></thead><tbody>${govde}</tbody></table>` : '<div class="bos">Bu dönemde kayıt yok.</div>'}
<div class="foot"><span>Kaynak: Akıllı Geçiş Sistemi</span><span>Üretim: ${esc(uretim)} · ${satirlar.length} gün</span></div>
<script>window.onload = function () { window.print(); };</script>
</body></html>`;
}

/** Yeni pencerede acar ve yazdirma diyalogunu tetikler. */
export function devamsizlikRaporuYazdir(params) {
  const html = devamsizlikRaporuHtml(params);
  const w = window.open('', '_blank');
  if (!w) throw new Error('Açılır pencere engellendi. Tarayıcının popup engelleyicisini kapatın.');
  w.document.open(); w.document.write(html); w.document.close();
  return true;
}
