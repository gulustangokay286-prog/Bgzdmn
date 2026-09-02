import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Trash2, AlertCircle, RefreshCw, Save, FileText } from 'lucide-react';
import { db } from '../services/firebaseConfig';
import { collection, onSnapshot, addDoc, deleteDoc, doc, serverTimestamp, query } from 'firebase/firestore';
import { firebaseService } from '../services/firebase';
import useUnsavedChanges from '../hooks/useUnsavedChanges';
import UnsavedBanner from '../components/UnsavedBanner';
import {
  Panel,
  PanelHeader,
  Button,
  IconButton,
  Field,
  FieldRows,
  Input,
  Textarea,
  Select,
  Switch,
  StatStrip,
  Stat,
  Modal
} from '../components/ui/panel';
import { cx, eyebrow, hairline } from '../components/ui/tokens';

const DAYS = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma'];
const CLASSES = ['9A', '9B', '10A', '10B', '11A', '11B', '12A', '12B'];
const ROOMS = [
  '12A Sınıfı', '12B Sınıfı', '11A Sınıfı', '11B Sınıfı', '10A Sınıfı', '10B Sınıfı',
  '9A Sınıfı', '9B Sınıfı', 'Fizik Lab', 'Kimya Lab', 'Spor Salonu', 'Müzik Odası'
];

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

const TOTAL_SLOTS = DAYS.length * LESSON_PERIODS.length;

