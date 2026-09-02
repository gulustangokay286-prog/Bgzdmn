
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_ATTENDANCE_CONFIG,
  ABSENCE_STATUS,
  ENTRY_DECISION,
  SESSION_MORNING,
  SESSION_AFTERNOON,
  COUNSELOR_TITLE,
  timeToMinutes,
  minutesToTime,
  getMinutesInTimeZone,
  getDateKeyInTimeZone,
  getDayNameInTimeZone,
  resolveAttendanceConfig,
  getAttendanceWindows,
  isClosedDay,
  classifyScanMinutes,
  normalizeScanRecord,
  sortAndDedupeScans,
  evaluateEntryAttempt,
  evaluateStudentDay,
  buildAutoAbsenceRecord,
  buildAutoAbsenceId,
  buildLegacyAutoAbsenceIds,
  sumAbsenceWeight,
  formatDayCount
} from '../src/services/attendanceRules.js';

const CFG = resolveAttendanceConfig({});
const at = (t) => timeToMinutes(t);

test('timeToMinutes / minutesToTime gidiş-dönüş', () => {
  assert.equal(timeToMinutes('09:00'), 540);
  assert.equal(timeToMinutes('09:10'), 550);
  assert.equal(timeToMinutes('16:00'), 960);
  assert.equal(timeToMinutes('00:00'), 0);
  assert.equal(minutesToTime(550), '09:10');
  assert.equal(minutesToTime(0), '00:00');
});

test('timeToMinutes geçersiz girdilerde null döner', () => {
  assert.equal(timeToMinutes('abc'), null);
  assert.equal(timeToMinutes('25:00'), null);
  assert.equal(timeToMinutes('09:99'), null);
  assert.equal(timeToMinutes(null), null);
  assert.equal(timeToMinutes(''), null);
});

test('getMinutesInTimeZone UTC damgasını Türkiye saatine çevirir', () => {
  
  const d = new Date('2026-08-25T06:11:00Z');
  assert.equal(getMinutesInTimeZone(d, 'Europe/Istanbul'), timeToMinutes('09:11'));
});

test('getDateKeyInTimeZone gün anahtarını doğru üretir', () => {
  
  assert.equal(getDateKeyInTimeZone(new Date('2026-08-25T21:30:00Z'), 'Europe/Istanbul'), '2026-08-26');
  assert.equal(getDateKeyInTimeZone(new Date('2026-08-25T06:00:00Z'), 'Europe/Istanbul'), '2026-08-25');
});

test('getDayNameInTimeZone Türkçe gün adı döner', () => {
  assert.equal(getDayNameInTimeZone(new Date('2026-08-25T09:00:00Z'), 'Europe/Istanbul'), 'Salı');
  assert.equal(getDayNameInTimeZone(new Date('2026-08-23T09:00:00Z'), 'Europe/Istanbul'), 'Pazar');
});

test('varsayılan yapılandırma kullanıcının istediği saatleri verir', () => {
  assert.equal(CFG.morningEntryHour, '09:00');
  assert.equal(CFG.morningGraceMinutes, 10);
  assert.equal(CFG.lunchExitHour, '12:00');
  assert.equal(CFG.lunchExitGraceMinutes, 10);
  assert.equal(CFG.afternoonEntryHour, '13:00');
  assert.equal(CFG.afternoonGraceMinutes, 10);
  assert.equal(CFG.schoolExitHour, '16:00');
  assert.equal(CFG.halfDayCutoffHour, '12:00');
});

test('pencereler doğru eşiklere çözümlenir', () => {
  const w = getAttendanceWindows(CFG);
  assert.equal(w.morningGraceEnd, at('09:10'));
  assert.equal(w.lunchExitAutoAt, at('12:10'));
  assert.equal(w.afternoonGraceEnd, at('13:10'));
  assert.equal(w.schoolExit, at('16:00'));
  assert.equal(w.halfDayCutoff, at('12:00'));
});

