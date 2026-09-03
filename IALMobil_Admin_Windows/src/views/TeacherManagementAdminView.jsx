import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User,
  Phone,
  Plus,
  Trash2,
  Search,
  Briefcase,
  BookOpen,
  BrainCircuit,
  X,
  ChevronLeft,
  CalendarDays,
  Users,
  Pencil,
  Mail,
  FileText,
  Check,
  RefreshCw
} from 'lucide-react';
import { db, mapSdkToRest } from '../services/firebaseConfig';
import {
  collection,
  onSnapshot,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  serverTimestamp,
  query
} from 'firebase/firestore';
import {
  Panel,
  PanelHeader,
  PanelFooter,
  Button,
  IconButton,
  FieldRows,
  Field,
  Input,
  Textarea,
  Select,
  Badge,
  EmptyState,
  Modal,
  Toast
} from '../components/ui/panel';
import { cx, eyebrow, hairline, divider } from '../components/ui/tokens';

const LESSON_PERIODS = [
  { label: '1. Ders', time: '08:30 - 09:15', start: '08:30', end: '09:15' },
  { label: '2. Ders', time: '09:30 - 10:15', start: '09:30', end: '10:15' },
  { label: '3. Ders', time: '10:30 - 11:15', start: '10:30', end: '11:15' },
  { label: '4. Ders', time: '11:30 - 12:15', start: '11:30', end: '12:15' },
  { label: '5. Ders', time: '13:00 - 13:45', start: '13:00', end: '13:45' },
  { label: '6. Ders', time: '14:00 - 14:45', start: '14:00', end: '14:45' },
  { label: '7. Ders', time: '15:00 - 15:45', start: '15:00', end: '15:45' },
  { label: '8. Ders', time: '16:00 - 16:45', start: '16:00', end: '16:45' }
];

const DAYS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma'];
const CLASSES_LIST = ['9A', '9B', '10A', '10B', '11A', '11B', '12A', '12B'];

const BRANCH_OPTIONS = [
  'Tümü',
  'Matematik',
  'Fizik',
  'Kimya',
  'Biyoloji',
  'Türk Dili ve Edebiyatı',
  'Tarih',
  'Coğrafya',
  'Felsefe',
  'İngilizce',
  'Almanca',
  'Din Kültürü',
  'Beden Eğitimi',
  'Müzik',
  'Görsel Sanatlar',
  'Bilişim Teknolojileri',
  'Rehberlik'
];

const TEACHER_TITLES = [
  'Ders Öğretmeni',
  'Zümre Başkanı',
  'Rehber Öğretmen',
  'Bölüm Başkanı',
  'Kıdemli Öğretmen'
];

const INITIAL_FORM_DATA = {
  full_name: '',
  branch: 'Matematik',
  phone: '',
  email: '',
  tc_kimlik: '',
  teacherTitle: 'Ders Öğretmeni',
  assignedClasses: '',
  notes: ''
};

