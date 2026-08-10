import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { User, Phone, Plus, Trash2, Search, Briefcase, BookOpen, BrainCircuit, X, ChevronLeft, BarChart, CalendarDays, Award, Sparkles, ChevronDown, Users, Edit2, Mail, FileText } from 'lucide-react';
import { db, mapSdkToRest } from '../services/firebaseConfig';
import { collection, onSnapshot, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, query, where, getDocs } from 'firebase/firestore';
import { firebaseService } from '../services/firebase';
import { aiService } from '../services/aiService';
import useUnsavedChanges from '../hooks/useUnsavedChanges';
import UnsavedBanner from '../components/UnsavedBanner';

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

const days = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma"];
const classesList = ["9A", "9B", "10A", "10B", "11A", "11B", "12A", "12B"];

const TeacherManagementAdminView = () => {
  const navigate = useNavigate();
  const [teachers, setTeachers] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterBranch, setFilterBranch] = useState('Tümü');

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [isClassSelectModalOpen, setIsClassSelectModalOpen] = useState(false);
  const [isAiDashboardOpen, setIsAiDashboardOpen] = useState(false);

  const [openActionMenuFor, setOpenActionMenuFor] = useState(null);
  const [isClassAssignModalOpen, setIsClassAssignModalOpen] = useState(false);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [assignedClassesDraft, setAssignedClassesDraft] = useState([]);
  const [newClassInput, setNewClassInput] = useState('');
  const [showNewClassInput, setShowNewClassInput] = useState(false);
  const [taskData, setTaskData] = useState({ title: '', description: '', dueDate: '' });

  const [activeTeacher, setActiveTeacher] = useState(null);

  const [isSaving, setIsSaving] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState(null);
  const initialFormData = {
    full_name: '',
    branch: 'Matematik',
    phone: '',
    email: '',
    tc_kimlik: '',
    teacherTitle: 'Ders Öğretmeni',
    assignedClasses: '',
    notes: ''
  };
  const [formData, setFormData] = useState(initialFormData);

  const [scheduleData, setScheduleData] = useState({ classId: '9A', dayIndex: 0, lessonIndex: 0 });

  const [aiAnalysis, setAiAnalysis] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [formError, setFormError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const { markDirty, markClean, isDirty } = useUnsavedChanges();

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (!e.target.closest('.action-menu-container')) {
        setOpenActionMenuFor(null);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  useEffect(() => {
    setLoading(true);
    
    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      const allRestUsers = snapshot.docs.map(mapSdkToRest);
      const filtered = allRestUsers.filter(u => {
        const role = u.fields?.role?.stringValue?.toLowerCase() || '';
        return role === 'teacher' || role === 'öğretmen';
      });
      setTeachers(filtered);
      setLoading(false);
    }, (error) => {
      console.error("Öğretmenler dinlenirken hata:", error);
      setLoading(false);
    });
    
    const unsubSchedule = onSnapshot(query(collection(db, 'schedule')), (snap) => {
      const data1 = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setSchedules(data1);
    }, (err) => console.log("Schedule listen err:", err));

    const unsubSchedules = onSnapshot(query(collection(db, 'schedules')), (snap) => {
      const data2 = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      if (data2.length > 0) {
        setSchedules(prev => {
          const merged = [...prev];
          data2.forEach(item => {
            if (!merged.some(m => m.id === item.id || (m.teacherId === item.teacherId && m.dayIndex === item.dayIndex && m.lessonIndex === item.lessonIndex))) {
              merged.push(item);
            }
          });
          return merged;
        });
      }
    }, (err) => console.log("Schedules listen err:", err));

    return () => {
      unsubUsers();
      unsubSchedule();
      unsubSchedules();
    };
  }, []);

  const openAddModal = () => {
    setEditingTeacher(null);
    setFormData(initialFormData);
    setFormError('');
    setIsAddModalOpen(true);
  };

  const openEditModal = (teacher) => {
    setEditingTeacher(teacher);
    const f = teacher.fields || {};
    setFormData({
      full_name: f.full_name?.stringValue || f.fullName?.stringValue || '',
      branch: f.branch?.stringValue || 'Matematik',
      phone: f.phone?.stringValue || '',
      email: f.email?.stringValue || '',
      tc_kimlik: f.tc_kimlik?.stringValue || f.tcKimlik?.stringValue || '',
      teacherTitle: f.teacherTitle?.stringValue || 'Ders Öğretmeni',
      assignedClasses: f.assignedClasses?.stringValue || '',
      notes: f.notes?.stringValue || ''
    });
    setFormError('');
    setIsAddModalOpen(true);
  };

  const handleSaveTeacher = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    setFormError('');
    try {
      if (editingTeacher) {
        const docId = getTeacherDocId(editingTeacher);
        await updateDoc(doc(db, 'users', docId), {
          full_name: formData.full_name,
          fullName: formData.full_name,
          branch: formData.branch,
          phone: formData.phone,
          email: formData.email,
          tc_kimlik: formData.tc_kimlik,
          tcKimlik: formData.tc_kimlik,
          teacherTitle: formData.teacherTitle,
          assignedClasses: formData.assignedClasses,
          notes: formData.notes,
          updatedAt: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, 'users'), {
          full_name: formData.full_name,
          fullName: formData.full_name,
          branch: formData.branch,
          phone: formData.phone,
          email: formData.email,
          tc_kimlik: formData.tc_kimlik,
          tcKimlik: formData.tc_kimlik,
          teacherTitle: formData.teacherTitle,
          assignedClasses: formData.assignedClasses,
          notes: formData.notes,
          role: 'teacher',
          status: 'active',
          createdAt: serverTimestamp()
        });
      }
      setIsAddModalOpen(false);
      markClean();
      setFormData(initialFormData);
      setEditingTeacher(null);
      
    } catch (error) {
      console.error('Kaydetme hatası:', error);
      setFormError('Kayıt işlemi başarısız oldu: ' + error.message);
    }
    setIsSaving(false);
  };

  const handleDeleteTeacher = async (teacherDocId, name) => {
    setDeleteConfirm({ type: 'teacher', id: teacherDocId, name });
  };

  const confirmDeleteTeacher = async () => {
    if (!deleteConfirm) return;
    try {
      if (deleteConfirm.type === 'teacher') {
        await deleteDoc(doc(db, 'users', deleteConfirm.id));
      } else if (deleteConfirm.type === 'schedule') {
        const id = deleteConfirm.id;
        await deleteDoc(doc(db, 'schedule', id)).catch(() => {});
        await deleteDoc(doc(db, 'schedules', id)).catch(() => {});
        await deleteDoc(doc(db, 'student_schedules', id)).catch(() => {});
        await deleteDoc(doc(db, 'teacher_schedules', id)).catch(() => {});
      }
      setDeleteConfirm(null);
      
    } catch (error) {
      console.error("Silme hatası:", error);
    }
  };

  const getTeacherDocId = (t) => (t?.name || '').split('/').pop();
  const getTeacherName = (t) => t?.fields?.full_name?.stringValue || t?.fields?.fullName?.stringValue || 'İsimsiz';
  const getAssignedClasses = (t) => {
    const raw = t?.fields?.assignedClasses?.stringValue || '';
    return raw.split(',').map(c => c.trim()).filter(Boolean);
  };

  const persistAssignedClasses = async (teacher, classes) => {
    const docId = getTeacherDocId(teacher);
    if (!docId) throw new Error('Öğretmen dokümanı bulunamadı');
    const unique = [...new Set(classes.map(c => c.trim()).filter(Boolean))];
    await updateDoc(doc(db, 'users', docId), {
      assignedClasses: unique.join(', '),
      assigned_classes: unique,
      updatedAt: serverTimestamp()
    });
  };

  const openClassAssignModal = (teacher) => {
    setActiveTeacher(teacher);
    setAssignedClassesDraft(getAssignedClasses(teacher));
    setNewClassInput('');
    setShowNewClassInput(false);
    setFormError('');
    setIsClassAssignModalOpen(true);
  };

  const toggleDraftClass = (cls) => {
    setAssignedClassesDraft(prev =>
      prev.includes(cls) ? prev.filter(c => c !== cls) : [...prev, cls]
    );
    markDirty();
  };

  const handleAddCustomClass = () => {
    const cls = newClassInput.trim().toUpperCase();
    if (!cls) return;
    if (!assignedClassesDraft.includes(cls)) {
      setAssignedClassesDraft(prev => [...prev, cls]);
      markDirty();
    }
    setNewClassInput('');
    setShowNewClassInput(false);
  };

  const handleSaveAssignedClasses = async () => {
    if (!activeTeacher) return;
    setIsSaving(true);
    try {
      await persistAssignedClasses(activeTeacher, assignedClassesDraft);
      setIsClassAssignModalOpen(false);
      markClean();
      
    } catch (error) {
      console.error('Sınıf atama hatası:', error);
      setFormError('Sınıf ataması kaydedilemedi.');
    }
    setIsSaving(false);
  };

  const openTaskModal = (teacher) => {
    setActiveTeacher(teacher);
    setTaskData({ title: '', description: '', dueDate: '' });
    setFormError('');
    setIsTaskModalOpen(true);
  };

  const handleAssignTask = async (e) => {
    e.preventDefault();
    if (!activeTeacher) return;
    setIsSaving(true);
    try {
      await addDoc(collection(db, 'teacher_tasks'), {
        teacherId: getTeacherDocId(activeTeacher),
        teacherName: getTeacherName(activeTeacher),
        title: taskData.title,
        description: taskData.description,
        dueDate: taskData.dueDate || null,
        status: 'pending',
        assignedBy: 'admin',
        createdAt: serverTimestamp()
      });
      setIsTaskModalOpen(false);
      markClean();
    } catch (error) {
      console.error('Görev atama hatası:', error);
      setFormError('Görev ataması kaydedilemedi.');
    }
    setIsSaving(false);
  };

  const handleAssignSchedule = async (e) => {
    e.preventDefault();
    if (!activeTeacher) return;
    setIsSaving(true);

    const selectedLesson = lessonPeriods[scheduleData.lessonIndex];
    const teacherName = getTeacherName(activeTeacher);
    const classId = scheduleData.classId;
    const payload = {
      
      classId: classId,
      class_id: classId,
      className: `${classId} Sınıfı`,
      class_name: `${classId} Sınıfı`,

      teacherId: getTeacherDocId(activeTeacher),
      teacher_id: getTeacherDocId(activeTeacher),
      teacherName: teacherName,
      teacher_name: teacherName,

      courseName: courseName,
      course_name: courseName,
      subject: courseName,
      room: 'Belirtilmedi',
      classroom: 'Belirtilmedi',

      dayIndex: parseInt(scheduleData.dayIndex),
      day_index: parseInt(scheduleData.dayIndex),
      lessonIndex: parseInt(scheduleData.lessonIndex),
      lesson_index: parseInt(scheduleData.lessonIndex),
      period: parseInt(scheduleData.lessonIndex) + 1,
      startTime: selectedLesson.start,
      start_time: selectedLesson.start,
      endTime: selectedLesson.end,
      end_time: selectedLesson.end,

      status: 'active',
      type: 'lesson',
      hasAssignment: false,
      assignmentTitle: '',
      assignmentDetails: '',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    try {
      await addDoc(collection(db, 'schedule'), payload);
      await addDoc(collection(db, 'schedules'), payload);
      await addDoc(collection(db, 'student_schedules'), payload);
      await addDoc(collection(db, 'teacher_schedules'), payload);

      const current = getAssignedClasses(activeTeacher);
      if (!current.includes(scheduleData.classId)) {
        try {
          await persistAssignedClasses(activeTeacher, [...current, scheduleData.classId]);
          fetchTeachers();
        } catch (err) {
          console.warn('assignedClasses güncellenemedi:', err);
        }
      }

      setIsClassSelectModalOpen(false);
      markClean();
      fetchSchedules();
    } catch (error) {
      console.error('Program atanırken hata:', error);
      setFormError('Atama işlemi başarısız oldu.');
    }
    setIsSaving(false);
  };

  const handleRunAiAnalysis = (teacher) => {
    const teacherId = getTeacherDocId(teacher);
    if (teacherId) {
      navigate('/teachers/ai-analysis/' + teacherId);
    } else {
      console.error('Teacher ID bulunamadı.');
    }
  };

  const filteredTeachers = teachers.filter(t => {
    const name = (t.fields?.full_name?.stringValue || t.fields?.fullName?.stringValue || '').toLowerCase();
    const branch = (t.fields?.branch?.stringValue || '').toLowerCase();
    const q = searchQuery.toLowerCase();
    return name.includes(q) || branch.includes(q);
  });

  const currentDate = new Date().toLocaleDateString('tr-TR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

return (
  <>
  <div className="absolute -top-[40px] -bottom-[40px] -left-[40px] -right-[40px] bg-[#FAFAFA] dark:bg-[#0b1120] z-40 overflow-y-auto overflow-x-hidden font-sans custom-scrollbar flex flex-col p-8 md:p-12">

    { }
    <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-10 w-full shrink-0 gap-6">
      <div className="flex items-center gap-5">
        <div className="flex flex-col">
          <span className="text-[13px] font-semibold text-slate-600 dark:text-slate-400 mb-1.5 uppercase tracking-wider">{currentDate}</span>
          <h1 className="text-[34px] font-bold text-slate-900 dark:text-white tracking-tight leading-none">Eğitim Kadrosu</h1>
        </div>
      </div>
    </div>

    { }
    <div className="flex flex-col gap-5 mb-8">
      { }
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-2.5 px-4 py-2 bg-white dark:bg-[#0f172a] rounded-full border border-slate-200 dark:border-white/10 shadow-xs">
          <Users size={14} className="text-slate-900 dark:text-white -ml-[3px]" />
          <span className="text-[13px] font-semibold text-slate-700 dark:text-slate-300">Toplam Öğretmen</span>
          <span className="text-[13px] font-bold text-slate-900 dark:text-white ml-1">{teachers.length}</span>
        </div>

        <button
          onClick={openAddModal}
          className="ml-auto h-9 px-4 text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.06] flex items-center gap-2 rounded-xl text-[13px] font-semibold transition-all border border-slate-200/80 dark:border-white/10 shadow-xs"
        >
          <Plus size={15} strokeWidth={2.5} />
          <span>Yeni Öğretmen Ekle</span>
        </button>
      </div>

      { }
      <div className="flex flex-col lg:flex-row items-center gap-3 w-full">
        <div className="relative flex-1 w-full flex items-center">
          <Search size={18} className="text-slate-400 dark:text-slate-500 absolute left-4 pointer-events-none z-10" />
          <input
            type="text"
            className="w-full py-3 pl-11 pr-10 bg-white dark:bg-[#0f172a] border-0 rounded-2xl text-[14px] font-medium text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none focus:outline-none focus:ring-0 transition-all shadow-xs"
            placeholder="Öğretmen veya branş ara..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3.5 p-1 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors z-10"
            >
              <X size={16} />
            </button>
          )}
        </div>
      </div>
    </div>

    { }
    <div className="bg-white dark:bg-[#0f172a] rounded-[32px] border border-slate-200 dark:border-white/10 flex-1 flex flex-col overflow-hidden relative shadow-sm min-h-0">
      {loading ? (
        <div className="flex flex-col items-center justify-center h-48 w-full text-slate-500">
          <div className="w-8 h-8 rounded-full border-4 border-slate-200 dark:border-white/10 border-t-slate-900 animate-spin mb-4"></div>
          <span className="text-[13px] font-medium">Yükleniyor...</span>
        </div>
      ) : filteredTeachers.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 text-slate-600 dark:text-slate-400">
          <User size={32} className="mb-4 opacity-50 text-slate-700 dark:text-slate-300" />
          <span className="text-[14px] font-medium">Öğretmen bulunamadı.</span>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto overflow-x-auto custom-scrollbar flex flex-col">
          <div className="min-w-[800px] flex-1 flex flex-col relative pb-4">
            { }
            <div className="flex items-center text-slate-400 dark:text-slate-500 bg-transparent px-8 py-5 text-[11px] font-bold uppercase tracking-widest sticky top-0 z-10 shrink-0 border-b border-slate-100 dark:border-white/[0.06]">
              <div style={{ width: '30%' }}>Öğretmen Bilgisi</div>
              <div style={{ width: '20%' }}>Branş</div>
              <div style={{ width: '30%' }}>Atanan Dersler</div>
              <div className="flex-1 text-right">İşlemler</div>
            </div>

            <div className="flex-1 px-4 relative">
              <div className="flex flex-col gap-2 mt-4">
              {filteredTeachers.map((t) => {
                const name = t.fields?.full_name?.stringValue || t.fields?.fullName?.stringValue || 'İsimsiz';
                const branch = t.fields?.branch?.stringValue || 'Branş Belirtilmemiş';
                const pp = t.fields?.profile_image?.stringValue || null;

                const teacherSchedules = schedules.filter(s => s.teacherName === name);

                return (
                  <div key={t.name} className="flex items-center px-4 py-3 hover:bg-slate-50/80 dark:hover:bg-white/[0.03] rounded-[20px] transition-colors border border-transparent hover:border-slate-200/60 dark:hover:border-white/[0.06] group">
                    <div style={{ width: '30%' }} className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-white/[0.06] border border-slate-200 dark:border-white/10 flex items-center justify-center text-slate-500 dark:text-slate-400 overflow-hidden shrink-0">
                        {pp ? <img src={pp} alt="Profile" className="w-full h-full object-cover" /> : <User size={18} />}
                      </div>
                      <span className="font-bold text-[14px] text-slate-900 dark:text-white">{name}</span>
                    </div>
                    <div style={{ width: '20%' }}>
                      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-xl text-[12px] font-bold bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 border border-indigo-200/60 dark:border-indigo-500/20 shadow-2xs">
                        <BookOpen size={13} className="text-indigo-500 shrink-0" />
                        {branch}
                      </span>
                    </div>
                    <div style={{ width: '30%' }}>
                      <div className="flex flex-wrap gap-1.5 max-w-[250px]">
                        {teacherSchedules.length > 0 ? (
                          teacherSchedules.slice(0, 3).map((s, i) => (
                            <span key={i} className="text-[11px] font-bold bg-indigo-50 dark:bg-indigo-500/10 text-indigo-700 dark:text-indigo-400 px-2 py-1 rounded-md border border-indigo-100 dark:border-indigo-500/20">
                              {s.classId} ({days[s.dayIndex]?.slice(0, 3)})
                            </span>
                          ))
                        ) : (
                          <span className="text-[12px] text-slate-400 dark:text-slate-500 font-medium">Ders atanmamış</span>
                        )}
                        {teacherSchedules.length > 3 && (
                          <span className="text-[11px] font-bold bg-slate-100 dark:bg-white/[0.06] text-slate-500 dark:text-slate-400 px-2 py-1 rounded-md">
                            +{teacherSchedules.length - 3} daha
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex-1 flex justify-end">
                      <div className="relative inline-block text-left action-menu-container">
                        <button
                          onClick={() => setOpenActionMenuFor(openActionMenuFor === t.name ? null : t.name)}
                          className="px-4 py-2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.06] text-[12px] font-bold rounded-xl transition-all flex items-center gap-1.5"
                        >
                          İşlem
                          <ChevronDown size={14} className={`transition-transform ${openActionMenuFor === t.name ? 'rotate-180' : ''}`} />
                        </button>
                        
                        {openActionMenuFor === t.name && (
                          <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-white/10 rounded-2xl shadow-2xl z-50 p-1.5 text-left">
                            <button onClick={() => { setOpenActionMenuFor(null); openEditModal(t); }} className="w-full px-3.5 py-2.5 text-[13px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.08] rounded-xl flex items-center gap-3 transition-all active:scale-[0.98]">
                              <Edit2 size={15} className="text-amber-500 shrink-0" /> Bilgileri Düzenle
                            </button>
                            <button onClick={() => { setOpenActionMenuFor(null); openClassAssignModal(t); }} className="w-full px-3.5 py-2.5 text-[13px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.08] rounded-xl flex items-center gap-3 transition-all active:scale-[0.98]">
                              <Briefcase size={15} className="text-indigo-500 shrink-0" /> Sınıf Atama
                            </button>
                            <button onClick={() => { setOpenActionMenuFor(null); openTaskModal(t); }} className="w-full px-3.5 py-2.5 text-[13px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.08] rounded-xl flex items-center gap-3 transition-all active:scale-[0.98]">
                              <CalendarDays size={15} className="text-emerald-500 shrink-0" /> Görev Atama
                            </button>
                            <button onClick={() => { setOpenActionMenuFor(null); setActiveTeacher(t); setIsScheduleModalOpen(true); }} className="w-full px-3.5 py-2.5 text-[13px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.08] rounded-xl flex items-center gap-3 transition-all active:scale-[0.98]">
                              <BookOpen size={15} className="text-blue-500 shrink-0" /> Ders Programı
                            </button>
                            <button onClick={() => { setOpenActionMenuFor(null); handleRunAiAnalysis(t); }} className="w-full px-3.5 py-2.5 text-[13px] font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/[0.08] rounded-xl flex items-center gap-3 transition-all active:scale-[0.98]">
                              <BrainCircuit size={15} className="text-violet-500 shrink-0" /> AI Analiz
                            </button>
                            <div className="my-1 border-t border-slate-200/60 dark:border-white/[0.06] mx-2" />
                            <button onClick={() => { setOpenActionMenuFor(null); handleDeleteTeacher(t.name, name); }} className="w-full px-3.5 py-2.5 text-[13px] font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/15 rounded-xl flex items-center gap-3 transition-all active:scale-[0.98]">
                              <Trash2 size={15} className="shrink-0" /> Öğretmeni Sil
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>

    { }
    {isAddModalOpen && createPortal(
      <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
        <div className="bg-white dark:bg-[#0f172a] rounded-[24px] w-full max-w-[460px] flex flex-col max-h-[90vh] overflow-hidden border border-slate-200/80 dark:border-slate-800/80 shadow-2xl">
          
          { }
          <div className="flex justify-between items-center px-5 py-4 border-b border-slate-100 dark:border-slate-800/60">
            <div className="flex items-center gap-3.5">
              <div className="w-9 h-9 rounded-full bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                {editingTeacher ? <Edit2 size={18} /> : <User size={18} />}
              </div>
              <div>
                <h2 className="text-[16px] font-bold text-slate-900 dark:text-white tracking-tight">
                  {editingTeacher ? 'Öğretmen Bilgilerini Düzenle' : 'Yeni Öğretmen Ekle'}
                </h2>
                <p className="text-[12px] text-slate-500 font-medium mt-0.5">
                  {editingTeacher ? 'Öğretmenin branş ve profil bilgilerini güncelleyin' : 'Eğitim kadrosuna yeni öğretmen kaydı oluşturun'}
                </p>
              </div>
            </div>
            <button 
              onClick={() => { setIsAddModalOpen(false); markClean(); }} 
              className="w-8 h-8 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          { }
          <div className="p-5 overflow-y-auto overflow-x-hidden custom-scrollbar flex-1">
            {formError && (
              <div className="mb-4 p-3 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-rose-600 dark:text-rose-400 text-[12px] font-bold rounded-xl flex items-center justify-between">
                <span>{formError}</span>
                <button type="button" onClick={() => setFormError('')} className="text-rose-500 hover:text-rose-800"><X size={16}/></button>
              </div>
            )}
            <form id="addTeacherForm" onSubmit={handleSaveTeacher} className="flex flex-col gap-3.5 box-border">
              
              { }
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 box-border">
                <div className="box-border">
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Ad Soyad *</label>
                  <input
                    type="text"
                    className="w-full block box-border px-3.5 py-2.5 bg-slate-50 dark:bg-[#151c2c] border border-slate-200 dark:border-slate-700/80 rounded-xl text-sm font-medium text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none focus:bg-white dark:focus:bg-[#0f172a] focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                    placeholder="Örn: Ayşe Yılmaz"
                    value={formData.full_name}
                    onChange={e => {
                      const val = e.target.value;
                      setFormData(prev => ({ ...prev, full_name: val }));
                      markDirty();
                    }}
                    required
                  />
                </div>

                <div className="box-border">
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Branş *</label>
                  <select
                    className="w-full block box-border px-3.5 py-2.5 bg-slate-50 dark:bg-[#151c2c] border border-slate-200 dark:border-slate-700/80 rounded-xl text-sm font-semibold text-slate-900 dark:text-slate-100 outline-none focus:bg-white dark:focus:bg-[#0f172a] focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all cursor-pointer"
                    value={formData.branch}
                    onChange={e => {
                      const val = e.target.value;
                      setFormData(prev => ({ ...prev, branch: val }));
                      markDirty();
                    }}
                    required
                  >
                    <option value="Matematik" className="bg-white dark:bg-[#0f172a] text-slate-900 dark:text-white">Matematik</option>
                    <option value="Fizik" className="bg-white dark:bg-[#0f172a] text-slate-900 dark:text-white">Fizik</option>
                    <option value="Kimya" className="bg-white dark:bg-[#0f172a] text-slate-900 dark:text-white">Kimya</option>
                    <option value="Biyoloji" className="bg-white dark:bg-[#0f172a] text-slate-900 dark:text-white">Biyoloji</option>
                    <option value="Türk Dili ve Edebiyatı" className="bg-white dark:bg-[#0f172a] text-slate-900 dark:text-white">Türk Dili ve Edebiyatı</option>
                    <option value="Tarih" className="bg-white dark:bg-[#0f172a] text-slate-900 dark:text-white">Tarih</option>
                    <option value="Coğrafya" className="bg-white dark:bg-[#0f172a] text-slate-900 dark:text-white">Coğrafya</option>
                    <option value="Felsefe" className="bg-white dark:bg-[#0f172a] text-slate-900 dark:text-white">Felsefe</option>
                    <option value="İngilizce" className="bg-white dark:bg-[#0f172a] text-slate-900 dark:text-white">İngilizce</option>
                    <option value="Almanca" className="bg-white dark:bg-[#0f172a] text-slate-900 dark:text-white">Almanca</option>
                    <option value="Din Kültürü" className="bg-white dark:bg-[#0f172a] text-slate-900 dark:text-white">Din Kültürü</option>
                    <option value="Beden Eğitimi" className="bg-white dark:bg-[#0f172a] text-slate-900 dark:text-white">Beden Eğitimi</option>
                    <option value="Müzik" className="bg-white dark:bg-[#0f172a] text-slate-900 dark:text-white">Müzik</option>
                    <option value="Görsel Sanatlar" className="bg-white dark:bg-[#0f172a] text-slate-900 dark:text-white">Görsel Sanatlar</option>
                    <option value="Bilişim Teknolojileri" className="bg-white dark:bg-[#0f172a] text-slate-900 dark:text-white">Bilişim Teknolojileri</option>
                    <option value="Rehberlik" className="bg-white dark:bg-[#0f172a] text-slate-900 dark:text-white">Rehberlik</option>
                  </select>
                </div>
              </div>

              { }
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 box-border">
                <div className="box-border">
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Telefon Numarası *</label>
                  <input
                    type="text"
                    className="w-full block box-border px-3.5 py-2.5 bg-slate-50 dark:bg-[#151c2c] border border-slate-200 dark:border-slate-700/80 rounded-xl text-sm font-medium text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none focus:bg-white dark:focus:bg-[#0f172a] focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                    placeholder="Örn: 0555 555 55 55"
                    value={formData.phone}
                    onChange={e => {
                      const val = e.target.value;
                      setFormData(prev => ({ ...prev, phone: val }));
                      markDirty();
                    }}
                    required
                  />
                </div>

                <div className="box-border">
                  <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1.5">E-posta Adresi</label>
                  <input
                    type="email"
                    className="w-full block box-border px-3.5 py-2.5 bg-slate-50 dark:bg-[#151c2c] border border-slate-200 dark:border-slate-700/80 rounded-xl text-sm font-medium text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 outline-none focus:bg-white dark:focus:bg-[#0f172a] focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                    placeholder="ogretmen@okul.k12.tr"
                    value={formData.email}
                    onChange={e => {
                      const val = e.target.value;
                      setFormData(prev => ({ ...prev, email: val }));
                      markDirty();
                    }}
                  />
                </div>
              </div>

              { }
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1 ml-0.5">TC Kimlik No</label>
                  <input
                    type="text"
                    maxLength={11}
                    className="w-full px-3.5 py-2 bg-slate-100/70 dark:bg-slate-800/60 border-0 outline-none rounded-xl focus:ring-2 focus:ring-indigo-500/20 text-[13px] font-mono font-bold text-slate-900 dark:text-slate-100 transition-all placeholder:text-slate-400/70 box-border"
                    placeholder="11 Haneli TC Kimlik No"
                    value={formData.tc_kimlik}
                    onChange={e => { setFormData({ ...formData, tc_kimlik: e.target.value }); markDirty(); }}
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1 ml-0.5">Unvan / Rol</label>
                  <select
                    className="w-full px-3.5 py-2 bg-slate-100/70 dark:bg-slate-800/60 border-0 outline-none rounded-xl focus:ring-2 focus:ring-indigo-500/20 text-[13px] font-medium text-slate-900 dark:text-slate-100 transition-all cursor-pointer"
                    value={formData.teacherTitle}
                    onChange={e => { setFormData({ ...formData, teacherTitle: e.target.value }); markDirty(); }}
                  >
                    <option value="Ders Öğretmeni">Ders Öğretmeni</option>
                    <option value="Zümre Başkanı">Zümre Başkanı</option>
                    <option value="Rehber Öğretmen">Rehber Öğretmen</option>
                    <option value="Bölüm Başkanı">Bölüm Başkanı</option>
                    <option value="Kıdemli Öğretmen">Kıdemli Öğretmen</option>
                  </select>
                </div>
              </div>

              { }
              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1 ml-0.5">Atanan Sınıflar (Virgülle Ayırın)</label>
                <input
                  type="text"
                  className="w-full px-3.5 py-2 bg-slate-100/70 dark:bg-slate-800/60 border-0 outline-none rounded-xl focus:ring-2 focus:ring-indigo-500/20 text-[13px] font-normal text-slate-900 dark:text-slate-100 transition-all placeholder:text-slate-400/70 box-border"
                  placeholder="Örn: 9A, 10B, 11C"
                  value={formData.assignedClasses}
                  onChange={e => { setFormData({ ...formData, assignedClasses: e.target.value }); markDirty(); }}
                />
              </div>

              { }
              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1 ml-0.5">Notlar / Özel Açıklama</label>
                <textarea
                  rows="2"
                  className="w-full px-3.5 py-2 bg-slate-100/70 dark:bg-slate-800/60 border-0 outline-none rounded-xl focus:ring-2 focus:ring-indigo-500/20 text-[13px] font-normal text-slate-900 dark:text-slate-100 resize-none transition-all placeholder:text-slate-400/70 box-border"
                  placeholder="Öğretmen hakkında özel notlar..."
                  value={formData.notes}
                  onChange={e => { setFormData({ ...formData, notes: e.target.value }); markDirty(); }}
                ></textarea>
              </div>

            </form>
          </div>

          { }
          <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-[#0f172a] flex justify-end gap-3 rounded-b-[24px]">
            <button 
              type="button"
              onClick={() => { setIsAddModalOpen(false); markClean(); }} 
              className="px-4 py-2 text-[12px] font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-colors"
            >
              İptal Et
            </button>
            <button 
              form="addTeacherForm" 
              type="submit" 
              className="px-6 py-2 text-[12px] font-bold text-white bg-slate-900 dark:bg-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-200 active:scale-[0.98] rounded-xl transition-all disabled:opacity-50 min-w-[110px] flex justify-center items-center" 
              disabled={isSaving}
            >
              {isSaving ? 'Kaydediliyor...' : editingTeacher ? 'Değişiklikleri Kaydet' : 'Öğretmeni Ekle'}
            </button>
          </div>

        </div>
      </div>,
      document.body
    )}

    { }
    {isScheduleModalOpen && activeTeacher && createPortal(
      <div className="fixed inset-0 bg-[#FAFAFA] dark:bg-[#0b1120] z-[9999] flex flex-col p-6 md:p-10 animate-in fade-in duration-200 overflow-hidden">
        <div className="flex items-center justify-between mb-6 w-full shrink-0">
          <div className="flex items-center gap-4">
            <button onClick={() => { setIsScheduleModalOpen(false); markClean(); }} className="w-10 h-10 bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-white/10 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-900 dark:text-white transition-colors shadow-xs shrink-0">
              <ChevronLeft size={20} />
            </button>
            <div className="flex flex-col">
              <span className="text-[12px] font-semibold text-slate-500 uppercase tracking-wider">{currentDate}</span>
              <h1 className="text-[26px] font-bold text-slate-900 dark:text-white tracking-tight leading-none">Öğretmen Ders Programı</h1>
            </div>
          </div>
        </div>

        <div className="flex bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm flex-1 w-full min-h-0 overflow-hidden">

          <div className="w-[240px] flex-shrink-0 flex flex-col border-r border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-[#1e293b]/50">
            <div className="p-3.5 border-b border-slate-200 dark:border-white/10 shrink-0">
              <h3 className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest px-2">Öğretmen Seçimi</h3>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
              <div className="flex flex-col gap-1">
                {teachers.map(t => {
                  const name = t.fields?.full_name?.stringValue || t.fields?.fullName?.stringValue || 'İsimsiz';
                  const activeName = activeTeacher.fields?.full_name?.stringValue || activeTeacher.fields?.fullName?.stringValue || 'İsimsiz';
                  const isActive = name === activeName;
                  return (
                    <button
                      key={t.name}
                      onClick={() => setActiveTeacher(t)}
                      className={`w-full text-left px-3.5 py-2.5 rounded-xl text-[13px] font-bold transition-all ${isActive ? 'bg-white dark:bg-[#0f172a] text-indigo-600 dark:text-indigo-400 shadow-xs border border-slate-200 dark:border-white/10' : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100/70 dark:hover:bg-slate-800/50 border border-transparent'}`}
                    >
                      {name}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          <div className="flex-1 flex flex-col min-h-0 bg-white dark:bg-[#0f172a]">
            <div className="flex items-center justify-between px-6 py-3.5 border-b border-slate-200 dark:border-slate-800 shrink-0">
              <h2 className="text-[16px] font-bold text-slate-900 dark:text-white flex items-center gap-2.5 flex-wrap">
                <span className="font-bold">Öğretmen:</span>
                <span className="font-medium text-slate-700 dark:text-slate-200">{getTeacherName(activeTeacher)}</span>
                <span className="text-slate-400 font-normal text-[13px]">({activeTeacher.fields?.branch?.stringValue || 'Branş'})</span>
              </h2>
            </div>
            <div className="flex-1 overflow-auto custom-scrollbar p-0 bg-white dark:bg-[#0f172a] select-none">
              <table className="w-full text-left border-collapse min-w-[800px] h-full">
                <thead className="sticky top-0 bg-white dark:bg-[#0f172a] z-20 shadow-xs">
                  <tr>
                    <th className="px-4 py-3 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest border-b border-r border-slate-200 dark:border-slate-800 w-24 text-center bg-slate-50/70 dark:bg-[#0f172a]">Saat</th>
                    {days.map(day => (
                      <th key={day} className="px-4 py-3 text-[12px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-widest border-b border-r border-slate-200 dark:border-slate-800 last:border-r-0 text-center w-[18%] bg-slate-50/70 dark:bg-[#0f172a]">{day}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/80 bg-white dark:bg-[#0f172a]">
                  {lessonPeriods.map((period, pIdx) => (
                    <tr key={pIdx} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors bg-white dark:bg-[#0f172a]">
                      <td className="px-2 py-2.5 border-r border-slate-200 dark:border-slate-800 text-center align-middle bg-slate-50/50 dark:bg-[#0f172a]">
                        <div className="font-bold text-slate-800 dark:text-slate-200 text-[12.5px]">{period.label}</div>
                        <div className="text-[10.5px] font-medium text-slate-500 font-mono">{period.time}</div>
                      </td>
                      {days.map((day, dIdx) => {
                        const schedule = schedules.find(s => s.teacherId === getTeacherDocId(activeTeacher) && s.dayIndex === dIdx && s.lessonIndex === pIdx);

                        return (
                          <td key={dIdx} className="p-1.5 border-r border-slate-200 dark:border-slate-800 last:border-r-0 relative group h-[60px] align-middle bg-white dark:bg-[#0f172a]">
                            {schedule ? (
                              <div className="h-full bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 rounded-xl flex flex-col items-center justify-center relative overflow-hidden transition-all group/item">
                                <div className="font-bold text-indigo-700 dark:text-indigo-400 text-[12px] leading-tight text-center truncate w-full px-1">{schedule.classId} Sınıfı</div>
                                <div className="font-medium text-slate-500 dark:text-slate-400 text-[10px] truncate w-full text-center px-1">{schedule.courseName || schedule.course_name}</div>
                                <button
                                  onClick={() => setDeleteConfirm({ type: 'schedule', id: schedule.id, name: schedule.classId })}
                                  className="absolute inset-0 w-full h-full bg-rose-600 text-white opacity-0 group-hover/item:opacity-100 transition-opacity flex items-center justify-center"
                                  title="Dersi Kaldır"
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            ) : (
                              <div className="h-full rounded-xl border border-dashed border-slate-200 dark:border-slate-800/80 hover:border-indigo-400 dark:hover:border-indigo-400 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all bg-transparent hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer"
                                onClick={() => {
                                  setScheduleData({ ...scheduleData, dayIndex: dIdx, lessonIndex: pIdx });
                                  setIsClassSelectModalOpen(true);
                                }}
                              >
                                <span className="flex items-center gap-1 text-[11px] font-bold text-slate-500 hover:text-indigo-600">
                                  <Plus size={14} /> Ata
                                </span>
                              </div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>,
      document.body
    )}

    { }
    {isClassSelectModalOpen && createPortal(
      <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
        <div className="bg-white dark:bg-[#0f172a] rounded-[24px] w-full max-w-sm shadow-2xl flex flex-col overflow-hidden border border-slate-200 dark:border-slate-800">
          <div className="flex justify-between items-center px-5 py-4 border-b border-slate-100 dark:border-slate-800">
            <h2 className="text-[16px] font-bold text-slate-900 dark:text-white">Sınıf Seç</h2>
            <button onClick={() => setIsClassSelectModalOpen(false)} className="w-8 h-8 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors">
              <X size={16} />
            </button>
          </div>
          <div className="p-6 box-border">
            {formError && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-[12px] font-bold rounded-xl flex items-center justify-between">
                <span>{formError}</span>
                <button type="button" onClick={() => setFormError('')} className="text-rose-500 hover:text-rose-800"><X size={16} /></button>
              </div>
            )}
            <form id="classForm" onSubmit={handleAssignSchedule} className="flex flex-col gap-4 box-border">
              <div className="w-full box-border">
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Hangi sınıfa ders atanacak? *</label>
                <select
                  className="w-full box-border px-3.5 py-2.5 bg-slate-100/80 dark:bg-slate-800/80 border border-transparent dark:border-slate-700/60 outline-none rounded-xl focus:ring-2 focus:ring-indigo-500/20 text-[13px] font-semibold text-slate-900 dark:text-white transition-all cursor-pointer"
                  value={scheduleData.classId}
                  onChange={(e) => setScheduleData({ ...scheduleData, classId: e.target.value })}
                >
                  {classesList.map(c => (
                    <option key={c} value={c} className="bg-white dark:bg-[#0f172a] text-slate-900 dark:text-white py-1">
                      {c} Sınıfı
                    </option>
                  ))}
                </select>
              </div>
            </form>
          </div>
          <div className="px-5 py-4 bg-slate-50/50 dark:bg-[#0f172a] border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3 rounded-b-[24px]">
            <button onClick={() => setIsClassSelectModalOpen(false)} className="px-4 py-2 text-[12px] font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-colors">
              İptal
            </button>
            <button
              form="classForm"
              type="submit"
              className="px-5 py-2 text-[12px] font-bold text-white bg-slate-900 dark:bg-white dark:text-slate-900 rounded-xl hover:bg-slate-800 transition-all disabled:opacity-50"
              disabled={isSaving}
            >
              {isSaving ? 'Kaydediliyor...' : 'Sınıfı Ata'}
            </button>
          </div>
        </div>
      </div>,
      document.body
    )}

    { }
    {isClassAssignModalOpen && activeTeacher && createPortal(
      <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
        <div className="bg-white dark:bg-[#0f172a] rounded-[24px] w-full max-w-md shadow-2xl flex flex-col overflow-hidden border border-slate-200 dark:border-slate-800">
          <div className="flex justify-between items-center px-5 py-4 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-baseline gap-2.5">
              <h2 className="text-[16px] font-bold text-slate-900 dark:text-white leading-none">Sınıf Atama</h2>
              <span className="text-slate-400 dark:text-slate-600 text-[12px] leading-none">•</span>
              <div className="text-[13px] leading-none">
                <span className="font-bold text-slate-900 dark:text-white">Öğretmen: </span>
                <span className="font-medium text-slate-500 dark:text-slate-400">{getTeacherName(activeTeacher)}</span>
              </div>
            </div>
            <button onClick={() => { setIsClassAssignModalOpen(false); markClean(); }} className="w-8 h-8 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors">
              <X size={16} />
            </button>
          </div>
          <div className="p-5 max-h-[50vh] overflow-y-auto custom-scrollbar">
            {formError && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-[12px] font-bold rounded-xl">{formError}</div>
            )}
            <div className="flex flex-col gap-3">
              <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400">Atanmış Sınıflar</label>
              <div className="flex flex-wrap gap-2">
                {[...new Set([...classesList, ...assignedClassesDraft])].map(cls => {
                  const selected = assignedClassesDraft.includes(cls);
                  return (
                    <button
                      key={cls}
                      type="button"
                      onClick={() => toggleDraftClass(cls)}
                      className={`px-3.5 py-1.5 rounded-xl text-[12px] font-bold border transition-all ${selected ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-slate-900 dark:border-white' : 'bg-slate-100/70 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 border-slate-200/80 dark:border-slate-700 hover:border-slate-400'}`}
                    >
                      {cls}
                    </button>
                  );
                })}
                {showNewClassInput ? (
                  <div className="flex items-center gap-1.5">
                    <input
                      autoFocus
                      type="text"
                      value={newClassInput}
                      onChange={e => setNewClassInput(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleAddCustomClass(); } }}
                      placeholder="Örn: 9C"
                      className="w-20 px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 border-0 outline-none rounded-xl text-[12px] font-bold text-slate-900 dark:text-white"
                    />
                    <button type="button" onClick={handleAddCustomClass} className="px-3 py-1.5 bg-slate-900 dark:bg-white dark:text-slate-900 text-white rounded-xl text-[12px] font-bold">Ekle</button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowNewClassInput(true)}
                    className="px-3 py-1.5 rounded-xl text-[12px] font-bold border border-dashed border-slate-300 text-slate-500 hover:border-slate-500 hover:text-slate-700 dark:text-slate-300 transition-all flex items-center gap-1"
                  >
                    <Plus size={13} /> Yeni
                  </button>
                )}
              </div>
              {assignedClassesDraft.length > 0 && (
                <p className="text-[12px] font-medium text-slate-500 mt-1">Seçili: <span className="font-bold text-slate-800 dark:text-slate-200">{assignedClassesDraft.join(', ')}</span></p>
              )}
            </div>
          </div>
          <div className="px-5 py-4 bg-slate-50/50 dark:bg-[#0f172a] border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3 rounded-b-[24px]">
            <button onClick={() => { setIsClassAssignModalOpen(false); markClean(); }} className="px-4 py-2 text-[12px] font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-colors">
              İptal
            </button>
            <button
              onClick={handleSaveAssignedClasses}
              disabled={isSaving}
              className="px-5 py-2 text-[12px] font-bold text-white bg-slate-900 dark:bg-white dark:text-slate-900 rounded-xl hover:bg-slate-800 transition-all disabled:opacity-50"
            >
              {isSaving ? 'Kaydediliyor...' : 'Atamayı Kaydet'}
            </button>
          </div>
        </div>
      </div>,
      document.body
    )}

    { }
    {isTaskModalOpen && activeTeacher && createPortal(
      <div 
        className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4"
        onClick={() => { setIsTaskModalOpen(false); markClean(); }}
      >
        <div 
          className="bg-white dark:bg-[#0f172a] rounded-[24px] w-full max-w-md shadow-2xl flex flex-col overflow-hidden border border-slate-200 dark:border-slate-800"
          onClick={e => e.stopPropagation()}
        >
          { }
          <div className="flex justify-between items-center px-5 py-4 border-b border-slate-100 dark:border-slate-800/60">
            <div className="flex items-baseline gap-2.5">
              <h2 className="text-[16px] font-bold text-slate-900 dark:text-white leading-none">Görev Atama</h2>
              <span className="text-slate-400 dark:text-slate-600 text-[12px] leading-none">•</span>
              <div className="text-[13px] leading-none">
                <span className="font-bold text-slate-900 dark:text-white">Öğretmen: </span>
                <span className="font-medium text-slate-500 dark:text-slate-400">{getTeacherName(activeTeacher)}</span>
              </div>
            </div>
            <button onClick={() => { setIsTaskModalOpen(false); markClean(); }} className="w-8 h-8 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center transition-colors">
              <X size={16} />
            </button>
          </div>

          { }
          <div className="p-5">
            {formError && (
              <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-[12px] font-bold rounded-xl flex items-center justify-between">
                <span>{formError}</span>
                <button type="button" onClick={() => setFormError('')} className="text-rose-500 hover:text-rose-800"><X size={16}/></button>
              </div>
            )}
            <form id="taskAssignForm" onSubmit={handleAssignTask} className="flex flex-col gap-3 box-border">
              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1 ml-0.5">Görev Başlığı *</label>
                <input
                  type="text"
                  name="title"
                  required
                  placeholder="Örn: 9A sınav sonuçlarını gir"
                  className="w-full px-3.5 py-2 bg-slate-100/70 dark:bg-slate-800/60 border-0 outline-none rounded-xl focus:ring-2 focus:ring-indigo-500/20 text-[13px] font-normal text-slate-900 dark:text-slate-100 transition-all placeholder:text-slate-400/70 box-border"
                  value={taskData.title}
                  onChange={e => {
                    const val = e.target.value;
                    setTaskData(prev => ({ ...prev, title: val }));
                    markDirty();
                  }}
                />
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1 ml-0.5">Açıklama</label>
                <textarea
                  name="description"
                  rows="3"
                  placeholder="Görev detayları..."
                  className="w-full px-3.5 py-2 bg-slate-100/70 dark:bg-slate-800/60 border-0 outline-none rounded-xl focus:ring-2 focus:ring-indigo-500/20 text-[13px] font-normal text-slate-900 dark:text-slate-100 resize-none transition-all placeholder:text-slate-400/70 box-border"
                  value={taskData.description}
                  onChange={e => {
                    const val = e.target.value;
                    setTaskData(prev => ({ ...prev, description: val }));
                    markDirty();
                  }}
                ></textarea>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-600 dark:text-slate-400 mb-1 ml-0.5">Son Tarih</label>
                <input
                  type="date"
                  name="dueDate"
                  className="w-full px-3.5 py-2 bg-slate-100/70 dark:bg-slate-800/60 border-0 outline-none rounded-xl focus:ring-2 focus:ring-indigo-500/20 text-[13px] font-normal text-slate-900 dark:text-slate-100 transition-all box-border cursor-pointer"
                  value={taskData.dueDate}
                  onChange={e => {
                    const val = e.target.value;
                    setTaskData(prev => ({ ...prev, dueDate: val }));
                    markDirty();
                  }}
                />
              </div>
            </form>
          </div>

          { }
          <div className="px-5 py-4 border-t border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-[#0f172a] flex justify-end gap-3 rounded-b-[24px]">
            <button
              type="button"
              onClick={() => { setIsTaskModalOpen(false); markClean(); }}
              className="px-4 py-2 text-[12px] font-bold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-xl transition-colors"
            >
              İptal
            </button>
            <button
              form="taskAssignForm"
              type="submit"
              disabled={isSaving || !taskData.title.trim()}
              className="px-6 py-2 text-[12px] font-bold text-white bg-slate-900 dark:bg-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-200 active:scale-[0.98] rounded-xl transition-all disabled:opacity-50 min-w-[100px] flex justify-center items-center"
            >
              {isSaving ? 'Atanıyor...' : 'Görevi Ata'}
            </button>
          </div>
        </div>
      </div>,
      document.body
    )}

    { }
    {deleteConfirm && createPortal(
      <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
        <div className="bg-white dark:bg-[#0f172a] rounded-[24px] w-full max-w-sm shadow-2xl p-6 flex flex-col gap-4 border border-slate-200 dark:border-slate-800">
          <h3 className="text-[16px] font-bold text-slate-900 dark:text-white">
            {deleteConfirm.type === 'teacher' ? 'Öğretmeni Sil' : 'Dersi Kaldır'}
          </h3>
          <p className="text-[13px] text-slate-600 dark:text-slate-400">
            <strong className="text-slate-900 dark:text-white">{deleteConfirm.name}</strong> kalıcı olarak silinecektir. Bu işlem geri alınamaz. Onaylıyor musunuz?
          </p>
          <div className="flex justify-end gap-3 mt-2">
            <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 text-[12px] font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">İptal</button>
            <button onClick={confirmDeleteTeacher} className="px-5 py-2 text-[12px] font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-colors">Sil</button>
          </div>
        </div>
      </div>,
      document.body
    )}

    <UnsavedBanner />
  </div>
  </>
);
};

export default TeacherManagementAdminView;