const ScheduleAdminView = () => {
  const [schedules, setSchedules] = useState([]);
  const [teacherNames, setTeacherNames] = useState(['Sistem Öğretmeni']);
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
    room: ROOMS[0],
    hasAssignment: false,
    assignmentTitle: '',
    assignmentDetails: ''
  });

  useEffect(() => {
    const unsubscribe = onSnapshot(
      query(collection(db, 'schedule')),
      (snapshot) => {
        setSchedules(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (error) => {
        console.error('Program çekilirken hata:', error);
        setLoading(false);
      }
    );

    const initTeachers = async () => {
      try {
        const data = await firebaseService.fetchAllUsers();
        const teachersData = data.filter((u) =>
          ['teacher', 'öğretmen'].includes(u.fields?.role?.stringValue)
        );
        setTeacherList(teachersData);
        const names = teachersData
          .map((u) => u.fields?.full_name?.stringValue || u.fields?.fullName?.stringValue)
          .filter(Boolean)
          .sort();
        setTeacherNames(['Sistem Öğretmeni', ...names]);
      } catch (err) {
        console.error('Öğretmenler alınamadı:', err);
      }
    };
    initTeachers();

    return () => unsubscribe();
  }, []);

  const currentSchedules = useMemo(
    () => schedules.filter((s) => s.classId === selectedClass || s.class_id === selectedClass),
    [schedules, selectedClass]
  );

  const getScheduleForCell = (dayIdx, periodIdx) => {
    const period = LESSON_PERIODS[periodIdx];
    return currentSchedules.find((s) => {
      if (parseInt(s.dayIndex, 10) !== dayIdx) return false;
      if (s.lessonIndex !== undefined && s.lessonIndex !== null) {
        return parseInt(s.lessonIndex, 10) === periodIdx;
      }
      return (s.startTime || '') === period.start;
    });
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!formData.courseName || !formData.teacherName) return;

    const conflict = schedules.find(
      (s) =>
        s.teacherName === formData.teacherName &&
        parseInt(s.dayIndex, 10) === parseInt(formData.dayIndex, 10) &&
        parseInt(s.lessonIndex, 10) === parseInt(formData.lessonIndex, 10)
    );

    if (conflict && formData.teacherName !== 'Sistem Öğretmeni') {
      setFormError(
        `${formData.teacherName} bu saatte ${conflict.classId || conflict.class_id} sınıfında derste. Başka bir öğretmen veya saat seçin.`
      );
      return;
    }

    setFormError('');
    setIsSaving(true);

    const selectedLesson = LESSON_PERIODS[formData.lessonIndex];
    const selectedTeacherObj = teacherList.find(
      (t) => (t.fields?.full_name?.stringValue || t.fields?.fullName?.stringValue) === formData.teacherName
    );
    const teacherId = selectedTeacherObj ? selectedTeacherObj.name?.split('/').pop() || '' : '';

    try {
      const dataToSave = {
        classId: formData.classId,
        class_id: formData.classId,
        courseName: formData.courseName,
        course_name: formData.courseName,
        teacherName: formData.teacherName,
        teacher_name: formData.teacherName,
        teacherId,
        teacher_id: teacherId,
        room: formData.room,
        dayIndex: parseInt(formData.dayIndex, 10),
        day_index: parseInt(formData.dayIndex, 10),
        startTime: selectedLesson.start,
        endTime: selectedLesson.end,
        lessonIndex: parseInt(formData.lessonIndex, 10),
        lesson_index: parseInt(formData.lessonIndex, 10),
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
      setFormData((prev) => ({
        ...prev,
        courseName: '',
        teacherName: teacherNames[0] || 'Sistem Öğretmeni',
        hasAssignment: false,
        assignmentTitle: '',
        assignmentDetails: ''
      }));
      markClean();
    } catch (error) {
      console.error('Kaydedilirken hata:', error);
      setFormError('Kayıt işlemi başarısız oldu.');
    }
    setIsSaving(false);
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    const { id } = deleteConfirm;
    try {
      await Promise.all(
        ['schedule', 'schedules', 'student_schedules', 'teacher_schedules'].map((col) =>
          deleteDoc(doc(db, col, id)).catch(() => {})
        )
      );
    } catch (error) {
      console.error('Silme hatası:', error);
    }
    setDeleteConfirm(null);
  };

  const openModal = (dayIdx = 0, periodIdx = 0) => {
    setFormError('');
    setFormData({
      courseName: '',
      teacherName: teacherNames[0] || 'Sistem Öğretmeni',
      dayIndex: dayIdx,
      lessonIndex: periodIdx,
      classId: selectedClass,
      room: ROOMS[0],
      hasAssignment: false,
      assignmentTitle: '',
      assignmentDetails: ''
    });
    markDirty();
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    markClean();
  };

  const distinctTeachers = new Set(currentSchedules.map((s) => s.teacherName).filter(Boolean)).size;
  const assignmentCount = currentSchedules.filter((s) => s.hasAssignment).length;

  return (
    <div className="w-full flex flex-col gap-5 pb-2">
      <header>
        <h1 className="m-0 text-[27px] leading-none font-semibold tracking-[-0.03em] text-slate-900 dark:text-white">
          Ders Programı
        </h1>
        <p className="m-0 mt-2 text-[12.5px] text-slate-500 dark:text-slate-400">
          Haftalık ders yerleşimi · boş hücreye tıklayarak ders atayın
        </p>
      </header>

      <div className="flex flex-wrap gap-1.5">
        {CLASSES.map((cls) => {
          const count = schedules.filter((s) => s.classId === cls || s.class_id === cls).length;
          const isActive = selectedClass === cls;
          return (
            <button
              key={cls}
              onClick={() => setSelectedClass(cls)}
              className={cx(
                'inline-flex items-center gap-2 h-9 px-3.5 rounded-lg border text-[13px] font-medium transition-colors',
                isActive
                  ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-transparent'
                  : 'bg-white dark:bg-white/[0.04] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-white/10 hover:bg-slate-50 dark:hover:bg-white/[0.08]'
              )}
            >
              {cls}
              <span className={cx('tnum', isActive ? 'opacity-60' : 'text-slate-400 dark:text-slate-500')}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <StatStrip>
        <Stat label="Tanımlı ders" value={currentSchedules.length} hint={`${TOTAL_SLOTS} saat üzerinden`} />
        <Stat label="Boş saat" value={TOTAL_SLOTS - currentSchedules.length} />
        <Stat label="Görevli öğretmen" value={distinctTeachers} />
        <Stat label="Ödevli ders" value={assignmentCount} last />
      </StatStrip>

      <Panel>
        <PanelHeader title={`${selectedClass} Haftalık Programı`} description="Pazartesi – Cuma, 8 ders saati">
          <Button variant="primary" icon={Plus} onClick={() => openModal()}>
            Yeni Ders
          </Button>
        </PanelHeader>

        {loading ? (
          <div className="px-5 py-10 flex flex-col gap-2 animate-pulse">
            {[0, 1, 2, 3, 4, 5].map((n) => (
              <div key={n} className="h-10 rounded-lg bg-slate-200/60 dark:bg-white/[0.05]" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto panel-scroll">
            <div className="min-w-[840px]">
              
              <div className={cx('grid grid-cols-[92px_repeat(5,minmax(0,1fr))] border-b bg-slate-50/70 dark:bg-white/[0.02]', hairline)}>
                <div className={cx('px-3 py-2.5 border-r', hairline)}>
                  <span className={eyebrow}>Saat</span>
                </div>
                {DAYS.map((day, i) => (
                  <div
                    key={day}
                    className={cx('px-3 py-2.5 text-center', i < DAYS.length - 1 && 'border-r', hairline)}
                  >
                    <span className={eyebrow}>{day}</span>
                  </div>
                ))}
              </div>

              {LESSON_PERIODS.map((period, pIdx) => (
                <div
                  key={period.label}
                  className={cx(
                    'grid grid-cols-[92px_repeat(5,minmax(0,1fr))]',
                    pIdx < LESSON_PERIODS.length - 1 && 'border-b',
                    hairline
                  )}
                >
                  <div className={cx('px-3 py-2.5 border-r bg-slate-50/40 dark:bg-white/[0.015]', hairline)}>
                    <div className="text-[12px] font-medium text-slate-700 dark:text-slate-200">{period.label}</div>
                    <div className="mt-0.5 text-[10.5px] text-slate-400 dark:text-slate-500 tnum">{period.time}</div>
                  </div>

                  {DAYS.map((day, dIdx) => {
                    const schedule = getScheduleForCell(dIdx, pIdx);
                    return (
                      <div
                        key={day}
                        className={cx('relative p-1.5 min-h-[62px]', dIdx < DAYS.length - 1 && 'border-r', hairline)}
                      >
                        {schedule ? (
                          <div className="group h-full rounded-lg px-2.5 py-1.5 bg-slate-100/80 dark:bg-white/[0.06] border border-slate-200/80 dark:border-white/10 flex flex-col justify-center relative overflow-hidden">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="text-[12.5px] font-medium text-slate-900 dark:text-white truncate">
                                {schedule.courseName || schedule.course_name}
                              </span>
                              {schedule.hasAssignment && (
                                <FileText size={11} className="shrink-0 text-[#991b1b] dark:text-rose-400" />
                              )}
                            </div>
                            <div className="mt-0.5 text-[10.5px] text-slate-500 dark:text-slate-400 truncate">
                              {schedule.teacherName}
                            </div>
                            {schedule.room && (
                              <div className="text-[10.5px] text-slate-400 dark:text-slate-500 truncate">
                                {schedule.room}
                              </div>
                            )}

                            <IconButton
                              label="Dersi kaldır"
                              icon={Trash2}
                              variant="quiet"
                              onClick={() =>
                                setDeleteConfirm({
                                  id: schedule.id,
                                  course: schedule.courseName || schedule.course_name
                                })
                              }
                              className="absolute top-0.5 right-0.5 w-6 h-6 opacity-0 group-hover:opacity-100 focus:opacity-100 bg-white/80 dark:bg-[#0f172a]/80"
                            />
                          </div>
                        ) : (
                          <button
                            onClick={() => openModal(dIdx, pIdx)}
                            aria-label={`${day} ${period.label} dersi ekle`}
                            className="w-full h-full min-h-[50px] rounded-lg border border-dashed border-transparent hover:border-slate-300 dark:hover:border-white/15 hover:bg-slate-50 dark:hover:bg-white/[0.03] flex items-center justify-center text-slate-300 dark:text-slate-600 hover:text-slate-500 dark:hover:text-slate-400 transition-colors"
                          >
                            <Plus size={15} />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        )}
      </Panel>

      <Modal
        open={isModalOpen}
        onClose={closeModal}
        title="Yeni Ders"
        description={`${DAYS[formData.dayIndex]} · ${LESSON_PERIODS[formData.lessonIndex]?.time}`}
        width="max-w-2xl"
        footer={
          <>
            <Button type="button" onClick={closeModal}>
              Vazgeç
            </Button>
            <Button
              type="submit"
              form="schedule-form"
              variant="primary"
              disabled={isSaving}
              icon={isSaving ? RefreshCw : Save}
            >
              {isSaving ? 'Kaydediliyor…' : 'Dersi Ata'}
            </Button>
          </>
        }
      >
        {formError && (
          <div className="flex items-start gap-2 mx-5 mt-5 px-3.5 py-3 rounded-lg bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-[12.5px] text-rose-700 dark:text-rose-300">
            <AlertCircle size={15} className="shrink-0 mt-px" />
            <span>{formError}</span>
          </div>
        )}

        <form id="schedule-form" onSubmit={handleSave}>
          <FieldRows>
            <Field label="Ders adı" htmlFor="schedule-course">
              <Input
                id="schedule-course"
                type="text"
                required
                value={formData.courseName}
                onChange={(e) => setFormData({ ...formData, courseName: e.target.value })}
                placeholder="Biyoloji"
              />
            </Field>

            <Field label="Öğretmen" hint="Aynı saatte başka sınıfta dersi varsa uyarı verilir.">
              <Select
                value={formData.teacherName}
                onChange={(e) => setFormData({ ...formData, teacherName: e.target.value })}
              >
                {teacherNames.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </Select>
            </Field>

            <Field label="Sınıf ve derslik">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <Select
                  value={formData.classId}
                  onChange={(e) => setFormData({ ...formData, classId: e.target.value })}
                >
                  {CLASSES.map((c) => (
                    <option key={c} value={c}>{c} Sınıfı</option>
                  ))}
                </Select>
                <Select value={formData.room} onChange={(e) => setFormData({ ...formData, room: e.target.value })}>
                  {ROOMS.map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </Select>
              </div>
            </Field>

            <Field label="Gün ve saat">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <Select
                  value={formData.dayIndex}
                  onChange={(e) => setFormData({ ...formData, dayIndex: parseInt(e.target.value, 10) })}
                >
                  {DAYS.map((d, i) => (
                    <option key={d} value={i}>{d}</option>
                  ))}
                </Select>
                <Select
                  value={formData.lessonIndex}
                  onChange={(e) => setFormData({ ...formData, lessonIndex: parseInt(e.target.value, 10) })}
                >
                  {LESSON_PERIODS.map((period, i) => (
                    <option key={period.label} value={i}>
                      {period.label} · {period.time}
                    </option>
                  ))}
                </Select>
              </div>
            </Field>

            <Field label="Ödev" hint="İşaretlenirse öğrenci uygulamasında ödev kartı görünür.">
              <div className="flex flex-col gap-3">
                <Switch
                  id="schedule-assignment"
                  checked={formData.hasAssignment}
                  onChange={(e) => setFormData({ ...formData, hasAssignment: e.target.checked })}
                  label="Bu derste ödev var"
                />
                {formData.hasAssignment && (
                  <div className="flex flex-col gap-2.5">
                    <Input
                      type="text"
                      required
                      value={formData.assignmentTitle}
                      onChange={(e) => setFormData({ ...formData, assignmentTitle: e.target.value })}
                      placeholder="Ödev başlığı"
                    />
                    <Textarea
                      rows={3}
                      required
                      value={formData.assignmentDetails}
                      onChange={(e) => setFormData({ ...formData, assignmentDetails: e.target.value })}
                      placeholder="Ödev açıklaması"
                    />
                  </div>
                )}
              </div>
            </Field>
          </FieldRows>
        </form>
      </Modal>

      <Modal
        open={Boolean(deleteConfirm)}
        onClose={() => setDeleteConfirm(null)}
        title="Dersi kaldır"
        width="max-w-md"
        footer={
          <>
            <Button type="button" onClick={() => setDeleteConfirm(null)}>
              Vazgeç
            </Button>
            <Button type="button" variant="danger" onClick={confirmDelete}>
              Kaldır
            </Button>
          </>
        }
      >
        <div className="px-5 py-5">
          <p className="m-0 text-[13px] leading-relaxed text-slate-600 dark:text-slate-300">
            <span className="font-medium text-slate-900 dark:text-white">{deleteConfirm?.course}</span> dersi{' '}
            {selectedClass} programından kaldırılacak. Bu işlem geri alınamaz.
          </p>
        </div>
      </Modal>

      <UnsavedBanner visible={isDirty} />
    </div>
  );
};

export default ScheduleAdminView;
