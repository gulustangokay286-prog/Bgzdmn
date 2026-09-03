import React, { useState, useEffect, useMemo } from 'react';
import {
  Target,
  Save,
  MessageCircle,
  Users,
  ShieldAlert,
  HeartHandshake,
  ChevronLeft,
  Sparkles,
  RefreshCw,
  Clock
} from 'lucide-react';
import { db } from '../services/firebaseConfig';
import { collection, onSnapshot, query, orderBy, addDoc, serverTimestamp } from 'firebase/firestore';
import { firebaseService } from '../services/firebase';
import { aiService } from '../services/aiService';
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
  Textarea,
  Select,
  Badge,
  Segmented,
  StatStrip,
  Stat,
  EmptyState,
  Modal,
  Toast
} from '../components/ui/panel';
import { cx, eyebrow, divider } from '../components/ui/tokens';

const TABS = [
  { id: 'notes', label: 'Bireysel', icon: MessageCircle },
  { id: 'parents', label: 'Veli', icon: Users },
  { id: 'tests', label: 'Test', icon: Target },
  { id: 'behavior', label: 'Davranış', icon: ShieldAlert }
];

const TEST_NAMES = [
  'Beck Depresyon Envanteri',
  'Sınav Kaygısı Ölçeği',
  'Mesleki Eğilim Envanteri',
  'Çoklu Zeka Envanteri',
  'Diğer (Manuel Giriş)'
];

const RECORD_META = {
  'Bireysel Görüşme': { icon: MessageCircle, tone: 'neutral' },
  'Veli Görüşmesi': { icon: Users, tone: 'neutral' },
  'Psikolojik Test': { icon: Target, tone: 'accent' },
  'Davranış / Disiplin': { icon: ShieldAlert, tone: 'warning' }
};

const riskTone = (risk) => (risk === 'Kritik' ? 'danger' : risk === 'Orta' ? 'warning' : 'success');

