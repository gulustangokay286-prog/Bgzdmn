import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { Send, Search, CheckCheck, MoreVertical, Laptop, Smartphone, Lock, X, ArrowLeft, Plus, Smile, Mic, Image as ImageIcon, FileText, Music, Video } from 'lucide-react';
import { api, kullaniciAl, dinle as soketDinle, soketAl } from '../services/api';
import { kullaniciServisi } from '../services/kullaniciServisi';

/* ----------------------------------------------------------------------------
   LIQUID GLASS
   Arka plani feTurbulence + feDisplacementMap ile "kirip" cam gibi gosteren
   SVG filtresi. `backdrop-filter: url(#lg-liquid)` ile kullanilir (Chromium /
   Electron). Yalnizca giris kutulari ve yuvarlak butonlar .lg-glass alir (index.css).
   -------------------------------------------------------------------------- */
const LiquidGlassDefs = () => (
  <svg width="0" height="0" aria-hidden="true" style={{ position: 'absolute', pointerEvents: 'none' }}>
    <filter id="lg-liquid" x="-10%" y="-10%" width="120%" height="120%" colorInterpolationFilters="sRGB">
      <feTurbulence type="fractalNoise" baseFrequency="0.011 0.019" numOctaves="2" seed="7" result="n">
        <animate attributeName="baseFrequency" dur="14s" values="0.011 0.019;0.015 0.023;0.011 0.019" repeatCount="indefinite" />
      </feTurbulence>
      <feGaussianBlur in="n" stdDeviation="1.4" result="nb" />
      <feDisplacementMap in="SourceGraphic" in2="nb" scale="9" xChannelSelector="R" yChannelSelector="G" />
    </filter>
  </svg>
);

/* api_users kimligi "usr_183" bicimindedir; sunucu sohbet ucu olarak sayisal kisi_id ister. */
const kisiIdOf = (u) => {
  if (!u) return null;
  if (u.kisi_id !== undefined && u.kisi_id !== null) return String(u.kisi_id);
  const raw = String(u.id || u._id || (u.name || '').split('/').pop() || '');
  const n = raw.replace(/^usr_/, '');
  return n || null;
};

const adOf = (u) => u?.fields?.fullName?.stringValue || u?.fields?.full_name?.stringValue || u?.full_name || 'İsimsiz Kullanıcı';
const rolOf = (u) => (u?.fields?.role?.stringValue || u?.role || '').toLowerCase();

const ROL_ETIKET = {
  student: 'Öğrenci', 'öğrenci': 'Öğrenci', ogrenci: 'Öğrenci',
  teacher: 'Öğretmen', 'öğretmen': 'Öğretmen', ogretmen: 'Öğretmen',
  parent: 'Veli', veli: 'Veli',
  personnel: 'Personel', personel: 'Personel',
  idare: 'İdare', admin: 'Yönetici',
};
const rolEtiketi = (r) => ROL_ETIKET[(r || '').toLowerCase()] || (r || 'Bilinmiyor');
const rolGrubu = (r) => {
  const x = (r || '').toLowerCase();
  if (['student', 'öğrenci', 'ogrenci'].includes(x)) return 'ogrenci';
  if (['teacher', 'öğretmen', 'ogretmen'].includes(x)) return 'ogretmen';
  if (['parent', 'veli'].includes(x)) return 'veli';
  if (['personnel', 'personel', 'idare'].includes(x)) return 'personel';
  return 'diger';
};

const FILTRELER = [
  { id: 'tumu', ad: 'Tümü' },
  { id: 'okunmamis', ad: 'Okunmamış' },
  { id: 'ogrenci', ad: 'Öğrenci' },
  { id: 'veli', ad: 'Veli' },
  { id: 'ogretmen', ad: 'Öğretmen' },
  { id: 'personel', ad: 'Personel' },
];

