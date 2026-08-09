import React, { useState, useEffect } from 'react';
import { RefreshCcw } from 'lucide-react';
import { firebaseService } from '../services/firebase';
import UserRow from '../components/UserRow';

const RegistrationApprovalView = () => {
  const [pendingUsers, setPendingUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchPending = async () => {
    setLoading(true);
    const users = await firebaseService.fetchAllUsers();
    const pending = users.filter(u => 
      ['pending', 'awaiting_approval'].includes(u.fields?.status?.stringValue?.toLowerCase()) && 
      u.fields?.role?.stringValue?.toLowerCase() !== 'patron'
    );
    setPendingUsers(pending);
    setLoading(false);
  };

  useEffect(() => {
    fetchPending();
    const interval = setInterval(fetchPending, 10000);
    return () => clearInterval(interval);
  }, []);

  const currentDate = new Date().toLocaleDateString('tr-TR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div className="w-full h-full flex-1 flex flex-col font-sans overflow-hidden pb-2 md:pb-6 p-4 md:p-12">
      
      {}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-10 w-full shrink-0 gap-6">
        <div className="flex items-center gap-5">
          <div className="flex flex-col">
            <span className="text-[13px] font-medium text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wider">{currentDate}</span>
            <h1 className="text-[36px] font-semibold text-slate-900 dark:text-white tracking-tight leading-none">Kayıt Onay Merkezi</h1>
            <p className="text-[14px] text-slate-500 mt-2">Sisteme kayıt olan yeni kullanıcıları buradan onaylayabilir veya silebilirsiniz.</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <button className="h-12 px-6 bg-white dark:bg-[#0f172a] border border-[#0f172a] text-slate-900 dark:text-white hover:bg-[#1e3a8a] flex items-center justify-center gap-2 shadow-sm rounded-[16px] text-[14px] font-bold transition-all" onClick={fetchPending} disabled={loading}>
            <RefreshCcw size={16} className={loading ? 'animate-spin' : ''} />
            <span className="hidden md:inline">{loading ? 'Yükleniyor...' : 'Yenile'}</span>
          </button>
        </div>
      </div>

      <div className="bg-white dark:bg-[#0f172a] rounded-[32px] border border-slate-200 dark:border-white/10 flex-1 flex flex-col overflow-hidden relative shadow-sm min-h-0">
        
        <div className="flex-1 overflow-x-auto overflow-y-auto custom-scrollbar flex flex-col">
          <div className="min-w-[800px] flex-1 flex flex-col relative pb-4">
            {/* Tablo Başlıkları */}
            <div className="flex items-center text-slate-500 bg-slate-50/50 dark:bg-[#1e293b]/50 border-b border-slate-200 dark:border-white/10 px-8 py-5 text-[11px] font-bold uppercase tracking-widest sticky top-0 z-10 shrink-0">
              <div style={{ width: '25%' }}>Ad Soyad</div>
              <div style={{ width: '15%' }}>Kullanıcı Tipi</div>
              <div style={{ width: '20%' }}>TC Kimlik Numarası</div>
              <div style={{ width: '20%' }}>İletişim (Email)</div>
              <div style={{ width: '15%' }}>Hesap Durumu</div>
              <div className="flex-1 text-right">Aksiyon</div>
            </div>

            {/* İçerik */}
            <div className="flex-1 px-4 bg-white dark:bg-[#0f172a] relative">
          {loading && pendingUsers.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-600 dark:text-slate-400 mt-20">
              <div className="w-8 h-8 rounded-full border-4 border-slate-200 dark:border-white/10 border-t-slate-900 animate-spin mb-4"></div>
              <p className="text-[13px] font-medium">Veriler getiriliyor...</p>
            </div>
          ) : pendingUsers.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 bg-slate-50/50 dark:bg-[#1e293b]/50 rounded-[24px] border border-slate-200 dark:border-white/10 m-4 p-12 mt-20">
              <h3 className="text-[18px] font-bold text-slate-700 dark:text-slate-300 mb-1">Onay Bekleyen Kullanıcı Yok</h3>
              <p className="text-center max-w-sm text-slate-500 text-[14px]">
                Şu anda sisteme kayıt olup onayınızı bekleyen herhangi bir hesap bulunmamaktadır.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2 mt-4">
              {pendingUsers.map(doc => (
                <div key={doc.name} className="hover:bg-slate-50/80 dark:bg-[#1e293b]/80 rounded-[20px] transition-colors px-4 py-1 border border-transparent hover:border-slate-200 dark:border-white/10 group">
                  <UserRow document={doc} showApprovalActions={true} onUpdate={fetchPending} />
                </div>
              ))}
            </div>
          )}
            </div>
          </div>
        </div>
      </div>

    </div>
  );
};

export default RegistrationApprovalView;
