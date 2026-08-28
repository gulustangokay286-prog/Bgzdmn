import React, { useState, useEffect, useMemo } from 'react';
import { Save, Trash2, FileText, ChevronLeft, RefreshCw } from 'lucide-react';
import { firebaseService } from '../services/firebase';
import { academicService } from '../services/academicService';
import StudentSearch from '../components/StudentSearch';
import useUnsavedChanges from '../hooks/useUnsavedChanges';
import UnsavedBanner from '../components/UnsavedBanner';
import {
  Panel,
  PanelHeader,
  PanelFooter,
  Button,
  IconButton,
  Field,
  FieldRows,
  Input,
  Select,
  Badge,
  StatStrip,
  Stat,
  EmptyState,
  Modal
} from '../components/ui/panel';
import { cx, eyebrow, divider } from '../components/ui/tokens';

const COURSES = [
  'Matematik', 'Fizik', 'Kimya', 'Biyoloji', 'Türk Dili ve Edebiyatı', 'Tarih', 'Coğrafya',
  'İngilizce', 'Beden Eğitimi', 'Görsel Sanatlar', 'Müzik', 'Felsefe', 'Din Kültürü', 'Almanca'
];

const EXAM_TYPES = ['1. Sınav', '2. Sınav', 'Performans', 'Proje'];
const TERMS = ['1. Dönem', '2. Dönem'];

const scoreOf = (record) =>
  Number(record.fields?.score?.integerValue || record.fields?.score?.doubleValue || 0);

const scoreTone = (score) => (score >= 85 ? 'success' : score >= 50 ? 'neutral' : 'danger');

