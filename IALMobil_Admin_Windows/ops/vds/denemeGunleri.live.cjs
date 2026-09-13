/**
 * Tarihe ve sinif seviyesine ozel deneme gunu kurallari.
 *
 * Bu modul saf tutulur: veritabani sorgusu ve SMS/provider cagrisi yapmaz.
 * Yoklama motoru, rapor ve otomasyon ayni cozumleyiciyi kullanir.
 */

const SINIFLAR = ['9', '10', '11', '12'];
const ROLLER = ['ogrenci', 'ogretmen', 'personel', 'idare'];
const ROL_ESLEME = {
    student: 'ogrenci', ogrenci: 'ogrenci', 'öğrenci': 'ogrenci',
    teacher: 'ogretmen', ogretmen: 'ogretmen', 'öğretmen': 'ogretmen',
    personnel: 'personel', personel: 'personel', staff: 'personel',
    admin: 'idare', idare: 'idare', yonetici: 'idare', 'yönetici': 'idare',
};

const dakika = (value) => {
    const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || ''));
    if (!match) return null;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
    return hour * 60 + minute;
};

const saat = (value) => {
    if (!Number.isFinite(value)) return '--:--';
    const safe = Math.max(0, Math.min(1439, Math.round(value)));
    return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
};

const sayi = (value, fallback, min, max) => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, Math.round(parsed)));
};

const mantik = (value, fallback) => {
    if (value === undefined || value === null || value === '') return fallback;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    return !['false', '0', 'hayir', 'hayır', 'kapali', 'kapalı', 'off'].includes(String(value).toLowerCase());
};

const rol = (value) => ROL_ESLEME[String(value || '').toLocaleLowerCase('tr-TR').trim()] || null;
const rolListesi = (raw, fallback = []) => {
    const source = Array.isArray(raw) ? raw : fallback;
    return [...new Set(source.map(rol).filter((item) => ROLLER.includes(item)))];
};
const roller = (person) => [...new Set([
    person?.role, person?.rol, ...(Array.isArray(person?.roles) ? person.roles : []),
].map(rol).filter(Boolean))];
const eslesiyor = (izinli, person) => roller(person).some((item) => izinli.includes(item));

function normalizeHolidayRules(raw) {
    if (!Array.isArray(raw)) return [];
    const byDate = new Map();
    for (const item of raw) {
        if (!item || typeof item !== 'object') continue;
        const tarih = String(item.tarih || item.date || '').trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(tarih)) continue;
        const izinliRoller = rolListesi(item.izinliRoller || item.allowedRoles,
            ['ogretmen', 'personel', 'idare']);
        const yoklamaRolleri = rolListesi(item.yoklamaRolleri || item.attendanceRoles,
            izinliRoller).filter((itemRole) => izinliRoller.includes(itemRole));
        byDate.set(tarih, {
            tarih,
            ad: String(item.ad || item.name || 'Tatil / Kapalı Gün').trim().slice(0, 80) || 'Tatil / Kapalı Gün',
            izinliRoller,
            yoklamaRolleri,
            ogrenciSms: false,
            aktif: mantik(item.aktif ?? item.active, true),
        });
    }
    return [...byDate.values()].sort((a, b) => a.tarih.localeCompare(b.tarih));
}

