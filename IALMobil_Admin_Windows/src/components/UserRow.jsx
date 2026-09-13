import React, { useState, useEffect } from 'react';
import {
  Pencil,
  Trash2,
  Check,
  X,
  User,
  Save,
  RefreshCw,
  Smartphone,
  KeyRound
} from 'lucide-react';
import { kullaniciServisi } from '../services/kullaniciServisi';
import { api } from '../services/api';
import { vdsUserService } from '../services/vdsUserService';
import { modul, ayar, webAyar } from '../services/veri';
import { normalizeUserRole } from '../services/userRoles';
import { Modal, Button, IconButton, Badge, Field, FieldRows, Input, Select } from './ui/panel';
import { cx, eyebrow, hairline } from './ui/tokens';

export const USER_GRID =
  'grid grid-cols-[minmax(0,1.4fr)_120px_115px_minmax(0,1.2fr)_130px] gap-2.5 items-center';
export const USER_TABLE_MIN_WIDTH = 'w-full min-w-full';

export const UserTableHeader = () => (
  <div className={cx(USER_GRID, 'px-5 py-2.5 border-b bg-slate-50/70 dark:bg-white/[0.02]', hairline)}>
    <span className={eyebrow}>Ad Soyad</span>
    <span className={eyebrow}>Rol</span>
    <span className={eyebrow}>TC Kimlik</span>
    <span className={eyebrow}>E-posta</span>
    <span className={eyebrow}>Durum</span>
  </div>
);

const BRANCH_LIST = [
  'Matematik', 'Fizik', 'Kimya', 'Biyoloji', 'Türkçe', 'Edebiyat', 'Tarih', 'Coğrafya',
  'Felsefe', 'Din Kültürü', 'İngilizce', 'Almanca', 'Beden Eğitimi',
  'Müzik', 'Görsel Sanatlar', 'Rehberlik', 'Bilişim'
];

// Eski kayıtlarda uzun yazılan branş adlarını kısa gösterime çevirir.
const normalizeBranch = (branch) =>
  branch === 'Din Kültürü ve Ahlak Bilgisi' ? 'Din Kültürü' : branch;

const CLASS_LIST = ['9', '10', '11', '12'];
const SECTION_LIST = ['A', 'B', 'C', 'D', 'E', 'F'];
const DEPARTMENT_LIST = [
  'İdari İşler', 'Muhasebe & Finans', 'Öğrenci İşleri', 'Halkla İlişkiler & Tanıtım',
  'Kütüphane', 'Teknik Hizmetler', 'Güvenlik', 'Yemekhane'
];

const ROLE_LABELS = {
  student: 'Öğrenci',
  ogrenci: 'Öğrenci',
  'öğrenci': 'Öğrenci',
  teacher: 'Öğretmen',
  ogretmen: 'Öğretmen',
  'öğretmen': 'Öğretmen',
  parent: 'Veli',
  veli: 'Veli',
  personnel: 'Personel',
  personel: 'Personel',
  admin: 'Yönetici',
  idare: 'Yönetici'
};

