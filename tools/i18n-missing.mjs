// Lista las claves usadas en el código que aún no están en lang/en.js o lang/he.js.
// Uso: node tools/i18n-missing.mjs [archivos…]
import fs from 'node:fs';
import en from '../lang/en.js';
import he from '../lang/he.js';
import { usedKeys, FILES } from './i18n-scan.mjs';

const files = process.argv.length > 2 ? process.argv.slice(2) : FILES;
for (const f of files.filter((x) => fs.existsSync(x))) {
  for (const k of usedKeys(fs.readFileSync(f, 'utf8'))) {
    const miss = [en[k] === undefined && 'en', he[k] === undefined && 'he'].filter(Boolean);
    if (miss.length) console.log(`${f}\t${miss.join('+')}\t${JSON.stringify(k)}`);
  }
}
