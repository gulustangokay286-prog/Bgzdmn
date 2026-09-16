import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Plus, PanelLeftClose, PanelLeftOpen, ArrowUp, Trash2, BadgeCheck, ChevronDown } from 'lucide-react';
import { aiService } from '../services/aiService';
import { modul } from '../services/veri';
import { kullaniciAl } from '../services/api';
import { cx, hairline } from '../components/ui/tokens';
import novaAiIcon from '../assets/nova_ai_icon.png';

const formatMarkdown = (text) => {
  if (!text) return '';

  let escapedText = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

  let html = escapedText
    .replace(/####\s+(.*)/g, '<b class="text-[17px] font-bold text-slate-800 dark:text-slate-100 block mt-3 mb-1">$1</b>')
    .replace(/###\s+(.*)/g, '<b class="text-lg font-bold text-slate-800 dark:text-slate-100 block mt-3 mb-1">$1</b>')
    .replace(/##\s+(.*)/g, '<b class="text-xl font-bold text-slate-800 dark:text-slate-100 block mt-4 mb-2">$1</b>')
    .replace(/#\s+(.*)/g, '<b class="text-2xl font-bold text-slate-800 dark:text-slate-100 block mt-4 mb-2">$1</b>')
    .replace(/\*\*(.*?)\*\*/g, '<b class="font-bold text-slate-800 dark:text-slate-100">$1</b>')
    .replace(/\*(.*?)\*/g, '<i>$1</i>');
  return html;
};

/**
 * Bos ekran cizimi — elle cizilmis profil, 10 fps.
 *
 * Ayni cizimin hafifce titresen dort karesi saniyede on kez doner. Cizgiler
 * boylece kagit uzerinde kare kare cizilmis gibi "kaynar"; tek bir statik
 * vektorden cok daha canli durur. Renk `currentColor`, iki temada da uyar.
 */
const Cizim = ({ boyut = 132 }) => (
  <svg
    width={boyut} height={boyut} viewBox="0 0 200 200"
    fill="none" aria-hidden="true"
    className="text-slate-900 dark:text-slate-100"
  >
    <g stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
      <g className="nova-kare">
        <path d="M80 50C112 40 140 62 140 92C140 102 149 107 149 113C149 119 139 120 137 124C141 130 132 134 135 140C139 150 127 161 109 163C89 165 69 153 65 133C61 113 58 70 80 50" />
        <path d="M104 92C95 92 88 99 88 107C88 115 95 121 103 120C110 119 114 114 114 108" />
      </g>
      <g className="nova-kare">
        <path d="M80.3 49.9C113.1 41.4 139.9 62.5 138.6 92.6C140.5 103.6 150 106.3 148.6 113.5C147.5 118.9 137.9 118.8 135.6 124.9C139.8 129.2 131.7 135.2 133.7 139.8C139.2 151.2 128 162.2 108.3 162.7C88.5 166.2 70.5 151.9 64 132.1C60.1 113 58.3 69.2 78.4 49.7" />
        <path d="M103.6 92.2C96.4 92.6 88 99.4 88.6 105.6C89.3 115.9 96.2 122 102.7 119.7C108.7 119.4 112.6 112.6 113.1 106.9" />
      </g>
      <g className="nova-kare">
        <path d="M79.5 48.6C110.4 38.9 138.7 61.6 138.5 93.2C140.4 100.9 148.2 106.5 148.6 111.8C150.1 120.6 138.9 119.9 135.7 122.7C140.5 129.2 133.1 132.9 133.5 141.4C139.1 148.9 127.1 159.5 109.1 164.5C90.2 165.6 68.2 152.6 63.9 133.9C61.1 113.9 57.5 69.1 81 51.6" />
        <path d="M105.1 93C96 92.8 87.1 99.1 87.5 105.5C86.5 114.3 94.2 121.6 104.5 119.8C111.4 120.6 115.5 113.6 113.1 107.1" />
      </g>
      <g className="nova-kare">
        <path d="M79 49.1C112.4 41.3 141.1 61.9 140.5 93C138.7 102.5 150.3 107.9 149.8 112.9C148 119.9 138.5 121 138.5 123.7C140.7 131.4 132.7 132.9 133.8 138.9C140.3 151 125.9 162 110.5 163.5C88.5 165.2 67.8 151.4 66.5 133.5C61.1 114.4 57.8 71.2 81 49.1" />
        <path d="M103.2 91.3C94.2 92.3 87.2 98.7 86.8 108.3C87.5 114.9 95.3 122.3 102.7 121.3C110 119.1 114.1 112.5 113.8 107" />
      </g>
    </g>
  </svg>
);

/** Saate gore selamlama. */
const selamla = () => {
  const s = new Date().getHours();
  if (s < 6) return 'İyi geceler';
  if (s < 12) return 'Günaydın';
  if (s < 18) return 'İyi günler';
  return 'İyi akşamlar';
};

const GOREVLER = [
  { ad: 'Devamsızlık özeti', istem: 'Bu haftanın devamsızlık tablosunu yorumla, dikkat çeken öğrencileri ayrı bir başlıkta listele.' },
  { ad: 'Deneme analizi', istem: 'Son deneme sonuçlarını sınıf bazında karşılaştır ve net değişimlerini özetle.' },
  { ad: 'Dönem raporu', istem: 'Bu dönemin genel işleyişini madde madde özetleyen bir yönetim raporu hazırla.' },
  { ad: 'Veli duyurusu', istem: 'Veli toplantısı davetini, velilere uygun sade bir dille yaz.' },
  { ad: 'Öğrenci bilgilendirmesi', istem: 'Yaklaşan sınav takvimini öğrencilere duyuracak kısa bir metin yaz.' },
  { ad: 'Sınıf performansı', istem: 'Bir sınıfın güçlü ve zayıf yönlerini ders bazında çıkar.' },
  { ad: 'Devamsızlık riski', istem: 'Devamsızlığı artış eğiliminde olan öğrencileri gerekçesiyle işaretle.' },
  { ad: 'Program denetimi', istem: 'Ders programındaki çakışmaları ve boş kalan saatleri tespit et.' },
];

/** Sohbet gecmisini tarihe gore kumeler. */
const gecmisiKumele = (sohbetler) => {
  const simdi = new Date();
  const gunBasi = new Date(simdi.getFullYear(), simdi.getMonth(), simdi.getDate()).getTime();
  const haftaBasi = gunBasi - 6 * 86400000;

  const kumeler = [
    { baslik: 'Bugün', liste: [] },
    { baslik: 'Son 7 gün', liste: [] },
    { baslik: 'Daha eski', liste: [] },
  ];

  sohbetler.forEach((s) => {
    const t = new Date(s.updatedAt || s.guncellendi || 0).getTime();
    if (t >= gunBasi) kumeler[0].liste.push(s);
    else if (t >= haftaBasi) kumeler[1].liste.push(s);
    else kumeler[2].liste.push(s);
  });

  return kumeler.filter((k) => k.liste.length > 0);
};

/**
 * DUSUNCE PANELI
 *
 * Modelin kendi dusunce ozeti. Akarken basligi parlar ve metin canli akar;
 * bitince tek satira katlanir, istenirse acilir.
 */
const DusuncePaneli = ({ metin, akiyor, sure }) => {
  const [acik, setAcik] = useState(true);
  const kutuRef = useRef(null);

  useEffect(() => { setAcik(akiyor); }, [akiyor]);
  useEffect(() => {
    if (akiyor && kutuRef.current) kutuRef.current.scrollTop = kutuRef.current.scrollHeight;
  }, [metin, akiyor]);

  if (!metin && !akiyor) return null;

  return (
    <div className="w-full">
      <button
        onClick={() => setAcik((v) => !v)}
        className="flex items-center gap-1.5 bg-transparent border-0 p-0 cursor-pointer text-[12.5px] font-medium"
      >
        <span className={akiyor ? 'nova-shimmer' : 'text-slate-500 dark:text-slate-400'}>
          {akiyor ? 'Düşünüyor…' : `${sure} sn düşündü`}
        </span>
        <ChevronDown
          size={13}
          className={cx(
            'text-slate-400 transition-transform duration-200',
            acik && 'rotate-180'
          )}
        />
      </button>

      {acik && metin && (
        <div
          ref={kutuRef}
          className={cx(
            'nova-ac mt-2 max-h-52 overflow-y-auto custom-scrollbar pl-3 border-l-2',
            'border-[#1e3a8a]/25 text-[12.5px] leading-relaxed whitespace-pre-wrap',
            'text-slate-500 dark:text-slate-400'
          )}
        >
          {metin}
        </div>
      )}
    </div>
  );
};

const NovaAIAdminView = () => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 768 : false
  );
  const [prompt, setPrompt] = useState('');
  const [messages, setMessages] = useState([]);
  const [chatHistory, setChatHistory] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);

  // Canli akis durumu
  const [akiyor, setAkiyor] = useState(false);
  const [canliMetin, setCanliMetin] = useState('');
  const [canliDusunce, setCanliDusunce] = useState('');
  const [dusunmeSuresi, setDusunmeSuresi] = useState(0);
  const [gonderAnim, setGonderAnim] = useState(false);

  const [kullaniciAdi, setKullaniciAdi] = useState('');

  const messagesEndRef = useRef(null);
  const scrollContainerRef = useRef(null);
  const textareaRef = useRef(null);
  // Akan dusunce metnini kapanislarda guncel okumak icin.
  const canliDusunceRef = useRef('');
  useEffect(() => { canliDusunceRef.current = canliDusunce; }, [canliDusunce]);

  // Yazma alani icerige gore buyur
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const h = el.scrollHeight;
    if (h > 160) { el.style.height = '160px'; el.style.overflowY = 'auto'; }
    else { el.style.height = `${h}px`; el.style.overflowY = 'hidden'; }
  }, [prompt]);

  useEffect(() => {
    const currentUser = kullaniciAl();
    // Giris yaniti `full_name` tasir; eski kayitlarda `name` olabilir.
    const ad = currentUser?.full_name || currentUser?.name || localStorage.getItem('adminName') || '';
    setKullaniciAdi(ad);

    if (currentUser) {
      const unsubscribe = modul('nova_ai_chats').dinle((kayitlar) => {
        if (kayitlar?.length) {
          const chats = [...kayitlar].sort(
            (a, b) => new Date(b.updatedAt || b.guncellendi || 0) - new Date(a.updatedAt || a.guncellendi || 0));
          setChatHistory(chats);
        } else {
          setChatHistory([]);
        }
      });
      return () => unsubscribe();
    }
  }, []);

  const scrollToBottom = (instant = false) => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: instant ? 'auto' : 'smooth', block: 'end' });
    }
  };

  /** Kullanici dibe yakinsa akisla birlikte kaydir; yukari ciktiysa rahat birak. */
  const dipteyseKaydir = () => {
    const el = scrollContainerRef.current;
    if (!el) return;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 160) scrollToBottom(true);
  };

  useEffect(() => {
    if (messages.length > 0 || akiyor) scrollToBottom();
  }, [messages.length, akiyor]);

  const handleSend = async (e, hazirIstem) => {
    e?.preventDefault();
    const userMsg = (hazirIstem ?? prompt).trim();
    if (!userMsg || akiyor) return;

    setPrompt('');
    setGonderAnim(true);
    setTimeout(() => setGonderAnim(false), 420);

    const userMessageObj = { role: 'user', content: userMsg };
    setMessages((prev) => [...prev, userMessageObj]);
    setTimeout(() => scrollToBottom(), 40);

    setCanliMetin('');
    setCanliDusunce('');
    setDusunmeSuresi(0);
    setAkiyor(true);
    const baslangic = Date.now();

    const currentUser = kullaniciAl();
    let currentChatId = activeChatId;

    // Sohbet kaydi arka planda; yanit onu beklemez.
    const kayitIsi = (async () => {
      if (!currentUser) return null;
      try {
        if (!currentChatId) {
          const baslik = userMsg.substring(0, 30) + (userMsg.length > 30 ? '…' : '');
          const yeni = await modul('nova_ai_chats').ekle({
            kisi_id: currentUser.kisi_id ?? currentUser.id,
            baslik, title: baslik,
            updatedAt: new Date().toISOString(),
            messages: [userMessageObj],
          });
          currentChatId = yeni?.id;
          setActiveChatId(currentChatId);
        } else {
          const mevcut = await modul('nova_ai_chats').bul(currentChatId);
          await modul('nova_ai_chats').guncelle(currentChatId, {
            messages: [...(mevcut?.messages || []), userMessageObj],
            updatedAt: new Date().toISOString(),
          });
        }
      } catch (err) {
        console.error('Sohbet kaydedilemedi:', err?.message);
      }
      return currentChatId;
    })();

    try {
      const { metin } = await aiService.streamContent(userMsg, {
        onDusunce: (d) => { setCanliDusunce(d); dipteyseKaydir(); },
        onMetin: (m) => { setCanliMetin(m); dipteyseKaydir(); },
      });

      const sure = Math.max(1, Math.round((Date.now() - baslangic) / 1000));
      setDusunmeSuresi(sure);

      const assistantMessageObj = {
        role: 'assistant',
        content: metin,
        dusunce: canliDusunceRef.current,
        sure,
      };
      setMessages((prev) => [...prev, assistantMessageObj]);
      setAkiyor(false);
      setCanliMetin('');
      setCanliDusunce('');

      const chatId = await kayitIsi;
      if (chatId && currentUser) {
        try {
          const mevcut = await modul('nova_ai_chats').bul(chatId);
          await modul('nova_ai_chats').guncelle(chatId, {
            messages: [...(mevcut?.messages || []), assistantMessageObj],
            updatedAt: new Date().toISOString(),
          });
        } catch (err) {
          console.error('Sohbet yanitla guncellenemedi:', err?.message);
        }
      }
    } catch (error) {
      setAkiyor(false);
      setCanliMetin('');
      setCanliDusunce('');
      setMessages((prev) => [...prev, { role: 'assistant', content: `Bir hata oluştu: ${error.message}` }]);
    }
  };

  const handleNewChat = () => {
    setActiveChatId(null);
    setMessages([]);
    setCanliMetin('');
    setCanliDusunce('');
    setAkiyor(false);
    setPrompt('');
  };

  const loadChat = (chatId) => {
    setActiveChatId(chatId);
    setCanliMetin('');
    setCanliDusunce('');
    setAkiyor(false);
    setPrompt('');
    const chat = chatHistory.find((c) => c.id === chatId);
    if (chat) setMessages(chat.messages || []);
  };

  const sohbetSil = async (e, chatId) => {
    e.stopPropagation();
    try {
      await modul('nova_ai_chats').sil(chatId);
      if (activeChatId === chatId) handleNewChat();
    } catch (err) {
      console.error('Sohbet silinemedi:', err?.message);
    }
  };

  const bosEkran = messages.length === 0 && !akiyor;
  const kumeler = gecmisiKumele(chatHistory);
  const ilkAd = (kullaniciAdi || '').trim().split(' ')[0];

  const mobilePortalContainer = document.getElementById('nova-ai-mobile-portal');

  const mobileSidebarButton = (
    <button
      onClick={() => setIsSidebarOpen(!isSidebarOpen)}
      className="p-1.5 -ml-1 cursor-pointer text-slate-500 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.06] rounded-lg transition-colors inline-flex"
    >
      {isSidebarOpen ? <PanelLeftClose size={22} /> : <PanelLeftOpen size={22} />}
    </button>
  );

  return (
    <div className="absolute -inset-x-4 -top-4 -bottom-6 md:relative md:inset-auto md:w-full md:flex-1 md:h-full flex bg-white dark:bg-[#0f172a] overflow-hidden text-slate-800 dark:text-slate-200 font-sans md:rounded-[32px] md:shadow-sm md:border md:border-slate-200 dark:md:border-white/10 z-10 rounded-none border-none">

      {mobilePortalContainer && createPortal(mobileSidebarButton, mobilePortalContainer)}

      {/* Sol sutun — sohbet gecmisi */}
      <div className={cx(
        'absolute md:relative z-40 shrink-0 bg-slate-50 dark:bg-[#0b1120] border-r transition-all duration-300 ease-in-out overflow-hidden h-full',
        hairline,
        isSidebarOpen ? 'w-[264px]' : 'w-0'
      )}>
        <div className="w-[264px] flex flex-col h-full">
          <div className="p-3">
            <button
              onClick={handleNewChat}
              className={cx(
                'w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border bg-white dark:bg-[#0f172a]',
                hairline,
                'text-[13.5px] font-medium text-slate-700 dark:text-slate-200',
                'hover:border-[#1e3a8a]/40 hover:text-[#0f172a] dark:hover:text-[#93c5fd] transition-colors cursor-pointer'
              )}
            >
              <span className="flex items-center gap-2.5">
                <span className={cx('w-6 h-6 rounded-full border flex items-center justify-center overflow-hidden bg-white dark:bg-[#1e293b] p-[3px]', hairline)}>
                  <img src={novaAiIcon} alt="" className="w-full h-full object-contain dark:brightness-0 dark:invert" />
                </span>
                Yeni sohbet
              </span>
              <Plus size={15} className="text-slate-400" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-3 pb-2 custom-scrollbar">
            {kumeler.map((kume) => (
              <div key={kume.baslik} className="mb-4">
                <div className="text-[11px] font-semibold uppercase tracking-[0.07em] text-slate-400 dark:text-slate-500 mb-1.5 px-2">
                  {kume.baslik}
                </div>
                {kume.liste.map((chat) => (
                  <div
                    key={chat.id}
                    onClick={() => loadChat(chat.id)}
                    className={cx(
                      'group flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-[13px] cursor-pointer transition-colors mb-0.5',
                      activeChatId === chat.id
                        ? 'bg-[#1e3a8a]/10 text-[#0f172a] dark:text-[#93c5fd] font-medium'
                        : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/[0.04]'
                    )}
                  >
                    <span className="truncate">{chat.title || chat.baslik}</span>
                    <button
                      onClick={(e) => sohbetSil(e, chat.id)}
                      className="shrink-0 p-1 -mr-1 rounded-md text-slate-400 opacity-0 group-hover:opacity-100 hover:text-[#991b1b] hover:bg-white dark:hover:bg-white/10 transition-all"
                      title="Sohbeti sil"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
            ))}
            {chatHistory.length === 0 && (
              <p className="px-2.5 py-2 text-[12.5px] text-slate-400 dark:text-slate-500">
                Henüz sohbet yok.
              </p>
            )}
          </div>

          <div className={cx('p-3 border-t', hairline)}>
            <div className="flex items-center gap-2.5 px-1 py-1">
              <div className="w-8 h-8 rounded-full bg-[#1e3a8a] text-white flex items-center justify-center font-semibold text-[12px] shrink-0">
                {(ilkAd || 'NA').substring(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex items-center gap-1.5">
                <span className="text-[13px] font-medium text-slate-700 dark:text-slate-200 truncate">
                  {kullaniciAdi || 'Kullanıcı'}
                </span>
                <BadgeCheck size={15} className="text-[#1e3a8a] shrink-0" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Sag sutun — sohbet */}
      <div className="flex-1 flex flex-col bg-white dark:bg-[#0f172a] h-full transition-all relative min-w-0">

        <div className="hidden md:block absolute top-0 left-0 p-3 z-50 pointer-events-none">
          <div
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-2 cursor-pointer text-slate-400 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.06] rounded-lg transition-colors inline-flex pointer-events-auto"
            style={{ WebkitAppRegion: 'no-drag' }}
          >
            {isSidebarOpen ? <PanelLeftClose size={20} /> : <PanelLeftOpen size={20} />}
          </div>
        </div>

        {isSidebarOpen && (
          <div
            className="md:hidden absolute inset-0 bg-black/50 z-30 backdrop-blur-sm"
            onClick={() => setIsSidebarOpen(false)}
          />
        )}

        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-6 md:px-8 pt-16 pb-4 custom-scrollbar scroll-smooth">

          {bosEkran ? (
            <div className="h-full min-h-[380px] flex flex-col items-center justify-center text-center px-2">
              <Cizim />

              <h1
                className="m-0 mt-6 text-[36px] md:text-[46px] leading-[1.08] text-slate-900 dark:text-white"
                style={{ fontFamily: "'Newsreader', Georgia, serif", fontWeight: 300, letterSpacing: '0.012em' }}
              >
                {selamla()}{ilkAd ? `, ${ilkAd}` : ''}
              </h1>

              <p className="m-0 mt-3 text-[14px] text-slate-500 dark:text-slate-400 max-w-sm">
                Kurum verileriniz üzerine rapor, metin ve analiz üretir.
              </p>

              <div className="mt-10 flex flex-wrap justify-center gap-2 max-w-2xl">
                {GOREVLER.map((g) => (
                  <button
                    key={g.ad}
                    onClick={() => handleSend(null, g.istem)}
                    title={g.istem}
                    className={cx(
                      'px-3.5 py-2 rounded-full border bg-transparent cursor-pointer transition-colors',
                      hairline,
                      'text-[12.5px] text-slate-600 dark:text-slate-300',
                      'hover:border-[#1e3a8a]/45 hover:text-[#0f172a] dark:hover:text-[#93c5fd]'
                    )}
                  >
                    {g.ad}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto flex flex-col gap-7 w-full pb-4">
              {messages.map((msg, idx) => (
                msg.role === 'user' ? (
                  <div key={idx} className="flex w-full justify-end">
                    <div className="bg-slate-100 dark:bg-[#1e293b] text-slate-800 dark:text-slate-100 px-4 py-2.5 rounded-2xl max-w-[75%] text-[14.5px] leading-relaxed break-words">
                      {msg.content}
                    </div>
                  </div>
                ) : (
                  <div key={idx} className="w-full flex flex-col gap-3">
                    {msg.dusunce && (
                      <DusuncePaneli metin={msg.dusunce} akiyor={false} sure={msg.sure} />
                    )}
                    <div
                      className="text-slate-800 dark:text-slate-200 text-[14.5px] leading-relaxed whitespace-pre-wrap"
                      dangerouslySetInnerHTML={{ __html: formatMarkdown(msg.content) }}
                    />
                  </div>
                )
              ))}

              {akiyor && (
                <div className="w-full flex flex-col gap-3">
                  <DusuncePaneli metin={canliDusunce} akiyor={true} sure={dusunmeSuresi} />
                  {canliMetin ? (
                    <div
                      className="text-slate-800 dark:text-slate-200 text-[14.5px] leading-relaxed whitespace-pre-wrap"
                      dangerouslySetInnerHTML={{ __html: formatMarkdown(canliMetin) }}
                    />
                  ) : !canliDusunce ? (
                    <span className="nova-shimmer text-[14.5px] font-medium">Yanıt hazırlanıyor…</span>
                  ) : null}
                </div>
              )}

              <div ref={messagesEndRef} className="h-2" />
            </div>
          )}
        </div>

        {/* Yazma alani */}
        <div className="shrink-0 bg-white dark:bg-[#0f172a] pt-2 pb-7 px-6 md:px-8 mt-auto">
          <div className="max-w-3xl mx-auto">
            <form
              onSubmit={handleSend}
              className={cx(
                'rounded-[20px] border px-4 pt-3.5 pb-2.5 transition-colors',
                // Odakta zemin beyaza donuyordu ve kutu kayboluyordu; yuzey
                // rengi korunur, yalnizca kenar markaya gecer.
                'bg-[#F1F5F9] dark:bg-[#111a2e] border-slate-200/90 dark:border-white/10',
                'focus-within:border-[#1e3a8a]/60'
              )}
            >
              <textarea
                ref={textareaRef}
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
                }}
                placeholder="Bir rapor, metin veya analiz isteyin…"
                rows={1}
                className="nova-ai-input w-full resize-none bg-transparent overflow-hidden text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                style={{
                  fontFamily: "'Outfit', sans-serif",
                  fontSize: '15px',
                  lineHeight: '26px',
                  letterSpacing: '-0.005em',
                  minHeight: '26px',
                }}
              />

              <div className="flex items-center justify-between gap-3 mt-2">
                <span className="text-[11.5px] text-slate-400 dark:text-slate-500 select-none">
                  <kbd className="font-sans">Enter</kbd> gönder · <kbd className="font-sans">Shift+Enter</kbd> satır
                </span>
                <button
                  type="submit"
                  disabled={!prompt.trim() || akiyor}
                  className={cx(
                    'w-9 h-9 rounded-full flex items-center justify-center shrink-0 border-none outline-none transition-colors overflow-hidden',
                    !prompt.trim() || akiyor
                      ? 'bg-slate-100 dark:bg-white/10 text-slate-300 dark:text-slate-600 cursor-not-allowed'
                      : 'bg-[#1e3a8a] text-white hover:bg-[#0f172a] cursor-pointer'
                  )}
                >
                  <ArrowUp size={18} strokeWidth={2.5} className={gonderAnim ? 'nova-gonder-anim' : undefined} />
                </button>
              </div>
            </form>
            <p className="m-0 text-center mt-2.5 text-[11.5px] text-slate-400 dark:text-slate-500">
              Nova AI hata yapabilir. Önemli bilgileri kontrol edin.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
};

export default NovaAIAdminView;
