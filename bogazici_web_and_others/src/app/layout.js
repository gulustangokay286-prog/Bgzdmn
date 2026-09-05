import './globals.css';

export const metadata = {
  title: 'Boğaziçi Koleji | Geleceğiniz İçin',
  description: 'Eğitimde öncü kuruluş.',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: '/logo.png',
  }
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover'
};

export default function RootLayout({ children }) {
  return (
    <html lang="tr">
      <body>
        <div id="root">{children}</div>
      </body>
    </html>
  );
}
