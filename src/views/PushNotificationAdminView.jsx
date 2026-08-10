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
    <div className="w-full h-full flex-1 flex flex-col font-sans overflow-x-hidden overflow-y-auto custom-scrollbar pb-2 md:pb-6 lg:px-24">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end w-full shrink-0 gap-4 md:gap-6 mb-6 md:mb-12 border-b border-slate-200 dark:border-white/10 pb-4 md:pb-8">
        <div className="flex flex-col">
          <h1 className="text-[36px] font-medium text-slate-900 dark:text-white tracking-tight leading-none mb-3">Bildirim Merkezi</h1>
          <p className="text-[15px] text-slate-500">Sistemdeki tüm velilere anlık WhatsApp bildirimi gönderin.</p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-8 md:gap-16 pb-12 w-full max-w-6xl">
        
        { }
        <div className="lg:w-1/3 shrink-0 flex flex-col gap-6">
          <div>
            <h2 className="text-[16px] font-semibold text-slate-900 dark:text-white mb-2">WhatsApp Toplu Gönderim</h2>
            <p className="text-[13px] text-slate-500 leading-relaxed mb-6">
              Buradan göndereceğiniz mesajlar, veritabanında aktif olarak bulunan tüm velilerin kayıtlı cep telefonu numaralarına WhatsApp üzerinden iletilir.
            </p>
          </div>

          <div className="bg-emerald-50/50 dark:bg-emerald-500/10 border border-emerald-100 dark:border-emerald-500/20 rounded-xl p-5">
            <div className="flex items-center gap-3 mb-2">
              <MessageCircle size={16} className="text-emerald-600 dark:text-emerald-500" />
              <span className="text-[14px] font-medium text-emerald-900 dark:text-emerald-400">Güvenli Gönderim</span>
            </div>
            <p className="text-[12px] text-emerald-700/80 dark:text-emerald-500 leading-relaxed">
              İşlem geri alınamaz. Gönderim esnasında sayfayı kapatmamanız tavsiye edilir. Sistem, çift kayıtları otomatik olarak filtreler.
            </p>
          </div>
        </div>

        { }
        <div className="lg:w-2/3 relative flex flex-col">
          
          {sendingState !== 'idle' && (
            <div className="absolute -inset-6 bg-[#FAFAFA] dark:bg-[#0b1120]/95 backdrop-blur-md z-10 flex flex-col items-center justify-center rounded-2xl transition-all duration-300">
              {sendingState === 'fetching' || sendingState === 'sending' ? (
                <div className="flex flex-col items-center gap-6 w-full max-w-sm px-8">
                  <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-emerald-500 rounded-full transition-all duration-300 ease-out" 
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                  <span className="text-[15px] font-medium text-slate-700 dark:text-slate-300">Gönderim işlemi sağlanıyor...</span>
                </div>
              ) : sendingState === 'success' ? (
                <div className="flex flex-col items-center gap-4 animate-in zoom-in duration-500">
                  <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-500 shadow-sm">
                    <CheckCircle2 size={32} />
                  </div>
                  <span className="text-[18px] font-semibold text-slate-900 dark:text-white">Mesajlar İletildi</span>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-4 animate-in zoom-in duration-300">
                  <div className="w-16 h-16 rounded-full bg-rose-100 flex items-center justify-center text-rose-500 shadow-sm">
                    <AlertCircle size={32} />
                  </div>
                  <span className="text-[18px] font-semibold text-slate-900 dark:text-white">İşlem Başarısız</span>
                  <span className="text-[14px] text-slate-500">Sistem hatası. Lütfen tekrar deneyin.</span>
                </div>
              )}
            </div>
          )}

          <form onSubmit={handleSend} className="flex flex-col gap-6">
            <div className="flex flex-col gap-2">
              <label className="text-[13px] font-medium text-slate-700 dark:text-slate-300">Bildirim Başlığı</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full px-4 py-3 bg-white dark:bg-[#0f172a] border border-slate-300 dark:border-white/10 rounded-lg focus:border-slate-900 dark:focus:border-slate-400 focus:ring-1 focus:ring-slate-900 dark:focus:ring-slate-400 outline-none text-[15px] text-slate-900 dark:text-white transition-colors placeholder:text-slate-600 dark:placeholder:text-slate-500"
                placeholder="Örn: Kar Tatili Uyarısı, Önemli Duyuru..."
                required
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[13px] font-medium text-slate-700 dark:text-slate-300">Bildirim İçeriği</label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full px-4 py-3 bg-white dark:bg-[#0f172a] border border-slate-300 dark:border-white/10 rounded-lg focus:border-slate-900 dark:focus:border-slate-400 focus:ring-1 focus:ring-slate-900 dark:focus:ring-slate-400 outline-none text-[15px] text-slate-900 dark:text-white transition-colors placeholder:text-slate-600 dark:placeholder:text-slate-500 min-h-[160px] resize-y"
                placeholder="Göndermek istediğiniz mesajın detaylarını buraya yazın..."
                required
              ></textarea>
              <span className="text-[11px] text-slate-600 dark:text-slate-400 mt-1">
                Mesajınızın sonuna otomatik olarak "Boğaziçi Yönetim Sistemi" imzası eklenecektir.
              </span>
            </div>

            <div className="flex items-center justify-end mt-4">
              <button
                type="submit"
                disabled={sendingState !== 'idle' || !title.trim() || !message.trim()}
                className="flex items-center gap-2 px-8 py-3 bg-slate-900 dark:bg-white hover:bg-slate-800 dark:hover:bg-slate-200 disabled:bg-slate-300 dark:disabled:bg-slate-800 text-white dark:text-slate-900 disabled:text-slate-500 dark:disabled:text-slate-500 text-[14px] font-medium rounded-lg transition-colors"
              >
                <Send size={16} />
                Gönderimi Başlat
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default PushNotificationAdminView;