const VerifiedMark = () => (
  <span
    className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-[#991b1b] text-white shrink-0"
    title="Doğrulanmış Yönetici"
  >
    <svg width="8" height="8" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M2 6l3 3 5-5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </span>
);

/**
 * Bir satir hem KAYITLI KULLANICIYI hem de ONAY BEKLEYEN KAYIT TALEBINI
 * gosterebilir. Ikisinin onay islemi farklidir:
 *   kullanici -> durumu guncellenir
 *   talep     -> onaylaninca gercek kisi + kimlik + rol olusturulur
 * `onIslem` verildiginde onay/red disariya birakilir.
 */
const UserRow = ({ document, showApprovalActions = false, onUpdate, onIslem }) => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);
  /* Panelden sifre sifirlama kodu gonderme.
     Kullanici giris ekranindaki "sifremi unuttum"a ulasamiyorsa idareci ayni
     kodu buradan yollar; akis ve sure aynidir. */
  const [kodGonderiliyor, setKodGonderiliyor] = useState(false);

  const sifreKoduGonder = async () => {
    if (kodGonderiliyor) return;
    setKodGonderiliyor(true);
    try {
      const y = await api.post('/api/auth/reset/gonder', { kisiId: document?.kisi_id || document?.id || userId });
      window.alert(`${y.kisi} adresine şifre sıfırlama kodu gönderildi:\n\n${y.eposta}\n\n` +
                   `Kod ${y.dakika} dakika geçerli. E-posta gelmezse spam klasörüne baktırın.`);
    } catch (e) {
      window.alert('Kod gönderilemedi: ' + (e?.mesaj || e?.message || 'bağlantı hatası'));
    } finally {
      setKodGonderiliyor(false);
    }
  };
  const [imgError, setImgError] = useState(false);

  const fields = document?.fields || {};
  const userId = document?.name ? document.name.split('/').pop() : document?.id;

  const rawRole = fields.role?.stringValue || document?.role || 'student';
  const roleKey = normalizeUserRole(rawRole);
  const isAdmin = roleKey === 'admin';

  const name =
    fields.full_name?.stringValue ||
    fields.fullName?.stringValue ||
    fields.name?.stringValue ||
    fields.displayName?.stringValue ||
    document?.name ||
    'İsimsiz Kullanıcı';

  const email = fields.email?.stringValue || document?.email || '—';
  const tc = fields.tc_kimlik?.stringValue || fields.tcKimlik?.stringValue || document?.tc || '—';
  const phone = fields.phone?.stringValue || document?.phone || '';
  const additionalPhone = fields.additional_phone?.stringValue || document?.additionalPhones?.[0] || '';
  const status = (fields.status?.stringValue || document?.status || 'pending').toLowerCase();
  const pp = fields.profile_image?.stringValue || fields.photoURL?.stringValue || document?.photoURL || null;
  const registeredDevice = fields.registered_device?.stringValue || fields.deviceId?.stringValue || null;
  const hasParentRole = roleKey === 'parent' || document?._pools?.includes('parent');

  const storedBranch = normalizeBranch(fields.branch?.stringValue) || '';
  const storedDepartment = fields.department?.stringValue || (roleKey === 'personnel' ? storedBranch : '') || 'İdari İşler';

  const [editName, setEditName] = useState(name);
  const [editRole, setEditRole] = useState(roleKey);
  const [editPhone, setEditPhone] = useState(phone);
  const [editAdditionalPhone, setEditAdditionalPhone] = useState(additionalPhone);
  const [editStatus, setEditStatus] = useState(status);
  const [editBranch, setEditBranch] = useState(roleKey === 'teacher' ? storedBranch : '');
  const [editClassId, setEditClassId] = useState(fields.class_id?.stringValue || '12');
  const [editSection, setEditSection] = useState(fields.section?.stringValue || fields.sube?.stringValue || 'A');
  const [editSchoolNumber, setEditSchoolNumber] = useState(fields.school_number?.stringValue || '');
  const [editDepartment, setEditDepartment] = useState(storedDepartment);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState('');

  useEffect(() => {
    setEditName(name);
    setEditRole(roleKey);
    setEditPhone(phone);
    setEditAdditionalPhone(additionalPhone);
    setEditStatus(status);
    setEditBranch(roleKey === 'teacher' ? storedBranch : '');
    setEditClassId(fields.class_id?.stringValue || '12');
    setEditSection(fields.section?.stringValue || fields.sube?.stringValue || 'A');
    setEditSchoolNumber(fields.school_number?.stringValue || '');
    setEditDepartment(storedDepartment);
    setSaveError('');
  }, [document, name, roleKey, phone, additionalPhone, status, storedBranch, storedDepartment]);

  const handleRoleChange = (value) => {
    const nextRole = normalizeUserRole(value);
    if (nextRole === editRole) return;

    // Brans ile personel birimi ayni DB kolonunda tutulsa da ayni kavram
    // degildir. Tur degisince eski degeri yeni role tasimiyoruz.
    if (nextRole === 'teacher') setEditBranch('');
    if (nextRole === 'personnel') setEditDepartment('İdari İşler');
    setEditRole(nextRole);
    setSaveError('');
  };

  const handleProcess = async (newStatus) => {
    setIsProcessing(true);
    let success = false;
    try {
      if (onIslem) {
        // Kayit talebi: onay/red cagiran ekranin sorumlulugunda.
        success = await onIslem(newStatus, document);
      } else if (newStatus === 'rejected') {
        success = await kullaniciServisi.deleteUser(document.name || userId);
      } else {
        success = await kullaniciServisi.updateUserStatus(userId, newStatus);
      }
    } catch (err) {
      setSaveError(err?.message || 'İşlem tamamlanamadı.');
    }
    if (success && onUpdate) onUpdate();
    setIsProcessing(false);
  };

  const handleDelete = async () => {
    setConfirmAction(null);
    setIsProcessing(true);
    setSaveError('');
    try {
      // Kalici silme; sunucu reddederse sebebi ayrinti panelinde gosterilir.
      await kullaniciServisi.deleteUser(document.name || userId);
      if (onUpdate) onUpdate();
    } catch (err) {
      setSaveError(err?.message || 'Kullanıcı silinemedi.');
      setShowDetails(true);
    }
    setIsProcessing(false);
  };

  const handleResetDevice = async () => {
    setConfirmAction(null);
    setIsProcessing(true);
    try {
      await kullaniciServisi.resetDeviceLock(userId);
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
    setSaveError('');

    try {
      const payload = {
        full_name: editName.trim(),
        role: editRole,
        phone: editPhone.trim(),
        status: editStatus
      };

      if (hasParentRole || editRole === 'parent') {
        payload.additional_phone = editAdditionalPhone.trim();
      }

      if (editRole === 'teacher') {
        payload.branch = editBranch || null;
        if (roleKey !== 'teacher') payload.teacherTitle = 'Ders Öğretmeni';
      } else if (editRole === 'student') {
        payload.class_id = editClassId;
        payload.section = editSection;
        payload.sube = editSection;
        payload.branch = `${editClassId}${editSection}`;
        if (editSchoolNumber.trim()) {
          payload.school_number = editSchoolNumber.trim();
        }
      } else if (editRole === 'personnel') {
        payload.department = editDepartment;
        payload.branch = editDepartment;
        if (roleKey !== 'personnel') payload.teacherTitle = 'Personel';
      }

      const saved = await vdsUserService.updateUser(userId, payload);
      if (!saved) throw new Error('VDS güncellemeyi kabul etmedi.');
      setSaveSuccess(true);
      if (onUpdate) onUpdate();
      setTimeout(() => {
        setShowDetails(false);
        setSaveSuccess(false);
      }, 700);
    } catch (err) {
      console.error('Kullanıcı güncellenemedi:', err);
      setSaveError(err?.message || 'Kullanıcı güncellenemedi.');
    } finally {
      setIsProcessing(false);
    }
  };

  const studentClass = (() => {
    const cid = fields.class_id?.stringValue || '';
    const sec = fields.section?.stringValue || fields.sube?.stringValue || '';
    const branch = fields.branch?.stringValue || '';
    if (cid && sec) return `${cid}${sec.toUpperCase()}`;
    if (cid) return `${cid}. Sınıf`;
    if (branch) return branch.replace('/', '').toUpperCase();
    return null;
  })();

  const studentNo = fields.school_number?.stringValue;

  const roleDetail =
    roleKey === 'student' || roleKey === 'öğrenci' || roleKey === 'ogrenci'
      ? studentClass
      : roleKey === 'teacher' || roleKey === 'öğretmen' || roleKey === 'ogretmen'
      ? normalizeBranch(fields.branch?.stringValue) || 'Atanmamış'
      : roleKey === 'personnel' || roleKey === 'personel'
      ? fields.department?.stringValue || normalizeBranch(fields.branch?.stringValue) || 'Atanmamış'
      : null;

  const statusBadge =
    status === 'approved' ? (
      <Badge tone="success">Onaylı</Badge>
    ) : status === 'passive' || status === 'inactive' ? (
      <Badge>Pasif</Badge>
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
          'px-5 py-2.5 hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors group'
        )}
      >
        
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
          <div className="flex items-center gap-1.5 min-w-0">
            <span
              className="text-[13.5px] font-medium text-slate-900 dark:text-white truncate"
              title={name}
            >
              {name}
            </span>
            {studentNo && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-mono text-slate-500 dark:text-slate-400 bg-slate-100/80 dark:bg-white/[0.05] shrink-0">
                {studentNo}
              </span>
            )}
            {isAdmin && <VerifiedMark />}
          </div>
        </div>

        <div className="min-w-0">
          <div className="text-[13px] text-slate-700 dark:text-slate-200 truncate">
            {ROLE_LABELS[roleKey] || rawRole}
          </div>
          {roleDetail && (
            <div className="mt-0.5 text-[11.5px] text-slate-500 dark:text-slate-400 truncate" title={roleDetail}>
              {roleDetail}
            </div>
          )}
        </div>

        <div className="text-[12.5px] text-slate-500 dark:text-slate-400 tnum truncate" title={tc}>
          {tc}
        </div>

        <div className="text-[12.5px] text-slate-500 dark:text-slate-400 truncate" title={email}>
          {email}
        </div>

        <div className="relative flex items-center w-full h-8 min-w-0">
          {showApprovalActions ? (
            isProcessing ? (
              <span className="w-8 h-8 flex items-center justify-center">
                <RefreshCw size={14} className="animate-spin text-slate-400" />
              </span>
            ) : (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleProcess('approved')}
                  className="w-8 h-8 rounded-full flex items-center justify-center bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-all cursor-pointer"
                  title="Hesabı Kabul Et / Onayla"
                >
                  <Check size={14} strokeWidth={2.4} />
                </button>
                <button
                  type="button"
                  onClick={() => handleProcess('rejected')}
                  className="w-8 h-8 rounded-full flex items-center justify-center bg-rose-50 hover:bg-rose-100 dark:bg-rose-500/10 dark:hover:bg-rose-500/20 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-500/20 transition-all cursor-pointer"
                  title="Hesabı Reddet"
                >
                  <X size={14} strokeWidth={2.4} />
                </button>
                <IconButton label="Düzenle" icon={Pencil} onClick={() => setShowDetails(true)} />
              </div>
            )
          ) : (
            <>
              <div className="absolute inset-0 flex items-center transition-opacity duration-200 group-hover:opacity-0 group-hover:pointer-events-none">
                {statusBadge}
              </div>
              <div className="absolute inset-0 flex items-center justify-start gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none group-hover:pointer-events-auto">
                <IconButton label="Düzenle" icon={Pencil} onClick={() => setShowDetails(true)} />
                <IconButton
                  label={kodGonderiliyor ? 'Gönderiliyor…' : 'Şifre sıfırlama kodu gönder'}
                  icon={KeyRound}
                  disabled={kodGonderiliyor}
                  onClick={sifreKoduGonder}
                />
                <IconButton
                  label="Kullanıcıyı Sil"
                  icon={Trash2}
                  variant="quiet"
                  disabled={isAdmin}
                  className={isAdmin ? 'opacity-30 cursor-not-allowed' : ''}
                  onClick={() => { if (!isAdmin) setConfirmAction('delete'); }}
                />
              </div>
            </>
          )}
        </div>
      </div>

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
            {saveError && (
              <span className="mr-auto text-[12.5px] font-medium text-rose-600 dark:text-rose-400">
                {saveError}
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
                <Select value={editRole} onChange={(e) => handleRoleChange(e.target.value)}>
                  <option value="student">Öğrenci</option>
                  <option value="teacher">Öğretmen</option>
                  <option value="personnel">Personel</option>
                  <option value="parent">Veli</option>
                  <option value="admin">Yönetici</option>
                </Select>
                <Select value={editStatus} onChange={(e) => setEditStatus(e.target.value)}>
                  <option value="approved">Onaylı</option>
                  <option value="passive">Pasif</option>
                  <option value="pending">Onay bekliyor</option>
                  <option value="rejected">Reddedildi</option>
                </Select>
              </div>
            </Field>

            {editRole === 'teacher' && (
              <Field label="Branş" hint="Öğretmenin zümresi.">
                <Select value={editBranch} onChange={(e) => setEditBranch(e.target.value)}>
                  <option value="">Atanmamış</option>
                  {BRANCH_LIST.map((b) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </Select>
              </Field>
            )}

            {editRole === 'student' && (
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

            {editRole === 'personnel' && (
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

            {(hasParentRole || editRole === 'parent') && (
              <Field label="Ek telefon" hint="Farklı bir numaraysa veli bildirimleri iki telefona da gönderilir.">
                <Input
                  type="tel"
                  value={editAdditionalPhone}
                  onChange={(e) => setEditAdditionalPhone(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="05XX XXX XX XX"
                  className="tnum"
                />
              </Field>
            )}

            {editRole === 'student' && registeredDevice && (
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
