import React, { useState, useEffect, useMemo } from 'react';
import { RefreshCcw, Inbox, Users, UserCheck, UserX, GraduationCap, Search, X } from 'lucide-react';
import { firebaseService } from '../services/firebase';
import UserRow from '../components/UserRow';

const RegistrationApprovalView = () => {
  const [pendingUsers, setPendingUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');

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

  const totalPending = pendingUsers.length;
  const studentCount = pendingUsers.filter(u => {
    const r = u.fields?.role?.stringValue?.toLowerCase() || '';
    return r === 'student' || r === 'öğrenci';
  }).length;
  const parentCount = pendingUsers.filter(u => {
    const r = u.fields?.role?.stringValue?.toLowerCase() || '';
    return r === 'parent' || r === 'veli';
  }).length;
  const teacherCount = pendingUsers.filter(u => {
    const r = u.fields?.role?.stringValue?.toLowerCase() || '';
    return r === 'teacher' || r === 'öğretmen';
  }).length;

  const filteredUsers = useMemo(() => {
    if (!searchText.trim()) return pendingUsers;
    const q = searchText.trim().toLowerCase();
    return pendingUsers.filter(doc => {
      const f = doc.fields || {};
      const name = (f.displayName?.stringValue || f.full_name?.stringValue || f.fullName?.stringValue || '').toLowerCase();
      const tc = (f.tc_kimlik?.stringValue || f.tcKimlik?.stringValue || '').toLowerCase();
      const email = (f.email?.stringValue || '').toLowerCase();
      const role = (f.role?.stringValue || '').toLowerCase();
      return name.includes(q) || tc.includes(q) || email.includes(q) || role.includes(q);
    });
  }, [pendingUsers, searchText]);

  const currentDate = new Date().toLocaleDateString('tr-TR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const isEmpty = !loading && filteredUsers.length === 0;
  const isFirstLoad = loading && pendingUsers.length === 0;

  return (
    <>
      <div className="absolute -top-[40px] -bottom-[40px] -left-[40px] -right-[40px] bg-[#FAFAFA] dark:bg-[#0b1120] z-40 overflow-y-auto overflow-x-hidden font-sans custom-scrollbar flex flex-col p-8 md:p-12">

        { }
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-10 w-full shrink-0 gap-6">
          <div className="flex items-center gap-5">
            <div className="flex flex-col">
              <span className="text-[13px] font-semibold text-slate-600 dark:text-slate-400 mb-1.5 uppercase tracking-wider">{currentDate}</span>
              <h1 className="text-[34px] font-bold text-slate-900 dark:text-white tracking-tight leading-none">Kayıt Onay Merkezi</h1>
            </div>
          </div>
        </div>

        { }
        <div className="flex flex-col gap-5 mb-8">
          { }
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2.5 px-4 py-2 bg-white dark:bg-[#0f172a] rounded-full border border-slate-200 dark:border-white/10 shadow-xs">
              <Users size={14} className="text-slate-900 dark:text-white -ml-[3px]" />
              <span className="text-[13px] font-semibold text-slate-700 dark:text-slate-300">Toplam</span>
              <span className="text-[13px] font-bold text-slate-900 dark:text-white ml-1">{totalPending}</span>
            </div>

            <div className="flex items-center gap-2.5 px-4 py-2 bg-white dark:bg-[#0f172a] rounded-full border border-slate-200 dark:border-white/10 shadow-xs">
              <GraduationCap size={14} className="text-blue-600 dark:text-blue-400 -ml-[3px]" />
              <span className="text-[13px] font-semibold text-slate-700 dark:text-slate-300">Öğrenci</span>
              <span className="text-[13px] font-bold text-blue-600 dark:text-blue-400 ml-1">{studentCount}</span>
            </div>

            <div className="flex items-center gap-2.5 px-4 py-2 bg-white dark:bg-[#0f172a] rounded-full border border-slate-200 dark:border-white/10 shadow-xs">
              <UserCheck size={14} className="text-emerald-600 dark:text-emerald-400 -ml-[3px]" />
              <span className="text-[13px] font-semibold text-slate-700 dark:text-slate-300">Veli</span>
              <span className="text-[13px] font-bold text-emerald-600 dark:text-emerald-400 ml-1">{parentCount}</span>
            </div>

            <div className="flex items-center gap-2.5 px-4 py-2 bg-white dark:bg-[#0f172a] rounded-full border border-slate-200 dark:border-white/10 shadow-xs">
              <UserX size={14} className="text-amber-600 dark:text-amber-400 -ml-[3px]" />
              <span className="text-[13px] font-semibold text-slate-700 dark:text-slate-300">Öğretmen</span>
              <span className="text-[13px] font-bold text-amber-600 dark:text-amber-400 ml-1">{teacherCount}</span>
            </div>

            <button
              className="ml-auto h-9 px-3.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.06] flex items-center gap-2 rounded-xl text-[13px] font-semibold transition-all"
              onClick={fetchPending}
              disabled={loading}
            >
              <RefreshCcw size={15} strokeWidth={2} className={loading ? 'animate-spin' : ''} />
              <span className="hidden md:inline">{loading ? 'Yükleniyor...' : 'Yenile'}</span>
            </button>
          </div>

          { }
          <div className="flex flex-col lg:flex-row items-center gap-3 w-full">
            <div className="relative flex-1 w-full flex items-center">
              <Search size={18} className="text-slate-400 dark:text-slate-500 absolute left-4 pointer-events-none z-10" />
              <input
                type="text"
                className="w-full py-3 pl-11 pr-10 bg-white dark:bg-[#0f172a] border-0 rounded-2xl text-[14px] font-medium text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none focus:outline-none focus:ring-0 transition-all shadow-xs"
                placeholder="İsim, TC Kimlik No veya Email ile arama yapın..."
                value={searchText}
                onChange={e => setSearchText(e.target.value)}
              />
              {searchText && (
                <button
                  onClick={() => setSearchText('')}
                  className="absolute right-3.5 p-1 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors z-10"
                >
                  <X size={16} />
                </button>
              )}
            </div>
          </div>
        </div>

        { }
        {isFirstLoad ? (
          <div className="bg-white dark:bg-[#0f172a] rounded-[32px] border border-slate-200 dark:border-white/10 flex-1 flex items-center justify-center shadow-sm">
            <div className="flex flex-col items-center text-slate-500 dark:text-slate-400">
              <div className="w-8 h-8 rounded-full border-[3px] border-slate-200 dark:border-white/10 border-t-slate-500 dark:border-t-slate-400 animate-spin mb-4"></div>
              <p className="text-[13px] font-medium">Veriler getiriliyor...</p>
            </div>
          </div>
        ) : isEmpty ? (
          <div className="bg-white dark:bg-[#0f172a] rounded-[32px] border border-slate-200 dark:border-white/10 flex-1 flex items-center justify-center shadow-sm">
            <div className="flex flex-col items-center">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-white/[0.06] flex items-center justify-center mb-4">
                <Inbox size={22} className="text-slate-400 dark:text-slate-500" />
              </div>
              <h3 className="text-[17px] font-bold text-slate-700 dark:text-slate-200 mb-1.5">Onay Bekleyen Kullanıcı Yok</h3>
              <p className="text-center max-w-sm text-slate-400 dark:text-slate-500 text-[13.5px] leading-relaxed">
                Şu anda sisteme kayıt olup onayınızı bekleyen herhangi bir hesap bulunmamaktadır.
              </p>
            </div>
          </div>
        ) : (
          <div className="bg-white dark:bg-[#0f172a] rounded-[32px] border border-slate-200 dark:border-white/10 flex-1 flex flex-col overflow-hidden relative shadow-sm min-h-0">
            <div className="flex-1 overflow-x-auto overflow-y-auto custom-scrollbar flex flex-col">
              <div className="min-w-[800px] flex-1 flex flex-col relative pb-4">
                { }
                <div className="flex items-center text-slate-400 dark:text-slate-500 bg-transparent px-8 py-5 text-[11px] font-bold uppercase tracking-widest sticky top-0 z-10 shrink-0 border-b border-slate-100 dark:border-white/[0.06]">
                  <div style={{ width: '25%' }}>Ad Soyad</div>
                  <div style={{ width: '15%' }}>Kullanıcı Tipi</div>
                  <div style={{ width: '20%' }}>TC Kimlik Numarası</div>
                  <div style={{ width: '20%' }}>İletişim (Email)</div>
                  <div style={{ width: '15%' }}>Hesap Durumu</div>
                  <div className="flex-1 text-right">Aksiyon</div>
                </div>

                <div className="flex-1 px-4 relative">
                  <div className="flex flex-col gap-2 mt-4">
                    {filteredUsers.map(doc => (
                      <div key={doc.name} className="hover:bg-slate-50/80 dark:hover:bg-white/[0.03] rounded-[20px] transition-colors px-4 py-1 border border-transparent hover:border-slate-200/60 dark:hover:border-white/[0.06] group">
                        <UserRow document={doc} showApprovalActions={true} onUpdate={fetchPending} />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
};

export default RegistrationApprovalView;
