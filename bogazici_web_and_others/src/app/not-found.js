import Link from 'next/link';

export default function NotFound() {
  return (
    <div style={{ padding: '80px 20px', textAlign: 'center', minHeight: '60vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
      <h1 style={{ fontSize: '48px', fontWeight: 'bold', marginBottom: '16px', color: '#1E293B' }}>404</h1>
      <p style={{ fontSize: '18px', color: '#64748B', marginBottom: '24px' }}>Aradığınız sayfa bulunamadı.</p>
      <Link href="/" style={{ padding: '10px 20px', background: '#2563EB', color: '#FFF', borderRadius: '8px', textDecoration: 'none', fontWeight: '500' }}>
        Ana Sayfaya Dön
      </Link>
    </div>
  );
}
