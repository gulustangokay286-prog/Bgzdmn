import QRCodeRedirect from '@/components/QRCodeRedirect';

export const metadata = {
  title: 'Güvenli Geçiş | Boğaziçi Koleji',
  description: 'Boğaziçi Koleji karekod ile güvenli kurum giriş ve çıkış ekranı.',
  robots: { index: false, follow: false },
};

export const viewport = {
  // Ekranin ust bandi acik zemin; durum cubugu ona uymali.
  themeColor: '#f8fafc',
  colorScheme: 'light',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
  // Klavye acildiginda duzen gorunumu de kuculsun; boylece sabit kutu
  // ekranin disina tasmaz ve sayfa kendiliginden yukari kaymaz.
  interactiveWidget: 'resizes-content',
};

/*
 * SUNUCUDAN GELEN KRITIK STIL
 *
 * Kayma hatasi React devreye girmeden once basliyordu: ilk boyamada belge hâlâ
 * kaydirilabilir oluyor, mobil tarayici adres cubugunu toplarken sayfayi yukari
 * itiyor ve arkadaki beyaz govde gorunuyordu. Bu yuzden kilit JS'e birakilmaz,
 * HTML ile birlikte gelir.
 */
const KRITIK_STIL = `
html, body {
  margin: 0;
  padding: 0;
  /* JS olcunun sonucunu --gate-h'e yazar; bu yalnizca ilk boyamadaki yedek.
     Bkz. Gate.css > TEK YUKSEKLIK KAYNAGI. */
  height: var(--gate-h, 100%);
  overflow: hidden;
  overscroll-behavior: none;
  color: #ffffff;
  -webkit-tap-highlight-color: transparent;
}
/* Klavye acilinca ekranin altinda kalan serit ve tasma alani bu rengi gosterir;
   alt bolumun laciverdiyle ayni olmali, yoksa klavyenin cevresinde koyu bir
   bant olusuyor. */
html { background-color: #1e3a8a; }
/* Govde SABITLENMEZ. Sabitlenmis bir govde, icindeki kutunun duzen gorunumune
   gore konumlanmasina yol aciyor ve Chrome/iOS'ta ekran arac cubugunun
   arkasindan basliyordu. Kaydirma zaten overflow:hidden ile kapali. */
body { width: 100%; background-color: #1e3a8a; }
#root { height: 100%; background-color: transparent; }
`;

export default function QRPage() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: KRITIK_STIL }} />
      <QRCodeRedirect />
    </>
  );
}