test('eski kurum ayarları (lunchBreakStart/End, closingHour) geriye dönük okunur', () => {
  const legacy = resolveAttendanceConfig({
    openingHour: '08:00',
    closingHour: '17:30',
    lunchBreakStart: '11:45',
    lunchBreakEnd: '12:45'
  });
  assert.equal(legacy.schoolExitHour, '17:30');
  assert.equal(legacy.lunchExitHour, '11:45');
  assert.equal(legacy.afternoonEntryHour, '12:45');
});

test('bozuk saat sırası otomatik onarılır, sistem kilitlenmez', () => {
  const broken = resolveAttendanceConfig({
    morningEntryHour: '09:00',
    lunchExitHour: '08:00',       
    afternoonEntryHour: '07:00',  
    schoolExitHour: '06:00'       
  });
  const w = getAttendanceWindows(broken);
  assert.ok(w.morningStart < w.lunchExitStart, 'sabah < öğle çıkışı');
  assert.ok(w.halfDayCutoff <= w.afternoonStart, 'yarım gün sınırı <= öğleden sonra');
  assert.ok(w.afternoonStart < w.schoolExit, 'öğleden sonra < okul çıkışı');
});

test('geçersiz saat metni varsayılana düşer', () => {
  const bad = resolveAttendanceConfig({ schoolExitHour: 'saat yok', morningGraceMinutes: 'abc' });
  assert.equal(bad.schoolExitHour, '16:00');
  assert.equal(bad.morningGraceMinutes, 10);
});

test('kapalı gün ve tatil kontrolü', () => {
  const cfg = resolveAttendanceConfig({ closedDays: ['Pazar'], holidays: ['2026-08-30'] });
  assert.equal(isClosedDay(new Date('2026-08-23T09:00:00Z'), cfg), true,  'Pazar kapalı');
  assert.equal(isClosedDay(new Date('2026-08-25T09:00:00Z'), cfg), false, 'Salı açık');
  assert.equal(isClosedDay(new Date('2026-08-30T09:00:00Z'), cfg), true,  'tatil günü kapalı');
});

test('09:00 tam vaktinde giriş kabul edilir', () => {
  const d = evaluateEntryAttempt({ minutes: at('09:00'), config: CFG });
  assert.equal(d.allowed, true);
  assert.equal(d.code, ENTRY_DECISION.OK);
  assert.equal(d.isLate, false);
  assert.equal(d.session, SESSION_MORNING);
});

test('09:10 — tolerans sınırı, HÂLÂ kabul edilir', () => {
  const d = evaluateEntryAttempt({ minutes: at('09:10'), config: CFG });
  assert.equal(d.allowed, true, '09:10 tolerans içindedir');
  assert.equal(d.isLate, false);
  assert.equal(d.requiresCounselor, false);
});

test('09:11 — REHBER ÖĞRETMEN ekranı çıkar, giriş kaydedilmez', () => {
  const d = evaluateEntryAttempt({ minutes: at('09:11'), config: CFG });
  assert.equal(d.allowed, false, 'otomatik giriş yapılmamalı');
  assert.equal(d.recordEntry, false);
  assert.equal(d.requiresCounselor, true);
  assert.equal(d.code, ENTRY_DECISION.LATE_MORNING);
  assert.equal(d.title, COUNSELOR_TITLE);
  assert.equal(d.session, SESSION_MORNING);
  assert.equal(d.lateByMinutes, 1);
  assert.match(d.detail, /Rehber Öğretmen/);
  assert.match(d.detail, /manuel/);
});

test('11:30 geç sabah girişi de rehberliğe yönlenir', () => {
  const d = evaluateEntryAttempt({ minutes: at('11:30'), config: CFG });
  assert.equal(d.code, ENTRY_DECISION.LATE_MORNING);
  assert.equal(d.requiresCounselor, true);
});

test('13:00 ve 13:10 öğleden sonra girişleri kabul edilir', () => {
  for (const t of ['13:00', '13:05', '13:10']) {
    const d = evaluateEntryAttempt({ minutes: at(t), config: CFG });
    assert.equal(d.allowed, true, `${t} kabul edilmeli`);
    assert.equal(d.session, SESSION_AFTERNOON);
    assert.equal(d.isLate, false);
  }
});

