import React, { useState, useEffect } from 'react';
import { Save, Trash2, FileText, ChevronLeft, CalendarDays, GraduationCap } from 'lucide-react';
import { firebaseService } from '../services/firebase';
import { academicService } from '../services/academicService';
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
  const [isSaving, setIsSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const { markDirty, markClean, isDirty } = useUnsavedChanges();

  const [pastGrades, setPastGrades] = useState([]);
  const [loadingPast, setLoadingPast] = useState(false);

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
      loadPastGrades(studentId);
    } else {
      setPastGrades([]);
    }
  }, [studentId]);

  const handleSave = async (e) => {
    e.preventDefault();
    if (!studentId || !score) return;
    setIsSaving(true);
    const success = await academicService.saveGrade(studentId, course, exam, parseInt(score), teacher, term);
    if (success) {
      setScore('');
      loadPastGrades(studentId);
      markClean();
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

  return (
    <div className="w-full h-full flex flex-col font-sans overflow-hidden bg-transparent">
      
      {/* Header */}
      <div className="px-6 py-6 shrink-0 border-b border-slate-200 dark:border-white/5 bg-transparent">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Not Yönetimi</h1>
      </div>

      <div className="flex-1 flex min-h-0 relative">
        
        {/* Left Panel: Search */}
        <div className={`${studentId ? 'hidden md:flex' : 'flex'} w-full md:w-[320px] flex-shrink-0 flex-col border-r border-slate-200 dark:border-white/5 bg-transparent`}>
          {loading ? (
            <div className="flex items-center justify-center h-full text-slate-500">
              <span className="text-sm font-medium">Yükleniyor...</span>
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

        {/* Right Panel: Content */}
        <div className={`${studentId ? 'flex' : 'hidden md:flex'} flex-1 flex-col min-h-0 bg-transparent`}>
          {!studentId ? (
            <div className="flex flex-col items-center justify-center h-full text-slate-400 dark:text-slate-500 p-8 text-center">
              <FileText size={48} strokeWidth={1} className="mb-4 opacity-50" />
              <p className="text-sm">Not girişi yapmak veya görüntülemek için sol menüden bir öğrenci seçin.</p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              
              {/* Student Info Header */}
              <div className="px-6 py-6 md:px-10 border-b border-slate-200 dark:border-white/5 bg-transparent flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div className="flex items-center gap-3">
                  <button onClick={() => setStudentId(null)} className="md:hidden p-2 -ml-2 text-slate-500 hover:text-slate-900 dark:hover:text-white rounded-full transition-colors">
                    <ChevronLeft size={24} />
                  </button>
                  <div>
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white leading-none mb-1.5">{studentName}</h2>
                    <div className="flex items-center gap-2 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Aktif Öğrenci
                    </div>
                  </div>
                </div>

                <div className="flex gap-8">
                  <div className="flex flex-col">
                    <span className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Genel Ort.</span>
                    <span className="text-2xl font-mono font-bold text-slate-900 dark:text-white leading-none">{calculateGPA()}</span>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Not Sayısı</span>
                    <span className="text-2xl font-mono font-bold text-slate-900 dark:text-white leading-none">{pastGrades.length}</span>
                  </div>
                </div>
              </div>
              
              <div className="p-6 md:p-10 flex flex-col gap-10 max-w-5xl">

                {/* Form Section */}
                <section>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                    <GraduationCap size={18} className="text-slate-500" /> Yeni Not Girişi
                  </h3>
                  
                  <form onSubmit={handleSave} className="flex flex-col gap-5">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Ders (Branş)</label>
                        <select 
                          className="w-full p-2.5 bg-slate-100 dark:bg-white/5 border-none rounded-lg outline-none text-sm font-medium text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-slate-300 dark:focus:ring-white/20 transition-all" 
                          value={course} 
                          onChange={e => setCourse(e.target.value)}
                        >
                          {courses.map(c => <option key={c} value={c} className="bg-white dark:bg-slate-800">{c}</option>)}
                        </select>
                      </div>
                      
                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Öğretmen</label>
                        <select 
                          className="w-full p-2.5 bg-slate-100 dark:bg-white/5 border-none rounded-lg outline-none text-sm font-medium text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-slate-300 dark:focus:ring-white/20 transition-all" 
                          value={teacher} 
                          onChange={e => setTeacher(e.target.value)}
                        >
                          {teacherNames.map(t => <option key={t} value={t} className="bg-white dark:bg-slate-800">{t}</option>)}
                        </select>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Dönem</label>
                        <select 
                          className="w-full p-2.5 bg-slate-100 dark:bg-white/5 border-none rounded-lg outline-none text-sm font-medium text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-slate-300 dark:focus:ring-white/20 transition-all" 
                          value={term} 
                          onChange={e => setTerm(e.target.value)}
                        >
                          <option value="1. Dönem" className="bg-white dark:bg-slate-800">1. Dönem</option>
                          <option value="2. Dönem" className="bg-white dark:bg-slate-800">2. Dönem</option>
                        </select>
                      </div>

                      <div className="flex flex-col gap-1.5">
                        <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Sınav Türü</label>
                        <select 
                          className="w-full p-2.5 bg-slate-100 dark:bg-white/5 border-none rounded-lg outline-none text-sm font-medium text-slate-800 dark:text-slate-200 focus:ring-2 focus:ring-slate-300 dark:focus:ring-white/20 transition-all" 
                          value={exam} 
                          onChange={e => setExam(e.target.value)}
                        >
                          <option value="1. Sınav" className="bg-white dark:bg-slate-800">1. Sınav</option>
                          <option value="2. Sınav" className="bg-white dark:bg-slate-800">2. Sınav</option>
                          <option value="Performans" className="bg-white dark:bg-slate-800">Performans</option>
                          <option value="Proje" className="bg-white dark:bg-slate-800">Proje</option>
                        </select>
                      </div>
                    </div>

                    <div className="flex items-end gap-4 mt-2">
                      <div className="flex flex-col gap-1.5 w-full max-w-[200px]">
                        <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">Puan (0-100)</label>
                        <input 
                          type="number" 
                          min="0" 
                          max="100" 
                          value={score} 
                          onChange={e => { setScore(e.target.value); markDirty(); }} 
                          required 
                          className="w-full p-2.5 bg-white dark:bg-transparent border border-slate-300 dark:border-slate-700 rounded-lg outline-none text-sm font-bold text-slate-900 dark:text-white transition-all focus:border-slate-900 dark:focus:border-white" 
                          placeholder="Örn: 85" 
                        />
                      </div>
                      <button 
                        type="submit" 
                        disabled={isSaving} 
                        className="px-6 py-2.5 bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-medium rounded-lg hover:bg-slate-800 dark:hover:bg-slate-100 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 text-sm h-[42px]"
                      >
                        <Save size={16} />
                        {isSaving ? 'İşleniyor' : 'Sisteme İşle'}
                      </button>
                    </div>
                  </form>
                </section>

                <hr className="border-slate-200 dark:border-white/5" />

                {/* Past Grades */}
                <section>
                  <h3 className="text-base font-semibold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                    <CalendarDays size={18} className="text-slate-500" /> Geçmiş Notlar
                  </h3>

                  {loadingPast ? (
                    <div className="py-8 text-slate-500 text-sm">Yükleniyor...</div>
                  ) : pastGrades.length === 0 ? (
                    <div className="py-8 text-slate-500 text-sm">Kayıt bulunamadı.</div>
                  ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {Object.entries(pastGrades.reduce((acc, record) => {
                        const cName = record.fields?.course_name?.stringValue || record.fields?.courseName?.stringValue || "Diğer";
                        if (!acc[cName]) acc[cName] = [];
                        acc[cName].push(record);
                        return acc;
                      }, {})).map(([cName, records]) => (
                        <div key={cName} className="border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden bg-white/50 dark:bg-white/[0.01]">
                          <div className="px-4 py-3 border-b border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/[0.02]">
                            <h4 className="text-sm font-semibold text-slate-900 dark:text-white">{cName}</h4>
                          </div>
                          <div className="divide-y divide-slate-100 dark:divide-white/5">
                            {records.map(record => {
                              const eType = record.fields?.examType?.stringValue || "";
                              const eTerm = record.fields?.term?.stringValue || "1. Dönem";
                              const scr = record.fields?.score?.integerValue || record.fields?.score?.doubleValue || "0";
                              const tName = record.fields?.teacherName?.stringValue || "Sistem";
                              const docId = record.name.split('/').pop();

                              return (
                                <div key={docId} className="flex justify-between items-center px-4 py-3 group hover:bg-slate-50 dark:hover:bg-white/[0.02] transition-colors">
                                  <div className="flex flex-col">
                                    <span className="font-medium text-sm text-slate-900 dark:text-white mb-0.5">{eTerm} - {eType}</span>
                                    <span className="text-xs text-slate-500">{tName}</span>
                                  </div>
                                  <div className="flex items-center gap-4">
                                    <span className="text-lg font-mono font-bold text-slate-900 dark:text-white">{scr}</span>
                                    <button 
                                      className="p-2 text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10 dark:hover:text-rose-400 rounded-lg transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100" 
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
                </section>
                
              </div>
            </div>
          )}
        </div>
      </div>

      {deleteConfirm && (
        <div className="fixed inset-0 bg-slate-900/50 z-[60] flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-xl w-full max-w-sm shadow-xl p-6 border border-slate-200 dark:border-white/10">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-2">Notu Sil</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400">Bu işlemi geri alamazsınız. Emin misiniz?</p>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/10 rounded-lg transition-colors">İptal</button>
              <button onClick={confirmDelete} className="px-4 py-2 text-sm font-medium text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors">Sil</button>
            </div>
          </div>
        </div>
      )}
      
      <UnsavedBanner visible={isDirty} />
    </div>
  );
};

export default GradesAdminView;
