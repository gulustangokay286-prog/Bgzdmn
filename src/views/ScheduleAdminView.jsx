import React, { useState, useEffect } from 'react';
import { Plus, Trash2, CalendarDays, Clock, BookOpen, User, Users, ChevronDown, Activity, CalendarClock, X } from 'lucide-react';
import { db } from '../services/firebaseConfig';
import { collection, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp, query } from 'firebase/firestore';
import { firebaseService } from '../services/firebase';
import useUnsavedChanges from '../hooks/useUnsavedChanges';
import UnsavedBanner from '../components/UnsavedBanner';

const days = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma"];
const classesList = ["9A", "9B", "10A", "10B", "11A", "11B", "12A", "12B"];
const roomsList = ["12A Sınıfı", "12B Sınıfı", "11A Sınıfı", "11B Sınıfı", "10A Sınıfı", "10B Sınıfı", "9A Sınıfı", "9B Sınıfı", "Fizik Lab", "Kimya Lab", "Spor Salonu", "Müzik Odası"];


const lessonPeriods = [
  { label: "1. Ders", time: "08:30 - 09:15", start: "08:30", end: "09:15" },
  { label: "2. Ders", time: "09:30 - 10:15", start: "09:30", end: "10:15" },
  { label: "3. Ders", time: "10:30 - 11:15", start: "10:30", end: "11:15" },
  { label: "4. Ders", time: "11:30 - 12:15", start: "11:30", end: "12:15" },
  { label: "5. Ders", time: "13:00 - 13:45", start: "13:00", end: "13:45" },
  { label: "6. Ders", time: "14:00 - 14:45", start: "14:00", end: "14:45" },
  { label: "7. Ders", time: "15:00 - 15:45", start: "15:00", end: "15:45" },
  { label: "8. Ders", time: "16:00 - 16:45", start: "16:00", end: "16:45" }
];


const findLessonIndex = (startTime) => {
  if (!startTime) return -1;
  const idx = lessonPeriods.findIndex(p => p.start === startTime);
  return idx;
};

