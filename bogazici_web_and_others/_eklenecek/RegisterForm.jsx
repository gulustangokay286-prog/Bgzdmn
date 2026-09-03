'use client';

/**
 * Kayıt formu — mobil (Swift) RegisterView ile birebir aynı sözleşme.
 *
 * Kaynak: IALMobil_Native/Modules/Auth/RegisterViewModel.swift
 *
 * Kritik uyum noktaları (bozulursa mobil ile web hesapları uyuşmaz):
 *   1. Şifre Firebase'e DÜZ DEĞİL, SHA-256(şifre + "IAL_SECURE_SALT_2026")
 *      hex çıktısı olarak yazılır. Mobil taraf da girişte aynı hash'i üretir.
 *   2. Kullanıcı belgesi `users/{uid}` altında, alan adları snake_case.
 *   3. `status: "pending"` — hesap idare onayına düşer, onaysız giriş yapamaz.
 *   4. Kayıttan sonra oturum kapatılır (onay beklediği için).
 *
 * Kullanım:
 *   <RegisterForm firebaseApp={app} onSuccess={() => ...} />
 */

import React, { useState } from 'react';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import {
  getFirestore, collection, query, where, limit, getDocs,
  doc, setDoc, serverTimestamp
} from 'firebase/firestore';

const SALT = 'IAL_SECURE_SALT_2026';

