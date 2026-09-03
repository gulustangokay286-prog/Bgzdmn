/**
 * KADRO — TEK KAYNAK
 *
 * Bu dosyadan once kullanici listesi uc ayri yerde (firebase.js, UsersView,
 * TeacherManagementAdminView) birbirinden bagimsiz olarak "tamir" ediliyordu:
 * her biri kendi gomulu ogretmen listesini ekliyor, kendi rol duzeltmesini
 * yapiyordu. Kurallar birbirini tutmadigi icin ayni insan birden fazla kez
 * listeleniyordu (MESUT ÇOLAK hem veli kaydiyla hem gomulu ogretmen kaydiyla).
 *
 * Artik tek giris noktasi var: buildRoster(). Ham Firestore dokumanlarini alir,
 * ayni insani tekillestirir, rollerini yan yana koyar ve kadroyu tamamlar.
 *
 * ONEMLI: Bir insanin birden fazla rolu olabilir. Cocugu kurumda okuyan bir
 * ogretmen hem `teacher` hem `parent`tir. Bu yuzden tek `role` alanina
 * bakilmaz; her dokuman `_pools` dizisi tasir.
 */

export const POOL = {
  STUDENT: 'student',
  TEACHER: 'teacher',
  ADMIN: 'admin',
  PARENT: 'parent'
};

const TEACHER_ROLES = ['teacher', 'öğretmen', 'ogretmen'];
const ADMIN_ROLES = ['admin', 'yönetici', 'yonetici', 'superadmin', 'personnel', 'personel', 'staff'];
const PARENT_ROLES = ['parent', 'veli'];
const STUDENT_ROLES = ['student', 'öğrenci', 'ogrenci'];

