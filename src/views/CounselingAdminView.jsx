import React, { useState, useEffect } from 'react';
import { FileText, Target, AlertTriangle, Save, MessageCircle, UserCheck, BrainCircuit, Users, Search, Activity, CheckCircle2, Phone, BookOpen, Clock, HeartHandshake, ShieldAlert, BadgeInfo, ChevronLeft, BarChart, Sparkles } from 'lucide-react';
import { db } from '../services/firebaseConfig';
import { collection, onSnapshot, query, orderBy, addDoc, serverTimestamp } from 'firebase/firestore';
import { firebaseService } from '../services/firebase';
import { aiService } from '../services/aiService';
import StudentSearch from '../components/StudentSearch';
import useUnsavedChanges from '../hooks/useUnsavedChanges';
import UnsavedBanner from '../components/UnsavedBanner';

const CounselingAdminView = () => {
  const [users, setUsers] = useState([]);
  const [studentId, setStudentId] = useState(null);
  const [studentName, setStudentName] = useState(null);
  const [loading, setLoading] = useState(true);
  
  const [activeTab, setActiveTab] = useState('notes');

  const [noteContent, setNoteContent] = useState('');
  const [testName, setTestName] = useState('Beck Depresyon Envanteri');
  const [testResult, setTestResult] = useState('');
  const [parentNote, setParentNote] = useState('');
  const [behaviorType, setBehaviorType] = useState('Olumlu');
  const [behaviorNote, setBehaviorNote] = useState('');
  
  const [aiAnalysis, setAiAnalysis] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [isAiDashboardOpen, setIsAiDashboardOpen] = useState(false);

  const [records, setRecords] = useState([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  const [attendanceData, setAttendanceData] = useState([]);
  const [gradesData, setGradesData] = useState([]);

  const { markDirty, markClean, isDirty } = useUnsavedChanges();

  const getActualRiskData = () => {
    if (!studentId) return null;
    const absents = attendanceData.filter(a => a.fields?.status?.stringValue === 'absent' || a.fields?.status?.stringValue === 'late' || a.fields?.status?.stringValue === 'devamsiz').length;
    
    const totalGrades = gradesData.reduce((sum, g) => sum + Number(g.fields?.score?.integerValue || g.fields?.score?.doubleValue || 0), 0);
    const gpa = gradesData.length > 0 ? (totalGrades / gradesData.length).toFixed(2) : '0.00';

    const attendancePercentage = Math.max(0, 100 - (absents * 1.1)).toFixed(0);
    
    let attendanceRisk = 'Düşük'; let gpaRisk = 'Düşük'; let overallRisk = 'Düşük';
    if (attendancePercentage < 85) attendanceRisk = 'Kritik'; else if (attendancePercentage < 92) attendanceRisk = 'Orta';
    if (parseFloat(gpa) < 50) gpaRisk = 'Kritik'; else if (parseFloat(gpa) < 70) gpaRisk = 'Orta';
    
    if (attendanceRisk === 'Kritik' || gpaRisk === 'Kritik') overallRisk = 'Kritik';
    else if (attendanceRisk === 'Orta' || gpaRisk === 'Orta') overallRisk = 'Orta';

    return { attendancePercentage, attendanceRisk, gpa, gpaRisk, overallRisk };
  };

  useEffect(() => {
    const init = async () => {
      try {
        const data = await firebaseService.fetchAllUsers();
        const students = data.filter(u => {
          const role = u.fields?.role?.stringValue?.toLowerCase() || '';
          return role === 'student' || role === 'öğrenci';
        });
        setUsers(students);
      } catch(e) {
        console.error("Öğrenciler yüklenemedi", e);
      }
      setLoading(false);
    };
    init();
  }, []);

  useEffect(() => {
    if (!studentId) {
      setIsAiDashboardOpen(false);
      return;
    }
    
    const loadAcademicData = async () => {
      const { academicService } = await import('../services/academicService');
      const att = await academicService.fetchStudentAttendance(studentId);
      const grd = await academicService.fetchStudentGrades(studentId);
      setAttendanceData(att);
      setGradesData(grd);
    };
    loadAcademicData();

    const q = query(collection(db, 'counseling'), orderBy('createdAt', 'desc'));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setRecords(data.filter(r => r.studentId === studentId));
    });
    return () => unsubscribe();
  }, [studentId]);

  const showSuccess = () => {
    setIsSaved(true);
    setTimeout(() => setIsSaved(false), 2500);
  };

  const handleSaveNote = async (e) => {
    e.preventDefault();
    if (!noteContent.trim()) return;
    setIsSaving(true);
    await addDoc(collection(db, 'counseling'), {
      studentId, studentName,
      type: 'Bireysel Görüşme',
      content: noteContent,
      createdAt: serverTimestamp()
    });
    setNoteContent('');
    setIsSaving(false);
    markClean();
    showSuccess();
  };

  const handleSaveTest = async (e) => {
    e.preventDefault();
    if (!testResult.trim()) return;
    setIsSaving(true);
    await addDoc(collection(db, 'counseling'), {
      studentId, studentName,
      type: 'Psikolojik Test',
      testName,
      content: testResult,
      createdAt: serverTimestamp()
    });
    setTestResult('');
    setIsSaving(false);
    markClean();
    showSuccess();
  };

  const handleSaveParent = async (e) => {
    e.preventDefault();
    if (!parentNote.trim()) return;
    setIsSaving(true);
    await addDoc(collection(db, 'counseling'), {
      studentId, studentName,
      type: 'Veli Görüşmesi',
      content: parentNote,
      createdAt: serverTimestamp()
    });
    setParentNote('');
    setIsSaving(false);
    markClean();
    showSuccess();
  };

  const handleSaveBehavior = async (e) => {
    e.preventDefault();
    if (!behaviorNote.trim()) return;
    setIsSaving(true);
    await addDoc(collection(db, 'counseling'), {
      studentId, studentName,
      type: 'Davranış / Disiplin',
      behaviorType,
      content: behaviorNote,
      createdAt: serverTimestamp()
    });
    setBehaviorNote('');
    setIsSaving(false);
    markClean();
    showSuccess();
  };

  const handleRunAiAnalysis = async () => {
    setIsAiDashboardOpen(true);
    setIsAiLoading(true);
    try {
      const pastNotes = records.map(r => `[${r.type}]: ${r.content}`).join(" | ");
      const risk = getActualRiskData();
      
      const prompt = `Öğrenci: ${studentName}. Akademik Başarı: ${risk?.gpa} (${risk?.gpaRisk} risk), Devamlılık: %${risk?.attendancePercentage} (${risk?.attendanceRisk} risk). Geçmiş rehberlik kayıtları: ${pastNotes || 'Kayıt yok'}. Lütfen bu veriler ışığında öğrencinin psikolojik ve akademik durumu hakkında net, profesyonel bir eylem planı ve klinik olmayan bir içgörü özeti yazınız. Maddeler halinde olsun, html kullanma, sadece metin ver.`;
      
      const res = await aiService.generateContent(prompt, 'gemini-3.1-flash-lite');
      setAiAnalysis(res);
    } catch (e) {
      setAiAnalysis("Analiz hatası: " + e.message);
    }
    setIsAiLoading(false);
  };

  const riskData = getActualRiskData();
  const currentDate = new Date().toLocaleDateString('tr-TR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div className="w-full h-full flex-1 flex flex-col font-sans overflow-hidden pb-2 md:pb-6 p-4 md:p-12">
      
      {}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-10 w-full shrink-0">
        <div className="flex items-center gap-5">
          <div className="flex flex-col">
            <span className="text-[13px] font-medium text-slate-600 dark:text-slate-400 mb-1 uppercase tracking-wider">{currentDate}</span>
            <h1 className="text-[36px] font-semibold text-slate-900 dark:text-white tracking-tight leading-none">Rehberlik & Psikolojik Danışmanlık</h1>
          </div>
        </div>
      </div>

      <div className="flex flex-col md:flex-row bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm flex-1 w-full min-h-0 overflow-hidden relative">
        
        { }
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
                users={users} 
                selectedId={studentId} 
                onSelect={(id, name) => { setStudentId(id); setStudentName(name); setAiAnalysis(''); setActiveTab('notes'); }} 
              />
            )}
          </div>
        </div>

        { }
        <div className={`${studentId ? 'flex' : 'hidden md:flex'} flex-1 flex-col min-h-0 bg-white dark:bg-[#0f172a]`}>
          {!studentId ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-500 bg-slate-50 dark:bg-[#1e293b]/30 p-12 w-full">
              <div className="w-16 h-16 bg-white dark:bg-[#0f172a] rounded-[16px] flex items-center justify-center mb-6 border border-slate-200 dark:border-white/10 shadow-sm">
                <HeartHandshake size={32} className="text-slate-600 dark:text-slate-400" />
              </div>
              <h3 className="text-[20px] font-bold text-slate-800 dark:text-slate-200 mb-2">Rehberlik İşlemleri</h3>
              <p className="text-[14px] text-slate-500 font-medium text-center">Öğrenci analizleri ve görüşme notları için sol panelden bir öğrenci seçin.</p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col">
              
              { }
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

                {}
                <div className="flex-1 grid grid-cols-2 lg:grid-cols-4 gap-6 lg:border-l border-slate-200 dark:border-white/10 pt-6 lg:pt-0 lg:pl-8">
                  <div className="flex flex-col">
                    <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5"><BookOpen size={12}/> Akademik</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[20px] font-mono font-bold text-slate-900 dark:text-white leading-none">{riskData?.gpa}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${riskData?.gpaRisk === 'Kritik' ? 'bg-rose-50 text-rose-600 border-rose-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'}`}>
                        {riskData?.gpaRisk}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5"><Clock size={12}/> Devamlılık</span>
                    <div className="flex items-center gap-2">
                      <span className="text-[20px] font-mono font-bold text-slate-900 dark:text-white leading-none">%{riskData?.attendancePercentage}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${riskData?.attendanceRisk === 'Kritik' ? 'bg-rose-50 text-rose-600 border-rose-100' : 'bg-emerald-50 text-emerald-600 border-emerald-100'}`}>
                        {riskData?.attendanceRisk}
                      </span>
                    </div>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1.5"><Activity size={12}/> Genel Durum</span>
                    <span className={`text-[14px] font-bold leading-none mt-1.5 ${riskData?.overallRisk === 'Kritik' ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {riskData?.overallRisk === 'Kritik' ? 'Müdahale Gerekli' : 'İyi Durumda'}
                    </span>
                  </div>
                  <div className="flex flex-col justify-center lg:items-end col-span-2 lg:col-span-1 mt-4 lg:mt-0">
                    <button 
                      onClick={handleRunAiAnalysis} 
                      className="px-6 py-3 bg-white dark:bg-[#0f172a] border border-indigo-200 hover:border-indigo-300 text-indigo-600 font-bold rounded-xl transition-all shadow-sm flex items-center justify-center gap-2 text-[13px] w-full lg:w-auto"
                    >
                      <Sparkles size={16}/> AI Öğrenci Profili
                    </button>
                  </div>
                </div>
              </div>
              
              <div className="p-8 flex flex-col gap-10">

              {}
              <div className="flex flex-col bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm overflow-hidden flex-1 shrink-0">
                <div className="flex overflow-x-auto border-b border-slate-200 dark:border-white/10 custom-scrollbar shrink-0 px-4 bg-slate-50/50 dark:bg-[#1e293b]/50">
                  <div onClick={() => setActiveTab('notes')} className={`cursor-pointer px-6 py-4 text-[13px] font-bold transition-all border-b-2 flex items-center gap-2 whitespace-nowrap ${activeTab === 'notes' ? 'border-slate-900 text-slate-900 dark:text-white' : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-600 dark:text-slate-400'}`}>
                    <MessageCircle size={16}/> Bireysel Görüşme
                  </div>
                  <div onClick={() => setActiveTab('parents')} className={`cursor-pointer px-6 py-4 text-[13px] font-bold transition-all border-b-2 flex items-center gap-2 whitespace-nowrap ${activeTab === 'parents' ? 'border-slate-900 text-slate-900 dark:text-white' : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-600 dark:text-slate-400'}`}>
                    <Users size={16}/> Veli Görüşmesi
                  </div>
                  <div onClick={() => setActiveTab('tests')} className={`cursor-pointer px-6 py-4 text-[13px] font-bold transition-all border-b-2 flex items-center gap-2 whitespace-nowrap ${activeTab === 'tests' ? 'border-slate-900 text-slate-900 dark:text-white' : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-600 dark:text-slate-400'}`}>
                    <Target size={16}/> Psikolojik Testler
                  </div>
                  <div onClick={() => setActiveTab('behavior')} className={`cursor-pointer px-6 py-4 text-[13px] font-bold transition-all border-b-2 flex items-center gap-2 whitespace-nowrap ${activeTab === 'behavior' ? 'border-slate-900 text-slate-900 dark:text-white' : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-600 dark:text-slate-400'}`}>
                    <ShieldAlert size={16}/> Davranış & Disiplin
                  </div>
                </div>

                <div className="p-8">
                  {}
                  {activeTab === 'notes' && (
                    <form onSubmit={handleSaveNote} className="flex flex-col h-full gap-6">
                      <label className="text-[13px] font-bold text-slate-700 dark:text-slate-300">Görüşme Notları</label>
                      <textarea 
                        className="w-full h-40 p-5 bg-slate-50 dark:bg-[#1e293b] border border-slate-200 dark:border-white/10 rounded-[20px] focus:ring-2 focus:ring-indigo-500 focus:bg-white dark:bg-[#0f172a] outline-none text-[15px] font-medium transition-all placeholder:text-slate-600 dark:text-slate-400 resize-none shadow-sm" 
                        placeholder="Öğrenci ile yapılan görüşmenin detaylarını buraya girin..."
                        value={noteContent}
                        onChange={e => { setNoteContent(e.target.value); markDirty(); }}
                        required
                      />
                      <div className="flex flex-col sm:flex-row justify-end items-center gap-4 mt-2">
                        {isSaved && (
                          <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 rounded-xl text-[13px] font-bold">
                            <CheckCircle2 size={18} /> Başarıyla kaydedildi!
                          </div>
                        )}
                        <button type="submit" disabled={isSaving} className="w-full sm:w-auto px-8 py-4 bg-indigo-600 hover:bg-indigo-700 text-slate-900 dark:text-white font-bold rounded-[16px] transition-colors shadow-sm disabled:opacity-50 flex items-center justify-center gap-2 text-[15px]">
                          {isSaving ? 'Kaydediliyor...' : <><Save size={18}/> Sistemi İşle</>}
                        </button>
                      </div>
                    </form>
                  )}

                  {}
                  {activeTab === 'parents' && (
                    <form onSubmit={handleSaveParent} className="flex flex-col h-full gap-6">
                      <label className="text-[13px] font-bold text-slate-700 dark:text-slate-300">Veli Görüşme Özeti</label>
                      <textarea 
                        className="w-full h-40 p-5 bg-slate-50 dark:bg-[#1e293b] border border-slate-200 dark:border-white/10 rounded-[20px] focus:ring-2 focus:ring-indigo-500 focus:bg-white dark:bg-[#0f172a] outline-none text-[15px] font-medium transition-all placeholder:text-slate-600 dark:text-slate-400 resize-none shadow-sm" 
                        placeholder="Veli ile görüşülen konuları ve alınan aksiyonları yazın..."
                        value={parentNote}
                        onChange={e => { setParentNote(e.target.value); markDirty(); }}
                        required
                      />
                      <div className="flex flex-col sm:flex-row justify-end items-center gap-4 mt-2">
                        {isSaved && (
                          <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 rounded-xl text-[13px] font-bold">
                            <CheckCircle2 size={18} /> Başarıyla kaydedildi!
                          </div>
                        )}
                        <button type="submit" disabled={isSaving} className="w-full sm:w-auto px-8 py-4 bg-indigo-600 hover:bg-indigo-700 text-slate-900 dark:text-white font-bold rounded-[16px] transition-colors shadow-sm disabled:opacity-50 flex items-center justify-center gap-2 text-[15px]">
                          {isSaving ? 'Kaydediliyor...' : <><Save size={18}/> Sistemi İşle</>}
                        </button>
                      </div>
                    </form>
                  )}

                  {}
                  {activeTab === 'tests' && (
                    <form onSubmit={handleSaveTest} className="flex flex-col h-full gap-6">
                      <div>
                        <label className="block text-[13px] font-bold text-slate-700 dark:text-slate-300 mb-2">Test Adı / Türü</label>
                        <select 
                          className="w-full p-4 bg-slate-50 dark:bg-[#1e293b] border border-slate-200 dark:border-white/10 rounded-[16px] focus:ring-2 focus:ring-indigo-500 focus:bg-white dark:bg-[#0f172a] outline-none text-[15px] font-bold text-slate-800 dark:text-slate-200 transition-all cursor-pointer shadow-sm"
                          value={testName}
                          onChange={e => { setTestName(e.target.value); markDirty(); }}
                        >
                          <option value="Beck Depresyon Envanteri">Beck Depresyon Envanteri</option>
                          <option value="Sınav Kaygısı Ölçeği">Sınav Kaygısı Ölçeği</option>
                          <option value="Mesleki Eğilim Envanteri">Mesleki Eğilim Envanteri</option>
                          <option value="Çoklu Zeka Envanteri">Çoklu Zeka Envanteri</option>
                          <option value="Diğer (Manuel Giriş)">Diğer</option>
                        </select>
                      </div>
                      <div>
                         <label className="block text-[13px] font-bold text-slate-700 dark:text-slate-300 mb-2">Test Sonucu ve Yorumlama</label>
                         <textarea 
                          className="w-full h-32 p-5 bg-slate-50 dark:bg-[#1e293b] border border-slate-200 dark:border-white/10 rounded-[20px] focus:ring-2 focus:ring-indigo-500 focus:bg-white dark:bg-[#0f172a] outline-none text-[15px] font-medium transition-all placeholder:text-slate-600 dark:text-slate-400 resize-none shadow-sm" 
                          placeholder="Testin sayısal sonucu ve psikolojik yorumunu giriniz..."
                          value={testResult}
                          onChange={e => { setTestResult(e.target.value); markDirty(); }}
                          required
                        />
                      </div>
                      <div className="flex flex-col sm:flex-row justify-end items-center gap-4 mt-2">
                        {isSaved && (
                          <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 rounded-xl text-[13px] font-bold">
                            <CheckCircle2 size={18} /> Başarıyla kaydedildi!
                          </div>
                        )}
                        <button type="submit" disabled={isSaving} className="w-full sm:w-auto px-8 py-4 bg-indigo-600 hover:bg-indigo-700 text-slate-900 dark:text-white font-bold rounded-[16px] transition-colors shadow-sm disabled:opacity-50 flex items-center justify-center gap-2 text-[15px]">
                          {isSaving ? 'Kaydediliyor...' : <><Save size={18}/> Sistemi İşle</>}
                        </button>
                      </div>
                    </form>
                  )}

                  {}
                  {activeTab === 'behavior' && (
                    <form onSubmit={handleSaveBehavior} className="flex flex-col h-full gap-6">
                      <div>
                        <label className="block text-[13px] font-bold text-slate-700 dark:text-slate-300 mb-2">Davranış Türü</label>
                        <div className="flex gap-4">
                           <label className={`flex-1 flex items-center justify-center gap-2 p-4 rounded-[16px] border cursor-pointer font-bold transition-all shadow-sm ${behaviorType === 'Olumlu' ? 'bg-emerald-50 border-emerald-200 text-emerald-700 ring-2 ring-emerald-500' : 'bg-slate-50 dark:bg-[#1e293b] border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:bg-[#1e293b]'}`}>
                             <input type="radio" name="behavior" value="Olumlu" checked={behaviorType === 'Olumlu'} onChange={() => { setBehaviorType('Olumlu'); markDirty(); }} className="hidden" />
                             Olumlu Davranış
                           </label>
                           <label className={`flex-1 flex items-center justify-center gap-2 p-4 rounded-[16px] border cursor-pointer font-bold transition-all shadow-sm ${behaviorType === 'Olumsuz' ? 'bg-rose-50 border-rose-200 text-rose-700 ring-2 ring-rose-500' : 'bg-slate-50 dark:bg-[#1e293b] border-slate-200 dark:border-white/10 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:bg-[#1e293b]'}`}>
                             <input type="radio" name="behavior" value="Olumsuz" checked={behaviorType === 'Olumsuz'} onChange={() => { setBehaviorType('Olumsuz'); markDirty(); }} className="hidden" />
                             Olumsuz / Disiplin
                           </label>
                        </div>
                      </div>
                      <div>
                         <label className="block text-[13px] font-bold text-slate-700 dark:text-slate-300 mb-2">Olay Özeti ve Alınan Aksiyon</label>
                         <textarea 
                          className="w-full h-32 p-5 bg-slate-50 dark:bg-[#1e293b] border border-slate-200 dark:border-white/10 rounded-[20px] focus:ring-2 focus:ring-indigo-500 focus:bg-white dark:bg-[#0f172a] outline-none text-[15px] font-medium transition-all placeholder:text-slate-600 dark:text-slate-400 resize-none shadow-sm" 
                          placeholder="Davranış detayını buraya girin..."
                          value={behaviorNote}
                          onChange={e => { setBehaviorNote(e.target.value); markDirty(); }}
                          required
                        />
                      </div>
                      <div className="flex flex-col sm:flex-row justify-end items-center gap-4 mt-2">
                        {isSaved && (
                          <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 text-emerald-700 rounded-xl text-[13px] font-bold">
                            <CheckCircle2 size={18} /> Başarıyla kaydedildi!
                          </div>
                        )}
                        <button type="submit" disabled={isSaving} className="w-full sm:w-auto px-8 py-4 bg-indigo-600 hover:bg-indigo-700 text-slate-900 dark:text-white font-bold rounded-[16px] transition-colors shadow-sm disabled:opacity-50 flex items-center justify-center gap-2 text-[15px]">
                          {isSaving ? 'Kaydediliyor...' : <><Save size={18}/> Sistemi İşle</>}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </div>

              {}
              <div className="bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-white/10 shadow-sm p-6 mb-8 mt-2">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-[12px] bg-slate-50 dark:bg-[#1e293b] text-slate-600 dark:text-slate-400 flex items-center justify-center shadow-sm border border-slate-200 dark:border-white/10">
                    <Clock size={18} />
                  </div>
                  <div>
                    <h2 className="text-[18px] font-bold text-slate-900 dark:text-white tracking-tight">Geçmiş Kayıtlar Timeline</h2>
                  </div>
                </div>
                
                <div>
                  {records.length === 0 ? (
                    <div className="text-center py-8 text-slate-600 dark:text-slate-400 font-medium text-[14px]">
                      Henüz geçmiş bir kayıt bulunmuyor.
                    </div>
                  ) : (
                    <div className="flex flex-col gap-6 relative before:absolute before:inset-0 before:ml-6 before:-translate-x-px md:before:mx-auto md:before:translate-x-0 before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 before:to-transparent">
                      {records.map((r, i) => {
                         const dateStr = r.createdAt?.toDate ? r.createdAt.toDate().toLocaleDateString('tr-TR') : 'Şimdi';
                         const isTest = r.type === 'Psikolojik Test';
                         const isBehavior = r.type === 'Davranış / Disiplin';
                         
                         let Icon = MessageCircle;
                         let bgColor = 'bg-slate-50 dark:bg-[#1e293b] text-slate-600 dark:text-slate-400 border-slate-200 dark:border-white/10';
                         if (r.type === 'Veli Görüşmesi') { Icon = Users; bgColor = 'bg-blue-50 text-blue-600 border-blue-200'; }
                         if (isTest) { Icon = Target; bgColor = 'bg-purple-50 text-purple-600 border-purple-200'; }
                         if (isBehavior) { Icon = ShieldAlert; bgColor = r.behaviorType === 'Olumsuz' ? 'bg-rose-50 text-rose-600 border-rose-200' : 'bg-emerald-50 text-emerald-600 border-emerald-200'; }

                         return (
                           <div key={r.id} className={`relative flex items-center justify-between md:justify-normal md:odd:flex-row-reverse group is-active`}>
                             <div className="flex items-center justify-center w-12 h-12 rounded-full border-4 border-white bg-slate-50 dark:bg-[#1e293b] text-slate-600 dark:text-slate-400 shrink-0 md:order-1 md:group-odd:-translate-x-1/2 md:group-even:translate-x-1/2 shadow-sm relative z-10">
                               <Icon size={18} />
                             </div>
                             <div className="w-[calc(100%-4rem)] md:w-[calc(50%-3rem)] p-6 rounded-[20px] bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-white/10 shadow-sm hover:shadow-md transition-shadow">
                               <div className="flex items-center justify-between mb-3">
                                 <span className={`text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-lg border ${bgColor}`}>{r.type} {isTest ? `(${r.testName})` : ''}</span>
                                 <span className="text-[12px] font-bold text-slate-600 dark:text-slate-400">{dateStr}</span>
                               </div>
                               <p className="text-[14px] font-medium text-slate-600 dark:text-slate-400 leading-relaxed">
                                 {r.content}
                               </p>
                             </div>
                           </div>
                         );
                      })}
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
                  <h2 className="text-[20px] font-bold text-slate-900 dark:text-white leading-none mb-1">Psikolojik Danışmanlık ve Gelişim Analizi</h2>
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
                    <div className="text-[13px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-1">Görüşme Kayıtları</div>
                    <div className="text-[32px] font-bold text-slate-900 dark:text-white leading-none">{records.length} <span className="text-[16px] text-slate-500 font-medium">Kayıt</span></div>
                  </div>

                  <div className="bg-white dark:bg-[#0f172a] p-6 rounded-[24px] border border-slate-200 dark:border-white/10 shadow-sm flex flex-col">
                    <div className="w-12 h-12 bg-amber-50 text-amber-600 rounded-[14px] flex items-center justify-center mb-4">
                      <ShieldAlert size={24} />
                    </div>
                    <div className="text-[13px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-1">Disiplin / Risk</div>
                    <div className="text-[32px] font-bold text-slate-900 dark:text-white leading-none">{records.filter(r => r.type === 'Davranış / Disiplin' && r.behaviorType === 'Olumsuz').length} <span className="text-[16px] text-slate-500 font-medium">Vaka</span></div>
                  </div>

                  <div className="bg-white dark:bg-[#0f172a] p-6 rounded-[24px] border border-slate-200 dark:border-white/10 shadow-sm flex flex-col">
                    <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-[14px] flex items-center justify-center mb-4">
                      <Target size={24} />
                    </div>
                    <div className="text-[13px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest mb-1">Psikolojik Testler</div>
                    <div className="text-[32px] font-bold text-slate-900 dark:text-white leading-none">{records.filter(r => r.type === 'Psikolojik Test').length} <span className="text-[16px] text-slate-500 font-medium">Test</span></div>
                  </div>
                </div>

                {}
                <div className="bg-white dark:bg-[#0f172a] rounded-[32px] border border-slate-200 dark:border-white/10 shadow-sm overflow-hidden flex flex-col">
                  <div className="px-8 py-6 border-b border-slate-200 dark:border-white/10 bg-white dark:bg-[#0f172a] flex justify-between items-center">
                    <h3 className="text-[18px] font-bold text-slate-900 dark:text-white flex items-center gap-3">
                      <Sparkles size={20} className="text-indigo-600" />
                      Yapay Zeka İçgörüsü
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

        <UnsavedBanner visible={isDirty} />
      </div>
    </div>
  );
};

export default CounselingAdminView;
