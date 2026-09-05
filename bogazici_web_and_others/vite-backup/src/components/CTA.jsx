import React from 'react';
import './CTA.css';

const CTA = () => {
  return (
    <section className="cta-section" id="kayit">
      <div className="cta-bg"></div>
      <div className="container cta-inner">
        <h2>Boğaziçi Kolejini yakından tanımak ister misiniz?</h2>
        <p>Okulumuz hakkında detaylı bilgi almak, kampüsümüzü ziyaret etmek veya ön kayıt yaptırmak için hemen iletişime geçin.</p>
        <div className="cta-buttons">
          <a href="#iletisim" className="btn btn-red">Ön Kayıt Yap</a>
          <a href="tel:03646660500" className="btn btn-outline-white">0 364 666 05 00</a>
        </div>
      </div>
    </section>
  );
};

export default CTA;
