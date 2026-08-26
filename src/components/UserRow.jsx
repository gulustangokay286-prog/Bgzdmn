import React, { useState, useEffect } from 'react';
import { 
  Search, 
  CheckCircle, 
  CheckCircle2, 
  XCircle, 
  Info, 
  Mail, 
  Phone, 
  ChevronDown, 
  Check, 
  X, 
  User, 
  Trash2, 
  Edit3, 
  Save, 
  GraduationCap, 
  BookOpen, 
  Building2, 
  ShieldCheck, 
  Hash, 
  Sparkles 
} from 'lucide-react';
import { firebaseService } from '../services/firebase';
import { db } from '../services/firebaseConfig';
import { doc, updateDoc } from 'firebase/firestore';

const BRANCH_LIST = [
  "Matematik",
  "Fizik",
  "Kimya",
  "Biyoloji",
  "Türkçe",
  "Edebiyat",
  "Tarih",
  "Coğrafya",
  "Felsefe",
  "Din Kültürü ve Ahlak Bilgisi",
  "İngilizce",
  "Almanca",
  "Beden Eğitimi",
  "Müzik",
  "Görsel Sanatlar",
  "Rehberlik",
  "Bilişim"
];

const CLASS_LIST = ["9", "10", "11", "12"];
const SECTION_LIST = ["A", "B", "C", "D", "E", "F"];
const DEPARTMENT_LIST = [
  "İdari İşler",
  "Muhasebe & Finans",
  "Öğrenci İşleri",
  "Halkla İlişkiler & Tanıtım",
  "Kütüphane",
  "Teknik Hizmetler",
  "Güvenlik",
  "Yemekhane"
];

const formatStudentDisplay = (classId, section, branch) => {
  if (classId && section) {
    return `${classId}/${section}`;
  }
  if (branch && typeof branch === 'string') {
    const match = branch.match(/^(\d{1,2})\s*[-/._]?\s*([A-Za-z])/);
    if (match) return `${match[1]}/${match[2].toUpperCase()}`;
    return branch;
  }
  if (classId) return `${classId}. Sınıf`;
  return '—';
};

