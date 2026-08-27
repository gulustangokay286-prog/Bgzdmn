import React, { useState, useEffect } from 'react';
import {
  Pencil,
  Trash2,
  Check,
  X,
  User,
  Save,
  RefreshCw,
  Smartphone
} from 'lucide-react';
import { firebaseService } from '../services/firebase';
import { db } from '../services/firebaseConfig';
import { doc, updateDoc } from 'firebase/firestore';
import { Modal, Button, IconButton, Badge, Field, FieldRows, Input, Select } from './ui/panel';
import { cx, eyebrow, hairline } from './ui/tokens';

/**
 * Kullanıcı satırı.
 *
 * Kullanıcılar ve Onay Bekleyenler ekranları aynı ızgarayı paylaşır; sütun
 * şablonu buradan dışa aktarılır ki iki tablonun başlıkları satırlarla hizalı
 * kalsın.
 */
export const USER_GRID =
  'grid grid-cols-[minmax(0,1.4fr)_140px_120px_minmax(0,1.2fr)_100px_200px] gap-3 items-center';
export const USER_TABLE_MIN_WIDTH = 'min-w-[980px]';

export const UserTableHeader = () => (
  <div className={cx(USER_GRID, 'px-5 py-2.5 border-b bg-slate-50/70 dark:bg-white/[0.02]', hairline)}>
    <span className={eyebrow}>Ad Soyad</span>
    <span className={eyebrow}>Rol</span>
    <span className={eyebrow}>TC Kimlik</span>
    <span className={eyebrow}>E-posta</span>
    <span className={eyebrow}>Durum</span>
    <span className={cx(eyebrow, 'text-right')}>İşlem</span>
  </div>
);

const BRANCH_LIST = [
  'Matematik', 'Fizik', 'Kimya', 'Biyoloji', 'Türkçe', 'Edebiyat', 'Tarih', 'Coğrafya',
  'Felsefe', 'Din Kültürü ve Ahlak Bilgisi', 'İngilizce', 'Almanca', 'Beden Eğitimi',
  'Müzik', 'Görsel Sanatlar', 'Rehberlik', 'Bilişim'
];

const CLASS_LIST = ['9', '10', '11', '12'];
const SECTION_LIST = ['A', 'B', 'C', 'D', 'E', 'F'];
const DEPARTMENT_LIST = [
  'İdari İşler', 'Muhasebe & Finans', 'Öğrenci İşleri', 'Halkla İlişkiler & Tanıtım',
  'Kütüphane', 'Teknik Hizmetler', 'Güvenlik', 'Yemekhane'
];

const ROLE_LABELS = {
  student: 'Öğrenci',
  'öğrenci': 'Öğrenci',
  teacher: 'Öğretmen',
  'öğretmen': 'Öğretmen',
  parent: 'Veli',
  veli: 'Veli',
  personnel: 'Personel',
  personel: 'Personel',
  admin: 'Yönetici',
  'yönetici': 'Yönetici',
  patron: 'Yönetici'
};

const formatStudentDisplay = (classId, section, branch) => {
  if (classId && section) return `${classId}/${section}`;
  if (branch && typeof branch === 'string') {
    const match = branch.match(/^(\d{1,2})\s*[-/._]?\s*([A-Za-z])/);
    if (match) return `${match[1]}/${match[2].toUpperCase()}`;
    return branch;
  }
  if (classId) return `${classId}. Sınıf`;
  return null;
};