test('13:11 — REHBER ÖĞRETMEN ekranı (öğleden sonra)', () => {
  const d = evaluateEntryAttempt({ minutes: at('13:11'), config: CFG });
  assert.equal(d.allowed, false);
  assert.equal(d.requiresCounselor, true);
  assert.equal(d.code, ENTRY_DECISION.LATE_AFTERNOON);
  assert.equal(d.title, COUNSELOR_TITLE);
  assert.equal(d.session, SESSION_AFTERNOON);
  assert.equal(d.lateByMinutes, 1);
});

test('12:00-13:10 arası (öğle penceresi) geç sayılmaz', () => {
  const d = evaluateEntryAttempt({ minutes: at('12:30'), config: CFG });
  assert.equal(d.allowed, true);
  assert.equal(d.isLate, false);
  assert.equal(d.session, SESSION_AFTERNOON);
});

test('görevli öğretmen MANUEL onayı geç saatte bile girişi kaydeder', () => {
  const d = evaluateEntryAttempt({ minutes: at('09:11'), config: CFG, isManualApproval: true });
  assert.equal(d.allowed, true);
  assert.equal(d.recordEntry, true);
  assert.equal(d.code, ENTRY_DECISION.OK_MANUAL);
  assert.equal(d.isLate, true, 'kayıt geç olarak işaretlenmeli');
  assert.equal(d.session, SESSION_MORNING);
});

test('manuel onay öğleden sonra da çalışır', () => {
  const d = evaluateEntryAttempt({ minutes: at('14:30'), config: CFG, isManualApproval: true });
  assert.equal(d.allowed, true);
  assert.equal(d.session, SESSION_AFTERNOON);
  assert.equal(d.isLate, true);
});

test('zaten içerideyken tekrar okutma uyarı verir', () => {
  const d = evaluateEntryAttempt({ minutes: at('09:05'), config: CFG, currentStatus: 'entry' });
  assert.equal(d.allowed, false);
  assert.equal(d.code, ENTRY_DECISION.ALREADY_INSIDE);
  assert.equal(d.requiresCounselor, false);
});

test('okul saatleri dışında giriş alınmaz', () => {
  const erken = evaluateEntryAttempt({ minutes: at('05:30'), config: CFG });
  assert.equal(erken.code, ENTRY_DECISION.OUT_OF_HOURS);
  const gec = evaluateEntryAttempt({ minutes: at('17:00'), config: CFG });
  assert.equal(gec.code, ENTRY_DECISION.OUT_OF_HOURS);
});

test('kapalı günde giriş reddedilir', () => {
  const d = evaluateEntryAttempt({ minutes: at('09:00'), config: CFG, isClosedDay: true });
  assert.equal(d.code, ENTRY_DECISION.CLOSED_DAY);
  assert.equal(d.allowed, false);
});

test('rehberlik onayı kapatılırsa geç giriş doğrudan kaydedilir', () => {
  const cfg = resolveAttendanceConfig({ lateRequiresCounselorApproval: false });
  const d = evaluateEntryAttempt({ minutes: at('09:11'), config: cfg });
  assert.equal(d.allowed, true);
  assert.equal(d.isLate, true, 'yine de geç olarak işaretlenir');
  assert.equal(d.requiresCounselor, false);
});

const scan = (time, action = 'entry', extra = {}) => ({
  minutes: at(time), time, action,
  session: classifyScanMinutes(at(time), CFG).session,
  isLate: classifyScanMinutes(at(time), CFG).isLate,
  auto: false, autoKind: null, ...extra
});

test('12:00 ÖNCESİ hiçbir şey kesinleşmez (beklemede)', () => {
  const r = evaluateStudentDay({ scans: [], nowMinutes: at('11:59'), config: CFG });
  assert.equal(r.absenceWeight, 0);
  assert.equal(r.status, ABSENCE_STATUS.PENDING);
  assert.equal(r.morning.finalized, false);
});

