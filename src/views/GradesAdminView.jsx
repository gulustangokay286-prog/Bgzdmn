import React, { useState, useEffect } from 'react';
import { Save, Trash2, GraduationCap, Award, CalendarDays, BrainCircuit, Sparkles, CheckCircle2, Activity, Calculator, FileText, ChevronLeft, BarChart, TrendingUp, AlertTriangle } from 'lucide-react';
import { firebaseService } from '../services/firebase';
import { academicService } from '../services/academicService';
import { dbService } from '../services/dbService';
import { aiService } from '../services/aiService';
import StudentSearch from '../components/StudentSearch';
import useUnsavedChanges from '../hooks/useUnsavedChanges';
import UnsavedBanner from '../components/UnsavedBanner';

const courses = ["Matematik", "Fizik", "Kimya", "Biyoloji", "Türk Dili ve Edebiyatı", "Tarih", "Coğrafya", "İngilizce", "Beden Eğitimi", "Görsel Sanatlar", "Müzik", "Felsefe", "Din Kültürü", "Almanca"];

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
  const [isSaved, setIsSaved] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const { markDirty, markClean, isDirty } = useUnsavedChanges();

  
  const [pastGrades, setPastGrades] = useState([]);
  const [loadingPast, setLoadingPast] = useState(false);

  
  const [isAiDashboardOpen, setIsAiDashboardOpen] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [studentAbsents, setStudentAbsents] = useState(0);

  useEffect(() => {
    const init = async () => {
      const data = await firebaseService.fetchAllUsers();
      setUsers(data);
      setLoading(false);
    };
    init();
  }, []);

  const teacherNames = users
    .filter(u => u.fields?.role?.stringValue === 'teacher' || u.fields?.role?.stringValue === 'öğretmen')
    .map(u => u.fields?.full_name?.stringValue || u.fields?.fullName?.stringValue)
    .filter(Boolean)
    .sort();
  if (teacherNames.length === 0) teacherNames.push("Sistem", "Ahmet Yılmaz");

  useEffect(() => {
    if (!teacher && teacherNames.length > 0) {
      setTeacher(teacherNames[0]);
    }
  }, [teacherNames, teacher]);

  const loadPastGrades = async (sid) => {
    setLoadingPast(true);
    const records = await academicService.fetchStudentGrades(sid);
    setPastGrades(records);
    setLoadingPast(false);
  };

  useEffect(() => {
    if (studentId) {
      setAiAnalysis('');
      loadPastGrades(studentId);
    } else {
      setPastGrades([]);
      setAiAnalysis('');
      setIsAiDashboardOpen(false);
    }
  }, [studentId]);

  const handleRunAiAnalysis = async () => {
    setIsAiDashboardOpen(true);
    setIsAiLoading(true);
    try {
      const allAttendance = await dbService.fetchCollection('attendance_logs');
      const studentAttendance = allAttendance.filter(doc => doc.fields?.studentId?.stringValue === studentId);
      const absents = studentAttendance.length; 
      setStudentAbsents(absents);
      
      let gradeStr = pastGrades.map(g => `${g.fields?.course_name?.stringValue || g.fields?.courseName?.stringValue}: ${g.fields?.score?.integerValue || g.fields?.score?.doubleValue}`).join(', ');
      
      const prompt = `Öğrenci: ${studentName}. Son notlar: [${gradeStr || 'Not girilmemiş'}]. Toplam devamsızlık/geçiş logları: ${absents} adet.
      Bu öğrencinin akademik ilerlemesini ve durumunu analiz et. Öğrenci için kısa, öz ve net, 3 paragraflık profesyonel bir eylem planı sun. Html formatlama kullanma, düz metin ver.`;
      
      const res = await aiService.generateContent(prompt, 'gemini-3.1-flash-lite');
      setAiAnalysis(res);
    } catch (e) {
      setAiAnalysis("Analiz sırasında bir hata oluştu: " + e.message);
    }
    setIsAiLoading(false);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!studentId || !score) return;
    setIsSaving(true);
    const success = await academicService.saveGrade(studentId, course, exam, parseInt(score), teacher, term);
    if (success) {
      setIsSaved(true);
      setScore('');
      loadPastGrades(studentId);
      setTimeout(() => setIsSaved(false), 2500);
    }
    setIsSaving(false);
  };

  const handleDelete = async (docId) => {
    setDeleteConfirm(docId);
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    await academicService.deleteDocument('grades', deleteConfirm);
    loadPastGrades(studentId);
    setDeleteConfirm(null);
  };

  const calculateGPA = () => {
    if (pastGrades.length === 0) return "0.00";
    const total = pastGrades.reduce((sum, g) => sum + Number(g.fields?.score?.integerValue || g.fields?.score?.doubleValue || 0), 0);
    return (total / pastGrades.length).toFixed(2);
  };

  const currentDate = new Date().toLocaleDateString('tr-TR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div className="w-full h-full flex-1 flex flex-col font-sans overflow-hidden pb-2 md:pb-6 p-4 md:p-12">
      
      {}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-10 w-full shrink-0">
        <div className="flex items-center gap-5">
          <div className="flex flex-col">
            <span className="text-[13px] font-medium text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wider">{currentDate}</span>
            <h1 className="text-[36px] font-semibold text-slate-900 dark:text-white tracking-tight leading-none">Not Yönetimi</h1>
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm flex-1 w-full min-h-0 overflow-hidden relative">
        
        {/* Sol Panel: Öğrenci Arama */}
        <div className={`${studentId ? 'hidden md:flex' : 'flex'} w-full md:w-[320px] flex-shrink-0 flex-col border-b md:border-b-0 md:border-r border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-[#1e293b]/50`}>
          <div className="p-4 border-b border-slate-200 dark:border-white/10">
            <h3 className="text-[12px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest px-2">Öğrenci Seçimi</h3>
          </div>
          <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-32 text-slate-500">
                <div className="w-8 h-8 rounded-full border-4 border-slate-200 dark:border-white/10 border-t-slate-900 animate-spin mb-4"></div>
                <span className="text-[13px] font-medium">Yükleniyor...</span>
              </div>
            ) : (
              <StudentSearch 
                users={users.filter(u => {
                  const role = u.fields?.role?.stringValue?.toLowerCase() || '';
                  return role === 'student' || role === 'öğrenci';
                })}
                selectedId={studentId} 
                onSelect={(id, name) => { setStudentId(id); setStudentName(name); }} 
              />
            )}
          </div>
        </div>

        {/* Sağ Panel: Not İçeriği */}
        <div className={`${studentId ? 'flex' : 'hidden md:flex'} flex-1 flex-col min-h-0 bg-white dark:bg-[#0f172a]`}>
          {!studentId ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 bg-slate-50 dark:bg-[#1e293b]/30 p-12 w-full">
              <div className="w-16 h-16 bg-white dark:bg-[#0f172a] rounded-[16px] flex items-center justify-center mb-6 border border-slate-200 dark:border-white/10 shadow-sm">
                <FileText size={32} className="text-slate-600 dark:text-slate-400" />
              </div>
              <h3 className="text-[20px] font-bold text-slate-800 dark:text-slate-200 mb-2">Not İşlemleri</h3>
              <p className="text-[14px] text-slate-500 font-medium text-center">Not girişi yapabilmek veya geçmiş notları görebilmek için sol menüden öğrenci arayınız.</p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col">
              
              {/* Sağ Header */}
              <div className="flex flex-col lg:flex-row gap-8 items-start lg:items-center px-4 md:px-8 py-6 border-b border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-[#1e293b]/50 shrink-0">
                <div className="flex items-center gap-3 md:gap-5">
                  <button onClick={() => setStudentId(null)} className="md:hidden p-2 -ml-2 text-slate-500 hover:bg-slate-200 rounded-full transition-colors">
                    <span className="text-[20px] leading-none block rotate-180">&rsaquo;</span>
                  </button>
                  <div>
                    <h2 className="text-[20px] md:text-[24px] font-bold text-slate-900 dark:text-white tracking-tight leading-none mb-2">{studentName}</h2>
                    <span className="text-[11px] font-bold text-slate-500 uppercase tracking-widest px-2.5 py-1 bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-white/10 rounded-md shadow-sm">Aktif Öğrenci</span>
                  </div>
                </div>

                <div className="flex-1 grid grid-cols-2 lg:grid-cols-3 gap-6 lg:border-l border-slate-200 dark:border-white/10 pt-6 lg:pt-0 lg:pl-8">
                  <div className="flex flex-col">
                    <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5"><Calculator size={12}/> Genel Ort.</span>
                    <span className="text-[24px] font-mono font-bold text-slate-900 dark:text-white leading-none">{calculateGPA()}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5"><Activity size={12}/> Not Sayısı</span>
                    <span className="text-[24px] font-mono font-bold text-slate-900 dark:text-white leading-none">{pastGrades.length}</span>
                  </div>
                  <div className="flex flex-col justify-center items-end col-span-2 lg:col-span-1 mt-4 lg:mt-0">
                    <button 
                      onClick={handleRunAiAnalysis} 
                      className="px-6 py-3 bg-white dark:bg-[#0f172a] border border-[#0f172a] hover:bg-[#1e3a8a] text-slate-900 dark:text-white font-bold rounded-xl transition-all shadow-md flex items-center justify-center gap-2 text-[13px] w-full lg:w-auto"
                    >
                      <Sparkles size={16}/> AI Gelişim Analizi
                    </button>
                  </div>
                </div>
              </div>
              
              <div className="p-8 flex flex-col gap-10">

              {}
              <div className="flex flex-col bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm p-6">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-[12px] bg-white dark:bg-[#0f172a] text-slate-900 dark:text-white flex items-center justify-center shadow-md">
                    <GraduationCap size={18} />
                  </div>
                  <div>
                    <h2 className="text-[18px] font-bold text-slate-900 dark:text-white tracking-tight">Yeni Not Girişi</h2>
                  </div>
                </div>

                <form className="flex flex-col gap-6" onSubmit={handleSave}>
                  <div className="bg-slate-50/50 dark:bg-[#1e293b]/50 p-6 rounded-[24px] border border-slate-200 dark:border-white/10 flex flex-col gap-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                      <div>
                        <label className="block text-[13px] font-bold text-slate-700 dark:text-slate-300 mb-2">Ders (Branş)</label>
                        <select 
                          className="w-full p-3.5 bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-white/10 rounded-[12px] focus:ring-2 focus:ring-[#0f172a] outline-none text-[14px] font-medium text-slate-800 dark:text-slate-200 transition-all cursor-pointer shadow-sm" 
                          value={course} 
                          onChange={e => setCourse(e.target.value)}
                        >
                          {courses.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[13px] font-bold text-slate-700 dark:text-slate-300 mb-2">Öğretmen</label>
                        <select 
                          className="w-full p-3.5 bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-white/10 rounded-[12px] focus:ring-2 focus:ring-[#0f172a] outline-none text-[14px] font-medium text-slate-800 dark:text-slate-200 transition-all cursor-pointer shadow-sm" 
                          value={teacher} 
                          onChange={e => setTeacher(e.target.value)}
                        >
                          {teacherNames.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-[13px] font-bold text-slate-700 dark:text-slate-300 mb-2">Dönem</label>
                        <select 
                          className="w-full p-3.5 bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-white/10 rounded-[12px] focus:ring-2 focus:ring-[#0f172a] outline-none text-[14px] font-medium text-slate-800 dark:text-slate-200 transition-all cursor-pointer shadow-sm" 
                          value={term} 
                          onChange={e => setTerm(e.target.value)}
                        >
                          <option value="1. Dönem">1. Dönem</option>
                          <option value="2. Dönem">2. Dönem</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[13px] font-bold text-slate-700 dark:text-slate-300 mb-2">Sınav Türü</label>
                        <select 
                          className="w-full p-3.5 bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-white/10 rounded-[12px] focus:ring-2 focus:ring-[#0f172a] outline-none text-[14px] font-medium text-slate-800 dark:text-slate-200 transition-all cursor-pointer shadow-sm" 
                          value={exam} 
                          onChange={e => setExam(e.target.value)}
                        >
                          <option value="1. Sınav">1. Sınav</option>
                          <option value="2. Sınav">2. Sınav</option>
                          <option value="Performans">Performans</option>
                          <option value="Proje">Proje</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex items-end pt-6 border-t border-slate-200 dark:border-white/10/60 mt-2">
                      <div className="w-[400px] mr-8 shrink-0">
                        <label className="block text-[13px] font-bold text-slate-700 dark:text-slate-300 mb-2">Puan (0-100)</label>
                        <input 
                          type="number" 
                          min="0" 
                          max="100" 
                          value={score} 
                          onChange={e => { setScore(e.target.value); markDirty(); }} 
                          required 
                          className="w-full p-3 bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-white/10 rounded-[10px] focus:ring-2 focus:ring-[#0f172a] outline-none text-[15px] font-bold text-slate-900 dark:text-white transition-all placeholder:text-slate-600 dark:text-slate-400 shadow-sm" 
                          placeholder="Örn: 85" 
                        />
                      </div>
                      <button 
                        type="submit" 
                        disabled={isSaving} 
                        className="w-auto px-8 py-3 bg-white dark:bg-[#0f172a] hover:bg-[#1e3a8a] text-slate-900 dark:text-white font-bold rounded-[10px] transition-colors shadow-sm disabled:opacity-50 flex items-center justify-center gap-2 text-[14px] shrink-0 h-[46px]"
                      >
                        <Save size={18} />
                        {isSaving ? 'İşleniyor...' : 'Sisteme İşle'}
                      </button>
                    </div>
                  </div>
                  
                  {isSaved && (
                    <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-[16px]">
                      <CheckCircle2 size={20} />
                      <span className="text-[14px] font-bold">Not başarıyla kaydedildi.</span>
                    </div>
                  )}
                </form>
              </div>

              {}
              <div className="flex flex-col bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm p-6 mb-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-[12px] bg-slate-50 dark:bg-[#1e293b] text-slate-600 dark:text-slate-400 flex items-center justify-center shadow-sm border border-slate-200 dark:border-white/10">
                    <Award size={18} />
                  </div>
                  <div>
                    <h2 className="text-[18px] font-bold text-slate-900 dark:text-white tracking-tight">Geçmiş Notlar</h2>
                  </div>
                </div>

                <div>
                  {loadingPast ? (
                    <div className="flex flex-col items-center justify-center py-12 text-slate-500">
                      <div className="w-8 h-8 rounded-full border-4 border-slate-200 dark:border-white/10 border-t-slate-900 animate-spin mb-4"></div>
                      <span className="text-[13px] font-medium">Kayıtlar yükleniyor...</span>
                    </div>
                  ) : pastGrades.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-slate-500 border-2 border-dashed border-slate-200 dark:border-white/10 rounded-[24px]">
                       <Award size={32} className="mb-4 text-slate-700 dark:text-slate-300" />
                       <span className="text-[15px] font-bold text-slate-700 dark:text-slate-300">Not Bulunamadı</span>
                       <span className="text-[13px] font-medium mt-1">Bu öğrenciye ait girilmiş bir not kaydı yok.</span>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                      {Object.entries(pastGrades.reduce((acc, record) => {
                        const cName = record.fields?.course_name?.stringValue || record.fields?.courseName?.stringValue || "Diğer";
                        if (!acc[cName]) acc[cName] = [];
                        acc[cName].push(record);
                        return acc;
                      }, {})).map(([cName, records]) => (
                        <div key={cName} className="bg-white dark:bg-[#0f172a] rounded-[24px] border border-slate-200 dark:border-white/10 overflow-hidden shadow-sm">
                          <div className="px-6 py-4 border-b border-slate-200 dark:border-white/10 bg-slate-50/50 dark:bg-[#1e293b]/50">
                            <h3 className="text-[15px] font-bold text-slate-900 dark:text-white">{cName}</h3>
                          </div>
                          <div className="divide-y divide-slate-100">
                            {records.map(record => {
                              const eType = record.fields?.examType?.stringValue || "";
                              const eTerm = record.fields?.term?.stringValue || "1. Dönem";
                              const scr = record.fields?.score?.integerValue || record.fields?.score?.doubleValue || "0";
                              const tName = record.fields?.teacherName?.stringValue || "Sistem";
                              const docId = record.name.split('/').pop();

                              return (
                                <div key={docId} className="flex justify-between items-center px-6 py-5 hover:bg-slate-50 dark:bg-[#1e293b] transition-colors group">
                                  <div className="flex items-center gap-4">
                                    <div className="text-slate-600 dark:text-slate-400 w-10 h-10 bg-white dark:bg-[#0f172a] rounded-[12px] flex items-center justify-center border border-slate-200 dark:border-white/10 shadow-sm shrink-0">
                                      <CalendarDays size={16} />
                                    </div>
                                    <div>
                                      <div className="font-bold text-[14px] text-slate-900 dark:text-white mb-0.5">{eTerm} - {eType}</div>
                                      <div className="font-medium text-[12px] text-slate-500">{tName}</div>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-6">
                                    <div className="text-[24px] font-mono font-bold text-slate-900 dark:text-white">{scr}</div>
                                    <button 
                                      className="w-10 h-10 bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400 rounded-[12px] hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 flex items-center justify-center transition-colors shadow-sm opacity-0 group-hover:opacity-100" 
                                      onClick={() => handleDelete(docId)}
                                      title="Notu Sil"
                                    >
                                      <Trash2 size={16} />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
            </div>
          )}
        </div>

        {}
        {isAiDashboardOpen && (
          <div className="absolute inset-0 bg-white dark:bg-[#0f172a] z-50 flex flex-col animate-in fade-in zoom-in-95 duration-200 overflow-hidden">
            {}
            <div className="flex items-center justify-between px-8 py-6 border-b border-slate-200 dark:border-white/10 bg-white dark:bg-[#0f172a] shrink-0">
              <div className="flex items-center gap-4">
                <button 
                  onClick={() => setIsAiDashboardOpen(false)}
                  className="w-10 h-10 bg-slate-50 dark:bg-[#1e293b] border border-slate-200 dark:border-white/10 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-50 dark:bg-[#1e293b] hover:text-slate-900 dark:text-white transition-colors"
                >
                  <ChevronLeft size={20} />
                </button>
                <div>
                  <h2 className="text-[20px] font-bold text-slate-900 dark:text-white leading-none mb-1">Akademik Gelişim Paneli</h2>
                  <div className="text-[13px] font-medium text-slate-500">{studentName}</div>
                </div>
              </div>
              <div className="flex items-center gap-2 px-4 py-2 bg-indigo-50 border border-indigo-100 rounded-[12px] text-indigo-700">
                <BrainCircuit size={18} />
                <span className="text-[13px] font-bold uppercase tracking-widest">Nova AI v2</span>
              </div>
            </div>

            {}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-8 bg-slate-50/50 dark:bg-[#1e293b]/50">
              <div className="max-w-5xl mx-auto flex flex-col gap-8">
                
                {}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-white dark:bg-[#0f172a] p-6 rounded-[24px] border border-slate-200 dark:border-white/10 shadow-sm flex flex-col">
                    <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-[14px] flex items-center justify-center mb-4">
                      <BarChart size={24} />
                    </div>
                    <div className="text-[13px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-1">Genel Ortalama</div>
                    <div className="text-[32px] font-bold text-slate-900 dark:text-white leading-none">{calculateGPA()}</div>
                  </div>

                  <div className="bg-white dark:bg-[#0f172a] p-6 rounded-[24px] border border-slate-200 dark:border-white/10 shadow-sm flex flex-col">
                    <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-[14px] flex items-center justify-center mb-4">
                      <AlertTriangle size={24} />
                    </div>
                    <div className="text-[13px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-1">Geçiş & Devamsızlık</div>
                    <div className="text-[32px] font-bold text-slate-900 dark:text-white leading-none">{studentAbsents} <span className="text-[16px] text-slate-500 font-medium">Kayıt</span></div>
                  </div>

                  <div className="bg-white dark:bg-[#0f172a] p-6 rounded-[24px] border border-slate-200 dark:border-white/10 shadow-sm flex flex-col">
                    <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-[14px] flex items-center justify-center mb-4">
                      <TrendingUp size={24} />
                    </div>
                    <div className="text-[13px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-1">Sınav Sayısı</div>
                    <div className="text-[32px] font-bold text-slate-900 dark:text-white leading-none">{pastGrades.length} <span className="text-[16px] text-slate-500 font-medium">Sınav</span></div>
                  </div>
                </div>

                {}
                <div className="bg-white dark:bg-[#0f172a] rounded-[32px] border border-slate-200 dark:border-white/10 shadow-sm overflow-hidden flex flex-col">
                  <div className="px-8 py-6 border-b border-slate-200 dark:border-white/10 bg-white dark:bg-[#0f172a] flex justify-between items-center">
                    <h3 className="text-[18px] font-bold text-slate-900 dark:text-white flex items-center gap-3">
                      <Sparkles size={20} className="text-indigo-600" />
                      Yapay Zeka Analizi ve Yönlendirme
                    </h3>
                  </div>
                  <div className="p-8">
                    {isAiLoading ? (
                      <div className="flex flex-col items-center justify-center py-20">
                        <div className="w-10 h-10 border-3 border-indigo-100 border-t-indigo-600 rounded-full animate-spin mb-5"></div>
                        <div className="text-[15px] font-medium text-slate-600 dark:text-slate-400">Öğrenci verileri sentezleniyor...</div>
                      </div>
                    ) : aiAnalysis ? (
                      <div className="prose max-w-none prose-slate text-[15px] leading-relaxed">
                        {aiAnalysis.split('\n').filter(p => p.trim()).map((paragraph, idx) => (
                          <p key={idx} className="mb-4 text-slate-700 dark:text-slate-300 font-medium">{paragraph}</p>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-20 text-slate-500 font-medium">
                        Analiz verisi bulunamadı. Lütfen tekrar deneyin.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>

      {deleteConfirm && (
        <div className="fixed inset-0 bg-slate-900/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#0f172a] rounded-2xl w-full max-w-sm shadow-2xl p-6 flex flex-col gap-4">
            <h3 className="text-[18px] font-bold text-slate-900 dark:text-white">Notu Sil</h3>
            <p className="text-[14px] text-slate-600 dark:text-slate-400 font-medium">Notu silmek istediğinize emin misiniz?</p>
            <div className="flex justify-end gap-3 mt-4">
              <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2.5 text-[13px] font-bold text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-[#1e293b] hover:bg-slate-200 rounded-lg transition-colors">İptal</button>
              <button onClick={confirmDelete} className="px-4 py-2.5 text-[13px] font-bold text-slate-900 dark:text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors">Sil</button>
            </div>
          </div>
        </div>
      )}
      <UnsavedBanner visible={isDirty} />
    </div>
  );
};

export default GradesAdminView;