function normalizeCustomRules(raw) {
    if (!Array.isArray(raw)) return [];
    const byDate = new Map();
    for (const item of raw) {
        if (!item || typeof item !== 'object') continue;
        const tarih = String(item.tarih || item.date || '').trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(tarih)) continue;
        const turRaw = String(item.tur || item.type || 'lessons_study').toLowerCase();
        const tur = ['lessons_study', 'study_only', 'custom'].includes(turRaw) ? turRaw : 'lessons_study';
        const sabah = dakika(item.sabahGiris ?? item.morningEntryHour ?? item.entryHour) ?? 540;
        const dersSayisi = sayi(item.dersSayisi ?? item.lessonCount, 4, 1, 12);
        const dersSuresiDk = sayi(item.dersSuresiDk ?? item.lessonMinutes, 40, 5, 240);
        const teneffusDk = sayi(item.teneffusDk ?? item.breakMinutes, 10, 0, 120);
        const hesaplananDersSonu = sabah + dersSayisi * dersSuresiDk + Math.max(0, dersSayisi - 1) * teneffusDk;
        const istenenDersSonu = dakika(item.ogleCikis ?? item.lessonEndHour ?? item.lunchExitHour);
        const dersSonu = Math.min(1439, Math.max(sabah + 1, istenenDersSonu ?? hesaplananDersSonu));
        const etutVar = tur !== 'study_only' && mantik(item.etutVar ?? item.studyEnabled, tur === 'lessons_study');
        const istenenEtut = dakika(item.etutGiris ?? item.studyEntryHour ?? item.afternoonEntryHour);
        const etutGiris = Math.min(1438, Math.max(dersSonu, istenenEtut ?? Math.min(1438, dersSonu + 30)));
        const istenenCikis = dakika(item.okulCikis ?? item.schoolExitHour ?? item.autoExitHour);
        const tekBaslangic = tur === 'study_only' ? (istenenEtut ?? sabah) : sabah;
        const asgariCikis = tur === 'study_only' ? tekBaslangic + 30 : (etutVar ? etutGiris + 30 : dersSonu);
        const varsayilanCikis = tur === 'study_only' ? tekBaslangic + 180
            : etutVar ? etutGiris + 150 : dersSonu + 15;
        const okulCikis = Math.min(1439, Math.max(asgariCikis, istenenCikis ?? varsayilanCikis));
        const gunBaslangici = dakika(item.gunBaslangici ?? item.dayStartHour) ?? Math.max(0, tekBaslangic - 120);
        const sinifSeviyeleri = [...new Set((item.sinifSeviyeleri || item.grades || SINIFLAR)
            .map((grade) => String(grade).replace(/\D/g, '')).filter((grade) => SINIFLAR.includes(grade)))]
            .sort((a, b) => Number(a) - Number(b));
        const izinliRoller = rolListesi(item.izinliRoller || item.allowedRoles, ROLLER);
        const yoklamaRolleri = rolListesi(item.yoklamaRolleri || item.attendanceRoles,
            izinliRoller).filter((itemRole) => izinliRoller.includes(itemRole));

        byDate.set(tarih, {
            tarih,
            ad: String(item.ad || item.name || (tur === 'study_only' ? 'Etüt Programı' : '4 Ders + Etüt')).trim().slice(0, 80),
            tur, sinifSeviyeleri, izinliRoller, yoklamaRolleri,
            gunBaslangici: saat(gunBaslangici),
            sabahGiris: saat(tekBaslangic),
            sabahMusaadeDk: sayi(item.sabahMusaadeDk ?? item.morningGraceMinutes, 15, 0, 240),
            dersSayisi, dersSuresiDk, teneffusDk,
            ogleCikis: saat(tur === 'study_only' ? okulCikis : dersSonu),
            etutVar,
            etutGiris: saat(tur === 'study_only' ? tekBaslangic : etutGiris),
            etutMusaadeDk: sayi(item.etutMusaadeDk ?? item.studyGraceMinutes, 15, 0, 240),
            okulCikis: saat(okulCikis),
            gunSonu: saat(Math.min(1439, okulCikis + 60)),
            oglenOtomatikCikis: mantik(item.oglenOtomatikCikis ?? item.autoLunchExitEnabled, false),
            gunSonuOtomatikCikis: mantik(item.gunSonuOtomatikCikis ?? item.autoSchoolExitEnabled, true),
            ogrenciSms: mantik(item.ogrenciSms ?? item.studentSmsEnabled, false),
            aktif: mantik(item.aktif ?? item.active, true),
        });
    }
    return [...byDate.values()].sort((a, b) => a.tarih.localeCompare(b.tarih));
}