const ScheduleAdminView = () => {
  const [schedules, setSchedules] = useState([]);
  const [teacherNames, setTeacherNames] = useState(["Sistem Öğretmeni"]);
  const [teacherList, setTeacherList] = useState([]);
  const [loading, setLoading] = useState(true);
  const { markDirty, markClean, isDirty } = useUnsavedChanges();
  
  const [selectedClass, setSelectedClass] = useState('9A');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [formData, setFormData] = useState({ 
    courseName: '', 
    teacherName: 'Sistem Öğretmeni', 
    dayIndex: 0, 
    lessonIndex: 0, 
    classId: '9A',
    room: roomsList[0],
    hasAssignment: false,
    assignmentTitle: '',
    assignmentDetails: ''
  });

  useEffect(() => {
    const q = query(collection(db, 'schedule'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setSchedules(data);
      setLoading(false);
    }, (error) => {
      console.error("Program çekilirken hata:", error);
      setLoading(false);
    });

    const initTeachers = async () => {
      const data = await firebaseService.fetchAllUsers();
      const teachersData = data.filter(u => u.fields?.role?.stringValue === 'teacher' || u.fields?.role?.stringValue === 'öğretmen');
      setTeacherList(teachersData);
      const t = teachersData
        .map(u => u.fields?.full_name?.stringValue || u.fields?.fullName?.stringValue)
        .filter(Boolean)
        .sort();
      setTeacherNames(["Sistem Öğretmeni", ...t]);
    };
    initTeachers();

    return () => unsubscribe();
  }, []);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.courseName || !formData.teacherName) return;

    const conflict = schedules.find(s => 
      s.teacherName === formData.teacherName &&
      parseInt(s.dayIndex) === parseInt(formData.dayIndex) &&
      parseInt(s.lessonIndex) === parseInt(formData.lessonIndex)
    );

    if (conflict && formData.teacherName !== 'Sistem Öğretmeni') {
      setFormError(`${formData.teacherName}, bu saatte ${conflict.classId || conflict.class_id} sınıfında derse sahip. Lütfen başka bir öğretmen veya saat seçin.`);
      return;
    }

    setFormError('');

    setIsSaving(true);
    const selectedLesson = lessonPeriods[formData.lessonIndex];
    
    // Find the teacher's ID
    const selectedTeacherObj = teacherList.find(t => 
      (t.fields?.full_name?.stringValue || t.fields?.fullName?.stringValue) === formData.teacherName
    );
    const teacherId = selectedTeacherObj ? (selectedTeacherObj.name?.split('/').pop() || '') : '';

    try {
      const dataToSave = {
        classId: formData.classId,
        class_id: formData.classId,
        courseName: formData.courseName,
        course_name: formData.courseName,
        teacherName: formData.teacherName,
        teacher_name: formData.teacherName,
        teacherId: teacherId,
        teacher_id: teacherId,
        room: formData.room,
        dayIndex: parseInt(formData.dayIndex),
        day_index: parseInt(formData.dayIndex),
        startTime: selectedLesson.start,
        endTime: selectedLesson.end,
        lessonIndex: parseInt(formData.lessonIndex),
        lesson_index: parseInt(formData.lessonIndex),
        hasAssignment: formData.hasAssignment,
        createdAt: serverTimestamp()
      };
      if (formData.hasAssignment) {
        dataToSave.assignmentTitle = formData.assignmentTitle;
        dataToSave.assignmentDetails = formData.assignmentDetails;
      }
      await addDoc(collection(db, 'schedule'), dataToSave);
      await addDoc(collection(db, 'schedules'), dataToSave);
      await addDoc(collection(db, 'student_schedules'), dataToSave);
      await addDoc(collection(db, 'teacher_schedules'), dataToSave);
      setIsModalOpen(false);
      setFormData({ 
        ...formData, 
        courseName: '', 
        teacherName: teacherNames[0] || 'Sistem Öğretmeni',
        hasAssignment: false,
        assignmentTitle: '',
        assignmentDetails: ''
      });
      markClean();
    } catch (error) {
      console.error('Kaydedilirken hata:', error);
      setFormError('Kayıt işlemi başarısız oldu.');
    }
    setIsSaving(false);
  };

  const handleDelete = async (docId, course) => {
    setDeleteConfirm({ id: docId, course });
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    try {
      const id = deleteConfirm.id;
      await deleteDoc(doc(db, 'schedule', id)).catch(() => {});
      await deleteDoc(doc(db, 'schedules', id)).catch(() => {});
      await deleteDoc(doc(db, 'student_schedules', id)).catch(() => {});
      await deleteDoc(doc(db, 'teacher_schedules', id)).catch(() => {});
    } catch (error) {
      console.error('Silme hatası:', error);
    }
    setDeleteConfirm(null);
  };

  const openModal = (dayIdx, periodIdx) => {
    setFormError('');
    setFormData({
      courseName: '',
      teacherName: teacherNames[0] || 'Sistem Öğretmeni',
      dayIndex: dayIdx !== undefined ? dayIdx : 0,
      lessonIndex: periodIdx !== undefined ? periodIdx : 0,
      classId: selectedClass,
      room: roomsList[0],
      hasAssignment: false,
      assignmentTitle: '',
      assignmentDetails: ''
    });
    markDirty();
    setIsModalOpen(true);
  };

  const currentSchedules = schedules.filter(s => s.classId === selectedClass || s.class_id === selectedClass);
  const currentDate = new Date().toLocaleDateString('tr-TR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  
  const getScheduleForCell = (dayIdx, periodIdx) => {
    const period = lessonPeriods[periodIdx];
    return currentSchedules.find(s => {
      const sDayIndex = parseInt(s.dayIndex);
      if (sDayIndex !== dayIdx) return false;
      
      
      if (s.lessonIndex !== undefined && s.lessonIndex !== null) {
        return parseInt(s.lessonIndex) === periodIdx;
      }
      
      const sStartTime = s.startTime || '';
      return sStartTime === period.start;
    });
  };

  return (
    <div className="w-full h-full flex-1 flex flex-col font-sans overflow-hidden pb-2 md:pb-6 p-4 md:p-12">
      
      {}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-10 w-full shrink-0">
        <div className="flex items-center gap-5">
          <div className="flex flex-col">
            <span className="text-[13px] font-medium text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wider">{currentDate}</span>
            <h1 className="text-[36px] font-semibold text-slate-900 dark:text-white tracking-tight leading-none">Ders Programı</h1>
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm flex-1 w-full min-h-0 overflow-hidden">
        
        {/* Sınıf Seçimi Sidebar */}
        <div className="w-full md:w-[260px] flex-shrink-0 flex flex-col border-b md:border-b-0 md:border-r border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-[#1e293b]/50 max-h-[40vh] md:max-h-none">
          <div className="p-4 border-b border-slate-200 dark:border-white/10 shrink-0 hidden md:block">
            <h3 className="text-[12px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest px-2">Sınıf Seçimi</h3>
          </div>
          
          <div className="flex-1 overflow-x-auto md:overflow-y-auto custom-scrollbar p-2">
            <div className="flex flex-row md:flex-col gap-2">
              {classesList.map(cls => (
                <button
                  key={cls}
                  onClick={() => setSelectedClass(cls)}
                  className={`flex-shrink-0 w-auto md:w-full text-center md:text-left px-5 py-2.5 md:py-3 rounded-xl text-[13px] font-bold transition-all ${selectedClass === cls ? 'bg-white dark:bg-[#0f172a] text-indigo-600 shadow-sm border border-slate-200 dark:border-white/10' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50/50 dark:bg-[#1e293b]/50 hover:text-slate-900 dark:text-white border border-transparent'}`}
                >
                  {cls} Sınıfı
                </button>
              ))}
            </div>
          </div>
          
          <div className="p-6 border-t border-slate-200 dark:border-white/10 shrink-0 bg-white dark:bg-[#0f172a]">
            <div className="bg-slate-50 dark:bg-[#1e293b] p-4 rounded-xl border border-slate-200 dark:border-white/10 flex flex-col justify-center items-center text-center">
              <div className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-1">Tanımlı Ders</div>
              <div className="text-[32px] font-bold text-slate-900 dark:text-white tracking-tight leading-none mb-1">{currentSchedules.length}</div>
              <div className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">40 saat üzerinden</div>
            </div>
          </div>
        </div>

        {/* İçerik */}
        <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-[#0f172a]">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 px-6 py-4 border-b border-slate-200 dark:border-white/10 shrink-0">
            <h2 className="text-[18px] font-bold text-slate-900 dark:text-white">{selectedClass} Haftalık Ders Programı</h2>
            <button 
               onClick={() => openModal(0, 0)} 
               className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-slate-900 dark:text-white text-[13px] font-bold rounded-lg transition-all shadow-sm"
             >
               <Plus size={16}/> Yeni Ekle
            </button>
          </div>
          <div className="flex-1 overflow-auto custom-scrollbar p-0 bg-slate-50 dark:bg-[#1e293b]/30">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-600 dark:text-slate-400">
                <div className="w-8 h-8 rounded-full border-4 border-slate-200 dark:border-white/10 border-t-slate-900 animate-spin mb-4"></div>
                <span className="font-bold">Yükleniyor...</span>
              </div>
            ) : (
              <table className="w-full text-left border-collapse min-w-[800px] h-full">
                <thead className="sticky top-0 bg-slate-50 dark:bg-[#1e293b]/90 backdrop-blur-md z-20 shadow-sm">
                  <tr>
                    <th className="px-4 py-4 text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest border-b border-r border-slate-200 dark:border-white/10 w-24 text-center bg-white dark:bg-[#0f172a]">Saat</th>
                    {days.map(day => (
                      <th key={day} className="px-4 py-4 text-[12px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-widest border-b border-slate-200 dark:border-white/10 text-center w-[18%] bg-white dark:bg-[#0f172a]">{day}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white dark:bg-[#0f172a]">
                  {lessonPeriods.map((period, pIdx) => (
                    <tr key={pIdx} className="hover:bg-slate-50 dark:bg-[#1e293b]/30 transition-colors">
                      <td className="px-2 py-3 border-r border-slate-200 dark:border-white/10 text-center align-middle bg-slate-50 dark:bg-[#1e293b]/30">
                        <div className="font-bold text-slate-800 dark:text-slate-200 text-[13px]">{period.label}</div>
                        <div className="text-[11px] font-medium text-slate-500 font-mono">{period.time}</div>
                      </td>
                      {days.map((day, dIdx) => {
                        const schedule = getScheduleForCell(dIdx, pIdx);
                        
                        return (
                          <td key={dIdx} className="p-1.5 border-r border-slate-200 dark:border-white/10 last:border-r-0 relative group h-[64px] align-middle">
                            {schedule ? (
                              <div className="h-full bg-indigo-50 border-2 border-indigo-200 rounded-xl flex flex-col items-center justify-center relative overflow-hidden transition-all hover:border-indigo-400 group/item">
                                <div className="font-bold text-indigo-700 text-[12px] leading-tight text-center truncate w-full px-1">{schedule.courseName || schedule.course_name}</div>
                                <div className="font-medium text-slate-500 text-[10px] truncate w-full text-center px-1">{schedule.teacherName}</div>
                                <button 
                                  onClick={() => handleDelete(schedule.id, schedule.courseName || schedule.course_name)}
                                  className="absolute inset-0 w-full h-full bg-rose-500 text-slate-900 dark:text-white opacity-0 group-hover/item:opacity-100 transition-opacity flex items-center justify-center"
                                  title="Dersi Kaldır"
                                >
                                  <Trash2 size={16}/>
                                </button>
                              </div>
                            ) : (
                              <div className="h-full rounded-xl border-2 border-dashed border-slate-200 dark:border-white/10 hover:border-slate-300 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all bg-transparent hover:bg-slate-50 dark:bg-[#1e293b] cursor-pointer"
                                onClick={() => openModal(dIdx, pIdx)}
                              >
                                <span className="flex items-center gap-1 text-[12px] font-bold text-slate-600 dark:text-slate-400 hover:text-indigo-600">
                                  <Plus size={16}/>
                                </span>
                              </div>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#0f172a] rounded-[32px] w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] border border-slate-200 dark:border-white/10">
            
            <div className="flex justify-between items-center px-8 py-6 border-b border-slate-200 dark:border-white/10 bg-white dark:bg-[#0f172a]">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-[16px] bg-slate-50 dark:bg-[#1e293b] border border-slate-200 dark:border-white/10 flex items-center justify-center text-slate-800 dark:text-slate-200">
                  <CalendarClock size={20} strokeWidth={2.5} />
                </div>
                <div>
                  <h2 className="text-[20px] font-bold text-slate-900 dark:text-white tracking-tight">Yeni Ders Ekle</h2>
                </div>
              </div>
              <button onClick={() => { setIsModalOpen(false); markClean(); }} className="w-10 h-10 rounded-full bg-slate-50 dark:bg-[#1e293b] flex items-center justify-center text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:bg-[#1e293b] hover:text-slate-700 dark:text-slate-300 transition-colors">
                <X size={20}/>
              </button>
            </div>
            
            {formError && (
              <div className="mx-8 mt-6 p-4 bg-rose-50 border border-rose-200 text-rose-700 text-[13px] font-bold rounded-xl flex items-center justify-between">
                <span>{formError}</span>
                <button type="button" onClick={() => setFormError('')} className="text-rose-500 hover:text-rose-800"><X size={16}/></button>
              </div>
            )}
            
            <div className="flex-1 overflow-y-auto px-8 py-8 custom-scrollbar">
              <form id="scheduleForm" onSubmit={handleSave} className="flex flex-col gap-8">
                
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 p-6 bg-slate-50 dark:bg-[#1e293b] rounded-[24px] border border-slate-200 dark:border-white/10">
                  <div>
                    <label className="block text-[13px] font-bold text-slate-700 dark:text-slate-300 mb-2">Hedef Sınıf</label>
                    <div className="relative">
                      <select 
                        className="w-full px-4 py-3.5 bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-white/10 rounded-xl focus:ring-2 focus:ring-slate-900 outline-none transition-all font-bold text-slate-800 dark:text-slate-200 appearance-none cursor-pointer" 
                        value={formData.classId} 
                        onChange={e => setFormData({...formData, classId: e.target.value})}
                      >
                        {classesList.map(c => <option key={c} value={c}>{c} Sınıfı</option>)}
                      </select>
                      <ChevronDown size={18} className="absolute right-4 top-1/2 transform -translate-y-1/2 text-slate-600 dark:text-slate-400 pointer-events-none"/>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[13px] font-bold text-slate-700 dark:text-slate-300 mb-2">Derslik / Laboratuvar</label>
                    <div className="relative">
                      <select 
                        className="w-full px-4 py-3.5 bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-white/10 rounded-xl focus:ring-2 focus:ring-slate-900 outline-none transition-all font-bold text-slate-800 dark:text-slate-200 appearance-none cursor-pointer" 
                        value={formData.room} 
                        onChange={e => setFormData({...formData, room: e.target.value})}
                      >
                        {roomsList.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                      <ChevronDown size={18} className="absolute right-4 top-1/2 transform -translate-y-1/2 text-slate-600 dark:text-slate-400 pointer-events-none"/>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[13px] font-bold text-slate-700 dark:text-slate-300 mb-2">Ders Adı *</label>
                    <input 
                      type="text" 
                      className="w-full px-4 py-3.5 bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-white/10 rounded-xl focus:ring-2 focus:ring-slate-900 outline-none transition-all font-medium text-slate-700 dark:text-slate-300 placeholder:text-slate-600 dark:text-slate-400" 
                      value={formData.courseName} 
                      onChange={e => setFormData({...formData, courseName: e.target.value})} 
                      required 
                      placeholder="Örn: Biyoloji" 
                    />
                  </div>

                  <div>
                    <label className="block text-[13px] font-bold text-slate-700 dark:text-slate-300 mb-2">Öğretmen Adı *</label>
                    <div className="relative">
                      <select 
                        className="w-full px-4 py-3.5 bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-white/10 rounded-xl focus:ring-2 focus:ring-slate-900 outline-none transition-all font-medium text-slate-700 dark:text-slate-300 appearance-none cursor-pointer" 
                        value={formData.teacherName} 
                        onChange={e => setFormData({...formData, teacherName: e.target.value})}
                      >
                        {teacherNames.map((name, i) => (
                           <option key={i} value={name}>{name}</option>
                        ))}
                      </select>
                      <ChevronDown size={18} className="absolute right-4 top-1/2 transform -translate-y-1/2 text-slate-600 dark:text-slate-400 pointer-events-none"/>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-[12px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-4">Zaman Planlaması</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 p-6 bg-slate-50 dark:bg-[#1e293b] rounded-[24px] border border-slate-200 dark:border-white/10">
                    <div>
                      <label className="block text-[13px] font-bold text-slate-700 dark:text-slate-300 mb-2">Gün *</label>
                      <div className="relative">
                        <select 
                          className="w-full px-4 py-3.5 bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-white/10 rounded-xl focus:ring-2 focus:ring-slate-900 outline-none transition-all font-bold text-slate-800 dark:text-slate-200 appearance-none cursor-pointer" 
                          value={formData.dayIndex} 
                          onChange={e => setFormData({...formData, dayIndex: parseInt(e.target.value)})}
                        >
                          {days.map((d, i) => <option key={i} value={i}>{d}</option>)}
                        </select>
                        <ChevronDown size={18} className="absolute right-4 top-1/2 transform -translate-y-1/2 text-slate-600 dark:text-slate-400 pointer-events-none"/>
                      </div>
                    </div>
                    <div>
                      <label className="block text-[13px] font-bold text-slate-700 dark:text-slate-300 mb-2">Ders Saati *</label>
                      <div className="relative">
                        <select 
                          className="w-full px-4 py-3.5 bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-white/10 rounded-xl focus:ring-2 focus:ring-slate-900 outline-none transition-all font-bold text-slate-800 dark:text-slate-200 appearance-none cursor-pointer" 
                          value={formData.lessonIndex} 
                          onChange={e => setFormData({...formData, lessonIndex: parseInt(e.target.value)})}
                        >
                          {lessonPeriods.map((period, i) => (
                            <option key={i} value={i}>{period.label} ({period.time})</option>
                          ))}
                        </select>
                        <ChevronDown size={18} className="absolute right-4 top-1/2 transform -translate-y-1/2 text-slate-600 dark:text-slate-400 pointer-events-none"/>
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <div className="flex items-center gap-3 mb-4 px-2">
                    <input
                      type="checkbox"
                      id="hasAssignment"
                      checked={formData.hasAssignment}
                      onChange={e => setFormData({...formData, hasAssignment: e.target.checked})}
                      className="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600 cursor-pointer"
                    />
                    <label htmlFor="hasAssignment" className="text-[14px] font-bold text-slate-700 dark:text-slate-300 cursor-pointer">Bu Derste Ödev Var</label>
                  </div>
                  
                  {formData.hasAssignment && (
                    <div className="grid grid-cols-1 gap-6 p-6 bg-purple-50 rounded-[24px] border border-purple-100">
                      <div>
                        <label className="block text-[13px] font-bold text-purple-900 mb-2">Ödev Başlığı *</label>
                        <input 
                          type="text" 
                          className="w-full px-4 py-3.5 bg-white dark:bg-[#0f172a] border border-purple-200 rounded-xl focus:ring-2 focus:ring-purple-600 outline-none transition-all font-medium text-slate-700 dark:text-slate-300" 
                          value={formData.assignmentTitle} 
                          onChange={e => setFormData({...formData, assignmentTitle: e.target.value})} 
                          required={formData.hasAssignment}
                          placeholder="Örn: Logaritma Testi" 
                        />
                      </div>
                      <div>
                        <label className="block text-[13px] font-bold text-purple-900 mb-2">Ödev Detayı *</label>
                        <textarea 
                          className="w-full px-4 py-3.5 bg-white dark:bg-[#0f172a] border border-purple-200 rounded-xl focus:ring-2 focus:ring-purple-600 outline-none transition-all font-medium text-slate-700 dark:text-slate-300 min-h-[100px] resize-none" 
                          value={formData.assignmentDetails} 
                          onChange={e => setFormData({...formData, assignmentDetails: e.target.value})} 
                          required={formData.hasAssignment}
                          placeholder="Ödev açıklaması..." 
                        />
                      </div>
                    </div>
                  )}
                </div>

              </form>
            </div>

            <div className="px-8 py-6 border-t border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-[#1e293b] flex justify-end gap-3 rounded-b-[32px]">
              <button onClick={() => { setIsModalOpen(false); markClean(); }} className="px-6 py-3.5 text-[14px] font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-[#0f172a] border border-slate-300 rounded-xl hover:bg-slate-50 dark:bg-[#1e293b] transition-colors shadow-sm">
                İptal
              </button>
              <button 
                form="scheduleForm" 
                type="submit" 
                className="px-8 py-3.5 text-[14px] font-semibold text-slate-900 dark:text-white bg-slate-900 rounded-xl hover:bg-slate-800 transition-colors shadow-sm disabled:opacity-50 min-w-[140px]" 
                disabled={isSaving}
              >
                {isSaving ? 'Kaydediliyor...' : 'Ders Ata'}
              </button>
            </div>
          </div>
        </div>
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 bg-slate-900/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#0f172a] rounded-2xl w-full max-w-sm shadow-2xl p-6 flex flex-col gap-4">
            <h3 className="text-[18px] font-bold text-slate-900 dark:text-white">Dersi Kaldır</h3>
            <p className="text-[14px] text-slate-600 dark:text-slate-400 font-medium">"{deleteConfirm.course}" dersini programdan kaldırmak istediğinize emin misiniz?</p>
            <div className="flex justify-end gap-3 mt-4">
              <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2.5 text-[13px] font-bold text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-[#1e293b] hover:bg-slate-200 rounded-lg transition-colors">İptal</button>
              <button onClick={confirmDelete} className="px-4 py-2.5 text-[13px] font-bold text-slate-900 dark:text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors">Kaldır</button>
            </div>
          </div>
        </div>
      )}

      <UnsavedBanner visible={isDirty} />
    </div>
  );
};

export default ScheduleAdminView;
