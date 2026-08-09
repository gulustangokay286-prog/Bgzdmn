import React, { useState, useEffect } from 'react';
import { Search, Loader2, DoorOpen, DoorClosed, AlertCircle } from 'lucide-react';
import { db, rtdb } from '../services/firebaseConfig';
import { onValue } from 'firebase/database';
import { ref, push, update, serverTimestamp as rtdbServerTimestamp } from 'firebase/database';
import { soundManager } from '../services/soundManager';
import { collection, getDocs, addDoc, query, orderBy, limit, serverTimestamp } from 'firebase/firestore';
import { firebaseService } from '../services/firebase';
import { sendWhatsAppNotification } from '../services/whatsappService';

const StudentGateAdminView = () => {
  const [students, setStudents] = useState([]);
  const [studentStatusMap, setStudentStatusMap] = useState({});
  const [searchText, setSearchText] = useState('');
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);

  const currentDate = new Date().toLocaleDateString('tr-TR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      // 1. Load Users
      const users = await firebaseService.fetchAllUsers();
      const studentList = users.filter(u => {
        const role = u.fields?.role?.stringValue?.toLowerCase() || '';
        return role === 'student' || role === 'öğrenci';
      }).map(u => {
        const id = u.name.split('/').pop();
        const name = u.fields?.full_name?.stringValue || u.fields?.fullName?.stringValue || u.fields?.name?.stringValue || u.fields?.displayName?.stringValue || 'Bilinmeyen Öğrenci';
        const rawPhoto = u.fields?.profile_image?.stringValue || u.fields?.profileImageUrl?.stringValue || u.fields?.profileImage?.stringValue || null;
        const profileImage = rawPhoto || `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=f1f5f9&color=0f172a&size=100`;

        return {
          id,
          name,
          schoolNumber: u.fields?.school_number?.stringValue || u.fields?.schoolNumber?.stringValue || '',
          profileImage
        };
      }).sort((a, b) => a.name.localeCompare(b.name, 'tr'));

      setStudents(studentList);

      // 2. Load Statuses from gate_status via RTDB
      try {
        const statusRef = ref(rtdb, 'qr_system/gate_status');
        const todayStr = new Date().toISOString().split('T')[0];
        
        onValue(statusRef, (snapshot) => {
          if (snapshot.exists()) {
            const statusMap = {};
            snapshot.forEach(child => {
              const data = child.val();
              if (data.date === todayStr) {
                statusMap[child.key] = data.status === 'entry' ? 'inside' : 'outside';
              }
            });
            setStudentStatusMap(statusMap);
          }
        });
      } catch (logErr) {
        console.error("Durumlar yüklenirken hata:", logErr);
      }

      setLoading(false);
    } catch (err) {
      console.error('Veriler yüklenemedi:', err);
      setLoading(false);
    }
  };

  const handleAction = async (student) => {
    if (processingId) return;
    setProcessingId(student.id);

    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const currentStatus = studentStatusMap[student.id] || 'outside';
    const newStatus = currentStatus === 'inside' ? 'exit' : 'entry';

    // 1. Optimistic UI Update (Işık Hızında Tepki)
    setStudentStatusMap(prev => ({
      ...prev,
      [student.id]: newStatus === 'entry' ? 'inside' : 'outside'
    }));

    soundManager.playSuccessDing();
    setProcessingId(null); // Buton kilidini anında aç

    // 2. Arka Planda Veritabanı Güncellemeleri (Await etmeden)
    try {
      const logData = {
        studentId: student.id,
        studentName: student.name,
        type: 'institution_gate',
        action: newStatus,
        status: newStatus,
        method: 'manual_admin',
        timestamp: rtdbServerTimestamp()
      };
      
      const logId = push(ref(rtdb, `qr_system/attendance_logs/${todayStr}`)).key || Date.now().toString();
      const updates = {};
      updates[`qr_system/attendance_logs/${todayStr}/${logId}`] = logData;
      updates[`qr_system/live_scans/${logId}`] = logData;
      updates[`qr_system/gate_status/${student.id}`] = {
        status: newStatus,
        date: todayStr,
        timestamp: rtdbServerTimestamp()
      };
      
      update(ref(rtdb), updates).catch(err => console.error("Gate status yazma hatası:", err));

      // WhatsApp notification in background
      sendWhatsAppNotification(student.id, student.name, newStatus, now)
        .catch(waErr => console.error("WhatsApp bildirim hatası:", waErr));

    } catch (err) {
      console.error("Arka plan işlemleri başlatılamadı:", err);
    }
  };

  const filteredStudents = searchText
    ? students.filter(s => s.name.toLowerCase().includes(searchText.toLowerCase()) || s.schoolNumber.includes(searchText))
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
      
      {/* Header section (Dashboard style) */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-4 md:mb-8 shrink-0 gap-4 w-full">
        <div className="flex flex-col">
          <span className="text-[11px] md:text-[12px] font-medium text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wider">{currentDate}</span>
          <h1 className="text-[28px] md:text-[32px] font-semibold text-slate-900 dark:text-white tracking-tight leading-none">Geçiş Yönetimi</h1>
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

      {/* Unified Minimalist Data Table */}
      <div className="w-full flex-1 bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-white/10 rounded-xl flex flex-col overflow-hidden shadow-sm">
        
        {/* Horizontal Scroll Wrapper for Table */}
        <div className="flex-1 overflow-x-auto overflow-y-auto custom-scrollbar">
          <div className="min-w-[650px] flex flex-col h-full">
            
            {/* Table Header */}
            <div className="flex items-center px-4 md:px-6 py-4 border-b border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-[#1e293b]/50 shrink-0">
              <div className="flex-1 text-[12px] font-semibold text-slate-500 uppercase tracking-wider">Öğrenci</div>
              <div className="w-28 text-[12px] font-semibold text-slate-500 uppercase tracking-wider">Okul No</div>
              <div className="w-36 text-[12px] font-semibold text-slate-500 uppercase tracking-wider">Mevcut Konum</div>
              <div className="w-36 text-[12px] font-semibold text-slate-500 uppercase tracking-wider text-right">Aksiyon</div>
            </div>

            {/* Table Body */}
            <div className="flex-1">
              {filteredStudents.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 text-slate-600 dark:text-slate-400">
                  <AlertCircle size={32} className="mb-2 opacity-50" />
                  <span className="text-[14px] font-medium">Kayıt bulunamadı.</span>
                </div>
              ) : (
                filteredStudents.map((student, idx) => {
                  const status = studentStatusMap[student.id];
                  const isInside = status === 'inside';
                  const isProcessing = processingId === student.id;

                  return (
                    <div 
                      key={student.id} 
                      className={`flex items-center px-4 md:px-6 py-3 border-b border-slate-100 dark:border-white/5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 ${idx === filteredStudents.length - 1 ? 'border-none' : ''}`}
                    >
                      
                      {/* Student Info */}
                      <div className="flex-1 flex items-center gap-3">
                        <img 
                          src={student.profileImage} 
                          alt={student.name}
                          className="w-8 h-8 min-w-[32px] min-h-[32px] shrink-0 rounded-full object-cover border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#1e293b]"
                        />
                        <span className="text-[13px] md:text-[14px] font-medium text-slate-800 dark:text-slate-200 truncate">{student.name}</span>
                      </div>

                      {/* School Number */}
                      <div className="w-28 text-[12px] md:text-[13px] text-slate-600 dark:text-slate-400 font-medium">
                        {student.schoolNumber || '-'}
                      </div>

                      {/* Status Badge */}
                      <div className="w-36 flex items-center shrink-0">
                        <div className={`px-2 py-1 rounded text-[11px] md:text-[12px] font-semibold flex items-center gap-1.5 border ${isInside ? 'border-emerald-200 text-emerald-700 bg-emerald-50' : 'border-amber-200 text-amber-700 bg-amber-50'}`}>
                          {isInside ? <DoorClosed size={12} /> : <DoorOpen size={12} />}
                          {isInside ? 'Kurum İçinde' : 'Kurum Dışında'}
                        </div>
                      </div>

                      {/* Action Button */}
                      <div className="w-36 flex justify-end shrink-0">
                        <button
                          onClick={() => handleAction(student)}
                          disabled={isProcessing}
                          className={`flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg border text-[12px] md:text-[13px] font-semibold transition-all w-28 ${
                            isProcessing ? 'bg-slate-50 dark:bg-[#1e293b] border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400 cursor-not-allowed' :
                            'bg-white dark:bg-[#0f172a] border-slate-300 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-[#1e293b] hover:border-slate-400 active:bg-slate-50'
                          }`}
                        >
                          {isProcessing ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            isInside ? 'Çıkış Yap' : 'Giriş Yap'
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
