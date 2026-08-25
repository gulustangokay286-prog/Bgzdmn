#!/usr/bin/env node
/**
 * Kural motorunun (ESM) CommonJS kopyasını üretir.
 *
 *   src/services/attendanceRules.js   ->   ial-backend/attendanceRules.cjs
 *
 * Amaç: mobil web, Admin Windows ve VDS backend'inin BİREBİR aynı kuralları
 * çalıştırdığından emin olmak. Motor elle iki yerde tutulmaz; tek kaynaktan
 * üretilir. `--check` ile üretilen dosyanın güncel olup olmadığı doğrulanır.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src', 'services', 'attendanceRules.js');
const REPO = path.resolve(ROOT, '..', '..', '..');
const OUTPUTS = [
  path.join(REPO, 'ial-backend', 'attendanceRules.cjs'),
  path.join(REPO, 'IALMobil_Backend', 'attendanceRules.cjs')
];

function build() {
  const source = fs.readFileSync(SRC, 'utf8');

  if (/^\s*import\s/m.test(source)) {
    throw new Error('attendanceRules.js bağımsız olmalı: `import` ifadesi bulundu.');
  }
  if (/export\s+default/.test(source)) {
    throw new Error('attendanceRules.js `export default` kullanmamalı.');
  }

  // `export const X` / `export function X` -> yerel tanım + dışa aktarım listesi
  const names = [];
  const body = source.replace(/^export\s+(const|let|function)\s+([A-Za-z0-9_$]+)/gm, (_m, kind, name) => {
    names.push(name);
    return `${kind} ${name}`;
  });

  if (!names.length) throw new Error('Dışa aktarılan hiçbir tanım bulunamadı.');

  const header = [
    '/* ------------------------------------------------------------------------',
    ' *  OTOMATİK ÜRETİLMİŞ DOSYA — ELLE DÜZENLEMEYİN.',
    ' *',
    ' *  Kaynak: IALMobil_Admin_Windows/src/services/attendanceRules.js',
    ' *  Üretim: node scripts/build-backend-rules.cjs',
    ' *',
    ' *  Bu dosya, mobil web ve Admin Windows ile BİREBİR aynı yoklama kurallarını',
    ' *  VDS backend tarafında çalıştırır.',
    ' * ---------------------------------------------------------------------- */',
    ''
  ].join('\n');

  const footer = '\nmodule.exports = {\n' + names.map(n => `  ${n}`).join(',\n') + '\n};\n';

  return header + body.replace(/\s*$/, '\n') + footer;
}

const generated = build();

if (process.argv.includes('--check')) {
  let stale = false;
  for (const out of OUTPUTS) {
    const existing = fs.existsSync(out) ? fs.readFileSync(out, 'utf8') : '';
    if (existing !== generated) {
      console.error(`✖ Güncel değil: ${out}`);
      stale = true;
    }
  }
  if (stale) {
    console.error('  Çalıştırın: node scripts/build-backend-rules.cjs');
    process.exit(1);
  }
  console.log(`✓ Backend kural motoru kopyaları güncel (${OUTPUTS.length} hedef).`);
  process.exit(0);
}

for (const out of OUTPUTS) {
  if (!fs.existsSync(path.dirname(out))) {
    console.warn(`• Atlandı (dizin yok): ${out}`);
    continue;
  }
  fs.writeFileSync(out, generated, 'utf8');
  console.log(`✓ Üretildi: ${out}`);
}