function normalizeRules(raw) {
    if (!Array.isArray(raw)) return [];
    const byDate = new Map();
    for (const item of raw) {
        if (!item || typeof item !== 'object') continue;
        const tarih = String(item.tarih || item.date || '').trim();
        if (!/^\d{4}-\d{2}-\d{2}$/.test(tarih)) continue;

        const baslangic = dakika(item.baslangicSaati ?? item.entryHour) ?? 615;
        const sure = sayi(item.sinavSuresiDk ?? item.durationMinutes, 165, 30, 600);
        const bitis = Math.min(1439, baslangic + sure);
        const istenenCikis = dakika(item.otomatikCikisSaati ?? item.autoExitHour);
        const otomatikCikis = Math.max(bitis, istenenCikis === null ? Math.min(1439, bitis + 15) : istenenCikis);
        const etutVar = mantik(item.etutVar ?? item.studyEnabled, false);
        const istenenEtutGiris = dakika(item.etutGirisSaati ?? item.studyEntryHour);
        const etutGiris = Math.max(otomatikCikis,
            istenenEtutGiris === null ? Math.min(1439, otomatikCikis + 15) : istenenEtutGiris);
        const istenenEtutCikis = dakika(item.etutCikisSaati ?? item.studyExitHour);
        const etutCikis = Math.min(1439, Math.max(etutGiris + 1,
            istenenEtutCikis === null ? Math.min(1439, etutGiris + 150) : istenenEtutCikis));
        const sinifSeviyeleri = [...new Set((item.sinifSeviyeleri || item.grades || [])
            .map((grade) => String(grade).replace(/\D/g, ''))
            .filter((grade) => SINIFLAR.includes(grade)))]
            .sort((a, b) => Number(a) - Number(b));

        byDate.set(tarih, {
            tarih,
            ad: String(item.ad || item.name || 'Deneme Sınavı').trim().slice(0, 80) || 'Deneme Sınavı',
            sinifSeviyeleri,
            baslangicSaati: saat(baslangic),
            gecMusaadeDk: sayi(item.gecMusaadeDk ?? item.graceMinutes, 0, 0, 240),
            sinavSuresiDk: sure,
            sinavBitisSaati: saat(bitis),
            otomatikCikisSaati: saat(otomatikCikis),
            etutVar,
            etutGirisSaati: saat(etutGiris),
            etutMusaadeDk: sayi(item.etutMusaadeDk ?? item.studyGraceMinutes, 0, 0, 240),
            etutCikisSaati: saat(etutCikis),
            aktif: mantik(item.aktif ?? item.active, true),
        });
    }
    return [...byDate.values()].sort((a, b) => a.tarih.localeCompare(b.tarih));
}

function ruleFor(config, date) {
    return normalizeRules(config?.denemeGunleri || config?.examDays)
        .find((rule) => rule.aktif && rule.tarih === String(date)) || null;
}

function holidayRuleFor(config, date) {
    return normalizeHolidayRules(config?.tatilKurallari || config?.specialDays || config?.ozelGunler)
        .find((rule) => rule.aktif && rule.tarih === String(date)) || null;
}

function customRuleFor(config, date) {
    return normalizeCustomRules(config?.ozelProgramlar || config?.customSchedules || config?.dayPrograms)
        .find((rule) => rule.aktif && rule.tarih === String(date)) || null;
}

function weekdayName(date) {
    const parsed = new Date(`${String(date)}T12:00:00Z`);
    if (Number.isNaN(parsed.getTime())) return '';
    return new Intl.DateTimeFormat('tr-TR', { weekday: 'long', timeZone: 'UTC' }).format(parsed)
        .toLocaleLowerCase('tr-TR');
}

const normalizeDayName = (s) => String(s || '')
    .trim()
    .replace(/ı/g, 'i').replace(/İ/g, 'i')
    .replace(/ş/g, 's').replace(/Ş/g, 's')
    .replace(/ç/g, 'c').replace(/Ç/g, 'c')
    .replace(/ğ/g, 'g').replace(/Ğ/g, 'g')
    .replace(/ü/g, 'u').replace(/Ü/g, 'u')
    .replace(/ö/g, 'o').replace(/Ö/g, 'o')
    .toLowerCase();

function institutionClosed(config, date) {
    const key = String(date || '');
    const weekly = [
        ...(Array.isArray(config?.kapaliGunler) ? config.kapaliGunler : []),
        ...(Array.isArray(config?.closedDays) ? config.closedDays : []),
    ];
    const holidays = [
        ...(Array.isArray(config?.tatiller) ? config.tatiller : []),
        ...(Array.isArray(config?.holidays) ? config.holidays : []),
    ];
    const dayName = weekdayName(key);
    const dayNorm = normalizeDayName(dayName);
    return Boolean(holidayRuleFor(config, key))
        || holidays.includes(key)
        || weekly.some((day) => {
            const dNorm = normalizeDayName(day);
            return dNorm === dayNorm || String(day).toLocaleLowerCase('tr-TR') === dayName;
        });
}

function student(person) {
    return roller(person).includes('ogrenci');
}

