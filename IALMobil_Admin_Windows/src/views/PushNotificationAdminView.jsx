import React, { useState, useEffect } from 'react';
import { Send, MessageCircle, AlertCircle, CheckCircle2 } from 'lucide-react';
import { db } from '../services/firebaseConfig';
import { collection, addDoc, serverTimestamp, getDocs, query, where } from 'firebase/firestore';

const PushNotificationAdminView = () => {
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');

  const [sendingState, setSendingState] = useState('idle');
  const [progressPercent, setProgressPercent] = useState(0);

  useEffect(() => {
    let interval;
    if (sendingState === 'fetching') {
      setProgressPercent(10);
      interval = setInterval(() => {
        setProgressPercent(prev => (prev < 40 ? prev + 2 : prev));
      }, 50);
    } else if (sendingState === 'sending') {
      interval = setInterval(() => {
        setProgressPercent(prev => (prev < 90 ? prev + 1 : prev));
      }, 40);
    } else if (sendingState === 'success') {
      setProgressPercent(100);
    } else {
      setProgressPercent(0);
    }
    return () => clearInterval(interval);
  }, [sendingState]);

  const handleSend = async (e) => {
    e.preventDefault();
    if (!title.trim() || !message.trim()) return;

    setSendingState('fetching');

    try {

      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('role', 'in', ['parent', 'veli']));
      const snapshot = await getDocs(q);

      let phoneNumbers = [];
      snapshot.forEach(doc => {
        const data = doc.data();
        const phone = data.phone || data.phoneNumber || data.phone_number;
        if (phone) {
          phoneNumbers.push(phone);
        }
      });

      phoneNumbers = [...new Set(phoneNumbers)];

      setSendingState('sending');

      await addDoc(collection(db, 'global_notifications'), {
        title,
        message,
        target: 'all_parents',
        timestamp: serverTimestamp(),
        sender: localStorage.getItem('adminName') || 'Sistem Yöneticisi',
        readBy: []
      });

      if (phoneNumbers.length > 0) {
        const { getAuth } = await import('firebase/auth');
        const { cryptoService } = await import('../services/cryptoService');
        const auth = getAuth();
        let authHeader = '';
        if (auth.currentUser) {
          const rawIdToken = await auth.currentUser.getIdToken();
          const idToken = await cryptoService.encryptToken(rawIdToken);
          authHeader = `Bearer ${idToken}`;
        }

        const formattedMessage = `📢 *${title}*\n\n${message}\n\n_Boğaziçi Yönetim Sistemi_`;

        const rawBody = {
          phones: phoneNumbers,
          message: formattedMessage
        };
        const encryptedPayload = await cryptoService.encryptPayload(rawBody);

        const response = await fetch('https://bgzklj.onrender.com/api/system/broadcast-whatsapp', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(authHeader ? { 'Authorization': authHeader } : {})
          },
          body: JSON.stringify({ payload: encryptedPayload })
        });

        if (!response.ok) {
          console.error("WhatsApp API Error:", await response.text());
        } else {
          const jsonRes = await response.json();
          const decRes = jsonRes.payload ? await cryptoService.decryptPayload(jsonRes.payload) : jsonRes;
          console.log("WhatsApp API Success", decRes);
        }
      }

      setSendingState('success');

      setTimeout(() => {
        setSendingState('idle');
        setTitle('');
        setMessage('');
      }, 3500);

    } catch (error) {
      console.error("Bildirim gönderme hatası:", error);
      setSendingState('error');
      setTimeout(() => setSendingState('idle'), 4000);
    }
  };

  return (
    <div className="w-full h-full flex-1 flex flex-col font-sans p-4 md:p-6 lg:p-8 overflow-x-hidden box-border">

      {/* BAŞLIK */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-6 md:mb-8 shrink-0 gap-4 w-full border-b border-slate-200 dark:border-white/10 pb-4 md:pb-6">
        <div className="flex flex-col min-w-0">
          <h1 className="text-[28px] md:text-[32px] font-bold text-slate-900 dark:text-white tracking-tight leading-none mb-2 md:mb-3 truncate">
            Bildirim Merkezi
          </h1>
          <p className="text-[13px] md:text-[14px] text-slate-500 dark:text-slate-400 font-medium truncate">
            Sistemdeki tüm velilere anlık SMS bildirimi gönderin.
          </p>
        </div>
      </div>

      <div className="w-full min-w-0 box-border flex-1 flex flex-col">
        <div className="bg-white dark:bg-[#0f172a] rounded-2xl md:rounded-3xl border border-slate-200/80 dark:border-white/10 shadow-xs flex flex-col lg:flex-row w-full min-w-0 box-border overflow-hidden relative">

          {/* Gönderim Durumu (Overlay - Tüm Kartı Kaplar) */}
          {sendingState !== 'idle' && (
            <div className="absolute inset-0 bg-white/95 dark:bg-[#0f172a]/95 backdrop-blur-md z-20 flex flex-col items-center justify-center transition-all duration-300">
              {sendingState === 'fetching' || sendingState === 'sending' ? (
                <div className="flex flex-col items-center gap-6 w-full max-w-sm px-8">
                  <div className="w-full bg-slate-100 dark:bg-white/10 h-2 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all duration-300 ease-out"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  <span className="text-[14px] font-bold text-slate-700 dark:text-slate-300">Gönderim işlemi sağlanıyor...</span>
                </div>
              ) : sendingState === 'success' ? (
                <div className="flex flex-col items-center gap-4 animate-in zoom-in duration-500">
                  <div className="w-16 h-16 rounded-full bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center text-emerald-600 dark:text-emerald-400 shadow-sm border border-emerald-100 dark:border-emerald-900/50">
                    <CheckCircle2 size={32} />
                  </div>
                  <span className="text-[16px] font-bold text-slate-900 dark:text-white">Mesajlar İletildi</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4 animate-in zoom-in duration-300">
                  <div className="w-16 h-16 rounded-full bg-rose-50 dark:bg-rose-950/40 flex items-center justify-center text-rose-600 dark:text-rose-400 shadow-sm border border-rose-100 dark:border-rose-900/50">
                    <AlertCircle size={32} />
                  </div>
                  <span className="text-[16px] font-bold text-slate-900 dark:text-white">İşlem Başarısız</span>
                  <span className="text-[13px] text-slate-500 font-medium">Sistem hatası. Lütfen tekrar deneyin.</span>
                </div>
              )}
            </div>
          )}

          {/* SOL PANEL (Bilgi - Birleşik Kartın Sol Tarafı) */}
          <div className="w-full lg:w-[35%] p-6 md:p-8 flex flex-col gap-6 border-b lg:border-b-0 lg:border-r border-slate-200/80 dark:border-white/10 box-border shrink-0">
            <div>
              <h2 className="text-[16px] font-bold text-slate-900 dark:text-white mb-2">SMS Toplu Gönderim</h2>
              <p className="text-[13.5px] text-slate-500 dark:text-slate-400 leading-relaxed font-medium">
                Buradan göndereceğiniz mesajlar, veritabanında aktif olarak bulunan tüm velilerin kayıtlı cep telefonu numaralarına SMS üzerinden iletilir.
              </p>
            </div>
            
            <div className="border-t border-slate-200/60 dark:border-white/5 px-6 md:px-8 py-5 md:py-6 box-border mt-auto -mx-6 md:-mx-8 -mb-6 md:-mb-8 relative">
              <div className="flex items-start gap-3.5 relative z-10">
                <CheckCircle2 size={22} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                <div className="flex flex-col gap-1.5 pt-0.5">
                  <span className="text-[13px] font-bold text-slate-800 dark:text-emerald-400 tracking-tight">Güvenli İletim Altyapısı</span>
                  <p className="text-[12px] text-slate-600 dark:text-slate-400/90 leading-relaxed font-medium">
                    Sistem çift kayıtları otomatik ayıklar. Bu işlem geri alınamaz; aktarım süresince sayfayı açık tutmanız tavsiye edilir.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* SAĞ PANEL (Form - Birleşik Kartın Sağ Tarafı) */}
          <div className="w-full lg:w-[65%] p-6 md:p-8 flex flex-col box-border">
            <form onSubmit={handleSend} className="flex flex-col gap-5 w-full h-full box-border">
              <div className="flex flex-col gap-2 w-full box-border">
                <label className="text-[12px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Bildirim Başlığı</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full box-border px-4 py-3.5 bg-white dark:bg-[#1e293b]/50 border border-slate-200 dark:border-white/10 rounded-xl focus:border-slate-400 dark:focus:border-slate-500 focus:ring-2 focus:ring-slate-100 dark:focus:ring-white/5 outline-none text-[14px] text-slate-900 dark:text-white transition-all placeholder:text-slate-400 dark:placeholder:text-slate-500 font-medium"
                  placeholder="Örn: Kar Tatili Uyarısı, Önemli Duyuru..."
                  required
                />
              </div>

              <div className="flex flex-col gap-2 w-full box-border flex-1">
                <label className="text-[12px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider">Bildirim İçeriği</label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="w-full box-border px-4 py-3.5 bg-white dark:bg-[#1e293b]/50 border border-slate-200 dark:border-white/10 rounded-xl focus:border-slate-400 dark:focus:border-slate-500 focus:ring-2 focus:ring-slate-100 dark:focus:ring-white/5 outline-none text-[14px] text-slate-900 dark:text-white transition-all placeholder:text-slate-400 dark:placeholder:text-slate-500 min-h-[160px] h-full resize-y font-medium"
                  placeholder="Göndermek istediğiniz mesajın detaylarını buraya yazın..."
                  required
                ></textarea>
                <span className="text-[11.5px] text-slate-500 dark:text-slate-400 mt-1.5 font-medium flex items-center gap-1.5">
                  <AlertCircle size={13} className="text-slate-400 shrink-0" />
                  Mesajınızın sonuna otomatik olarak "Boğaziçi Yönetim Sistemi" imzası eklenecektir.
                </span>
              </div>

              <div className="flex items-center justify-end mt-4 pt-5 border-t border-slate-100 dark:border-white/5 w-full box-border">
                <button
                  type="submit"
                  disabled={sendingState !== 'idle' || !title.trim() || !message.trim()}
                  className="flex items-center justify-center gap-2 px-7 py-3 bg-slate-900 dark:bg-white hover:bg-slate-800 dark:hover:bg-slate-200 disabled:bg-slate-200 dark:disabled:bg-[#1e293b] text-white dark:text-slate-900 disabled:text-slate-400 dark:disabled:text-slate-600 text-[13.5px] font-bold rounded-xl transition-all shadow-xs disabled:shadow-none"
                >
                  <Send size={16} />
                  Gönderimi Başlat
                </button>
              </div>
            </form>
          </div>

        </div>
      </div>
    </div>
  );
};

export default PushNotificationAdminView;
