import React from 'react';
import './News.css';

const newsItems = [
  {
    date: '21 Haziran 2026',
    category: 'Duyuru',
    title: 'YKS 2026 Sınavına Girecek Öğrencilerimize Başarılar Dileriz',
    excerpt: 'Emek verdiniz, çalıştınız, hayal kurdunuz. Şimdi, kendinize güvenin, başarınıza inanın. Planlı çalış, hedefine odaklan.',
    image: '/hero-bg.png',
  },
  {
    date: '15 Haziran 2026',
    category: 'Etkinlik',
    title: '2. Resim Yarışması Sonuçları Açıklandı',
    excerpt: 'Boğaziçi Koleji\'nin 2025-2026 Eğitim Öğretim Yılı kapsamında düzenlediği 2. Resim Yarışması sonuçlandı.',
    image: '/hero-bg.png',
  },
  {
    date: '10 Haziran 2026',
    category: 'Başarı',
    title: 'Öğrencilerimiz Bilim Olimpiyatlarında Derece Aldı',
    excerpt: 'Çorum Boğaziçi Koleji öğrencileri ulusal bilim olimpiyatlarında büyük başarılar elde ederek okulumuzun gururunu yaşattı.',
    image: '/hero-bg.png',
  },
];

const News = () => {
  return (
    <section className="news-section" id="haberler">
      <div className="container">
        <div className="section-header">
          <h2>Haberler & Duyurular</h2>
          <p className="subtitle">Boğaziçi Koleji'nden en güncel haberler</p>
        </div>

        <div className="news-grid">
          {newsItems.map((item, i) => (
            <article className="news-card" key={i}>
              <div className="news-img">
                <img src={item.image} alt={item.title} />
                <span className="news-category">{item.category}</span>
              </div>
              <div className="news-body">
                <span className="news-date">{item.date}</span>
                <h3>{item.title}</h3>
                <p>{item.excerpt}</p>
                <a href="#" className="news-link">Devamını Oku →</a>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
};

export default News;
