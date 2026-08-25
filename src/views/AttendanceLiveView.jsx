import React, { useState, useEffect } from 'react';
import { DoorOpen, GraduationCap, CheckCircle2 } from 'lucide-react';
import { soundManager } from '../services/soundManager';
import { ref, query as rtdbQuery, limitToLast, onValue } from 'firebase/database';
import { rtdb } from '../services/firebaseConfig';
import { firebaseService } from '../services/firebase';
import { io } from 'socket.io-client';

const AttendanceLiveView = () => {
  const [liveRecords, setLiveRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [usersMap, setUsersMap] = useState({});
  const [filterType, setFilterType] = useState('all');
  const [sources, setSources] = useState({ vds: false, firebase: false });

  /**
   * İki kaynaktan gelen kayıtları kimliğe göre birleştirir, zamana göre
   * sıralar ve son 50 işlemi tutar. Aynı geçiş her iki kaynaktan da gelirse
   * (öğrenci-yön-dakika) anahtarıyla tekilleştirilir.
   */
  const mergeRecords = React.useCallback((incoming) => {
    setLiveRecords(prev => {
      const byId = new Map();
      [...incoming, ...prev].forEach(r => {
        if (!r) return;
        byId.set(r.id || `${r.studentId}_${r.timestamp}`, r);
      });

      const toMs = (r) => {
        if (r.timestamp?.seconds) return r.timestamp.seconds * 1000;
        if (typeof r.timestamp === 'number') return r.timestamp;
        if (typeof r.timestamp === 'string') {
          const t = new Date(r.timestamp).getTime();
          return Number.isNaN(t) ? 0 : t;
        }
        return 0;
      };

      const deduped = new Map();
      Array.from(byId.values())
        .sort((a, b) => toMs(b) - toMs(a))
        .forEach(r => {
          const sid = r.studentId || r.userId || 'unknown';
          const minuteKey = Math.floor(toMs(r) / 60000);
          const key = `${sid}_${r.action || r.status}_${minuteKey}`;
          if (!deduped.has(key)) deduped.set(key, r);
        });

      return Array.from(deduped.values()).slice(0, 50);
    });
  }, []);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const users = await firebaseService.fetchAllUsers();
        const map = {};
        users.forEach(u => {
          const id = u.name.split('/').pop();
          const fullName = u.fields?.name?.stringValue || u.fields?.fullName?.stringValue || 'Bilinmeyen Kişi';
          const profileImg = u.fields?.profile_image?.stringValue || u.fields?.profileImageUrl?.stringValue || u.fields?.profileImage?.stringValue || null;
          
          let role = u.fields?.role?.stringValue || 'student';
          if (role === 'admin' && u.fields?.sub_role?.stringValue === 'personnel') {
            role = 'personnel';
          } else if (role === 'personel') {
            role = 'personnel';
          }
          
          map[id] = { name: fullName, profileImage: profileImg, role: role };
        });
        setUsersMap(map);
      } catch (error) {
        console.error("Öğrenci verileri çekilemedi", error);
      }
    };
    fetchUsers();

    /* ------------------------------------------------------------------ */
    /*  KAYNAK 1: VDS socket.io canlı akışı                                */
    /* ------------------------------------------------------------------ */
    const socket = io('http://213.142.159.36:8080');

    socket.on('connect', () => {
      setSources(prev => ({ ...prev, vds: true }));
      setLoading(false);
    });

    socket.on('new_scan', (data) => {
      mergeRecords([{ ...data, id: data.id || `vds_${data.studentId}_${data.timestamp}`, source: 'vds' }]);
      soundManager.playSuccessDing();
    });

    socket.on('disconnect', () => setSources(prev => ({ ...prev, vds: false })));
    socket.on('connect_error', () => setSources(prev => ({ ...prev, vds: false })));

    /* ------------------------------------------------------------------ */
    /*  KAYNAK 2: Firebase RTDB canlı akışı                                */
    /*  Mobil web (BGZ), panel manuel geçişleri ve otomatik çıkışlar buraya */
    /*  yazıldığı için VDS kapalı olsa bile akış kesilmez.                  */
    /* ------------------------------------------------------------------ */
    const seenRef = { current: new Set() };
    let firstRtdbBatch = true;

    const liveRef = rtdbQuery(ref(rtdb, 'qr_system/live_scans'), limitToLast(50));
    const unsubRtdb = onValue(liveRef, (snapshot) => {
      setSources(prev => ({ ...prev, firebase: true }));
      setLoading(false);
      if (!snapshot.exists()) return;

      const incoming = [];
      snapshot.forEach(child => {
        const data = child.val();
        if (!data) return;
        incoming.push({ ...data, id: child.key, source: 'firebase' });
      });

      // İlk yüklemede ses çalma; yalnızca yeni gelenlerde çal.
      const fresh = incoming.filter(r => !seenRef.current.has(r.id));
      incoming.forEach(r => seenRef.current.add(r.id));
      mergeRecords(incoming);

      if (!firstRtdbBatch && fresh.length) soundManager.playSuccessDing();
      firstRtdbBatch = false;
    }, () => setSources(prev => ({ ...prev, firebase: false })));

    // VDS hiç bağlanmazsa da ekran takılı kalmasın
    const loadingGuard = setTimeout(() => setLoading(false), 4000);

    return () => {
      socket.disconnect();
      try { unsubRtdb(); } catch { /* yok say */ }
      clearTimeout(loadingGuard);
    };
  }, [mergeRecords]);

  const currentDate = new Date().toLocaleDateString('tr-TR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div className="w-full h-full flex-1 flex flex-col font-sans gap-4 md:gap-6 pb-2">

      { }
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end mb-2 md:mb-4 w-full shrink-0 gap-4">
        <div className="flex items-center gap-5">
          <div className="flex flex-col">
            <span className="text-[12px] md:text-[13px] font-medium text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wider">{currentDate}</span>
            <h1 className="text-[28px] md:text-[36px] font-semibold text-slate-900 dark:text-white tracking-tight leading-none">Canlı Geçiş Takibi</h1>
          </div>
        </div>
        
        <div className="mt-4 lg:mt-0 flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6 w-full lg:w-auto">
          <div className="bg-slate-200 dark:bg-slate-800/60 p-1 rounded-full flex flex-nowrap items-center shadow-inner w-[calc(100%-4px)] lg:w-auto mr-[4px] lg:mr-0 transform -translate-x-[3px] lg:translate-x-0 relative z-10">
            <button
              onClick={() => setFilterType('all')}
              className={`flex-1 min-w-0 flex justify-center px-2 sm:px-5 py-2 rounded-full text-[12px] sm:text-[14px] font-bold transition-all whitespace-nowrap truncate ${filterType === 'all' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
            >
              Tümü
            </button>
            <button
              onClick={() => setFilterType('student')}
              className={`flex-1 min-w-0 flex justify-center px-2 sm:px-5 py-2 rounded-full text-[12px] sm:text-[14px] font-bold transition-all whitespace-nowrap truncate ${filterType === 'student' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
            >
              Öğrenciler
            </button>
            <button
              onClick={() => setFilterType('personnel')}
              className={`flex-1 min-w-0 flex justify-center px-2 sm:px-5 py-2 rounded-full text-[12px] sm:text-[14px] font-bold transition-all whitespace-nowrap truncate ${filterType === 'personnel' ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
            >
              Personeller
            </button>
          </div>
          
          <div
            className={`flex items-center gap-2 text-[14px] font-bold ${
              (sources.vds || sources.firebase) ? 'text-emerald-600 dark:text-emerald-500' : 'text-amber-600 dark:text-amber-500'
            }`}
            title={`VDS: ${sources.vds ? 'bağlı' : 'kapalı'} · Firebase: ${sources.firebase ? 'bağlı' : 'kapalı'}`}
          >
            <span className="relative flex h-2.5 w-2.5">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${(sources.vds || sources.firebase) ? 'bg-emerald-400' : 'bg-amber-400'}`}></span>
              <span className={`relative inline-flex rounded-full h-2.5 w-2.5 ${(sources.vds || sources.firebase) ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
            </span>
            {(sources.vds && sources.firebase)
              ? 'Sistem Aktif (2 kaynak)'
              : sources.firebase
                ? 'Sistem Aktif (Firebase)'
                : sources.vds
                  ? 'Sistem Aktif (VDS)'
                  : 'Bağlantı Bekleniyor'}
          </div>
        </div>
      </div>

      { }
      <div className="flex-1 bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm flex flex-col min-h-0 overflow-hidden">

        <div className="px-4 md:px-8 py-4 md:py-5 border-b border-slate-200 dark:border-white/10 flex items-center justify-between bg-white dark:bg-[#0f172a] shrink-0">
          <h2 className="text-[16px] md:text-[18px] font-bold text-slate-800 dark:text-slate-200 tracking-tight">Gerçek Zamanlı Kayıtlar</h2>
          <div className="text-[12px] md:text-[13px] font-semibold text-slate-500 flex items-center gap-1.5 md:gap-2">
            <CheckCircle2 size={16} className="text-emerald-500" />
            Son 50 işlem
          </div>
        </div>

        { }
        <div className="flex-1 overflow-y-auto custom-scrollbar bg-slate-50/50 dark:bg-[#1e293b]/50 p-4 md:p-6">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-600 dark:text-slate-400">
              <div className="w-8 h-8 rounded-full border-4 border-slate-200 dark:border-white/10 border-t-indigo-600 animate-spin mb-4"></div>
              <span className="text-sm font-medium">Veriler Yükleniyor...</span>
            </div>
          ) : liveRecords.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-500">
              <p className="text-[15px] font-medium">Sistemde henüz geçiş kaydı bulunmuyor.</p>
            </div>
          ) : (
            <div className="flex flex-col w-[94%] md:w-full max-w-4xl mr-auto ml-3 md:mx-auto bg-white dark:bg-[#0f172a] rounded-[20px] shadow-sm border border-slate-200 dark:border-white/10 py-2 min-h-full">
              {liveRecords.filter((record) => {
                const studentId = record.studentId || record.userId || 'unknown';
                const rawRole = record.userRole || usersMap[studentId]?.role || 'student';
                const lowerRole = rawRole.toLowerCase();
                const isPersonnel = ['personnel', 'personel', 'teacher', 'öğretmen', 'admin', 'yönetici'].includes(lowerRole);
                if (filterType === 'all') return true;
                if (filterType === 'student' && !isPersonnel) return true;
                if (filterType === 'personnel' && isPersonnel) return true;
                return false;
              }).map((record, index) => {
                const studentId = record.studentId || record.userId || 'unknown';
                const studentName = record.studentName || record.userName || usersMap[studentId]?.name || 'İsimsiz Kişi';
                let profileImageUrl = record.profileImageUrl || usersMap[studentId]?.profileImage || null;
                if (!profileImageUrl || profileImageUrl === 'null' || profileImageUrl.trim() === '') profileImageUrl = null;
                const rawRole = record.userRole || usersMap[studentId]?.role || 'student';
                
                let displayRole = 'Öğrenci';
                let roleColor = 'bg-blue-50 text-blue-600 border-blue-200';
                if (rawRole === 'teacher' || rawRole === 'öğretmen') {
                  displayRole = 'Öğretmen';
                  roleColor = 'bg-amber-50 text-amber-600 border-amber-200';
                } else if (rawRole === 'admin' || rawRole === 'personnel' || rawRole === 'personel' || rawRole === 'yönetici') {
                  displayRole = (rawRole === 'admin' || rawRole === 'yönetici') ? 'Yönetici' : 'Personel';
                  roleColor = 'bg-purple-50 text-purple-600 border-purple-200';
                }

                const type = record.type || 'institution_entry';

                let timeString = 'Bilinmeyen Zaman';
                if (record.timestamp?.seconds) {
                  timeString = new Date(record.timestamp.seconds * 1000).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                } else if (typeof record.timestamp === 'string') {
                  timeString = new Date(record.timestamp).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                } else if (typeof record.timestamp === 'number') {
                  timeString = new Date(record.timestamp).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                }

                const isAttendance = type === 'attendance';

                return (
                  <div key={record.id} className="flex items-center gap-3 md:gap-4 py-3 border-b border-slate-100 dark:border-white/5 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors px-3 md:px-4">

                    { }
                    {profileImageUrl ? (
                      <img src={profileImageUrl} alt={studentName} className="w-[44px] h-[44px] min-w-[44px] min-h-[44px] shrink-0 rounded-full object-cover shadow-sm border border-slate-200 dark:border-white/10" />
                    ) : (
                      <div className={`w-[44px] h-[44px] min-w-[44px] min-h-[44px] shrink-0 rounded-full flex items-center justify-center shadow-sm border border-slate-200 dark:border-white/10 ${isAttendance ? 'bg-indigo-50 text-indigo-500' : (record.action === 'exit' ? 'bg-red-50 text-red-500' : 'bg-emerald-50 text-emerald-500')}`}>
                        {isAttendance ? <GraduationCap size={22} /> : <DoorOpen size={22} />}
                      </div>
                    )}

                    { }
                    <div className="flex-1 flex flex-col min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[14px] md:text-[15px] font-bold text-slate-900 dark:text-white truncate max-w-full">{studentName}</span>
                        <span className={`px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-md border ${roleColor}`}>
                          {displayRole}
                        </span>
                        {index === 0 && (
                          <span className="px-2 py-0.5 bg-emerald-100 text-emerald-700 text-[10px] font-bold uppercase tracking-wider rounded-md border border-emerald-200">
                            Yeni
                          </span>
                        )}
                      </div>
                      <span className="text-[14px] font-medium text-slate-500 mt-0.5">
                        {isAttendance
                          ? 'Derse Giriş Yaptı'
                          : record.autoKind === 'lunch_exit'
                            ? 'Öğle Çıkışı (Otomatik)'
                            : record.autoKind === 'school_exit'
                              ? 'Gün Sonu Çıkışı (Otomatik)'
                              : record.action === 'exit'
                                ? 'Kurumdan Çıkış Yaptı'
                                : record.isManualApproval
                                  ? 'Kuruma Giriş Yaptı (Öğretmen Onaylı)'
                                  : 'Kuruma Giriş Yaptı'}
                        {record.isLate && !record.auto && (
                          <span className="ml-2 px-1.5 py-0.5 rounded bg-orange-100 dark:bg-orange-950/60 text-orange-700 dark:text-orange-300 text-[10px] font-extrabold uppercase tracking-wider">
                            Geç
                          </span>
                        )}
                      </span>
                    </div>

                    { }
                    <div className="flex items-center shrink-0">
                      <span className="text-[11px] md:text-[13px] font-semibold font-mono text-slate-500 dark:text-slate-400">
                        {timeString}
                      </span>
                    </div>

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

export default AttendanceLiveView;
