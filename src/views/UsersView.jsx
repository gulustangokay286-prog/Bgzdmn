import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  RefreshCcw, 
  Download, 
  Search, 
  Filter, 
  Users, 
  UserCheck, 
  UserX, 
  CheckCircle2, 
  Upload, 
  X, 
  Check, 
  ChevronDown, 
  SlidersHorizontal 
} from 'lucide-react';
import { firebaseService } from '../services/firebase';
import { db, mapSdkToRest } from '../services/firebaseConfig';
import { collection, onSnapshot } from 'firebase/firestore';
import UserRow from '../components/UserRow';

const UsersView = () => {
  const [allUsers, setAllUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  const [searchText, setSearchText] = useState('');
  const [selectedRole, setSelectedRole] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');

  const [parsedUsers, setParsedUsers] = useState([]);
  const [showImportModal, setShowImportModal] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const fileInputRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const safetyTimer = setTimeout(() => {
      if (!cancelled) setLoading(false);
    }, 1200);

    const unsub = onSnapshot(collection(db, 'users'), (snapshot) => {
      try {
        const usersList = [];
        snapshot.forEach((docSnap) => {
          usersList.push(mapSdkToRest(docSnap));
        });

        if (!cancelled) {
          setAllUsers(usersList);
          setLoading(false);
        }
      } catch (err) {
        console.error('Kullanıcılar listesi dinleme hatası:', err);
        if (!cancelled) setLoading(false);
      }
    }, (err) => {
      console.error('Kullanıcılar snapshot hatası:', err);
      if (!cancelled) setLoading(false);
    });

    return () => {
      cancelled = true;
      clearTimeout(safetyTimer);
      try { unsub(); } catch(e) {}
    };
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    const users = await firebaseService.fetchAllUsers();
    setAllUsers(users);
    setLoading(false);
  };

  const visibleUsers = useMemo(() => {
    if (!Array.isArray(allUsers)) return [];
    return allUsers.filter(u => {
      if (!u) return false;
      const role = u.fields?.role?.stringValue?.toLowerCase() || '';
      return role !== 'patron';
    });
  }, [allUsers]);

  const filteredUsers = useMemo(() => {
    let result = [...visibleUsers];

    if (searchText && searchText.trim()) {
      const q = searchText.trim().toLowerCase();
      result = result.filter(u => {
        const fields = u.fields || {};
        const displayName = (fields.displayName?.stringValue || fields.full_name?.stringValue || fields.fullName?.stringValue || fields.name?.stringValue || '').toLowerCase();
        const tc = (fields.tc_kimlik?.stringValue || fields.tcKimlik?.stringValue || fields.tc?.stringValue || '').toLowerCase();
        const email = (fields.email?.stringValue || '').toLowerCase();
        const role = (fields.role?.stringValue || '').toLowerCase();
        const branch = (fields.branch?.stringValue || '').toLowerCase();
        const classId = (fields.class_id?.stringValue || fields.class_id?.integerValue || '').toLowerCase();

        return displayName.includes(q) || tc.includes(q) || email.includes(q) || role.includes(q) || branch.includes(q) || classId.includes(q);
      });
    }

    if (selectedRole !== 'all') {
      result = result.filter(u => {
        const r = u.fields?.role?.stringValue?.toLowerCase() || '';
        return r === selectedRole.toLowerCase() || (r === 'öğrenci' && selectedRole === 'student') || (r === 'veli' && selectedRole === 'parent') || (r === 'öğretmen' && selectedRole === 'teacher');
      });
    }

    if (selectedStatus !== 'all') {
      result = result.filter(u => {
        const s = u.fields?.status?.stringValue?.toLowerCase() || '';
        return selectedStatus === 'active' ? s === 'approved' : s === 'pending';
      });
    }

    return result;
  }, [visibleUsers, searchText, selectedRole, selectedStatus]);

  const totalUsers = visibleUsers.length;
  const pendingUsers = visibleUsers.filter(u => ['pending', 'awaiting_approval'].includes(u.fields?.status?.stringValue?.toLowerCase())).length;
  const studentCount = visibleUsers.filter(u => {
    const r = u.fields?.role?.stringValue?.toLowerCase() || '';
    return r === 'student' || r === 'öğrenci';
  }).length;

  const handleDownloadPDF = () => {
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Ad Soyad,Rol,TC Kimlik,Durum,Email,Sınıf/Branş\n";
    filteredUsers.forEach(u => {
      const n = u.fields?.full_name?.stringValue || u.fields?.fullName?.stringValue || 'İsimsiz';
      const r = u.fields?.role?.stringValue || '-';
      const tc = u.fields?.tc_kimlik?.stringValue || u.fields?.tcKimlik?.stringValue || '-';
      const s = u.fields?.status?.stringValue || '-';
      const email = u.fields?.email?.stringValue || '-';
      const branch = u.fields?.branch?.stringValue || u.fields?.class_id?.stringValue || '-';
      csvContent += `${n},${r},${tc},${s},${email},${branch}\n`;
    });
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "kullanicilar.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const currentDate = new Date().toLocaleDateString('tr-TR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <>
      <div className="absolute -top-[40px] -bottom-[40px] -left-[40px] -right-[40px] bg-[#FAFAFA] dark:bg-[#0b1120] z-40 overflow-y-auto overflow-x-hidden font-sans custom-scrollbar flex flex-col p-8 md:p-12">

        {/* Top Header */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-10 w-full shrink-0 gap-6">
          <div className="flex items-center gap-5">
            <div className="flex flex-col">
              <span className="text-[13px] font-semibold text-slate-600 dark:text-slate-400 mb-1.5 uppercase tracking-wider">{currentDate}</span>
              <h1 className="text-[34px] font-bold text-slate-900 dark:text-white tracking-tight leading-none">Kullanıcı Yönetimi</h1>
            </div>
          </div>

          <div className="flex items-center gap-1">
            <button
              className="h-9 px-3.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.06] flex items-center gap-2 rounded-xl text-[13px] font-semibold transition-all"
              onClick={fetchUsers}
              disabled={loading}
            >
              <RefreshCcw size={15} strokeWidth={2} className={loading ? 'animate-spin' : ''} />
              <span className="hidden md:inline">Yenile</span>
            </button>

            <div className="w-px h-5 bg-slate-200 dark:bg-white/10 mx-1" />

            <button
              className="h-9 px-3.5 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.06] flex items-center gap-2 rounded-xl text-[13px] font-semibold transition-all"
              onClick={handleDownloadPDF}
            >
              <Download size={15} strokeWidth={2} />
              <span className="hidden md:inline">Dışa Aktar</span>
            </button>
          </div>
        </div>

        {/* Filter and Badges */}
        <div className="flex flex-col gap-5 mb-8">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2.5 px-4 py-2 bg-white dark:bg-[#0f172a] rounded-full border border-slate-200 dark:border-white/10 shadow-xs">
              <Users size={14} className="text-slate-900 dark:text-white -ml-[3px]" />
              <span className="text-[13px] font-semibold text-slate-700 dark:text-slate-300">Toplam</span>
              <span className="text-[13px] font-bold text-slate-900 dark:text-white ml-1">{totalUsers}</span>
            </div>

            <div className="flex items-center gap-2.5 px-4 py-2 bg-white dark:bg-[#0f172a] rounded-full border border-slate-200 dark:border-white/10 shadow-xs">
              <UserCheck size={14} className="text-blue-600 dark:text-blue-400 -ml-[3px]" />
              <span className="text-[13px] font-semibold text-slate-700 dark:text-slate-300">Öğrenci</span>
              <span className="text-[13px] font-bold text-blue-600 dark:text-blue-400 ml-1">{studentCount}</span>
            </div>

            <div className="flex items-center gap-2.5 px-4 py-2 bg-white dark:bg-[#0f172a] rounded-full border border-slate-200 dark:border-white/10 shadow-xs">
              <UserX size={14} className="text-red-600 dark:text-red-400 -ml-[3px]" />
              <span className="text-[13px] font-semibold text-slate-700 dark:text-slate-300">Bekleyen</span>
              <span className="text-[13px] font-bold text-red-600 dark:text-red-400 ml-1">{pendingUsers}</span>
            </div>
          </div>

          {/* Search bar & dropdowns */}
          <div className="flex flex-col lg:flex-row items-center gap-3 w-full">
            <div className="relative flex-1 w-full flex items-center">
              <Search size={18} className="text-slate-400 dark:text-slate-500 absolute left-4 pointer-events-none z-10" />
              <input
                type="text"
                className="w-full py-3 pl-11 pr-10 bg-white dark:bg-[#0f172a] border-0 rounded-2xl text-[14px] font-medium text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none focus:outline-none focus:ring-0 transition-all shadow-xs"
                placeholder="İsim, TC Kimlik No, Sınıf (Örn: 12B, 11A) veya Branş ile arama yapın..."
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

            <div className="flex flex-col sm:flex-row w-full lg:w-auto gap-3 shrink-0">
              <div className="relative flex items-center min-w-[170px]">
                <Filter size={15} className="text-slate-400 dark:text-slate-500 absolute left-4 pointer-events-none z-10" />
                <select
                  style={{ appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none' }}
                  className="w-full py-3 pl-10 pr-9 bg-white dark:bg-[#0f172a] border-0 rounded-2xl text-[13.5px] font-semibold text-slate-700 dark:text-slate-300 cursor-pointer outline-none focus:outline-none focus:ring-0 transition-all shadow-xs appearance-none"
                  value={selectedRole}
                  onChange={e => setSelectedRole(e.target.value)}
                >
                  <option value="all" className="bg-white dark:bg-[#0f172a] text-slate-900 dark:text-white">Tüm Roller</option>
                  <option value="student" className="bg-white dark:bg-[#0f172a] text-slate-900 dark:text-white">Öğrenciler</option>
                  <option value="teacher" className="bg-white dark:bg-[#0f172a] text-slate-900 dark:text-white">Öğretmenler</option>
                  <option value="parent" className="bg-white dark:bg-[#0f172a] text-slate-900 dark:text-white">Veliler</option>
                  <option value="personnel" className="bg-white dark:bg-[#0f172a] text-slate-900 dark:text-white">Personel</option>
                  <option value="admin" className="bg-white dark:bg-[#0f172a] text-slate-900 dark:text-white">Yöneticiler</option>
                </select>
                <ChevronDown size={14} className="text-slate-400 dark:text-slate-500 absolute right-3.5 pointer-events-none z-10" />
              </div>

              <div className="relative flex items-center min-w-[170px]">
                <SlidersHorizontal size={15} className="text-slate-400 dark:text-slate-500 absolute left-4 pointer-events-none z-10" />
                <select
                  style={{ appearance: 'none', WebkitAppearance: 'none', MozAppearance: 'none' }}
                  className="w-full py-3 pl-10 pr-9 bg-white dark:bg-[#0f172a] border-0 rounded-2xl text-[13.5px] font-semibold text-slate-700 dark:text-slate-300 cursor-pointer outline-none focus:outline-none focus:ring-0 transition-all shadow-xs appearance-none"
                  value={selectedStatus}
                  onChange={e => setSelectedStatus(e.target.value)}
                >
                  <option value="all" className="bg-white dark:bg-[#0f172a] text-slate-900 dark:text-white">Tüm Durumlar</option>
                  <option value="active" className="bg-white dark:bg-[#0f172a] text-slate-900 dark:text-white">Onaylı (Aktif)</option>
                  <option value="pending" className="bg-white dark:bg-[#0f172a] text-slate-900 dark:text-white">Onay Bekleyen</option>
                </select>
                <ChevronDown size={14} className="text-slate-400 dark:text-slate-500 absolute right-3.5 pointer-events-none z-10" />
              </div>
            </div>
          </div>
        </div>

        {/* Users Table */}
        <div className="bg-white dark:bg-[#0f172a] rounded-[32px] border border-slate-200 dark:border-white/10 flex-1 flex flex-col overflow-hidden relative shadow-sm min-h-0">
          <div className="flex-1 overflow-x-auto overflow-y-auto custom-scrollbar flex flex-col">
            <div className="min-w-[850px] flex-1 flex flex-col relative pb-4">
              <div className="flex items-center text-slate-500 dark:text-slate-400 bg-slate-50/50 dark:bg-[#1e293b]/50 border-b border-slate-200 dark:border-white/10 px-8 py-5 text-[11px] font-bold uppercase tracking-widest sticky top-0 z-10 shrink-0">
                <div style={{ width: '25%' }}>Ad Soyad</div>
                <div style={{ width: '18%' }} className="relative -left-[8px]">Rol & Sınıf/Branş</div>
                <div style={{ width: '18%' }} className="relative -left-[14px]">TC Kimlik No</div>
                <div style={{ width: '19%' }}>İletişim (Email)</div>
                <div style={{ width: '10%' }}>Durum</div>
                <div style={{ width: '10%' }} className="text-right">Aksiyon</div>
              </div>

              <div className="flex-1 px-4 bg-white dark:bg-[#0f172a] relative pt-2">
                {loading && filteredUsers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-slate-600 dark:text-slate-400 py-16">
                    <div className="w-8 h-8 rounded-full border-4 border-slate-200 dark:border-white/10 border-t-slate-900 animate-spin mb-4"></div>
                    <p className="text-[13px] font-medium">Kullanıcı veritabanı senkronize ediliyor...</p>
                  </div>
                ) : filteredUsers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-slate-500 bg-slate-50/50 dark:bg-[#1e293b]/50 rounded-[24px] border border-slate-200 dark:border-white/10 m-4 p-12">
                    <div className="w-16 h-16 bg-white dark:bg-[#0f172a] rounded-[16px] border border-slate-200 dark:border-white/10 flex items-center justify-center mb-4 shadow-sm">
                      <Search size={24} className="text-slate-600 dark:text-slate-400" />
                    </div>
                    <h3 className="text-[18px] font-bold text-slate-700 dark:text-slate-300 mb-1">Kullanıcı Bulunamadı</h3>
                    <p className="text-center max-w-sm text-slate-500 text-[14px]">
                      Arama kriterlerinize uygun kayıtlı kullanıcı bulunmamaktadır. Filtreleri temizlemeyi deneyin.
                    </p>
                  </div>
                ) : (
                  filteredUsers.map((u, i) => (
                    <div key={u.name || i} className="px-4">
                      <UserRow
                        document={u}
                        showApprovalActions={u.fields?.status?.stringValue === 'pending'}
                        onUpdate={fetchUsers}
                      />
                      {i < filteredUsers.length - 1 && <div className="h-px bg-slate-50/50 dark:bg-[#1e293b]/50 mx-4" />}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="bg-slate-50 dark:bg-[#1e293b] border-t border-slate-200 dark:border-white/10 p-4 text-center text-[12px] font-bold text-slate-500 shrink-0">
            Gösterilen Kayıt: <strong className="text-slate-900 dark:text-white">{filteredUsers.length}</strong> / Toplam: {totalUsers}
          </div>
        </div>

      </div>
    </>
  );
};

export default UsersView;
