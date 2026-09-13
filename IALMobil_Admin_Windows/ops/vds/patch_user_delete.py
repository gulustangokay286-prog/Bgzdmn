#!/usr/bin/env python3
"""
DELETE /api/users/:id — kalici silme (idempotent yama).

Onceden silme yalnizca `aktif=FALSE` yapiyordu; api_users gorunumu bu satiri
'passive' durumuyla listelemeye devam ettigi icin panelde kisi "Pasif"
olarak kaliyordu. Idare kaydin TAMAMEN gitmesini istiyor.

Sema zaten buna gore kurulu: kisiye ait satirlar (kimlik, roller, telefonlar,
ogrenci/personel/veli, gecisler, devamsizlik, randevular...) ON DELETE CASCADE,
"kim yapti" referanslari SET NULL. Yalnizca bes sutun NO ACTION ve hepsi
NULL kabul ediyor; silmeden once bosaltilir:
  bildirimler.gonderen_id, devamsizlik.kaydeden_id, duyurular.yazar_id,
  gecisler.isleyen_id, qr_jeton.tuketen_id

Guvenlik: yonetici kendi hesabini silemez. Denetim kaydi silinen kisiye degil
(FK artik yok) isleme yapan yoneticiye yazilir; silinen kisi `detay`da kalir.

Kullanim: python3 patch_user_delete.py /opt/ial-backend/server.js
"""
from pathlib import Path
import sys


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f"Beklenen {label} blogu bulunamadi; dosya degistirilmedi.")
    return text.replace(old, new, 1)


path = Path(sys.argv[1] if len(sys.argv) > 1 else '/opt/ial-backend/server.js')
source = path.read_text(encoding='utf-8')
patched = source

patched = replace_once(
    patched,
    "        if (!u) return res.status(404).json({ success: false, error: 'Kullanici bulunamadi.' });\n"
    "        // Silme yerine pasiflestirme: gecis ve devamsizlik gecmisi korunur.\n"
    "        await sorgu(`UPDATE kisiler SET aktif = FALSE WHERE id = $1`, [u.kisi_id]);\n"
    "        await veri.guvenlik.yaz({ olay: 'kullanici_pasif', kisiId: u.kisi_id, ip: req.ip });\n"
    "        res.json({ success: true });\n"
    "    } catch (e) { hata(res, e); }\n"
    "});\n",
    "        if (!u) return res.status(404).json({ success: false, error: 'Kullanici bulunamadi.' });\n"
    "        if (String(u.kisi_id) === String(req.user.kisi_id))\n"
    "            return res.status(400).json({ success: false, error: 'Kendi hesabınızı silemezsiniz.' });\n"
    "\n"
    "        // KALICI SILME. Kisiye ait satirlar CASCADE ile gider; \"kim yapti\"\n"
    "        // referanslarindan NO ACTION olan besi once bosaltilir (hepsi NULL kabul eder).\n"
    "        await islem(async (t) => {\n"
    "            const id = u.kisi_id;\n"
    "            await t.query(`UPDATE bildirimler  SET gonderen_id = NULL WHERE gonderen_id = $1`, [id]);\n"
    "            await t.query(`UPDATE devamsizlik  SET kaydeden_id = NULL WHERE kaydeden_id = $1`, [id]);\n"
    "            await t.query(`UPDATE duyurular    SET yazar_id    = NULL WHERE yazar_id    = $1`, [id]);\n"
    "            await t.query(`UPDATE gecisler     SET isleyen_id  = NULL WHERE isleyen_id  = $1`, [id]);\n"
    "            await t.query(`UPDATE qr_jeton     SET tuketen_id  = NULL WHERE tuketen_id  = $1`, [id]);\n"
    "            await t.query(`DELETE FROM kisiler WHERE id = $1`, [id]);\n"
    "        });\n"
    "        await veri.guvenlik.yaz({ olay: 'kullanici_silindi', kisiId: req.user.kisi_id, ip: req.ip,\n"
    "                                  detay: { silinenKisiId: u.kisi_id, adSoyad: u.full_name, roller: u.roles } });\n"
    "        res.json({ success: true, silinen: u.kisi_id });\n"
    "    } catch (e) {\n"
    "        console.error('[HATA] kullanici_sil', e.code || '', e.constraint || '', e.detail || '', e.message);\n"
    "        if (e.code === '23503')\n"
    "            return res.status(409).json({ success: false, error: `Kayıt başka verilere bağlı, silinemedi (${e.table || e.constraint || 'ilişki'}).` });\n"
    "        hata(res, e);\n"
    "    }\n"
    "});\n",
    "kullanici silme",
)

if patched == source:
    print('Zaten uygulanmis; degisiklik yok.')
else:
    path.write_text(patched, encoding='utf-8')
    print(f'Uygulandi: {path}')