const gunAnahtari = (d) => {
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? '' : `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
};
const gunEtiketi = (d) => {
  const key = gunAnahtari(d);
  if (!key) return '';
  const bugun = gunAnahtari(new Date());
  const dun = gunAnahtari(new Date(Date.now() - 86400000));
  if (key === bugun) return 'BUGÜN';
  if (key === dun) return 'DÜN';
  return new Date(d).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
};
/* Liste saati: bugun HH:MM, dun "Dün", eski gun tarih. */
const listeZamani = (d) => {
  if (!d) return '';
  const key = gunAnahtari(d);
  const bugun = gunAnahtari(new Date());
  const dun = gunAnahtari(new Date(Date.now() - 86400000));
  if (key === bugun) return new Date(d).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  if (key === dun) return 'Dün';
  return new Date(d).toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: '2-digit' });
};

const ChatView = () => {
  const [users, setUsers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filtre, setFiltre] = useState('tumu');

  const [activeUser, setActiveUser] = useState(null);
  const [activeConversationId, setActiveConversationId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [loading, setLoading] = useState(true);

  const [showRightMenu, setShowRightMenu] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [messageSearchQuery, setMessageSearchQuery] = useState('');
  const [partnerStatus, setPartnerStatus] = useState(null);
  const [partnerTyping, setPartnerTyping] = useState(false);
  const typingTimeoutRef = useRef(null);

  const messagesEndRef = useRef(null);
  const searchInputRef = useRef(null);

  const [selectedFile, setSelectedFile] = useState(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const fileInputRef = useRef(null);
  const recordingTimerRef = useRef(null);

  const currentUser = kullaniciAl();
  const adminId = currentUser ? String(currentUser.kisi_id ?? currentUser.id) : 'admin_fallback';
  const [pendingMessages, setPendingMessages] = useState([]);
  const [adminConversations, setAdminConversations] = useState([]);

  useEffect(() => {
    const loadUsers = async () => {
      const allUsers = await kullaniciServisi.fetchAllUsers();
      setUsers(allUsers);
      setLoading(false);
    };
    loadUsers();
  }, []);

  /* Menu, disina basilinca mousedown'da kapanir; eski tam ekran perde ilk
     tiklamayi yutuyordu (arama / uc nokta ikinci basista calisiyordu). */
  useEffect(() => {
    if (!showRightMenu) return undefined;
    const kapat = (e) => { if (!e.target.closest('[data-wa-menu]')) setShowRightMenu(false); };
    document.addEventListener('mousedown', kapat);
    return () => document.removeEventListener('mousedown', kapat);
  }, [showRightMenu]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (!adminId || adminId === 'admin_fallback') return;

    /* Cevrimici bilgisi soket uzerinden tasinir. Kalici veri degil; baglanti
       kopunca sunucu kisiyi kendiliginden cevrimdisi isaretler. */
    const soket = soketAl();
    const bildir = () => soket.emit('durum:giris', adminId);
    bildir();
    soket.on('connect', bildir);
    return () => { soket.off('connect', bildir); };
  }, [adminId]);

  const sohbetleriYukle = useCallback(() => api.get('/api/sohbetler')
    .then((d) => setAdminConversations(d?.kayitlar || []))
    .catch((e) => console.warn('Sohbetler okunamadı:', e?.message)), []);

  useEffect(() => {
    if (!adminId || adminId === 'admin_fallback') return;
    /* Sunucu yalnizca bu kisinin katildigi sohbetleri doner. Veritabaninda
       yayin tetigi yalnizca `mesajlar` tablosunda; liste (son mesaj, saat,
       okunmamis) bu yuzden mesaj kanalindan tazelenir. */
    sohbetleriYukle();
    const kapat1 = soketDinle('sohbetler', sohbetleriYukle);
    const kapat2 = soketDinle('mesajlar', sohbetleriYukle);
    return () => { kapat1(); kapat2(); };
  }, [adminId, sohbetleriYukle]);

  useEffect(() => {
    if (!activeUser || !activeConversationId) {
      setPartnerStatus(null);
      setPartnerTyping(false);
      return;
    }
    const userId = kisiIdOf(activeUser);

    const soket = soketAl();
    const durumDegisti = ({ kisiId, cevrimici }) => {
      if (String(kisiId) === String(userId)) setPartnerStatus(cevrimici ? { state: 'online' } : { state: 'offline' });
    };
    const durumListesi = (liste) => {
      setPartnerStatus(liste.map(String).includes(String(userId)) ? { state: 'online' } : { state: 'offline' });
    };
    const yaziyorOlayi = ({ sohbetId, kisiId, yaziyor }) => {
      if (String(sohbetId) === String(activeConversationId) && String(kisiId) === String(userId)) {
        setPartnerTyping(Boolean(yaziyor));
      }
    };
    soket.on('durum:degisti', durumDegisti);
    soket.on('durum:liste', durumListesi);
    soket.on('yaziyor', yaziyorOlayi);
    soket.emit('durum:sor');

    return () => {
      soket.off('durum:degisti', durumDegisti);
      soket.off('durum:liste', durumListesi);
      soket.off('yaziyor', yaziyorOlayi);
    };
  }, [activeUser, activeConversationId]);

  /* SOHBET KIMLIGI listeden turetilir; yalnizca kisi degisince ya da bu kisi
     icin ilk kez sohbet acilinca degisir. Liste her tazelendiginde mesajlari
     silip yeniden cekmek ekrani titretiyordu (abonelik de her seferinde
     yeniden kuruluyordu). */
  const sohbetSahibiRef = useRef(null); // activeConversationId hangi kisiye ait
  useEffect(() => {
    if (!activeUser) { sohbetSahibiRef.current = null; setActiveConversationId(null); return; }
    const userId = kisiIdOf(activeUser);
    const mevcut = adminConversations.find(
      (c) => String(c.karsi_kisi_id ?? c.partnerId) === String(userId));
    if (mevcut) {
      sohbetSahibiRef.current = userId;
      setActiveConversationId(mevcut.id);
    } else if (sohbetSahibiRef.current !== userId) {
      // Baska kisiye gecildi ve sohbeti yok; gonderim sirasinda acilan sohbet korunur.
      sohbetSahibiRef.current = null;
      setActiveConversationId(null);
    }
  }, [activeUser, adminConversations]);

  /* MESAJLAR: sohbet kimligine bagli tek abonelik. `mesajlar` tablosuna her
     yazma (LISTEN/NOTIFY -> socket) listeyi yeniden ceker; acik sohbet okunmus
     isaretlenir. Kisi degisince mesajlar temizlenir, liste tazelenince degil. */
  useEffect(() => {
    setMessages([]);
    if (!activeConversationId) return undefined;
    const sohbetId = activeConversationId;
    let birakildi = false;
    let sonImza = '';

    const yukle = () => api.get(`/api/sohbetler/${sohbetId}/mesajlar`)
      .then((d) => {
        if (birakildi) return;
        const kayitlar = d?.kayitlar || [];
        // Ayni icerik ikinci kez gelirse state'e dokunulmaz (gereksiz render yok).
        const imza = kayitlar.map((m) => `${m.id}:${m.zaman}`).join('|');
        if (imza === sonImza) return;
        sonImza = imza;
        setMessages(kayitlar.map((m) => ({
          id: m.id,
          conversationId: sohbetId,
          senderId: String(m.gonderen_id),
          content: m.icerik,
          type: m.tur || 'text',
          fileUrl: m.dosya_url || null,
          createdAt: m.zaman,
          deliveryState: 'sent',
        })));
        setTimeout(scrollToBottom, 50);
        // Acik sohbette gelen her sey okunmus sayilir; rozet sunucuda sifirlanir.
        api.post(`/api/sohbetler/${sohbetId}/okundu`, {}).then(sohbetleriYukle).catch(() => {});
      })
      .catch((e) => console.warn('Mesajlar okunamadı:', e?.message));

    yukle();
    const kapat = soketDinle('mesajlar', yukle);
    return () => { birakildi = true; kapat(); };
  }, [activeConversationId, sohbetleriYukle]);

  const handleTyping = (e) => {
    setNewMessage(e.target.value);

    if (!activeConversationId || !adminId) return;

    const soket = soketAl();
    soket.emit('yaziyor', { sohbetId: activeConversationId, kisiId: adminId, yaziyor: true });

    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      soket.emit('yaziyor', { sohbetId: activeConversationId, kisiId: adminId, yaziyor: false });
    }, 2000);
  };

  const uploadFileToCloudinary = async (file, type) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('upload_preset', 'ml_default');
    formData.append('folder', 'ial-mobil/chat');

    const resourceType = type === 'audio' || type === 'video' ? 'video' : 'auto';
    try {
      const response = await fetch(`https://api.cloudinary.com/v1_1/dbfhcj6px/${resourceType}/upload`, {
        method: 'POST',
        body: formData
      });
      if (!response.ok) throw new Error('Cloudinary upload failed');
      const data = await response.json();
      return data.secure_url;
    } catch (error) {
      console.error('Upload error:', error);
      return null;
    }
  };

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files[0]) {
      setSelectedFile(e.target.files[0]);
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream);
      audioChunksRef.current = [];

      mediaRecorderRef.current.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorderRef.current.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const file = new File([audioBlob], 'voice_message.webm', { type: 'audio/webm' });
        setSelectedFile(file);
      };

      mediaRecorderRef.current.start();
      setIsRecording(true);
      setRecordingTime(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    } catch (error) {
      console.error('Mic access denied:', error);
      alert('Mikrofon erişimi reddedildi.');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      clearInterval(recordingTimerRef.current);
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
  };

  const formatDuration = (seconds) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleSendMessage = async (e) => {
    if (e) e.preventDefault();
    if ((!newMessage.trim() && !selectedFile) || !activeUser) return;

    const content = newMessage.trim();
    const currentFile = selectedFile;

    setNewMessage('');
    setSelectedFile(null);

    if (activeConversationId) {
      soketAl().emit('yaziyor', { sohbetId: activeConversationId, kisiId: adminId, yaziyor: false });
    }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);

    const userId = kisiIdOf(activeUser);
    let finalConvoId = activeConversationId;

    let msgType = 'text';
    let filePreviewUrl = null;
    if (currentFile) {
      if (currentFile.type.startsWith('image/')) msgType = 'image';
      else if (currentFile.type.startsWith('audio/')) msgType = 'audio';
      else if (currentFile.type.startsWith('video/')) msgType = 'video';
      else msgType = 'file';
      try {
        filePreviewUrl = URL.createObjectURL(currentFile);
      } catch (err) {}
    }

    const tempId = 'temp_' + Date.now();
    const tempMsg = {
      id: tempId,
      conversationId: finalConvoId || 'pending',
      senderId: adminId,
      type: msgType,
      content: content,
      fileUrl: filePreviewUrl,
      createdAt: new Date(),
      deliveryState: 'sending',
      isOptimistic: true
    };

    setPendingMessages(prev => [...prev, tempMsg]);
    setTimeout(scrollToBottom, 20);

    try {
      let fileUrl = null;
      if (currentFile) {
        fileUrl = await uploadFileToCloudinary(currentFile, msgType);
      }

      if (!finalConvoId) {
        // Ayni ikili icin ikinci sohbet acilmaz; sunucu varsa mevcudu doner.
        const d = await api.post('/api/sohbetler', { kisiId: userId });
        finalConvoId = d?.kayit?.id;
        sohbetSahibiRef.current = userId;
        setActiveConversationId(finalConvoId); // abonelik effect'te kurulur
      }

      // Sohbetin son mesaj bilgisini sunucu kendisi gunceller.
      await api.post(`/api/sohbetler/${finalConvoId}/mesajlar`, {
        icerik: content,
        tur: msgType,
        dosya_url: fileUrl || null,
      });
      sohbetleriYukle();
    } catch (error) {
      console.error('Mesaj gönderme hatası:', error);
    } finally {
      /* Gecici balon, gercek kayit sokete dusene kadar ekranda kalir (ayni
         gonderen+icerik gelince liste onu zaten gizler); 8 sn sonra her
         durumda kaldirilir. 400 ms'de silmek balonu yok edip geri getiriyordu. */
      setTimeout(() => {
        setPendingMessages(prev => prev.filter(m => m.id !== tempId));
      }, 8000);
    }
  };

  const handleClearChat = async () => {
    if (!activeConversationId) return;
    const confirmClear = window.confirm('Bu sohbetteki mesajları silmek istediğinize emin misiniz? (Bu işlem sohbeti sizin için temizler)');
    if (!confirmClear) return;
    /* "Benden sil" ozelligi VDS'e henuz tasinmadi; ekran mesajlari yalnizca bu
       oturumda gizler, sohbet silinmez. */
    setMessages([]);
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return '...';
    const d = new Date(timestamp);
    return d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  };

  const getAvatarUrl = (u) => {
    if (!u) return null;
    const url = u.avatarUrl || u.avatar || u.photoURL || u.profileImage || u.profile_image || u.profileImageUrl ||
      u.fields?.profile_image?.stringValue || u.fields?.profileImage?.stringValue || u.fields?.profileImageUrl?.stringValue ||
      u.fields?.photoURL?.stringValue || u.fields?.avatarUrl?.stringValue || null;
    if (url && url.startsWith('mockup:')) {
      return '/mockups/' + url.substring(7) + '.png';
    }
    return (url && url !== 'null' && url !== 'undefined' && url.trim() !== '') ? url : null;
  };

  const renderAvatar = (u, name, sizeClass = 'w-10 h-10 text-[14px]') => {
    const avatarUrl = getAvatarUrl(u);
    const initial = (name || 'U').charAt(0).toUpperCase();

    const grup = rolGrubu(rolOf(u));
    const isStudent = grup === 'ogrenci';
    const isTeacher = grup === 'ogretmen';
    const genderRaw = (u?.fields?.gender?.stringValue || u?.gender || '').toLowerCase();
    const isFemale = genderRaw === 'kız' || genderRaw === 'kadın' || genderRaw === 'female' || genderRaw === 'kiz';

    const getStudentMockup = () => {
      if (isFemale) {
        const girls = ['/mockups/girl_student_1.png', '/mockups/girl_student_2.png'];
        return girls[name.length % 2];
      }
      const boys = ['/mockups/boy_student_1.png', '/mockups/boy_student_2.png'];
      return boys[name.length % 2];
    };

    const kabuk = `${sizeClass} rounded-full overflow-hidden shrink-0 relative wa-avatar`;

    if (avatarUrl) {
      return (
        <div className={kabuk}>
          <img
            src={avatarUrl}
            alt={name}
            className="w-full h-full object-cover absolute inset-0 z-10"
            onError={(e) => {
              e.target.style.display = 'none';
              if (e.target.nextSibling) e.target.nextSibling.style.display = 'flex';
            }}
          />
          <div className="w-full h-full items-center justify-center absolute inset-0 z-0" style={{ display: 'none' }}>
            {isStudent ? (
              <img src={getStudentMockup()} alt="" className="w-full h-full object-cover" />
            ) : isTeacher ? (
              <img src="/mockups/teacher_mockup.png" alt="" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full wa-avatar-fallback font-semibold flex items-center justify-center">{initial}</div>
            )}
          </div>
        </div>
      );
    }

    if (isStudent) {
      return (
        <div className={`${kabuk} flex items-center justify-center`}>
          <img src={getStudentMockup()} alt="" className="w-full h-full object-cover" />
        </div>
      );
    }

    if (isTeacher) {
      return (
        <div className={`${kabuk} flex items-center justify-center`}>
          <img src="/mockups/teacher_mockup.png" alt="" className="w-full h-full object-cover" />
        </div>
      );
    }

    return (
      <div className={`${kabuk} wa-avatar-fallback flex items-center justify-center font-semibold`}>
        {initial}
      </div>
    );
  };

  /* ------------------------------------------------------------ SOL LISTE --- */
  const sohbetHaritasi = useMemo(() => {
    const m = new Map();
    for (const c of adminConversations) {
      const pid = c.karsi_kisi_id ?? c.partnerId;
      if (pid !== undefined && pid !== null) m.set(String(pid), c);
    }
    return m;
  }, [adminConversations]);

  const listeSatirlari = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const satirlar = [];
    for (const u of users) {
      const uid = kisiIdOf(u);
      const r = rolOf(u);
      if (!uid || uid === adminId) continue;
      if (r === 'admin' || r === 'yönetici' || r === 'patron') continue;
      const name = adOf(u);
      if (q && !name.toLowerCase().includes(q)) continue;
      const grup = rolGrubu(r);
      const sohbet = sohbetHaritasi.get(uid) || null;
      const okunmamis = Number(sohbet?.okunmamis || 0);
      if (filtre === 'okunmamis' && !okunmamis) continue;
      if (['ogrenci', 'veli', 'ogretmen', 'personel'].includes(filtre) && grup !== filtre) continue;
      satirlar.push({ user: u, uid, name, rol: r, grup, sohbet, okunmamis,
        zaman: sohbet?.son_mesaj_zaman || sohbet?.guncellendi || null });
    }
    // Yazismasi olanlar en ustte, en son yazisan ilk; kalanlar ada gore.
    satirlar.sort((a, b) => {
      const az = a.sohbet?.son_mesaj ? new Date(a.zaman).getTime() : 0;
      const bz = b.sohbet?.son_mesaj ? new Date(b.zaman).getTime() : 0;
      if (az !== bz) return bz - az;
      return a.name.localeCompare(b.name, 'tr');
    });
    return satirlar;
  }, [users, searchQuery, filtre, sohbetHaritasi, adminId]);

  const okunmamisToplam = useMemo(
    () => adminConversations.reduce((t, c) => t + Number(c.okunmamis || 0), 0), [adminConversations]);

  const aktifAd = activeUser ? adOf(activeUser) : '';

  const gorunenMesajlar = useMemo(() => (
    [...messages, ...pendingMessages.filter(pending => !messages.some(m => m.senderId === pending.senderId && m.content === pending.content && m.type === pending.type))]
      .filter(msg => !messageSearchQuery || (msg.content && msg.content.toLowerCase().includes(messageSearchQuery.toLowerCase())))
  ), [messages, pendingMessages, messageSearchQuery]);

  const onizleme = (sohbet) => {
    if (!sohbet?.son_mesaj) return null;
    return String(sohbet.son_mesaj).replace(/\s+/g, ' ').trim();
  };

  return (
    <div className="wa-root absolute inset-0 flex flex-col font-sans overflow-hidden z-30">
      <LiquidGlassDefs />
      <div className="w-full h-full flex">

        {/* ======================================================= SOL PANEL */}
        <aside className={`${activeUser ? 'hidden md:flex' : 'flex'} wa-left w-full md:w-[312px] xl:w-[340px] flex-col h-full shrink-0 relative`}>
          {/* Arama — liquid glass hap */}
          <div className="relative z-10 px-3 pt-3 pb-2 shrink-0">
            <label className="lg-glass lg-glass--pill flex items-center h-[38px] px-3 gap-2 cursor-text">
              <Search size={17} className="wa-muted shrink-0" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Ara veya yeni sohbet başlat"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="wa-input flex-1 !bg-transparent !border-none !shadow-none !rounded-none !p-0 !m-0 !outline-none focus:!ring-0 text-[14px]"
              />
              {searchQuery && (
                <button type="button" onClick={() => setSearchQuery('')} className="wa-muted hover:text-white shrink-0"><X size={15} /></button>
              )}
            </label>
          </div>

          {/* Filtre çipleri */}
          <div className="relative z-10 px-3 pb-2 flex gap-1.5 overflow-x-auto wa-chips shrink-0">
            {FILTRELER.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFiltre(f.id)}
                className={`wa-chip ${filtre === f.id ? 'wa-chip--on' : ''}`}
              >
                {f.ad}
                {f.id === 'okunmamis' && okunmamisToplam > 0 && <span className="wa-chip-badge">{okunmamisToplam}</span>}
              </button>
            ))}
          </div>

          {/* Liste */}
          <div className="relative z-10 flex-1 overflow-y-auto wa-scroll">
            {loading ? (
              <div className="wa-list-skel">
                {Array.from({ length: 9 }).map((_, i) => (
                  <div key={i} className="wa-row-skel"><span className="wa-skel-av" /><span className="wa-skel-lines"><i /><i /></span></div>
                ))}
              </div>
            ) : listeSatirlari.length === 0 ? (
              <div className="p-8 text-center wa-muted text-[13px]">
                {filtre === 'okunmamis' ? 'Okunmamış sohbet yok.' : 'Kullanıcı bulunamadı.'}
              </div>
            ) : (
              listeSatirlari.map(({ user, uid, name, rol, sohbet, okunmamis, zaman }) => {
                const isActive = activeUser && kisiIdOf(activeUser) === uid;
                const on = onizleme(sohbet);
                const benim = sohbet && String(sohbet.son_mesaj_gonderen) === adminId;
                return (
                  <div
                    key={uid}
                    onClick={() => setActiveUser(user)}
                    className={`wa-row ${isActive ? 'wa-row--active' : ''}`}
                  >
                    {renderAvatar(user, name, 'w-[49px] h-[49px] text-[17px]')}
                    <div className="wa-row-body">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="wa-row-name truncate">{name}</span>
                        {on && <span className={`wa-row-time ${okunmamis ? 'wa-row-time--unread' : ''}`}>{listeZamani(zaman)}</span>}
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-[2px]">
                        <span className="wa-row-preview truncate">
                          {on ? (
                            <>
                              {benim && <CheckCheck size={15} className="inline-block mr-1 -mt-[2px] wa-tick" />}
                              {on}
                            </>
                          ) : (
                            <span className={`wa-role wa-role--${rolGrubu(rol)}`}>{rolEtiketi(rol)}</span>
                          )}
                        </span>
                        {okunmamis > 0 && <span className="wa-badge">{okunmamis > 99 ? '99+' : okunmamis}</span>}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>

        {/* ======================================================= SAG PANEL */}
        <main className={`${activeUser ? 'flex' : 'hidden md:flex'} flex-1 flex-col h-full relative min-w-0 wa-main`}>
          {activeUser ? (
            <>
              <div className="wa-float-head absolute top-0 left-0 right-0 z-30">
              <div className="wa-blur-stack" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /><i /><i /></div>
              <header className="h-[60px] px-3 md:px-4 flex items-center justify-between">
                <div className="flex items-center gap-2.5 md:gap-3 min-w-0">
                  <button type="button" onClick={() => setActiveUser(null)} className="md:hidden wa-icon-btn -ml-1">
                    <ArrowLeft size={22} />
                  </button>
                  {renderAvatar(activeUser, aktifAd, 'w-10 h-10 text-[14px]')}
                  <div className="min-w-0">
                    <div className="wa-title font-medium text-[16px] leading-tight truncate">{aktifAd}</div>
                    <div className="text-[12.5px] leading-tight wa-muted truncate">
                      {partnerTyping ? (
                        <span className="wa-green font-medium inline-flex items-center gap-1.5">
                          yazıyor
                          <span className="inline-flex gap-0.5 items-center translate-y-[2px]">
                            <span className="w-1 h-1 bg-current rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                            <span className="w-1 h-1 bg-current rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                            <span className="w-1 h-1 bg-current rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                          </span>
                        </span>
                      ) : partnerStatus && partnerStatus.state === 'online' ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span className="relative inline-flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full wa-bg-green opacity-70"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 wa-bg-green"></span>
                          </span>
                          çevrimiçi
                        </span>
                      ) : (
                        <span>{rolEtiketi(rolOf(activeUser))}{activeUser.fields?.branch?.stringValue ? ` · ${activeUser.fields.branch.stringValue}` : ''}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-0.5 relative">
                  <button type="button" title="Sohbette ara" onClick={() => { setShowSearch(!showSearch); setMessageSearchQuery(''); setShowRightMenu(false); }} className={`wa-icon-btn ${showSearch ? 'wa-icon-btn--on' : ''}`}>
                    <Search size={21} strokeWidth={1.8} />
                  </button>
                  <div className="relative" data-wa-menu>
                    <button type="button" title="Menü" onClick={() => { setShowRightMenu(!showRightMenu); setShowSearch(false); }} className={`wa-icon-btn ${showRightMenu ? 'wa-icon-btn--on' : ''}`}>
                      <MoreVertical size={21} strokeWidth={1.8} />
                    </button>
                    {showRightMenu && (
                      <div className="wa-menu lg-glass absolute right-0 top-12 w-52 py-1.5 z-50">
                        <button type="button" onClick={() => { setShowRightMenu(false); sohbetleriYukle(); }} className="wa-menu-item">
                          Sohbetleri yenile
                        </button>
                        <button type="button" onClick={() => { setShowRightMenu(false); handleClearChat(); }} className="wa-menu-item wa-menu-item--danger">
                          Sohbeti temizle
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </header>

              {showSearch && (
                <div className="px-3 pb-2.5 pt-0.5 flex items-center">
                  <label className="lg-glass lg-glass--pill flex-1 flex items-center h-[38px] px-3 gap-2 cursor-text">
                    <Search size={16} className="wa-muted shrink-0" />
                    <input
                      type="text"
                      placeholder="Bu sohbette ara"
                      value={messageSearchQuery}
                      onChange={(e) => setMessageSearchQuery(e.target.value)}
                      className="wa-input flex-1 !bg-transparent !border-none !shadow-none !rounded-none !p-0 !m-0 !outline-none focus:!ring-0 text-[13.5px]"
                      autoFocus
                    />
                    <button type="button" onClick={() => { setShowSearch(false); setMessageSearchQuery(''); }} className="wa-muted hover:text-white"><X size={15} /></button>
                  </label>
                </div>
              )}
              </div>

              {/* Mesajlar — yuzen basligin altindan kayar */}
              <div className={`wa-wallpaper flex-1 overflow-y-auto wa-scroll px-4 sm:px-[8%] flex flex-col gap-2.5 z-10 relative ${showSearch ? 'pt-[152px]' : 'pt-[104px]'} pb-[84px]`}>
                <div className="text-center mb-6">
                  <span className="wa-sys-chip">
                    <Lock size={12} className="text-[#8696a0]" />
                    Mesajlarınız uçtan uca şifrelenmektedir.
                  </span>
                </div>

                {!activeConversationId && messages.length === 0 && (
                  <div className="flex-1 flex items-center justify-center wa-muted text-[13.5px] font-medium">
                    Bu kullanıcı ile henüz bir sohbetiniz yok. Başlamak için bir mesaj gönderin.
                  </div>
                )}

                {gorunenMesajlar.map((msg, idx, arr) => {
                  const isMe = msg.senderId === adminId;
                  const nextMsg = arr[idx + 1];
                  const prevMsg = arr[idx - 1];
                  const gunDegisti = !prevMsg || gunAnahtari(prevMsg.createdAt) !== gunAnahtari(msg.createdAt);
                  const isConsecutive = prevMsg && prevMsg.senderId === msg.senderId;
                  const isLastInGroup = !nextMsg || nextMsg.senderId !== msg.senderId;
                  const showTail = isLastInGroup;
                  const mt = isConsecutive ? 'mt-[3px]' : 'mt-3';

                  const msgKey = msg.id || (msg.createdAt ? String(msg.createdAt) : `temp_${idx}`);
                  const isLast = idx === arr.length - 1;
                  const msgTime = msg.createdAt ? new Date(msg.createdAt).getTime() : Date.now();
                  const isRecent = (Date.now() - msgTime) < 3000;
                  const isNew = msg.isOptimistic || (isLast && isRecent);
                  const animClass = isNew ? 'animate-wp-pop' : '';

                  return (
                    <React.Fragment key={msgKey}>
                      {gunDegisti && (
                        <div className="text-center my-2">
                          <span className="wa-sys-chip uppercase tracking-wide">{gunEtiketi(msg.createdAt)}</span>
                        </div>
                      )}
                      <div className={`flex ${isMe ? 'justify-end' : 'justify-start'} ${mt} ${animClass}`}>
                        <div
                          className="relative max-w-[85%] sm:max-w-[65%] min-w-[92px] rounded-2xl shadow-sm"
                          style={{
                            backgroundColor: isMe ? '#005c4b' : '#202c33',
                            marginRight: isMe && !showTail ? 8 : 0,
                            marginLeft: !isMe && !showTail ? 8 : 0
                          }}
                        >
                          {showTail && isMe && (
                            <svg width="16" height="18" viewBox="0 0 16 18" className="absolute bottom-[-0.5px] -right-[7px] -z-10" style={{ transform: 'rotate(45deg)' }}>
                              <path d="M 0 2 C 8 11, 13 13, 16 13.5 C 11 16.5, 4 15.5, 0 13.5 Z" fill="#005c4b" />
                            </svg>
                          )}
                          {showTail && !isMe && (
                            <svg width="16" height="18" viewBox="0 0 16 18" className="absolute bottom-[-0.5px] -left-[9.5px] -z-10" style={{ transform: 'rotate(-45deg)' }}>
                              <path d="M 16 2 C 8 11, 3 13, 0 13.5 C 5 16.5, 12 15.5, 16 13.5 Z" fill="#202c33" />
                            </svg>
                          )}

                          <div className={`pl-[10px] pt-[6px] pb-[7px] relative ${msg.type === 'image' || msg.type === 'video' ? 'pr-[10px]' : 'pr-[56px]'}`}>
                            {msg.type === 'image' && msg.fileUrl && (
                              <div className="mb-1 relative rounded-lg overflow-hidden group">
                                <img src={msg.fileUrl} alt="attachment" className="max-h-[300px] w-auto object-cover rounded-lg" />
                                <a href={msg.fileUrl} target="_blank" rel="noreferrer" className="absolute bottom-2 right-2 p-2 bg-black/50 hover:bg-black/70 rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity">
                                  <Plus size={16} className="rotate-45" />
                                </a>
                              </div>
                            )}
                            {msg.type === 'video' && msg.fileUrl && (
                              <div className="mb-1 rounded-lg overflow-hidden">
                                <video src={msg.fileUrl} controls className="max-h-[300px] w-auto rounded-lg" />
                              </div>
                            )}
                            {msg.type === 'audio' && msg.fileUrl && (
                              <div className="mb-1 flex items-center min-w-[200px]">
                                <audio src={msg.fileUrl} controls className="h-10 w-full" />
                              </div>
                            )}
                            {msg.type === 'file' && msg.fileUrl && (
                              <a href={msg.fileUrl} target="_blank" rel="noreferrer" className="mb-1 flex items-center gap-3 p-3 bg-white/10 rounded-lg hover:bg-white/20 transition-colors">
                                <div className="w-10 h-10 bg-white/10 flex items-center justify-center rounded-md"><FileText size={18} /></div>
                                <span className="text-sm font-medium text-white truncate max-w-[150px]">{msg.fileUrl.split('/').pop()}</span>
                              </a>
                            )}
                            {msg.content && (
                              <div className="text-[14.2px] leading-[19px] text-[#e9edef] whitespace-pre-wrap break-words">
                                {msg.content}
                              </div>
                            )}
                            <div className="absolute bottom-1.5 right-2 flex items-center gap-1 text-[11px] text-white/60">
                              <span>{formatTime(msg.createdAt)}</span>
                              {isMe && (
                                <CheckCheck size={14} className={msg.deliveryState === 'read' ? 'text-[#53bdeb]' : 'text-white/50'} />
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </React.Fragment>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Yazma alanı */}
              <div className="wa-composer absolute bottom-0 left-0 right-0 px-3 pb-2.5 pt-7 flex flex-col gap-2 z-20">
                <div className="wa-blur-stack wa-blur-stack--alt" aria-hidden="true"><i /><i /><i /><i /><i /><i /><i /><i /><i /></div>
                {selectedFile && (
                  <div className="wa-file-card flex items-center justify-between p-2.5 pr-3">
                    <div className="flex items-center gap-3 overflow-hidden">
                      {selectedFile.type.startsWith('image/') ? (
                        <img src={URL.createObjectURL(selectedFile)} alt="önizleme" className="w-10 h-10 object-cover rounded-md" />
                      ) : (
                        <div className="w-10 h-10 bg-white/10 flex items-center justify-center rounded-md wa-text">
                          {selectedFile.type.startsWith('audio/') ? <Music size={18} /> : selectedFile.type.startsWith('video/') ? <Video size={18} /> : <FileText size={18} />}
                        </div>
                      )}
                      <div className="text-[13.5px] wa-text truncate pr-4">{selectedFile.name}</div>
                    </div>
                    <button type="button" onClick={() => setSelectedFile(null)} className="wa-icon-btn"><X size={16} /></button>
                  </div>
                )}

                <div className="flex items-end gap-2">
                  <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileSelect} />
                  <button type="button" title="Ekle" className="lg-glass lg-glass--round wa-glass-btn" onClick={() => fileInputRef.current?.click()}>
                    <Plus size={24} strokeWidth={1.8} />
                  </button>

                  <form onSubmit={handleSendMessage} className="flex-1 flex items-end gap-2 min-w-0">
                    {isRecording ? (
                      <div className="lg-glass lg-glass--pill lg-glass--danger flex-1 flex items-center h-[44px] px-4">
                        <span className="w-2.5 h-2.5 rounded-full bg-red-500 animate-pulse mr-3" />
                        <span className="text-red-300 text-[15px] font-medium flex-1">Ses kaydediliyor… {formatDuration(recordingTime)}</span>
                      </div>
                    ) : (
                      <label className="lg-glass lg-glass--pill flex-1 flex items-center h-[44px] pl-3 pr-2 gap-2 cursor-text min-w-0">
                        <button type="button" title="Emoji" className="wa-muted hover:text-white transition-colors shrink-0">
                          <Smile size={23} strokeWidth={1.6} />
                        </button>
                        <input
                          type="text"
                          value={newMessage}
                          onChange={handleTyping}
                          placeholder="Bir mesaj yazın"
                          className="wa-input flex-1 !bg-transparent !border-none !shadow-none !rounded-none !p-0 !m-0 !outline-none focus:!ring-0 text-[15px] min-w-0"
                        />
                        <button type="button" title="Fotoğraf" className="wa-muted hover:text-white transition-colors shrink-0 mr-1" onClick={() => fileInputRef.current?.click()}>
                          <ImageIcon size={21} strokeWidth={1.6} />
                        </button>
                      </label>
                    )}

                    {newMessage.trim() || selectedFile ? (
                      <button type="submit" title="Gönder" className="lg-glass lg-glass--round lg-glass--green wa-glass-btn">
                        <Send size={20} strokeWidth={1.9} className="ml-0.5" />
                      </button>
                    ) : (
                      <button
                        type="button"
                        title="Sesli mesaj (basılı tut)"
                        className={`lg-glass lg-glass--round wa-glass-btn ${isRecording ? 'lg-glass--danger text-red-300' : ''}`}
                        onMouseDown={startRecording}
                        onMouseUp={stopRecording}
                        onMouseLeave={stopRecording}
                        onTouchStart={startRecording}
                        onTouchEnd={stopRecording}
                      >
                        <Mic size={22} strokeWidth={1.8} />
                      </button>
                    )}
                  </form>
                </div>
              </div>
            </>
          ) : (
            <div className="wa-intro w-full h-full flex flex-col items-center justify-center relative">
              <div className="flex flex-col items-center mb-10 relative z-10 px-6">
                <div className="wa-intro-art flex items-center justify-center gap-5 mb-8">
                  <Laptop size={104} strokeWidth={0.9} />
                  <Smartphone size={68} strokeWidth={0.9} className="mt-8" />
                </div>
                <h2 className="wa-title text-[30px] font-light mb-3">Mesajlaşma Paneli</h2>
                <p className="text-[14px] wa-muted text-center max-w-md leading-relaxed">
                  Soldaki listeden bir kişi seçin veya arayın.<br />
                  Öğrenci, veli ve öğretmenlerle bilgisayarınızdan anlık olarak yazışın.
                </p>
              </div>
              <div className="absolute bottom-8 flex items-center justify-center gap-1.5 text-[12.5px] wa-muted w-full">
                <Lock size={12} />
                <span>Uçtan uca şifrelenmiştir</span>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
};

export default ChatView;
