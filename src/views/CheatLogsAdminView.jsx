import React, { useState, useEffect, useMemo } from 'react';
import { Search, ArrowRight, Clock, AlertTriangle, ChevronDown, ShieldAlert, AlertCircle, UserX, Trash2 } from 'lucide-react';
import { db } from '../services/firebaseConfig';
import { collection, query, orderBy, limit, onSnapshot, getDocs, deleteDoc } from 'firebase/firestore';
import { firebaseService } from '../services/firebase';

const CheatLogsAdminView = () => {
  const [logs, setLogs] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedGroups, setExpandedGroups] = useState({});

  useEffect(() => {
    const fetchUsers = async () => {
      const fetchedUsers = await firebaseService.fetchAllUsers();
      setUsers(fetchedUsers);
    };
    fetchUsers();

    const q = query(collection(db, 'security_logs'), orderBy('timestamp', 'desc'), limit(100));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })).filter(log => log.type === 'cheat_attempt');
      setLogs(data);
      setLoading(false);
    }, (err) => {
      console.error("Loglar çekilirken hata:", err);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const findUserByTc = (tc) => {
    if (!tc) return null;
    return users.find(u => 
      u.fields?.tc_kimlik?.stringValue === tc || 
      u.fields?.tcKimlik?.stringValue === tc
    ) || null;
  };

  const getUserNameByTc = (tc) => {
    const user = findUserByTc(tc);
    if (user) {
      const fullName = user.fields?.full_name?.stringValue || user.fields?.fullName?.stringValue || '';
      return fullName.trim().length > 0 ? fullName : null;
    }
    return null;
  };

  const optimizePhotoUrl = (url) => {
    if (!url || typeof url !== 'string') return null;
    if (url.includes('cloudinary.com') && url.includes('/upload/')) {
      return url.replace('/upload/', '/upload/f_auto,q_auto,w_500,c_limit/');
    }
    return url;
  };

  const getUserPhotoByTc = (tc) => {
    const user = findUserByTc(tc);
    if (user) {
      const photo = user.fields?.profile_image?.stringValue || user.fields?.profileImageUrl?.stringValue || null;
      return optimizePhotoUrl(photo);
    }
    return null;
  };

  const groupedLogs = useMemo(() => {
    const logsWithNames = logs.map(log => {
      const origName = getUserNameByTc(log.originalOwnerTc) || log.originalOwnerName;
      const attName = getUserNameByTc(log.attemptedStudentTc) || log.attemptedStudentName;
      const origPhoto = getUserPhotoByTc(log.originalOwnerTc);
      const attPhoto = getUserPhotoByTc(log.attemptedStudentTc);
      return { ...log, computedOrigName: origName, computedAttName: attName, origPhoto, attPhoto };
    });

    const filtered = logsWithNames.filter(log => 
      (log.message || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.computedOrigName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.computedAttName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (log.originalOwnerTc || '').includes(searchTerm) ||
      (log.attemptedStudentTc || '').includes(searchTerm)
    );

    const map = new Map();
    filtered.forEach(log => {
      const key = `${log.originalOwnerTc || '?'}_${log.attemptedStudentTc || '?'}`;
      if (!map.has(key)) {
        map.set(key, {
          key,
          originalOwnerTc: log.originalOwnerTc,
          attemptedStudentTc: log.attemptedStudentTc,
          computedOrigName: log.computedOrigName,
          computedAttName: log.computedAttName,
          origPhoto: log.origPhoto,
          attPhoto: log.attPhoto,
          entries: [],
        });
      }
      map.get(key).entries.push(log);
    });

    return Array.from(map.values()).sort((a, b) => {
      const aTime = a.entries[0]?.timestamp?.toDate?.() || new Date(a.entries[0]?.timestamp || 0);
      const bTime = b.entries[0]?.timestamp?.toDate?.() || new Date(b.entries[0]?.timestamp || 0);
      return bTime - aTime;
    });
  }, [logs, users, searchTerm]);

  const totalViolations = groupedLogs.reduce((sum, g) => sum + g.entries.length, 0);

  const formatDate = (timestamp) => {
    if (!timestamp) return '-';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString('tr-TR', { 
      day: 'numeric', month: 'short', year: 'numeric', 
      hour: '2-digit', minute: '2-digit'
    });
  };

  const formatShortDate = (timestamp) => {
    if (!timestamp) return '-';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString('tr-TR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  };

  const toggleGroup = (key) => {
    setExpandedGroups(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleClearLogs = async () => {
    if (!window.confirm("Tüm güvenlik ihlali kayıtları veritabanından kalıcı olarak silinecektir. Emin misiniz?")) return;
    try {
      setLoading(true);
      const snap = await getDocs(collection(db, 'security_logs'));
      for (const d of snap.docs) {
        await deleteDoc(d.ref).catch(() => {});
      }
      setLogs([]);
      alert("Tüm ihlal kayıtları başarıyla silindi.");
    } catch (e) {
      console.error("Silme hatası:", e);
      alert("İhlal kayıtları silinirken hata oluştu.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full flex-1 flex flex-col font-sans gap-6 pb-6">
      {/* Header Bar */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end w-full shrink-0 gap-6 mb-2">
        <div className="flex items-center gap-5">
          <div className="flex flex-col">
            <span className="text-[13px] font-medium text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wider">Güvenlik ve Denetim</span>
            <div className="flex items-center gap-3">
              <h1 className="text-[36px] font-semibold text-slate-900 dark:text-white tracking-tight leading-none">İhlal Tespitleri</h1>
              {!loading && totalViolations > 0 && (
                <span className="px-2.5 py-1 rounded-full text-[12px] font-bold bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400 tabular-nums">
                  {totalViolations}
                </span>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-3 w-full lg:w-auto">
          {logs.length > 0 && (
            <button
              onClick={handleClearLogs}
              className="px-4 py-3 rounded-full text-[13px] font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-800/60 hover:bg-red-100 dark:hover:bg-red-900/60 transition-all flex items-center gap-2"
            >
              <Trash2 size={16} />
              <span>İhlal Kayıtlarını Temizle</span>
            </button>
          )}
          <div className="relative w-full lg:w-80">
            <Search size={18} className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-600 dark:text-slate-400" />
            <input 
              type="text" 
              placeholder="İsim veya TC ara..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-11 pr-4 py-3.5 bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-white/10 rounded-full focus:ring-2 focus:ring-slate-900 outline-none text-[14px] font-bold text-slate-900 dark:text-white transition-all placeholder:text-slate-600 dark:placeholder:text-slate-400 shadow-sm"
            />
          </div>
        </div>
      </div>

      {/* Summary Banner */}
      {!loading && totalViolations > 0 && (
        <div className="flex items-center gap-3 px-5 py-3.5 rounded-2xl bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20">
          <ShieldAlert size={20} className="text-red-600 dark:text-red-400 shrink-0" strokeWidth={2} />
          <span className="text-[14px] font-semibold text-red-700 dark:text-red-300">
            {groupedLogs.length} farklı öğrenci çiftinde toplam {totalViolations} ihlal tespit edildi.
          </span>
        </div>
      )}

      { }
      <div className="bg-white dark:bg-[#0f172a] rounded-[24px] md:rounded-[32px] border border-slate-200 dark:border-white/10 shadow-sm overflow-hidden flex flex-col flex-1 min-h-0">
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full py-20 text-slate-600 dark:text-slate-400">
              <div className="w-8 h-8 rounded-full border-4 border-slate-200 dark:border-white/10 border-t-slate-900 dark:border-t-white animate-spin mb-4"></div>
              <span className="text-[13px] font-bold uppercase tracking-wider">Kayıtlar Taranıyor...</span>
            </div>
          ) : groupedLogs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full py-20 text-slate-600 dark:text-slate-400">
              <AlertTriangle size={48} className="text-slate-300 dark:text-slate-600 mb-4" strokeWidth={1} />
              <span className="text-[15px] font-bold text-slate-600 dark:text-slate-400">Hiç ihlal girişi bulunamadı.</span>
              <span className="text-[13px] font-medium text-slate-400 dark:text-slate-500 mt-1">Sistem şu an güvenli.</span>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-white/5">
              {groupedLogs.map(group => {
                const isExpanded = !!expandedGroups[group.key];
                const count = group.entries.length;
                const latest = group.entries[0];
                const origInitial = (group.computedOrigName || '?')[0].toUpperCase();
                const attInitial = (group.computedAttName || '?')[0].toUpperCase();

                return (
                  <div key={group.key}>
                    { }
                    <div 
                      onClick={() => toggleGroup(group.key)}
                      className="flex items-center gap-4 px-5 md:px-6 py-5 cursor-pointer hover:bg-slate-50/70 dark:hover:bg-white/[0.02] transition-colors active:bg-slate-100/70 dark:active:bg-white/[0.04]"
                    >
                      { }
                      <div className="relative w-11 h-11 shrink-0">
                        {group.origPhoto ? (
                          <img src={group.origPhoto} alt="" className="absolute top-0 left-0 w-7 h-7 rounded-full object-cover ring-2 ring-white dark:ring-[#0f172a] shadow-xs z-10" />
                        ) : (
                          <div className="absolute top-0 left-0 w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-[11px] font-bold text-slate-600 dark:text-slate-300 ring-2 ring-white dark:ring-[#0f172a] z-10">
                            {origInitial}
                          </div>
                        )}
                        {group.attPhoto ? (
                          <img src={group.attPhoto} alt="" className="absolute bottom-0 right-0 w-7 h-7 rounded-full object-cover ring-2 ring-white dark:ring-[#0f172a] shadow-xs" />
                        ) : (
                          <div className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-red-100 dark:bg-red-500/20 flex items-center justify-center text-[11px] font-bold text-red-600 dark:text-red-400 ring-2 ring-white dark:ring-[#0f172a]">
                            {attInitial}
                          </div>
                        )}
                      </div>

                      { }
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 text-[15px] leading-snug">
                          <span className="font-semibold text-slate-900 dark:text-white truncate">{group.computedOrigName || 'Bilinmiyor'}</span>
                          <ArrowRight size={13} className="text-slate-300 dark:text-slate-600 shrink-0" strokeWidth={2.5} />
                          <span className="font-semibold text-red-600 dark:text-red-400 truncate">{group.computedAttName || 'Bilinmiyor'}</span>
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[12px] font-mono text-slate-400 dark:text-slate-500">{group.originalOwnerTc || '-'}</span>
                          <span className="text-[10px] text-slate-300 dark:text-slate-600">→</span>
                          <span className="text-[12px] font-mono text-slate-400 dark:text-slate-500">{group.attemptedStudentTc || '-'}</span>
                        </div>
                      </div>

                      { }
                      <div className="flex items-center gap-3 shrink-0">
                        <span className="px-2.5 py-1 rounded-full text-[12px] font-semibold bg-red-50 dark:bg-red-500/15 text-red-600 dark:text-red-400 border border-red-100 dark:border-red-500/20 tabular-nums">
                          {count > 1 ? `${count} İhlal` : 'İhlal'}
                        </span>
                        <span className="text-[12px] text-slate-400 dark:text-slate-500 hidden sm:block tabular-nums whitespace-nowrap">
                          {formatShortDate(latest.timestamp)}
                        </span>
                        <ChevronDown 
                          size={16} 
                          className={`text-slate-400 dark:text-slate-500 shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`} 
                        />
                      </div>
                    </div>

                    { }
                    {isExpanded && (
                      <div className="px-5 md:px-6 pb-6 pt-3 bg-slate-50/60 dark:bg-white/[0.01] border-t border-slate-100 dark:border-white/5">
                        { }
                        <div className="flex items-center gap-2 mb-3 text-[12px] font-bold text-red-600 dark:text-red-400 uppercase tracking-wider">
                          <ShieldAlert size={15} />
                          <span>QR Kod Yanıltma / Usulsüz Okutma Tespit Edildi</span>
                        </div>

                        { }
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                          <div className="flex flex-col p-4 rounded-2xl bg-white dark:bg-white/[0.03] border border-slate-200/70 dark:border-white/5 shadow-xs">
                            <div className="flex items-center gap-4">
                              {group.origPhoto ? (
                                <img src={group.origPhoto} alt="" className="w-14 h-14 rounded-full object-cover shrink-0 ring-2 ring-slate-100 dark:ring-white/10" />
                              ) : (
                                <div className="w-14 h-14 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-[18px] font-bold text-slate-600 dark:text-slate-300 shrink-0">
                                  {origInitial}
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <div className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">Kart Sahibi</div>
                                <div className="text-[17px] font-bold text-slate-900 dark:text-white truncate mt-0.5">{group.computedOrigName || 'Bilinmiyor'}</div>
                                <div className="text-[12px] font-mono text-slate-400 dark:text-slate-500 mt-0.5">TC {group.originalOwnerTc || '-'}</div>
                              </div>
                            </div>
                            <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-white/5 flex items-center gap-1.5 text-[12px] text-amber-600 dark:text-amber-400 font-medium">
                              <AlertCircle size={14} className="shrink-0" />
                              <span>QR Kodunu yetkisiz kişiyle paylaştı</span>
                            </div>
                          </div>

                          <div className="flex flex-col p-4 rounded-2xl bg-red-50/80 dark:bg-red-500/[0.06] border border-red-200/60 dark:border-red-500/10 shadow-xs">
                            <div className="flex items-center gap-4">
                              {group.attPhoto ? (
                                <img src={group.attPhoto} alt="" className="w-14 h-14 rounded-full object-cover shrink-0 ring-2 ring-red-200 dark:ring-red-500/20" />
                              ) : (
                                <div className="w-14 h-14 rounded-full bg-red-100 dark:bg-red-500/20 flex items-center justify-center text-[18px] font-bold text-red-600 dark:text-red-400 shrink-0">
                                  {attInitial}
                                </div>
                              )}
                              <div className="min-w-0 flex-1">
                                <div className="text-[11px] font-semibold text-red-500 uppercase tracking-wider">Okutan Kişi</div>
                                <div className="text-[17px] font-bold text-red-700 dark:text-red-400 truncate mt-0.5">{group.computedAttName || 'Bilinmiyor'}</div>
                                <div className="text-[12px] font-mono text-red-500/80 dark:text-red-400 mt-0.5">TC {group.attemptedStudentTc || '-'}</div>
                              </div>
                            </div>
                            <div className="mt-3 pt-2.5 border-t border-red-200/40 dark:border-red-500/10 flex items-start gap-1.5 text-[12px] text-red-600 dark:text-red-400 font-medium leading-relaxed">
                              <UserX size={14} className="shrink-0 mt-0.5" />
                              <span>Sisteme başka bir öğrenciye ait QR kod ile yetkisiz erişim sağlamaya veya yoklama kaydı oluşturmaya teşebbüs etti.</span>
                            </div>
                          </div>
                        </div>

                        { }
                        <div className="rounded-xl bg-white dark:bg-white/[0.02] border border-slate-200/60 dark:border-white/5 overflow-hidden">
                          <div className="px-4 py-2.5 border-b border-slate-100 dark:border-white/5 flex items-center justify-between">
                            <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                              Tespit Geçmişi · {count} kayıt
                            </span>
                            <span className="text-[11px] text-slate-400 dark:text-slate-500">
                              En Son: {formatShortDate(latest.timestamp)}
                            </span>
                          </div>
                          <div className="divide-y divide-slate-50 dark:divide-white/[0.03]">
                            {group.entries.map((entry) => (
                              <div key={entry.id} className="flex items-center justify-between px-4 py-2.5">
                                <div className="flex items-center gap-2.5">
                                  <div className="w-2 h-2 rounded-full bg-red-500 shrink-0" />
                                  <span className="text-[13px] text-slate-600 dark:text-slate-300 font-medium tabular-nums">{formatDate(entry.timestamp)}</span>
                                </div>
                                <span className="text-[11px] font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 px-2 py-0.5 rounded">
                                  Usulsüz Okutma
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CheatLogsAdminView;
