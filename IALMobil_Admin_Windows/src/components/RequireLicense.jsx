import React from 'react';
import { useLicense } from '../hooks/useLicense';
import { ShieldAlert } from 'lucide-react';

const RequireLicense = ({ children, requiredPath }) => {
  const { license, loading, canAccess, error } = useLicense();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full" style={{ color: 'var(--text-muted)' }}>
        <p>Lisans kontrol ediliyor...</p>
      </div>
    );
  }

  if (!canAccess(requiredPath)) {
    return (
      <div className="flex flex-col items-center justify-center h-full" style={{ padding: '40px', textAlign: 'center' }}>
        <ShieldAlert size={64} color="var(--red)" style={{ marginBottom: '20px', opacity: 0.8 }} />
        <h2 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '10px', color: 'var(--text-main)' }}>
          Erişim Reddedildi
        </h2>
        <p style={{ fontSize: '16px', color: 'var(--text-secondary)', maxWidth: '400px' }}>
          Kurum lisansınız bu modülü kapsamıyor. Lütfen IAL Merkez ile iletişime geçerek lisans paketinizi yükseltin.
        </p>
        {error && <p style={{ color: '#ef4444', marginTop: '20px', fontSize: '12px' }}>Sistem Hatası: {error}</p>}
        {license && <p style={{ color: '#64748b', marginTop: '10px', fontSize: '12px' }}>Lisans Durumu: {license.status || 'Bilinmiyor'}</p>}
        {!license && !error && <p style={{ color: '#64748b', marginTop: '10px', fontSize: '12px' }}>Lisans verisi alınamadı (null).</p>}
      </div>
    );
  }

  return children;
};

export default RequireLicense;
