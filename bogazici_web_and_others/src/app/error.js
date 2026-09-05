'use client';

export default function Error({ error, reset }) {
  return (
    <div style={{ padding: '40px', textAlign: 'center' }}>
      <h2>Bir hata oluştu</h2>
      <button onClick={() => reset()} style={{ padding: '8px 16px', marginTop: '12px' }}>
        Tekrar Dene
      </button>
    </div>
  );
}
