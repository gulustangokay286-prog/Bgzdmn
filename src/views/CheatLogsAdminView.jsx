import React, { useState, useEffect } from 'react';
import { Search, ArrowRight, Clock, AlertTriangle, ChevronRight, ChevronDown } from 'lucide-react';
import { db } from '../services/firebaseConfig';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { firebaseService } from '../services/firebase';

const CheatLogsAdminView = () => {
  const [logs, setLogs] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedLogs, setExpandedLogs] = useState({});

  useEffect(() => {
    // Tüm kullanıcıları çek
    const fetchUsers = async () => {
      const fetchedUsers = await firebaseService.fetchAllUsers();
      setUsers(fetchedUsers);
    };
    fetchUsers();

    // Sadece cheat_attempt olan security loglarını çek
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

  const getUserNameByTc = (tc) => {
    if (!tc) return null;
    const user = users.find(u => 
      u.fields?.tc_kimlik?.stringValue === tc || 
      u.fields?.tcKimlik?.stringValue === tc
    );
    if (user) {
      const fullName = user.fields?.full_name?.stringValue || user.fields?.fullName?.stringValue || '';
      return fullName.trim().length > 0 ? fullName : null;
    }
    return null;
  };

  // Eşleştirilmiş loglar
  const logsWithNames = logs.map(log => {
    const origName = getUserNameByTc(log.originalOwnerTc) || log.originalOwnerName;
    const attName = getUserNameByTc(log.attemptedStudentTc) || log.attemptedStudentName;
    return {
      ...log,
      computedOrigName: origName,
      computedAttName: attName
    };
  });

  const filteredLogs = logsWithNames.filter(log => 
    (log.message || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (log.computedOrigName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (log.computedAttName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (log.originalOwnerTc || '').includes(searchTerm) ||
    (log.attemptedStudentTc || '').includes(searchTerm)
  );

  const formatDate = (timestamp) => {
    if (!timestamp) return '-';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString('tr-TR', { 
      year: 'numeric', month: 'short', day: 'numeric', 
      hour: '2-digit', minute: '2-digit', second: '2-digit' 
    });
  };

  const toggleLog = (id) => {
    setExpandedLogs(prev => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="w-full flex-1 flex flex-col font-sans gap-6 pb-6">
      {/* Header section redesigned to match DashboardView */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end w-full shrink-0 gap-6 mb-2">
        <div className="flex items-center gap-5">
          <div className="flex flex-col">
            <span className="text-[13px] font-medium text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wider">Güvenlik ve Denetim</span>
            <h1 className="text-[36px] font-semibold text-slate-900 dark:text-white tracking-tight leading-none">İhlal Tespitleri</h1>
          </div>
        </div>
        
        <div className="relative w-[calc(100%-80px)] lg:w-80 ml-[10px] lg:ml-0">
          <Search size={18} className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-600 dark:text-slate-400" />
          <input 
            type="text" 
            placeholder="İsim, TC veya loglarda ara..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-11 pr-4 py-3.5 bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-white/10 rounded-full focus:ring-2 focus:ring-slate-900 outline-none text-[14px] font-bold text-slate-900 dark:text-white transition-all placeholder:text-slate-600 dark:text-slate-400 shadow-sm"
          />
        </div>
      </div>

      <div className="bg-white dark:bg-[#0f172a] rounded-[24px] md:rounded-[32px] border border-slate-200 dark:border-white/10 shadow-sm overflow-hidden flex flex-col flex-1 min-h-0">
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          {loading ? (
             <div className="flex flex-col items-center justify-center h-full text-slate-600 dark:text-slate-400">
               <div className="w-8 h-8 rounded-full border-4 border-slate-200 dark:border-white/10 border-t-slate-900 animate-spin mb-4"></div>
               <span className="text-[13px] font-bold uppercase tracking-wider">İhlal Kayıtları Taranıyor...</span>
             </div>
          ) : filteredLogs.length === 0 ? (
             <div className="flex flex-col items-center justify-center h-full text-slate-600 dark:text-slate-400">
               <AlertTriangle size={48} className="text-slate-800 dark:text-slate-200 mb-4" strokeWidth={1} />
               <span className="text-[15px] font-bold text-slate-600 dark:text-slate-400">Hiç ihlal girişi bulunamadı.</span>
               <span className="text-[13px] font-medium text-slate-600 dark:text-slate-400 mt-1">Sistem şu an güvenli.</span>
             </div>
          ) : (
            <div className="flex flex-col gap-4">
              {filteredLogs.map(log => (
                <div key={log.id} className="flex flex-col bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-white/10 rounded-[20px] hover:border-slate-200 dark:border-white/10 hover:shadow-sm transition-all overflow-hidden group">
                  
                  {/* Summary Card */}
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between p-4 md:p-5 gap-4">
                    <div className="flex items-start gap-4 flex-1">
                      <div className="w-10 h-10 shrink-0 rounded-full flex items-center justify-center border bg-red-50 border-red-100 text-red-600">
                        <AlertTriangle size={18} strokeWidth={2} />
                      </div>
                      
                      <div className="flex flex-col pt-0.5">
                        <div className="text-[15px] font-bold text-slate-800 dark:text-slate-200 mb-2">
                          İhlal tespit edildi
                        </div>
                        
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="flex items-center gap-2 bg-slate-50 dark:bg-[#1e293b] border border-slate-200 dark:border-white/10 px-3 py-1.5 rounded-lg">
                            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wide">Sahip TC</span>
                            <span className="text-[13px] font-mono font-bold text-slate-700 dark:text-slate-300">{log.originalOwnerTc || '-'}</span>
                          </div>
                          
                          <div className="text-slate-700 dark:text-slate-300">
                            <ArrowRight size={16} strokeWidth={2} />
                          </div>
                          
                          <div className="flex items-center gap-2 bg-red-50 border border-red-200 px-3 py-1.5 rounded-lg">
                            <span className="text-[11px] font-bold text-red-500 uppercase tracking-wide">Okutan TC</span>
                            <span className="text-[13px] font-mono font-bold text-red-700">{log.attemptedStudentTc || '-'}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 text-slate-500 text-[12px] font-bold bg-slate-50 dark:bg-[#1e293b] px-3 py-2 rounded-full shrink-0 border border-slate-200 dark:border-white/10 group-hover:bg-slate-50 dark:bg-[#1e293b] transition-colors mt-2 sm:mt-0 h-fit">
                      <Clock size={14} className="text-slate-600 dark:text-slate-400" />
                      {formatDate(log.timestamp)}
                    </div>
                  </div>

                  {/* Details Section */}
                  {expandedLogs[log.id] && (
                    <div className="px-5 pb-6 pt-4 border-t border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-[#1e293b]/50">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-stretch">
                        <div className="bg-white dark:bg-[#0f172a] p-5 rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm flex flex-col relative overflow-hidden">
                          <span className="text-[12px] text-slate-500 uppercase font-bold mb-1 tracking-wider">Asıl Kart Sahibi (İhlal Eden)</span>
                          <div className="text-[20px] font-extrabold text-slate-900 dark:text-white tracking-tight">{log.computedOrigName || 'İsim Bilinmiyor'}</div>
                          <div className="text-[13px] text-slate-500 font-mono mt-1 font-medium">TC: {log.originalOwnerTc || '-'}</div>
                          
                          <div className="mt-4 pt-4 border-t border-slate-200 dark:border-white/10 text-[12px] font-medium text-slate-600 dark:text-slate-400 leading-relaxed flex-1">
                            <strong>Not:</strong> Kendi kartı yerine yetkisiz bir şekilde başkasının kartını okutarak sistemi yanıltmaya ve kural ihlali yapmaya çalışmıştır.
                          </div>
                        </div>
                        
                        <div className="bg-red-50 p-5 rounded-2xl border border-red-100 shadow-sm flex flex-col relative overflow-hidden">
                          <span className="text-[12px] text-red-500 uppercase font-bold mb-1 tracking-wider">Teşebbüs Eden</span>
                          <div className="text-[20px] font-extrabold text-red-700 tracking-tight">{log.computedAttName || 'İsim Bilinmiyor'}</div>
                          <div className="text-[13px] text-red-500 font-mono mt-1 font-medium">TC: {log.attemptedStudentTc || '-'}</div>
                          
                          <div className="mt-4 pt-4 border-t border-red-200/60 text-[12px] font-medium text-red-700/90 leading-relaxed flex-1">
                            <strong>Not:</strong> Kurumda fiziki olarak bulunmamasına rağmen, <em>{log.computedOrigName || 'Asıl Kart Sahibi'}</em> tarafından kendi yerine kartı okutularak sisteme giriş yapmaya teşebbüs edilmiştir.
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Toggle Button */}
                  <div 
                    className="w-full py-3 bg-slate-50 dark:bg-[#1e293b] border-t border-slate-200 dark:border-white/10 cursor-pointer flex items-center justify-center hover:bg-slate-50 dark:bg-[#1e293b] transition-colors text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:text-slate-200 shrink-0 relative z-10"
                    onClick={() => toggleLog(log.id)}
                  >
                    <span className="text-[12px] font-bold uppercase tracking-wider flex items-center gap-1">
                      Ayrıntı {expandedLogs[log.id] ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </span>
                  </div>

                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CheatLogsAdminView;