test('12:00 OLDUĞU AN sabah gelmeyene yarım gün yok yazılır', () => {
  const r = evaluateStudentDay({ scans: [], nowMinutes: at('12:00'), config: CFG });
  assert.equal(r.morning.finalized, true);
  assert.equal(r.absenceWeight, 0.5);
  assert.equal(r.status, ABSENCE_STATUS.HALF_DAY);
  assert.deepEqual(r.missingSessions, [SESSION_MORNING]);
});

test('sabah geldi + öğleden sonra geldi = tam gün mevcut', () => {
  const r = evaluateStudentDay({
    scans: [scan('09:02'), scan('12:05', 'exit'), scan('13:04')],
    nowMinutes: at('16:00'), config: CFG
  });
  assert.equal(r.absenceWeight, 0);
  assert.equal(r.status, ABSENCE_STATUS.PRESENT);
  assert.equal(r.morning.present, true);
  assert.equal(r.afternoon.present, true);
});

test('sabah geldi + öğleden sonra GELMEDİ = yarım gün yok (0.5)', () => {
  const r = evaluateStudentDay({
    scans: [scan('09:00'), scan('12:03', 'exit')],
    nowMinutes: at('16:00'), config: CFG
  });
  assert.equal(r.absenceWeight, 0.5);
  assert.equal(r.status, ABSENCE_STATUS.HALF_DAY);
  assert.deepEqual(r.missingSessions, [SESSION_AFTERNOON]);
});

test('KULLANICI KURALI: yarım gün var + yarım gün yok = yarım gün yok', () => {
  
  const r = evaluateStudentDay({
    scans: [scan('13:05')],
    nowMinutes: at('16:00'), config: CFG
  });
  assert.equal(r.morning.present, false);
  assert.equal(r.afternoon.present, true);
  assert.equal(r.absenceWeight, 0.5, 'yalnızca yarım gün yok olmalı');
  assert.equal(r.status, ABSENCE_STATUS.HALF_DAY);
});

test('öğleden sonra gelen öğrencinin ikinci yarım günü YAZILMAZ', () => {
  const r = evaluateStudentDay({ scans: [scan('13:05')], nowMinutes: at('16:00'), config: CFG });
  assert.ok(!r.missingSessions.includes(SESSION_AFTERNOON));
  assert.deepEqual(r.missingSessions, [SESSION_MORNING]);
});

test('16:00 OLDUĞU AN hiç gelmeyene TAM GÜN YOK (1.0) yazılır', () => {
  const r = evaluateStudentDay({ scans: [], nowMinutes: at('16:00'), config: CFG });
  assert.equal(r.absenceWeight, 1.0);
  assert.equal(r.status, ABSENCE_STATUS.FULL_DAY);
  assert.deepEqual(r.missingSessions, [SESSION_MORNING, SESSION_AFTERNOON]);
  assert.equal(r.statusLabel, 'Tam Gün Devamsız (1.0)');
});

test('15:59 henüz tam gün değil, sadece yarım gün', () => {
  const r = evaluateStudentDay({ scans: [], nowMinutes: at('15:59'), config: CFG });
  assert.equal(r.absenceWeight, 0.5);
  assert.equal(r.afternoon.finalized, false);
});

test('geç gelen öğrenci (manuel onaylı) mevcut sayılır ama geç işaretlenir', () => {
  const r = evaluateStudentDay({
    scans: [scan('09:25', 'entry', { isLate: true })],
    nowMinutes: at('16:00'), config: CFG
  });
  assert.equal(r.morning.present, true);
  assert.equal(r.morning.isLate, true);
  assert.equal(r.isLate, true);
  assert.equal(r.absenceWeight, 0.5, 'öğleden sonra gelmediği için yarım gün');
});

test('kapalı günde devamsızlık işlenmez', () => {
  const r = evaluateStudentDay({ scans: [], nowMinutes: at('16:30'), config: CFG, isClosedDay: true });
  assert.equal(r.absenceWeight, 0);
  assert.deepEqual(r.missingSessions, []);
  assert.match(r.statusLabel, /Kapalı/);
});

