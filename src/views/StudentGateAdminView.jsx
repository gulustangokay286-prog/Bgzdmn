import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Search, User, Loader2, DoorOpen, DoorClosed, AlertCircle, ShieldAlert,
  CheckCircle2, XCircle, Clock, UserCheck, Timer, Sunrise, Sunset, RefreshCcw
} from 'lucide-react';
import { db, rtdb } from '../services/firebaseConfig';
import { ref, onValue, update, serverTimestamp as rtdbServerTimestamp } from 'firebase/database';
import { collection, onSnapshot, doc, setDoc, serverTimestamp, addDoc } from 'firebase/firestore';
import { soundManager } from '../services/soundManager';
import { firebaseService } from '../services/firebase';
import {
  recordGatePassage,
  subscribeLateApprovals,
  approveLateEntry,
  resolveLateApproval,
  buildTimeContext
} from '../services/attendanceService';
import { getDateKeyInTimeZone, evaluateEntryAttempt } from '../services/attendanceRules';
import useAttendanceConfig from '../hooks/useAttendanceConfig';

const StudentGateAdminView = () => {
  const { config } = useAttendanceConfig();

  const [students, setStudents] = useState([]);
  const [studentStatusMap, setStudentStatusMap] = useState({});
  const [searchText, setSearchText] = useState('');
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);
  const [lateRequests, setLateRequests] = useState([]);
  const [toast, setToast] = useState(null);

  const statusFromFirestoreRef = useRef({});
  const statusFromRtdbRef = useRef({});

  const dateKey = useMemo(() => getDateKeyInTimeZone(new Date(), config.timeZone || 'Europe/Istanbul'), [config.timeZone]);
  const currentDate = new Date().toLocaleDateString('tr-TR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const flash = useCallback((kind, text) => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 4000);
  }, []);

  const mergeAndSetStatuses = useCallback(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    const combined = {};

    Object.entries(statusFromFirestoreRef.current).forEach(([k, v]) => {
      if (v?.status === 'entry') {
        combined[k] = 'inside';
      } else if (v?.status === 'exit') {
        combined[k] = 'outside';
      }
    });

    Object.entries(statusFromRtdbRef.current).forEach(([k, v]) => {
      if (v?.status === 'entry') {
        combined[k] = 'inside';
      } else if (v?.status === 'exit') {
        combined[k] = 'outside';
      }
    });

    setStudentStatusMap(prev => ({ ...prev, ...combined }));
  }, [dateKey]);

  useEffect(() => {
    let cancelled = false;

    const unsub = onSnapshot(collection(db, 'users'), (snapshot) => {
      try {
        const studentList = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          const role = (data.role || '').toLowerCase();
          if (role === 'student' || role === 'öğrenci') {
            const id = docSnap.id;
            const name = data.full_name || data.fullName || data.name || data.displayName || 'Bilinmeyen Öğrenci';
            const rawPhoto = data.profile_image || data.profileImageUrl || data.profileImage || null;
            const branch = data.branch || (data.class_id ? `${data.class_id}/${data.section || 'A'}` : '');

            studentList.push({
              id,
              name,
              tc: data.tc_kimlik || data.tcKimlik || data.tc || '',
              schoolNumber: data.school_number || data.schoolNumber || '',
              branch,
              profileImage: rawPhoto || null
            });
          }
        });

        studentList.sort((a, b) => a.name.localeCompare(b.name, 'tr'));

        if (!cancelled) {
          setStudents(studentList);
          setLoading(false);
        }
      } catch (err) {
        console.error('Öğrenci listesi okunamadı:', err);
        if (!cancelled) setLoading(false);
      }
    });

    return () => {
      cancelled = true;
      try { unsub(); } catch(e) {}
    };
  }, []);

  useEffect(() => {
    
    const unsubFirestore = onSnapshot(collection(db, 'gate_status'), (snapshot) => {
      const fsMap = {};
      const todayStr = new Date().toISOString().split('T')[0];
      snapshot.forEach(docSnap => {
        const data = docSnap.data();
        if (data && (data.date === dateKey || data.date === todayStr || !data.date)) {
          fsMap[docSnap.id] = data;
        }
      });
      statusFromFirestoreRef.current = fsMap;
      mergeAndSetStatuses();
    }, (err) => console.warn('Firestore gate_status dinleyici:', err));

    const statusRef = ref(rtdb, 'qr_system/gate_status');
    const unsubRtdb = onValue(statusRef, (snapshot) => {
      const rMap = {};
      const todayStr = new Date().toISOString().split('T')[0];
      if (snapshot.exists()) {
        snapshot.forEach(child => {
          const data = child.val();
          if (data && (data.date === dateKey || data.date === todayStr || !data.date)) {
            rMap[child.key] = data;
          }
        });
      }
      statusFromRtdbRef.current = rMap;
      mergeAndSetStatuses();
    }, (err) => console.warn('RTDB gate_status dinleyici:', err));

    return () => {
      try { unsubFirestore(); } catch(e) {}
      try { unsubRtdb(); } catch(e) {}
    };
  }, [dateKey, mergeAndSetStatuses]);

  useEffect(() => {
    const unsub = subscribeLateApprovals(dateKey, (list) => {
      setLateRequests(prev => {
        if (list.length > prev.length) soundManager.playErrorBuzzer();
        return list;
      });
    });
    return () => { try { unsub(); } catch {  } };
  }, [dateKey]);

  const handleAction = async (student) => {
    if (processingId) return;
    setProcessingId(student.id);

    const currentStatus = studentStatusMap[student.id] || 'outside';
    const nextAction = currentStatus === 'inside' ? 'exit' : 'entry';
    const targetStatus = nextAction === 'entry' ? 'inside' : 'outside';

    setStudentStatusMap(prev => ({ ...prev, [student.id]: targetStatus }));
    statusFromFirestoreRef.current[student.id] = { status: nextAction, date: dateKey };
    statusFromRtdbRef.current[student.id] = { status: nextAction, date: dateKey };
    soundManager.playSuccessDing();

    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const nowTime = new Date().toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });

      await Promise.all([
        setDoc(doc(db, 'gate_status', student.id), {
          status: nextAction,
          lastAction: nextAction,
          date: dateKey || todayStr,
          time: nowTime,
          studentName: student.name,
          timestamp: serverTimestamp()
        }),
        update(ref(rtdb), {
          [`qr_system/gate_status/${student.id}`]: {
            status: nextAction,
            lastAction: nextAction,
            date: dateKey || todayStr,
            time: nowTime,
            name: student.name,
            role: 'student',
            timestamp: rtdbServerTimestamp()
          }
        }),
        recordGatePassage({
          student,
          action: nextAction,
          method: 'manual_admin',
          isManualApproval: nextAction === 'entry',
          approvedBy: 'Görevli Öğretmen (Panel)',
          sessionId: 'manual_admin',
          config
        }).catch(e => console.warn('recordGatePassage log:', e))
      ]);

      flash('success', nextAction === 'entry' ? `${student.name} — kuruma giriş yaptı.` : `${student.name} — kurumdan çıkış yaptı.`);
    } catch (err) {
      console.error('Geçiş kaydedilemedi:', err);
      
      setStudentStatusMap(prev => ({ ...prev, [student.id]: currentStatus }));
      flash('error', 'Geçiş kaydedilemedi: ' + (err?.message || 'Bağlantı hatası'));
    } finally {
      setProcessingId(null);
    }
  };

  const handleApproveLate = async (request) => {
    if (processingId) return;
    setProcessingId(request.studentId);
    try {
      await approveLateEntry({ request, approvedBy: 'Görevli Öğretmen (Panel)' });
      soundManager.playSuccessDing();
      flash('success', `${request.studentName} — geç girişi onaylandı ve kaydedildi.`);
    } catch (err) {
      console.error('Onay verilemedi:', err);
      flash('error', 'Onay verilemedi: ' + (err?.message || 'bilinmeyen hata'));
    } finally {
      setProcessingId(null);
    }
  };

  const handleRejectLate = async (request) => {
    if (processingId) return;
    setProcessingId(request.studentId);
    try {
      await resolveLateApproval({ request, status: 'rejected', resolvedBy: 'Görevli Öğretmen (Panel)', dateKey });
      flash('info', `${request.studentName} — talep reddedildi, giriş kaydedilmedi.`);
    } catch (err) {
      flash('error', 'Talep kapatılamadı: ' + (err?.message || 'bilinmeyen hata'));
    } finally {
      setProcessingId(null);
    }
  };

  const filteredStudents = useMemo(() => {
    if (!searchText.trim()) return students;
    const q = searchText.trim().toLocaleLowerCase('tr');
    return students.filter(s =>
      s.name.toLocaleLowerCase('tr').includes(q) ||
      (s.schoolNumber || '').includes(q) ||
      (s.tc || '').includes(q) ||
      (s.branch || '').toLocaleLowerCase('tr').includes(q)
    );
  }, [students, searchText]);

  const insideCount = useMemo(
    () => students.filter(s => studentStatusMap[s.id] === 'inside').length,
    [students, studentStatusMap]
  );

  const outsideCount = students.length - insideCount;

  if (loading) {
    return (
      <div className="w-full h-full flex-1 flex items-center justify-center bg-[#FAFAFA] dark:bg-[#0b1120] z-40">
        <Loader2 size={32} className="text-slate-600 dark:text-slate-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="w-full h-full flex-1 flex flex-col font-sans pb-2 md:pb-6 overflow-x-hidden">

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-4 md:mb-6 shrink-0 gap-4 w-full">
        <div className="flex flex-col">
          <span className="text-[11px] md:text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wider">{currentDate}</span>
          <h1 className="text-[28px] md:text-[32px] font-semibold text-slate-900 dark:text-white tracking-tight leading-none">Öğrenci Geçiş Yönetimi</h1>
          
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-3 text-[12.5px] font-semibold">
            <span className="flex items-center gap-1.5 px-3 py-1 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 rounded-full border border-emerald-200 dark:border-emerald-900/50">
              <UserCheck size={14} className="text-emerald-600" />
              Kurumda (İçeride): <strong className="ml-1 text-[13px]">{insideCount}</strong>
            </span>
            <span className="flex items-center gap-1.5 px-3 py-1 bg-slate-100 dark:bg-[#1e293b] text-slate-700 dark:text-slate-300 rounded-full border border-slate-200 dark:border-white/10">
              <DoorOpen size={14} className="text-slate-500" />
              Kurum Dışında: <strong className="ml-1 text-[13px]">{outsideCount}</strong>
            </span>
            <span className="flex items-center gap-1.5 px-3 py-1 bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 rounded-full border border-blue-200 dark:border-blue-900/50">
              <Clock size={14} className="text-blue-500" />
              Toplam Kayıtlı: <strong className="ml-1 text-[13px]">{students.length}</strong>
            </span>
          </div>
        </div>

        <div className="relative w-full sm:w-80">
          <Search size={16} className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="İsim, sınıf (12B), okul no veya TC..."
            className="pl-10 pr-4 py-2.5 w-full bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-white/10 rounded-xl text-[14px] text-slate-900 dark:text-white outline-none focus:border-indigo-500 transition-colors shadow-xs"
          />
        </div>
      </div>

      {toast && (
        <div className={`mb-4 px-4 py-3 rounded-2xl border text-[13.5px] font-semibold flex items-center gap-2.5 shrink-0 animate-in fade-in slide-in-from-top-2 shadow-sm ${
          toast.kind === 'success' ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900/50 text-emerald-700 dark:text-emerald-300'
          : toast.kind === 'error' ? 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300'
          : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300'
        }`}>
          {toast.kind === 'success' ? <CheckCircle2 size={16} /> : toast.kind === 'error' ? <XCircle size={16} /> : <AlertCircle size={16} />}
          {toast.text}
        </div>
      )}

      {lateRequests.length > 0 && (
        <div className="mb-5 shrink-0 rounded-2xl border-2 border-red-200 dark:border-red-900/60 bg-red-50/70 dark:bg-red-950/30 overflow-hidden">
          <div className="px-4 md:px-6 py-3.5 flex items-center gap-2.5 border-b border-red-200 dark:border-red-900/50">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
            </span>
            <ShieldAlert size={17} className="text-red-600 dark:text-red-400" />
            <h2 className="text-[15px] font-extrabold text-red-800 dark:text-red-200">
              Rehberlik Onayı Bekleyen Geç Girişler ({lateRequests.length})
            </h2>
          </div>

          <div className="divide-y divide-red-200/70 dark:divide-red-900/40">
            {lateRequests.map(request => {
              const busy = processingId === request.studentId;
              return (
                <div key={request.id} className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 md:px-6 py-3.5">
                  {request.studentPhoto ? (
                    <img
                      src={request.studentPhoto}
                      alt={request.studentName}
                      referrerPolicy="no-referrer"
                      crossOrigin="anonymous"
                      className="w-10 h-10 min-w-[40px] rounded-full object-cover border-2 border-red-200 dark:border-red-900/60"
                      onError={(e) => {
                        e.target.style.display = 'none';
                        if (e.target.nextSibling) e.target.nextSibling.style.display = 'flex';
                      }}
                    />
                  ) : null}
                  <div className={`w-10 h-10 min-w-[40px] rounded-full bg-red-100 dark:bg-red-950/60 text-red-600 dark:text-red-400 items-center justify-center border-2 border-red-200 dark:border-red-900/60 ${request.studentPhoto ? 'hidden' : 'flex'}`}>
                    <User size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[14px] font-bold text-slate-900 dark:text-white truncate">{request.studentName}</span>
                      {request.schoolNumber && (
                        <span className="text-[11.5px] font-semibold text-slate-500">No: {request.schoolNumber}</span>
                      )}
                      <span className="px-2 py-0.5 rounded-md bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 text-[10.5px] font-extrabold uppercase tracking-wider border border-red-200 dark:border-red-900/60">
                        {request.sessionLabel}
                      </span>
                    </div>
                    <div className="text-[12.5px] text-slate-600 dark:text-slate-400 font-medium mt-0.5 flex items-center gap-1.5 tabular-nums">
                      <Timer size={13} className="text-red-500" />
                      Okutma {request.requestedTime}
                      {request.lateByMinutes > 0 && <span className="text-red-600 dark:text-red-400 font-bold">· {request.lateByMinutes} dk gecikme</span>}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => handleApproveLate(request)}
                      disabled={busy}
                      className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-[13px] font-bold transition-all active:scale-95 disabled:opacity-50 min-w-[124px] shadow-sm"
                    >
                      {busy ? <Loader2 size={14} className="animate-spin" /> : <><UserCheck size={14} /> Girişini Yap</>}
                    </button>
                    <button
                      onClick={() => handleRejectLate(request)}
                      disabled={busy}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-white dark:bg-[#0f172a] border border-slate-300 dark:border-white/10 text-slate-600 dark:text-slate-300 text-[13px] font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-all disabled:opacity-50"
                    >
                      <XCircle size={14} /> Reddet
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="w-full flex-1 bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-white/10 rounded-2xl flex flex-col overflow-hidden shadow-sm">
        <div className="flex-1 overflow-x-auto overflow-y-auto custom-scrollbar">
          <div className="min-w-[700px] flex flex-col h-full">

            <div className="flex items-center px-6 py-4 border-b border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-[#1e293b]/50 shrink-0 sticky top-0 z-10 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              <div className="flex-1">Öğrenci</div>
              <div className="w-28">Sınıf / Şube</div>
              <div className="w-28">Okul No</div>
              <div className="w-36">Mevcut Konum</div>
              <div className="w-36 text-right">Geçiş İşlemi</div>
            </div>

            <div className="flex-1 divide-y divide-slate-100 dark:divide-white/5">
              {filteredStudents.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-slate-600 dark:text-slate-400">
                  <AlertCircle size={32} className="mb-2 opacity-50" />
                  <span className="text-[14px] font-medium">Kayıtlı öğrenci bulunamadı.</span>
                </div>
              ) : (
                filteredStudents.map((student) => {
                  const isInside = studentStatusMap[student.id] === 'inside';
                  const isProcessing = processingId === student.id;
                  const hasPendingRequest = lateRequests.some(r => r.studentId === student.id);

                  return (
                    <div
                      key={student.id}
                      className={`flex items-center px-6 py-3.5 transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40 ${
                        hasPendingRequest ? 'bg-red-50/60 dark:bg-red-950/20' : ''
                      }`}
                    >
                      
                      <div className="flex-1 flex items-center gap-3 min-w-0 pr-2">
                        {student.profileImage ? (
                          <img
                            src={student.profileImage}
                            alt={student.name}
                            referrerPolicy="no-referrer"
                            crossOrigin="anonymous"
                            className="w-9 h-9 min-w-[36px] min-h-[36px] shrink-0 rounded-full object-cover border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#1e293b]"
                            onError={(e) => {
                              e.target.style.display = 'none';
                              if (e.target.nextSibling) e.target.nextSibling.style.display = 'flex';
                            }}
                          />
                        ) : null}
                        <div className={`w-9 h-9 min-w-[36px] min-h-[36px] shrink-0 rounded-full bg-slate-50 dark:bg-[#1e293b] text-slate-600 dark:text-slate-400 items-center justify-center border border-slate-200 dark:border-white/10 shadow-xs ${student.profileImage ? 'hidden' : 'flex'}`}>
                          <User size={16} />
                        </div>
                        <div className="flex flex-col min-w-0">
                          <span className="text-[13.5px] font-bold text-slate-900 dark:text-white truncate">{student.name}</span>
                          <span className="text-[11px] font-mono text-slate-400 truncate">{student.tc || ''}</span>
                        </div>
                        {hasPendingRequest && (
                          <span className="px-2 py-0.5 rounded-md bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 text-[10px] font-extrabold uppercase tracking-wider shrink-0">
                            Onay Bekliyor
                          </span>
                        )}
                      </div>

                      <div className="w-28">
                        <span className="text-[12px] font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-[#1e293b] px-2 py-0.5 rounded-md border border-slate-200 dark:border-white/10">
                          {student.branch || '—'}
                        </span>
                      </div>

                      <div className="w-28 text-[12.5px] text-slate-600 dark:text-slate-400 font-semibold">
                        {student.schoolNumber || '—'}
                      </div>

                      <div className="w-36 flex items-center shrink-0">
                        {isInside ? (
                          <div className="px-2.5 py-1 rounded-xl text-[11.5px] font-bold flex items-center gap-1.5 border border-emerald-200 dark:border-emerald-900/60 text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40">
                            <CheckCircle2 size={13} className="text-emerald-600" />
                            <span>Kurum İçinde</span>
                          </div>
                        ) : (
                          <div className="px-2.5 py-1 rounded-xl text-[11.5px] font-bold flex items-center gap-1.5 border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-[#1e293b]">
                            <DoorOpen size={13} className="text-slate-400" />
                            <span>Kurum Dışında</span>
                          </div>
                        )}
                      </div>

                      <div className="w-36 flex justify-end shrink-0">
                        <button
                          onClick={() => handleAction(student)}
                          disabled={isProcessing}
                          className={`flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-xl border text-[12px] font-bold transition-all w-32 shadow-xs active:scale-95 ${
                            isProcessing
                              ? 'bg-slate-100 dark:bg-[#1e293b] border-slate-200 dark:border-white/10 text-slate-400 cursor-not-allowed'
                              : isInside
                              ? 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/40 hover:border-rose-300'
                              : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/40 hover:border-emerald-300'
                          }`}
                        >
                          {isProcessing ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : isInside ? (
                            <>
                              <DoorClosed size={13} />
                              <span>Çıkış Yap</span>
                            </>
                          ) : (
                            <>
                              <DoorOpen size={13} />
                              <span>Giriş Yap</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
      `}</style>
    </div>
  );
};

export default StudentGateAdminView;
