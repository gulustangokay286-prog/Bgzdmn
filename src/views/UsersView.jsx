import React, { useState, useEffect, useMemo, useRef } from 'react';
import { RefreshCcw, Download, Search, Filter, Users, UserCheck, UserX, CheckCircle2, Upload, X, Check } from 'lucide-react';
import { firebaseService } from '../services/firebase';
import { firebaseConfig } from '../services/firebaseConfig';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../services/firebaseConfig';
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

  const fetchUsers = async () => {
    setLoading(true);
    const users = await firebaseService.fetchAllUsers();
    setAllUsers(users);
    setLoading(false);
  };

  useEffect(() => {
    fetchUsers();
    const interval = setInterval(fetchUsers, 15000);
    return () => clearInterval(interval);
  }, []);

  const filteredUsers = useMemo(() => {
    let result = allUsers.filter(u => u.fields?.role?.stringValue?.toLowerCase() !== 'patron');
    
    if (searchText) {
      const lowerQuery = searchText.toLowerCase();
      result = result.filter(u => {
        const n = u.fields?.displayName?.stringValue?.toLowerCase() || u.fields?.full_name?.stringValue?.toLowerCase() || u.fields?.fullName?.stringValue?.toLowerCase() || '';
        const tc = u.fields?.tc_kimlik?.stringValue || u.fields?.tcKimlik?.stringValue || '';
        const email = u.fields?.email?.stringValue?.toLowerCase() || '';
        return n.includes(lowerQuery) || tc.includes(searchText) || email.includes(lowerQuery);
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
        const s = u.fields?.status?.stringValue || '';
        return selectedStatus === 'active' ? s === 'approved' : s === 'pending';
      });
    }

    return result;
  }, [allUsers, searchText, selectedRole, selectedStatus]);

  const handleDownloadPDF = () => {
    let csvContent = "data:text/csv;charset=utf-8,";
    csvContent += "Ad Soyad,Rol,TC Kimlik,Durum,Email\n";
    filteredUsers.forEach(u => {
      const n = u.fields?.full_name?.stringValue || u.fields?.fullName?.stringValue || 'İsimsiz';
      const r = u.fields?.role?.stringValue || '-';
      const tc = u.fields?.tc_kimlik?.stringValue || u.fields?.tcKimlik?.stringValue || '-';
      const s = u.fields?.status?.stringValue || '-';
      const email = u.fields?.email?.stringValue || '-';
      csvContent += `${n},${r},${tc},${s},${email}\n`;
    });
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "kullanicilar.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target.result;
      const rows = text.split('\n').map(row => row.trim()).filter(row => row.length > 0);
      
      const parsed = [];
      const startIndex = rows[0].toLowerCase().includes('ad') ? 1 : 0;
      
      for (let i = startIndex; i < rows.length; i++) {
        const cols = rows[i].split(',').map(c => c.trim());
        if (cols.length >= 4) {
          const tc_kimlik = cols[2];
          const password = tc_kimlik && tc_kimlik.length >= 6 ? tc_kimlik : '12345678';
          
          // Role normalization
          let rawRole = cols[1].toLowerCase();
          if (rawRole.includes('öğrenci') || rawRole === 'ogrenci') rawRole = 'student';
          if (rawRole.includes('öğretmen') || rawRole === 'ogretmen') rawRole = 'teacher';
          if (rawRole.includes('veli')) rawRole = 'parent';
          if (rawRole.includes('personel')) rawRole = 'personnel';

          parsed.push({
            displayName: cols[0],
            role: rawRole,
            tc_kimlik: tc_kimlik,
            email: cols[3],
            branch: cols[4] || '',
            password: password
          });
        }
      }
      setParsedUsers(parsed);
      setShowImportModal(true);
      if (fileInputRef.current) fileInputRef.current.value = '';
    };
    reader.readAsText(file);
  };

  const executeImport = async () => {
    setImportLoading(true);
    let successCount = 0;
    
    const tempApp = initializeApp(firebaseConfig, "TempApp_" + Date.now());
    const tempAuth = getAuth(tempApp);

    try {
      for (let i = 0; i < parsedUsers.length; i++) {
        const u = parsedUsers[i];
        setImportProgress({ current: i + 1, total: parsedUsers.length });
        
        try {
          const userCred = await createUserWithEmailAndPassword(tempAuth, u.email, u.password);
          
          const dbData = {
            uid: userCred.user.uid,
            displayName: u.displayName,
            email: u.email,
            tc_kimlik: u.tc_kimlik,
            role: u.role,
            status: 'approved',
            createdAt: new Date().toISOString()
          };
          if (u.branch) dbData.branch = u.branch;
          
          await setDoc(doc(db, 'users', userCred.user.uid), dbData);
          successCount++;
        } catch (err) {
          console.error("Kullanıcı eklenemedi:", u.email, err);
        }
      }
    } finally {
      await deleteApp(tempApp);
      setImportLoading(false);
      setShowImportModal(false);
      setParsedUsers([]);
      fetchUsers();
    }
  };

  const totalUsers = allUsers.length;
  const pendingUsers = allUsers.filter(u => u.fields?.status?.stringValue === 'pending').length;
  const studentCount = allUsers.filter(u => {
    const r = u.fields?.role?.stringValue?.toLowerCase() || '';
    return r === 'student' || r === 'öğrenci';
  }).length;

  const currentDate = new Date().toLocaleDateString('tr-TR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <>
      <div className="absolute -top-[40px] -bottom-[40px] -left-[40px] -right-[40px] bg-[#FAFAFA] dark:bg-[#0b1120] z-40 overflow-y-auto overflow-x-hidden font-sans custom-scrollbar flex flex-col p-8 md:p-12">
        
        {/* HEADER SECTION */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-10 w-full shrink-0 gap-6">
        <div className="flex items-center gap-5">
          <div className="flex flex-col">
            <span className="text-[13px] font-semibold text-slate-600 dark:text-slate-400 mb-1.5 uppercase tracking-wider">{currentDate}</span>
            <h1 className="text-[34px] font-bold text-slate-900 dark:text-white tracking-tight leading-none">Kullanıcı Yönetimi</h1>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-2 md:gap-3">
          <input 
            type="file" 
            ref={fileInputRef} 
            className="hidden" 
            accept=".csv,.txt"
            onChange={handleFileUpload} 
          />
          <button 
            className="h-10 px-4 bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-white/10/80 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:bg-[#1e293b] hover:text-slate-900 dark:text-white hover:border-slate-300 flex items-center justify-center gap-2 rounded-xl text-[13px] font-bold transition-all shadow-sm" 
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload size={16} />
            <span className="hidden md:inline">İçe Aktar</span>
          </button>

          <button 
            className="h-10 px-4 bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-white/10/80 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:bg-[#1e293b] hover:text-slate-900 dark:text-white hover:border-slate-300 flex items-center justify-center gap-2 rounded-xl text-[13px] font-bold transition-all shadow-sm" 
            onClick={fetchUsers} 
            disabled={loading}
          >
            <RefreshCcw size={16} className={loading ? 'animate-spin' : ''} />
            <span className="hidden md:inline">Yenile</span>
          </button>
          <button 
            className="h-10 px-5 bg-white dark:bg-[#0f172a] border border-[#0f172a] text-slate-900 dark:text-white hover:bg-[#1e3a8a] hover:border-[#1e3a8a] flex items-center justify-center gap-2 rounded-xl text-[13px] font-bold transition-all shadow-md" 
            onClick={handleDownloadPDF}
          >
            <Download size={16} />
            <span className="hidden md:inline">Dışa Aktar</span>
          </button>
        </div>
      </div>

      {}
      <div className="bg-white dark:bg-[#0f172a] rounded-[24px] border border-slate-200 dark:border-white/10 p-5 lg:p-6 mb-8 shadow-sm flex flex-col gap-6">
        
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2.5 px-4 py-2 bg-white dark:bg-[#0f172a] rounded-full border border-slate-200 dark:border-white/10 shadow-sm">
            <div className="w-6 h-6 rounded-full bg-white dark:bg-[#0f172a] flex items-center justify-center">
              <Users size={14} className="text-slate-900 dark:text-white"/>
            </div>
            <span className="text-[13px] font-semibold text-slate-700 dark:text-slate-300">Toplam</span>
            <span className="text-[13px] font-bold text-[#0f172a] ml-1">{totalUsers}</span>
          </div>
          
          <div className="flex items-center gap-2.5 px-4 py-2 bg-white dark:bg-[#0f172a] rounded-full border border-slate-200 dark:border-white/10 shadow-sm">
            <div className="w-6 h-6 rounded-full bg-[#1e3a8a] flex items-center justify-center">
              <UserCheck size={14} className="text-slate-900 dark:text-white"/>
            </div>
            <span className="text-[13px] font-semibold text-slate-700 dark:text-slate-300">Öğrenci</span>
            <span className="text-[13px] font-bold text-[#1e3a8a] ml-1">{studentCount}</span>
          </div>

          <div className="flex items-center gap-2.5 px-4 py-2 bg-white dark:bg-[#0f172a] rounded-full border border-slate-200 dark:border-white/10 shadow-sm">
            <div className="w-6 h-6 rounded-full bg-[#991b1b] flex items-center justify-center">
              <UserX size={14} className="text-slate-900 dark:text-white"/>
            </div>
            <span className="text-[13px] font-semibold text-slate-700 dark:text-slate-300">Bekleyen</span>
            <span className="text-[13px] font-bold text-[#991b1b] ml-1">{pendingUsers}</span>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row items-center bg-slate-50/80 dark:bg-[#1e293b]/80 border border-slate-200 dark:border-white/10 rounded-[20px] p-2 gap-2 w-full">
          
          <div className="relative flex-1 w-full flex items-center bg-white dark:bg-[#0f172a] rounded-[14px] border border-slate-200 dark:border-white/10/60 shadow-sm px-4 focus-within:border-slate-400 focus-within:ring-2 focus-within:ring-slate-100 transition-all">
            <Search size={18} className="text-slate-600 dark:text-slate-400 shrink-0" />
            <input 
              type="text" 
              className="w-full py-3.5 pl-3 pr-4 bg-transparent border-0 border-none outline-none focus:ring-0 shadow-none text-[14px] font-medium text-slate-900 dark:text-white placeholder:text-slate-600 dark:text-slate-400" 
              placeholder="İsim, TC Kimlik No veya Email ile arama yapın..." 
              value={searchText}
              onChange={e => setSearchText(e.target.value)}
            />
          </div>

          <div className="flex flex-col sm:flex-row w-full lg:w-auto gap-2">
            <div className="relative w-full sm:w-48 flex items-center bg-white dark:bg-[#0f172a] rounded-[14px] border border-slate-200 dark:border-white/10/60 shadow-sm px-4 hover:border-slate-300 transition-colors">
              <Filter size={16} className="text-slate-600 dark:text-slate-400 shrink-0" />
              <select 
                className="w-full py-3.5 pl-2 pr-4 bg-transparent border-0 border-none outline-none focus:ring-0 shadow-none text-[13.5px] font-semibold text-slate-700 dark:text-slate-300 appearance-none cursor-pointer"
                value={selectedRole}
                onChange={e => setSelectedRole(e.target.value)}
              >
                <option value="all">Tüm Roller</option>
                <option value="student">Öğrenciler</option>
                <option value="teacher">Öğretmenler</option>
                <option value="parent">Veliler</option>
                <option value="personnel">Personeller</option>
                <option value="admin">Yöneticiler</option>
              </select>
            </div>

            <div className="relative w-full sm:w-48 flex items-center bg-white dark:bg-[#0f172a] rounded-[14px] border border-slate-200 dark:border-white/10/60 shadow-sm px-4 hover:border-slate-300 transition-colors">
              <CheckCircle2 size={16} className="text-slate-600 dark:text-slate-400 shrink-0" />
              <select 
                className="w-full py-3.5 pl-2 pr-4 bg-transparent border-0 border-none outline-none focus:ring-0 shadow-none text-[13.5px] font-semibold text-slate-700 dark:text-slate-300 appearance-none cursor-pointer"
                value={selectedStatus}
                onChange={e => setSelectedStatus(e.target.value)}
              >
                <option value="all">Tüm Durumlar</option>
                <option value="active">Onaylı (Aktif)</option>
                <option value="pending">Onay Bekleyen</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-[#0f172a] rounded-[32px] border border-slate-200 dark:border-white/10 flex-1 flex flex-col overflow-hidden relative shadow-sm min-h-0">
        
        <div className="flex-1 overflow-x-auto overflow-y-auto custom-scrollbar flex flex-col">
          <div className="min-w-[800px] flex-1 flex flex-col relative pb-4">
            <div className="flex items-center text-slate-500 bg-slate-50/50 dark:bg-[#1e293b]/50 border-b border-slate-200 dark:border-white/10 px-8 py-5 text-[11px] font-bold uppercase tracking-widest sticky top-0 z-10 shrink-0">
              <div style={{ width: '25%' }}>Ad Soyad</div>
              <div style={{ width: '15%' }}>Kullanıcı Tipi</div>
              <div style={{ width: '20%' }}>TC Kimlik Numarası</div>
              <div style={{ width: '20%' }}>İletişim (Email)</div>
              <div style={{ width: '15%' }}>Hesap Durumu</div>
              <div className="flex-1 text-right">Aksiyon</div>
            </div>

            <div className="flex-1 px-4 bg-white dark:bg-[#0f172a] relative pt-2">
          {loading && filteredUsers.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-600 dark:text-slate-400">
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
              <div key={u.name} className="px-4">
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
          Gösterilen Kayıt: <strong className="text-slate-900 dark:text-white">{filteredUsers.length}</strong> / Toplam: {allUsers.length}
        </div>
      </div>

    </div>
    
      {/* Import Preview Modal */}
      {showImportModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-[#0f172a] rounded-[24px] shadow-2xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            <div className="px-6 py-5 border-b border-slate-200 dark:border-white/10 flex items-center justify-between bg-slate-50/50 dark:bg-[#1e293b]/50">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600">
                  <Upload size={20} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-lg">Kullanıcıları İçe Aktar</h3>
                  <p className="text-sm text-slate-500 font-medium">{parsedUsers.length} kullanıcı aktarılacak</p>
                </div>
              </div>
              {!importLoading && (
                <button onClick={() => { setShowImportModal(false); setParsedUsers([]); }} className="p-2 text-slate-600 dark:text-slate-400 hover:text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:bg-[#1e293b] rounded-full transition-colors">
                  <X size={20} />
                </button>
              )}
            </div>

            <div className="flex-1 overflow-auto p-6 bg-slate-50 dark:bg-[#1e293b]/30">
              <div className="bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-white/10 rounded-2xl overflow-hidden shadow-sm">
                <table className="w-full text-left text-sm">
                  <thead className="bg-slate-50 dark:bg-[#1e293b] text-slate-500 text-xs uppercase font-bold tracking-wider">
                    <tr>
                      <th className="px-4 py-3">Ad Soyad</th>
                      <th className="px-4 py-3">Rol</th>
                      <th className="px-4 py-3">TC Kimlik</th>
                      <th className="px-4 py-3">Email</th>
                      <th className="px-4 py-3">Şube</th>
                      <th className="px-4 py-3">Şifre</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {parsedUsers.map((u, i) => (
                      <tr key={i} className="hover:bg-slate-50/50 dark:bg-[#1e293b]/50 transition-colors">
                        <td className="px-4 py-3 font-semibold text-slate-900 dark:text-white">{u.displayName}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded-md text-xs font-bold ${
                            u.role === 'student' ? 'bg-indigo-50 text-indigo-700' :
                            u.role === 'teacher' ? 'bg-amber-50 text-amber-700' :
                            'bg-slate-50 dark:bg-[#1e293b] text-slate-700 dark:text-slate-300'
                          }`}>
                            {u.role}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400 font-mono text-xs">{u.tc_kimlik}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{u.email}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{u.branch || '-'}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-400 font-mono text-xs">{'***' + (u.password?.slice(-2) || '')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="p-5 border-t border-slate-200 dark:border-white/10 bg-white dark:bg-[#0f172a] flex items-center justify-between">
              <div className="text-sm font-medium text-slate-500 flex items-center gap-2">
                {importLoading && (
                  <>
                    <div className="w-4 h-4 border-2 border-indigo-200 border-t-indigo-600 rounded-full animate-spin"></div>
                    İşleniyor: {importProgress.current} / {importProgress.total}
                  </>
                )}
              </div>
              <div className="flex gap-3">
                <button 
                  disabled={importLoading}
                  onClick={() => { setShowImportModal(false); setParsedUsers([]); }}
                  className="px-5 py-2.5 rounded-xl font-bold text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-[#1e293b] hover:bg-slate-200 transition-colors disabled:opacity-50"
                >
                  İptal
                </button>
                <button 
                  disabled={importLoading || parsedUsers.length === 0}
                  onClick={executeImport}
                  className="px-6 py-2.5 rounded-xl font-bold text-slate-900 dark:text-white bg-emerald-600 hover:bg-emerald-700 shadow-sm shadow-emerald-200 flex items-center gap-2 transition-all disabled:opacity-50"
                >
                  {importLoading ? 'Aktarılıyor...' : <><Check size={18}/> Hepsini Onayla ve Ekle</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default UsersView;
