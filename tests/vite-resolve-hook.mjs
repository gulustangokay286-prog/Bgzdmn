/**
 * Node ESM çözümleyicisine Vite uyumluluğu kazandırır.
 * Kaynak dosyalar `./firebaseConfig` gibi uzantısız içe aktarım kullanır
 * (Vite bunu destekler, Node desteklemez). Bu kanca eksik `.js` / `.jsx`
 * uzantısını tamamlar; böylece testler kaynağı DEĞİŞTİRMEDEN çalışır.
 */
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const EXTENSIONS = ['.js', '.mjs', '.jsx', '/index.js'];

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    if (!specifier.startsWith('.') && !specifier.startsWith('/')) throw err;

    const parentUrl = context.parentURL || import.meta.url;
    for (const ext of EXTENSIONS) {
      const candidate = new URL(specifier + ext, parentUrl);
      if (existsSync(fileURLToPath(candidate))) {
        return { url: candidate.href, shortCircuit: true, format: 'module' };
      }
    }
    throw err;
  }
}
