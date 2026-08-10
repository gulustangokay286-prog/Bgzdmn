import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, RefreshCw, Copy, Check, Clock, BookOpen, Activity, AlertCircle, Loader2 } from 'lucide-react';
import { db } from '../services/firebaseConfig';
import { doc, onSnapshot, collection, query, where } from 'firebase/firestore';
import { aiService } from '../services/aiService';
import novaAiIcon from '../assets/nova_ai_icon.png';

const formatAnalysis = (text) => {
  if (!text) return '';
  
  // Clean raw HTML & markdown noise
  let cleanText = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/---/g, '') // remove horizontal lines
    .replace(/#{1,6}\s*/g, '') // remove markdown titles
    .replace(/\*{1,4}/g, ''); // remove markdown bold asterisks

  const lines = cleanText.split('\n').map(l => l.trim()).filter(Boolean);
  
  return (
    <div className="space-y-4">
      {lines.map((line, idx) => {
        // Handle key: value pairs (e.g. "Ders Yükü: Mevcut verilerde...")
        if (line.includes(':') && !line.startsWith('http')) {
          const colonIndex = line.indexOf(':');
          const label = line.slice(0, colonIndex).trim();
          const value = line.slice(colonIndex + 1).trim();

          if (value) {
            return (
              <div key={idx} className="text-sm leading-relaxed mb-2">
                <span className="font-semibold text-slate-900 dark:text-white">{label}: </span>
                <span className="font-normal text-slate-700 dark:text-slate-300">{value}</span>
              </div>
            );
          } else {
            return (
              <h4 key={idx} className="text-base font-bold text-slate-900 dark:text-white mt-6 mb-2 tracking-tight">
                {label}
              </h4>
            );
          }
        }

        // Section title heuristic (short line without period)
        const isSectionTitle = line.length < 50 && !line.endsWith('.') && !line.endsWith(',');
        if (isSectionTitle) {
          return (
            <h4 key={idx} className="text-base font-bold text-slate-900 dark:text-white mt-6 mb-2 tracking-tight">
              {line}
            </h4>
          );
        }

        // Normal paragraph
        return (
          <p key={idx} className="text-sm font-normal text-slate-700 dark:text-slate-300 leading-relaxed mb-3">
            {line}
          </p>
        );
      })}
    </div>
  );
};