test('okul çıkış saati 15:00 yapılırsa tam gün 15:00 de kesinleşir', () => {
  const cfg = resolveAttendanceConfig({ schoolExitHour: '15:00' });
  assert.equal(cfg.schoolExitHour, '15:00');

  const once = evaluateStudentDay({ scans: [], nowMinutes: at('14:59'), config: cfg });
  assert.equal(once.absenceWeight, 0.5, '15:00 öncesi hâlâ yarım gün');

  const sonra = evaluateStudentDay({ scans: [], nowMinutes: at('15:00'), config: cfg });
  assert.equal(sonra.absenceWeight, 1.0, '15:00 de tam gün');
  assert.equal(sonra.status, ABSENCE_STATUS.FULL_DAY);
});

test('okul çıkış saati 17:30 yapılırsa 16:00 da tam gün YAZILMAZ', () => {
  const cfg = resolveAttendanceConfig({ schoolExitHour: '17:30' });
  const r16 = evaluateStudentDay({ scans: [], nowMinutes: at('16:00'), config: cfg });
  assert.equal(r16.absenceWeight, 0.5, '16:00 da henüz tam gün değil');
  const r1730 = evaluateStudentDay({ scans: [], nowMinutes: at('17:30'), config: cfg });
  assert.equal(r1730.absenceWeight, 1.0);
});

test('çıkış saati değişince öğleden sonra giriş penceresi de genişler', () => {
  const cfg = resolveAttendanceConfig({ schoolExitHour: '17:30' });
  const d = evaluateEntryAttempt({ minutes: at('17:00'), config: cfg, isManualApproval: true });
  assert.equal(d.allowed, true);
  const r = evaluateStudentDay({ scans: [scan('17:00')], nowMinutes: at('17:30'), config: cfg });
  assert.equal(r.afternoon.present, true, '17:00 girişi öğleden sonra sayılmalı');
});

test('sabah giriş saati 08:30 + 5 dk tolerans olarak değiştirilebilir', () => {
  const cfg = resolveAttendanceConfig({ morningEntryHour: '08:30', morningGraceMinutes: 5 });
  assert.equal(evaluateEntryAttempt({ minutes: at('08:35'), config: cfg }).allowed, true);
  const gec = evaluateEntryAttempt({ minutes: at('08:36'), config: cfg });
  assert.equal(gec.allowed, false);
  assert.equal(gec.requiresCounselor, true);
});

test('12:10 — sabah okuttu, çıkış okutmadı => OTOMATİK ÇIKIŞ gerekir', () => {
  const r = evaluateStudentDay({ scans: [scan('09:00')], nowMinutes: at('12:10'), config: CFG });
  assert.equal(r.needsAutoLunchExit, true);
  assert.equal(r.isInside, true);
});

test('12:09 — henüz otomatik çıkış YOK (10 dk müsaade sürüyor)', () => {
  const r = evaluateStudentDay({ scans: [scan('09:00')], nowMinutes: at('12:09'), config: CFG });
  assert.equal(r.needsAutoLunchExit, false);
});

test('kendi çıkışını okutan öğrenciye otomatik çıkış yazılmaz', () => {
  const r = evaluateStudentDay({
    scans: [scan('09:00'), scan('12:04', 'exit')],
    nowMinutes: at('12:10'), config: CFG
  });
  assert.equal(r.needsAutoLunchExit, false);
  assert.equal(r.isInside, false);
});

test('sabah hiç okutmayana otomatik çıkış yazılmaz', () => {
  const r = evaluateStudentDay({ scans: [], nowMinutes: at('12:10'), config: CFG });
  assert.equal(r.needsAutoLunchExit, false);
});

test('otomatik çıkış bir kez yazılır (idempotent)', () => {
  const r = evaluateStudentDay({
    scans: [scan('09:00'), scan('12:10', 'exit', { auto: true, autoKind: 'lunch_exit' })],
    nowMinutes: at('12:30'), config: CFG
  });
  assert.equal(r.needsAutoLunchExit, false, 'zaten yazılmış, tekrar yazılmamalı');
});