const TeacherManagementAdminView = () => {
  const navigate = useNavigate();

  const [teachers, setTeachers] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedBranchFilter, setSelectedBranchFilter] = useState('Tümü');

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [isClassSelectModalOpen, setIsClassSelectModalOpen] = useState(false);
  const [isClassAssignModalOpen, setIsClassAssignModalOpen] = useState(false);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);

  const [activeTeacher, setActiveTeacher] = useState(null);
  const [editingTeacher, setEditingTeacher] = useState(null);
  const [formData, setFormData] = useState(INITIAL_FORM_DATA);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const [assignedClassesDraft, setAssignedClassesDraft] = useState([]);
  const [newClassInput, setNewClassInput] = useState('');
  const [showNewClassInput, setShowNewClassInput] = useState(false);

  const [taskData, setTaskData] = useState({ title: '', description: '', dueDate: '' });

  const [scheduleData, setScheduleData] = useState({ classId: '9A', dayIndex: 0, lessonIndex: 0 });

  const [toast, setToast] = useState({ open: false, message: '', tone: 'success' });
  const showToast = (message, tone = 'success') => {
    setToast({ open: true, message, tone });
    setTimeout(() => setToast((prev) => ({ ...prev, open: false })), 3500);
  };

  useEffect(() => {
    setLoading(true);

    const unsubUsers = onSnapshot(
      collection(db, 'users'),
      (snapshot) => {
        const allRestUsers = snapshot.docs.map(mapSdkToRest);
        const filtered = allRestUsers.filter((u) => {
          const role = u.fields?.role?.stringValue?.toLowerCase() || '';
          const branch = u.fields?.branch?.stringValue || '';
          return role === 'teacher' || role === 'öğretmen' || (role === 'admin' && Boolean(branch)) || (u.fields?.fullName?.stringValue === 'Seher Şanlı');
        });

        const extraTeachersList = [
          { name: 'Seçil Özkan', branch: 'Görsel Sanatlar', contract_end: '06.11.2026', phone: '', email: 'secilozkan@corumbogazici.com' },
          { name: 'Mesut Çolak', branch: 'Matematik', contract_end: '01.09.2027', phone: '', email: 'mesutcolak@corumbogazici.com' },
          { name: 'Hasan Barış Karataş', branch: 'Biyoloji', contract_end: '01.09.2027', phone: '', email: 'hasanbaris@corumbogazici.com' },
          { name: 'Selim Kurtaran', branch: 'Fizik', contract_end: '30.06.2027', phone: '', email: 'selimkurtaran@corumbogazici.com' },
          { name: 'Oya Sadıç Erocağı', branch: 'İngilizce', contract_end: '01.09.2027', phone: '', email: 'oyasadic@corumbogazici.com' },
          { name: 'Mustafa Yalçın', branch: 'Matematik', contract_end: '01.09.2027', phone: '', email: 'mustafayalcin@corumbogazici.com' }
        ];

        extraTeachersList.forEach(et => {
          const exists = filtered.some(u => {
            const n = u.fields?.full_name?.stringValue || u.fields?.fullName?.stringValue || u.fields?.name?.stringValue || '';
            return n.toLowerCase() === et.name.toLowerCase();
          });
          if (!exists) {
            filtered.push({
              name: 'projects/bgz-mobil/databases/(default)/documents/users/' + et.name.toLowerCase().replace(/[^a-z0-9]/g, '_'),
              fields: {
                full_name: { stringValue: et.name },
                fullName: { stringValue: et.name },
                name: { stringValue: et.name },
                branch: { stringValue: et.branch },
                role: { stringValue: 'teacher' },
                status: { stringValue: 'approved' },
                contract_end: { stringValue: et.contract_end },
                phone: { stringValue: et.phone },
                email: { stringValue: et.email },
                teacherTitle: { stringValue: 'Ders Öğretmeni' }
              }
            });
          }
        });

        setTeachers(filtered);
        setLoading(false);
      },
      (error) => {
        console.error('Öğretmenler dinlenirken hata:', error);
        setLoading(false);
      }
    );

    const unsubSchedule = onSnapshot(
      query(collection(db, 'schedule')),
      (snap) => {
        const data1 = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setSchedules(data1);
      },
      (err) => console.log('Schedule listen err:', err)
    );

    const unsubSchedules = onSnapshot(
      query(collection(db, 'schedules')),
      (snap) => {
        const data2 = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        if (data2.length > 0) {
          setSchedules((prev) => {
            const merged = [...prev];
            data2.forEach((item) => {
              if (
                !merged.some(
                  (m) =>
                    m.id === item.id ||
                    (m.teacherId === item.teacherId &&
                      m.dayIndex === item.dayIndex &&
                      m.lessonIndex === item.lessonIndex)
                )
              ) {
                merged.push(item);
              }
            });
            return merged;
          });
        }
      },
      (err) => console.log('Schedules listen err:', err)
    );

    return () => {
      unsubUsers();
      unsubSchedule();
      unsubSchedules();
    };
  }, []);

  const getTeacherDocId = (t) => (t?.name || '').split('/').pop();
  const getTeacherName = (t) =>
    t?.fields?.full_name?.stringValue || t?.fields?.fullName?.stringValue || 'İsimsiz';
  const getAssignedClasses = (t) => {
    const raw = t?.fields?.assignedClasses?.stringValue || '';
    return raw
      .split(',')
      .map((c) => c.trim())
      .filter(Boolean);
  };

  const openAddModal = () => {
    setEditingTeacher(null);
    setFormData(INITIAL_FORM_DATA);
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
    setIsAddModalOpen(true);
  };

  const handleSaveTeacher = async (e) => {
    e.preventDefault();
    if (!formData.full_name.trim()) {
      showToast('Lütfen ad ve soyad alanını doldurun.', 'danger');
      return;
    }

    setIsSaving(true);
    try {
      if (editingTeacher) {
        const docId = getTeacherDocId(editingTeacher);
        await updateDoc(doc(db, 'users', docId), {
          full_name: formData.full_name.trim(),
          fullName: formData.full_name.trim(),
          branch: formData.branch,
          phone: formData.phone.trim(),
          email: formData.email.trim(),
          tc_kimlik: formData.tc_kimlik.trim(),
          tcKimlik: formData.tc_kimlik.trim(),
          teacherTitle: formData.teacherTitle,
          assignedClasses: formData.assignedClasses.trim(),
          notes: formData.notes.trim(),
          updatedAt: serverTimestamp()
        });
        showToast('Öğretmen bilgileri güncellendi.');
      } else {
        await addDoc(collection(db, 'users'), {
          full_name: formData.full_name.trim(),
          fullName: formData.full_name.trim(),
          branch: formData.branch,
          phone: formData.phone.trim(),
          email: formData.email.trim(),
          tc_kimlik: formData.tc_kimlik.trim(),
          tcKimlik: formData.tc_kimlik.trim(),
          teacherTitle: formData.teacherTitle,
          assignedClasses: formData.assignedClasses.trim(),
          notes: formData.notes.trim(),
          role: 'teacher',
          status: 'active',
          createdAt: serverTimestamp()
        });
        showToast('Yeni öğretmen kadroya eklendi.');
      }
      setIsAddModalOpen(false);
      setEditingTeacher(null);
    } catch (error) {
      console.error('Kaydetme hatası:', error);
      showToast('Kayıt esnasında bir hata oluştu: ' + error.message, 'danger');
    }
    setIsSaving(false);
  };

  const confirmDeleteAction = async () => {
    if (!deleteConfirm) return;
    try {
      if (deleteConfirm.type === 'teacher') {
        await deleteDoc(doc(db, 'users', deleteConfirm.id));
        showToast('Öğretmen kaydı silindi.');
      } else if (deleteConfirm.type === 'schedule') {
        const id = deleteConfirm.id;
        await deleteDoc(doc(db, 'schedule', id)).catch(() => {});
        await deleteDoc(doc(db, 'schedules', id)).catch(() => {});
        await deleteDoc(doc(db, 'student_schedules', id)).catch(() => {});
        await deleteDoc(doc(db, 'teacher_schedules', id)).catch(() => {});
        showToast('Ders ataması kaldırıldı.');
      }
      setDeleteConfirm(null);
    } catch (error) {
      console.error('Silme hatası:', error);
      showToast('Silme işlemi başarısız oldu.', 'danger');
    }
  };

  const openClassAssignModal = (teacher) => {
    setActiveTeacher(teacher);
    setAssignedClassesDraft(getAssignedClasses(teacher));
    setNewClassInput('');
    setShowNewClassInput(false);
    setIsClassAssignModalOpen(true);
  };

  const toggleDraftClass = (cls) => {
    setAssignedClassesDraft((prev) =>
      prev.includes(cls) ? prev.filter((c) => c !== cls) : [...prev, cls]
    );
  };

  const handleAddCustomClass = () => {
    const cls = newClassInput.trim().toUpperCase();
    if (!cls) return;
    if (!assignedClassesDraft.includes(cls)) {
      setAssignedClassesDraft((prev) => [...prev, cls]);
    }
    setNewClassInput('');
    setShowNewClassInput(false);
  };

  const handleSaveAssignedClasses = async () => {
    if (!activeTeacher) return;
    setIsSaving(true);
    try {
      const docId = getTeacherDocId(activeTeacher);
      const unique = [...new Set(assignedClassesDraft.map((c) => c.trim()).filter(Boolean))];
      await updateDoc(doc(db, 'users', docId), {
        assignedClasses: unique.join(', '),
        assigned_classes: unique,
        updatedAt: serverTimestamp()
      });
      showToast('Atanan sınıflar güncellendi.');
      setIsClassAssignModalOpen(false);
    } catch (error) {
      console.error('Sınıf atama hatası:', error);
      showToast('Sınıf ataması kaydedilemedi.', 'danger');
    }
    setIsSaving(false);
  };

  const openTaskModal = (teacher) => {
    setActiveTeacher(teacher);
    setTaskData({ title: '', description: '', dueDate: '' });
    setIsTaskModalOpen(true);
  };

  const handleAssignTask = async (e) => {
    e.preventDefault();
    if (!activeTeacher || !taskData.title.trim()) return;
    setIsSaving(true);
    try {
      await addDoc(collection(db, 'teacher_tasks'), {
        teacherId: getTeacherDocId(activeTeacher),
        teacherName: getTeacherName(activeTeacher),
        title: taskData.title.trim(),
        description: taskData.description.trim(),
        dueDate: taskData.dueDate || null,
        status: 'pending',
        assignedBy: 'admin',
        createdAt: serverTimestamp()
      });
      showToast('Görev öğretmene iletildi.');
      setIsTaskModalOpen(false);
    } catch (error) {
      console.error('Görev atama hatası:', error);
      showToast('Görev atanamadı.', 'danger');
    }
    setIsSaving(false);
  };

  const handleAssignSchedule = async (e) => {
    e.preventDefault();
    if (!activeTeacher) return;
    setIsSaving(true);

    const selectedLesson = LESSON_PERIODS[scheduleData.lessonIndex];
    const teacherName = getTeacherName(activeTeacher);
    const classId = scheduleData.classId;
    const courseName = activeTeacher.fields?.branch?.stringValue || 'Ders';

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
          const docId = getTeacherDocId(activeTeacher);
          const unique = [...new Set([...current, scheduleData.classId])];
          await updateDoc(doc(db, 'users', docId), {
            assignedClasses: unique.join(', '),
            assigned_classes: unique,
            updatedAt: serverTimestamp()
          });
        } catch (err) {
          console.warn('assignedClasses güncellenemedi:', err);
        }
      }

      setIsClassSelectModalOpen(false);
      showToast(`${classId} sınıfına ${DAYS[scheduleData.dayIndex]} dersi atandı.`);
    } catch (error) {
      console.error('Program atanırken hata:', error);
      showToast('Ders atama işlemi başarısız oldu.', 'danger');
    }
    setIsSaving(false);
  };

  const handleRunAiAnalysis = (teacher) => {
    const teacherId = getTeacherDocId(teacher);
    if (teacherId) {
      navigate('/teachers/ai-analysis/' + teacherId);
    }
  };

  const filteredTeachers = useMemo(() => {
    return teachers.filter((t) => {
      const name = (t.fields?.full_name?.stringValue || t.fields?.fullName?.stringValue || '').toLowerCase();
      const branch = (t.fields?.branch?.stringValue || '').toLowerCase();
      const phone = (t.fields?.phone?.stringValue || '').toLowerCase();
      const q = searchQuery.trim().toLowerCase();

      const matchesSearch = !q || name.includes(q) || branch.includes(q) || phone.includes(q);
      const matchesBranch =
        selectedBranchFilter === 'Tümü' ||
        (t.fields?.branch?.stringValue || '').toLowerCase() === selectedBranchFilter.toLowerCase();

      return matchesSearch && matchesBranch;
    });
  }, [teachers, searchQuery, selectedBranchFilter]);

  const today = new Date().toLocaleDateString('tr-TR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });

  return (
    <div className="w-full flex flex-col gap-5 pb-4">
      <Toast open={toast.open} message={toast.message} tone={toast.tone} />

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="m-0 text-[27px] leading-none font-semibold tracking-[-0.03em] text-slate-900 dark:text-white">
            Öğretmenler
          </h1>
          <p className="m-0 mt-2 text-[12.5px] text-slate-500 dark:text-slate-400">
            {today} · <span className="font-medium text-slate-700 dark:text-slate-200 tnum">{teachers.length}</span> kayıtlı öğretmen kadrosu
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="primary" icon={Plus} onClick={openAddModal}>
            Yeni Öğretmen Ekle
          </Button>
        </div>
      </header>

      <Panel>
        
        <div className={cx('flex flex-col sm:flex-row gap-2.5 px-5 py-3 border-b', hairline)}>
          <div className="relative flex-1 min-w-0">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <Input
              type="text"
              placeholder="Öğretmen adı, branş veya telefon ara..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-9"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                aria-label="Aramayı temizle"
                className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-md flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X size={14} />
              </button>
            )}
          </div>

          <div className="sm:w-56 shrink-0">
            <Select value={selectedBranchFilter} onChange={(e) => setSelectedBranchFilter(e.target.value)}>
              {BRANCH_OPTIONS.map((b) => (
                <option key={b} value={b}>
                  {b === 'Tümü' ? 'Tüm Branşlar' : b}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {loading ? (
          <div className={cx('divide-y', divider)}>
            {[0, 1, 2, 3].map((n) => (
              <div key={n} className="flex items-center gap-4 px-5 py-3.5 animate-pulse">
                <div className="w-8 h-8 rounded-full bg-slate-200/70 dark:bg-white/[0.06]" />
                <div className="flex-1 h-3.5 rounded bg-slate-200/70 dark:bg-white/[0.06]" />
                <div className="w-28 h-3.5 rounded bg-slate-200/70 dark:bg-white/[0.06]" />
              </div>
            ))}
          </div>
        ) : filteredTeachers.length === 0 ? (
          <EmptyState
            icon={Users}
            title={teachers.length === 0 ? 'Kayıtlı öğretmen bulunmuyor' : 'Eşleşen öğretmen bulunamadı'}
            description={
              teachers.length === 0
                ? 'Eğitim kadronuza yeni öğretmenler ekleyerek ders ve sınıf atamalarını yönetebilirsiniz.'
                : 'Arama kelimesini veya branş filtresini değiştirerek tekrar deneyin.'
            }
            action={
              teachers.length === 0 ? (
                <Button variant="primary" icon={Plus} onClick={openAddModal}>
                  İlk Öğretmeni Ekle
                </Button>
              ) : (
                <Button onClick={() => { setSearchQuery(''); setSelectedBranchFilter('Tümü'); }}>
                  Filtreleri Temizle
                </Button>
              )
            }
          />
        ) : (
          <div className="overflow-x-auto panel-scroll">
            <div className="min-w-[860px]">
              
              <div
                className={cx(
                  'grid grid-cols-[minmax(0,1.8fr)_130px_130px_130px_minmax(0,1.4fr)_180px] gap-4 px-5 py-2.5 border-b bg-slate-50/70 dark:bg-white/[0.02]',
                  hairline
                )}
              >
                <span className={eyebrow}>Öğretmen Bilgisi</span>
                <span className={eyebrow}>Branş</span>
                <span className={eyebrow}>Unvan</span>
                <span className={eyebrow}>İletişim</span>
                <span className={eyebrow}>Atanan Dersler</span>
                <span className={cx(eyebrow, 'text-right')}>İşlemler</span>
              </div>

              <div className={cx('divide-y', divider)}>
                {filteredTeachers.map((t) => {
                  const name = getTeacherName(t);
                  const branch = t.fields?.branch?.stringValue || 'Branş Belirtilmemiş';
                  const title = t.fields?.teacherTitle?.stringValue || 'Ders Öğretmeni';
                  const phone = t.fields?.phone?.stringValue || '—';
                  const pp = t.fields?.profile_image?.stringValue || null;
                  const docId = getTeacherDocId(t);

                  const teacherSchedules = schedules.filter((s) => s.teacherName === name || s.teacherId === docId);

                  return (
                    <div
                      key={t.name}
                      className="grid grid-cols-[minmax(0,1.8fr)_130px_130px_130px_minmax(0,1.4fr)_180px] gap-4 px-5 py-3 items-center hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors"
                    >
                      
                      <div className="flex items-center gap-3 min-w-0">
                        {pp ? (
                          <img
                            src={pp}
                            alt=""
                            className={cx('w-8 h-8 rounded-full object-cover shrink-0 border', hairline)}
                          />
                        ) : (
                          <div
                            className={cx(
                              'w-8 h-8 rounded-full shrink-0 border flex items-center justify-center bg-slate-100 dark:bg-white/[0.06] text-slate-500 dark:text-slate-400',
                              hairline
                            )}
                          >
                            <span className="text-[11px] font-bold uppercase">
                              {name.slice(0, 2)}
                            </span>
                          </div>
                        )}
                        <div className="min-w-0">
                          <span className="text-[13.5px] font-semibold text-slate-900 dark:text-white truncate block">
                            {name}
                          </span>
                          {t.fields?.email?.stringValue && (
                            <span className="text-[11px] text-slate-400 dark:text-slate-500 truncate block">
                              {t.fields.email.stringValue}
                            </span>
                          )}
                        </div>
                      </div>

                      <div>
                        <Badge tone="accent">{branch}</Badge>
                      </div>

                      <div className="text-[12.5px] text-slate-600 dark:text-slate-300 truncate">
                        {title}
                      </div>

                      <div className="text-[12px] text-slate-600 dark:text-slate-400 tnum truncate">
                        {phone}
                      </div>

                      <div className="min-w-0">
                        {teacherSchedules.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {teacherSchedules.slice(0, 2).map((s, i) => (
                              <span
                                key={i}
                                className="px-1.5 py-0.5 rounded text-[10.5px] font-semibold bg-slate-100 dark:bg-white/[0.07] text-slate-700 dark:text-slate-300 tnum"
                              >
                                {s.classId} ({DAYS[s.dayIndex]?.slice(0, 3)})
                              </span>
                            ))}
                            {teacherSchedules.length > 2 && (
                              <span className="px-1 py-0.5 text-[10px] text-slate-400 tnum">
                                +{teacherSchedules.length - 2}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-[11.5px] text-slate-400 italic">Ders yok</span>
                        )}
                      </div>

                      <div className="flex items-center justify-end gap-1">
                        <IconButton
                          label="Haftalık Ders Programı"
                          icon={BookOpen}
                          onClick={() => {
                            setActiveTeacher(t);
                            setIsScheduleModalOpen(true);
                          }}
                        />
                        <IconButton
                          label="Sınıf Atama"
                          icon={Briefcase}
                          onClick={() => openClassAssignModal(t)}
                        />
                        <IconButton
                          label="Görev Ata"
                          icon={FileText}
                          onClick={() => openTaskModal(t)}
                        />
                        <IconButton
                          label="AI Analizi"
                          icon={BrainCircuit}
                          onClick={() => handleRunAiAnalysis(t)}
                        />
                        <IconButton
                          label="Düzenle"
                          icon={Pencil}
                          onClick={() => openEditModal(t)}
                        />
                        <IconButton
                          label="Sil"
                          icon={Trash2}
                          variant="quiet"
                          onClick={() =>
                            setDeleteConfirm({ type: 'teacher', id: docId, name })
                          }
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {filteredTeachers.length > 0 && (
          <PanelFooter>
            <span className="text-[11.5px] text-slate-500 dark:text-slate-400">
              <span className="font-medium text-slate-700 dark:text-slate-200 tnum">{filteredTeachers.length}</span> öğretmen listeleniyor · toplam <span className="tnum">{teachers.length}</span>
            </span>
          </PanelFooter>
        )}
      </Panel>

      <Modal
        open={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title={editingTeacher ? 'Öğretmen Bilgilerini Düzenle' : 'Yeni Öğretmen Ekle'}
        description={editingTeacher ? getTeacherName(editingTeacher) : 'Eğitim kadrosuna yeni öğretmen kaydı oluşturun'}
        width="max-w-xl"
        footer={
          <>
            <Button type="button" onClick={() => setIsAddModalOpen(false)}>
              Vazgeç
            </Button>
            <Button
              type="submit"
              form="teacher-form"
              variant="primary"
              disabled={isSaving}
              icon={isSaving ? RefreshCw : Check}
            >
              {isSaving ? 'Kaydediliyor…' : editingTeacher ? 'Değişiklikleri Kaydet' : 'Öğretmeni Ekle'}
            </Button>
          </>
        }
      >
        <form id="teacher-form" onSubmit={handleSaveTeacher}>
          <FieldRows>
            <Field label="Ad Soyad *" htmlFor="teacher-name">
              <Input
                id="teacher-name"
                type="text"
                required
                value={formData.full_name}
                onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                placeholder="Örn: Ayşe Yılmaz"
              />
            </Field>

            <Field label="Branş ve unvan">
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11.5px] text-slate-500 mb-1">Branş *</label>
                  <Select
                    value={formData.branch}
                    onChange={(e) => setFormData({ ...formData, branch: e.target.value })}
                  >
                    {BRANCH_OPTIONS.filter((b) => b !== 'Tümü').map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <label className="block text-[11.5px] text-slate-500 mb-1">Unvan</label>
                  <Select
                    value={formData.teacherTitle}
                    onChange={(e) => setFormData({ ...formData, teacherTitle: e.target.value })}
                  >
                    {TEACHER_TITLES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </Select>
                </div>
              </div>
            </Field>

            <Field label="İletişim bilgileri">
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11.5px] text-slate-500 mb-1">Telefon</label>
                  <Input
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    placeholder="0555 555 55 55"
                  />
                </div>
                <div>
                  <label className="block text-[11.5px] text-slate-500 mb-1">E-posta</label>
                  <Input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    placeholder="ogretmen@okul.k12.tr"
                  />
                </div>
              </div>
            </Field>

            <Field label="TC Kimlik No">
              <Input
                type="text"
                maxLength={11}
                value={formData.tc_kimlik}
                onChange={(e) => setFormData({ ...formData, tc_kimlik: e.target.value })}
                placeholder="11 Haneli TC Kimlik Numarası"
                className="tnum font-mono"
              />
            </Field>

            <Field label="Atanan sınıflar" hint="Virgülle ayırarak girin (Örn: 9A, 10B, 11C)">
              <Input
                type="text"
                value={formData.assignedClasses}
                onChange={(e) => setFormData({ ...formData, assignedClasses: e.target.value })}
                placeholder="9A, 10B, 11C"
              />
            </Field>

            <Field label="Özel notlar">
              <Textarea
                rows={2}
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Öğretmen hakkında idari notlar..."
              />
            </Field>
          </FieldRows>
        </form>
      </Modal>

      <Modal
        open={isClassAssignModalOpen && Boolean(activeTeacher)}
        onClose={() => setIsClassAssignModalOpen(false)}
        title="Sınıf Atama"
        description={`Öğretmen: ${activeTeacher ? getTeacherName(activeTeacher) : ''}`}
        width="max-w-md"
        footer={
          <>
            <Button type="button" onClick={() => setIsClassAssignModalOpen(false)}>
              Vazgeç
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={handleSaveAssignedClasses}
              disabled={isSaving}
            >
              {isSaving ? 'Kaydediliyor…' : 'Atamayı Kaydet'}
            </Button>
          </>
        }
      >
        <div className="p-5 flex flex-col gap-4">
          <div>
            <span className={eyebrow}>Atanacak Sınıflar</span>
            <div className="mt-2.5 flex flex-wrap gap-2">
              {[...new Set([...CLASSES_LIST, ...assignedClassesDraft])].map((cls) => {
                const selected = assignedClassesDraft.includes(cls);
                return (
                  <button
                    key={cls}
                    type="button"
                    onClick={() => toggleDraftClass(cls)}
                    className={cx(
                      'px-3.5 py-1.5 rounded-lg text-[12.5px] font-semibold border transition-colors cursor-pointer',
                      selected
                        ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-transparent'
                        : 'bg-slate-100 dark:bg-white/[0.05] text-slate-700 dark:text-slate-300 border-slate-200 dark:border-white/10 hover:bg-slate-200 dark:hover:bg-white/10'
                    )}
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
                    onChange={(e) => setNewClassInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddCustomClass();
                      }
                    }}
                    placeholder="Örn: 9C"
                    className="w-20 h-8 px-2.5 rounded-lg bg-slate-100 dark:bg-white/10 border border-slate-300 dark:border-white/20 text-[12px] font-bold text-slate-900 dark:text-white outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleAddCustomClass}
                    className="h-8 px-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 rounded-lg text-[12px] font-bold"
                  >
                    Ekle
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setShowNewClassInput(true)}
                  className="px-3 py-1.5 rounded-lg text-[12px] font-medium border border-dashed border-slate-300 dark:border-white/20 text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <Plus size={13} /> Özel Sınıf
                </button>
              )}
            </div>
          </div>

          {assignedClassesDraft.length > 0 && (
            <div className="p-3 rounded-lg bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/10 text-[12px] text-slate-600 dark:text-slate-400">
              Seçili sınıflar: <strong className="text-slate-900 dark:text-white">{assignedClassesDraft.join(', ')}</strong>
            </div>
          )}
        </div>
      </Modal>

      <Modal
        open={isTaskModalOpen && Boolean(activeTeacher)}
        onClose={() => setIsTaskModalOpen(false)}
        title="Görev Atama"
        description={`Öğretmen: ${activeTeacher ? getTeacherName(activeTeacher) : ''}`}
        width="max-w-md"
        footer={
          <>
            <Button type="button" onClick={() => setIsTaskModalOpen(false)}>
              Vazgeç
            </Button>
            <Button
              type="submit"
              form="task-form"
              variant="primary"
              disabled={isSaving || !taskData.title.trim()}
            >
              {isSaving ? 'Atanıyor…' : 'Görevi Ata'}
            </Button>
          </>
        }
      >
        <form id="task-form" onSubmit={handleAssignTask}>
          <FieldRows>
            <Field label="Görev Başlığı *" htmlFor="task-title">
              <Input
                id="task-title"
                type="text"
                required
                value={taskData.title}
                onChange={(e) => setTaskData({ ...taskData, title: e.target.value })}
                placeholder="Örn: 9A sınav sonuçlarını gir"
              />
            </Field>

            <Field label="Açıklama">
              <Textarea
                rows={3}
                value={taskData.description}
                onChange={(e) => setTaskData({ ...taskData, description: e.target.value })}
                placeholder="Görev detayları..."
              />
            </Field>

            <Field label="Son Teslim Tarihi">
              <Input
                type="date"
                value={taskData.dueDate}
                onChange={(e) => setTaskData({ ...taskData, dueDate: e.target.value })}
                className="cursor-pointer"
              />
            </Field>
          </FieldRows>
        </form>
      </Modal>

      <Modal
        open={isScheduleModalOpen && Boolean(activeTeacher)}
        onClose={() => setIsScheduleModalOpen(false)}
        title="Haftalık Ders Programı"
        description={
          activeTeacher
            ? `${getTeacherName(activeTeacher)} · ${activeTeacher.fields?.branch?.stringValue || 'Branş'}`
            : ''
        }
        width="max-w-5xl"
        footer={
          <Button type="button" onClick={() => setIsScheduleModalOpen(false)}>
            Kapat
          </Button>
        }
      >
        <div className="overflow-x-auto panel-scroll select-none">
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead>
              <tr className="border-b border-slate-200 dark:border-white/10 bg-slate-50/70 dark:bg-white/[0.02]">
                <th className="px-3 py-2.5 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-24 text-center border-r border-slate-200 dark:border-white/10">
                  Saat
                </th>
                {DAYS.map((day) => (
                  <th
                    key={day}
                    className="px-3 py-2.5 text-[11.5px] font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider text-center border-r last:border-r-0 border-slate-200 dark:border-white/10"
                  >
                    {day}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-white/5">
              {LESSON_PERIODS.map((period, pIdx) => (
                <tr key={pIdx} className="hover:bg-slate-50/50 dark:hover:bg-white/[0.01]">
                  <td className="px-2 py-2 text-center align-middle border-r border-slate-200 dark:border-white/10 bg-slate-50/30 dark:bg-transparent">
                    <div className="font-semibold text-slate-800 dark:text-slate-200 text-[11.5px]">
                      {period.label}
                    </div>
                    <div className="text-[10px] text-slate-400 tnum">{period.time}</div>
                  </td>
                  {DAYS.map((day, dIdx) => {
                    const sch = schedules.find(
                      (s) =>
                        (s.teacherId === getTeacherDocId(activeTeacher) ||
                          s.teacherName === getTeacherName(activeTeacher)) &&
                        s.dayIndex === dIdx &&
                        s.lessonIndex === pIdx
                    );

                    return (
                      <td
                        key={dIdx}
                        className="p-1.5 border-r border-slate-200 dark:border-white/10 last:border-r-0 text-center align-middle h-[56px]"
                      >
                        {sch ? (
                          <div className="h-full px-2 py-1 bg-[#991b1b]/10 dark:bg-rose-500/10 border border-[#991b1b]/20 dark:border-rose-500/20 rounded-lg flex flex-col items-center justify-center relative group">
                            <span className="font-bold text-[12px] text-[#991b1b] dark:text-rose-300 leading-tight">
                              {sch.classId} Sınıfı
                            </span>
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 truncate max-w-[100px]">
                              {sch.courseName || sch.subject || 'Ders'}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setDeleteConfirm({
                                  type: 'schedule',
                                  id: sch.id,
                                  name: `${sch.classId} (${day} ${period.label})`
                                })
                              }
                              className="absolute inset-0 w-full h-full bg-rose-600/90 text-white opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-lg cursor-pointer"
                              title="Dersi Kaldır"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setScheduleData({ ...scheduleData, dayIndex: dIdx, lessonIndex: pIdx });
                              setIsClassSelectModalOpen(true);
                            }}
                            className="w-full h-full rounded-lg border border-dashed border-slate-200 dark:border-white/10 hover:border-slate-400 dark:hover:border-white/30 flex items-center justify-center opacity-40 hover:opacity-100 transition-all text-slate-400 hover:text-slate-800 dark:hover:text-white cursor-pointer"
                            title="Ders Ata"
                          >
                            <Plus size={13} />
                          </button>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Modal>

      <Modal
        open={isClassSelectModalOpen}
        onClose={() => setIsClassSelectModalOpen(false)}
        title="Ders İçin Sınıf Seç"
        description={`${DAYS[scheduleData.dayIndex]} · ${LESSON_PERIODS[scheduleData.lessonIndex]?.label}`}
        width="max-w-sm"
        footer={
          <>
            <Button type="button" onClick={() => setIsClassSelectModalOpen(false)}>
              Vazgeç
            </Button>
            <Button
              type="submit"
              form="class-select-form"
              variant="primary"
              disabled={isSaving}
            >
              {isSaving ? 'Atanıyor…' : 'Sınıfı Ata'}
            </Button>
          </>
        }
      >
        <form id="class-select-form" onSubmit={handleAssignSchedule} className="p-5">
          <label className="block text-[12px] font-medium text-slate-700 dark:text-slate-300 mb-2">
            Hangi sınıfa ders atanacak?
          </label>
          <Select
            value={scheduleData.classId}
            onChange={(e) => setScheduleData({ ...scheduleData, classId: e.target.value })}
          >
            {CLASSES_LIST.map((c) => (
              <option key={c} value={c}>
                {c} Sınıfı
              </option>
            ))}
          </Select>
        </form>
      </Modal>

      <Modal
        open={Boolean(deleteConfirm)}
        onClose={() => setDeleteConfirm(null)}
        title={deleteConfirm?.type === 'teacher' ? 'Öğretmeni Sil' : 'Dersi Kaldır'}
        width="max-w-md"
        footer={
          <>
            <Button type="button" onClick={() => setDeleteConfirm(null)}>
              Vazgeç
            </Button>
            <Button type="button" variant="danger" onClick={confirmDeleteAction}>
              Sil
            </Button>
          </>
        }
      >
        <div className="px-5 py-5">
          <p className="m-0 text-[13px] leading-relaxed text-slate-600 dark:text-slate-300">
            <strong className="text-slate-900 dark:text-white">{deleteConfirm?.name}</strong> kalıcı olarak silinecek. Bu işlem geri alınamaz. Onaylıyor musunuz?
          </p>
        </div>
      </Modal>
    </div>
  );
};

export default TeacherManagementAdminView;