function gradeOf(person) {
    const direct = String(person?.class_id || person?.sinif_seviyesi || '').replace(/\D/g, '');
    if (SINIFLAR.includes(direct)) return direct;
    const text = String(person?.class_info || person?.branch || person?.sinif || '');
    const match = text.match(/(?:^|\D)(9|10|11|12)(?:\D|$)/);
    return match ? match[1] : '';
}

function resolveForPerson(baseConfig, date, person) {
    const key = String(date || '');
    const rule = ruleFor(baseConfig, key);
    const holidayRule = holidayRuleFor(baseConfig, key);
    const customRule = customRuleFor(baseConfig, key);
    const closed = institutionClosed(baseConfig, key);
    const ogrenci = student(person);
    const grade = ogrenci ? gradeOf(person) : '';

    const examIncluded = Boolean(rule && (!ogrenci || rule.sinifSeviyeleri.includes(grade)));
    const customIncluded = Boolean(customRule
        && (!ogrenci || customRule.sinifSeviyeleri.includes(grade))
        && eslesiyor(customRule.izinliRoller, person));
    const holidayAllowed = Boolean(holidayRule && eslesiyor(holidayRule.izinliRoller, person));

    let transitionAllowed;
    let attendanceEnabled;
    if (rule) {
        transitionAllowed = examIncluded || !closed;
        attendanceEnabled = examIncluded;
    } else if (customRule) {
        transitionAllowed = customIncluded;
        attendanceEnabled = customIncluded && eslesiyor(customRule.yoklamaRolleri, person);
    } else if (holidayRule) {
        transitionAllowed = holidayAllowed;
        attendanceEnabled = holidayAllowed && eslesiyor(holidayRule.yoklamaRolleri, person);
    } else {
        transitionAllowed = !closed;
        attendanceEnabled = !closed;
    }

    const smsAllowed = !ogrenci || Boolean(
        !holidayRule
        && (customRule ? customIncluded && customRule.ogrenciSms : !closed)
    );

    // --- Kurs Merkezi Vardiya & Ozel Vakit Cozumlemesi ---
    const kisiId = person?.kisi_id ? String(person.kisi_id) : (person?.id ? String(person.id).replace(/^usr_/, '') : null);
    const shifts = baseConfig?.shifts || {};
    const studentSchedules = baseConfig?.studentSchedules || {};
    const ozelVakit = (kisiId && studentSchedules[kisiId]) || person?.vakit || null;

    let vardiyaGiris = baseConfig.sabahGiris;
    let vardiyaMusaadeDk = baseConfig.sabahMusaadeDk;
    let vardiyaOgleCikis = baseConfig.ogleCikis;
    let vardiyaOgleMusaadeDk = baseConfig.ogleCikisMusaadeDk;
    let vardiyaOgledenSonraGiris = baseConfig.ogledenSonraGiris;
    let vardiyaOgledenSonraMusaadeDk = baseConfig.ogledenSonraMusaadeDk;
    let vardiyaOkulCikis = baseConfig.okulCikis;
    let vardiyaKesilme = baseConfig.staffAbsenceCutoffHour || baseConfig.okulCikis;
    let vardiyaTuru = 'sabah';
    let vardiyaAdi = 'Sabah Grubu';

    if (ogrenci) {
        if (ozelVakit && ozelVakit.bireysel_aktif && ozelVakit.ozel_giris) {
            vardiyaGiris = ozelVakit.ozel_giris;
            vardiyaMusaadeDk = ozelVakit.ozel_tolerans_dk != null ? Number(ozelVakit.ozel_tolerans_dk) : 15;
            vardiyaOkulCikis = ozelVakit.ozel_cikis || baseConfig.okulCikis;
            vardiyaOgleCikis = ozelVakit.ozel_mola_baslangic || baseConfig.ogleCikis;
            vardiyaOgledenSonraGiris = ozelVakit.ozel_mola_bitis || baseConfig.ogledenSonraGiris;
            vardiyaKesilme = ozelVakit.ozel_kesilme_saati || vardiyaOkulCikis;
            vardiyaTuru = 'bireysel';
            vardiyaAdi = 'Bireysel Özel Saat';
        } else {
            const vid = (ozelVakit && ozelVakit.vardiya_id) || person?.vardiya_id || 'sabah';
            const sh = shifts[vid] || shifts['sabah'];
            if (sh) {
                vardiyaGiris = sh.sabah_giris || vardiyaGiris;
                vardiyaMusaadeDk = sh.sabah_musaade_dk != null ? Number(sh.sabah_musaade_dk) : vardiyaMusaadeDk;
                vardiyaOgleCikis = sh.ogle_cikis || vardiyaOgleCikis;
                vardiyaOgleMusaadeDk = sh.ogle_musaade_dk != null ? Number(sh.ogle_musaade_dk) : vardiyaOgleMusaadeDk;
                vardiyaOgledenSonraGiris = sh.ogleden_sonra_giris || sh.ogledenSonra_giris || vardiyaOgledenSonraGiris;
                vardiyaOgledenSonraMusaadeDk = sh.ogleden_sonra_musaade_dk != null ? Number(sh.ogleden_sonra_musaade_dk) : vardiyaOgledenSonraMusaadeDk;
                vardiyaOkulCikis = sh.okul_cikis || vardiyaOkulCikis;
                vardiyaKesilme = sh.kesilme_saati || vardiyaOkulCikis;
                vardiyaTuru = sh.id || vid;
                vardiyaAdi = sh.ad || (vid === 'aksam' ? 'Akşam Grubu' : 'Sabah Grubu');
            }
        }
    }
    const ortakConfig = {
        ...baseConfig,
        sabahGiris: vardiyaGiris,
        sabahMusaadeDk: vardiyaMusaadeDk,
        ogleCikis: vardiyaOgleCikis,
        ogleCikisMusaadeDk: vardiyaOgleMusaadeDk,
        ogledenSonraGiris: vardiyaOgledenSonraGiris,
        ogledenSonraMusaadeDk: vardiyaOgledenSonraMusaadeDk,
        okulCikis: vardiyaOkulCikis,
        kesilmeSaati: vardiyaKesilme,
        vardiyaTuru,
        vardiyaAdi,
        kapaliGunEngelle: closed && transitionAllowed ? false : baseConfig.kapaliGunEngelle,
        tatilGunu: closed,
        tatilKural: holidayRule,
        ozelProgram: customRule,
        ozelGunRol: roller(person),
        ogrenciSmsKapali: ogrenci && !smsAllowed,
        yoklamaKapali: !attendanceEnabled,
    };

    if (!rule && !customRule) {
        return {
            config: ortakConfig, rule: null, holidayRule, customRule: null, grade,
            included: attendanceEnabled, excluded: !attendanceEnabled,
            transitionAllowed, transitionDenied: !transitionAllowed,
            attendanceEnabled, smsAllowed, closed,
        };
    }

    if (!rule && customRule) {
        if (!customIncluded || !attendanceEnabled) {
            return {
                config: ortakConfig, rule: null, holidayRule, customRule, grade,
                included: false, excluded: true,
                transitionAllowed, transitionDenied: !transitionAllowed,
                attendanceEnabled: false, smsAllowed, closed,
            };
        }

        if (customRule.tur === 'study_only' || !customRule.etutVar) {
            const singleRule = {
                ad: customRule.ad,
                baslangicSaati: customRule.sabahGiris,
                gecMusaadeDk: customRule.etutMusaadeDk,
                sinavBitisSaati: customRule.okulCikis,
                otomatikCikisSaati: customRule.okulCikis,
            };
            return {
                rule: null, holidayRule, customRule, grade,
                included: true, excluded: false, transitionAllowed: true, transitionDenied: false,
                attendanceEnabled: true, smsAllowed, closed,
                config: {
                    ...ortakConfig,
                    gunBaslangici: customRule.gunBaslangici,
                    sabahGiris: customRule.sabahGiris,
                    sabahMusaadeDk: customRule.etutMusaadeDk,
                    sabahSonGirisSaati: customRule.okulCikis,
                    ogleCikis: customRule.okulCikis,
                    yarimGunSiniri: customRule.okulCikis,
                    ogledenSonraGiris: customRule.okulCikis,
                    okulCikis: customRule.okulCikis,
                    gunSonu: customRule.gunSonu,
                    denemeGunu: false,
                    denemeTekOturum: true,
                    denemeKural: singleRule,
                    autoLunchExitEnabled: false,
                    autoSchoolExitEnabled: customRule.gunSonuOtomatikCikis,
                    kapaliGunEngelle: false,
                    yoklamaKapali: false,
                },
            };
        }

        return {
            rule: null, holidayRule, customRule, grade,
            included: true, excluded: false, transitionAllowed: true, transitionDenied: false,
            attendanceEnabled: true, smsAllowed, closed,
            config: {
                ...ortakConfig,
                gunBaslangici: customRule.gunBaslangici,
                sabahGiris: customRule.sabahGiris,
                sabahMusaadeDk: customRule.sabahMusaadeDk,
                sabahSonGirisSaati: customRule.ogleCikis,
                ogleCikis: customRule.ogleCikis,
                yarimGunSiniri: customRule.etutGiris,
                ogledenSonraGiris: customRule.etutGiris,
                ogledenSonraMusaadeDk: customRule.etutMusaadeDk,
                ogledenSonraSonGirisSaati: customRule.okulCikis,
                okulCikis: customRule.okulCikis,
                gunSonu: customRule.gunSonu,
                dersSuresiDk: customRule.dersSuresiDk,
                teneffusDk: customRule.teneffusDk,
                denemeGunu: false,
                autoLunchExitEnabled: customRule.oglenOtomatikCikis,
                autoSchoolExitEnabled: customRule.gunSonuOtomatikCikis,
                kapaliGunEngelle: false,
                yoklamaKapali: false,
            },
        };
    }

    /* Deneme gununde ogretmen/idare/personel de ogrencilerle AYNI saatlere
       tabidir: sinav 10:15'te basliyorsa 09:00'a gore gec yazilmaz. Sinif
       seviyesi filtresi yalnizca ogrenciler icin anlamlidir. */
    const included = examIncluded;
    if (!included) {
        return {
            config: {
                ...ortakConfig, denemeGunu: true, denemeKural: rule,
                denemeSinifSeviyesi: grade, yoklamaKapali: true,
            },
            rule, holidayRule, customRule, grade, included: false, excluded: true,
            transitionAllowed, transitionDenied: !transitionAllowed,
            attendanceEnabled: false, smsAllowed, closed,
        };
    }

    const sinavBitis = dakika(rule.sinavBitisSaati);
    const otomatikCikis = dakika(rule.otomatikCikisSaati);
    const etutGiris = dakika(rule.etutGirisSaati);
    const etutCikis = dakika(rule.etutCikisSaati);
    const okulCikis = rule.etutVar ? etutCikis : otomatikCikis;

    return {
        rule,
        holidayRule,
        customRule,
        grade,
        included: true,
        excluded: false,
        transitionAllowed: true,
        transitionDenied: false,
        attendanceEnabled: true,
        smsAllowed,
        closed,
        config: {
            ...ortakConfig,
            sabahGiris: rule.baslangicSaati,
            sabahMusaadeDk: rule.gecMusaadeDk,
            sabahSonGirisSaati: rule.sinavBitisSaati,
            ogleCikis: rule.sinavBitisSaati,
            ogleCikisMusaadeDk: Math.max(0, otomatikCikis - sinavBitis),
            yarimGunSiniri: rule.etutVar ? rule.etutGirisSaati : rule.otomatikCikisSaati,
            ogledenSonraGiris: rule.etutVar ? rule.etutGirisSaati : rule.otomatikCikisSaati,
            ogledenSonraMusaadeDk: rule.etutVar ? rule.etutMusaadeDk : 0,
            ogledenSonraSonGirisSaati: rule.etutVar ? rule.etutCikisSaati : rule.otomatikCikisSaati,
            okulCikis: saat(okulCikis),
            gunSonu: saat(okulCikis),
            gecGirisEngelle: false,
            gecGirisOnayIster: false,
            gecGirisRehberlikUyar: false,
            autoLunchExitEnabled: true,
            autoSchoolExitEnabled: Boolean(rule.etutVar),
            denemeGunu: true,
            denemeTekOturum: !rule.etutVar,
            denemeKural: rule,
            denemeSinifSeviyesi: grade,
            yoklamaKapali: false,
            kapaliGunEngelle: false,
        },
    };
}