test('öğleden sonra tekrar giren öğrenciye öğle otomatik çıkışı tekrar yazılmaz', () => {
  const r = evaluateStudentDay({
    scans: [
      scan('09:00'),
      scan('12:10', 'exit', { auto: true, autoKind: 'lunch_exit' }),
      scan('13:05')
    ],
    nowMinutes: at('14:00'), config: CFG
  });
  assert.equal(r.needsAutoLunchExit, false);
  assert.equal(r.isInside, true);
  assert.equal(r.absenceWeight, 0, 'her iki oturuma da katıldı');
});

test('okul çıkışında hâlâ içeride görünen öğrenci otomatik kapatılır', () => {
  const r = evaluateStudentDay({
    scans: [scan('09:00'), scan('12:05', 'exit'), scan('13:00')],
    nowMinutes: at('16:00'), config: CFG
  });
  assert.equal(r.needsAutoSchoolExit, true);
});

test('otomatik çıkış ayarı kapatılabilir', () => {
  const cfg = resolveAttendanceConfig({ autoLunchExitEnabled: false });
  const r = evaluateStudentDay({ scans: [scan('09:00')], nowMinutes: at('12:30'), config: cfg });
  assert.equal(r.needsAutoLunchExit, false);
});

const autoRecord = (nowTime, scans = [], extra = {}) => {
  const evaluation = evaluateStudentDay({ scans, nowMinutes: at(nowTime), config: CFG });
  return buildAutoAbsenceRecord({
    config: CFG, evaluation, dateKey: '2026-08-25',
    studentId: 'stu1', studentName: 'Ali Veli', ...extra
  });
};

test('12:00 — YARIM GÜN YOK kaydı açılır (0,5)', () => {
  const r = autoRecord('12:00');
  assert.ok(r, 'kayıt üretilmeli');
  assert.equal(r.courseName, 'Yarım Gün Yok (Sabah)');
  assert.equal(r.absenceWeight, 0.5);
  assert.equal(r.periodIndex, -0.5);
  assert.equal(r.autoGenerated, true);
  assert.equal(r.date, '2026-08-25');
});

test('KULLANICI KURALI: 16:00 — AYNI kayıt TAM GÜN YOK a yükseltilir', () => {
  const yarim = autoRecord('12:00');
  const tam = autoRecord('16:00');

  assert.equal(tam.courseName, 'Tam Gün Yok (Özürsüz)', 'etiket tam gün olmalı');
  assert.equal(tam.absenceWeight, 1, 'ağırlık 1,0 olmalı');
  assert.equal(tam.periodIndex, -1);
  assert.deepEqual(tam.missingSessions, ['morning', 'afternoon']);
  assert.equal(tam.sessionLabel, 'Sabah + Öğleden Sonra');

  assert.equal(tam.id, yarim.id, 'aynı kayıt güncellenmeli, yenisi eklenmemeli');
  assert.equal(tam.id, 'auto_2026-08-25_stu1');
});

test('15:59 hâlâ yarım gün, 16:00 da tam gün', () => {
  assert.equal(autoRecord('15:59').absenceWeight, 0.5);
  assert.equal(autoRecord('16:00').absenceWeight, 1);
});

test('sabah geldi + öğleden sonra gelmedi -> Yarım Gün Yok (Öğleden Sonra)', () => {
  const r = autoRecord('16:00', [scan('09:00')]);
  assert.equal(r.courseName, 'Yarım Gün Yok (Öğleden Sonra)');
  assert.equal(r.absenceWeight, 0.5);
  assert.deepEqual(r.missingSessions, [SESSION_AFTERNOON]);
});

test('KULLANICI KURALI: öğleden sonra gelen TAM GÜN değil, yarım gün yok kalır', () => {
  const r = autoRecord('16:00', [scan('13:05')]);
  assert.equal(r.courseName, 'Yarım Gün Yok (Sabah)');
  assert.equal(r.absenceWeight, 0.5, 'tam güne yükselmemeli');
  assert.deepEqual(r.missingSessions, [SESSION_MORNING]);
});

test('her iki oturuma da katılan öğrenciye kayıt üretilmez (null)', () => {
  const r = autoRecord('16:00', [scan('09:00'), scan('12:05', 'exit'), scan('13:02')]);
  assert.equal(r, null, 'devamsızlık yoksa kayıt olmamalı');
});

