import React, { useState, useEffect, useMemo } from 'react';
import { 
  CalendarX2, UserPlus, Trash2, AlertTriangle, UserCheck, Clock, FileWarning, 
  Search, Activity, CalendarDays, CheckCircle2, ChevronRight, X, DoorOpen, DoorClosed, 
  RefreshCcw, AlertCircle, ShieldAlert, Timer
} from 'lucide-react';
import { firebaseService } from '../services/firebase';
import { academicService } from '../services/academicService';
import { db, rtdb } from '../services/firebaseConfig';
import { collection, getDocs, addDoc, doc, updateDoc, deleteDoc, query, where, onSnapshot } from 'firebase/firestore';
import { ref, onValue } from 'firebase/database';
import StudentSearch from '../components/StudentSearch';
import useUnsavedChanges from '../hooks/useUnsavedChanges';
import UnsavedBanner from '../components/UnsavedBanner';

const AttendanceAdminView = () => {
  const [viewMode, setViewMode] = useState('student'); // 'student' | 'teacher' | 'personnel'
  const [allUsers, setAllUsers] = useState([]);
  const [users, setUsers] = useState([]);
  
  const [studentId, setStudentId] = useState(null);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [loading, setLoading] = useState(true);

  const [isSaved, setIsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [showReportModal, setShowReportModal] = useState(false);

  const { markDirty, markClean, isDirty } = useUnsavedChanges();

  // Birleşik Kayıtlar
  const [manualRecords, setManualRecords] = useState([]);
  const [qrLogs, setQrLogs] = useState([]);
  const [loadingPast, setLoadingPast] = useState(false);

  // 1. Kullanıcıları Yükle
  const fetchUsers = async () => {
    setLoading(true);
    const data = await firebaseService.fetchAllUsers();
    setAllUsers(data);
    setLoading(false);
  };

  useEffect(() => {
    fetchUsers();
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
    setSelectedStudent(null);
    setManualRecords([]);
    setQrLogs([]);
  }, [allUsers, viewMode]);

  // 2. Seçili Öğrencinin Tüm Devamsızlık ve QR Geçişlerini Gerçek Zamanlı Dinle
  useEffect(() => {
    if (!studentId) return;
    setLoadingPast(true);

    // A) Firestore Manuel 'attendance' Dinleyicisi
    const attQuery = query(collection(db, 'attendance'), where('studentId', '==', studentId));
    const unsubFirestore = onSnapshot(attQuery, (snap) => {
      const records = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      records.sort((a, b) => {
        const tA = a.date ? (a.date.toDate ? a.date.toDate().getTime() : new Date(a.date).getTime()) : 0;
        const tB = b.date ? (b.date.toDate ? b.date.toDate().getTime() : new Date(b.date).getTime()) : 0;
        return tB - tA;
      });
      setManualRecords(records);
      setLoadingPast(false);
    }, (err) => {
      console.log("Firestore attendance snapshot error:", err);
      setLoadingPast(false);
    });

    // B) RTDB QR Geçiş Logları Dinleyicisi
    const rtdbAttRef = ref(rtdb, 'qr_system/attendance_logs');
    const unsubRTDB = onValue(rtdbAttRef, (snapshot) => {
      if (snapshot.exists()) {
        const allDays = snapshot.val();
        const logs = [];
        Object.keys(allDays).forEach(dayKey => {
          const dayObj = allDays[dayKey];
          Object.keys(dayObj).forEach(logId => {
            const item = dayObj[logId];
            if (item.studentId === studentId || item.studentTc === selectedStudent?.tc) {
              logs.push({
                id: logId,
                date: item.date || dayKey,
                action: item.action || 'entry',
                status: item.status || 'entry',
                time: item.time || (item.timestamp ? new Date(item.timestamp).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '08:50'),
                timestamp: item.timestamp || Date.now(),
                isLate: item.isLate || false,
                type: item.type || 'institution_gate',
                method: item.method || 'qr'
              });
            }
          });
        });
        logs.sort((a, b) => b.timestamp - a.timestamp);
        setQrLogs(logs);
      } else {
        setQrLogs([]);
      }
    }, (err) => {
      console.log("RTDB logs error:", err);
    });

    return () => {
      unsubFirestore();
    };
  }, [studentId]);

  // 3. Gün Gün Devamsızlık ve Yarım Gün / Tam Gün Hesaplama Motoru
  const attendanceSummary = useMemo(() => {
    let ozursuzTotal = 0;
    let raporluTotal = 0;
    let lateCount = 0;

    // Manuel kayıtları topla
    manualRecords.forEach(r => {
      const isRaporlu = r.status === 'excused' || (r.courseName && r.courseName.includes('Raporlu'));
      const isYarim = (r.courseName && r.courseName.includes('Yarım Gün')) || r.periodIndex === -0.5;
      const weight = isYarim ? 0.5 : 1.0;

      if (isRaporlu) {
        raporluTotal += weight;
      } else {
        ozursuzTotal += weight;
      }
      if (r.status === 'late') lateCount++;
    });

    // QR Loglarındaki geç kalmaları say
    qrLogs.forEach(l => {
      if (l.isLate) lateCount++;
    });

    return {
      ozursuzDays: ozursuzTotal.toFixed(1).replace('.0', '').replace('.', ','),
      raporluDays: raporluTotal.toFixed(1).replace('.0', '').replace('.', ','),
      lateCount
    };
  }, [manualRecords, qrLogs]);

  // Hızlı İşlemler
  const handleSaveAttendance = async (typeLabel, isHalfDay, isExcused) => {
    if (!studentId) return;
    setIsSaving(true);
    try {
      await addDoc(collection(db, 'attendance'), {
        studentId,
        studentName: selectedStudent?.name || 'Öğrenci',
        courseName: typeLabel,
        periodIndex: isHalfDay ? -0.5 : -1,
        status: isExcused ? 'excused' : 'absent',
        recordedBy: 'Admin Panel',
        date: new Date(),
        timestamp: new Date()
      });
      setIsSaved(true);
      setTimeout(() => setIsSaved(false), 2500);
    } catch (err) {
      console.error("Attendance kaydetme hatası:", err);
      alert("Hata: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteRecord = async (recordId) => {
    if (!recordId) return;
    try {
      await deleteDoc(doc(db, 'attendance', recordId));
      setDeleteConfirm(null);
    } catch (err) {
      console.error("Silme hatası:", err);
      alert("Kayıt silinemedi: " + err.message);
    }
  };

  const processMedicalReport = async (recordId) => {
    setIsSaving(true);
    try {
      await updateDoc(doc(db, 'attendance', recordId), {
        status: "excused",
        courseName: "Tam Gün (Raporlu / İzinli)",
        timestamp: new Date()
      });
      setShowReportModal(false);
    } catch (err) {
      console.error("Rapor işleme hatası:", err);
      alert("Rapor işlenemedi: " + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  const getStatusBadge = (record) => {
    const cName = record.courseName || '';
    const status = record.status || '';

    if (cName.includes('Raporlu') || status === 'excused') {
      return <span className="px-3 py-1 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-300 rounded-full text-[12px] font-bold border border-indigo-200 dark:border-indigo-800">İzinli / Raporlu</span>;
    }
    if (cName.includes('Yarım Gün')) {
      return <span className="px-3 py-1 bg-amber-50 text-amber-700 dark:bg-amber-950/60 dark:text-amber-300 rounded-full text-[12px] font-bold border border-amber-200 dark:border-amber-800">Yarım Gün Yok (0.5)</span>;
    }
    if (cName.includes('Tam Gün') || status === 'absent') {
      return <span className="px-3 py-1 bg-red-50 text-red-700 dark:bg-red-950/60 dark:text-red-300 rounded-full text-[12px] font-bold border border-red-200 dark:border-red-800">Tam Gün Yok (1.0)</span>;
    }
    if (status === 'late') {
      return <span className="px-3 py-1 bg-orange-50 text-orange-700 dark:bg-orange-950/60 dark:text-orange-300 rounded-full text-[12px] font-bold border border-orange-200 dark:border-orange-800">Geç Kaldı</span>;
    }
    return <span className="px-3 py-1 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 rounded-full text-[12px] font-bold border border-emerald-200 dark:border-emerald-800">Mevcut / Giriş</span>;
  };

  return (
    <div className="w-full h-full flex-1 flex flex-col bg-white dark:bg-[#0f172a] rounded-[24px] shadow-sm border border-slate-200 dark:border-white/10 text-slate-900 dark:text-white font-sans overflow-hidden">
      
      {/* Üst Başlık & Sekmeler */}
      <div className="px-8 py-6 bg-white dark:bg-[#0f172a] flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0 border-b border-slate-200 dark:border-white/10">
        <div>
          <h1 className="text-[26px] md:text-[28px] font-bold tracking-tight text-slate-900 dark:text-white">Devamsızlık & Yoklama Yönetimi</h1>
          <p className="text-[14px] font-medium text-slate-500 dark:text-slate-400 mt-0.5">Öğrenci ve personellerin QR geçişlerini, geç kalmalarını ve yarım/tam gün devamsızlıklarını yönetin.</p>
        </div>
        
        {/* Rol Filtresi */}
        <div className="flex p-1 bg-slate-100 dark:bg-[#1e293b] rounded-xl self-start md:self-auto">
          {['student', 'teacher', 'personnel'].map(mode => (
            <button 
              key={mode}
              onClick={() => setViewMode(mode)}
              className={`px-5 py-2 rounded-lg text-[13px] font-bold transition-all duration-200 ${
                viewMode === mode 
                ? 'bg-white dark:bg-[#0f172a] text-[#103A69] dark:text-blue-400 shadow-sm' 
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {mode === 'student' ? 'Öğrenci' : mode === 'teacher' ? 'Öğretmen' : 'Personel'}
            </button>
          ))}
        </div>
      </div>

      {/* Ana Gövde */}
      <div className="flex flex-col md:flex-row flex-1 overflow-hidden">
        
        {/* Sol Kolon: Kullanıcı Listesi */}
        <div className={`${studentId ? 'hidden md:flex' : 'flex'} w-full md:w-[320px] shrink-0 border-b md:border-b-0 md:border-r border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-[#0f172a] flex-col`}>
          <div className="p-3.5 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider pl-2">
              {viewMode === 'student' ? 'Öğrenci Listesi' : viewMode === 'teacher' ? 'Öğretmenler' : 'Personeller'} ({users.length})
            </span>
            <button onClick={fetchUsers} className="text-slate-400 hover:text-slate-700 dark:hover:text-white p-1 rounded-lg">
              <RefreshCcw size={14} className={loading ? 'animate-spin' : ''} />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto px-2 py-2">
            {loading ? (
              <div className="flex justify-center py-12">
                <div className="w-6 h-6 rounded-full border-2 border-slate-300 border-t-[#103A69] animate-spin"></div>
              </div>
            ) : (
              <StudentSearch 
                users={users} 
                selectedId={studentId} 
                onSelect={(id, name) => { 
                  setStudentId(id); 
                  const found = users.find(u => u.name.split('/').pop() === id);
                  setSelectedStudent({
                    id,
                    name,
                    tc: found?.fields?.tc_kimlik?.stringValue || '',
                    schoolNumber: found?.fields?.school_number?.stringValue || ''
                  });
                }} 
                viewMode={viewMode}
              />
            )}
          </div>
        </div>

        {/* Sağ Kolon: Seçili Kullanıcının Detayları & Geçmiş Kayıtları */}
        <div className={`${studentId ? 'flex' : 'hidden md:flex'} flex-1 bg-white dark:bg-[#0f172a] flex-col overflow-hidden relative`}>
          {!studentId ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 p-8 text-center">
              <CalendarX2 size={54} strokeWidth={1.2} className="mb-3 text-slate-300 dark:text-slate-600" />
              <h3 className="text-[17px] font-bold text-slate-700 dark:text-slate-300">Öğrenci Seçilmedi</h3>
              <p className="text-[13.5px] text-slate-500 max-w-sm mt-1">
                Yoklama ve devamsızlık hareketlerini incelemek veya yeni işlem yapmak için sol listeden bir öğrenci seçin.
              </p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto pb-16">
              
              {/* Profil Başlığı & İstatistik Rozetleri */}
              <div className="px-6 md:px-10 py-6 border-b border-slate-200 dark:border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-50/40 dark:bg-slate-900/40">
                <div className="flex items-center gap-3">
                  <button 
                    onClick={() => setStudentId(null)} 
                    className="md:hidden p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-600"
                  >
                    ← Geri
                  </button>
                  <div>
                    <h2 className="text-[22px] md:text-[24px] font-bold text-slate-900 dark:text-white tracking-tight">{selectedStudent?.name}</h2>
                    <div className="text-[13px] text-slate-500 flex items-center gap-3 mt-0.5">
                      {selectedStudent?.schoolNumber && <span>No: <strong>{selectedStudent.schoolNumber}</strong></span>}
                      {selectedStudent?.tc && <span>TC: <strong>{selectedStudent.tc}</strong></span>}
                      <span className="capitalize px-2 py-0.5 rounded bg-blue-50 dark:bg-blue-950 text-blue-700 dark:text-blue-300 font-semibold text-[11px]">{viewMode}</span>
                    </div>
                  </div>
                </div>
                
                {/* İstatistik Sayaçları */}
                <div className="flex gap-3">
                  <div className="px-4 py-2.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 flex flex-col items-center min-w-[90px]">
                    <span className="text-[20px] font-extrabold text-red-600 dark:text-red-400 leading-none">
                      {attendanceSummary.ozursuzDays}
                    </span>
                    <span className="text-[10.5px] font-bold text-red-700 dark:text-red-300 uppercase mt-1">Özürsüz (Gün)</span>
                  </div>

                  <div className="px-4 py-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900/50 flex flex-col items-center min-w-[90px]">
                    <span className="text-[20px] font-extrabold text-indigo-600 dark:text-indigo-400 leading-none">
                      {attendanceSummary.raporluDays}
                    </span>
                    <span className="text-[10.5px] font-bold text-indigo-700 dark:text-indigo-300 uppercase mt-1">Raporlu (Gün)</span>
                  </div>

                  <div className="px-4 py-2.5 rounded-xl bg-orange-50 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-900/50 flex flex-col items-center min-w-[85px]">
                    <span className="text-[20px] font-extrabold text-orange-600 dark:text-orange-400 leading-none">
                      {attendanceSummary.lateCount}
                    </span>
                    <span className="text-[10.5px] font-bold text-orange-700 dark:text-orange-300 uppercase mt-1">Geç Kaldı</span>
                  </div>
                </div>
              </div>

              {/* Hızlı İşlem Butonları */}
              <div className="px-6 md:px-10 py-6 border-b border-slate-100 dark:border-white/5">
                <span className="text-[12px] font-bold text-slate-400 uppercase tracking-wider block mb-3">Hızlı Yoklama İşlemleri</span>
                <div className="flex flex-wrap gap-3">
                  <button 
                    onClick={() => handleSaveAttendance('Tam Gün Yok (Özürsüz)', false, false)}
                    disabled={isSaving}
                    className="flex items-center gap-2 px-4 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold text-[13px] shadow-sm transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                  >
                    <AlertTriangle size={15} />
                    Tam Gün Yok Yaz (1 Gün)
                  </button>

                  <button 
                    onClick={() => handleSaveAttendance('Yarım Gün Yok (Özürsüz)', true, false)}
                    disabled={isSaving}
                    className="flex items-center gap-2 px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold text-[13px] shadow-sm transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                  >
                    <Clock size={15} />
                    Yarım Gün Yok Yaz (0.5 Gün)
                  </button>

                  <button 
                    onClick={() => handleSaveAttendance('Tam Gün (Raporlu / İzinli)', false, true)}
                    disabled={isSaving}
                    className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-[13px] shadow-sm transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                  >
                    <FileWarning size={15} />
                    Rapor / İzin Ekle
                  </button>
                </div>
              </div>

              {/* Geçmiş Kayıtlar & QR Hareketleri */}
              <div className="px-6 md:px-10 py-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-[15px] font-bold text-slate-900 dark:text-white">Yoklama & Geçiş Geçmişi</h3>
                  <span className="text-[12px] text-slate-400 font-semibold">{manualRecords.length + qrLogs.length} Toplam Kayıt</span>
                </div>
                
                {loadingPast ? (
                  <div className="py-12 text-center text-slate-400">
                    <RefreshCcw size={24} className="animate-spin mx-auto mb-2 text-[#103A69]" />
                    <p className="text-[13px]">Kayıtlar yükleniyor...</p>
                  </div>
                ) : (manualRecords.length === 0 && qrLogs.length === 0) ? (
                  <div className="py-12 text-center bg-slate-50 dark:bg-slate-800/30 rounded-2xl border border-slate-200/60 dark:border-slate-800 p-6">
                    <CheckCircle2 size={32} className="text-emerald-500 mx-auto mb-2" />
                    <p className="text-[14px] font-bold text-slate-700 dark:text-slate-300">Kusursuz Devam Durumu</p>
                    <p className="text-[12.5px] text-slate-500 mt-0.5">Bu öğrenciye ait herhangi bir devamsızlık veya geç kalma kaydı bulunmuyor.</p>
                  </div>
                ) : (
                  <div className="flex flex-col gap-2.5">
                    {/* Manuel Eklenen Kayıtlar */}
                    {manualRecords.map(record => {
                      const rDate = record.date ? (record.date.toDate ? record.date.toDate().toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' }) : new Date(record.date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })) : 'Tarih Yok';
                      const cName = record.courseName || 'Devamsızlık Kaydı';

                      return (
                        <div key={record.id} className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 dark:border-white/10 hover:border-slate-300 bg-white dark:bg-[#0f172a] shadow-xs transition-all">
                          <div className="flex items-center gap-3.5">
                            <div className="w-9 h-9 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300">
                              <CalendarDays size={18} />
                            </div>
                            <div>
                              <div className="font-bold text-slate-900 dark:text-white text-[13.5px]">{cName}</div>
                              <div className="text-[11.5px] text-slate-500 font-medium mt-0.5">Tarih: {rDate} • Yetkili: {record.recordedBy || 'Admin'}</div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            {getStatusBadge(record)}
                            <button 
                              onClick={() => handleDeleteRecord(record.id)}
                              className="text-slate-400 hover:text-red-600 p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                              title="Kaydı Sil"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    {/* QR Giriş / Çıkış ve Geç Kalma Hareketleri */}
                    {qrLogs.map(log => {
                      const isEntry = log.action === 'entry' || log.status === 'entry';
                      const isLate = log.isLate;

                      return (
                        <div key={log.id} className="flex items-center justify-between p-3.5 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-slate-800/30 shadow-xs">
                          <div className="flex items-center gap-3.5">
                            <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${isLate ? 'bg-orange-100 text-orange-600 dark:bg-orange-950 dark:text-orange-400' : isEntry ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-400' : 'bg-slate-200 text-slate-600 dark:bg-slate-700'}`}>
                              {isLate ? <Timer size={18} /> : isEntry ? <DoorClosed size={18} /> : <DoorOpen size={18} />}
                            </div>
                            <div>
                              <div className="font-bold text-slate-900 dark:text-white text-[13.5px]">
                                {isLate ? 'Karekod Geçişi (Geç Kaldı)' : isEntry ? 'Kurum Girişi (Karekod)' : 'Kurumdan Çıkış (Karekod)'}
                              </div>
                              <div className="text-[11.5px] text-slate-500 font-medium mt-0.5">
                                Tarih: {log.date} • Saat: <strong>{log.time}</strong> • Yöntem: {log.method === 'manual_admin' ? 'Yönetici Manuel' : 'Karekod Okutma'}
                              </div>
                            </div>
                          </div>
                          <div>
                            {isLate ? (
                              <span className="px-2.5 py-1 bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300 rounded-md text-[11px] font-extrabold border border-orange-300">
                                GEÇ KALDI
                              </span>
                            ) : isEntry ? (
                              <span className="px-2.5 py-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 rounded-md text-[11px] font-extrabold border border-emerald-300">
                                GİRİŞ YAPILDI
                              </span>
                            ) : (
                              <span className="px-2.5 py-1 bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300 rounded-md text-[11px] font-extrabold">
                                ÇIKIŞ
                              </span>
                            )}
                          </div>
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

    </div>
  );
};

export default AttendanceAdminView;