const CounselingAdminView = () => {
  const [users, setUsers] = useState([]);
  const [studentId, setStudentId] = useState(null);
  const [studentName, setStudentName] = useState(null);
  const [loading, setLoading] = useState(true);

  const [activeTab, setActiveTab] = useState('notes');

  const [noteContent, setNoteContent] = useState('');
  const [testName, setTestName] = useState(TEST_NAMES[0]);
  const [testResult, setTestResult] = useState('');
  const [parentNote, setParentNote] = useState('');
  const [behaviorType, setBehaviorType] = useState('Olumlu');
  const [behaviorNote, setBehaviorNote] = useState('');

  const [aiAnalysis, setAiAnalysis] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isAiOpen, setIsAiOpen] = useState(false);

  const [records, setRecords] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [toast, setToast] = useState({ open: false, message: '', tone: 'success' });

  const [attendanceData, setAttendanceData] = useState([]);
  const [gradesData, setGradesData] = useState([]);

  const { markDirty, markClean, isDirty } = useUnsavedChanges();

  const notify = (message, tone = 'success') => {
    setToast({ open: true, message, tone });
    setTimeout(() => setToast((t) => ({ ...t, open: false })), 2800);
  };

  const riskData = useMemo(() => {
    if (!studentId) return null;

    const absents = attendanceData.filter((a) =>
      ['absent', 'late', 'devamsiz'].includes(a.fields?.status?.stringValue)
    ).length;

    const totalGrades = gradesData.reduce(
      (sum, g) => sum + Number(g.fields?.score?.integerValue || g.fields?.score?.doubleValue || 0),
      0
    );
    const gpa = gradesData.length > 0 ? (totalGrades / gradesData.length).toFixed(1) : '0.0';
    const attendancePercentage = Math.max(0, 100 - absents * 1.1).toFixed(0);

    let attendanceRisk = 'Düşük';
    let gpaRisk = 'Düşük';
    if (attendancePercentage < 85) attendanceRisk = 'Kritik';
    else if (attendancePercentage < 92) attendanceRisk = 'Orta';
    if (parseFloat(gpa) < 50) gpaRisk = 'Kritik';
    else if (parseFloat(gpa) < 70) gpaRisk = 'Orta';

    const overallRisk =
      attendanceRisk === 'Kritik' || gpaRisk === 'Kritik'
        ? 'Kritik'
        : attendanceRisk === 'Orta' || gpaRisk === 'Orta'
        ? 'Orta'
        : 'Düşük';

    return { attendancePercentage, attendanceRisk, gpa, gpaRisk, overallRisk };
  }, [studentId, attendanceData, gradesData]);

  useEffect(() => {
    const init = async () => {
      try {
        const data = await firebaseService.fetchAllUsers();
        setUsers(
          data.filter((u) => {
            const role = u.fields?.role?.stringValue?.toLowerCase() || '';
            return role === 'student' || role === 'öğrenci';
          })
        );
      } catch (e) {
        console.error('Öğrenciler yüklenemedi', e);
      }
      setLoading(false);
    };
    init();
  }, []);

  useEffect(() => {
    if (!studentId) {
      setIsAiOpen(false);
      return undefined;
    }

    const loadAcademicData = async () => {
      const { academicService } = await import('../services/academicService');
      const [att, grd] = await Promise.all([
        academicService.fetchStudentAttendance(studentId),
        academicService.fetchStudentGrades(studentId)
      ]);
      setAttendanceData(att);
      setGradesData(grd);
    };
    loadAcademicData();

    const q = query(collection(db, 'counseling'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      setRecords(data.filter((r) => r.studentId === studentId));
    });
    return () => unsubscribe();
  }, [studentId]);

  const saveRecord = async (payload, reset) => {
    setIsSaving(true);
    try {
      await addDoc(collection(db, 'counseling'), {
        studentId,
        studentName,
        createdAt: serverTimestamp(),
        ...payload
      });
      reset();
      markClean();
      notify('Kayıt eklendi.');
    } catch (err) {
      console.error('Rehberlik kaydı eklenemedi:', err);
      notify('Kayıt eklenemedi.', 'error');
    }
    setIsSaving(false);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (activeTab === 'notes' && noteContent.trim()) {
      saveRecord({ type: 'Bireysel Görüşme', content: noteContent }, () => setNoteContent(''));
    } else if (activeTab === 'parents' && parentNote.trim()) {
      saveRecord({ type: 'Veli Görüşmesi', content: parentNote }, () => setParentNote(''));
    } else if (activeTab === 'tests' && testResult.trim()) {
      saveRecord({ type: 'Psikolojik Test', testName, content: testResult }, () => setTestResult(''));
    } else if (activeTab === 'behavior' && behaviorNote.trim()) {
      saveRecord({ type: 'Davranış / Disiplin', behaviorType, content: behaviorNote }, () =>
        setBehaviorNote('')
      );
    }
  };

  const handleRunAiAnalysis = async () => {
    setIsAiOpen(true);
    setIsAiLoading(true);
    try {
      const pastNotes = records.map((r) => `[${r.type}]: ${r.content}`).join(' | ');
      const prompt = `Öğrenci: ${studentName}. Akademik Başarı: ${riskData?.gpa} (${riskData?.gpaRisk} risk), Devamlılık: %${riskData?.attendancePercentage} (${riskData?.attendanceRisk} risk). Geçmiş rehberlik kayıtları: ${pastNotes || 'Kayıt yok'}. Lütfen bu veriler ışığında öğrencinin psikolojik ve akademik durumu hakkında net, profesyonel bir eylem planı ve klinik olmayan bir içgörü özeti yazınız. Maddeler halinde olsun, html kullanma, sadece metin ver.`;
      const res = await aiService.generateContent(prompt, 'gemini-3.1-flash-lite');
      setAiAnalysis(res);
    } catch (e) {
      setAiAnalysis(`Analiz hatası: ${e.message}`);
    }
    setIsAiLoading(false);
  };

  const negativeBehaviorCount = records.filter(
    (r) => r.type === 'Davranış / Disiplin' && r.behaviorType === 'Olumsuz'
  ).length;
  const testCount = records.filter((r) => r.type === 'Psikolojik Test').length;

  const canSubmit =
    (activeTab === 'notes' && noteContent.trim()) ||
    (activeTab === 'parents' && parentNote.trim()) ||
    (activeTab === 'tests' && testResult.trim()) ||
    (activeTab === 'behavior' && behaviorNote.trim());

  return (
    <div className="w-full flex flex-col gap-5 pb-2">
      <Toast open={toast.open} message={toast.message} tone={toast.tone} />

      <header>
        <h1 className="m-0 text-[27px] leading-none font-semibold tracking-[-0.03em] text-slate-900 dark:text-white">
          Rehberlik & Psikoloji
        </h1>
        <p className="m-0 mt-2 text-[12.5px] text-slate-500 dark:text-slate-400">
          Görüşme notları, psikolojik testler ve davranış kayıtları
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)] gap-5 items-stretch">
        <Panel className={cx('h-full min-h-[560px]', studentId && 'hidden lg:flex')}>
          {loading ? (
            <div className="flex-1 flex items-center justify-center text-[12.5px] text-slate-500">Yükleniyor…</div>
          ) : (
            <StudentSearch
              users={users}
              selectedId={studentId}
              onSelect={(id, name) => {
                setStudentId(id);
                setStudentName(name);
                setAiAnalysis('');
                setActiveTab('notes');
              }}
            />
          )}
        </Panel>

        <div className={cx('flex flex-col gap-5 min-w-0 h-full', !studentId && 'hidden lg:flex')}>
          {!studentId ? (
            <Panel className="h-full min-h-[560px] flex flex-col items-center justify-center">
              <EmptyState
                icon={HeartHandshake}
                title="Öğrenci seçin"
                description="Görüşme notu eklemek veya öğrencinin rehberlik geçmişini görmek için soldaki listeden bir öğrenci seçin."
              />
            </Panel>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <IconButton
                    label="Listeye dön"
                    icon={ChevronLeft}
                    variant="secondary"
                    onClick={() => setStudentId(null)}
                    className="lg:hidden"
                  />
                  <h2 className="m-0 text-[17px] font-semibold tracking-[-0.01em] text-slate-900 dark:text-white truncate">
                    {studentName}
                  </h2>
                </div>

                <Button icon={Sparkles} onClick={handleRunAiAnalysis}>
                  AI Profili
                </Button>
              </div>

              <StatStrip>
                <Stat
                  label="Akademik ortalama"
                  value={riskData?.gpa ?? '—'}
                  hint={riskData ? `${riskData.gpaRisk} risk` : undefined}
                  tone={riskData?.gpaRisk === 'Kritik' ? 'danger' : 'default'}
                />
                <Stat
                  label="Devamlılık"
                  value={riskData ? `%${riskData.attendancePercentage}` : '—'}
                  hint={riskData ? `${riskData.attendanceRisk} risk` : undefined}
                  tone={riskData?.attendanceRisk === 'Kritik' ? 'danger' : 'default'}
                />
                <Stat label="Rehberlik kaydı" value={records.length} hint={`${testCount} test`} />
                <Stat
                  label="Disiplin vakası"
                  value={negativeBehaviorCount}
                  tone={negativeBehaviorCount > 0 ? 'danger' : 'default'}
                  last
                />
              </StatStrip>

              {riskData && (
                <div className="flex items-center gap-2 text-[12.5px] text-slate-500 dark:text-slate-400">
                  <span>Genel durum:</span>
                  <Badge tone={riskTone(riskData.overallRisk)}>
                    {riskData.overallRisk === 'Kritik'
                      ? 'Müdahale gerekli'
                      : riskData.overallRisk === 'Orta'
                      ? 'Takip önerilir'
                      : 'İyi durumda'}
                  </Badge>
                </div>
              )}

              <form onSubmit={handleSubmit}>
                <Panel>
                  <PanelHeader title="Yeni Kayıt" description="Kayıtlar öğrencinin rehberlik dosyasına işlenir">
                    <Segmented
                      value={activeTab}
                      onChange={setActiveTab}
                      options={TABS.map((t) => ({ id: t.id, label: t.label }))}
                    />
                  </PanelHeader>

                  <FieldRows>
                    {activeTab === 'notes' && (
                      <Field label="Görüşme notu" hint="Öğrenciyle yapılan bireysel görüşmenin özeti.">
                        <Textarea
                          rows={5}
                          required
                          value={noteContent}
                          onChange={(e) => {
                            setNoteContent(e.target.value);
                            markDirty();
                          }}
                          placeholder="Görüşme detaylarını yazın"
                        />
                      </Field>
                    )}

                    {activeTab === 'parents' && (
                      <Field label="Veli görüşmesi" hint="Görüşülen konular ve alınan aksiyonlar.">
                        <Textarea
                          rows={5}
                          required
                          value={parentNote}
                          onChange={(e) => {
                            setParentNote(e.target.value);
                            markDirty();
                          }}
                          placeholder="Veli ile görüşülen konuları yazın"
                        />
                      </Field>
                    )}

                    {activeTab === 'tests' && (
                      <>
                        <Field label="Test">
                          <Select
                            value={testName}
                            onChange={(e) => {
                              setTestName(e.target.value);
                              markDirty();
                            }}
                          >
                            {TEST_NAMES.map((t) => (
                              <option key={t} value={t}>{t}</option>
                            ))}
                          </Select>
                        </Field>
                        <Field label="Sonuç ve yorum">
                          <Textarea
                            rows={4}
                            required
                            value={testResult}
                            onChange={(e) => {
                              setTestResult(e.target.value);
                              markDirty();
                            }}
                            placeholder="Sayısal sonuç ve psikolojik yorum"
                          />
                        </Field>
                      </>
                    )}

                    {activeTab === 'behavior' && (
                      <>
                        <Field label="Davranış türü">
                          <Segmented
                            value={behaviorType}
                            onChange={(v) => {
                              setBehaviorType(v);
                              markDirty();
                            }}
                            options={[
                              { id: 'Olumlu', label: 'Olumlu' },
                              { id: 'Olumsuz', label: 'Olumsuz / disiplin' }
                            ]}
                          />
                        </Field>
                        <Field label="Olay özeti">
                          <Textarea
                            rows={4}
                            required
                            value={behaviorNote}
                            onChange={(e) => {
                              setBehaviorNote(e.target.value);
                              markDirty();
                            }}
                            placeholder="Davranış detayı ve alınan aksiyon"
                          />
                        </Field>
                      </>
                    )}
                  </FieldRows>

                  <PanelFooter>
                    <span className="text-[11.5px] text-slate-500 dark:text-slate-400">
                      {TABS.find((t) => t.id === activeTab)?.label} kaydı
                    </span>
                    <Button
                      type="submit"
                      variant="primary"
                      disabled={isSaving || !canSubmit}
                      icon={isSaving ? RefreshCw : Save}
                    >
                      {isSaving ? 'Kaydediliyor…' : 'Kaydet'}
                    </Button>
                  </PanelFooter>
                </Panel>
              </form>

              <Panel>
                <PanelHeader title="Rehberlik Geçmişi" description="En yeni kayıtlar üstte">
                  <span className="text-[11.5px] text-slate-500 dark:text-slate-400 tnum">
                    {records.length} kayıt
                  </span>
                </PanelHeader>

                {records.length === 0 ? (
                  <EmptyState
                    icon={Clock}
                    title="Kayıt yok"
                    description="Bu öğrenci için henüz rehberlik kaydı girilmemiş."
                  />
                ) : (
                  <div className={cx('divide-y', divider)}>
                    {records.map((record) => {
                      const meta = RECORD_META[record.type] || RECORD_META['Bireysel Görüşme'];
                      const Icon = meta.icon;
                      const tone =
                        record.type === 'Davranış / Disiplin'
                          ? record.behaviorType === 'Olumsuz'
                            ? 'danger'
                            : 'success'
                          : meta.tone;
                      const dateStr = record.createdAt?.toDate
                        ? record.createdAt.toDate().toLocaleString('tr-TR', {
                            dateStyle: 'medium',
                            timeStyle: 'short'
                          })
                        : 'Şimdi';

                      return (
                        <div key={record.id} className="flex gap-3.5 px-5 py-3.5">
                          <div className="w-8 h-8 rounded-lg shrink-0 border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.03] text-slate-400 dark:text-slate-500 flex items-center justify-center">
                            <Icon size={15} strokeWidth={1.8} />
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-3">
                              <div className="flex items-center gap-2 min-w-0">
                                <Badge tone={tone}>
                                  {record.type}
                                  {record.type === 'Psikolojik Test' && record.testName
                                    ? ` · ${record.testName}`
                                    : ''}
                                  {record.type === 'Davranış / Disiplin' && record.behaviorType
                                    ? ` · ${record.behaviorType}`
                                    : ''}
                                </Badge>
                              </div>
                              <span className="text-[11px] text-slate-400 dark:text-slate-500 tnum shrink-0">
                                {dateStr}
                              </span>
                            </div>
                            <p className="m-0 mt-1.5 text-[12.5px] leading-relaxed text-slate-600 dark:text-slate-300 whitespace-pre-wrap">
                              {record.content}
                            </p>
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
        open={isAiOpen}
        onClose={() => setIsAiOpen(false)}
        title="AI Öğrenci Profili"
        description={studentName}
        width="max-w-2xl"
        footer={
          <>
            <Button type="button" onClick={() => setIsAiOpen(false)}>
              Kapat
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={handleRunAiAnalysis}
              disabled={isAiLoading}
              icon={isAiLoading ? RefreshCw : Sparkles}
            >
              {isAiLoading ? 'Analiz ediliyor…' : 'Yeniden analiz et'}
            </Button>
          </>
        }
      >
        <StatStrip className="m-5 mb-0">
          <Stat label="Görüşme kaydı" value={records.length} />
          <Stat
            label="Disiplin vakası"
            value={negativeBehaviorCount}
            tone={negativeBehaviorCount > 0 ? 'danger' : 'default'}
          />
          <Stat label="Psikolojik test" value={testCount} last />
        </StatStrip>

        <div className="px-5 py-5">
          <span className={eyebrow}>Yapay zekâ içgörüsü</span>
          {isAiLoading ? (
            <div className="mt-3 flex flex-col gap-2 animate-pulse">
              {[0, 1, 2, 3].map((n) => (
                <div
                  key={n}
                  className="h-3 rounded bg-slate-200/70 dark:bg-white/[0.06]"
                  style={{ width: `${90 - n * 12}%` }}
                />
              ))}
            </div>
          ) : aiAnalysis ? (
            <div className="mt-3 flex flex-col gap-3">
              {aiAnalysis
                .split('\n')
                .filter((p) => p.trim())
                .map((paragraph, idx) => (
                  <p key={idx} className="m-0 text-[13px] leading-relaxed text-slate-700 dark:text-slate-200">
                    {paragraph}
                  </p>
                ))}
            </div>
          ) : (
            <p className="m-0 mt-3 text-[12.5px] text-slate-500 dark:text-slate-400">
              Analiz verisi bulunamadı. Yeniden deneyin.
            </p>
          )}
        </div>
      </Modal>

      <UnsavedBanner visible={isDirty} />
    </div>
  );
};

export default CounselingAdminView;
