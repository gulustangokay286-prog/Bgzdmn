"use client";
import React, { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { X, ArrowRight } from 'lucide-react';
import './News.css';

const formatTurkishDate = (rawDate) => {
  if (!rawDate) return '';
  try {
    let d;
    if (typeof rawDate?.toDate === 'function') {
      d = rawDate.toDate();
    } else if (rawDate instanceof Date) {
      d = rawDate;
    } else if (typeof rawDate === 'number') {
      d = new Date(rawDate);
    } else if (typeof rawDate === 'string') {
      d = new Date(rawDate);
    }
    if (d && !isNaN(d.getTime())) {
      return d.toLocaleDateString('tr-TR', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
      });
    }
  } catch (err) {
    console.error('Tarih hatasi:', err);
  }
  return '';
};

const News = () => {
  const [newsItems, setNewsItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedNews, setSelectedNews] = useState(null);

  useEffect(() => {
    try {
      const q = collection(db, 'announcements');
      const unsubscribe = onSnapshot(q, (snapshot) => {
        const items = snapshot.docs.map((doc) => {
          const data = doc.data();
          const createdAtMillis = data.createdAt?.toMillis ? data.createdAt.toMillis() : (data.timestamp?.toMillis ? data.timestamp.toMillis() : (data.createdAt || 0));
          
          // Sadece admin panelden yüklenmiş gerçek görsel varsa al, ASLA mock görsel koyma
          const actualImage = data.imageUrl || data.image || null;

          return {
            id: doc.id,
            title: data.title || '',
            excerpt: data.content || data.description || '',
            category: data.category || 'Duyuru',
            pinned: Boolean(data.pinned || data.isPinned),
            image: actualImage,
            date: formatTurkishDate(data.createdAt || data.timestamp) || 'Yakın Tarih',
            createdAtMillis
          };
        });

        // Sabitlenenler en başta, ardından en yeni tarihe göre sırala
        items.sort((a, b) => {
          if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
          return (b.createdAtMillis || 0) - (a.createdAtMillis || 0);
        });

        setNewsItems(items);
        setLoading(false);
      }, (error) => {
        console.error('Duyurular hatasi:', error);
        setLoading(false);
      });

      return () => unsubscribe();
    } catch (e) {
      console.error('Firestore baglanti hatasi:', e);
      setLoading(false);
    }
  }, []);

  return (
    <section className="news-section" id="haberler">
      <div className="container">
        {/* Sade ve Kurumsal Başlık */}
        <div className="news-section-header">
          <h2>Haberler & Duyurular</h2>
          <div className="news-header-line"></div>
          <p className="news-subtitle">Boğaziçi Koleji'nden en güncel haberler ve resmi bilgilendirmeler</p>
        </div>

        {loading ? (
          <div className="news-loading-state">
            <p>Duyurular yükleniyor...</p>
          </div>
        ) : newsItems.length === 0 ? (
          <div className="news-empty-state">
            <p>Henüz yayınlanmış bir duyuru bulunmuyor.</p>
          </div>
        ) : (
          <div className="news-cards-grid">
            {newsItems.map((item) => (
              <article 
                className={`news-card-simple ${!item.image ? 'no-image-card' : ''}`}
                key={item.id} 
                onClick={() => setSelectedNews(item)}
              >
                {/* Sadece gerçek görsel varsa göster, yoksa hiçbir placeholder basma */}
                {item.image && (
                  <div className="news-card-img-wrap">
                    <img 
                      src={item.image} 
                      alt={item.title}
                    />
                  </div>
                )}

                {/* İçerik Alanı */}
                <div className="news-card-body-simple">
                  <div className="news-meta-row">
                    <span className="news-cat-badge">{item.category}</span>
                    <span className="news-date-text">{item.date}</span>
                  </div>

                  <h3 className="news-card-title-simple">{item.title}</h3>
                  <p className="news-card-excerpt-simple">{item.excerpt}</p>

                  <div className="news-card-footer-simple">
                    <span className="news-read-more">
                      <span>Devamını Oku</span>
                      <ArrowRight size={14} />
                    </span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {/* Sade Detay Modalı */}
      {selectedNews && (
        <div className="news-modal-overlay" onClick={() => setSelectedNews(null)}>
          <div className="news-modal-box" onClick={(e) => e.stopPropagation()}>
            <button 
              className="news-modal-close-btn" 
              onClick={() => setSelectedNews(null)}
              aria-label="Kapat"
            >
              <X size={18} />
            </button>

            {/* Sadece gerçek görsel varsa modalda göster */}
            {selectedNews.image && (
              <div className="news-modal-img-area">
                <img 
                  src={selectedNews.image} 
                  alt={selectedNews.title} 
                />
              </div>
            )}

            <div className="news-modal-body-area">
              <div className="news-modal-meta-header">
                <span className="news-cat-badge">{selectedNews.category}</span>
                <span className="news-date-text">{selectedNews.date}</span>
              </div>

              <h2 className="news-modal-main-title">{selectedNews.title}</h2>
              <div className="news-modal-sep"></div>

              <div className="news-modal-paragraphs">
                {selectedNews.excerpt.split(String.fromCharCode(10)).map((paragraph, idx) => (
                  paragraph.trim() ? <p key={idx}>{paragraph}</p> : <br key={idx} />
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default News;
