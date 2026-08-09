import React, { useState, useEffect } from 'react';
import { CalendarX2, UserPlus, Trash2, AlertTriangle, UserCheck, Clock, FileWarning, Search, Activity, CalendarDays, CheckCircle2, ChevronRight, X } from 'lucide-react';
import { firebaseService } from '../services/firebase';
import { academicService } from '../services/academicService';
import StudentSearch from '../components/StudentSearch';
import useUnsavedChanges from '../hooks/useUnsavedChanges';
import UnsavedBanner from '../components/UnsavedBanner';

const AttendanceAdminView = () => {
  const [viewMode, setViewMode] = useState('student'); // 'student' | 'teacher' | 'personnel'
  const [allUsers, setAllUsers] = useState([]);
  const [users, setUsers] = useState([]);
  
  const [studentId, setStudentId] = useState(null);
  const [studentName, setStudentName] = useState(null);
  const [loading, setLoading] = useState(true);

  const [course, setCourse] = useState('');
  const [period, setPeriod] = useState(1);
  const [isLate, setIsLate] = useState(false);
  const [isExcused, setIsExcused] = useState(false);
  const [isSaved, setIsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [showReportModal, setShowReportModal] = useState(false);

  const { markDirty, markClean, isDirty } = useUnsavedChanges();

  const [pastAttendance, setPastAttendance] = useState([]);
  const [gateLogs, setGateLogs] = useState([]);
  const [loadingPast, setLoadingPast] = useState(false);

  useEffect(() => {
    const init = async () => {
      const data = await firebaseService.fetchAllUsers();
      setAllUsers(data);
      setLoading(false);
    };
    init();
  }, []);
  
  useEffect(() => {
      const filtered = allUsers.filter(u => {
        const role = u.fields?.role?.stringValue?.toLowerCase() || '';
        const subRole = u.fields?.sub_role?.stringValue?.toLowerCase() || '';
        if (viewMode === 'student') return role === 'student' || role === 'öğrenci';
        if (viewMode === 'teacher') return role === 'teacher' || role === 'öğretmen';
        return role === 'personel' || subRole === 'personnel';
      });
      setUsers(filtered);
      setStudentId(null);
      setStudentName(null);
      setPastAttendance([]);
      setGateLogs([]);
  }, [allUsers, viewMode]);

  const loadPastAttendance = async (sid) => {
    setLoadingPast(true);
    const records = await academicService.fetchStudentAttendance(sid);
    
    // Sort records descending by date
    records.sort((a, b) => {
        const timeA = a.fields?.date?.timestampValue ? new Date(a.fields.date.timestampValue).getTime() : 0;
        const timeB = b.fields?.date?.timestampValue ? new Date(b.fields.date.timestampValue).getTime() : 0;
        return timeB - timeA;
    });

    setPastAttendance(records);
    if (viewMode === 'personnel' || viewMode === 'teacher') {
        const logs = await academicService.fetchGateLogs(sid);
        setGateLogs(logs);
    } else {
        setGateLogs([]);
    }
    setLoadingPast(false);
  };

  useEffect(() => {
    if (studentId) {
      loadPastAttendance(studentId);
    }
  }, [studentId, viewMode]);

  const handleSaveFullDay = async () => {
    if (!studentId) return;
    setIsSaving(true);
    const success = await academicService.saveAttendance(studentId, "Tam Gün Yok", -1, false, false);
    if (success) {
      setIsSaved(true);
      markClean();
      loadPastAttendance(studentId);
      setTimeout(() => setIsSaved(false), 2500);
    }
    setIsSaving(false);
  };

  const handleSaveHalfDay = async () => {
    if (!studentId) return;
    setIsSaving(true);
    const success = await academicService.saveAttendance(studentId, "Yarım Gün Yok", -1, false, false);
    if (success) {
      setIsSaved(true);
      markClean();
      loadPastAttendance(studentId);
      setTimeout(() => setIsSaved(false), 2500);
    }
    setIsSaving(false);
  };

  const handleSavePartial = async (e) => {
    e.preventDefault();
    if (!studentId || !course) return;
    setIsSaving(true);
    const success = await academicService.saveAttendance(studentId, course, parseInt(period), isLate, isExcused);
    if (success) {
      setIsSaved(true);
      markClean();
      setCourse('');
      setPeriod(1);
      setIsLate(false);
      setIsExcused(false);
      loadPastAttendance(studentId);
      setTimeout(() => setIsSaved(false), 2500);
    }
    setIsSaving(false);
  };

  const handleDelete = async (docId) => {
    setDeleteConfirm(docId);
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    await academicService.deleteDocument('attendance', deleteConfirm);
    loadPastAttendance(studentId);
    setDeleteConfirm(null);
  };

  const processMedicalReport = async (recordId) => {
    setIsSaving(true);
    const success = await academicService.updateAttendanceReportStatus(recordId);
    if (success) {
        setShowReportModal(false);
        loadPastAttendance(studentId);
    }
    setIsSaving(false);
  };

  const getDisplayStatus = (statusStr, cName) => {
    if (cName && cName.includes("Raporlu")) return <span className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-[12px] font-semibold">Raporlu</span>;
    if (cName && cName.includes("Tam Gün")) return <span className="px-3 py-1 bg-red-50 text-red-600 rounded-full text-[12px] font-semibold">Tam Gün Özürsüz</span>;
    if (cName && cName.includes("Yarım Gün")) return <span className="px-3 py-1 bg-orange-50 text-orange-600 rounded-full text-[12px] font-semibold">Yarım Gün Özürsüz</span>;
    if (statusStr === 'excused') return <span className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-[12px] font-semibold">İzinli / Raporlu</span>;
    if (statusStr === 'late') return <span className="px-3 py-1 bg-orange-50 text-orange-600 rounded-full text-[12px] font-semibold">Geç Kaldı</span>;
    return <span className="px-3 py-1 bg-red-50 text-red-600 rounded-full text-[12px] font-semibold">Yok</span>;
  };

  const calculateAbsenceCount = (records, type) => {
    return records.reduce((total, r) => {
      const status = r.fields?.status?.stringValue;
      const cName = r.fields?.courseName?.stringValue || r.fields?.course_name?.stringValue || '';
      const isRaporlu = status === 'excused' || cName.includes('Raporlu');
      
      if (type === 'ozursuz' && !isRaporlu) {
        if (cName.includes('Yarım Gün')) return total + 0.5;
        return total + 1;
      }
      if (type === 'raporlu' && isRaporlu) {
        if (cName.includes('Yarım Gün')) return total + 0.5;
        return total + 1;
      }
      return total;
    }, 0).toString().replace('.', ',');
  };

  // Sadece Rapor eklenebilecek "Özürsüz" geçmiş devamsızlık günlerini filtrele
  const absentDays = pastAttendance.filter(r => {
      const status = r.fields?.status?.stringValue;
      const cName = r.fields?.courseName?.stringValue || r.fields?.course_name?.stringValue || '';
      return status !== 'excused' && !cName.includes('Raporlu');
  });

  return (
    <div className="w-full h-full flex-1 flex flex-col bg-white dark:bg-[#0f172a] rounded-[24px] shadow-sm border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white font-sans selection:bg-blue-100 overflow-hidden">
      
      {/* HEADER */}
      <div className="px-10 py-8 bg-white dark:bg-[#0f172a] flex flex-col md:flex-row md:items-end justify-between gap-6 shrink-0 border-b border-slate-200 dark:border-white/10">
        <div>
          <h1 className="text-[32px] font-bold tracking-tight text-slate-900 dark:text-white">Devamsızlık</h1>
          <p className="text-[15px] font-medium text-slate-600 dark:text-slate-400 mt-1">Sistemdeki tüm geçiş ve yoklama kayıtlarını inceleyin.</p>
        </div>
        
        {/* Apple Style Segmented Control */}
        <div className="flex p-1 bg-slate-50 dark:bg-[#1e293b] rounded-[10px]">
          {['student', 'teacher', 'personnel'].map(mode => (
            <button 
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-6 py-2 rounded-[7px] text-[13px] font-medium transition-all duration-200 ease-out ${
                viewMode === mode 
                ? 'bg-white dark:bg-[#0f172a] text-slate-900 dark:text-white shadow-md' 
                : 'text-slate-600 dark:text-slate-400 hover:text-[#0f172a]'
              }`}
            >
              {mode === 'student' ? 'Öğrenci' : mode === 'teacher' ? 'Öğretmen' : 'Personel'}
            </button>
          ))}
        </div>
      </div>

      {/* MAIN LAYOUT */}
      <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
        
        {/* SIDEBAR */}
        <div className={`${studentId ? 'hidden md:flex' : 'flex'} w-full md:w-[320px] shrink-0 border-b md:border-b-0 md:border-r border-slate-200 dark:border-white/10 bg-white dark:bg-[#0f172a] flex-col`}>
          <div className="p-4 border-b border-slate-200 dark:border-white/10">
            <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider pl-2">
              Kullanıcılar
            </div>
          </div>
          <div className="flex-1 overflow-y-auto px-2 py-2">
            {loading ? (
              <div className="flex justify-center py-10">
                <div className="w-5 h-5 rounded-full border-2 border-gray-300 border-t-[#1D1D1F] animate-spin"></div>
              </div>
            ) : (
              <StudentSearch 
                users={users} 
                selectedId={studentId} 
                onSelect={(id, name) => { setStudentId(id); setStudentName(name); }} 
                viewMode={viewMode}
              />
            )}
          </div>
        </div>

        {/* CONTENT */}
        <div className={`${studentId ? 'flex' : 'hidden md:flex'} flex-1 bg-white dark:bg-[#0f172a] flex-col overflow-hidden relative`}>
          {!studentId ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-600 dark:text-slate-400">
              <CalendarX2 size={48} strokeWidth={1} className="mb-4 text-slate-600" />
              <p className="text-[15px] font-medium">İşlem yapmak için listeden seçim yapın.</p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto pb-20">
              
              {/* Profile Header */}
              <div className="px-6 md:px-12 py-8 md:py-10 border-b border-slate-200 dark:border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
                <div className="flex items-center gap-3">
                  <button onClick={() => setStudentId(null)} className="md:hidden p-2 -ml-2 text-slate-500 hover:bg-slate-200 rounded-full transition-colors">
                    <span className="text-[20px] leading-none block rotate-180">&rsaquo;</span>
                  </button>
                  <div>
                    <h2 className="text-[24px] md:text-[28px] font-semibold text-slate-900 dark:text-white tracking-tight">{studentName}</h2>
                    <div className="text-[14px] text-slate-600 dark:text-slate-400 mt-1">{viewMode === 'student' ? 'Öğrenci' : viewMode === 'teacher' ? 'Öğretmen' : 'Personel'} Profili</div>
                  </div>
                </div>
                
                {/* Minimal Stats */}
                <div className="flex gap-4">
                  <div className="px-5 py-3 rounded-2xl bg-slate-50 dark:bg-[#1e293b] flex flex-col items-center min-w-[100px]">
                    <span className="text-[20px] font-medium text-slate-900 dark:text-white">
                      {calculateAbsenceCount(pastAttendance, 'ozursuz')}
                    </span>
                    <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">Özürsüz</span>
                  </div>
                  <div className="px-5 py-3 rounded-2xl bg-slate-50 dark:bg-[#1e293b] flex flex-col items-center min-w-[100px]">
                    <span className="text-[20px] font-medium text-slate-900 dark:text-white">
                      {calculateAbsenceCount(pastAttendance, 'raporlu')}
                    </span>
                    <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">Raporlu</span>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="px-12 py-8">
                <h3 className="text-[14px] font-semibold text-slate-900 dark:text-white mb-4">Hızlı İşlemler</h3>
                <div className="flex flex-wrap gap-4">
                  <button 
                    onClick={handleSaveFullDay}
                    disabled={isSaving}
                    className="flex items-center gap-3 px-6 py-3.5 bg-[#FFF2F2] hover:bg-[#FFE5E5] text-[#FF3B30] rounded-2xl transition-colors font-medium text-[14px]"
                  >
                    <AlertTriangle size={16} />
                    Tam Gün Yok Yaz
                  </button>
                  <button 
                    onClick={handleSaveHalfDay}
                    disabled={isSaving}
                    className="flex items-center gap-3 px-6 py-3.5 bg-[#FFF4E5] hover:bg-[#FFE5C2] text-[#FF9500] rounded-2xl transition-colors font-medium text-[14px]"
                  >
                    <Clock size={16} />
                    Yarım Gün Yok Yaz
                  </button>
                  <button 
                    onClick={() => setShowReportModal(true)}
                    className="flex items-center gap-3 px-6 py-3.5 bg-[#F2F5FF] hover:bg-[#E5EBFF] text-[#007AFF] rounded-2xl transition-colors font-medium text-[14px]"
                  >
                    <FileWarning size={16} />
                    Rapor / İzin İşle
                  </button>
                </div>
              </div>

              {/* Past Records */}
              <div className="px-12 py-4">
                <h3 className="text-[14px] font-semibold text-slate-900 dark:text-white mb-6">Geçmiş Kayıtlar</h3>
                
                {loadingPast ? (
                  <div className="py-10 text-center text-slate-600 dark:text-slate-400 text-[14px]">Yükleniyor...</div>
                ) : (pastAttendance.length === 0 && gateLogs.length === 0) ? (
                  <div className="py-10 text-center text-slate-600 dark:text-slate-400 text-[14px]">Kayıt bulunamadı.</div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {pastAttendance.map(record => {
                      const recordId = record.name ? record.name.split('/').pop() : record.id;
                      const rDate = record.fields?.date?.timestampValue ? new Date(record.fields.date.timestampValue).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Tarih Yok';
                      const cName = record.fields?.courseName?.stringValue || record.fields?.course_name?.stringValue || '';
                      const statusStr = record.fields?.status?.stringValue;

                      return (
                        <div key={recordId} className="group flex items-center justify-between p-4 rounded-2xl border border-slate-200 dark:border-white/10 hover:border-slate-200 dark:border-white/10 hover:shadow-sm bg-white dark:bg-[#0f172a] transition-all">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-full bg-slate-50 dark:bg-[#1e293b] flex items-center justify-center text-slate-600 dark:text-slate-400">
                              <CalendarDays size={16} />
                            </div>
                            <div>
                              <div className="font-medium text-slate-900 dark:text-white text-[14px]">{cName}</div>
                              <div className="text-[12px] text-slate-600 dark:text-slate-400 mt-0.5">{rDate}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            {getDisplayStatus(statusStr, cName)}
                            <button 
                              onClick={() => handleDelete(recordId)}
                              className="text-slate-600 dark:text-slate-400 hover:text-[#FF3B30] opacity-0 group-hover:opacity-100 transition-opacity p-2"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    {(viewMode === 'personnel' || viewMode === 'teacher') && gateLogs.map(log => {
                      const rDate = log.timestamp?.seconds ? new Date(log.timestamp.seconds * 1000).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }) : log.date || 'Tarih Yok';
                      const timeStr = log.timestamp?.seconds ? new Date(log.timestamp.seconds * 1000).toLocaleTimeString('tr-TR', { hour: '2-digit', minute:'2-digit' }) : '';
                      const isEntry = log.action === 'entry';
                      
                      return (
                        <div key={log.id} className="flex items-center justify-between p-4 rounded-2xl border border-slate-200 dark:border-white/10 bg-white dark:bg-[#0f172a] hover:shadow-sm transition-all">
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-full bg-slate-50 dark:bg-[#1e293b] flex items-center justify-center">
                              <Activity size={16} className={isEntry ? 'text-[#34C759]' : 'text-[#FF9500]'} />
                            </div>
                            <div>
                              <div className="font-medium text-slate-900 dark:text-white text-[14px]">QR Geçiş ({isEntry ? 'Giriş' : 'Çıkış'})</div>
                              <div className="text-[12px] text-slate-600 dark:text-slate-400 mt-0.5">{rDate} - Saat: {timeStr}</div>
                            </div>
                          </div>
                          <span className={`px-3 py-1 rounded-full text-[12px] font-semibold ${isEntry ? 'bg-[#E5F9E7] text-[#34C759]' : 'bg-[#FFF4E5] text-[#FF9500]'}`}>
                            {isEntry ? 'Kurum Giriş' : 'Kurum Çıkış'}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

            </div>
          )}
        </div>
      </div>
      
      {/* MODALS */}

      {/* Rapor İşle Modal */}
      {showReportModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#0f172a] rounded-[24px] w-full max-w-md shadow-2xl flex flex-col overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
              <h3 className="text-[17px] font-semibold text-slate-900 dark:text-white">Rapor / İzin İşle</h3>
              <button onClick={() => setShowReportModal(false)} className="text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:text-white p-1 bg-slate-50 dark:bg-[#1e293b] rounded-full">
                <X size={18} />
              </button>
            </div>
            
            <div className="p-6 max-h-[60vh] overflow-y-auto">
              {absentDays.length === 0 ? (
                <div className="text-center py-8 text-slate-600 dark:text-slate-400 text-[14px]">
                  Rapor işlenebilecek "Özürsüz" geçmiş devamsızlık bulunamadı.
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <p className="text-[13px] text-slate-600 dark:text-slate-400 mb-2">Raporun geçerli olduğu devamsızlık gününü seçin. Bu gün veritabanında "Raporlu" olarak güncellenecektir.</p>
                  {absentDays.map(record => {
                    const recordId = record.name ? record.name.split('/').pop() : record.id;
                    const rDate = record.fields?.date?.timestampValue ? new Date(record.fields.date.timestampValue).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Tarih Yok';
                    const cName = record.fields?.courseName?.stringValue || record.fields?.course_name?.stringValue || '';
                    
                    return (
                      <button 
                        key={recordId}
                        onClick={() => processMedicalReport(recordId)}
                        disabled={isSaving}
                        className="flex items-center justify-between p-4 rounded-[16px] border border-slate-200 dark:border-white/10 hover:border-[#007AFF] hover:bg-[#F2F5FF] transition-all text-left group"
                      >
                        <div>
                          <div className="font-semibold text-slate-900 dark:text-white text-[14px]">{rDate}</div>
                          <div className="text-[12px] text-slate-600 dark:text-slate-400">{cName}</div>
                        </div>
                        <div className="text-[#007AFF] opacity-0 group-hover:opacity-100 transition-opacity">
                          <ChevronRight size={18} />
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#0f172a] rounded-[24px] w-full max-w-sm shadow-2xl p-6 flex flex-col items-center text-center">
            <div className="w-12 h-12 bg-[#FFF2F2] text-[#FF3B30] rounded-full flex items-center justify-center mb-4">
              <Trash2 size={20} />
            </div>
            <h3 className="text-[17px] font-semibold text-slate-900 dark:text-white mb-2">Kaydı Sil</h3>
            <p className="text-[14px] text-slate-600 dark:text-slate-400 mb-6">Bu devamsızlık kaydını silmek istediğinize emin misiniz? Bu işlem geri alınamaz.</p>
            <div className="flex w-full gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="flex-1 py-3 text-[15px] font-medium text-slate-900 dark:text-white bg-slate-50 dark:bg-[#1e293b] rounded-xl hover:bg-[#E5E5EA]">İptal</button>
              <button onClick={confirmDelete} className="flex-1 py-3 text-[15px] font-medium text-slate-900 dark:text-white bg-[#FF3B30] rounded-xl hover:bg-[#D70015]">Sil</button>
            </div>
          </div>
        </div>
      )}

      <UnsavedBanner visible={isDirty} />
    </div>
  );
};

export default AttendanceAdminView;
