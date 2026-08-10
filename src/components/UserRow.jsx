import React, { useState } from 'react';
import { Search, CheckCircle, CheckCircle2, XCircle, Info, Mail, Phone, ChevronDown, Check, X, User, Trash2 } from 'lucide-react';
import { firebaseService } from '../services/firebase';

const UserRow = ({ document, showApprovalActions, onUpdate }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [showAssignClass, setShowAssignClass] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [selectedBranch, setSelectedBranch] = useState('A');

  const name = document.fields?.displayName?.stringValue || document.fields?.full_name?.stringValue || document.fields?.fullName?.stringValue || 'İsimsiz Kullanıcı';
  const roleRaw = document.fields?.role?.stringValue || '-';
  const role = roleRaw.charAt(0).toUpperCase() + roleRaw.slice(1);
  const tc = document.fields?.tc_kimlik?.stringValue || document.fields?.tcKimlik?.stringValue || '-';
  const rawStatus = document.fields?.status?.stringValue || '-';
  const isAdmin = roleRaw.toLowerCase() === 'admin' || roleRaw.toLowerCase() === 'yönetici';
  const status = isAdmin ? 'approved' : rawStatus;
  const email = document.fields?.email?.stringValue || '-';
  const pp = document.fields?.profile_image?.stringValue || document.fields?.profileImage?.stringValue || document.fields?.profileImageUrl?.stringValue || null;

  const handleProcess = async (newStatus) => {
    setIsProcessing(true);
    const success = await firebaseService.updateUserStatus(document.name.split('/').pop(), newStatus);
    if (success && onUpdate) {
      onUpdate();
    }
    setIsProcessing(false);
  };

  const handleDelete = async () => {
    if (window.confirm(`${name} isimli kullanıcıyı tamamen silmek istediğinize emin misiniz?`)) {
      setIsProcessing(true);
      const success = await firebaseService.deleteUser(document.name);
      if (success && onUpdate) {
        onUpdate();
      }
      setIsProcessing(false);
    }
  };

  const handleApproveWithBranch = async () => {
    setIsProcessing(true);
    setShowAssignClass(false);
    const classLevel = document.fields?.class_id?.stringValue || '9';
    const newBranch = `${classLevel}${selectedBranch}`;
    const success = await firebaseService.updateUserStatusAndBranch(document.name.split('/').pop(), 'approved', newBranch);
    if (success && onUpdate) {
      onUpdate();
    }
    setIsProcessing(false);
  };

  const getRoleBadge = (r) => {
    switch(r.toLowerCase()) {
      case 'student':
      case 'öğrenci': return <span className="font-semibold text-blue-600 dark:text-blue-400">Öğrenci</span>;
      case 'teacher':
      case 'öğretmen': return <span className="font-semibold text-purple-600 dark:text-purple-400">Öğretmen</span>;
      case 'parent':
      case 'veli': return <span className="font-semibold text-emerald-600 dark:text-emerald-400">Veli</span>;
      case 'personnel':
      case 'personel': return <span className="font-semibold text-teal-600 dark:text-teal-400">Personel</span>;
      case 'admin':
      case 'yönetici': return <span className="font-semibold text-amber-600 dark:text-amber-400">Yönetici</span>;
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
            className="p-1.5 rounded-lg text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#1e293b] transition-colors border border-transparent hover:border-slate-200 dark:hover:border-white/10"
            title="Detayları Gör"
          >
            <Search size={18} />
          </button>
          <button 
            onClick={isAdmin ? undefined : handleDelete}
            disabled={isAdmin || isProcessing}
            className={`p-1.5 rounded-lg transition-colors border border-transparent ${
              isAdmin 
                ? 'text-slate-400 dark:text-slate-600 cursor-not-allowed opacity-60' 
                : 'text-slate-600 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10'
            }`}
            title={isAdmin ? "Yöneticiler silinemez" : "Kullanıcıyı Sil"}
          >
            {isProcessing && !isAdmin ? <div className="w-[18px] h-[18px] border-2 border-slate-200 dark:border-white/10 border-t-[#991b1b] rounded-full animate-spin"></div> : <Trash2 size={18} />}
          </button>

          {showApprovalActions && (
            isProcessing ? (
              <div className="w-5 h-5 border-2 border-slate-200 dark:border-white/10 border-t-info rounded-full animate-spin"></div>
            ) : (
              <div className="flex gap-1 relative">
                <button 
                  onClick={() => {
                    if (roleRaw.toLowerCase() === 'student' || roleRaw.toLowerCase() === 'öğrenci') {
                      setShowAssignClass(true);
                    } else {
                      handleProcess('approved');
                    }
                  }} 
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

                {showAssignClass && (
                  <div className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-[#0f172a] rounded-xl shadow-xl border border-slate-200 dark:border-white/10 p-4 z-50 animate-fade-in">
                    <div className="flex justify-between items-center mb-3">
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white m-0">Şube Ataması</h4>
                      <button onClick={() => setShowAssignClass(false)} className="text-slate-400 hover:text-red-500"><X size={16}/></button>
                    </div>
                    <div className="mb-3">
                      <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase mb-1.5 block">Sınıf Şubesi</label>
                      <select 
                        className="w-full bg-slate-50 dark:bg-[#1e293b] border border-slate-200 dark:border-white/10 rounded-lg p-2 text-sm outline-none text-slate-900 dark:text-white"
                        value={selectedBranch} 
                        onChange={(e) => setSelectedBranch(e.target.value)}
                      >
                        <option value="A">A Şubesi</option>
                        <option value="B">B Şubesi</option>
                        <option value="C">C Şubesi</option>
                        <option value="D">D Şubesi</option>
                        <option value="E">E Şubesi</option>
                      </select>
                    </div>
                    <button onClick={handleApproveWithBranch} className="w-full bg-slate-900 dark:bg-white hover:bg-slate-800 dark:hover:bg-slate-100 text-white dark:text-slate-900 font-semibold text-sm py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5">
                      <Check size={16}/> Onayla
                    </button>
                  </div>
                )}
              </div>
            )
          )}
        </div>
      </div>

      {showDetails && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-md bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-white/10 rounded-2xl shadow-xl overflow-hidden animate-in zoom-in-95 duration-300">
            
            <button 
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-[#1e293b] text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors z-10"
              onClick={() => setShowDetails(false)}
            >
              <X size={18} />
            </button>

            <div className="p-6">
              
              <div className="flex items-center gap-4 mb-6">
                <div className="relative">
                  {pp ? (
                    <img src={pp} alt="PP" className="w-16 h-16 rounded-full object-cover shadow-sm border border-slate-200 dark:border-white/10" />
                  ) : (
                    <div className="w-16 h-16 rounded-full bg-slate-50 dark:bg-[#1e293b] text-slate-600 dark:text-slate-400 flex items-center justify-center border border-slate-200 dark:border-white/10 shadow-sm">
                      <User size={28} strokeWidth={1.5} />
                    </div>
                  )}
                  {isAdmin && (
                    <div className="absolute -bottom-1 -right-1 bg-white dark:bg-[#0f172a] rounded-full p-0.5 shadow-sm">
                      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="#3b82f6" className="text-blue-500" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/><path d="m9 12 2 2 4-4" stroke="white" strokeWidth="3"/></svg>
                    </div>
                  )}
                </div>
                
                <div>
                  <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight leading-none mb-1.5">{name}</h2>
                  <div className="flex items-center gap-2">
                    {getRoleBadge(roleRaw)}
                    {status === 'approved' && <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">Onaylı</span>}
                    {status === 'pending' && <span className="text-[10px] font-bold text-amber-500 dark:text-amber-400 uppercase tracking-wider">Bekliyor</span>}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                
                <div className="flex flex-col p-3 rounded-xl bg-slate-50 dark:bg-[#1e293b] border border-slate-200 dark:border-white/10">
                  <div className="flex items-center gap-1.5 mb-1 text-slate-400">
                    <Info size={14} />
                    <span className="text-[10px] font-bold uppercase tracking-wider">TC Kimlik</span>
                  </div>
                  <div className="text-[13px] font-semibold text-slate-900 dark:text-slate-100 truncate">{tc}</div>
                </div>

                <div className="flex flex-col p-3 rounded-xl bg-slate-50 dark:bg-[#1e293b] border border-slate-200 dark:border-white/10">
                  <div className="flex items-center gap-1.5 mb-1 text-slate-400">
                    <Phone size={14} />
                    <span className="text-[10px] font-bold uppercase tracking-wider">Telefon</span>
                  </div>
                  <div className="text-[13px] font-semibold text-slate-900 dark:text-slate-100 truncate">{document.fields?.phone?.stringValue || '-'}</div>
                </div>

                <div className="flex flex-col p-3 rounded-xl bg-slate-50 dark:bg-[#1e293b] border border-slate-200 dark:border-white/10 sm:col-span-2">
                  <div className="flex items-center gap-1.5 mb-1 text-slate-400">
                    <Mail size={14} />
                    <span className="text-[10px] font-bold uppercase tracking-wider">E-Posta</span>
                  </div>
                  <div className="text-[13px] font-semibold text-slate-900 dark:text-slate-100 truncate">{document.fields?.email?.stringValue || '-'}</div>
                </div>

                {(roleRaw.toLowerCase() === 'student' || roleRaw.toLowerCase() === 'öğrenci') && (
                  <div className="flex flex-col p-3 rounded-xl bg-slate-50 dark:bg-[#1e293b] border border-slate-200 dark:border-white/10 sm:col-span-2">
                    <div className="flex items-center gap-1.5 mb-1 text-slate-400">
                      <CheckCircle2 size={14} />
                      <span className="text-[10px] font-bold uppercase tracking-wider">Sınıf</span>
                    </div>
                    <div className="text-[13px] font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {document.fields?.class_id?.stringValue ? `${document.fields.class_id.stringValue}. Sınıf ${document.fields?.branch?.stringValue || ''} Şubesi` : 'Atanmamış'}
                    </div>
                  </div>
                )}
                
              </div>

              {(roleRaw.toLowerCase() === 'student' || roleRaw.toLowerCase() === 'öğrenci') && document.fields?.registeredDeviceId?.stringValue && (
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#1e293b] border border-slate-200 dark:border-white/10 mb-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5 text-slate-400">
                      <Phone size={14} />
                      <span className="text-[10px] font-bold uppercase tracking-wider">Cihaz Kilidi</span>
                    </div>
                    <div className="text-[11px] font-mono text-slate-600 dark:text-slate-400 truncate">{document.fields.registeredDeviceId.stringValue}</div>
                  </div>
                  <button 
                    onClick={async () => {
                      if(window.confirm('Cihaz kilidini sıfırlamak istediğinize emin misiniz?')) {
                        setIsProcessing(true);
                        try {
                          await firebaseService.resetDeviceLock(document.name.split('/').pop());
                          setShowDetails(false);
                          if (onUpdate) onUpdate();
                        } catch(e) {
                          console.error(e);
                        }
                        setIsProcessing(false);
                      }
                    }}
                    className="shrink-0 bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-white/10 hover:border-slate-300 text-slate-700 dark:text-slate-300 font-semibold text-[11px] px-3 py-1.5 rounded-lg shadow-sm transition-colors"
                  >
                    Sıfırla
                  </button>
                </div>
              )}

              <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-white/10">
                <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
                  ID: {document.name.split('/').pop()}
                </div>
                <button 
                  onClick={() => setShowDetails(false)} 
                  className="bg-slate-900 dark:bg-white hover:bg-slate-800 dark:hover:bg-slate-100 text-white dark:text-slate-900 px-5 py-2 rounded-lg text-[13px] font-medium transition-colors"
                >
                  Kapat
                </button>
              </div>

            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default UserRow;