test('12:00 öncesi kayıt üretilmez', () => {
  assert.equal(autoRecord('11:59'), null);
});

test('günde öğrenci başına TEK kimlik kullanılır', () => {
  assert.equal(buildAutoAbsenceId('2026-08-25', 'abc'), 'auto_2026-08-25_abc');
  assert.equal(buildAutoAbsenceId('2026-08-25', 'abc'), buildAutoAbsenceId('2026-08-25', 'abc'));
});

test('eski oturum bazlı kimlikler temizlik için üretiliyor', () => {
  assert.deepEqual(buildLegacyAutoAbsenceIds('2026-08-25', 'abc'), [
    'auto_2026-08-25_abc_morning',
    'auto_2026-08-25_abc_afternoon'
  ]);
});

test('raporlu/izinli öğrenciye otomatik devamsızlık yazılmaz', () => {
  assert.equal(autoRecord('16:00', [], { hasExcuse: true }), null);
});

test('idarenin elle girdiği kayıt otomatiği ezer', () => {
  assert.equal(autoRecord('16:00', [], { hasManualRecord: true }), null);
});

test('otomasyon kapatılırsa kayıt üretilmez', () => {
  const cfg = resolveAttendanceConfig({ autoAttendanceEnabled: false });
  const evaluation = evaluateStudentDay({ scans: [], nowMinutes: at('16:00'), config: cfg });
  assert.equal(buildAutoAbsenceRecord({ config: cfg, evaluation, dateKey: '2026-08-25', studentId: 'x' }), null);
});

test('kapalı günde kayıt üretilmez', () => {
  const evaluation = evaluateStudentDay({ scans: [], nowMinutes: at('16:00'), config: CFG, isClosedDay: true });
  assert.equal(buildAutoAbsenceRecord({
    config: CFG, evaluation, dateKey: '2026-08-23', studentId: 'x', isClosedDay: true
  }), null);
});

test('tek kayıt ağırlığı doğrudan okunur, toplama gerekmez', () => {
  assert.equal(sumAbsenceWeight([autoRecord('16:00')]), 1);
  assert.equal(sumAbsenceWeight([autoRecord('12:00')]), 0.5);
});

test('sumAbsenceWeight yarım günleri toplar, tam günü aşmaz', () => {
  assert.equal(sumAbsenceWeight([{ absenceWeight: 0.5 }, { absenceWeight: 0.5 }]), 1);
  assert.equal(sumAbsenceWeight([{ courseName: 'Yarım Gün Yok (Sabah)' }]), 0.5);
  assert.equal(sumAbsenceWeight([{ courseName: 'Tam Gün Yok (Özürsüz)' }]), 1);
  assert.equal(sumAbsenceWeight([{ absenceWeight: 0.5 }, { absenceWeight: 0.5 }, { absenceWeight: 0.5 }]), 1);
});

test('raporlu kayıtlar devamsızlık ağırlığına eklenmez', () => {
  assert.equal(sumAbsenceWeight([{ status: 'excused', absenceWeight: 1 }]), 0);
  assert.equal(sumAbsenceWeight([{ courseName: 'Tam Gün (Raporlu / İzinli)' }]), 0);
});

test('formatDayCount Türkçe ondalık gösterir', () => {
  assert.equal(formatDayCount(1), '1');
  assert.equal(formatDayCount(1.5), '1,5');
  assert.equal(formatDayCount(0.5), '0,5');
  assert.equal(formatDayCount(0), '0');
});

test('RTDB epoch damgalı kayıt normalize edilir', () => {
  const s = normalizeScanRecord(
    { studentId: 'a', action: 'entry', timestamp: new Date('2026-08-25T06:11:00Z').getTime() },
    CFG
  );
  assert.equal(s.time, '09:11');
  assert.equal(s.action, 'entry');
  assert.equal(s.isLate, true);
  assert.equal(s.session, SESSION_MORNING);
});

test('Firestore Timestamp (seconds) kaydı normalize edilir', () => {
  const s = normalizeScanRecord(
    { studentId: 'a', status: 'exit', timestamp: { seconds: Math.floor(new Date('2026-08-25T09:05:00Z').getTime() / 1000) } },
    CFG
  );
  assert.equal(s.time, '12:05');
  assert.equal(s.action, 'exit');
});

