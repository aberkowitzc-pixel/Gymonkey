// Idiomas de la app: español (base), inglés y hebreo (de derecha a izquierda).
// Los textos se escriben en español y ese texto es la clave: t('Guardar'). Si falta la traducción, se ve el español.
import en from './lang/en.js';
import he from './lang/he.js';
import { EXERCISES } from './lang/exercises.js';

export const LANGS = { es: 'Español', en: 'English', he: 'עברית' };
const DICTS = { es: null, en, he };
let lang = 'es';
export const missing = new Set();   // claves sin traducir que se han mostrado (para depurar)

export const getLang = () => lang;
export const isRTL = () => lang === 'he';

/** Idioma inicial según el del navegador. */
export function detectLang(nav = typeof navigator !== 'undefined' ? navigator.language : 'es') {
  const l = String(nav || 'es').toLowerCase();
  if (l.startsWith('he') || l.startsWith('iw')) return 'he';
  if (l.startsWith('en')) return 'en';
  return 'es';
}

/** Cambia el idioma y la dirección del documento (derecha a izquierda en hebreo). */
export function setLang(l) {
  lang = LANGS[l] ? l : 'es';
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang;
    document.documentElement.dir = isRTL() ? 'rtl' : 'ltr';
  }
}

/** Traduce un texto. Los marcadores {nombre} se sustituyen por los valores de `params` (hay que escapar antes lo que no sea de fiar). */
export function t(key, params) {
  const d = DICTS[lang];
  let s = key;
  if (d) {
    if (d[key] !== undefined) s = d[key];
    else if (typeof key === 'string' && /[a-záéíóúñ]/i.test(key)) missing.add(key);
  }
  return params ? s.replace(/\{(\w+)\}/g, (m, k) => (k in params ? params[k] : m)) : s;
}

/** Marca un texto fijo (listas, tablas) para que se traduzca: no cambia nada al declararlo; se muestra con t(). */
export const T = (s) => s;

/** Traduce un dato guardado que puede ser de la app (p. ej. una rutina de ejemplo) o escrito por la persona; si no hay traducción, se deja tal cual. */
export function tData(s) {
  const d = DICTS[lang];
  return d && d[s] !== undefined ? d[s] : s;
}

/** Marca el nombre de un ejercicio de la biblioteca (se traduce con exLabel y está en lang/exercises.js). */
export const E = (s) => s;

/** Singular o plural según n; ambos textos llevan {n}. */
export const tn = (n, one, other, params = {}) => t(n === 1 ? one : other, { n, ...params });

/** Configuración regional para fechas y números (calendario gregoriano también en hebreo). */
export const locale = () => ({ es: 'es', en: 'en', he: 'he-IL-u-ca-gregory' }[lang]);
export const fmtNum = (n, opts) => Number(n).toLocaleString(locale(), opts);
export const fmtDateShort = (ts) => new Date(ts).toLocaleDateString(locale(), { weekday: 'short', day: 'numeric', month: 'short' });
export const fmtTime = (ts) => new Date(ts).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });

/** Flecha que apunta "hacia delante" en el sentido de lectura. */
export const fwd = () => (isRTL() ? '←' : '→');

/* ---------- días y músculos (el nombre guardado es siempre el español) ---------- */
const LETTERS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
export const dayLetter = (idx) => t(LETTERS[idx]);
export const dayShort = (weekdayEs) => t(weekdayEs.slice(0, 3).toLowerCase());

/* ---------- ejercicios ---------- */
const strip = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\u0590-\u05ff]+/g, ' ').trim();
const BY_NAME = new Map();
EXERCISES.forEach((row) => row.forEach((name) => { const k = strip(name); if (!BY_NAME.has(k)) BY_NAME.set(k, row); }));

/** Nombre en español de un ejercicio conocido, escrito en cualquiera de los tres idiomas; si no se conoce, el mismo nombre. */
export const canonicalExercise = (name) => BY_NAME.get(strip(name))?.[0] || String(name || '').trim();

/** Nombre para mostrar en el idioma elegido (los ejercicios propios se muestran tal cual). */
export function exLabel(name) {
  const row = BY_NAME.get(strip(name));
  if (!row || lang === 'es') return name;
  return lang === 'he' ? row[2] : row[1];
}