const TeacherAIAnalysisView = () => {
  const { teacherId } = useParams();
  const navigate = useNavigate();
  
  const [teacher, setTeacher] = useState(null);
  const [schedules, setSchedules] = useState([]);
  const [activities, setActivities] = useState([]);
  const [aiAnalysis, setAiAnalysis] = useState('');
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  // Real-time Firestore Listeners
  useEffect(() => {
    if (!teacherId) return;

    setLoading(true);

    // 1. Real-time Teacher User Document
    const unsubUser = onSnapshot(doc(db, 'users', teacherId), (snapshot) => {
      if (snapshot.exists()) {
        setTeacher({ id: snapshot.id, ...snapshot.data() });
      } else {
        setError('Öğretmen verisi bulunamadı.');
      }
      setLoading(false);
    }, (err) => {
      console.error("User listen error:", err);
      setError("Öğretmen verisi dinlenirken hata oluştu.");
      setLoading(false);
    });

    // 2. Real-time Schedules Listener ('schedules' collection)
    const unsubSchedules = onSnapshot(
      query(collection(db, 'schedules'), where('teacherId', '==', teacherId)),
      (snapshot) => {
        const scheds = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        setSchedules(scheds);
      },
      (err) => console.log("Schedules listen error:", err)
    );

    // 3. Real-time Schedule Backup Listener ('schedule' collection)
    const unsubScheduleBackup = onSnapshot(
      query(collection(db, 'schedule'), where('teacherId', '==', teacherId)),
      (snapshot) => {
        const schedsBackup = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        if (schedsBackup.length > 0) {
          setSchedules(prev => prev.length === 0 ? schedsBackup : prev);
        }
      },
      (err) => console.log("Schedule backup listen error:", err)
    );

    // 4. Real-time Mobile Activities Listener
    const unsubActivities = onSnapshot(
      query(collection(db, 'teacher_activities'), where('teacherId', '==', teacherId)),
      (snapshot) => {
        const acts = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        setActivities(acts);
      },
      (err) => console.log("Activities listen error:", err)
    );

    return () => {
      unsubUser();
      unsubSchedules();
      unsubScheduleBackup();
      unsubActivities();
    };
  }, [teacherId]);

  // Trigger AI Analysis when teacher or schedule data changes
  useEffect(() => {
    if (teacher && !loading) {
      runAIAnalysis();
    }
  }, [teacherId, teacher?.branch, schedules.length, activities.length]);

  const runAIAnalysis = async () => {
    if (!teacher) return;
    setAnalyzing(true);
    setError('');

    try {
      const teacherName = teacher.full_name || teacher.fullName || 'İsimsiz Öğretmen';
      const branch = teacher.branch || 'Branş Belirtilmemiş';
      const totalHours = schedules.length;
      const activityCount = activities.length;

      const prompt = `Öğretmen: ${teacherName}
Branş: ${branch}
Haftalık Ders Saati: ${totalHours}
Mobil Aktivite Kaydı: ${activityCount}

YUKARIDAKİ VERİLERE GÖRE DEĞERLENDİRME KURALLARI:
1. "Merhaba ben Nova AI...", "Boğaziçi Koleji veritabanına göre..." gibi giriş cümleleri KESİNLİKLE YAZMA.
2. Öğretmenin adını, branşını veya ders saatini üstte liste halinde tekrar etme. Doğrudan analize başla.
3. Yatay çizgi (---) veya markdown başlık sembolleri (#, ##, ###, ####, **, ****) KESİNLİKLE KULLANMA.
4. Her bölümü alt alta temiz paragraflar halinde yaz.
5. Eğer ders saati 0 veya aktivite kaydı yoksa "Riskli" deme! "Henüz sistemde tanımlanmış aktif ders programı veya yeterli aktivite kaydı bulunmamaktadır" şeklinde belirt ve verilerin nasıl tanımlanması gerektiğine dair kısa yönlendirme yap.`;

      const response = await aiService.generateContent(prompt);
      setAiAnalysis(response);
    } catch (err) {
      console.error(err);
      setError(err.message || 'Analiz oluşturulurken bir hata meydana geldi.');
    }
    setAnalyzing(false);
  };

  const handleCopy = () => {
    if (!aiAnalysis) return;
    navigator.clipboard.writeText(aiAnalysis);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Determine Dynamic Status (İyi, Gelişmeli, Yoğun, Yeterli Veri Yok)
  const getStatusBadge = () => {
    const hours = schedules.length;
    if (hours === 0) {
      return { label: 'Yeterli Veri Yok', color: 'text-slate-500 bg-slate-500/10 border-slate-500/20' };
    } else if (hours < 10) {
      return { label: 'Gelişmeli', color: 'text-amber-500 bg-amber-500/10 border-amber-500/20' };
    } else if (hours <= 24) {
      return { label: 'İyi', color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20' };
    } else {
      return { label: 'Yoğun', color: 'text-orange-500 bg-orange-500/10 border-orange-500/20' };
    }
  };

  // ── Initial Fullscreen Loading Screen ──
  if (loading) {
    return (
      <div className="fixed inset-0 bg-slate-50 dark:bg-[#090D16] z-50 flex flex-col items-center justify-center p-6 transition-all duration-300">
        <Loader2 size={36} className="text-slate-400 dark:text-slate-500 animate-spin mb-4" />
        <h2 className="text-sm font-semibold text-slate-800 dark:text-slate-200 tracking-tight mb-1">
          Yapay Zeka Analiz Ediyor
        </h2>
        <p className="text-xs text-slate-400 dark:text-slate-500 font-medium">
          Veriler işleniyor...
        </p>
      </div>
    );
  }

  const teacherName = teacher?.full_name || teacher?.fullName || 'İsimsiz Öğretmen';
  const branch = teacher?.branch || 'Belirtilmemiş';
  const statusInfo = getStatusBadge();

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#090D16] text-slate-900 dark:text-slate-100 p-4 md:p-8 lg:p-12 transition-colors duration-200">
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Top Header */}
        <div className="flex items-center justify-between gap-4 pb-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="p-2 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
              title="Geri Dön"
            >
              <ArrowLeft size={20} />
            </button>

            <div>
              <h1 className="text-xl font-bold tracking-tight text-slate-900 dark:text-white flex items-center gap-2 flex-wrap">
                <span className="font-bold text-slate-900 dark:text-white">Öğretmen:</span>
                <span className="font-medium text-slate-600 dark:text-slate-300">{teacherName}</span>
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">Nova AI Öğretmen Analizi</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {aiAnalysis && !error && (
              <button
                onClick={handleCopy}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/60 transition-colors"
              >
                {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
                <span>{copied ? 'Kopyalandı' : 'Metni Kopyala'}</span>
              </button>
            )}
            <button
              onClick={runAIAnalysis}
              disabled={analyzing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              <RefreshCw size={13} className={analyzing ? 'animate-spin' : ''} />
              <span>{analyzing ? 'Analiz Ediliyor...' : 'Yeniden Analiz Et'}</span>
            </button>
          </div>
        </div>

        {/* Minimal Borderless Stat Strip */}
        <div className="flex flex-wrap items-center gap-6 py-3 border-y border-slate-200/60 dark:border-slate-800/60 text-xs">
          <div className="flex items-center gap-2">
            <Clock size={15} className="text-slate-400 dark:text-slate-500" />
            <span className="text-slate-500 dark:text-slate-400 font-medium">Haftalık Ders:</span>
            <span className="font-semibold text-slate-900 dark:text-white">{schedules.length} Saat</span>
          </div>

          <div className="h-3.5 w-px bg-slate-200 dark:bg-slate-800 hidden sm:block" />

          <div className="flex items-center gap-2">
            <BookOpen size={15} className="text-slate-400 dark:text-slate-500" />
            <span className="text-slate-500 dark:text-slate-400 font-medium">Branş:</span>
            <span className="font-semibold text-slate-900 dark:text-white">{branch}</span>
          </div>

          <div className="h-3.5 w-px bg-slate-200 dark:bg-slate-800 hidden sm:block" />

          <div className="flex items-center gap-2">
            <Activity size={15} className="text-slate-400 dark:text-slate-500" />
            <span className="text-slate-500 dark:text-slate-400 font-medium">Aktivite:</span>
            <span className="font-semibold text-slate-900 dark:text-white">{activities.length} Kayıt</span>
          </div>

          <div className="h-3.5 w-px bg-slate-200 dark:bg-slate-800 hidden sm:block" />

          <div className="flex items-center gap-2">
            <span className="text-slate-500 dark:text-slate-400 font-medium">Durum:</span>
            <span className={`px-2 py-0.5 rounded-full font-semibold border text-[11px] ${statusInfo.color}`}>
              {statusInfo.label}
            </span>
          </div>
        </div>

        {/* Clean Report Document Container */}
        <div className="bg-white dark:bg-[#0E131F] border border-slate-200/60 dark:border-slate-800/60 rounded-xl p-6 md:p-8 shadow-xs relative">
          
          {/* Borderless overlay loading state with real loading spinner */}
          {analyzing && (
            <div className="absolute inset-0 bg-white/75 dark:bg-[#0E131F]/80 backdrop-blur-xs flex items-center justify-center z-10 rounded-xl transition-all">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
                <Loader2 size={18} className="animate-spin text-slate-500 dark:text-slate-400" />
                <span>Analiz güncelleniyor...</span>
              </div>
            </div>
          )}

          {error ? (
            <div className="py-10 flex flex-col items-center justify-center text-center max-w-md mx-auto space-y-3">
              <div className="text-rose-500">
                <AlertCircle size={24} />
              </div>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-white">Analiz Oluşturulamadı</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">{error}</p>
              <button
                onClick={runAIAnalysis}
                className="mt-2 px-4 py-2 rounded-lg bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-medium hover:opacity-90 transition-opacity"
              >
                Tekrar Deneyin
              </button>
            </div>
          ) : (
            <div className="space-y-2">
              {formatAnalysis(aiAnalysis)}
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default TeacherAIAnalysisView;
