"use client";
import React, { useState, useEffect, Suspense } from "react";

import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { 
  Icon3DScience, 
  Icon3DJustice, 
  Icon3DLiterature, 
  Icon3DGlobe 
} from "@/components/ThreeDIcons";
import { ChevronRight } from "lucide-react";
import "./egitim.css";

function AppleEgitimContent() {
  
  const [activeTab, setActiveTab] = useState("sayisal");

  useEffect(() => {
    const params = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null; const alan = params ? params.get("alan") : null;
    if (alan && ["sayisal", "esit", "sozel", "dil"].includes(alan)) {
      setActiveTab(alan);
      const el = document.getElementById("brans-odak");
      if (el) {
        el.scrollIntoView({ behavior: "smooth" });
      }
    }
  }, []);

  const branches = {
    sayisal: {
      key: "sayisal",
      name: "Sayısal (MF)",
      color: "#2F6BFF",
      IconComponent: Icon3DScience,
      stat: "1.200+",
      statLabel: "Haftalık Soru Hedefi",
      tagline: "Analitik zekayı laboratuvar deneyleri, ileri kalkülüs ve derinlemesine soru çözümleriyle tıp ve mühendislik zirvesine taşıyoruz.",
      curriculum: [
        { title: "İleri Düzey Matematik & Geometri", desc: "TYT-AYT fonksiyonlar, kalkülüs, trigonometri ve uzamsal geometri tahlilleri." },
        { title: "Mekanik, Elektrik & Modern Fizik", desc: "Formül ezberi yerine fiziksel prensipler ve problem analiz modellemeleri." },
        { title: "Organik Kimya & Reaksiyon Mekanizmaları", desc: "Modern laboratuvarda deney uygulamaları ve reaksiyon analizleri." },
        { title: "Genetik, Sistemler & İnsan Biyolojisi", desc: "Moleküler biyoloji, kalıtım ve fizyoloji soru çözüm pratikleri." }
      ],
      faculties: [
        { title: "Tıp & Diş Hekimliği", desc: "Devlet ve vakıf üniversiteleri tıp fakülteleri başarı hedefleri." },
        { title: "Bilgisayar & Yazılım Mühendisliği", desc: "Algoritma ve yapay zeka odaklı mühendislik programları." },
        { title: "Elektrik-Elektronik & Makine Müh.", desc: "Teknik üniversiteler ve küresel AR-GE mühendislikleri." },
        { title: "Moleküler Biyoloji, Genetik & Eczacılık", desc: "Biyoteknoloji ve ilaç araştırma lisans programları." }
      ],
      routine: [
        { title: "Haftalık 18 Saat Blok Dersler", desc: "Konu anlatımı ve derinlemesine soru çözüm etütleri." },
        { title: "Birebir Soru Çözüm Ofisleri", desc: "Anlaşılamayan her sorunun öğretmen eşliğinde çözümü." },
        { title: "Cumartesi Türkiye Geneli Deneme", desc: "YKS standartlarında süre ve performans ölçümü." }
      ]
    },
    esit: {
      key: "esit",
      name: "Eşit Ağırlık (TM)",
      color: "#F5A623",
      IconComponent: Icon3DJustice,
      stat: "1.000+",
      statLabel: "Haftalık Soru Hedefi",
      tagline: "Matematiksel mantığı güçlü bir edebiyat, tarih ve eleştirel düşünce temeliyle birleştirerek hukuk ve küresel yönetim kariyerlerine hazırlıyoruz.",
      curriculum: [
        { title: "İleri Matematik & Analitik Düşünce", desc: "Eşit Ağırlık derecelerini belirleyen yüksek netli matematik stratejisi." },
        { title: "Türk Dili ve Edebiyatı İncelemeleri", desc: "Dönem metinleri, şiir tahlilleri ve eleştirel okuma kazanımları." },
        { title: "Kritik Tarih & Metin Okumaları", desc: "Olay-olgu analizi ve neden-sonuç odaklı tarih müfredatı." },
        { title: "Beşeri & İktisadi Coğrafya", desc: "Harita okuryazarlığı ve sosyo-ekonomik coğrafya kavramları." }
      ],
      faculties: [
        { title: "Hukuk Fakülteleri", desc: "Köklü devlet ve vakıf üniversiteleri hukuk lisans programları." },
        { title: "İşletme, İktisat & Finans", desc: "Küresel ekonomi, işletme ve uluslararası ticaret bölümleri." },
        { title: "Psikoloji & Sosyoloji", desc: "Davranış bilimleri ve klinik psikoloji hazırlık altyapısı." },
        { title: "Yönetim Bilişim Sistemleri (YBS)", desc: "İş dünyası ve bilişim teknolojilerini birleştiren modern alanlar." }
      ],
      routine: [
        { title: "Matematik & Edebiyat Odaklı Etütler", desc: "Haftalık konu tarama ve kazanım pekiştirme seansları." },
        { title: "Hızlı Okuma & Paragraf Analizi", desc: "Sınavda zaman kazandıran bilişsel okuma teknikleri." },
        { title: "Haftalık Karma TYT-AYT Denemeleri", desc: "Süreklilik arz eden ölçme ve değerlendirme grafiği." }
      ]
    },
    sozel: {
      key: "sozel",
      name: "Sözel (TS)",
      color: "#F0444C",
      IconComponent: Icon3DLiterature,
      stat: "900+",
      statLabel: "Haftalık Soru Hedefi",
      tagline: "Geniş bir kültürel vizyon, edebiyat estetiği ve felsefi sorgulama ile yeni nesil medya ve sosyal bilimlerin liderlerini yetiştiriyoruz.",
      curriculum: [
        { title: "Kapsamlı Edebiyat & Estetik Tahlil", desc: "Türk ve dünya edebiyatı kanon eserleri üzerinden derin okumalar." },
        { title: "Medeniyetler Tarihi & Belge Analizi", desc: "İlk çağlardan modern çağa uygarlık tarihinin analitik incelenmesi." },
        { title: "Felsefe Grubu & Mantık", desc: "Felsefe, psikoloji, sosyoloji ve mantık kavramsal çözümlemeleri." },
        { title: "Yaratıcı Yazarlık & Medya Okuryazarlığı", desc: "Yazılı ifade gücünü geliştiren atölye çalışmaları." }
      ],
      faculties: [
        { title: "İletişim & Yeni Medya", desc: "Dijital gazetecilik, içerik üretimi ve yeni medya yönetimi." },
        { title: "Radyo, Televizyon & Sinema (RTS)", desc: "Görsel anlatı, senaryo ve yapımcılık odaklı bölümler." },
        { title: "Halkla İlişkiler & Reklamcılık", desc: "Stratejik iletişim, marka yönetimi ve reklam tasarımı." },
        { title: "Tarih, Coğrafya & Türk Dili", desc: "Akademik kariyer ve öğretmenlik lisans programları." }
      ],
      routine: [
        { title: "Metin İnceleme & Makale Atölyeleri", desc: "Haftalık kavram haritaları ve soru analiz seansları." },
        { title: "Görsel Hafıza & Özet Çalışmaları", desc: "Bilginin kalıcı hale gelmesini sağlayan sistematik tekrar." },
        { title: "Haftalık AYT Sözel Denemeleri", desc: "Net hedeflerine yönelik bireysel takip grafiği." }
      ]
    },
    dil: {
      key: "dil",
      name: "Yabancı Dil (DİL)",
      color: "#27C281",
      IconComponent: Icon3DGlobe,
      stat: "800+",
      statLabel: "Haftalık YDT Soru Hedefi",
      tagline: "C1/C2 düzeyinde ileri İngilizce ve ikinci yabancı dil ile dünya standartlarında simultane tercümanlık ve küresel vizyon kazandırıyoruz.",
      curriculum: [
        { title: "Advanced Grammar & Academic Vocabulary", desc: "YDT ve uluslararası sınavlarda fark yaratan ileri düzey dil bilgisi." },
        { title: "Reading Comprehension & Çeviri", desc: "Akademik makaleler, denemeler ve hızlı kavrama pratikleri." },
        { title: "İkinci Yabancı Dil (Almanca)", desc: "A2/B1 düzeyinde konuşma, dinleme ve okuma yetkinliği." },
        { title: "IELTS / TOEFL / MUN Çalışmaları", desc: "Uluslararası geçerliliği olan dil sertifikasyonu hazırlığı." }
      ],
      faculties: [
        { title: "Mütercim ve Tercümanlık", desc: "Simultane ve yazılı çeviri odaklı prestijli lisans programları." },
        { title: "İngiliz Dili ve Edebiyatı & Dilbilim", desc: "Filoloji, teorik dilbilim ve edebiyat araştırmaları." },
        { title: "İngilizce Öğretmenliği", desc: "Eğitim fakülteleri bünyesindeki yabancı dil bölümleri." },
        { title: "Uluslararası Ticaret & Dış İlişkiler", desc: "Çok dilli küresel iş dünyası ve diplomasi kariyerleri." }
      ],
      routine: [
        { title: "Haftalık 12 Saat YDT Soru Kampları", desc: "Sınav formatına tam uyumlu soru çözümleme stratejileri." },
        { title: "Native Speaker Konuşma Kulüpleri", desc: "Akıcı sözlü ifade ve dinleme becerisi seansları." },
        { title: "Kelime & Deyim Takip Çizelgesi", desc: "Haftalık periyotlarla ölçülen kelime haznesi artışı." }
      ]
    }
  };

  const current = branches[activeTab] || branches.sayisal;
  const Active3DIcon = current.IconComponent;

  const stages = [
    {
      age: "3 — 6 Yaş",
      name: "Anaokulu",
      desc: "Montessori ve Reggio Emilia yaklaşımlarıyla, merak duygusunu ve çift dilli iletişimi besleyen erken çocukluk eğitimi.",
      bullets: ["Oyunla Çift Dilli İngilizce", "Doğa & Robotik Atölyeleri", "Sanat & Ritim Becerileri"]
    },
    {
      age: "1 — 4. Sınıf",
      name: "İlkokul",
      desc: "Okuma sevgisi, temel matematiksel sorgulama ve sosyal duyarlılığın sağlam temellere oturtulduğu gelişim basamağı.",
      bullets: ["Bireyselleştirilmiş Okuma", "Temel STEM Uygulamaları", "Düşünme Becerileri"]
    },
    {
      age: "5 — 8. Sınıf",
      name: "Ortaokul & LGS",
      desc: "LGS hazırlık sürecinde yeni nesil soru stratejileri, analizli denemeler ve birebir rehberlik koçluğu.",
      bullets: ["LGS Soru Kampı", "Analizli Haftalık Denemeler", "Mentorluk & Motivasyon"]
    },
    {
      age: "9 — 12. Sınıf",
      name: "Özel Anadolu Lisesi",
      desc: "Sayısal, Eşit Ağırlık, Sözel ve Dil branşlarında Türkiye derecelerine ulaştıran kapsamlı YKS hazırlığı.",
      bullets: ["Branşlaşmış Müfredat", "İleri Düzey Laboratuvar", "Kariyer & Üniversite Rehberliği"]
    }
  ];

  return (
    <div className="apple-egitim-root">
      
      {/* Editorial Minimalist Hero */}
      <section className="apple-hero">
        <div className="container">
          <span className="apple-eyebrow">LİSE ALAN SEÇİMLERİ & YKS DERECELERİ</span>
          <h1 className="apple-headline">
            Zekayı stratejiyle,<br />ilgiyi başarıyla buluşturuyoruz.
          </h1>
          <p className="apple-subheadline">
            Her öğrencinin bilişsel potansiyeline ve üniversite hedefine göre ayrışan, ezberden uzak uzmanlık programları.
          </p>
        </div>
      </section>

      {/* Apple-style Sticky Subnav */}
      <nav className="apple-subnav-bar" id="brans-odak">
        <div className="container apple-subnav-inner">
          <span className="apple-subnav-brand">Uzmanlaşma Alanları</span>
          <div className="apple-tab-group">
            <button 
              type="button" 
              onClick={() => setActiveTab("sayisal")}
              className={`apple-tab-btn ${activeTab === "sayisal" ? "active" : ""}`}
            >
              <span>Sayısal (MF)</span>
            </button>
            <button 
              type="button" 
              onClick={() => setActiveTab("esit")}
              className={`apple-tab-btn ${activeTab === "esit" ? "active" : ""}`}
            >
              <span>Eşit Ağırlık (TM)</span>
            </button>
            <button 
              type="button" 
              onClick={() => setActiveTab("sozel")}
              className={`apple-tab-btn ${activeTab === "sozel" ? "active" : ""}`}
            >
              <span>Sözel (TS)</span>
            </button>
            <button 
              type="button" 
              onClick={() => setActiveTab("dil")}
              className={`apple-tab-btn ${activeTab === "dil" ? "active" : ""}`}
            >
              <span>Yabancı Dil (DİL)</span>
            </button>
          </div>
        </div>
      </nav>

      {/* Nude Branch Detail Section */}
      <section className="apple-branch-stage">
        <div className="container">
          
          {/* Branch Header (Clean Title with 3D Icon, No category subtag line) */}
          <div className="apple-branch-header-wrap">
            <div className="clean-3d-slot">
              <Active3DIcon size={68} />
            </div>
            <div className="apple-branch-header">
              <h2 className="apple-branch-title">{current.name}</h2>
              <p className="apple-branch-tagline">{current.tagline}</p>
            </div>
          </div>

          {/* 3-Column Pure Typographic Grid */}
          <div className="apple-nude-grid">
            
            {/* Col 1: Müfredat & Kazanımlar */}
            <div className="apple-nude-col">
              <h3>Müfredat & Kazanımlar</h3>
              <div className="apple-nude-list">
                {current.curriculum.map((item, i) => (
                  <div key={i} className="apple-nude-item">
                    <span className="apple-item-title">{item.title}</span>
                    <span className="apple-item-desc">{item.desc}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Col 2: Hedeflenen Fakülteler */}
            <div className="apple-nude-col">
              <h3>Hedeflenen Fakülteler</h3>
              <div className="apple-nude-list">
                {current.faculties.map((item, i) => (
                  <div key={i} className="apple-nude-item">
                    <span className="apple-item-title">{item.title}</span>
                    <span className="apple-item-desc">{item.desc}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Col 3: Haftalık Ritim */}
            <div className="apple-nude-col">
              <div className="apple-stat-block">
                <div className="apple-big-num" style={{ color: current.color }}>{current.stat}</div>
                <div className="apple-stat-label">{current.statLabel}</div>
              </div>

              <h3>Haftalık Çalışma Ritmi</h3>
              <div className="apple-nude-list">
                {current.routine.map((item, i) => (
                  <div key={i} className="apple-nude-item">
                    <span className="apple-item-title">{item.title}</span>
                    <span className="apple-item-desc">{item.desc}</span>
                  </div>
                ))}
              </div>
            </div>

          </div>

          {/* Action Row */}
          <div className="apple-action-row">
            <span className="apple-action-text">
              {current.name} programı hakkında bilgi almak veya kampüsümüzü ziyaret etmek için iletişime geçin.
            </span>
            <Link href="/register" className="apple-cta-link">
              <span>Kayıt Başvurusu Yap</span>
              <ChevronRight size={16} />
            </Link>
          </div>

        </div>
      </section>

      {/* Kademeler Overview (Pure Typographic) */}
      <section className="apple-stages-section">
        <div className="container">
          <div className="apple-section-header">
            <span className="apple-sec-eyebrow">Tüm Kademeler</span>
            <h2 className="apple-sec-title">Gelişimin her evresinde yanınızdayız.</h2>
          </div>

          <div className="apple-stages-grid">
            {stages.map((stg, i) => (
              <div key={i} className="apple-stage-col">
                <span className="apple-stage-age">{stg.age}</span>
                <h3 className="apple-stage-name">{stg.name}</h3>
                <p className="apple-stage-desc">{stg.desc}</p>
                <div className="apple-stage-bullets">
                  {stg.bullets.map((b, bi) => (
                    <span key={bi} className="apple-bullet-row">• {b}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

    </div>
  );
}

export default function EgitimPage() {
  return (
    <>
      <Header />
      <Suspense fallback={<div style={{ padding: "100px", textAlign: "center", color: "#8A94A6" }}>Yükleniyor...</div>}>
        <AppleEgitimContent />
      </Suspense>
      <Footer />
    </>
  );
}
