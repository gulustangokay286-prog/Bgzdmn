#!/usr/bin/env python3
"""
SOHBET LISTESI ZENGINLESTIRME (idempotent) — yonetici chat ekrani WhatsApp duzeni.

  GET  /api/sohbetler            : karsi_kisi_id, son_mesaj, son_mesaj_zaman,
                                   son_mesaj_gonderen alanlari eklendi (liste
                                   onizlemesi + saat + okunmamis rozeti icin)
  POST /api/sohbetler/:id/mesajlar : diger katilimcilarin okunmamis sayaci artar
  POST /api/sohbetler/:id/okundu   : cagiranin okunmamis sayaci sifirlanir

Kullanim: python3 patch_sohbet_liste.py /opt/ial-backend/rotalar.js
"""
from pathlib import Path
import sys


def replace_once(text: str, old: str, new: str, label: str) -> str:
    if new in text:
        return text
    if old not in text:
        raise SystemExit(f"Beklenen {label} blogu bulunamadi; dosya degistirilmedi.")
    return text.replace(old, new, 1)


path = Path(sys.argv[1] if len(sys.argv) > 1 else '/opt/ial-backend/rotalar.js')
s = path.read_text(encoding='utf-8')

s2 = replace_once(
    s,
    "            `SELECT s.*, sk.okunmamis FROM sohbetler s\n"
    "               JOIN sohbet_katilimci sk ON sk.sohbet_id=s.id AND sk.kisi_id=$1\n"
    "           ORDER BY s.guncellendi DESC`, [req.user.kisi_id]) }); } catch (e) { n(e); } });\n",
    "            `SELECT s.*, sk.okunmamis,\n"
    "                    (SELECT k2.kisi_id FROM sohbet_katilimci k2\n"
    "                      WHERE k2.sohbet_id = s.id AND k2.kisi_id <> $1 LIMIT 1) AS karsi_kisi_id,\n"
    "                    sm.icerik AS son_mesaj, sm.zaman AS son_mesaj_zaman, sm.gonderen_id AS son_mesaj_gonderen\n"
    "               FROM sohbetler s\n"
    "               JOIN sohbet_katilimci sk ON sk.sohbet_id=s.id AND sk.kisi_id=$1\n"
    "          LEFT JOIN LATERAL (SELECT icerik, zaman, gonderen_id FROM mesajlar m\n"
    "                              WHERE m.sohbet_id = s.id ORDER BY m.zaman DESC, m.id DESC LIMIT 1) sm ON true\n"
    "           ORDER BY s.guncellendi DESC`, [req.user.kisi_id]) }); } catch (e) { n(e); } });\n"
    "    /** Sohbeti okundu isaretle: cagiranin okunmamis sayaci sifirlanir. */\n"
    "    app.post('/api/sohbetler/:id/okundu', verifyAuth, async (req, r, n) => {\n"
    "        try {\n"
    "            await sorgu(`UPDATE sohbet_katilimci SET okunmamis = 0 WHERE sohbet_id=$1 AND kisi_id=$2`,\n"
    "                        [req.params.id, req.user.kisi_id]);\n"
    "            r.json({ success: true });\n"
    "        } catch (e) { n(e); } });\n",
    "sohbet listesi",
)
s2 = replace_once(
    s2,
    "            await sorgu(`UPDATE sohbetler SET guncellendi=now() WHERE id=$1`, [req.params.id]);\n"
    "            r.json({ success: true, kayit: m });\n",
    "            await sorgu(`UPDATE sohbetler SET guncellendi=now() WHERE id=$1`, [req.params.id]);\n"
    "            // Karsi tarafin okunmamis rozeti; gonderenin kendi sayaci degismez.\n"
    "            await sorgu(`UPDATE sohbet_katilimci SET okunmamis = COALESCE(okunmamis, 0) + 1\n"
    "                          WHERE sohbet_id=$1 AND kisi_id<>$2`, [req.params.id, req.user.kisi_id]);\n"
    "            r.json({ success: true, kayit: m });\n",
    "mesaj sonrasi okunmamis",
)

if s2 == s:
    print('Zaten uygulanmis; degisiklik yok.')
else:
    path.write_text(s2, encoding='utf-8')
    print(f'Uygulandi: {path}')
