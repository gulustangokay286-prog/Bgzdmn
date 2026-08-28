import React, { useState, useEffect } from 'react';
import { ShieldAlert, Search, ShieldCheck, Clock, ShieldBan, TerminalSquare, AlertTriangle } from 'lucide-react';
import { db } from '../services/firebaseConfig';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';

const SecurityLogsView = () => {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    const q = query(collection(db, 'security_logs'), orderBy('timestamp', 'desc'), limit(100));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setLogs(data);
      setLoading(false);
    }, (err) => {
      console.error("Loglar çekilirken hata:", err);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const filteredLogs = logs.filter(log => 
    (log.message || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (log.user || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (log.type || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getIconForType = (type) => {
    switch (type) {
      case 'auth_success': return <ShieldCheck size={18} className="text-emerald-500" />;
      case 'auth_failed': return <ShieldBan size={18} className="text-rose-500" />;
      case 'warning': return <AlertTriangle size={18} className="text-amber-500" />;
      case 'cheat_attempt': return <AlertTriangle size={18} className="text-red-600" />;
      default: return <TerminalSquare size={18} className="text-slate-600 dark:text-slate-400" />;
    }
  };

  const getBgForType = (type) => {
    switch (type) {
      case 'auth_success': return 'bg-emerald-50 border-emerald-100';
      case 'auth_failed': return 'bg-rose-50 border-rose-100';
      case 'warning': return 'bg-amber-50 border-amber-100';
      case 'cheat_attempt': return 'bg-red-100 border-red-300';
      default: return 'bg-slate-50 dark:bg-[#1e293b] border-slate-200 dark:border-white/10';
    }
  };

  const formatDate = (timestamp) => {
    if (!timestamp) return '-';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleString('tr-TR', { 
      year: 'numeric', month: 'short', day: 'numeric', 
      hour: '2-digit', minute: '2-digit', second: '2-digit' 
    });
  };

  return (
    <div className="absolute inset-0 bg-[#FAFAFA] dark:bg-[#0b1120] z-40 overflow-y-auto font-sans flex flex-col p-8 md:p-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end w-full shrink-0 gap-6 mb-8">
        <div className="flex items-center gap-5">
          <div className="w-14 h-14 bg-slate-900 border border-slate-800 rounded-[16px] flex items-center justify-center text-slate-900 dark:text-white shadow-sm">
            <ShieldAlert size={28} strokeWidth={1.5} />
          </div>
          <div className="flex flex-col">
            <span className="text-[13px] font-bold text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wider">Sistem Logları</span>
            <h1 className="text-[36px] font-extrabold text-slate-900 dark:text-white tracking-tight leading-none">Güvenlik Merkezi</h1>
          </div>
        </div>
        
        <div className="relative w-full md:w-80">
          <Search size={18} className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-600 dark:text-slate-400" />
          <input 
            type="text" 
            placeholder="Log kayıtlarında ara..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-11 pr-4 py-3.5 bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-white/10 rounded-full focus:ring-2 focus:ring-slate-900 outline-none text-[14px] font-bold text-slate-900 dark:text-white transition-all placeholder:text-slate-600 dark:text-slate-400 shadow-sm"
          />
        </div>
      </div>

      <div className="bg-white dark:bg-[#0f172a] rounded-[32px] border border-slate-200 dark:border-white/10 shadow-sm overflow-hidden flex flex-col flex-1 min-h-0">
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
             <div className="flex flex-col items-center justify-center h-full text-slate-600 dark:text-slate-400">
               <div className="w-8 h-8 rounded-full border-4 border-slate-200 dark:border-white/10 border-t-slate-900 animate-spin mb-4"></div>
               <span className="text-[13px] font-bold uppercase tracking-wider">Sistem Taranıyor...</span>
             </div>
          ) : filteredLogs.length === 0 ? (
             <div className="flex flex-col items-center justify-center h-full text-slate-600 dark:text-slate-400">
               <ShieldAlert size={48} className="text-slate-800 dark:text-slate-200 mb-4" strokeWidth={1} />
               <span className="text-[15px] font-bold text-slate-600 dark:text-slate-400">Herhangi bir kayıt bulunamadı.</span>
               <span className="text-[13px] font-medium text-slate-600 dark:text-slate-400 mt-1">Belirttiğiniz kriterlere uygun log yok veya sistem temiz.</span>
             </div>
          ) : (
            <div className="flex flex-col gap-3">
              {filteredLogs.map(log => (
                <div key={log.id} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-[20px] bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-white/10 hover:border-slate-200 dark:border-white/10 hover:shadow-sm transition-all gap-4 group">
                  <div className="flex items-start gap-4">
                    <div className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center border ${getBgForType(log.type)}`}>
                      {getIconForType(log.type)}
                    </div>
                    <div className="flex flex-col pt-0.5">
                      <div className="text-[14px] font-bold text-slate-800 dark:text-slate-200 mb-0.5">{log.message || 'Bilinmeyen İşlem'}</div>
                      <div className="text-[12px] font-bold text-slate-600 dark:text-slate-400 flex items-center gap-2">
                        {log.user && <span>Kullanıcı: <span className="text-slate-600 dark:text-slate-400">{log.user}</span></span>}
                        {log.user && log.ip && <span className="w-1 h-1 rounded-full bg-slate-300" />}
                        {log.ip && <span className="font-mono text-[11px] bg-slate-50 dark:bg-[#1e293b] px-1.5 rounded">{log.ip}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400 text-[12px] font-bold bg-slate-50 dark:bg-[#1e293b] px-3 py-1.5 rounded-full shrink-0 border border-slate-200 dark:border-white/10 group-hover:bg-slate-50 dark:bg-[#1e293b] transition-colors">
                    <Clock size={14} />
                    {formatDate(log.timestamp)}
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

export default SecurityLogsView;
