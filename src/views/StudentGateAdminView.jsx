import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Search, Loader2, DoorOpen, DoorClosed, AlertCircle, ShieldAlert,
  CheckCircle2, XCircle, Clock, UserCheck, Timer, Sunrise, Sunset
} from 'lucide-react';
import { rtdb } from '../services/firebaseConfig';
import { ref, onValue } from 'firebase/database';
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

  const dateKey = useMemo(() => getDateKeyInTimeZone(new Date(), config.timeZone), [config.timeZone]);
  const currentDate = new Date().toLocaleDateString('tr-TR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  const flash = useCallback((kind, text) => {
    setToast({ kind, text });
    setTimeout(() => setToast(null), 4000);
  }, []);

  /* ---------------------------------------------------------------------- */
  /*  Öğrenci listesi                                                        */
  /* ---------------------------------------------------------------------- */
  useEffect(() => {
    let cancelled = false;

    const loadStudents = async () => {
      try {
        const users = await firebaseService.fetchAllUsers();
        const studentList = users
          .filter(u => {
            const role = u.fields?.role?.stringValue?.toLowerCase() || '';
            return role === 'student' || role === 'öğrenci';
          })
          .map(u => {
            const id = u.name.split('/').pop();
            const name = u.fields?.full_name?.stringValue || u.fields?.fullName?.stringValue
              || u.fields?.name?.stringValue || u.fields?.displayName?.stringValue || 'Bilinmeyen Öğrenci';
            const rawPhoto = u.fields?.profile_image?.stringValue || u.fields?.profileImageUrl?.stringValue
              || u.fields?.profileImage?.stringValue || null;
            return {
              id,
              name,
              tc: u.fields?.tc_kimlik?.stringValue || u.fields?.tcKimlik?.stringValue || u.fields?.tc?.stringValue || '',
              schoolNumber: u.fields?.school_number?.stringValue || u.fields?.schoolNumber?.stringValue || '',
              profileImage: rawPhoto || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=f1f5f9&color=0f172a&size=100`
            };
          })
          .sort((a, b) => a.name.localeCompare(b.name, 'tr'));

        if (!cancelled) setStudents(studentList);
      } catch (err) {
        console.error('Veriler yüklenemedi:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadStudents();
    return () => { cancelled = true; };
  }, []);

  /* ---------------------------------------------------------------------- */
  /*  Geçiş durumu (mobil web + panel ortak kaynağı)                         */
  /* ---------------------------------------------------------------------- */
  useEffect(() => {
    const statusRef = ref(rtdb, 'qr_system/gate_status');
    const unsub = onValue(statusRef, (snapshot) => {
      const statusMap = {};
      if (snapshot.exists()) {
        snapshot.forEach(child => {
          const data = child.val();
          if (data?.date === dateKey) {
            statusMap[child.key] = data.status === 'entry' ? 'inside' : 'outside';
          }
        });
      }
      setStudentStatusMap(statusMap);
    }, (err) => console.error('Geçiş durumları okunamadı:', err));

    return () => unsub();
  }, [dateKey]);

  /* ---------------------------------------------------------------------- */
  /*  Rehberlik onayı bekleyen geç girişler                                  */
  /* ---------------------------------------------------------------------- */
  useEffect(() => {
    const unsub = subscribeLateApprovals(dateKey, (list) => {
      setLateRequests(prev => {
        if (list.length > prev.length) soundManager.playErrorBuzzer();
        return list;
      });
    });
    return () => { try { unsub(); } catch { /* yok say */ } };
  }, [dateKey]);

  /* ---------------------------------------------------------------------- */
  /*  Aksiyonlar                                                             */
  /* ---------------------------------------------------------------------- */

  /** Görevli öğretmenin manuel giriş/çıkış işlemi. */
  const handleAction = async (student) => {
    if (processingId) return;
    setProcessingId(student.id);

    const currentStatus = studentStatusMap[student.id] || 'outside';
    const nextAction = currentStatus === 'inside' ? 'exit' : 'entry';

    // İyimser güncelleme — RTDB dinleyicisi birazdan doğrulayacak.
    setStudentStatusMap(prev => ({ ...prev, [student.id]: nextAction === 'entry' ? 'inside' : 'outside' }));
    soundManager.playSuccessDing();

    try {
      const ctx = buildTimeContext(config, new Date());
      const decision = nextAction === 'entry'
        ? evaluateEntryAttempt({ minutes: ctx.nowMinutes, config, isManualApproval: true, isClosedDay: ctx.isClosedDay })
        : null;

      await recordGatePassage({
        student,
        action: nextAction,
        method: 'manual_admin',
        isManualApproval: nextAction === 'entry',
        approvedBy: 'Görevli Öğretmen (Panel)',
        session: decision?.session || null,
        isLate: Boolean(decision?.isLate),
        sessionId: 'manual_admin',
        config
      });

      flash('success',
        nextAction === 'entry'
          ? `${student.name} — giriş yapıldı${decision?.isLate ? ' (geç giriş olarak işaretlendi)' : ''}.`
          : `${student.name} — çıkış yapıldı.`);
    } catch (err) {
      console.error('Geçiş kaydedilemedi:', err);
      // Hata: iyimser güncellemeyi geri al
      setStudentStatusMap(prev => ({ ...prev, [student.id]: currentStatus }));
      flash('error', 'Geçiş kaydedilemedi: ' + (err?.message || 'bilinmeyen hata'));
    } finally {
      setProcessingId(null);
    }
  };

  /** Geç giriş talebini onayla — öğrencinin telefonundaki ekran anında güncellenir. */
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

  /** Geç giriş talebini reddet — giriş kaydı oluşmaz. */
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
      (s.tc || '').includes(q)
    );
  }, [students, searchText]);

  const insideCount = useMemo(
    () => students.filter(s => studentStatusMap[s.id] === 'inside').length,
    [students, studentStatusMap]
  );

  if (loading) {
    return (
      <div className="w-full h-full flex-1 flex items-center justify-center bg-[#FAFAFA] dark:bg-[#0b1120] z-40">
        <Loader2 size={32} className="text-slate-600 dark:text-slate-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="w-full h-full flex-1 flex flex-col font-sans pb-2 md:pb-6 overflow-x-hidden">

      {/* Başlık */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-4 md:mb-6 shrink-0 gap-4 w-full">
        <div className="flex flex-col">
          <span className="text-[11px] md:text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wider">{currentDate}</span>
          <h1 className="text-[28px] md:text-[32px] font-semibold text-slate-900 dark:text-white tracking-tight leading-none">Geçiş Yönetimi</h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-[12.5px] font-semibold text-slate-500">
            <span className="flex items-center gap-1.5"><Sunrise size={14} className="text-emerald-500" />Sabah {config.morningEntryHour} <span className="text-slate-400">(+{config.morningGraceMinutes} dk)</span></span>
            <span className="flex items-center gap-1.5"><Clock size={14} className="text-blue-500" />Öğleden sonra {config.afternoonEntryHour} <span className="text-slate-400">(+{config.afternoonGraceMinutes} dk)</span></span>
            <span className="flex items-center gap-1.5"><Sunset size={14} className="text-indigo-500" />Çıkış {config.schoolExitHour}</span>
            <span className="flex items-center gap-1.5"><UserCheck size={14} className="text-emerald-500" />Kurum içinde: <strong className="text-slate-700 dark:text-slate-200">{insideCount}</strong></span>
          </div>
        </div>
        <div className="relative w-full sm:w-72">
          <Search size={16} className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-600 dark:text-slate-400" />
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="İsim, okul no veya TC ile ara..."
            className="pl-10 pr-4 py-2.5 w-full bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-white/10 rounded-lg text-[14px] text-slate-900 dark:text-white outline-none focus:border-slate-400 transition-colors"
          />
        </div>
      </div>

      {/* Bildirim */}
      {toast && (
        <div className={`mb-4 px-4 py-3 rounded-xl border text-[13.5px] font-semibold flex items-center gap-2.5 shrink-0 animate-in fade-in slide-in-from-top-2 ${
          toast.kind === 'success' ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900/50 text-emerald-700 dark:text-emerald-300'
          : toast.kind === 'error' ? 'bg-red-50 dark:bg-red-950/40 border-red-200 dark:border-red-900/50 text-red-700 dark:text-red-300'
          : 'bg-slate-50 dark:bg-slate-800/60 border-slate-200 dark:border-white/10 text-slate-700 dark:text-slate-300'
        }`}>
          {toast.kind === 'success' ? <CheckCircle2 size={16} /> : toast.kind === 'error' ? <XCircle size={16} /> : <AlertCircle size={16} />}
          {toast.text}
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/*  REHBERLİK ONAYI BEKLEYEN GEÇ GİRİŞLER                             */}
      {/* ------------------------------------------------------------------ */}
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
            <span className="hidden md:block text-[12px] text-red-600/80 dark:text-red-400/80 font-medium ml-1">
              Öğrenci Rehber Öğretmeniyle görüştüyse “Girişini Yap” butonuna basın.
            </span>
          </div>

          <div className="divide-y divide-red-200/70 dark:divide-red-900/40">
            {lateRequests.map(request => {
              const busy = processingId === request.studentId;
              return (
                <div key={request.id} className="flex flex-col sm:flex-row sm:items-center gap-3 px-4 md:px-6 py-3.5">
                  <img
                    src={request.studentPhoto || `https://ui-avatars.com/api/?name=${encodeURIComponent(request.studentName)}&background=fee2e2&color=b91c1c&size=100`}
                    alt={request.studentName}
                    className="w-10 h-10 min-w-[40px] rounded-full object-cover border-2 border-red-200 dark:border-red-900/60"
                  />
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
                      className="flex items-center justify-center gap-1.5 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[13px] font-bold transition-all active:scale-95 disabled:opacity-50 min-w-[124px]"
                    >
                      {busy ? <Loader2 size={14} className="animate-spin" /> : <><UserCheck size={14} /> Girişini Yap</>}
                    </button>
                    <button
                      onClick={() => handleRejectLate(request)}
                      disabled={busy}
                      className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-white dark:bg-[#0f172a] border border-slate-300 dark:border-white/10 text-slate-600 dark:text-slate-300 text-[13px] font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition-all disabled:opacity-50"
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

      {/* ------------------------------------------------------------------ */}
      {/*  ÖĞRENCİ LİSTESİ                                                   */}
      {/* ------------------------------------------------------------------ */}
      <div className="w-full flex-1 bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-white/10 rounded-xl flex flex-col overflow-hidden shadow-sm">
        <div className="flex-1 overflow-x-auto overflow-y-auto custom-scrollbar">
          <div className="min-w-[650px] flex flex-col h-full">

            <div className="flex items-center px-4 md:px-6 py-4 border-b border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-[#1e293b]/50 shrink-0 sticky top-0 z-10">
              <div className="flex-1 text-[12px] font-semibold text-slate-500 uppercase tracking-wider">Öğrenci</div>
              <div className="w-28 text-[12px] font-semibold text-slate-500 uppercase tracking-wider">Okul No</div>
              <div className="w-36 text-[12px] font-semibold text-slate-500 uppercase tracking-wider">Mevcut Konum</div>
              <div className="w-36 text-[12px] font-semibold text-slate-500 uppercase tracking-wider text-right">Aksiyon</div>
            </div>

            <div className="flex-1">
              {filteredStudents.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-slate-600 dark:text-slate-400">
                  <AlertCircle size={32} className="mb-2 opacity-50" />
                  <span className="text-[14px] font-medium">Kayıt bulunamadı.</span>
                </div>
              ) : (
                filteredStudents.map((student, idx) => {
                  const isInside = studentStatusMap[student.id] === 'inside';
                  const isProcessing = processingId === student.id;
                  const hasPendingRequest = lateRequests.some(r => r.studentId === student.id);

                  return (
                    <div
                      key={student.id}
                      className={`flex items-center px-4 md:px-6 py-3 border-b border-slate-100 dark:border-white/5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 ${
                        idx === filteredStudents.length - 1 ? 'border-none' : ''
                      } ${hasPendingRequest ? 'bg-red-50/60 dark:bg-red-950/20' : ''}`}
                    >
                      <div className="flex-1 flex items-center gap-3 min-w-0">
                        <img
                          src={student.profileImage}
                          alt={student.name}
                          className="w-8 h-8 min-w-[32px] min-h-[32px] shrink-0 rounded-full object-cover border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#1e293b]"
                        />
                        <span className="text-[13px] md:text-[14px] font-medium text-slate-800 dark:text-slate-200 truncate">{student.name}</span>
                        {hasPendingRequest && (
                          <span className="px-2 py-0.5 rounded-md bg-red-100 dark:bg-red-950/60 text-red-700 dark:text-red-300 text-[10px] font-extrabold uppercase tracking-wider shrink-0">
                            Onay Bekliyor
                          </span>
                        )}
                      </div>

                      <div className="w-28 text-[12px] md:text-[13px] text-slate-600 dark:text-slate-400 font-medium">
                        {student.schoolNumber || '-'}
                      </div>

                      <div className="w-36 flex items-center shrink-0">
                        <div className={`px-2 py-1 rounded text-[11px] md:text-[12px] font-semibold flex items-center gap-1.5 border ${
                          isInside
                            ? 'border-emerald-200 dark:border-emerald-900/60 text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40'
                            : 'border-amber-200 dark:border-amber-900/60 text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40'
                        }`}>
                          {isInside ? <DoorClosed size={12} /> : <DoorOpen size={12} />}
                          {isInside ? 'Kurum İçinde' : 'Kurum Dışında'}
                        </div>
                      </div>

                      <div className="w-36 flex justify-end shrink-0">
                        <button
                          onClick={() => handleAction(student)}
                          disabled={isProcessing}
                          className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border text-[12px] md:text-[13px] font-semibold transition-all w-28 ${
                            isProcessing
                              ? 'bg-slate-50 dark:bg-[#1e293b] border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400 cursor-not-allowed'
                              : 'bg-white dark:bg-[#0f172a] border-slate-300 dark:border-white/10 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#1e293b] hover:border-slate-400 active:scale-95'
                          }`}
                        >
                          {isProcessing ? <Loader2 size={14} className="animate-spin" /> : (isInside ? 'Çıkış Yap' : 'Giriş Yap')}
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
