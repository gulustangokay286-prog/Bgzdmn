"use client";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { ShoppingBag, ArrowRight, Star, Package } from "lucide-react";
import { collection, onSnapshot, doc } from "firebase/firestore";
import { db } from "../firebase";

export default function ShopShowcase() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [settings, setSettings] = useState({
    shopShowcaseTitle: 'Okul Kıyafetleri & Yayın Setleri',
    shopShowcaseDesc: 'Kayıtlı öğrencilerimize özel indirimli fiyatlarla resmi okul ürünleri.'
  });

  useEffect(() => {
    try {
      // 1. Ürünleri Dinle
      const unsubProducts = onSnapshot(collection(db, "store_products"), (snap) => {
        const list = snap.docs.map((d) => ({
          id: d.id,
          ...d.data()
        }));
        // Öne çıkanları veya en yenileri göster (max 4)
        list.sort((a, b) => {
          if (a.isFeatured !== b.isFeatured) return a.isFeatured ? -1 : 1;
          return (b.createdAtMillis || 0) - (a.createdAtMillis || 0);
        });
        setProducts(list.slice(0, 4));
        setLoading(false);
      }, (e) => {
        console.error("ShopShowcase ürün okuma hatası:", e);
        setLoading(false);
      });

      // 2. Ayarları Dinle
      const unsubSettings = onSnapshot(doc(db, "web_settings", "hero"), (docSnap) => {
        if (docSnap.exists()) {
          const data = docSnap.data();
          setSettings(prev => ({
            ...prev,
            shopShowcaseTitle: data.shopShowcaseTitle || prev.shopShowcaseTitle,
            shopShowcaseDesc: data.shopShowcaseDesc || prev.shopShowcaseDesc
          }));
        }
      });

      return () => {
        unsubProducts();
        unsubSettings();
      };
    } catch (err) {
      console.error("ShopShowcase bağlantı hatası:", err);
      setLoading(false);
    }
  }, []);

  return (
    <section className="shop-showcase-section">
      <div className="container">
        <div className="shop-head-row">
          <div className="shop-head-left">
            <span className="sec-tag">KURUMSAL MAĞAZA</span>
            <h2>{settings.shopShowcaseTitle}</h2>
            <p>{settings.shopShowcaseDesc}</p>
          </div>
          <Link href="/magaza" className="btn-all-shop">
            <span>Tüm Mağazayı Gör ({products.length > 0 ? `${products.length}+ Ürün` : 'Mağaza'})</span>
            <ArrowRight size={16} />
          </Link>
        </div>

        {loading ? (
          <div className="shop-grid-showcase">
            {[1, 2, 3, 4].map((n) => (
              <div className="shop-item-skeleton" key={n} />
            ))}
          </div>
        ) : products.length === 0 ? (
          <div className="shop-empty-state">
            <div className="empty-icon-circle">
              <ShoppingBag size={30} />
            </div>
            <h3>Şu anlık mağazada ürün bulunmamaktadır</h3>
            <p>2026-2027 eğitim dönemi kurumsal okul kıyafetleri ve yayın setleri çok yakında eklenecektir.</p>
          </div>
        ) : (
          <div className="shop-grid-showcase">
            {products.map((item) => (
              <Link href="/magaza" className="shop-item-card" key={item.id}>
                <div className="shop-item-img-box">
                  {item.imageUrl ? (
                    <img 
                      src={item.imageUrl} 
                      alt={item.title} 
                      onError={(e) => { e.currentTarget.src = '/hero-bg.png'; }}
                    />
                  ) : (
                    <div className="item-placeholder">
                      <Package size={32} />
                    </div>
                  )}

                  {item.badge && (
                    <span className="item-badge">{item.badge}</span>
                  )}
                  {item.isFeatured && (
                    <span className="item-featured-icon" title="Öne Çıkan">
                      <Star size={13} fill="currentColor" />
                    </span>
                  )}
                </div>

                <div className="shop-item-info">
                  <span className="item-category">
                    {item.category === 'uniform' ? 'Okul Kıyafeti' : (item.category === 'books' ? 'Yayın Seti' : 'Kurumsal Ürün')}
                  </span>
                  <h4>{item.title}</h4>
                  <div className="item-price-row">
                    <span className="price-current">₺{item.price?.toLocaleString('tr-TR')}</span>
                    {item.originalPrice && item.originalPrice > item.price && (
                      <span className="price-old">₺{item.originalPrice?.toLocaleString('tr-TR')}</span>
                    )}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      <style jsx>{`
        .shop-showcase-section {
          padding: 70px 0;
          background: #F8FAFC;
        }
        .shop-head-row {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          margin-bottom: 30px;
          gap: 20px;
        }
        .sec-tag {
          display: inline-block;
          font-size: 0.75rem;
          font-weight: 800;
          letter-spacing: 1px;
          color: #E6332A;
          margin-bottom: 6px;
        }
        .shop-head-left h2 {
          font-family: var(--font-heading), 'Outfit', sans-serif;
          font-size: 1.85rem;
          font-weight: 800;
          color: #0A192F;
          margin: 0 0 6px 0;
          line-height: 1.25;
        }
        .shop-head-left p {
          font-size: 0.9rem;
          color: #64748B;
          margin: 0;
        }
        .btn-all-shop {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 10px 20px;
          background: #FFFFFF;
          border: 1px solid #CBD5E1;
          border-radius: 9999px;
          color: #103A69;
          font-size: 0.85rem;
          font-weight: 700;
          text-decoration: none;
          transition: all 0.25s ease;
          box-shadow: 0 2px 6px rgba(0,0,0,0.03);
          shrink: 0;
        }
        .btn-all-shop:hover {
          border-color: #103A69;
          background: #103A69;
          color: #FFFFFF;
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(16, 58, 105, 0.15);
        }
        .shop-grid-showcase {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 24px;
        }
        .shop-item-card {
          background: #FFFFFF;
          border-radius: 18px;
          border: 1px solid #E2E8F0;
          overflow: hidden;
          text-decoration: none;
          display: flex;
          flex-direction: column;
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          box-shadow: 0 2px 8px rgba(0,0,0,0.02);
        }
        .shop-item-card:hover {
          transform: translateY(-6px);
          border-color: #103A69;
          box-shadow: 0 16px 32px rgba(10, 25, 47, 0.08);
        }
        .shop-item-img-box {
          position: relative;
          height: 190px;
          background: #F1F5F9;
          overflow: hidden;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .shop-item-img-box img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          transition: transform 0.4s ease;
        }
        .shop-item-card:hover .shop-item-img-box img {
          transform: scale(1.06);
        }
        .item-placeholder {
          color: #94A3B8;
        }
        .item-badge {
          position: absolute;
          top: 10px;
          left: 10px;
          padding: 3px 10px;
          background: #E6332A;
          color: #FFFFFF;
          font-size: 0.72rem;
          font-weight: 800;
          border-radius: 6px;
          box-shadow: 0 2px 6px rgba(230, 51, 42, 0.3);
        }
        .item-featured-icon {
          position: absolute;
          top: 10px;
          right: 10px;
          width: 26px;
          height: 26px;
          border-radius: 8px;
          background: rgba(245, 158, 11, 0.9);
          color: #FFFFFF;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 2px 6px rgba(0,0,0,0.15);
        }
        .shop-item-info {
          padding: 16px 18px 20px;
          display: flex;
          flex-direction: column;
          flex: 1;
        }
        .item-category {
          font-size: 0.72rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: #2563EB;
          margin-bottom: 4px;
        }
        .shop-item-info h4 {
          font-family: var(--font-heading), 'Outfit', sans-serif;
          font-size: 1rem;
          font-weight: 700;
          color: #0F172A;
          margin: 0 0 12px 0;
          line-height: 1.35;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .item-price-row {
          margin-top: auto;
          display: flex;
          align-items: baseline;
          gap: 8px;
        }
        .price-current {
          font-size: 1.15rem;
          font-weight: 800;
          color: #0A192F;
        }
        .price-old {
          font-size: 0.8rem;
          color: #94A3B8;
          text-decoration: line-through;
          font-weight: 500;
        }
        .shop-item-skeleton {
          height: 280px;
          background: linear-gradient(90deg, #FFFFFF 25%, #F1F5F9 50%, #FFFFFF 75%);
          background-size: 200% 100%;
          animation: shimmer 1.5s infinite;
          border-radius: 18px;
          border: 1px solid #E2E8F0;
        }
        .shop-empty-state {
          background: #FFFFFF;
          border: 1px dashed #CBD5E1;
          border-radius: 18px;
          padding: 48px 20px;
          text-align: center;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
        }
        .empty-icon-circle {
          width: 60px;
          height: 60px;
          border-radius: 50%;
          background: #F1F5F9;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #64748B;
          margin-bottom: 14px;
        }
        .shop-empty-state h3 {
          font-family: var(--font-heading), 'Outfit', sans-serif;
          font-size: 1.15rem;
          font-weight: 700;
          color: #0F172A;
          margin: 0 0 4px 0;
        }
        .shop-empty-state p {
          font-size: 0.86rem;
          color: #64748B;
          margin: 0;
          max-width: 440px;
        }
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        @media (max-width: 1024px) {
          .shop-grid-showcase { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 640px) {
          .shop-grid-showcase { grid-template-columns: 1fr; }
          .shop-head-row { flex-direction: column; align-items: flex-start; }
        }
      `}</style>
    </section>
  );
}