const UserRow = ({ document, showApprovalActions, onUpdate }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Raw extract helper
  const getFieldVal = (fieldName) => {
    if (!document) return '';
    if (document.fields && document.fields[fieldName]) {
      return document.fields[fieldName].stringValue || '';
    }
    return document[fieldName] || '';
  };

  const userId = document?.name ? document.name.split('/').pop() : (document?.id || '');
  const name = getFieldVal('displayName') || getFieldVal('full_name') || getFieldVal('fullName') || getFieldVal('name') || 'İsimsiz Kullanıcı';
  const roleRaw = getFieldVal('role') || 'student';
  const tc = getFieldVal('tc_kimlik') || getFieldVal('tcKimlik') || getFieldVal('tc') || '-';
  const rawStatus = getFieldVal('status') || 'pending';
  const isAdmin = roleRaw.toLowerCase() === 'admin' || roleRaw.toLowerCase() === 'yönetici' || roleRaw.toLowerCase() === 'patron';
  const status = isAdmin ? 'approved' : rawStatus;
  const email = getFieldVal('email') || '-';
  const phone = getFieldVal('phone') || '';
  const currentBranch = getFieldVal('branch') || '';
  const currentClassId = getFieldVal('class_id') || (currentBranch.match(/^(\d{1,2})/)?.[1] || '9');
  const currentSection = getFieldVal('section') || getFieldVal('sube') || (currentBranch.match(/^[0-9]+([A-Za-z])/)?.[1]?.toUpperCase() || 'A');
  const currentSchoolNum = getFieldVal('school_number') || getFieldVal('schoolNumber') || '';
  const currentDepartment = getFieldVal('department') || 'İdari İşler';
  const pp = getFieldVal('profile_image') || getFieldVal('profileImage') || getFieldVal('profileImageUrl') || null;

  // Edit States
  const [editName, setEditName] = useState(name);
  const [editRole, setEditRole] = useState(roleRaw.toLowerCase());
  const [editPhone, setEditPhone] = useState(phone);
  const [editStatus, setEditStatus] = useState(status);
  const [editBranch, setEditBranch] = useState(currentBranch || 'Din Kültürü ve Ahlak Bilgisi');
  const [editClassId, setEditClassId] = useState(currentClassId || '9');
  const [editSection, setEditSection] = useState(currentSection || 'A');
  const [editSchoolNumber, setEditSchoolNumber] = useState(currentSchoolNum);
  const [editDepartment, setEditDepartment] = useState(currentDepartment);

  // Sync state when document changes or modal opens
  useEffect(() => {
    if (showDetails) {
      setEditName(name);
      setEditRole(roleRaw.toLowerCase());
      setEditPhone(phone);
      setEditStatus(status);
      setEditBranch(currentBranch || 'Din Kültürü ve Ahlak Bilgisi');
      setEditClassId(currentClassId || '9');
      setEditSection(currentSection || 'A');
      setEditSchoolNumber(currentSchoolNum);
      setEditDepartment(currentDepartment);
      setSaveSuccess(false);
    }
  }, [showDetails, document]);

  const handleProcess = async (newStatus) => {
    setIsProcessing(true);
    const success = await firebaseService.updateUserStatus(userId, newStatus);
    if (success && onUpdate) {
      onUpdate();
    }
    setIsProcessing(false);
  };

  const handleDelete = async () => {
    if (window.confirm(`${name} isimli kullanıcıyı tamamen silmek istediğinize emin misiniz?`)) {
      setIsProcessing(true);
      const success = await firebaseService.deleteUser(document.name || userId);
      if (success && onUpdate) {
        onUpdate();
      }
      setIsProcessing(false);
    }
  };

  const handleSaveUserChanges = async (e) => {
    e.preventDefault();
    if (!userId) return;
    setIsProcessing(true);
    setSaveSuccess(false);

    try {
      const payload = {
        full_name: editName.trim(),
        role: editRole,
        phone: editPhone.trim(),
        status: editStatus
      };

      if (editRole === 'teacher' || editRole === 'öğretmen') {
        payload.branch = editBranch;
      } else if (editRole === 'student' || editRole === 'öğrenci') {
        payload.class_id = editClassId;
        payload.section = editSection;
        payload.sube = editSection;
        payload.branch = `${editClassId}${editSection}`;
        payload.school_number = editSchoolNumber.trim();
      } else if (editRole === 'personnel' || editRole === 'personel') {
        payload.department = editDepartment;
      }

      await updateDoc(doc(db, 'users', userId), payload);
      setSaveSuccess(true);

      setTimeout(() => {
        setSaveSuccess(false);
        setShowDetails(false);
        if (onUpdate) onUpdate();
      }, 900);

    } catch (err) {
      console.error("Kullanıcı güncelleme hatası:", err);
      alert("Kullanıcı bilgileri güncellenirken bir hata oluştu: " + err.message);
    } finally {
      setIsProcessing(false);
    }
  };

  const getRoleBadge = (r) => {
    const isStudent = (r || '').toLowerCase() === 'student' || (r || '').toLowerCase() === 'öğrenci';
    const isTeacher = (r || '').toLowerCase() === 'teacher' || (r || '').toLowerCase() === 'öğretmen';
    
    switch((r || '').toLowerCase()) {
      case 'student':
      case 'öğrenci': 
        return (
          <div className="flex flex-col items-start gap-1">
            <span className="font-bold text-blue-600 dark:text-blue-400">Öğrenci</span>
            <span className="text-[11.5px] font-bold text-slate-800 dark:text-slate-200 bg-blue-50 dark:bg-blue-950/40 px-2 py-0.5 rounded-md border border-blue-100 dark:border-blue-900/30">
              {formatStudentDisplay(currentClassId, currentSection, currentBranch)}
            </span>
          </div>
        );
      case 'teacher':
      case 'öğretmen': 
        return (
          <div className="flex flex-col items-start gap-1">
            <span className="font-bold text-purple-600 dark:text-purple-400">Öğretmen</span>
            <span className="text-[11px] font-semibold text-purple-800 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/40 px-1.5 py-0.5 rounded-md border border-purple-100 dark:border-purple-900/30 truncate max-w-[130px]">
              {currentBranch || 'Öğretmen'}
            </span>
          </div>
        );
      case 'parent':
      case 'veli': return <span className="font-semibold text-emerald-600 dark:text-emerald-400">Veli</span>;
      case 'personnel':
      case 'personel': return <span className="font-semibold text-teal-600 dark:text-teal-400">Personel</span>;
      case 'admin':
      case 'yönetici':
      case 'patron': return <span className="font-semibold text-amber-600 dark:text-amber-400">Yönetici</span>;
      default: return <span className="font-semibold text-slate-700 dark:text-slate-300">{r}</span>;
    }
  };

  return (
    <>
      <div className="flex items-center py-4 text-sm relative">
        
        <div style={{ width: '25%' }} className="flex items-center gap-3 pr-2">
          {pp ? (
            <img src={pp} alt="PP" className="w-10 h-10 rounded-full object-cover shadow-sm border border-slate-200 dark:border-white/10" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-slate-50 dark:bg-[#1e293b] text-slate-600 dark:text-slate-400 flex items-center justify-center shadow-sm border border-slate-200 dark:border-white/10">
              <User size={18} />
            </div>
          )}
          <div className="flex items-center gap-1.5 font-semibold text-slate-900 dark:text-white truncate" title={name}>
            <span className="truncate">{name}</span>
            {isAdmin && (
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="#3b82f6" className="text-blue-500 shrink-0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4" stroke="white" strokeWidth="3"/></svg>
            )}
          </div>
        </div>
        
        <div style={{ width: '15%' }} className="pr-2">
          {getRoleBadge(roleRaw)}
        </div>
        
        <div style={{ width: '20%' }} className="text-slate-600 dark:text-slate-400 font-mono text-xs tracking-wider pr-2 truncate" title={tc}>
          {tc}
        </div>
        
        <div style={{ width: '20%' }} className="text-slate-500 dark:text-slate-400 truncate pr-2" title={email}>
          {email}
        </div>

        <div style={{ width: '15%' }} className="pr-2">
          {status === 'approved' ? (
            <span className="flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400 font-semibold text-xs"><CheckCircle size={14}/> Onaylı</span>
          ) : status === 'rejected' ? (
            <span className="flex items-center gap-1.5 text-rose-600 dark:text-rose-400 font-semibold text-xs"><XCircle size={14}/> Reddedildi</span>
          ) : (
            <span className="flex items-center gap-1.5 text-amber-500 dark:text-amber-400 font-semibold text-xs animate-pulse"><Info size={14}/> Bekliyor</span>
          )}
        </div>

        <div className="flex-1 flex justify-end gap-2 items-center">
          <button 
            onClick={() => setShowDetails(true)} 
            className="p-2 rounded-xl text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 hover:bg-indigo-100 dark:hover:bg-indigo-500/20 transition-all border border-indigo-200/50 dark:border-indigo-500/20 flex items-center gap-1 font-medium text-xs shadow-xs"
            title="Kullanıcı Bilgilerini Düzenle / İncele"
          >
            <Search size={15} />
            <span>Düzenle</span>
          </button>

          <button 
            onClick={isAdmin ? undefined : handleDelete}
            disabled={isAdmin || isProcessing}
            className={`p-2 rounded-xl transition-colors border border-transparent ${
              isAdmin 
                ? 'text-slate-400 dark:text-slate-600 cursor-not-allowed opacity-40' 
                : 'text-slate-500 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10'
            }`}
            title={isAdmin ? "Yöneticiler silinemez" : "Kullanıcıyı Sil"}
          >
            {isProcessing && !isAdmin ? <div className="w-4 h-4 border-2 border-slate-200 dark:border-white/10 border-t-[#991b1b] rounded-full animate-spin"></div> : <Trash2 size={16} />}
          </button>

          {showApprovalActions && (
            isProcessing ? (
              <div className="w-5 h-5 border-2 border-slate-200 dark:border-white/10 border-t-info rounded-full animate-spin"></div>
            ) : (
              <div className="flex gap-1 relative">
                <button 
                  onClick={() => handleProcess('approved')} 
                  className="p-1.5 rounded-lg text-slate-600 dark:text-slate-400 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-500/10 transition-colors"
                  title="Onayla"
                >
                  <CheckCircle size={18} />
                </button>
                <button 
                  onClick={() => handleProcess('rejected')} 
                  className="p-1.5 rounded-lg text-slate-600 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                  title="Reddet"
                >
                  <XCircle size={18} />
                </button>
              </div>
            )
          )}
        </div>
      </div>

      {/* DETAY & DÜZENLEME MODALI */}
      {showDetails && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-white/10 rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            
            {/* Modal Header */}
            <div className="px-6 py-5 border-b border-slate-100 dark:border-white/10 flex items-center justify-between bg-slate-50/50 dark:bg-[#1e293b]/40 shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center border border-indigo-100 dark:border-indigo-500/20">
                  <Edit3 size={18} />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-base leading-tight">Kullanıcı Düzenleme & Ayarları</h3>
                  <p className="text-xs text-slate-500 font-medium">TC: {tc}</p>
                </div>
              </div>
              
              <button 
                className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-200 dark:hover:bg-[#1e293b] text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                onClick={() => setShowDetails(false)}
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body Form */}
            <form onSubmit={handleSaveUserChanges} className="p-6 overflow-y-auto custom-scrollbar flex-1 flex flex-col gap-4">
              
              {/* Ad Soyad */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                  <User size={13} className="text-slate-400" />
                  <span>Ad Soyad</span>
                </label>
                <input 
                  type="text" 
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#1e293b] border border-slate-200 dark:border-white/10 rounded-xl text-sm font-semibold text-slate-900 dark:text-white outline-none focus:border-indigo-500 transition-colors"
                  placeholder="Kullanıcı Adı Soyadı"
                />
              </div>

              {/* Rol & Durum Seçimi Grid */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                    <ShieldCheck size={13} className="text-slate-400" />
                    <span>Kullanıcı Rolü</span>
                  </label>
                  <select 
                    value={editRole}
                    onChange={(e) => setEditRole(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#1e293b] border border-slate-200 dark:border-white/10 rounded-xl text-sm font-semibold text-slate-900 dark:text-white outline-none focus:border-indigo-500 transition-colors"
                  >
                    <option value="student">Öğrenci</option>
                    <option value="teacher">Öğretmen</option>
                    <option value="personnel">Personel</option>
                    <option value="parent">Veli</option>
                    <option value="admin">Yönetici</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                    <CheckCircle2 size={13} className="text-slate-400" />
                    <span>Hesap Durumu</span>
                  </label>
                  <select 
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#1e293b] border border-slate-200 dark:border-white/10 rounded-xl text-sm font-semibold text-slate-900 dark:text-white outline-none focus:border-indigo-500 transition-colors"
                  >
                    <option value="approved">Onaylı (Aktif)</option>
                    <option value="pending">Onay Bekliyor</option>
                    <option value="rejected">Reddedildi</option>
                  </select>
                </div>
              </div>

              {/* ROL: ÖĞRETMEN İSE BRANŞ SEÇİCİ */}
              {(editRole === 'teacher' || editRole === 'öğretmen') && (
                <div className="flex flex-col gap-1.5 p-4 rounded-2xl bg-purple-50/50 dark:bg-purple-950/20 border border-purple-100 dark:border-purple-900/30">
                  <label className="text-xs font-bold uppercase tracking-wider text-purple-700 dark:text-purple-300 flex items-center gap-1.5">
                    <BookOpen size={14} className="text-purple-600 dark:text-purple-400" />
                    <span>Öğretmen Branşı (Din Kültürü, Matematik vb.)</span>
                  </label>
                  <select 
                    value={editBranch}
                    onChange={(e) => setEditBranch(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white dark:bg-[#0f172a] border border-purple-200 dark:border-purple-800/40 rounded-xl text-sm font-semibold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-purple-500 transition-all"
                  >
                    {BRANCH_LIST.map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* ROL: ÖĞRENCİ İSE SINIF, ŞUBE VE OKUL NUMARASI */}
              {(editRole === 'student' || editRole === 'öğrenci') && (
                <div className="p-4 rounded-2xl bg-blue-50/50 dark:bg-blue-950/20 border border-blue-100 dark:border-blue-900/30 flex flex-col gap-3">
                  <div className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-300">
                    <GraduationCap size={15} className="text-blue-600 dark:text-blue-400" />
                    <span>Öğrenci Sınıf, Şube ve Numara Bilgileri</span>
                  </div>

                  <div className="grid grid-cols-3 gap-2.5">
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">Sınıf</label>
                      <select 
                        value={editClassId}
                        onChange={(e) => setEditClassId(e.target.value)}
                        className="w-full px-3 py-2 bg-white dark:bg-[#0f172a] border border-blue-200 dark:border-blue-800/40 rounded-xl text-sm font-bold text-slate-900 dark:text-white outline-none"
                      >
                        {CLASS_LIST.map(c => (
                          <option key={c} value={c}>{c}. Sınıf</option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">Şube</label>
                      <select 
                        value={editSection}
                        onChange={(e) => setEditSection(e.target.value)}
                        className="w-full px-3 py-2 bg-white dark:bg-[#0f172a] border border-blue-200 dark:border-blue-800/40 rounded-xl text-sm font-bold text-slate-900 dark:text-white outline-none"
                      >
                        {SECTION_LIST.map(s => (
                          <option key={s} value={s}>{s} Şubesi</option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-semibold text-slate-600 dark:text-slate-400">Okul No</label>
                      <input 
                        type="text" 
                        value={editSchoolNumber}
                        onChange={(e) => setEditSchoolNumber(e.target.value)}
                        placeholder="Örn: 104"
                        className="w-full px-3 py-2 bg-white dark:bg-[#0f172a] border border-blue-200 dark:border-blue-800/40 rounded-xl text-sm font-bold text-slate-900 dark:text-white outline-none"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* ROL: PERSONEL İSE DEPARTMAN */}
              {(editRole === 'personnel' || editRole === 'personel') && (
                <div className="flex flex-col gap-1.5 p-4 rounded-2xl bg-teal-50/50 dark:bg-teal-950/20 border border-teal-100 dark:border-teal-900/30">
                  <label className="text-xs font-bold uppercase tracking-wider text-teal-700 dark:text-teal-300 flex items-center gap-1.5">
                    <Building2 size={14} className="text-teal-600 dark:text-teal-400" />
                    <span>Personel Departmanı / Görevi</span>
                  </label>
                  <select 
                    value={editDepartment}
                    onChange={(e) => setEditDepartment(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-white dark:bg-[#0f172a] border border-teal-200 dark:border-teal-800/40 rounded-xl text-sm font-semibold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-teal-500 transition-all"
                  >
                    {DEPARTMENT_LIST.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* İletişim Telefonu */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
                  <Phone size={13} className="text-slate-400" />
                  <span>İletişim Numarası</span>
                </label>
                <input 
                  type="tel" 
                  value={editPhone}
                  onChange={(e) => setEditPhone(e.target.value.replace(/[^0-9]/g, ''))}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-[#1e293b] border border-slate-200 dark:border-white/10 rounded-xl text-sm font-semibold text-slate-900 dark:text-white outline-none focus:border-indigo-500 transition-colors"
                  placeholder="05XX XXX XX XX"
                />
              </div>

              {/* Cihaz Kilidi Sıfırlama (Öğrenciler için) */}
              {(editRole === 'student' || editRole === 'öğrenci') && getFieldVal('registeredDeviceId') && (
                <div className="p-3 rounded-2xl bg-slate-50 dark:bg-[#1e293b] border border-slate-200 dark:border-white/10 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">Cihaz Bağlantısı</div>
                    <div className="text-xs font-mono text-slate-600 dark:text-slate-400 truncate">{getFieldVal('registeredDeviceId')}</div>
                  </div>
                  <button 
                    type="button"
                    onClick={async () => {
                      if(window.confirm('Cihaz kilidini sıfırlamak istediğinize emin misiniz?')) {
                        setIsProcessing(true);
                        try {
                          await firebaseService.resetDeviceLock(userId);
                          alert('Cihaz kilidi sıfırlandı.');
                          if (onUpdate) onUpdate();
                        } catch(e) {
                          console.error(e);
                        }
                        setIsProcessing(false);
                      }
                    }}
                    className="shrink-0 bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-white/10 hover:border-slate-300 text-slate-700 dark:text-slate-300 font-bold text-xs px-3 py-1.5 rounded-xl shadow-xs transition-colors"
                  >
                    Kilidi Sıfırla
                  </button>
                </div>
              )}

              {saveSuccess && (
                <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-400 font-bold text-xs flex items-center gap-2">
                  <CheckCircle2 size={16} />
                  <span>Kullanıcı bilgileri başarıyla kaydedildi!</span>
                </div>
              )}

              {/* Modal Buttons */}
              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100 dark:border-white/10 mt-2 shrink-0">
                <button 
                  type="button"
                  onClick={() => setShowDetails(false)} 
                  className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-[#1e293b] transition-colors"
                >
                  İptal
                </button>
                
                <button 
                  type="submit"
                  disabled={isProcessing}
                  className="px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 shadow-md shadow-indigo-600/20 transition-all flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isProcessing ? (
                    <span>Kaydediliyor...</span>
                  ) : (
                    <>
                      <Save size={15} />
                      <span>Değişiklikleri Kaydet</span>
                    </>
                  )}
                </button>
              </div>

            </form>
          </div>
        </div>
      )}
    </>
  );
};

export default UserRow;