/** Swift `SecurityHelper.hashPassword` ile aynı çıktı: SHA-256 hex, küçük harf. */
async function hashPassword(password) {
  const data = new TextEncoder().encode(password + SALT);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/** 05XXXXXXXXX / 5XXXXXXXXX / +905XXXXXXXXX kabul eder, 10 haneye indirger. */
function normalizeTrMobile(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  const t = d.startsWith('90') ? d.slice(2) : d;
  const local = t.startsWith('0') ? t.slice(1) : t;
  return local.length === 10 && local.startsWith('5') ? local : '';
}

const isValidTrMobile = (raw) => Boolean(normalizeTrMobile(raw));

const ROLES = [
  { id: 'parent', label: 'Veli' },
  { id: 'student', label: 'Öğrenci' },
  { id: 'teacher', label: 'Öğretmen' }
];

const CLASS_IDS = ['9', '10', '11', '12'];

const BRANCHES = [
  'Matematik', 'Fizik', 'Kimya', 'Biyoloji', 'Türk Dili ve Edebiyatı', 'Tarih',
  'Coğrafya', 'Felsefe', 'İngilizce', 'Almanca', 'Din Kültürü', 'Beden Eğitimi',
  'Müzik', 'Görsel Sanatlar', 'Bilişim Teknolojileri', 'Rehberlik'
];

const EMPTY = {
  fullName: '',
  tcKimlik: '',
  email: '',
  password: '',
  schoolNumber: '',
  classId: '9',
  parentPhone: '',
  branch: 'Matematik',
  phone: '',
  childName: '',
  childSchoolNumber: ''
};

export default function RegisterForm({ firebaseApp, onSuccess }) {
  const [role, setRole] = useState('parent');
  const [form, setForm] = useState(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const set = (key) => (e) => {
    const raw = e.target.value;
    const value = key === 'tcKimlik' || key === 'phone' || key === 'schoolNumber' || key === 'childSchoolNumber'
      ? raw.replace(/[^0-9]/g, '')
      : key === 'parentPhone'
      ? raw.replace(/[^0-9]/g, '').slice(0, 11)
      : raw;
    setForm(prev => ({ ...prev, [key]: value }));
  };

  /** Swift `validateInputs()` ile birebir aynı sıra ve mesajlar. */
  const validate = () => {
    if (!form.fullName.trim()) return 'Lütfen adınızı ve soyadınızı giriniz.';
    if (form.tcKimlik.length !== 11) return 'TC Kimlik No 11 haneli olmalıdır.';
    if (!form.email || !form.email.includes('@')) return 'Lütfen geçerli bir e-posta adresi giriniz.';
    if (form.password.length < 6) return 'Şifreniz en az 6 karakter olmalıdır.';

    if (role === 'student') {
      if (!form.schoolNumber) return 'Lütfen okul numaranızı giriniz.';
      if (!isValidTrMobile(form.parentPhone)) {
        return 'Lütfen geçerli bir veli cep telefonu giriniz (05XXXXXXXXX).';
      }
    }
    if (role === 'teacher' && !form.phone) return 'Lütfen telefon numaranızı giriniz.';
    if (role === 'parent' && (!form.childName.trim() || !form.childSchoolNumber)) {
      return 'Lütfen çocuğunuzun bilgilerini eksiksiz giriniz.';
    }
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const problem = validate();
    if (problem) { setError(problem); return; }

    setError('');
    setLoading(true);

    const db = getFirestore(firebaseApp);
    const auth = getAuth(firebaseApp);

    try {
      // 1) TC benzersiz mi
      const tcHit = await getDocs(query(
        collection(db, 'users'), where('tc_kimlik', '==', form.tcKimlik), limit(1)
      ));
      if (!tcHit.empty) {
        setError('Bu TC Kimlik numarasıyla zaten kayıt olunmuş.');
        setLoading(false);
        return;
      }

      // 2) Öğrencide okul numarası benzersiz mi
      if (role === 'student' && form.schoolNumber) {
        const noHit = await getDocs(query(
          collection(db, 'users'), where('school_number', '==', form.schoolNumber), limit(1)
        ));
        if (!noHit.empty) {
          setError('Bu okul numarası zaten sisteme kayıtlı.');
          setLoading(false);
          return;
        }
      }

      // 3) Hesap — şifre mobildeki ile aynı biçimde hash'lenir
      const hashed = await hashPassword(form.password);
      const cred = await createUserWithEmailAndPassword(auth, form.email.trim(), hashed);
      const uid = cred.user.uid;

      // 4) Kullanıcı belgesi
      const userData = {
        id: uid,
        email: form.email.trim(),
        tc_kimlik: form.tcKimlik,
        full_name: form.fullName.trim(),
        role,
        status: 'pending',
        created_at: serverTimestamp()
      };

      if (role === 'student') {
        userData.school_number = form.schoolNumber;
        userData.class_id = form.classId;
        // Veli bildirimlerinin (giriş/çıkış/devamsızlık) gideceği numara.
        userData.parent_phone = normalizeTrMobile(form.parentPhone);
      } else if (role === 'teacher') {
        userData.branch = form.branch;
        userData.phone = form.phone;
      } else if (role === 'parent') {
        userData.child_name = form.childName.trim();
        userData.child_school_number = form.childSchoolNumber;
      }

      await setDoc(doc(db, 'users', uid), userData);

      // 5) Hesap onay beklediği için oturum kapatılır
      try { await signOut(auth); } catch { /* yok say */ }

      setDone(true);
      setForm(EMPTY);
      onSuccess?.();
    } catch (err) {
      const code = err?.code || '';
      if (code === 'auth/email-already-in-use') {
        setError('Bu e-posta adresiyle zaten bir hesap var.');
      } else if (code === 'auth/invalid-email') {
        setError('Geçersiz bir e-posta adresi girdiniz.');
      } else if (code === 'auth/weak-password') {
        setError('Şifreniz yeterince güçlü değil.');
      } else {
        setError(`Kayıt olurken bir hata oluştu: ${err?.message || 'bilinmeyen hata'}`);
      }
    }
    setLoading(false);
  };

  if (done) {
    return (
      <div style={S.card}>
        <h2 style={S.title}>Kaydınız alındı</h2>
        <p style={S.note}>
          Hesabınız okul idaresinin onayına gönderildi. Onaylandığında e-posta adresiniz ve
          şifrenizle giriş yapabilirsiniz.
        </p>
        <button type="button" style={S.button} onClick={() => setDone(false)}>
          Yeni kayıt oluştur
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} style={S.card} noValidate>
      <h2 style={S.title}>Kayıt Ol</h2>

      <div style={S.roleRow}>
        {ROLES.map(r => (
          <button
            key={r.id}
            type="button"
            onClick={() => { setRole(r.id); setError(''); }}
            style={{ ...S.roleBtn, ...(role === r.id ? S.roleBtnActive : null) }}
          >
            {r.label}
          </button>
        ))}
      </div>

      <label style={S.label}>Ad Soyad
        <input style={S.input} value={form.fullName} onChange={set('fullName')} placeholder="Ad Soyad" />
      </label>

      <label style={S.label}>TC Kimlik No
        <input style={S.input} value={form.tcKimlik} onChange={set('tcKimlik')} maxLength={11} inputMode="numeric" placeholder="11 haneli" />
      </label>

      <label style={S.label}>E-posta
        <input style={S.input} type="email" value={form.email} onChange={set('email')} placeholder="ornek@eposta.com" />
      </label>

      <label style={S.label}>Şifre
        <input style={S.input} type="password" value={form.password} onChange={set('password')} placeholder="En az 6 karakter" />
      </label>

      {role === 'parent' && (
        <>
          <label style={S.label}>Öğrencinin Adı Soyadı
            <input style={S.input} value={form.childName} onChange={set('childName')} placeholder="Çocuğunuzun adı soyadı" />
          </label>
          <label style={S.label}>Öğrencinin Okul Numarası
            <input style={S.input} value={form.childSchoolNumber} onChange={set('childSchoolNumber')} inputMode="numeric" placeholder="Örn: 424" />
          </label>
        </>
      )}

      {role === 'student' && (
        <>
          <label style={S.label}>Okul Numarası
            <input style={S.input} value={form.schoolNumber} onChange={set('schoolNumber')} inputMode="numeric" placeholder="Örn: 424" />
          </label>
          <label style={S.label}>Sınıf
            <select style={S.input} value={form.classId} onChange={set('classId')}>
              {CLASS_IDS.map(c => <option key={c} value={c}>{c}. Sınıf</option>)}
            </select>
          </label>
          <label style={S.label}>Veli Cep Telefonu
            <input
              style={S.input}
              value={form.parentPhone}
              onChange={set('parentPhone')}
              inputMode="numeric"
              placeholder="05XXXXXXXXX"
            />
            <span style={S.hint}>
              Giriş, çıkış ve devamsızlık bildirimleri bu numaraya gönderilir.
            </span>
          </label>
        </>
      )}

      {role === 'teacher' && (
        <>
          <label style={S.label}>Branş
            <select style={S.input} value={form.branch} onChange={set('branch')}>
              {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
            </select>
          </label>
          <label style={S.label}>Telefon
            <input style={S.input} value={form.phone} onChange={set('phone')} inputMode="numeric" placeholder="05XXXXXXXXX" />
          </label>
        </>
      )}

      {error && <div style={S.error}>{error}</div>}

      <button type="submit" style={{ ...S.button, opacity: loading ? 0.6 : 1 }} disabled={loading}>
        {loading ? 'Kaydediliyor…' : 'Kayıt Ol'}
      </button>

      <p style={S.note}>
        Kaydınız okul idaresinin onayından sonra aktifleşir.
      </p>
    </form>
  );
}

const S = {
  card: { display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 420, width: '100%', padding: 24, borderRadius: 16, background: '#0f172a', color: '#e2e8f0', fontFamily: 'Inter, system-ui, sans-serif' },
  title: { margin: 0, fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em', color: '#fff' },
  roleRow: { display: 'flex', gap: 6, padding: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 10 },
  roleBtn: { flex: 1, padding: '8px 10px', borderRadius: 7, border: 'none', background: 'transparent', color: '#94a3b8', fontSize: 13, fontWeight: 500, cursor: 'pointer' },
  roleBtnActive: { background: '#991b1b', color: '#fff' },
  label: { display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12.5, color: '#94a3b8' },
  input: { padding: '10px 12px', borderRadius: 9, border: '1px solid rgba(255,255,255,0.12)', background: '#0b1120', color: '#fff', fontSize: 14, outline: 'none' },
  button: { padding: '11px 16px', borderRadius: 9, border: 'none', background: '#991b1b', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer' },
  error: { padding: '10px 12px', borderRadius: 9, background: 'rgba(244,63,94,0.12)', border: '1px solid rgba(244,63,94,0.3)', color: '#fda4af', fontSize: 12.5 },
  hint: { fontSize: 11, color: '#64748b', lineHeight: 1.45 },
  note: { margin: 0, fontSize: 11.5, color: '#64748b', lineHeight: 1.5 }
};