function minuteInZone(value, timeZone) {
    const date = value instanceof Date ? value : new Date(value);
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: timeZone || 'Europe/Istanbul', hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(date);
    return Number(parts.find((part) => part.type === 'hour')?.value || 0) * 60
        + Number(parts.find((part) => part.type === 'minute')?.value || 0);
}

const emptySessions = (rule, config = {}) => ({
    sabah: { giris: null, gec: false, gecikme: 0, kazandi: false,
             sonGiris: rule?.sinavBitisSaati || config.ogleCikis || null },
    ogleden_sonra: { giris: null, gec: false, gecikme: 0, kazandi: false,
                     sonGiris: rule?.otomatikCikisSaati || config.okulCikis || null },
});

function closedResult(config, rule, grade) {
    const special = config?.tatilKural;
    const program = config?.ozelProgram;
    const sebep = special
        ? `${special.ad} — bu rol için yoklama kapalı`
        : program
            ? `${program.ad} kapsamında bu rol/sınıf için yoklama kapalı`
            : rule
                ? `${grade || 'Bu'} sınıf seviyesi ${rule.ad} kapsamında değil — yoklama işlenmez`
                : 'Kurum bu tarihte kapalı — yoklama işlenmez';
    return {
        durum: 'kapali', agirlik: 0, oturumlar: [], bekleyen: [], gec: false,
        iceride: false, oturumBilgi: emptySessions(rule, config), denemeGunu: Boolean(rule),
        yoklamaKapali: true, denemeKural: rule,
        tatilKural: special || null, ozelProgram: program || null, sebep,
    };
}