/** Turkce duyarli normalizasyon. "MESUT ÇOLAK" ile "Mesut Çolak" ayni anahtara duser. */
export const normalizeName = (s = '') => String(s || '')
  .replace(/İ/g, 'i').replace(/I/g, 'i').replace(/ı/g, 'i')
  .replace(/Ç/g, 'c').replace(/ç/g, 'c')
  .replace(/Ğ/g, 'g').replace(/ğ/g, 'g')
  .replace(/Ö/g, 'o').replace(/ö/g, 'o')
  .replace(/Ş/g, 's').replace(/ş/g, 's')
  .replace(/Ü/g, 'u').replace(/ü/g, 'u')
  .toLowerCase()
  .replace(/[^a-z0-9\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const NAME_KEYS = ['full_name', 'fullName', 'name', 'displayName', 'display_name'];

export const nameOf = (u) => {
  for (const k of NAME_KEYS) {
    const v = u?.fields?.[k]?.stringValue;
    if (v) return v;
  }
  return '';
};

const str = (u, k) => u?.fields?.[k]?.stringValue || '';
const phoneOf = (u) => String(str(u, 'phone') || str(u, 'telefon') || '').replace(/\D/g, '').slice(-10);

/** Kurumdan ayrilanlar ve gizli hesaplar: listelerde ve sayimlarda asla gorunmez. */
const DEPARTED = ['kantemir', 'patron', 'bogazici yonetim'];

/**
 * Kadroda olup Firestore'da ogretmen olarak kayitli olmayanlar.
 * Buradaki tek liste, uygulamanin tamami icin gecerlidir.
 */
export const STAFF_ROSTER = [
  { name: 'Seçil Özkan',         branch: 'Görsel Sanatlar', contract_end: '06.11.2026', phone: '05466860719', email: 'secilozkan@corumbogazici.com' },
  { name: 'Mesut Çolak',         branch: 'Matematik',       contract_end: '01.09.2027', phone: '',            email: 'mesutcolak@corumbogazici.com' },
  { name: 'Hasan Barış Karataş', branch: 'Biyoloji',        contract_end: '01.09.2027', phone: '',            email: 'hasanbaris@corumbogazici.com' },
  { name: 'Selim Kurtaran',      branch: 'Fizik',           contract_end: '30.06.2027', phone: '',            email: 'selimkurtaran@corumbogazici.com' },
  { name: 'Oya Sadıç Erocağı',   branch: 'İngilizce',       contract_end: '01.09.2027', phone: '',            email: 'oyasadic@corumbogazici.com' },
  { name: 'Mustafa Yalçın',      branch: 'Matematik',       contract_end: '01.09.2027', phone: '',            email: 'mustafayalcin@corumbogazici.com' },
  { name: 'İlhami Doğan',        branch: 'Ders Öğretmeni',  contract_end: '18.10.2026', phone: '',            email: 'ilhamidogan@corumbogazici.com' },
  { name: 'Serpil Satı Ceylan',  branch: 'Eğitim Kadrosu',  contract_end: 'SINIRSIZ',   phone: '',            email: 'serpilsati@corumbogazici.com' },
  { name: 'Muharrem Kodaz',      branch: 'Eğitim Kadrosu',  contract_end: 'SINIRSIZ',   phone: '',            email: 'muharremkodaz@corumbogazici.com' }
];

/** Firestore'daki rolu eksik/yanlis olanlar. Kayit duzelene kadar burada durur. */
const ROLE_FIXES = [
  { match: (n) => n.includes('busra'),   pool: POOL.TEACHER, branch: 'Rehberlik' },
  { match: (n) => n === 'seher sanli',   pool: POOL.TEACHER, branch: 'İdare / Kurucu' }
];

/** Bir dokumanin ham `role` alanindan havuzu. */
const basePoolOf = (u) => {
  const r = (str(u, 'role') || u?.role || '').toLowerCase().trim();
  if (TEACHER_ROLES.includes(r)) return POOL.TEACHER;
  if (ADMIN_ROLES.includes(r)) return POOL.ADMIN;
  if (PARENT_ROLES.includes(r)) return POOL.PARENT;
  if (STUDENT_ROLES.includes(r)) return POOL.STUDENT;
  return str(u, 'school_number') || str(u, 'schoolNumber') ? POOL.STUDENT : null;
};

const makeStaffDoc = (s) => ({
  name: 'projects/bgz-mobil/databases/(default)/documents/users/'
        + s.name.toLowerCase().replace(/[^a-z0-9]/g, '_'),
  _synthetic: true,
  fields: {
    full_name: { stringValue: s.name },
    fullName: { stringValue: s.name },
    name: { stringValue: s.name },
    displayName: { stringValue: s.name },
    branch: { stringValue: s.branch },
    role: { stringValue: 'teacher' },
    status: { stringValue: 'approved' },
    contract_end: { stringValue: s.contract_end },
    phone: { stringValue: s.phone },
    email: { stringValue: s.email },
    teacherTitle: { stringValue: 'Ders Öğretmeni' }
  }
});

/**
 * Iki kayit ayni insan olabilir mi?
 *
 * OGRENCI kimligi asla baska bir havuzla birlestirilmez. Iki sebeple:
 *  - Bir ogrenci kendi velisi olamaz. Anne ile kizi ayni isimde olabilir
 *    (PINAR GÜR) ve bunlari birlestirmek ikisini de bozar.
 *  - Ogrenciler cogu zaman velinin telefonunu kullanir; telefon esitligi
 *    ogrencide "ayni insan" kaniti sayilmaz.
 */
const canMerge = (a, b) => {
  const aOgrenci = (a._pools || []).includes(POOL.STUDENT);
  const bOgrenci = (b._pools || []).includes(POOL.STUDENT);
  return aOgrenci === bOgrenci;
};

/** Iki dokumani tek kisiye indirger. Hedef korunur, eksikleri kaynaktan dolar. */
const mergeInto = (target, source) => {
  for (const [k, v] of Object.entries(source.fields || {})) {
    if (!target.fields[k]?.stringValue && v?.stringValue) target.fields[k] = v;
  }
  target._pools = [...new Set([...(target._pools || []), ...(source._pools || [])])];
  target._legacyIds = [...new Set([...(target._legacyIds || []), ...(source._legacyIds || [])])];
  // Okunakli yazimi tercih et: "MESUT ÇOLAK" yerine "Mesut Çolak".
  const t = nameOf(target);
  const s = nameOf(source);
  if (t && s && t === t.toUpperCase() && s !== s.toUpperCase()) {
    NAME_KEYS.forEach((k) => { if (target.fields[k]) target.fields[k] = { stringValue: s }; });
  }
};

/** Kisi bu havuza ait mi? Coklu rolu dogru sekilde hesaba katar. */
export const hasPool = (doc, pool) => Array.isArray(doc?._pools)
  ? doc._pools.includes(pool)
  : basePoolOf(doc) === pool;

export const isStaff = (doc) => hasPool(doc, POOL.TEACHER) || hasPool(doc, POOL.ADMIN);

/**
 * Ham dokumanlardan tekil kadro uretir.
 * Her cikti dokumaninda `_pools` (tum roller) ve `_primaryPool` bulunur.
 */
export const buildRoster = (docs = []) => {
  const byKey = new Map();

  for (const raw of docs) {
    const name = nameOf(raw);
    if (!name) continue;

    const norm = normalizeName(name);
    const email = (str(raw, 'email') || '').toLowerCase();
    if (DEPARTED.some((d) => norm.includes(d) || email.includes(d))) continue;

    const pool = basePoolOf(raw);
    if (!pool) continue;

    const doc = { ...raw, fields: { ...raw.fields } };
    doc._pools = [pool];
    doc._legacyIds = [String(raw.name || '').split('/').pop()].filter(Boolean);

    // Ayni insan: normalize ad + telefon. Telefon yoksa ad tek basina.
    const phone = phoneOf(raw);
    const key = phone ? `${norm}|${phone}` : `ad|${norm}`;

    const existing = byKey.get(key);
    if (existing && canMerge(existing, doc)) mergeInto(existing, doc);
    else if (existing) byKey.set(`${key}|${doc._pools[0]}`, doc);
    else byKey.set(key, doc);
  }

  // Telefonu olan ve olmayan ayri anahtara dusmus ayni insani da birlestir.
  const byName = new Map();
  for (const [key, doc] of [...byKey.entries()]) {
    const norm = normalizeName(nameOf(doc));
    const prev = byName.get(norm);
    if (prev && prev !== doc && canMerge(prev, doc)) { mergeInto(prev, doc); byKey.delete(key); }
    else if (!prev) byName.set(norm, doc);
  }

  // Rol duzeltmeleri.
  for (const doc of byKey.values()) {
    const norm = normalizeName(nameOf(doc));
    for (const fix of ROLE_FIXES) {
      if (!fix.match(norm)) continue;
      if (!doc._pools.includes(fix.pool)) doc._pools.push(fix.pool);
      if (!doc.fields.branch?.stringValue) doc.fields.branch = { stringValue: fix.branch };
    }
  }

  // Kadroyu tamamla: kisi varsa ogretmen rolunu EKLE, yoksa yeni kayit ac.
  for (const s of STAFF_ROSTER) {
    const norm = normalizeName(s.name);
    const existing = [...byKey.values()].find(
      (d) => normalizeName(nameOf(d)) === norm && !d._pools.includes(POOL.STUDENT)
    );
    if (existing) {
      if (!existing._pools.includes(POOL.TEACHER)) existing._pools.push(POOL.TEACHER);
      if (!existing.fields.branch?.stringValue) existing.fields.branch = { stringValue: s.branch };
      if (!existing.fields.contract_end?.stringValue) existing.fields.contract_end = { stringValue: s.contract_end };
      existing.fields.teacherTitle = { stringValue: 'Ders Öğretmeni' };
    } else {
      const doc = makeStaffDoc(s);
      doc._pools = [POOL.TEACHER];
      doc._legacyIds = [];
      byKey.set(`kadro|${norm}`, doc);
    }
  }

  /*
   * VELI ROLUNU OGRENCI KAYDINDAN TURET.
   *
   * Cocugu kurumda okuyan bir ogretmenin ayri bir veli kaydi olmayabilir; o
   * zaman kayit birlestirmesi onu yakalayamaz. Ogrenci kayitlarindaki
   * `parent_name` / `parent_phone` alanlari dogrudan personele isaret ediyorsa
   * o kisiye veli rolu ve cocuk bagi eklenir.
   */
  {
    const staff = [...byKey.values()].filter((d) => isStaff(d));
    const byNorm = new Map(staff.map((d) => [normalizeName(nameOf(d)), d]));
    const byPhone = new Map(staff.filter((d) => phoneOf(d)).map((d) => [phoneOf(d), d]));

    for (const doc of byKey.values()) {
      if (!doc._pools.includes(POOL.STUDENT)) continue;
      const veliAd = normalizeName(str(doc, 'parent_name'));
      const veliTel = String(str(doc, 'parent_phone') || '').replace(/\D/g, '').slice(-10);

      /*
       * Isim eslesmesi kesin kanittir. Telefon eslesmesi TEK BASINA yeterli
       * degildir: kadro listesindeki telefonlar elle girilmis olabilir ve bir
       * numara birden fazla kisiye ait gorunebilir. Isim tutmadan yalnizca
       * telefon tutuyorsa kisi otomatik veli yapilmaz, incelemeye dusurulur
       * (ornek: ogretmen "Seçil Özkan" ile veli "SEÇİL KÖSE" ayni telefonu
       * tasiyor; ayni kadin olabilir ama buna idare karar vermeli).
       */
      const adEslesen = veliAd ? byNorm.get(veliAd) : null;
      const telEslesen = veliTel ? byPhone.get(veliTel) : null;

      if (!adEslesen && telEslesen) {
        telEslesen._review = telEslesen._review || [];
        telEslesen._review.push({
          sebep: 'telefon eşleşiyor, ad tutmuyor',
          ogrenci: nameOf(doc),
          okulNo: str(doc, 'school_number'),
          kayittakiVeliAdi: str(doc, 'parent_name')
        });
        continue;
      }

      const veli = adEslesen;
      if (!veli) continue;

      if (!veli._pools.includes(POOL.PARENT)) veli._pools.push(POOL.PARENT);
      veli._children = veli._children || [];
      const cocuk = { name: nameOf(doc), schoolNumber: str(doc, 'school_number') || str(doc, 'schoolNumber') };
      if (!veli._children.some((c) => c.schoolNumber === cocuk.schoolNumber)) veli._children.push(cocuk);
    }
  }

  // Birincil havuz: veli disindaki ilk rol. Sadece veliyse veli.
  const list = [...byKey.values()];
  for (const doc of list) {
    doc._primaryPool = doc._pools.find((p) => p !== POOL.PARENT) || doc._pools[0];
    // Eski kodlar hâlâ fields.role okuyor; birincil rolu oraya yansit.
    doc.fields.role = { stringValue: doc._primaryPool };
    doc.role = doc._primaryPool;
  }

  list.sort((a, b) => nameOf(a).localeCompare(nameOf(b), 'tr'));
  return list;
};


