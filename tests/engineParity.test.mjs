
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import * as esm from '../src/services/attendanceRules.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(here, '..');
const repoRoot = path.resolve(projectRoot, '..', '..', '..');
const require_ = createRequire(import.meta.url);

const BACKEND_COPIES = [
  path.join(repoRoot, 'ial-backend', 'attendanceRules.cjs'),
  path.join(repoRoot, 'IALMobil_Backend', 'attendanceRules.cjs')
];

test('backend kopyaları kaynakla senkron (build --check)', () => {
  const out = execFileSync('node', [path.join(projectRoot, 'scripts', 'build-backend-rules.cjs'), '--check'], {
    cwd: projectRoot, encoding: 'utf8'
  });
  assert.match(out, /güncel/);
});

for (const copyPath of BACKEND_COPIES) {
  const label = path.relative(repoRoot, copyPath);

  test(`${label} — dışa aktarımlar birebir aynı`, { skip: !existsSync(copyPath) }, () => {
    const cjs = require_(copyPath);
    const esmNames = Object.keys(esm).sort();
    const cjsNames = Object.keys(cjs).sort();
    assert.deepEqual(cjsNames, esmNames);
  });

  test(`${label} — giriş kararları birebir aynı`, { skip: !existsSync(copyPath) }, () => {
    const cjs = require_(copyPath);
    const configs = [
      {},
      { schoolExitHour: '15:00' },
      { schoolExitHour: '17:30', morningGraceMinutes: 5 },
      { morningEntryHour: '08:30', afternoonEntryHour: '12:45', lunchExitHour: '11:45' },
      { lateRequiresCounselorApproval: false },
      { autoAttendanceEnabled: false, autoLunchExitEnabled: false }
    ];

    for (const rawCfg of configs) {
      const a = esm.resolveAttendanceConfig(rawCfg);
      const b = cjs.resolveAttendanceConfig(rawCfg);
      assert.deepEqual(b, a, `resolveAttendanceConfig farklı: ${JSON.stringify(rawCfg)}`);

      for (let minutes = 0; minutes < 24 * 60; minutes += 7) {
        for (const manual of [false, true]) {
          for (const status of ['outside', 'entry']) {
            const da = esm.evaluateEntryAttempt({ minutes, config: a, isManualApproval: manual, currentStatus: status });
            const dbb = cjs.evaluateEntryAttempt({ minutes, config: b, isManualApproval: manual, currentStatus: status });
            assert.deepEqual(dbb, da,
              `evaluateEntryAttempt farklı @ ${esm.minutesToTime(minutes)} manual=${manual} status=${status}`);
          }
        }
      }
    }
  });

  test(`${label} — gün değerlendirmeleri birebir aynı`, { skip: !existsSync(copyPath) }, () => {
    const cjs = require_(copyPath);
    const cfgA = esm.resolveAttendanceConfig({});
    const cfgB = cjs.resolveAttendanceConfig({});

    const scanSets = [
      [],
      [{ time: '09:00', action: 'entry' }],
      [{ time: '09:25', action: 'entry', isLate: true }],
      [{ time: '13:05', action: 'entry' }],
      [{ time: '09:00', action: 'entry' }, { time: '12:05', action: 'exit' }],
      [{ time: '09:00', action: 'entry' }, { time: '12:10', action: 'exit', auto: true, autoKind: 'lunch_exit' }, { time: '13:02', action: 'entry' }]
    ];

    for (const raw of scanSets) {
      const scansA = raw.map(r => esm.normalizeScanRecord(r, cfgA));
      const scansB = raw.map(r => cjs.normalizeScanRecord(r, cfgB));
      assert.deepEqual(scansB, scansA, 'normalizeScanRecord farklı');

      for (let minutes = 0; minutes < 24 * 60; minutes += 11) {
        const ea = esm.evaluateStudentDay({ scans: scansA, nowMinutes: minutes, config: cfgA });
        const eb = cjs.evaluateStudentDay({ scans: scansB, nowMinutes: minutes, config: cfgB });
        assert.equal(eb.absenceWeight, ea.absenceWeight, `ağırlık farklı @ ${esm.minutesToTime(minutes)}`);
        assert.equal(eb.status, ea.status, `durum farklı @ ${esm.minutesToTime(minutes)}`);
        assert.deepEqual(eb.missingSessions, ea.missingSessions);
        assert.equal(eb.needsAutoLunchExit, ea.needsAutoLunchExit);
        assert.equal(eb.needsAutoSchoolExit, ea.needsAutoSchoolExit);

        const ra = esm.buildAutoAbsenceRecord({ config: cfgA, evaluation: ea, dateKey: '2026-08-25', studentId: 's1' });
        const rb = cjs.buildAutoAbsenceRecord({ config: cfgB, evaluation: eb, dateKey: '2026-08-25', studentId: 's1' });
        assert.deepEqual(rb, ra, `otomatik kayıt farklı @ ${esm.minutesToTime(minutes)}`);
      }
    }
  });
}
