import React, { useState, useEffect } from 'react';
import { Search, Loader2, Smartphone, ShieldCheck, ShieldAlert, AlertCircle, X, Unlock } from 'lucide-react';
import { db } from '../services/firebaseConfig';
import { collection, getDocs, doc, deleteDoc } from 'firebase/firestore';
import { firebaseService } from '../services/firebase';

const DeviceManagementView = () => {
  const [students, setStudents] = useState([]);
  const [deviceLocks, setDeviceLocks] = useState({});
  const [searchText, setSearchText] = useState('');
  const [loading, setLoading] = useState(true);
  
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);

  const currentDate = new Date().toLocaleDateString('tr-TR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      const users = await firebaseService.fetchAllUsers();
      const studentList = users.filter(u => {
        const role = u.fields?.role?.stringValue?.toLowerCase() || '';
        return role === 'student' || role === 'öğrenci';
      }).map(u => {
        const id = u.name.split('/').pop();
        const name = u.fields?.full_name?.stringValue || u.fields?.fullName?.stringValue || u.fields?.name?.stringValue || u.fields?.displayName?.stringValue || 'Bilinmeyen Öğrenci';
        const rawPhoto = u.fields?.profile_image?.stringValue || u.fields?.profileImageUrl?.stringValue || u.fields?.profileImage?.stringValue || null;
        const profileImage = rawPhoto || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=f1f5f9&color=0f172a&size=100`;
        const tcNo = u.fields?.tc_kimlik?.stringValue || u.fields?.tcKimlik?.stringValue || '';
        const mobileDeviceId = u.fields?.registeredDeviceId?.stringValue || null;
        const mobileDeviceName = u.fields?.deviceName?.stringValue || u.fields?.deviceModel?.stringValue || null;
        
        return {
          id,
          name,
          tcNo,
          schoolNumber: u.fields?.school_number?.stringValue || u.fields?.schoolNumber?.stringValue || '',
          profileImage,
          mobileDeviceId,
          mobileDeviceName
        };
      }).sort((a, b) => a.name.localeCompare(b.name, 'tr'));

      const locksSnapshot = await getDocs(collection(db, 'student_daily_locks'));
      const locksMap = {};
      const todayStr = new Date().toISOString().split('T')[0];

      locksSnapshot.forEach(doc => {
        const data = doc.data();
        if (doc.id.startsWith(todayStr + '_')) {
          const studentId = doc.id.split('_')[1];
          if (data.deviceId || data.hardwareId || data.stableId) {
            locksMap[studentId] = {
              qrDeviceId: data.deviceId || data.hardwareId || data.stableId,
              qrStableId: data.stableId,
              qrDeviceOs: data.deviceOs || 'Bilinmeyen Cihaz'
            };
          }
        }
      });
      
      setDeviceLocks(locksMap);
      setStudents(studentList);
      setLoading(false);
    } catch (err) {
      console.error("Veriler yüklenirken hata oluştu:", err);
      alert('Veriler yüklenirken hata oluştu.');
      setLoading(false);
    }
  };

  const handleUnlockClick = (student) => {
    setSelectedStudent(student);
    setShowConfirmModal(true);
  };

  const confirmUnlock = async () => {
    if (!selectedStudent) return;
    setIsUnlocking(true);
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      
      await firebaseService.resetDeviceLock(selectedStudent.id);

      const { query, where, orderBy, limit } = await import('firebase/firestore');
      
      const deviceLocksQuery = query(collection(db, 'device_locks'), where('ownerId', '==', selectedStudent.id));
      const deviceLocksSnap = await getDocs(deviceLocksQuery);
      deviceLocksSnap.forEach(async (docSnapshot) => {
        await deleteDoc(docSnapshot.ref).catch(() => {});
      });

      const stableLocksQuery = query(collection(db, 'stable_device_locks'), where('ownerId', '==', selectedStudent.id));
      const stableLocksSnap = await getDocs(stableLocksQuery);
      stableLocksSnap.forEach(async (docSnapshot) => {
        await deleteDoc(docSnapshot.ref).catch(() => {});
      });

      const studentDailyLockRef = doc(db, 'student_daily_locks', `${todayStr}_${selectedStudent.id}`);
      await deleteDoc(studentDailyLockRef).catch(() => {});

      if (selectedStudent.tcNo) {
        const secQuery = query(
          collection(db, 'security_logs'), 
          where('attemptedStudentTc', '==', selectedStudent.tcNo),
          orderBy('timestamp', 'desc'),
          limit(1)
        );
        const secSnap = await getDocs(secQuery).catch(() => ({ empty: true }));
        if (!secSnap.empty) {
          const lastAttempt = secSnap.docs[0].data();
          
          const logDate = lastAttempt.timestamp?.toDate ? lastAttempt.timestamp.toDate() : new Date();
          if (logDate.toISOString().split('T')[0] === todayStr) {
            if (lastAttempt.deviceId) {
              await deleteDoc(doc(db, 'device_locks', `${todayStr}_${lastAttempt.deviceId}`)).catch(() => {});
            }
            if (lastAttempt.stableDeviceId) {
              await deleteDoc(doc(db, 'stable_device_locks', `${todayStr}_${lastAttempt.stableDeviceId}`)).catch(() => {});
            }
          }
        }
      }
      
      setDeviceLocks(prev => {
        const newLocks = { ...prev };
        delete newLocks[selectedStudent.id];
        return newLocks;
      });
      setStudents(prev => prev.map(s => s.id === selectedStudent.id ? { ...s, mobileDeviceId: null } : s));

      setShowConfirmModal(false);
      setSelectedStudent(null);
    } catch (err) {
      console.error("Error unlocking device:", err);
      alert('Cihaz kilidi kaldırılırken hata oluştu.');
    } finally {
      setIsUnlocking(false);
    }
  };

  const filteredStudents = searchText
    ? students.filter(s => 
        s.name.toLowerCase().includes(searchText.toLowerCase()) || 
        s.schoolNumber.includes(searchText) ||
        s.tcNo.includes(searchText) ||
        s.id.includes(searchText)
      )
    : students;

  if (loading) {
    return (
      <div className="w-full h-full flex-1 flex items-center justify-center bg-[#FAFAFA] dark:bg-[#0b1120] z-40">
        <Loader2 size={32} className="text-slate-600 dark:text-slate-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="w-full h-full flex-1 flex flex-col font-sans pb-2 md:pb-6 overflow-x-hidden">
      
      { }
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-4 md:mb-8 shrink-0 gap-4 w-full">
        <div className="flex flex-col">
          <span className="text-[11px] md:text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wider">{currentDate}</span>
          <h1 className="text-[28px] md:text-[32px] font-semibold text-slate-900 dark:text-white tracking-tight leading-none flex items-center gap-3">
            Cihaz Yönetimi
          </h1>
        </div>
        <div className="relative w-full sm:w-64">
          <Search size={16} className="absolute left-4 top-1/2 transform -translate-y-1/2 text-slate-600 dark:text-slate-400" />
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="İsim veya no ile ara..."
            className="pl-10 pr-4 py-2.5 w-[280px] bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-white/10 rounded-lg text-[14px] text-slate-900 dark:text-white outline-none focus:border-slate-400 transition-colors"
          />
        </div>
      </div>

      { }
      <div className="w-full flex-1 bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-white/10 rounded-xl flex flex-col overflow-hidden shadow-sm">
        
        { }
        <div className="flex-1 overflow-x-auto overflow-y-auto custom-scrollbar">
          <div className="min-w-[700px] flex flex-col h-full">
            
            { }
            <div className="flex items-center px-4 md:px-6 py-4 border-b border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-[#1e293b]/50 shrink-0">
              <div className="flex-1 text-[12px] font-semibold text-slate-500 uppercase tracking-wider">Öğrenci</div>
              <div className="w-32 text-[12px] font-semibold text-slate-500 uppercase tracking-wider">TC / Okul No</div>
              <div className="w-48 text-[12px] font-semibold text-slate-500 uppercase tracking-wider">Cihaz Bilgisi</div>
              <div className="w-36 text-[12px] font-semibold text-slate-500 uppercase tracking-wider text-right">Aksiyon</div>
            </div>

            { }
            <div className="flex-1">
              {filteredStudents.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-slate-600 dark:text-slate-400">
                  <AlertCircle size={32} className="mb-2 opacity-50" />
                  <span className="text-[14px] font-medium">Kayıt bulunamadı.</span>
                </div>
              ) : (
                filteredStudents.map((student, idx) => {
                  const qrLock = deviceLocks[student.id];
                  const hasMobileLock = !!student.mobileDeviceId;
                  const hasQrLock = !!qrLock;
                  const isLocked = hasMobileLock || hasQrLock;

                  return (
                    <div 
                      key={student.id} 
                      className={`flex items-center px-4 md:px-6 py-3 border-b border-slate-100 dark:border-white/5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 ${idx === filteredStudents.length - 1 ? 'border-none' : ''}`}
                    >
                      
                      { }
                      <div className="flex-1 flex items-center gap-3">
                        <img 
                          src={student.profileImage} 
                          alt={student.name}
                          className="w-8 h-8 min-w-[32px] min-h-[32px] shrink-0 rounded-full object-cover border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#1e293b]"
                        />
                        <span className="text-[13px] md:text-[14px] font-medium text-slate-800 dark:text-slate-200 truncate">{student.name}</span>
                      </div>

                      { }
                      <div className="w-32 text-[12px] md:text-[13px] text-slate-600 dark:text-slate-400 font-medium">
                        <div className="truncate">{student.tcNo || student.id}</div>
                        <div className="text-[10px] text-slate-400 opacity-75">{student.schoolNumber || '-'}</div>
                      </div>

                      { }
                      <div className="w-48 flex flex-col shrink-0 gap-1.5">
                        <div className="flex items-center">
                          <div className={`px-2 py-1 rounded text-[11px] md:text-[12px] font-semibold flex items-center gap-1.5 border ${isLocked ? 'border-emerald-200 text-emerald-700 bg-emerald-50 dark:border-emerald-500/30 dark:text-emerald-400 dark:bg-emerald-500/10' : 'border-slate-200 text-slate-600 bg-slate-50 dark:border-slate-600 dark:text-slate-400 dark:bg-slate-800'}`}>
                            {isLocked ? <ShieldCheck size={12} /> : <ShieldAlert size={12} />}
                            {isLocked ? 'Cihaz Eşleşti' : 'Eşleşme Yok'}
                          </div>
                        </div>
                        
                        {hasMobileLock && (
                          <div className="flex items-center gap-1.5 text-[10px] md:text-[11px] text-blue-600 dark:text-blue-400 truncate max-w-full">
                            <Smartphone size={10} className="shrink-0" />
                            <span className="truncate">{student.mobileDeviceName ? student.mobileDeviceName : 'Mobil Cihaz'}</span>
                          </div>
                        )}
                        
                        {hasQrLock && (
                          <div className="flex items-center gap-1.5 text-[10px] md:text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-full">
                            <Smartphone size={10} className="shrink-0" />
                            <span className="truncate">{qrLock.qrDeviceOs !== 'Bilinmeyen Cihaz' ? qrLock.qrDeviceOs : 'Web Tarayıcı'}</span>
                          </div>
                        )}
                      </div>

                      { }
                      <div className="w-36 flex justify-end shrink-0">
                        <button
                          onClick={() => handleUnlockClick(student)}
                          className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border text-[12px] md:text-[13px] font-semibold transition-all w-28 ${
                            isLocked 
                              ? 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100 hover:border-rose-300 dark:bg-rose-500/10 dark:border-rose-500/30 dark:text-rose-400 dark:hover:bg-rose-500/20' 
                              : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50 hover:border-slate-400 dark:bg-[#0f172a] dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800'
                          } active:scale-95`}
                        >
                          {isLocked ? <Unlock size={14} /> : <ShieldAlert size={14} />}
                          {isLocked ? 'Kilit Kaldır' : 'Zorla Sıfırla'}
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

      { }
      {showConfirmModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-[#1e293b] rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-200 dark:border-white/10">
            <div className="flex justify-between items-center px-6 py-4 border-b border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-[#0f172a]/50">
              <h3 className="text-[16px] font-bold text-slate-900 dark:text-white">Cihaz Kilidini Aç</h3>
              {!isUnlocking && (
                <button onClick={() => setShowConfirmModal(false)} className="text-slate-400 hover:text-slate-700 dark:hover:text-white transition-colors">
                  <X size={20} />
                </button>
              )}
            </div>
            
            <div className="p-6">
              <div className="flex items-start gap-4 text-rose-600 bg-rose-50 dark:text-rose-400 dark:bg-rose-400/10 p-4 rounded-xl border border-rose-200 dark:border-rose-400/20 mb-6">
                <AlertCircle size={20} className="shrink-0 mt-0.5" />
                <p className="text-[13px] font-medium leading-relaxed">
                  Öğrencinin cihaz kilidini sıfırlıyorsunuz. Cihaz hafızası temizlenecek ve öğrenci bir sonraki geçişinde okuttuğu cihaza tekrar kilitlenecektir.
                </p>
              </div>
              
              <p className="text-[14px] text-slate-700 dark:text-slate-300 mb-6 font-medium">
                <strong>{selectedStudent?.name}</strong> adlı öğrencinin kilitli cihazını kaldırmak istediğinize emin misiniz?
              </p>
              
              <div className="flex justify-end gap-3 mt-6">
                <button 
                  onClick={() => setShowConfirmModal(false)}
                  disabled={isUnlocking}
                  className="px-4 py-2 bg-white dark:bg-[#0f172a] text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-white/10 rounded-lg hover:bg-slate-50 dark:hover:bg-white/5 transition-colors text-[13px] font-semibold disabled:opacity-50"
                >
                  İptal
                </button>
                <button 
                  onClick={confirmUnlock}
                  disabled={isUnlocking}
                  className="px-4 py-2 bg-rose-600 text-white rounded-lg hover:bg-rose-700 transition-colors text-[13px] font-semibold disabled:opacity-50 flex items-center gap-2 shadow-sm"
                >
                  {isUnlocking ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Unlock size={16} />
                  )}
                  {isUnlocking ? 'Kaldırılıyor...' : 'Evet, Kaldır'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 6px; height: 6px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 3px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #94a3b8; }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb { background: #475569; }
        .dark .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #64748b; }
      `}</style>
    </div>
  );
};

export default DeviceManagementView;
