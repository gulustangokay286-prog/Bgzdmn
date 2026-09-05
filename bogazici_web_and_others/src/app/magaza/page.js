"use client";
import React, { useState, useEffect } from "react";
import Link from "next/link";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, collection, onSnapshot, addDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "../../firebase";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { 
  ShoppingBag, 
  Shirt, 
  BookOpen, 
  Package, 
  Lock, 
  ShieldCheck, 
  CheckCircle2, 
  ArrowRight, 
  Sparkles,
  Search,
  SlidersHorizontal,
  X,
  Star,
  Plus,
  Minus,
  Trash2,
  Phone,
  AlertCircle
} from "lucide-react";

const CATEGORIES = [
  { id: "all", label: "Tüm Ürünler", icon: Package },
  { id: "uniform", label: "Okul Kıyafetleri", icon: Shirt },
  { id: "books", label: "Yayın & Kitap Setleri", icon: BookOpen },
  { id: "stationery", label: "Kırtasiye & Malzeme", icon: Sparkles },
  { id: "accessory", label: "Kolej Aksesuarları", icon: Star }
];

export default function MagazaPage() {
  const [currentUser, setCurrentUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  
  // Sepet & Modal State
  const [cart, setCart] = useState([]);
  const [selectedProductModal, setSelectedProductModal] = useState(null);
  const [selectedSize, setSelectedSize] = useState("");
  const [showCartDrawer, setShowCartDrawer] = useState(false);
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [orderSuccessModal, setOrderSuccessModal] = useState(false);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [customerInfo, setCustomerInfo] = useState({
    fullName: "",
    phone: "",
    schoolNumber: "",
    studentClass: "",
    notes: ""
  });

  // 1. Auth Takibi
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user);
        try {
          const docSnap = await getDoc(doc(db, "users", user.uid));
          if (docSnap.exists()) {
            const data = docSnap.data();
            setUserProfile(data);
            setCustomerInfo(prev => ({
              ...prev,
              fullName: data.full_name || data.name || user.displayName || "",
              phone: data.phone || "",
              schoolNumber: data.school_number || data.student_id || "",
              studentClass: data.class_name || data.class || ""
            }));
          } else {
            setUserProfile({ full_name: user.displayName || "Öğrenci", role: "student" });
          }
        } catch (e) {
          setUserProfile({ full_name: "Öğrenci", role: "student" });
        }
      } else {
        setCurrentUser(null);
        setUserProfile(null);
      }
    });
    return () => unsub();
  }, []);

  // 2. Canlı Firestore Ürünlerini Dinle (store_products)
  useEffect(() => {
    try {
      const unsub = onSnapshot(collection(db, "store_products"), (snapshot) => {
        const list = snapshot.docs.map((d) => ({
          id: d.id,
          ...d.data()
        }));
        list.sort((a, b) => {
          if (a.isFeatured !== b.isFeatured) return a.isFeatured ? -1 : 1;
          return (b.createdAtMillis || 0) - (a.createdAtMillis || 0);
        });
        setProducts(list);
        setLoading(false);
      }, (err) => {
        console.error("Mağaza ürünleri okuma hatası:", err);
        setLoading(false);
      });

      return () => unsub();
    } catch (e) {
      console.error("Firestore bağlantı hatası:", e);
      setLoading(false);
    }
  }, []);

  // Filtreleme
  const filteredProducts = products.filter(p => {
    const matchesCat = selectedCategory === "all" || p.category === selectedCategory;
    const matchesSearch = !searchQuery.trim() || 
      p.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.description?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCat && matchesSearch;
  });

  // Sepete Ekle
  const handleAddToCart = (product, size = "") => {
    const itemKey = `${product.id}-${size || 'standard'}`;
    const existing = cart.find(c => c.key === itemKey);
    if (existing) {
      setCart(cart.map(c => c.key === itemKey ? { ...c, quantity: c.quantity + 1 } : c));
    } else {
      setCart([...cart, {
        key: itemKey,
        productId: product.id,
        title: product.title,
        price: Number(product.price) || 0,
        imageUrl: product.imageUrl || '/hero-bg.png',
        category: product.category,
        size: size || (product.sizes ? product.sizes.split(',')[0].trim() : ''),
        quantity: 1
      }]);
    }
    setSelectedProductModal(null);
    setShowCartDrawer(true);
  };

  // Sepet Miktarı Değiştir
  const updateQuantity = (key, delta) => {
    setCart(cart.map(c => {
      if (c.key === key) {
        const newQty = c.quantity + delta;
        return newQty > 0 ? { ...c, quantity: newQty } : null;
      }
      return c;
    }).filter(Boolean));
  };

  // Sepet Toplamı
  const cartTotal = cart.reduce((acc, item) => acc + (item.price * item.quantity), 0);

  // Siparişi Firestore'a Kaydet
  const handleCheckoutSubmit = async (e) => {
    e.preventDefault();
    if (cart.length === 0) return;
    setIsSubmittingOrder(true);

    try {
      const orderData = {
        userId: currentUser ? currentUser.uid : 'guest',
        customerName: customerInfo.fullName || 'Misafir Kullanıcı',
        customerPhone: customerInfo.phone || '',
        schoolNumber: customerInfo.schoolNumber || '',
        studentClass: customerInfo.studentClass || '',
        notes: customerInfo.notes || '',
        items: cart,
        totalAmount: cartTotal,
        status: 'pending', // pending, preparing, delivered, cancelled
        createdAt: serverTimestamp(),
        createdAtMillis: Date.now()
      };

      await addDoc(collection(db, "store_orders"), orderData);
      setOrderSuccessModal(true);
      setShowCheckoutModal(false);
      setShowCartDrawer(false);
      setCart([]);
    } catch (err) {
      console.error("Sipariş gönderme hatası:", err);
      alert("Sipariş oluşturulurken bir hata oluştu: " + err.message);
    }
    setIsSubmittingOrder(false);
  };

  return (
    <div className="magaza-page">
      <Header />

      <main className="magaza-main">
        {/* Hero */}
        <section className="page-hero">
          <div className="container">
            <span className="hero-subtag">BOĞAZİÇİ KOLEJİ RESMİ MAĞAZASI</span>
            <h1 className="hero-title">Okul Kıyafetleri & <span className="red-text">Eğitim Yayınları</span></h1>
            <p className="hero-desc">
              Kurumumuza ait orijinal okul kıyafetleri, soru bankası setleri ve lisanslı kolej ürünlerine güvenle ulaşın.
            </p>
          </div>
        </section>

        {/* Auth Notice Bar */}
        <div className="auth-status-bar">
          <div className="container auth-bar-inner">
            {currentUser && userProfile ? (
              <div className="auth-active-box">
                <ShieldCheck size={18} className="text-success" />
                <span>Oturum Açık: <strong>{userProfile.full_name || userProfile.name}</strong> (Kolej Öğrenci/Veli Paneli Bağlı)</span>
              </div>
            ) : (
              <div className="auth-guest-box">
                <Lock size={16} />
                <span>Kolej öğrencisi veya velisi misiniz? Özel indirimler ve öğrenci numarasıyla sipariş için <Link href="/login">Giriş Yapın</Link>.</span>
              </div>
            )}

            {/* Sepet Butonu */}
            <button 
              onClick={() => setShowCartDrawer(true)} 
              className="cart-toggle-btn"
            >
              <ShoppingBag size={18} />
              <span>Sepetim ({cart.reduce((a, b) => a + b.quantity, 0)})</span>
              {cartTotal > 0 && <strong className="cart-badge-total">₺{cartTotal.toLocaleString('tr-TR')}</strong>}
            </button>
          </div>
        </div>

        {/* Mağaza İçerik Bölümü */}
        <section className="magaza-content-section">
          <div className="container">
            
            {/* Filtre ve Arama Çubuğu */}
            <div className="magaza-toolbar">
              {/* Kategori Butonları */}
              <div className="category-pills">
                {CATEGORIES.map((cat) => {
                  const Icon = cat.icon;
                  const isActive = selectedCategory === cat.id;
                  return (
                    <button
                      key={cat.id}
                      onClick={() => setSelectedCategory(cat.id)}
                      className={`cat-pill ${isActive ? "active" : ""}`}
                    >
                      <Icon size={16} />
                      <span>{cat.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Arama Inputu */}
              <div className="magaza-search-box">
                <Search size={16} className="search-icon" />
                <input
                  type="text"
                  placeholder="Kıyafet, kitap veya malzeme ara..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            {/* Ürün Listesi */}
            {loading ? (
              <div className="magaza-products-grid">
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <div className="product-skeleton-card" key={n} />
                ))}
              </div>
            ) : filteredProducts.length === 0 ? (
              <div className="magaza-empty-box">
                <ShoppingBag size={48} className="empty-icon" />
                <h3>Bu Kategoride Henüz Ürün Bulunmuyor</h3>
                <p>Yeni eğitim dönemi ürünleri admin panelinden eklendiğinde burada listelenecektir.</p>
              </div>
            ) : (
              <div className="magaza-products-grid">
                {filteredProducts.map((product) => (
                  <div 
                    className="product-card" 
                    key={product.id}
                    onClick={() => {
                      setSelectedProductModal(product);
                      if (product.sizes) {
                        setSelectedSize(product.sizes.split(',')[0].trim());
                      } else {
                        setSelectedSize("");
                      }
                    }}
                  >
                    <div className="product-img-wrap">
                      <img 
                        src={product.imageUrl || '/hero-bg.png'} 
                        alt={product.title}
                        onError={(e) => { e.currentTarget.src = '/hero-bg.png'; }}
                      />
                      {product.badge && <span className="product-badge">{product.badge}</span>}
                      {product.isFeatured && (
                        <span className="product-featured-badge" title="Öne Çıkan Ürün">
                          <Star size={13} fill="currentColor" />
                        </span>
                      )}
                    </div>

                    <div className="product-info-wrap">
                      <span className="product-cat-name">
                        {CATEGORIES.find(c => c.id === product.category)?.label || "Kurumsal Ürün"}
                      </span>
                      <h3 className="product-title">{product.title}</h3>

                      {product.description && (
                        <p className="product-desc">{product.description}</p>
                      )}

                      {product.sizes && (
                        <div className="product-sizes-preview">
                          Beden: <span>{product.sizes}</span>
                        </div>
                      )}

                      <div className="product-price-bottom">
                        <div className="price-box">
                          <span className="price-now">₺{product.price?.toLocaleString('tr-TR')}</span>
                          {product.originalPrice && product.originalPrice > product.price && (
                            <span className="price-was">₺{product.originalPrice?.toLocaleString('tr-TR')}</span>
                          )}
                        </div>

                        <button 
                          className="btn-add-cart"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleAddToCart(product);
                          }}
                        >
                          <Plus size={16} />
                          <span>Sepete Ekle</span>
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

          </div>
        </section>
      </main>

      {/* ========================================================================= */}
      {/* ÜRÜN DETAY MODAL                                                         */}
      {/* ========================================================================= */}
      {selectedProductModal && (
        <div className="modal-backdrop" onClick={() => setSelectedProductModal(null)}>
          <div className="product-detail-modal" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close-btn" onClick={() => setSelectedProductModal(null)}>
              <X size={20} />
            </button>

            <div className="modal-grid">
              <div className="modal-img-col">
                <img 
                  src={selectedProductModal.imageUrl || '/hero-bg.png'} 
                  alt={selectedProductModal.title}
                  onError={(e) => { e.currentTarget.src = '/hero-bg.png'; }}
                />
              </div>

              <div className="modal-info-col">
                <span className="modal-cat">
                  {CATEGORIES.find(c => c.id === selectedProductModal.category)?.label || "Kolej Ürünü"}
                </span>
                <h2>{selectedProductModal.title}</h2>

                <div className="modal-price-row">
                  <span className="modal-price-current">₺{selectedProductModal.price?.toLocaleString('tr-TR')}</span>
                  {selectedProductModal.originalPrice && selectedProductModal.originalPrice > selectedProductModal.price && (
                    <span className="modal-price-old">₺{selectedProductModal.originalPrice?.toLocaleString('tr-TR')}</span>
                  )}
                </div>

                <div className="modal-divider"></div>

                <div className="modal-desc">
                  <h4>Ürün Açıklaması</h4>
                  <p>{selectedProductModal.description || "Orijinal lisanslı Boğaziçi Koleji ürünüdür."}</p>
                </div>

                {selectedProductModal.sizes && (
                  <div className="modal-sizes-section">
                    <h4>Beden / Varyant Seçimi:</h4>
                    <div className="sizes-pill-group">
                      {selectedProductModal.sizes.split(',').map((s) => {
                        const sizeStr = s.trim();
                        return (
                          <button
                            key={sizeStr}
                            type="button"
                            onClick={() => setSelectedSize(sizeStr)}
                            className={`size-btn ${selectedSize === sizeStr ? "active" : ""}`}
                          >
                            {sizeStr}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="modal-action-row">
                  <button 
                    className="modal-submit-cart-btn"
                    onClick={() => handleAddToCart(selectedProductModal, selectedSize)}
                  >
                    <ShoppingBag size={18} />
                    <span>Sepete Ekle (₺{selectedProductModal.price?.toLocaleString('tr-TR')})</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SEPET ÇEKMECESİ (CART DRAWER)                                            */}
      {/* ========================================================================= */}
      {showCartDrawer && (
        <div className="drawer-backdrop" onClick={() => setShowCartDrawer(false)}>
          <div className="cart-drawer-container" onClick={(e) => e.stopPropagation()}>
            <div className="drawer-header">
              <div className="drawer-title-box">
                <ShoppingBag size={20} className="text-blue" />
                <h3>Alışveriş Sepetim</h3>
              </div>
              <button className="drawer-close" onClick={() => setShowCartDrawer(false)}>
                <X size={20} />
              </button>
            </div>

            <div className="drawer-body">
              {cart.length === 0 ? (
                <div className="drawer-empty">
                  <ShoppingBag size={48} className="text-muted" />
                  <h4>Sepetiniz Boş</h4>
                  <p>Mağazadaki ürünleri inceleyip sepetinize ekleyebilirsiniz.</p>
                </div>
              ) : (
                <div className="cart-items-list">
                  {cart.map((item) => (
                    <div className="cart-item-row" key={item.key}>
                      <img src={item.imageUrl} alt={item.title} className="cart-item-thumb" />
                      <div className="cart-item-details">
                        <h4>{item.title}</h4>
                        {item.size && <span className="cart-item-size">Beden: {item.size}</span>}
                        <span className="cart-item-price">₺{item.price?.toLocaleString('tr-TR')}</span>
                      </div>
                      <div className="cart-qty-controls">
                        <button onClick={() => updateQuantity(item.key, -1)} className="qty-btn">
                          <Minus size={13} />
                        </button>
                        <span className="qty-count">{item.quantity}</span>
                        <button onClick={() => updateQuantity(item.key, 1)} className="qty-btn">
                          <Plus size={13} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {cart.length > 0 && (
              <div className="drawer-footer">
                <div className="drawer-total-row">
                  <span>Toplam Tutar:</span>
                  <strong>₺{cartTotal.toLocaleString('tr-TR')}</strong>
                </div>
                <button 
                  className="btn-checkout-proceed"
                  onClick={() => {
                    setShowCartDrawer(false);
                    setShowCheckoutModal(true);
                  }}
                >
                  <span>Siparişi Tamamla</span>
                  <ArrowRight size={18} />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* SİPARİŞİ TAMAMLA MODAL                                                   */}
      {/* ========================================================================= */}
      {showCheckoutModal && (
        <div className="modal-backdrop" onClick={() => setShowCheckoutModal(false)}>
          <div className="checkout-modal-card" onClick={(e) => e.stopPropagation()}>
            <button className="modal-close-btn" onClick={() => setShowCheckoutModal(false)}>
              <X size={20} />
            </button>

            <div className="checkout-header">
              <ShieldCheck size={28} className="text-red" />
              <h3>Kolej Siparişini Onayla</h3>
              <p>Siparişiniz kurum muhasebesine iletilecek ve öğrencinize teslim için hazırlanacaktır.</p>
            </div>

            <form onSubmit={handleCheckoutSubmit} className="checkout-form">
              <div className="form-group">
                <label>Öğrenci / Veli Adı Soyadı *</label>
                <input 
                  type="text" 
                  required
                  value={customerInfo.fullName}
                  onChange={(e) => setCustomerInfo({ ...customerInfo, fullName: e.target.value })}
                  placeholder="Ad Soyad"
                />
              </div>

              <div className="form-row-2">
                <div className="form-group">
                  <label>İletişim Telefonu *</label>
                  <input 
                    type="tel" 
                    required
                    value={customerInfo.phone}
                    onChange={(e) => setCustomerInfo({ ...customerInfo, phone: e.target.value })}
                    placeholder="0500 000 00 00"
                  />
                </div>
                <div className="form-group">
                  <label>Öğrenci Okul No</label>
                  <input 
                    type="text" 
                    value={customerInfo.schoolNumber}
                    onChange={(e) => setCustomerInfo({ ...customerInfo, schoolNumber: e.target.value })}
                    placeholder="Örn: 1420"
                  />
                </div>
              </div>

              <div className="form-group">
                <label>Sınıf / Şube</label>
                <input 
                  type="text" 
                  value={customerInfo.studentClass}
                  onChange={(e) => setCustomerInfo({ ...customerInfo, studentClass: e.target.value })}
                  placeholder="Örn: 9-A, 11-Fen vb."
                />
              </div>

              <div className="form-group">
                <label>Sipariş Notu (Opsiyonel)</label>
                <textarea 
                  rows={2}
                  value={customerInfo.notes}
                  onChange={(e) => setCustomerInfo({ ...customerInfo, notes: e.target.value })}
                  placeholder="Teslimat veya beden ile ilgili ek notlarınız..."
                />
              </div>

              <div className="checkout-summary-box">
                <div className="summary-row">
                  <span>Ürün Adedi:</span>
                  <strong>{cart.reduce((a, b) => a + b.quantity, 0)} Adet</strong>
                </div>
                <div className="summary-row total-highlight">
                  <span>Ödenecek Tutar:</span>
                  <strong>₺{cartTotal.toLocaleString('tr-TR')}</strong>
                </div>
              </div>

              <button 
                type="submit" 
                disabled={isSubmittingOrder}
                className="btn-order-submit"
              >
                {isSubmittingOrder ? "Kaydediliyor..." : `Siparişi Onayla (₺${cartTotal.toLocaleString('tr-TR')})`}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* SİPARİŞ BAŞARILI MODAL */}
      {orderSuccessModal && (
        <div className="modal-backdrop" onClick={() => setOrderSuccessModal(false)}>
          <div className="success-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="success-icon-circle">
              <CheckCircle2 size={40} />
            </div>
            <h3>Siparişiniz Başarıyla Alındı!</h3>
            <p>
              Talebiniz Boğaziçi Koleji İdare & Mağaza Birimi'ne iletilmiştir. Ürünleriniz hazırlandığında bilgilendirileceksiniz.
            </p>
            <button className="btn-success-close" onClick={() => setOrderSuccessModal(false)}>
              Tamam
            </button>
          </div>
        </div>
      )}

      <Footer />

      <style jsx>{`
        .magaza-page {
          background: #F8FAFC;
          min-height: 100vh;
        }
        .page-hero {
          background: #0A192F;
          color: #FFFFFF;
          padding: 60px 0;
          text-align: center;
          position: relative;
        }
        .hero-subtag {
          display: inline-block;
          font-size: 0.78rem;
          font-weight: 800;
          letter-spacing: 1.5px;
          color: #E6332A;
          margin-bottom: 8px;
        }
        .hero-title {
          font-family: var(--font-heading), 'Outfit', sans-serif;
          font-size: 2.3rem;
          font-weight: 800;
          margin: 0 0 10px 0;
          color: #FFFFFF;
        }
        .red-text {
          color: #E6332A;
        }
        .hero-desc {
          font-size: 0.95rem;
          color: #94A3B8;
          max-width: 580px;
          margin: 0 auto;
          line-height: 1.6;
        }
        .auth-status-bar {
          background: #FFFFFF;
          border-bottom: 1px solid #E2E8F0;
          padding: 12px 0;
        }
        .auth-bar-inner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
        }
        .auth-active-box {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.85rem;
          color: #0F172A;
        }
        .text-success { color: #10B981; }
        .auth-guest-box {
          display: flex;
          align-items: center;
          gap: 8px;
          font-size: 0.85rem;
          color: #64748B;
        }
        .auth-guest-box a {
          color: #2563EB;
          font-weight: 700;
          text-decoration: underline;
        }
        .cart-toggle-btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 8px 16px;
          background: #103A69;
          color: #FFFFFF;
          border: none;
          border-radius: 9999px;
          font-size: 0.82rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .cart-toggle-btn:hover {
          background: #0A192F;
          transform: translateY(-1px);
        }
        .cart-badge-total {
          background: #E6332A;
          padding: 2px 8px;
          border-radius: 9999px;
          font-size: 0.75rem;
        }
        .magaza-content-section {
          padding: 40px 0 80px;
        }
        .magaza-toolbar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          margin-bottom: 32px;
          flex-wrap: wrap;
        }
        .category-pills {
          display: flex;
          align-items: center;
          gap: 8px;
          overflow-x: auto;
          padding-bottom: 4px;
        }
        .cat-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 9px 16px;
          background: #FFFFFF;
          border: 1px solid #CBD5E1;
          border-radius: 9999px;
          color: #475569;
          font-size: 0.84rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s ease;
          white-space: nowrap;
        }
        .cat-pill:hover {
          border-color: #103A69;
          color: #103A69;
        }
        .cat-pill.active {
          background: #103A69;
          color: #FFFFFF;
          border-color: #103A69;
          box-shadow: 0 4px 12px rgba(16, 58, 105, 0.2);
        }
        .magaza-search-box {
          position: relative;
          width: 280px;
        }
        .search-icon {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
          color: #94A3B8;
        }
        .magaza-search-box input {
          width: 100%;
          padding: 9px 14px 9px 36px;
          background: #FFFFFF;
          border: 1px solid #CBD5E1;
          border-radius: 12px;
          font-size: 0.85rem;
          color: #0F172A;
          outline: none;
        }
        .magaza-search-box input:focus {
          border-color: #2563EB;
        }
        .magaza-products-grid {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 24px;
        }
        .product-card {
          background: #FFFFFF;
          border-radius: 18px;
          border: 1px solid #E2E8F0;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          cursor: pointer;
          transition: all 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          box-shadow: 0 2px 6px rgba(0,0,0,0.02);
        }
        .product-card:hover {
          transform: translateY(-6px);
          border-color: #103A69;
          box-shadow: 0 16px 32px rgba(10, 25, 47, 0.08);
        }
        .product-img-wrap {
          position: relative;
          height: 220px;
          background: #F1F5F9;
          overflow: hidden;
        }
        .product-img-wrap img {
          width: 100%;
          height: 100%;
          object-fit: cover;
          transition: transform 0.4s ease;
        }
        .product-card:hover .product-img-wrap img {
          transform: scale(1.06);
        }
        .product-badge {
          position: absolute;
          top: 12px;
          left: 12px;
          padding: 3px 10px;
          background: #E6332A;
          color: #FFFFFF;
          font-size: 0.72rem;
          font-weight: 800;
          border-radius: 6px;
          box-shadow: 0 2px 6px rgba(230, 51, 42, 0.3);
        }
        .product-featured-badge {
          position: absolute;
          top: 12px;
          right: 12px;
          width: 26px;
          height: 26px;
          border-radius: 8px;
          background: rgba(245, 158, 11, 0.9);
          color: #FFFFFF;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .product-info-wrap {
          padding: 18px;
          display: flex;
          flex-direction: column;
          flex: 1;
        }
        .product-cat-name {
          font-size: 0.72rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          color: #2563EB;
          margin-bottom: 4px;
        }
        .product-title {
          font-family: var(--font-heading), 'Outfit', sans-serif;
          font-size: 1.05rem;
          font-weight: 700;
          color: #0F172A;
          margin: 0 0 8px 0;
          line-height: 1.35;
        }
        .product-desc {
          font-size: 0.82rem;
          color: #64748B;
          line-height: 1.5;
          margin-bottom: 12px;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .product-sizes-preview {
          font-size: 0.78rem;
          color: #64748B;
          margin-bottom: 14px;
        }
        .product-sizes-preview span {
          font-weight: 700;
          color: #0F172A;
        }
        .product-price-bottom {
          margin-top: auto;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          padding-top: 12px;
          border-top: 1px solid #F1F5F9;
        }
        .price-now {
          font-size: 1.2rem;
          font-weight: 800;
          color: #0A192F;
          display: block;
        }
        .price-was {
          font-size: 0.78rem;
          color: #94A3B8;
          text-decoration: line-through;
        }
        .btn-add-cart {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          padding: 8px 14px;
          background: #F1F5F9;
          color: #103A69;
          border: 1px solid #CBD5E1;
          border-radius: 10px;
          font-size: 0.8rem;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .btn-add-cart:hover {
          background: #103A69;
          color: #FFFFFF;
          border-color: #103A69;
        }
        .magaza-empty-box {
          background: #FFFFFF;
          border: 1px dashed #CBD5E1;
          border-radius: 20px;
          padding: 60px 20px;
          text-align: center;
          color: #64748B;
        }
        .product-skeleton-card {
          height: 340px;
          background: linear-gradient(90deg, #FFFFFF 25%, #F1F5F9 50%, #FFFFFF 75%);
          background-size: 200% 100%;
          animation: shimmer 1.5s infinite;
          border-radius: 18px;
          border: 1px solid #E2E8F0;
        }
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }

        /* MODALS */
        .modal-backdrop, .drawer-backdrop {
          position: fixed;
          inset: 0;
          background: rgba(10, 25, 47, 0.7);
          backdrop-filter: blur(8px);
          z-index: 9999;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .product-detail-modal {
          background: #FFFFFF;
          border-radius: 24px;
          width: 100%;
          max-width: 760px;
          max-height: 90vh;
          overflow-y: auto;
          position: relative;
          box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.3);
        }
        .modal-close-btn {
          position: absolute;
          top: 16px;
          right: 16px;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          background: #F1F5F9;
          color: #0F172A;
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 10;
        }
        .modal-grid {
          display: grid;
          grid-template-columns: 1fr 1.2fr;
        }
        .modal-img-col {
          background: #F1F5F9;
          height: 100%;
          min-height: 360px;
        }
        .modal-img-col img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .modal-info-col {
          padding: 36px 30px;
          display: flex;
          flex-direction: column;
        }
        .modal-cat {
          font-size: 0.75rem;
          font-weight: 800;
          color: #2563EB;
          text-transform: uppercase;
          margin-bottom: 6px;
        }
        .modal-info-col h2 {
          font-family: var(--font-heading), 'Outfit', sans-serif;
          font-size: 1.4rem;
          font-weight: 800;
          color: #0A192F;
          margin: 0 0 12px 0;
          line-height: 1.3;
        }
        .modal-price-row {
          display: flex;
          align-items: baseline;
          gap: 10px;
          margin-bottom: 16px;
        }
        .modal-price-current {
          font-size: 1.5rem;
          font-weight: 800;
          color: #0A192F;
        }
        .modal-price-old {
          font-size: 0.95rem;
          color: #94A3B8;
          text-decoration: line-through;
        }
        .modal-divider {
          height: 1px;
          background: #E2E8F0;
          margin-bottom: 20px;
        }
        .modal-desc h4, .modal-sizes-section h4 {
          font-size: 0.85rem;
          font-weight: 700;
          color: #0F172A;
          margin: 0 0 6px 0;
        }
        .modal-desc p {
          font-size: 0.88rem;
          color: #475569;
          line-height: 1.6;
          margin: 0 0 20px 0;
        }
        .sizes-pill-group {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-bottom: 24px;
        }
        .size-btn {
          padding: 6px 14px;
          border: 1px solid #CBD5E1;
          background: #FFFFFF;
          border-radius: 8px;
          font-size: 0.82rem;
          font-weight: 700;
          cursor: pointer;
        }
        .size-btn.active {
          background: #103A69;
          color: #FFFFFF;
          border-color: #103A69;
        }
        .modal-submit-cart-btn {
          width: 100%;
          padding: 14px;
          background: #103A69;
          color: #FFFFFF;
          border: none;
          border-radius: 14px;
          font-size: 0.95rem;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          cursor: pointer;
          transition: background 0.2s ease;
        }
        .modal-submit-cart-btn:hover {
          background: #0A192F;
        }

        /* CART DRAWER */
        .cart-drawer-container {
          position: fixed;
          top: 0;
          right: 0;
          bottom: 0;
          width: 100%;
          max-width: 420px;
          background: #FFFFFF;
          box-shadow: -10px 0 30px rgba(0,0,0,0.15);
          display: flex;
          flex-direction: column;
          z-index: 10000;
          animation: slideLeft 0.3s ease-out;
        }
        @keyframes slideLeft {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        .drawer-header {
          padding: 20px;
          border-bottom: 1px solid #E2E8F0;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .drawer-title-box {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .drawer-title-box h3 {
          margin: 0;
          font-size: 1.1rem;
          font-weight: 700;
          color: #0A192F;
        }
        .drawer-close {
          background: none;
          border: none;
          cursor: pointer;
          color: #64748B;
        }
        .drawer-body {
          padding: 20px;
          flex: 1;
          overflow-y: auto;
        }
        .drawer-empty {
          text-align: center;
          padding: 40px 0;
          color: #64748B;
        }
        .cart-items-list {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }
        .cart-item-row {
          display: flex;
          align-items: center;
          gap: 12px;
          padding-bottom: 16px;
          border-bottom: 1px solid #F1F5F9;
        }
        .cart-item-thumb {
          width: 54px;
          height: 54px;
          border-radius: 10px;
          object-fit: cover;
        }
        .cart-item-details {
          flex: 1;
        }
        .cart-item-details h4 {
          font-size: 0.86rem;
          font-weight: 700;
          margin: 0 0 2px 0;
          color: #0F172A;
        }
        .cart-item-size {
          display: block;
          font-size: 0.75rem;
          color: #64748B;
          margin-bottom: 4px;
        }
        .cart-item-price {
          font-size: 0.85rem;
          font-weight: 800;
          color: #0A192F;
        }
        .cart-qty-controls {
          display: flex;
          align-items: center;
          gap: 6px;
          background: #F1F5F9;
          padding: 4px 8px;
          border-radius: 8px;
        }
        .qty-btn {
          background: none;
          border: none;
          cursor: pointer;
          color: #475569;
          display: flex;
          align-items: center;
        }
        .qty-count {
          font-size: 0.82rem;
          font-weight: 800;
          color: #0F172A;
          min-width: 14px;
          text-align: center;
        }
        .drawer-footer {
          padding: 20px;
          border-top: 1px solid #E2E8F0;
          background: #F8FAFC;
        }
        .drawer-total-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
          font-size: 1.05rem;
        }
        .drawer-total-row strong {
          font-size: 1.25rem;
          color: #0A192F;
        }
        .btn-checkout-proceed {
          width: 100%;
          padding: 13px;
          background: #103A69;
          color: #FFFFFF;
          border: none;
          border-radius: 12px;
          font-size: 0.92rem;
          font-weight: 700;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          cursor: pointer;
        }

        /* CHECKOUT MODAL */
        .checkout-modal-card, .success-modal-card {
          background: #FFFFFF;
          border-radius: 24px;
          width: 100%;
          max-width: 520px;
          padding: 32px;
          position: relative;
        }
        .checkout-header {
          text-align: center;
          margin-bottom: 24px;
        }
        .checkout-header h3 {
          font-size: 1.3rem;
          font-weight: 800;
          color: #0A192F;
          margin: 8px 0 4px 0;
        }
        .checkout-header p {
          font-size: 0.85rem;
          color: #64748B;
          margin: 0;
        }
        .checkout-form {
          display: flex;
          flex-direction: column;
          gap: 14px;
        }
        .form-group {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .form-group label {
          font-size: 0.78rem;
          font-weight: 700;
          color: #475569;
          text-transform: uppercase;
        }
        .form-group input, .form-group textarea {
          padding: 10px 14px;
          border: 1px solid #CBD5E1;
          border-radius: 10px;
          font-size: 0.88rem;
          outline: none;
        }
        .form-group input:focus, .form-group textarea:focus {
          border-color: #2563EB;
        }
        .form-row-2 {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 12px;
        }
        .checkout-summary-box {
          background: #F8FAFC;
          border: 1px solid #E2E8F0;
          border-radius: 12px;
          padding: 12px 16px;
          margin-top: 6px;
        }
        .summary-row {
          display: flex;
          justify-content: space-between;
          font-size: 0.85rem;
          color: #64748B;
          margin-bottom: 4px;
        }
        .summary-row.total-highlight {
          color: #0A192F;
          font-size: 1.05rem;
          font-weight: 800;
          margin-top: 6px;
          padding-top: 6px;
          border-top: 1px dashed #CBD5E1;
        }
        .btn-order-submit {
          padding: 14px;
          background: #103A69;
          color: #FFFFFF;
          border: none;
          border-radius: 12px;
          font-size: 0.95rem;
          font-weight: 800;
          cursor: pointer;
          margin-top: 10px;
        }
        .success-modal-card {
          text-align: center;
          padding: 40px 30px;
        }
        .success-icon-circle {
          width: 70px;
          height: 70px;
          border-radius: 50%;
          background: #DCFCE7;
          color: #16A34A;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 16px;
        }
        .success-modal-card h3 {
          font-size: 1.35rem;
          font-weight: 800;
          color: #0A192F;
          margin-bottom: 8px;
        }
        .success-modal-card p {
          font-size: 0.9rem;
          color: #64748B;
          line-height: 1.6;
          margin-bottom: 24px;
        }
        .btn-success-close {
          padding: 10px 28px;
          background: #103A69;
          color: #FFFFFF;
          border: none;
          border-radius: 10px;
          font-size: 0.9rem;
          font-weight: 700;
          cursor: pointer;
        }
        @media (max-width: 1024px) {
          .magaza-products-grid { grid-template-columns: repeat(2, 1fr); }
          .modal-grid { grid-template-columns: 1fr; }
          .modal-img-col { height: 220px; min-height: 220px; }
        }
        @media (max-width: 640px) {
          .magaza-products-grid { grid-template-columns: 1fr; }
          .form-row-2 { grid-template-columns: 1fr; }
          .auth-bar-inner { flex-direction: column; align-items: flex-start; }
          .magaza-toolbar { flex-direction: column; align-items: stretch; }
          .magaza-search-box { width: 100%; }
        }
      `}</style>
    </div>
  );
}
