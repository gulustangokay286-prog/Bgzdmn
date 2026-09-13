"""Count an accepted entry immediately; duration remains report metadata."""
from pathlib import Path
import sys
path = Path(sys.argv[1] if len(sys.argv) > 1 else '/opt/ial-backend/yoklama.js')
source = path.read_text()
old = """    const asgari = Math.max(0, Number(c.oturumAsgariDk) || 0);
    // Kisa oturumda asgari sure oturumun tamamini asmasin.
    const esik = (a, b) => Math.min(asgari, Math.max(1, (b - a) * 0.5));

"""
source = source.replace(old, '')
old = """    const sabahVar        = sabahZamaninda        && sabahDk        >= esik(p.sabah, p.ogleCikis);
    const ogledenSonraVar = ogledenSonraZamaninda && ogledenSonraDk >= esik(p.ogledenSonra, p.okulCikis);"""
new = """    /* Kabul edilmiş bir giriş öğrencinin kuruma geldiğini o anda kesinleştirir.
       Önceden 20 dakika dolana kadar durum Beklemede kalıyor, özellikle 09:10
       sonrası okutmalarda aynı sınıfta çelişkili sonuç görünüyordu. Süreler
       denetim için tutulur; mevcut bilgisini geciktirmez. */
    const sabahVar        = sabahZamaninda;
    const ogledenSonraVar = ogledenSonraZamaninda;"""
if old not in source and new not in source:
    raise SystemExit('Expected attendance rule block not found')
source = source.replace(old, new)
path.write_text(source)
print('Accepted session entries now become present immediately')