const VerifiedMark = () => (
  <svg
    width="14"
    height="14"
    viewBox="0 0 24 24"
    className="shrink-0 text-[#991b1b] dark:text-rose-400"
    aria-label="Yönetici"
  >
    <circle cx="12" cy="12" r="10" fill="currentColor" />
    <path d="m8.5 12 2.4 2.4 4.6-4.8" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const UserRow = ({ document, showApprovalActions, onUpdate }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null); // 'delete' | 'resetDevice'
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [imgError, setImgError] = useState(false);

  const getFieldVal = (fieldName) => {
    if (!document) return '';
    if (document.fields && document.fields[fieldName]) {
      return document.fields[fieldName].stringValue || '';
    }
    return document[fieldName] || '';
  };

  const userId = document?.name ? document.name.split('/').pop() : document?.id || '';
  const name =
    getFieldVal('displayName') || getFieldVal('full_name') || getFieldVal('fullName') ||
    getFieldVal('name') || 'İsimsiz Kullanıcı';
  const roleRaw = getFieldVal('role') || 'student';
  const roleKey = roleRaw.toLowerCase();
  const tc = getFieldVal('tc_kimlik') || getFieldVal('tcKimlik') || getFieldVal('tc') || '—';
  const rawStatus = getFieldVal('status') || 'pending';
  const isAdmin = ['admin', 'yönetici', 'patron'].includes(roleKey);
  const status = isAdmin ? 'approved' : rawStatus;
  const email = getFieldVal('email') || '—';
  const phone = getFieldVal('phone') || '';
  const currentBranch = getFieldVal('branch') || '';
  const currentClassId = getFieldVal('class_id') || currentBranch.match(/^(\d{1,2})/)?.[1] || '9';
  const currentSection =
    getFieldVal('section') || getFieldVal('sube') ||
    currentBranch.match(/^[0-9]+([A-Za-z])/)?.[1]?.toUpperCase() || 'A';
  const currentSchoolNum = getFieldVal('school_number') || getFieldVal('schoolNumber') || '';
  const currentDepartment = getFieldVal('department') || 'İdari İşler';
  const registeredDevice = getFieldVal('registeredDeviceId');
  const pp =
    getFieldVal('profile_image') || getFieldVal('profileImage') || getFieldVal('profileImageUrl') || null;

  const [editName, setEditName] = useState(name);
  const [editRole, setEditRole] = useState(roleKey);
  const [editPhone, setEditPhone] = useState(phone);
  const [editStatus, setEditStatus] = useState(status);
  const [editBranch, setEditBranch] = useState(currentBranch || 'Din Kültürü ve Ahlak Bilgisi');
  const [editClassId, setEditClassId] = useState(currentClassId || '9');
  const [editSection, setEditSection] = useState(currentSection || 'A');
  const [editSchoolNumber, setEditSchoolNumber] = useState(currentSchoolNum);
  const [editDepartment, setEditDepartment] = useState(currentDepartment);

  useEffect(() => {
    if (showDetails) {
      setEditName(name);
      setEditRole(roleKey);
      setEditPhone(phone);
      setEditStatus(status);
      setEditBranch(currentBranch || 'Din Kültürü ve Ahlak Bilgisi');
      setEditClassId(currentClassId || '9');
      setEditSection(currentSection || 'A');
      setEditSchoolNumber(currentSchoolNum);
      setEditDepartment(currentDepartment);
      setSaveSuccess(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showDetails, document]);

  const handleProcess = async (newStatus) => {
    setIsProcessing(true);
    const success = await firebaseService.updateUserStatus(userId, newStatus);
    if (success && onUpdate) onUpdate();
    setIsProcessing(false);
  };

  const handleDelete = async () => {
    setConfirmAction(null);
    setIsProcessing(true);
    const success = await firebaseService.deleteUser(document.name || userId);
    if (success && onUpdate) onUpdate();
    setIsProcessing(false);
  };

  const handleResetDevice = async () => {
    setConfirmAction(null);
    setIsProcessing(true);
    try {
      await firebaseService.resetDeviceLock(userId);
      if (onUpdate) onUpdate();
    } catch (err) {
      console.error('Cihaz kilidi sıfırlanamadı:', err);
    }
    setIsProcessing(false);
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
      }, 800);
    } catch (err) {
      console.error('Kullanıcı güncelleme hatası:', err);
      setSaveSuccess(false);
    } finally {
      setIsProcessing(false);
    }
  };

  const isStudent = roleKey === 'student' || roleKey === 'öğrenci';
  const isTeacher = roleKey === 'teacher' || roleKey === 'öğretmen';
  const roleDetail = isStudent
    ? formatStudentDisplay(currentClassId, currentSection, currentBranch)
    : isTeacher
    ? currentBranch || null
    : null;

  const statusBadge =
    status === 'approved' ? (
      <Badge tone="success">Onaylı</Badge>
    ) : status === 'rejected' ? (
      <Badge tone="danger">Reddedildi</Badge>
    ) : (
      <Badge tone="warning">Bekliyor</Badge>
    );

  return (
    <>
      <div
        className={cx(
          USER_GRID,
          'px-5 py-2.5 hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors'
        )}
      >
        {/* Ad soyad */}
        <div className="flex items-center gap-2.5 min-w-0">
          {pp && !imgError ? (
            <img
              src={pp}
              alt=""
              referrerPolicy="no-referrer"
              crossOrigin="anonymous"
              onError={() => setImgError(true)}
              className={cx('w-8 h-8 rounded-full object-cover shrink-0 border', hairline)}
            />
          ) : (
            <div
              className={cx(
                'w-8 h-8 rounded-full shrink-0 border flex items-center justify-center bg-slate-100 dark:bg-white/[0.06] text-slate-400 dark:text-slate-500',
                hairline
              )}
            >
              <User size={15} strokeWidth={1.8} />
            </div>
          )}
          <span
            className="flex items-center gap-1.5 min-w-0 text-[13.5px] font-medium text-slate-900 dark:text-white"
            title={name}
          >
            <span className="truncate">{name}</span>
            {isAdmin && <VerifiedMark />}
          </span>
        </div>

        {/* Rol */}
        <div className="min-w-0">
          <div className="text-[13px] text-slate-700 dark:text-slate-200 truncate">
            {ROLE_LABELS[roleKey] || roleRaw}
          </div>
          {roleDetail && (
            <div className="mt-0.5 text-[11.5px] text-slate-500 dark:text-slate-400 truncate" title={roleDetail}>
              {roleDetail}
            </div>
          )}
        </div>

        {/* TC */}
        <div className="text-[12.5px] text-slate-500 dark:text-slate-400 tnum truncate" title={tc}>
          {tc}
        </div>

        {/* E-posta */}
        <div className="text-[12.5px] text-slate-500 dark:text-slate-400 truncate" title={email}>
          {email}
        </div>

        {/* Durum */}
        <div>{statusBadge}</div>

        {/* İşlem */}
        <div className="flex items-center justify-end gap-1.5">
          {showApprovalActions ? (
            isProcessing ? (
              <span className="w-8 h-8 flex items-center justify-center">
                <RefreshCw size={14} className="animate-spin text-slate-400" />
              </span>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => handleProcess('approved')}
                  className="inline-flex items-center gap-1 h-7.5 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-semibold transition-colors cursor-pointer shadow-xs"
                  title="Hesabı Kabul Et / Onayla"
                >
                  <Check size={13} strokeWidth={2.4} />
                  <span>Kabul Et</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleProcess('rejected')}
                  className="inline-flex items-center gap-1 h-7.5 px-2 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-500/20 text-[12px] font-medium transition-colors cursor-pointer"
                  title="Hesabı Reddet"
                >
                  <X size={13} strokeWidth={2.2} />
                  <span>Reddet</span>
                </button>
                <IconButton label="Düzenle" icon={Pencil} onClick={() => setShowDetails(true)} />
              </>
            )
          ) : (
            isProcessing ? (
              <span className="w-8 h-8 flex items-center justify-center">
                <RefreshCw size={14} className="animate-spin text-slate-400" />
              </span>
            ) : (
              <>
                {status !== 'approved' && !isAdmin && (
                  <button
                    type="button"
                    onClick={() => handleProcess('approved')}
                    className="inline-flex items-center gap-1 h-7.5 px-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[12px] font-semibold transition-colors cursor-pointer shadow-xs"
                    title="Hesabı Onayla"
                  >
                    <Check size={13} strokeWidth={2.4} />
                    <span>Onayla</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setShowDetails(true)}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-white/[0.06] dark:hover:bg-white/[0.12] text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-white/10 text-[12.5px] font-semibold transition-colors cursor-pointer"
                  title="Kullanıcıyı Düzenle"
                >
                  <Pencil size={13} strokeWidth={2} />
                  <span>Düzenle</span>
                </button>
                {!isAdmin && (
                  <IconButton
                    label="Kullanıcıyı Sil"
                    icon={Trash2}
                    variant="quiet"
                    onClick={() => setConfirmAction('delete')}
                  />
                )}
              </>
            )
          )}
        </div>
      </div>

      {/* Düzenleme */}
      <Modal
        open={showDetails}
        onClose={() => setShowDetails(false)}
        title="Kullanıcıyı Düzenle"
        description={`TC ${tc}`}
        width="max-w-xl"
        footer={
          <>
            {saveSuccess && (
              <span className="mr-auto text-[12.5px] font-medium text-emerald-600 dark:text-emerald-400">
                Kaydedildi
              </span>
            )}
            <Button type="button" onClick={() => setShowDetails(false)}>
              Vazgeç
            </Button>
            <Button
              type="submit"
              form="user-edit-form"
              variant="primary"
              disabled={isProcessing}
              icon={isProcessing ? RefreshCw : Save}
            >
              {isProcessing ? 'Kaydediliyor…' : 'Kaydet'}
            </Button>
          </>
        }
      >
        <form id="user-edit-form" onSubmit={handleSaveUserChanges}>
          <FieldRows>
            <Field label="Ad soyad" htmlFor="user-name">
              <Input
                id="user-name"
                type="text"
                required
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Ad Soyad"
              />
            </Field>

            <Field label="Rol ve durum">
              <div className="grid grid-cols-2 gap-2.5">
                <Select value={editRole} onChange={(e) => setEditRole(e.target.value)}>
                  <option value="student">Öğrenci</option>
                  <option value="teacher">Öğretmen</option>
                  <option value="personnel">Personel</option>
                  <option value="parent">Veli</option>
                  <option value="admin">Yönetici</option>
                </Select>
                <Select value={editStatus} onChange={(e) => setEditStatus(e.target.value)}>
                  <option value="approved">Onaylı</option>
                  <option value="pending">Onay bekliyor</option>
                  <option value="rejected">Reddedildi</option>
                </Select>
              </div>
            </Field>

            {(editRole === 'teacher' || editRole === 'öğretmen') && (
              <Field label="Branş" hint="Öğretmenin zümresi.">
                <Select value={editBranch} onChange={(e) => setEditBranch(e.target.value)}>
                  {BRANCH_LIST.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </Select>
              </Field>
            )}

            {(editRole === 'student' || editRole === 'öğrenci') && (
              <Field label="Sınıf bilgileri" hint="Sınıf, şube ve okul numarası.">
                <div className="grid grid-cols-3 gap-2.5">
                  <Select value={editClassId} onChange={(e) => setEditClassId(e.target.value)}>
                    {CLASS_LIST.map((c) => (
                      <option key={c} value={c}>{c}. Sınıf</option>
                    ))}
                  </Select>
                  <Select value={editSection} onChange={(e) => setEditSection(e.target.value)}>
                    {SECTION_LIST.map((s) => (
                      <option key={s} value={s}>{s} Şubesi</option>
                    ))}
                  </Select>
                  <Input
                    type="text"
                    value={editSchoolNumber}
                    onChange={(e) => setEditSchoolNumber(e.target.value)}
                    placeholder="Okul no"
                    className="tnum"
                  />
                </div>
              </Field>
            )}

            {(editRole === 'personnel' || editRole === 'personel') && (
              <Field label="Departman">
                <Select value={editDepartment} onChange={(e) => setEditDepartment(e.target.value)}>
                  {DEPARTMENT_LIST.map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </Select>
              </Field>
            )}

            <Field label="Telefon">
              <Input
                type="tel"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="05XX XXX XX XX"
                className="tnum"
              />
            </Field>

            {(editRole === 'student' || editRole === 'öğrenci') && registeredDevice && (
              <Field label="Kayıtlı cihaz" hint="Öğrenci yeni bir telefona geçtiyse kilidi sıfırlayın.">
                <div className={cx('flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-lg border', hairline)}>
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Smartphone size={15} className="text-slate-400 shrink-0" />
                    <span className="text-[12px] text-slate-500 dark:text-slate-400 truncate tnum">
                      {registeredDevice}
                    </span>
                  </div>
                  <Button type="button" onClick={() => setConfirmAction('resetDevice')}>
                    Kilidi Sıfırla
                  </Button>
                </div>
              </Field>
            )}
          </FieldRows>
        </form>
      </Modal>

      {/* Onay diyalogları */}
      <Modal
        open={Boolean(confirmAction)}
        onClose={() => setConfirmAction(null)}
        title={confirmAction === 'delete' ? 'Kullanıcıyı sil' : 'Cihaz kilidini sıfırla'}
        width="max-w-md"
        footer={
          <>
            <Button type="button" onClick={() => setConfirmAction(null)}>
              Vazgeç
            </Button>
            <Button
              type="button"
              variant={confirmAction === 'delete' ? 'danger' : 'primary'}
              onClick={confirmAction === 'delete' ? handleDelete : handleResetDevice}
            >
              {confirmAction === 'delete' ? 'Sil' : 'Sıfırla'}
            </Button>
          </>
        }
      >
        <div className="px-5 py-5">
          <p className="m-0 text-[13px] leading-relaxed text-slate-600 dark:text-slate-300">
            {confirmAction === 'delete' ? (
              <>
                <span className="font-medium text-slate-900 dark:text-white">{name}</span> kalıcı olarak silinecek.
                Bu işlem geri alınamaz.
              </>
            ) : (
              <>
                <span className="font-medium text-slate-900 dark:text-white">{name}</span> kullanıcısının cihaz
                bağlantısı kaldırılacak ve bir sonraki girişte yeni cihaz kaydedilecek.
              </>
            )}
          </p>
        </div>
      </Modal>
    </>
  );
};

export default UserRow;