/** Etutsuz denemede tek fiziksel giris tam gun mevcudiyet sayilir. */
function computeSingleSession(passages, config, now = null) {
    const rule = config.denemeKural;
    const start = dakika(rule.baslangicSaati);
    const graceEnd = start + rule.gecMusaadeDk;
    const lastEntry = dakika(rule.sinavBitisSaati);
    const finalizeAt = dakika(rule.otomatikCikisSaati);
    const scans = (passages || []).map((row) => ({ ...row, dk: minuteInZone(row.zaman, config.saatDilimi) }));
    const firstEntry = scans.find((row) => row.yon === 'giris' && row.dk <= lastEntry) || null;
    const firstMinute = firstEntry?.dk ?? null;
    const late = firstMinute !== null && firstMinute > graceEnd;
    const inside = scans.length > 0 && scans[scans.length - 1].yon === 'giris';
    const currentMinute = now ? minuteInZone(now, config.saatDilimi) : null;
    const finalized = currentMinute === null || currentMinute >= finalizeAt;
    const present = Boolean(firstEntry);
    const weight = !present && finalized ? 1 : 0;
    const info = emptySessions(rule);

    if (present) {
        info.sabah = {
            giris: saat(firstMinute), gec: late, gecikme: late ? firstMinute - start : 0,
            kazandi: true, sonGiris: rule.sinavBitisSaati,
        };
        // Etut yoksa sinava katilim iki yarim gun yerine tam gun sayilir.
        info.ogleden_sonra = {
            giris: null, gec: false, gecikme: 0, kazandi: true,
            sonGiris: rule.otomatikCikisSaati,
        };
    }

    return {
        durum: present ? (late ? 'gec' : 'var') : (finalized ? 'yok' : 'beklemede'),
        agirlik: weight,
        oturumlar: present ? ['sabah', 'ogleden_sonra'] : [],
        bekleyen: !present && !finalized ? ['sabah'] : [],
        gec: late,
        iceride: inside,
        oturumBilgi: info,
        dakikalar: { sabah: 0, ogleden_sonra: 0 },
        ilkler: { sabah: firstMinute === null ? null : saat(firstMinute), ogleden_sonra: null },
        sinirlar: { sabah: rule.sinavBitisSaati, ogleden_sonra: rule.otomatikCikisSaati },
        gecKalan: late ? ['sabah'] : [],
        denemeGunu: true,
        denemeTekOturum: true,
        denemeKural: rule,
        sebep: present
            ? `${rule.ad} katılımı${late ? ` — ${saat(firstMinute)} giriş, ${firstMinute - start} dk geç` : ''}; etüt yok, tam gün mevcut`
            : finalized ? `${rule.ad} için ${rule.otomatikCikisSaati} saatine kadar giriş yapılmadı`
                : `${rule.ad} girişi bekleniyor — başlangıç ${rule.baslangicSaati}`,
    };
}

module.exports = {
    normalizeRules,
    normalizeHolidayRules,
    normalizeCustomRules,
    ruleFor,
    holidayRuleFor,
    customRuleFor,
    institutionClosed,
    gradeOf,
    resolveForPerson,
    closedResult,
    computeSingleSession,
    dakika,
    saat,
};
