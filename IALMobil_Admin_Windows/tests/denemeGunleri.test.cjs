const test = require('node:test');
const assert = require('node:assert/strict');
const deneme = require('../ops/vds/denemeGunleri.live.cjs');

const base = {
    saatDilimi: 'Europe/Istanbul',
    denemeGunleri: [{
        tarih: '2026-09-09',
        ad: '12. Sınıf Denemesi',
        sinifSeviyeleri: ['12'],
        baslangicSaati: '10:15',
        gecMusaadeDk: 0,
        sinavSuresiDk: 165,
        otomatikCikisSaati: '13:15',
        etutVar: false,
        aktif: true,
    }],
};

test('deneme günü yalnızca seçilen sınıf seviyesini açar', () => {
    const twelve = deneme.resolveForPerson(base, '2026-09-09', {
        rol: 'ogrenci', class_id: '12', full_name: 'On İki',
    });
    const eleven = deneme.resolveForPerson(base, '2026-09-09', {
        role: 'ogrenci', class_id: '11', full_name: 'On Bir',
    });
    assert.equal(twelve.included, true);
    assert.equal(twelve.config.sabahGiris, '10:15');
    assert.equal(twelve.config.okulCikis, '13:15');
    assert.equal(twelve.config.denemeTekOturum, true);
    assert.equal(eleven.excluded, true);
    assert.equal(deneme.closedResult(eleven.config, eleven.rule, eleven.grade).durum, 'kapali');
});

test('etütsüz denemeye sınav bitmeden gelen öğrenci tam gün mevcut sayılır', () => {
    const resolved = deneme.resolveForPerson(base, '2026-09-09', {
        role: 'ogrenci', class_id: '12', full_name: 'On İki',
    });
    const result = deneme.computeSingleSession([
        { yon: 'giris', zaman: '2026-09-09T07:20:00.000Z' }, // 10:20 Istanbul
    ], resolved.config, new Date('2026-09-09T10:30:00.000Z'));
    assert.equal(result.durum, 'gec');
    assert.equal(result.agirlik, 0);
    assert.deepEqual(result.oturumlar, ['sabah', 'ogleden_sonra']);
});

test('etütsüz denemede sınav bitişine kadar giriş yoksa çıkış saatinde tam gün yok olur', () => {
    const resolved = deneme.resolveForPerson(base, '2026-09-09', {
        role: 'ogrenci', class_id: '12', full_name: 'On İki',
    });
    const result = deneme.computeSingleSession([], resolved.config, new Date('2026-09-09T07:20:00.000Z'));
    assert.equal(result.durum, 'beklemede');
    const afterExit = deneme.computeSingleSession([], resolved.config, new Date('2026-09-09T10:30:00.000Z'));
    assert.equal(afterExit.agirlik, 1);
});

test('Perşembe (2026-09-10) haftalık kapalı gün seçildiğinde kurum kapalı ve devamsızlık işlenmez', () => {
    const closedThursdayConfig = {
        ...base,
        closedDays: ['Perşembe', 'Pazar'],
        kapaliGunler: ['Perşembe', 'Pazar'],
    };
    assert.equal(deneme.institutionClosed(closedThursdayConfig, '2026-09-10'), true);
    const person = { rol: 'ogrenci', class_id: '12', full_name: 'Ali Veli' };
    const res = deneme.resolveForPerson(closedThursdayConfig, '2026-09-10', person);
    assert.equal(res.closed, true);
    assert.equal(res.excluded, true);
    assert.equal(res.attendanceEnabled, false);
    const cr = deneme.closedResult(res.config, res.rule, res.grade);
    assert.equal(cr.durum, 'kapali');
    assert.equal(cr.agirlik, 0);
});

test('tarih tatil günlerine (holidays/tatiller) eklendiğinde kurum kapalı sayılır', () => {
    const holidayConfig = {
        ...base,
        closedDays: ['Pazar'],
        tatiller: ['2026-09-10'],
    };
    assert.equal(deneme.institutionClosed(holidayConfig, '2026-09-10'), true);
    const res = deneme.resolveForPerson(holidayConfig, '2026-09-10', { role: 'ogrenci', class_id: '11' });
    assert.equal(res.closed, true);
    assert.equal(res.excluded, true);
    assert.equal(res.attendanceEnabled, false);
});