const GradesAdminView = () => {
  const [users, setUsers] = useState([]);
  const [studentId, setStudentId] = useState(null);
  const [studentName, setStudentName] = useState(null);
  const [loading, setLoading] = useState(true);

  const [course, setCourse] = useState('Matematik');
  const [teacher, setTeacher] = useState('');
  const [term, setTerm] = useState('1. Dönem');
  const [exam, setExam] = useState('1. Sınav');
  const [score, setScore] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const { markDirty, markClean, isDirty } = useUnsavedChanges();

  const [pastGrades, setPastGrades] = useState([]);
  const [loadingPast, setLoadingPast] = useState(false);

  useEffect(() => {
    const init = async () => {
      try {
        const data = await firebaseService.fetchAllUsers();
        setUsers(data);
      } catch (err) {
        console.error('Kullanıcılar alınamadı:', err);
      }
      setLoading(false);
    };
    init();
  }, []);

  const teacherNames = useMemo(() => {
    const names = users
      .filter((u) => ['teacher', 'öğretmen'].includes(u.fields?.role?.stringValue))
      .map((u) => u.fields?.full_name?.stringValue || u.fields?.fullName?.stringValue)
      .filter(Boolean)
      .sort();
    return names.length > 0 ? names : ['Sistem'];
  }, [users]);

  useEffect(() => {
    if (!teacher && teacherNames.length > 0) setTeacher(teacherNames[0]);
  }, [teacherNames, teacher]);

  const students = useMemo(
    () =>
      users.filter((u) => {
        const role = u.fields?.role?.stringValue?.toLowerCase() || '';
        return role === 'student' || role === 'öğrenci';
      }),
    [users]
  );

  const loadPastGrades = async (sid) => {
    setLoadingPast(true);
    try {
      const records = await academicService.fetchStudentGrades(sid);
      setPastGrades(records);
    } catch (err) {
      console.error('Notlar alınamadı:', err);
    }
    setLoadingPast(false);
  };

  useEffect(() => {
    if (studentId) loadPastGrades(studentId);
    else setPastGrades([]);
  }, [studentId]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!studentId || !score) return;
    setIsSaving(true);
    const success = await academicService.saveGrade(
      studentId, course, exam, parseInt(score, 10), teacher, term
    );
    if (success) {
      setScore('');
      loadPastGrades(studentId);
      markClean();
    }
    setIsSaving(false);
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    await academicService.deleteDocument('grades', deleteConfirm);
    loadPastGrades(studentId);
    setDeleteConfirm(null);
  };

  const average = useMemo(() => {
    if (pastGrades.length === 0) return '—';
    const total = pastGrades.reduce((sum, g) => sum + scoreOf(g), 0);
    return (total / pastGrades.length).toFixed(1);
  }, [pastGrades]);

  const lowCount = pastGrades.filter((g) => scoreOf(g) < 50).length;

  const byCourse = useMemo(() => {
    const grouped = pastGrades.reduce((acc, record) => {
      const name =
        record.fields?.course_name?.stringValue || record.fields?.courseName?.stringValue || 'Diğer';
      (acc[name] = acc[name] || []).push(record);
      return acc;
    }, {});
    return Object.entries(grouped).sort((a, b) => a[0].localeCompare(b[0], 'tr'));
  }, [pastGrades]);

  return (
    <div className="w-full flex flex-col gap-5 pb-2 min-h-0">
      <header>
        <h1 className="m-0 text-[27px] leading-none font-semibold tracking-[-0.03em] text-slate-900 dark:text-white">
          Not Yönetimi
        </h1>
        <p className="m-0 mt-2 text-[12.5px] text-slate-500 dark:text-slate-400">
          {students.length} öğrenci · sınav, performans ve proje notları
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)] gap-5 items-start min-h-0">
        {/* Öğrenci listesi */}
        <Panel className={cx('h-[560px]', studentId && 'hidden lg:flex')}>
          {loading ? (
            <div className="flex-1 flex items-center justify-center text-[12.5px] text-slate-500">
              Yükleniyor…
            </div>
          ) : (
            <StudentSearch
              users={students}
              selectedId={studentId}
              onSelect={(id, name) => {
                setStudentId(id);
                setStudentName(name);
              }}
            />
          )}
        </Panel>

        {/* Detay */}
        <div className={cx('flex flex-col gap-5 min-w-0', !studentId && 'hidden lg:flex')}>
          {!studentId ? (
            <Panel>
              <EmptyState
                icon={FileText}
                title="Öğrenci seçin"
                description="Not girişi yapmak veya geçmiş notları görüntülemek için soldaki listeden bir öğrenci seçin."
              />
            </Panel>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <IconButton
                  label="Listeye dön"
                  icon={ChevronLeft}
                  variant="secondary"
                  onClick={() => setStudentId(null)}
                  className="lg:hidden"
                />
                <div className="min-w-0">
                  <h2 className="m-0 text-[17px] font-semibold tracking-[-0.01em] text-slate-900 dark:text-white truncate">
                    {studentName}
                  </h2>
                </div>
              </div>

              <StatStrip>
                <Stat label="Genel ortalama" value={average} />
                <Stat label="Not sayısı" value={pastGrades.length} />
                <Stat
                  label="Geçmez not"
                  value={lowCount}
                  tone={lowCount > 0 ? 'danger' : 'default'}
                  hint="50 puanın altı"
                  last
                />
              </StatStrip>

              {/* Not girişi */}
              <form onSubmit={handleSave}>
                <Panel>
                  <PanelHeader title="Yeni Not" description="Girilen not öğrencinin karnesine anında işlenir" />
                  <FieldRows>
                    <Field label="Ders ve öğretmen">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <Select value={course} onChange={(e) => setCourse(e.target.value)}>
                          {COURSES.map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </Select>
                        <Select value={teacher} onChange={(e) => setTeacher(e.target.value)}>
                          {teacherNames.map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </Select>
                      </div>
                    </Field>

                    <Field label="Dönem ve sınav">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        <Select value={term} onChange={(e) => setTerm(e.target.value)}>
                          {TERMS.map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </Select>
                        <Select value={exam} onChange={(e) => setExam(e.target.value)}>
                          {EXAM_TYPES.map((t) => (
                            <option key={t} value={t}>{t}</option>
                          ))}
                        </Select>
                      </div>
                    </Field>

                    <Field label="Puan" hint="0 ile 100 arasında." htmlFor="grade-score">
                      <div className="sm:w-40">
                        <Input
                          id="grade-score"
                          type="number"
                          min="0"
                          max="100"
                          required
                          value={score}
                          onChange={(e) => {
                            setScore(e.target.value);
                            markDirty();
                          }}
                          placeholder="85"
                          className="tnum"
                        />
                      </div>
                    </Field>
                  </FieldRows>

                  <PanelFooter>
                    <span className="text-[11.5px] text-slate-500 dark:text-slate-400">
                      {course} · {term} · {exam}
                    </span>
                    <Button
                      type="submit"
                      variant="primary"
                      disabled={isSaving || !score}
                      icon={isSaving ? RefreshCw : Save}
                    >
                      {isSaving ? 'İşleniyor…' : 'Notu Kaydet'}
                    </Button>
                  </PanelFooter>
                </Panel>
              </form>

              {/* Geçmiş notlar */}
              <Panel>
                <PanelHeader title="Geçmiş Notlar" description="Derse göre gruplanmış tüm kayıtlar">
                  <span className="text-[11.5px] text-slate-500 dark:text-slate-400 tnum">
                    {pastGrades.length} kayıt
                  </span>
                </PanelHeader>

                {loadingPast ? (
                  <div className={cx('divide-y', divider)}>
                    {[0, 1, 2].map((n) => (
                      <div key={n} className="px-5 py-3.5 animate-pulse">
                        <div className="h-3 w-40 rounded bg-slate-200/70 dark:bg-white/[0.06]" />
                      </div>
                    ))}
                  </div>
                ) : pastGrades.length === 0 ? (
                  <EmptyState
                    icon={FileText}
                    title="Kayıtlı not yok"
                    description="Bu öğrenci için henüz not girilmemiş."
                  />
                ) : (
                  <div className={cx('divide-y', divider)}>
                    {byCourse.map(([courseName, records]) => {
                      const courseAvg = (
                        records.reduce((sum, r) => sum + scoreOf(r), 0) / records.length
                      ).toFixed(1);

                      return (
                        <div key={courseName}>
                          <div className="flex items-center justify-between gap-3 px-5 py-2.5 bg-slate-50/70 dark:bg-white/[0.02]">
                            <span className={eyebrow}>{courseName}</span>
                            <span className="text-[11.5px] text-slate-500 dark:text-slate-400 tnum">
                              ort. {courseAvg} · {records.length} not
                            </span>
                          </div>

                          <div className={cx('divide-y', divider)}>
                            {records.map((record) => {
                              const docId = record.name.split('/').pop();
                              const value = scoreOf(record);
                              return (
                                <div
                                  key={docId}
                                  className="group flex items-center gap-4 px-5 py-2.5 hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors"
                                >
                                  <div className="flex-1 min-w-0">
                                    <div className="text-[13px] text-slate-800 dark:text-slate-100 truncate">
                                      {record.fields?.term?.stringValue || '1. Dönem'} ·{' '}
                                      {record.fields?.examType?.stringValue || 'Sınav'}
                                    </div>
                                    <div className="mt-0.5 text-[11.5px] text-slate-500 dark:text-slate-400 truncate">
                                      {record.fields?.teacherName?.stringValue || 'Sistem'}
                                    </div>
                                  </div>

                                  <Badge tone={scoreTone(value)}>{value}</Badge>

                                  <IconButton
                                    label="Notu sil"
                                    icon={Trash2}
                                    variant="quiet"
                                    onClick={() => setDeleteConfirm(docId)}
                                    className="opacity-0 group-hover:opacity-100 focus:opacity-100"
                                  />
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </Panel>
            </>
          )}
        </div>
      </div>

      <Modal
        open={Boolean(deleteConfirm)}
        onClose={() => setDeleteConfirm(null)}
        title="Notu sil"
        width="max-w-md"
        footer={
          <>
            <Button type="button" onClick={() => setDeleteConfirm(null)}>
              Vazgeç
            </Button>
            <Button type="button" variant="danger" onClick={confirmDelete}>
              Sil
            </Button>
          </>
        }
      >
        <div className="px-5 py-5">
          <p className="m-0 text-[13px] leading-relaxed text-slate-600 dark:text-slate-300">
            Not kaydı kalıcı olarak silinecek ve öğrencinin ortalaması yeniden hesaplanacak. Bu işlem geri alınamaz.
          </p>
        </div>
      </Modal>

      <UnsavedBanner visible={isDirty} />
    </div>
  );
};

export default GradesAdminView;
