import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Calendar, Download, Printer, Search, Users, UserX, UserCheck, 
  AlertCircle, RefreshCcw, Filter, ChevronDown, FileText, CheckCircle2, 
  Clock, Timer, Activity, Sparkles, ShieldCheck, DoorOpen, User, Sun, Moon
} from 'lucide-react';
import { db, rtdb } from '../services/firebaseConfig';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { ref, onValue } from 'firebase/database';
import useAttendanceConfig from '../hooks/useAttendanceConfig';
import {
  ABSENCE_STATUS,
  evaluateStudentDay,
  normalizeScanRecord,
  sortAndDedupeScans,
  getDateKeyInTimeZone,
  getMinutesInTimeZone,
  isClosedDay as isClosedDayFn,
  getAttendanceWindows,
  sumAbsenceWeight,
  formatDayCount
} from '../services/attendanceRules';

const DailyAbsenceReportView = () => {
  const { config } = useAttendanceConfig();

  const [selectedDate, setSelectedDate] = useState(() => getDateKeyInTimeZone(new Date(), 'Europe/Istanbul'));
  const [allStudents, setAllStudents] = useState([]);
  const [rtdbLogs, setRtdbLogs] = useState({});
  const [firestoreLogs, setFirestoreLogs] = useState({});
  const [manualAttendance, setManualAttendance] = useState({});
  const [loading, setLoading] = useState(true);
  const [searchText, setSearchText] = useState('');
  const [selectedClassFilter, setSelectedClassFilter] = useState('all');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState('all');

  const todayKey = useMemo(() => getDateKeyInTimeZone(new Date(), config.timeZone || 'Europe/Istanbul'), [config.timeZone]);
  const isToday = selectedDate === todayKey;

  // 1. Canlı Öğrenci Listesi Dinleyicisi
  useEffect(() => {
    setLoading(true);
    const usersCol = collection(db, 'users');
    const unsubUsers = onSnapshot(usersCol, (snap) => {
      const studentList = [];
      snap.forEach(d => {
        const data = d.data();
        const role = (data.role || '').toLowerCase();
        if (role === 'student' || role === 'öğrenci') {
          const name = data.full_name || data.fullName || data.name || data.displayName || 'İsimsiz Öğrenci';
          const profileImage = data.profile_image || data.profileImageUrl || null;
          const tc = data.tc_kimlik || data.tcKimlik || data.tc || '';
          const schoolNumber = data.school_number || data.schoolNumber || data.no || '-';
          const classGrade = (data.class_id || data.classId || data.grade || '12').toString().replace(/[^0-9]/g, '') || '12';
          const branch = data.branch || `${classGrade}/${data.section || 'A'}`;

          studentList.push({
            id: d.id,
            name,
            tc,
            schoolNumber,
            classGrade,
            branch,
            profileImage
          });
        }
      });
      studentList.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
      setAllStudents(studentList);
      setLoading(false);
    }, (err) => {
      console.error("Öğrenci listesi dinleme hatası:", err);
      setLoading(false);
    });

    return () => unsubUsers();
  }, []);

  // 2. RTDB Logları (Seçili Güne Göre)
  useEffect(() => {
    const rtdbPath = ref(rtdb, `qr_system/attendance_logs/${selectedDate}`);
    const unsubRtdb = onValue(rtdbPath, (snapshot) => {
      setRtdbLogs(snapshot.exists() ? snapshot.val() : {});
    });
    return () => unsubRtdb();
  }, [selectedDate]);

  // 3. Firestore attendance_logs ve attendance koleksiyonları
  useEffect(() => {
    const fsAttLogsQuery = query(collection(db, 'attendance_logs'), where('date', '==', selectedDate));
    const unsubFsLogs = onSnapshot(fsAttLogsQuery, (snap) => {
      const logs = {};
      snap.forEach(d => {
        const data = d.data();
        if (data.studentId) {
          if (!logs[data.studentId]) logs[data.studentId] = [];
          logs[data.studentId].push({ ...data, id: d.id });
        }
      });
      setFirestoreLogs(logs);
    }, (err) => console.warn('attendance_logs hatası:', err));

    const fsManualQuery = collection(db, 'attendance');
    const unsubFsManual = onSnapshot(fsManualQuery, (snap) => {
      const manuals = {};
      snap.forEach(d => {
        const data = d.data();
        let rDate = null;
        if (data.date) {
          rDate = data.date.toDate
            ? getDateKeyInTimeZone(data.date.toDate(), 'Europe/Istanbul')
            : (typeof data.date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(data.date)
              ? data.date.slice(0, 10)
              : getDateKeyInTimeZone(new Date(data.date), 'Europe/Istanbul'));
        }
        if (rDate === selectedDate && data.studentId) {
          if (!manuals[data.studentId]) manuals[data.studentId] = [];
          manuals[data.studentId].push({ ...data, id: d.id });
        }
      });
      setManualAttendance(manuals);
    }, (err) => console.warn('attendance hatası:', err));

    return () => {
      try { unsubFsLogs(); } catch(e) {}
      try { unsubFsManual(); } catch(e) {}
    };
  }, [selectedDate]);

  // 4. Geçiş kayıtlarını birleştir ve değerlendir
  const analyzedStudents = useMemo(() => {
    const isPast = selectedDate < todayKey;
    const nowMinutes = isPast ? 1440 : getMinutesInTimeZone(new Date(), config.timeZone || 'Europe/Istanbul');
    const isClosed = isClosedDayFn(new Date(selectedDate), config);

    return allStudents.map(student => {
      const rtdbEntries = Object.values(rtdbLogs).filter(l => l.studentId === student.id || l.userId === student.id);
      const fsEntries = firestoreLogs[student.id] || [];
      const allScansRaw = [...rtdbEntries, ...fsEntries].map(normalizeScanRecord).filter(Boolean);
      const scans = sortAndDedupeScans(allScansRaw);
      const manualRecords = manualAttendance[student.id] || [];

      // İzinli / Raporlu kontrolü
      const excuse = manualRecords.find(r => 
        r.status === 'excused' || 
        String(r.courseName || '').includes('Raporlu') || 
        String(r.courseName || '').includes('İzinli')
      );

      if (excuse) {
        return {
          ...student,
          status: 'excused',
          statusLabel: 'İzinli / Raporlu',
          badgeClass: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-900/50',
          morningStatus: 'İzinli',
          afternoonStatus: 'İzinli',
          detailNote: excuse.courseName || 'İdare Tarafından İşlendi'
        };
      }

      const evaluation = evaluateStudentDay({
        scans,
        nowMinutes,
        config,
        isClosedDay: isClosed
      });

      const manualWeight = sumAbsenceWeight(manualRecords);
      const totalWeight = Math.max(manualWeight, evaluation.absenceWeight);

      let status = 'present';
      let statusLabel = 'Tam Gün Mevcut';
      let badgeClass = 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/50';

      if (isClosed) {
        status = 'closed';
        statusLabel = 'Kurum Kapalı';
        badgeClass = 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-800 dark:text-slate-400';
      } else if (totalWeight >= 1) {
        status = 'absent_full';
        statusLabel = 'Tam Gün Devamsız';
        badgeClass = 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-900/50';
      } else if (totalWeight === 0.5) {
        status = 'absent_half';
        statusLabel = 'Yarım Gün Devamsız';
        badgeClass = 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/50';
      } else if (evaluation.isLate) {
        status = 'late';
        statusLabel = 'Mevcut (Geç Giriş)';
        badgeClass = 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-950/40 dark:text-yellow-300 dark:border-yellow-900/50';
      }

      const morningEntry = evaluation.morning?.entryTime;
      const morningText = morningEntry ? `Giriş: ${morningEntry}` : (evaluation.morning?.present ? 'Mevcut' : 'Devamsız');
      const afternoonEntry = evaluation.afternoon?.entryTime;
      const afternoonText = afternoonEntry ? `Giriş: ${afternoonEntry}` : (evaluation.afternoon?.present ? 'Mevcut' : 'Devamsız');

      return {
        ...student,
        status,
        statusLabel,
        badgeClass,
        morningStatus: morningText,
        afternoonStatus: afternoonText,
        detailNote: evaluation.detailNote || (scans.length > 0 ? `${scans.length} Turnike Geçişi` : 'Kayıt bulunamadı'),
        isLate: evaluation.isLate,
        isPresent: evaluation.isPresentToday
      };
    });
  }, [allStudents, rtdbLogs, firestoreLogs, manualAttendance, selectedDate, todayKey, config]);

  // Filtreleme
  const filteredStudents = useMemo(() => {
    return analyzedStudents.filter(student => {
      // Sınıf filtresi
      if (selectedClassFilter !== 'all' && student.classGrade !== selectedClassFilter) {
        return false;
      }
      // Durum filtresi
      if (selectedStatusFilter === 'absent' && !(student.status === 'absent_full' || student.status === 'absent_half')) {
        return false;
      }
      if (selectedStatusFilter === 'present' && !(student.status === 'present' || student.status === 'late')) {
        return false;
      }
      if (selectedStatusFilter === 'excused' && student.status !== 'excused') {
        return false;
      }
      // Metin araması
      if (searchText.trim()) {
        const q = searchText.trim().toLowerCase();
        return (
          student.name.toLowerCase().includes(q) ||
          student.schoolNumber.includes(q) ||
          student.tc.includes(q) ||
          student.branch.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [analyzedStudents, selectedClassFilter, selectedStatusFilter, searchText]);

  // İstatistikler
  const totalCount = allStudents.length;
  const presentCount = analyzedStudents.filter(s => s.status === 'present' || s.status === 'late').length;
  const fullAbsentCount = analyzedStudents.filter(s => s.status === 'absent_full').length;
  const halfAbsentCount = analyzedStudents.filter(s => s.status === 'absent_half').length;
  const excusedCount = analyzedStudents.filter(s => s.status === 'excused').length;
  const attendanceRate = totalCount > 0 ? Math.round((presentCount / totalCount) * 100) : 100;

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full w-full bg-[#FAFAFA] dark:bg-[#0b1120] p-12">
        <Activity size={32} className="text-slate-600 dark:text-slate-400 mb-4 animate-spin" strokeWidth={1.5} />
        <span className="text-xs font-semibold text-slate-500">Günlük ders raporu hazırlanıyor...</span>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex-1 flex flex-col font-sans gap-5 pb-6 overflow-x-hidden">
      
      {/* ÜST BAŞLIK & TARİH SEÇİCİ & YAZDIR */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4 w-full shrink-0">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] md:text-[12px] font-bold text-slate-500 uppercase tracking-wider">
              {new Date(selectedDate).toLocaleDateString('tr-TR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </span>
            {isToday && (
              <span className="px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 text-[10.5px] font-bold border border-emerald-200 dark:border-emerald-900/40">
                Canlı Gün
              </span>
            )}
          </div>
          <h1 className="text-[26px] md:text-[32px] font-extrabold text-slate-900 dark:text-white tracking-tight leading-none">
            Günlük Ders & Devamsızlık Raporu
          </h1>
        </div>

        {/* Aksiyon Butonları */}
        <div className="flex items-center gap-2.5 w-full sm:w-auto">
          <div className="relative flex-1 sm:flex-none">
            <input 
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-3.5 py-2 rounded-xl bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-white/10 text-[13px] font-bold text-slate-800 dark:text-slate-200 outline-none shadow-xs focus:border-indigo-500 cursor-pointer"
            />
          </div>

          <button 
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[13px] font-bold shadow-xs hover:opacity-90 active:scale-95 transition-all shrink-0"
          >
            <Printer size={15} />
            <span>Yazdır</span>
          </button>
        </div>
      </div>

      {/* 4 ÖZET İSTATİSTİK KARTI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5 w-full shrink-0">
        
        {/* Toplam Öğrenci */}
        <div className="bg-white dark:bg-[#0f172a] p-4.5 rounded-2xl border border-slate-200/80 dark:border-white/10 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11.5px] font-bold text-slate-400 uppercase tracking-wider block">Toplam Öğrenci</span>
            <div className="text-[26px] font-extrabold text-slate-900 dark:text-white mt-0.5">{totalCount}</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-slate-50 dark:bg-[#1e293b] text-slate-600 dark:text-slate-300 flex items-center justify-center border border-slate-100 dark:border-white/5">
            <Users size={18} />
          </div>
        </div>

        {/* Mevcut / Katılım */}
        <div className="bg-white dark:bg-[#0f172a] p-4.5 rounded-2xl border border-slate-200/80 dark:border-white/10 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11.5px] font-bold text-slate-400 uppercase tracking-wider block">Katılım Oranı</span>
            <div className="text-[26px] font-extrabold text-emerald-600 dark:text-emerald-400 mt-0.5">%{attendanceRate}</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 flex items-center justify-center border border-emerald-100 dark:border-emerald-900/30">
            <UserCheck size={18} />
          </div>
        </div>

        {/* Devamsızlar */}
        <div className="bg-white dark:bg-[#0f172a] p-4.5 rounded-2xl border border-slate-200/80 dark:border-white/10 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11.5px] font-bold text-slate-400 uppercase tracking-wider block">Devamsızlar</span>
            <div className="text-[26px] font-extrabold text-rose-600 dark:text-rose-400 mt-0.5">
              {fullAbsentCount + halfAbsentCount}
              <span className="text-xs text-slate-400 font-semibold ml-1.5 font-sans">
                ({fullAbsentCount} Tam / {halfAbsentCount} Yarım)
              </span>
            </div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-rose-50 dark:bg-rose-950/40 text-rose-600 flex items-center justify-center border border-rose-100 dark:border-rose-900/30">
            <UserX size={18} />
          </div>
        </div>

        {/* İzinli / Raporlu */}
        <div className="bg-white dark:bg-[#0f172a] p-4.5 rounded-2xl border border-slate-200/80 dark:border-white/10 shadow-xs flex items-center justify-between">
          <div>
            <span className="text-[11.5px] font-bold text-slate-400 uppercase tracking-wider block">İzinli / Raporlu</span>
            <div className="text-[26px] font-extrabold text-blue-600 dark:text-blue-400 mt-0.5">{excusedCount}</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-950/40 text-blue-600 flex items-center justify-center border border-blue-100 dark:border-blue-900/30">
            <ShieldCheck size={18} />
          </div>
        </div>

      </div>

      {/* FİLTRE VE ARAMA ÇUBUĞU */}
      <div className="bg-white dark:bg-[#0f172a] p-3.5 rounded-2xl border border-slate-200/80 dark:border-white/10 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 shrink-0">
        
        {/* Arama Inputu */}
        <div className="relative flex-1 max-w-md">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input 
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="İsim, şube (12/A), okul no veya TC ile filtrele..."
            className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-[#1e293b] border border-slate-200/60 dark:border-white/10 rounded-xl text-[13px] text-slate-800 dark:text-slate-200 outline-none focus:border-indigo-500 transition-colors"
          />
        </div>

        {/* Filtre Butonları */}
        <div className="flex flex-wrap items-center gap-2">
          
          {/* Sınıf Filtresi */}
          <div className="flex items-center p-1 bg-slate-100 dark:bg-[#1e293b] rounded-xl border border-slate-200/60 dark:border-white/10 text-xs font-bold">
            {['all', '12', '11', '10', '9'].map(cls => (
              <button
                key={cls}
                onClick={() => setSelectedClassFilter(cls)}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  selectedClassFilter === cls 
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs' 
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
                }`}
              >
                {cls === 'all' ? 'Tümü' : `${cls}. Sınıf`}
              </button>
            ))}
          </div>

          {/* Durum Filtresi */}
          <div className="flex items-center p-1 bg-slate-100 dark:bg-[#1e293b] rounded-xl border border-slate-200/60 dark:border-white/10 text-xs font-bold">
            {[
              { id: 'all', label: 'Tüm Liste' },
              { id: 'absent', label: 'Devamsızlar' },
              { id: 'present', label: 'Mevcutlar' },
              { id: 'excused', label: 'İzinli' }
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setSelectedStatusFilter(tab.id)}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  selectedStatusFilter === tab.id 
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs' 
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

        </div>

      </div>

      {/* RAPOR TABLOSU */}
      <div className="w-full flex-1 bg-white dark:bg-[#0f172a] border border-slate-200/80 dark:border-white/10 rounded-2xl flex flex-col overflow-hidden shadow-xs">
        <div className="flex-1 overflow-x-auto overflow-y-auto custom-scrollbar">
          <div className="min-w-[800px] flex flex-col h-full">

            {/* Tablo Başlıkları */}
            <div className="flex items-center px-6 py-3.5 border-b border-slate-200/80 dark:border-white/10 bg-slate-50/70 dark:bg-[#1e293b]/50 shrink-0 sticky top-0 z-10 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              <div className="flex-1">Öğrenci Bilgisi</div>
              <div className="w-24">Sınıf / Şube</div>
              <div className="w-24">Okul No</div>
              <div className="w-32">Sabah Seansı</div>
              <div className="w-32">Öğleden Sonra</div>
              <div className="w-36 text-right">Günlük Sonuç</div>
            </div>

            {/* Tablo Gövdesi */}
            <div className="flex-1 divide-y divide-slate-100 dark:divide-white/5">
              {filteredStudents.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-slate-400">
                  <FileText size={32} className="mb-2 opacity-40" />
                  <span className="text-[13.5px] font-bold text-slate-600 dark:text-slate-300">Kayıt Bulunamadı</span>
                  <p className="text-xs text-slate-400 mt-0.5">Seçilen filtre veya tarihe uygun öğrenci kaydı yok.</p>
                </div>
              ) : (
                filteredStudents.map(student => (
                  <div 
                    key={student.id} 
                    className="flex items-center px-6 py-3 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors"
                  >
                    {/* Öğrenci Bilgisi + Avatar */}
                    <div className="flex-1 flex items-center gap-3 min-w-0 pr-3">
                      {student.profileImage ? (
                        <img 
                          src={student.profileImage}
                          alt={student.name}
                          referrerPolicy="no-referrer"
                          crossOrigin="anonymous"
                          className="w-9 h-9 rounded-full object-cover border border-slate-200 dark:border-white/10 shrink-0"
                          onError={(e) => {
                            e.target.style.display = 'none';
                            if (e.target.nextSibling) e.target.nextSibling.style.display = 'flex';
                          }}
                        />
                      ) : null}
                      <div className={`w-9 h-9 rounded-full bg-slate-50 dark:bg-[#1e293b] text-slate-600 dark:text-slate-400 items-center justify-center border border-slate-200 dark:border-white/10 shadow-xs shrink-0 ${student.profileImage ? 'hidden' : 'flex'}`}>
                        <User size={16} />
                      </div>

                      <div className="flex flex-col min-w-0">
                        <span className="text-[13.5px] font-bold text-slate-900 dark:text-white truncate">{student.name}</span>
                        <span className="text-[11px] font-mono text-slate-400 truncate">{student.tc || ''}</span>
                      </div>
                    </div>

                    {/* Sınıf / Şube */}
                    <div className="w-24">
                      <span className="text-[12px] font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-[#1e293b] px-2 py-0.5 rounded-md border border-slate-200 dark:border-white/10">
                        {student.branch || '—'}
                      </span>
                    </div>

                    {/* Okul No */}
                    <div className="w-24 text-[12.5px] font-semibold text-slate-600 dark:text-slate-400">
                      {student.schoolNumber || '—'}
                    </div>

                    {/* Sabah Seansı */}
                    <div className="w-32 text-[12px] font-medium text-slate-600 dark:text-slate-300">
                      {student.morningStatus}
                    </div>

                    {/* Öğleden Sonra */}
                    <div className="w-32 text-[12px] font-medium text-slate-600 dark:text-slate-300">
                      {student.afternoonStatus}
                    </div>

                    {/* Günlük Sonuç Rozeti */}
                    <div className="w-36 flex justify-end">
                      <span className={`px-2.5 py-1 rounded-xl text-[11.5px] font-bold border ${student.badgeClass}`}>
                        {student.statusLabel}
                      </span>
                    </div>

                  </div>
                ))
              )}
            </div>

          </div>
        </div>
      </div>

    </div>
  );
};

export default DailyAbsenceReportView;