test('sadece "HH:MM" alanı olan eski kayıt normalize edilir', () => {
  const s = normalizeScanRecord({ studentId: 'a', time: '09:03', action: 'entry' }, CFG);
  assert.equal(s.minutes, at('09:03'));
  assert.equal(s.isLate, false);
});

test('zaman bilgisi olmayan kayıt reddedilir', () => {
  assert.equal(normalizeScanRecord({ studentId: 'a', action: 'entry' }, CFG), null);
  assert.equal(normalizeScanRecord(null, CFG), null);
});

test('Türkçe aksiyon adları da tanınır', () => {
  assert.equal(normalizeScanRecord({ time: '12:05', action: 'çıkış' }, CFG).action, 'exit');
  assert.equal(normalizeScanRecord({ time: '12:05', action: 'outside' }, CFG).action, 'exit');
});

test('sortAndDedupeScans mükerrer okutmaları temizler', () => {
  const list = sortAndDedupeScans([
    scan('12:05', 'exit'), scan('09:00'), scan('09:00'), scan('13:00')
  ]);
  assert.equal(list.length, 3);
  assert.deepEqual(list.map(s => s.time), ['09:00', '12:05', '13:00']);
});

test('E2E: normal bir okul günü dakika dakika ilerler', () => {
  const timeline = [];
  const scans = [];
  const push = (t) => scans.push(scan(t.time, t.action, t.extra || {}));

  push({ time: '08:55', action: 'entry' });
  timeline.push(['09:30', evaluateStudentDay({ scans, nowMinutes: at('09:30'), config: CFG })]);
  
  const at1210 = evaluateStudentDay({ scans, nowMinutes: at('12:10'), config: CFG });
  assert.equal(at1210.needsAutoLunchExit, true);
  push({ time: '12:10', action: 'exit', extra: { auto: true, autoKind: 'lunch_exit' } });
  
  push({ time: '13:02', action: 'entry' });

  const final = evaluateStudentDay({ scans, nowMinutes: at('16:00'), config: CFG });
  assert.equal(final.absenceWeight, 0);
  assert.equal(final.status, ABSENCE_STATUS.PRESENT);
  assert.equal(final.needsAutoSchoolExit, true, '13:02 girişinden sonra çıkış okutmadı');
  assert.equal(timeline[0][1].status, ABSENCE_STATUS.PRESENT);
});

test('E2E: hiç gelmeyen öğrencinin günü', () => {
  const steps = [
    ['08:00', 0,   ABSENCE_STATUS.PENDING],
    ['11:59', 0,   ABSENCE_STATUS.PENDING],
    ['12:00', 0.5, ABSENCE_STATUS.HALF_DAY],
    ['15:00', 0.5, ABSENCE_STATUS.HALF_DAY],
    ['16:00', 1.0, ABSENCE_STATUS.FULL_DAY],
    ['17:00', 1.0, ABSENCE_STATUS.FULL_DAY]
  ];
  for (const [time, weight, status] of steps) {
    const r = evaluateStudentDay({ scans: [], nowMinutes: at(time), config: CFG });
    assert.equal(r.absenceWeight, weight, `${time} ağırlık`);
    assert.equal(r.status, status, `${time} durum`);
  }
});

test('E2E: geç kalıp rehberlikten onay alan öğrenci', () => {
  
  const red = evaluateEntryAttempt({ minutes: at('09:25'), config: CFG });
  assert.equal(red.allowed, false);
  assert.equal(red.title, COUNSELOR_TITLE);

  const onay = evaluateEntryAttempt({ minutes: at('09:40'), config: CFG, isManualApproval: true });
  assert.equal(onay.allowed, true);
  assert.equal(onay.isLate, true);

  const gun = evaluateStudentDay({
    scans: [scan('09:40', 'entry', { isLate: true })],
    nowMinutes: at('16:00'), config: CFG
  });
  assert.equal(gun.absenceWeight, 0.5);
  assert.equal(gun.isLate, true);
});
