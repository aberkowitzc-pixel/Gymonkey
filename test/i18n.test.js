import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import en from '../lang/en.js';
import he from '../lang/he.js';
import { t, tn, setLang, detectLang, canonicalExercise, exLabel, tData, getLang } from '../i18n.js';
import { sm, phaseText, languageNote } from '../lib/i18n.js';
import { scanFiles, usedKeys, FILES } from '../tools/i18n-scan.mjs';

const keys = new Set();
const exKeys = new Set();
for (const f of FILES.filter((x) => fs.existsSync(x))) usedKeys(fs.readFileSync(f, 'utf8'), exKeys).forEach((k) => keys.add(k));
const holes = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);

test('no queda ningún texto visible sin pasar por t()', () => {
  const left = scanFiles();
  assert.deepEqual(left.map((f) => `${f.file}:${f.line} ${f.text}`), []);
});

test('todo texto usado tiene traducción al inglés y al hebreo', () => {
  const miss = [...keys].filter((k) => en[k] === undefined || he[k] === undefined);
  assert.deepEqual(miss, []);
});

test('las traducciones conservan los marcadores {…}', () => {
  for (const k of keys) {
    // La traducción no puede inventar marcadores (el singular puede omitir {n}: "un set").
    for (const [name, d] of [['en', en], ['he', he]]) {
      assert.deepEqual(holes(d[k] ?? k).filter((h) => !holes(k).includes(h)), [], `${name}: ${k}`);
    }
  }
});

test('los ejercicios de ejemplo tienen nombre en inglés y hebreo', () => {
  setLang('en');
  for (const k of exKeys) assert.notEqual(exLabel(k), k, k);
  setLang('he');
  for (const k of exKeys) assert.notEqual(exLabel(k), k, k);
  setLang('es');
});

test('t(), tn() y el idioma por defecto', () => {
  setLang('es');
  assert.equal(t('Guardar'), 'Guardar');
  setLang('en');
  assert.equal(t('Guardar'), 'Save');
  assert.equal(tn(1, '{n} serie', '{n} series'), '1 set');
  assert.equal(tn(3, '{n} serie', '{n} series'), '3 sets');
  setLang('he');
  assert.equal(t('Guardar'), 'שמירה');
  assert.equal(t('texto que no existe'), 'texto que no existe');
  setLang('xx');
  assert.equal(getLang(), 'es');
  assert.equal(detectLang('he-IL'), 'he');
  assert.equal(detectLang('en-GB'), 'en');
  assert.equal(detectLang('fr'), 'es');
});

test('un ejercicio escrito en cualquier idioma se reconoce como su nombre en español', () => {
  assert.equal(canonicalExercise('Bench press'), 'Press de banca');
  assert.equal(canonicalExercise('סקוואט'), 'Sentadilla');
  assert.equal(canonicalExercise('Mi ejercicio raro'), 'Mi ejercicio raro');
  setLang('en');
  assert.equal(tData('Empuje (Push)'), 'Push');
  assert.equal(tData('Rutina mía'), 'Rutina mía');
  setLang('es');
});

test('servidor: mensajes, fases y nota de idioma', () => {
  assert.equal(sm('en', 'Modo no válido.'), 'Invalid mode.');
  assert.equal(sm('es', 'Modo no válido.'), 'Modo no válido.');
  assert.match(sm('he', 'El texto es demasiado largo (máximo {max} caracteres). Resume lo más importante.', { max: 40000 }), /40/);
  assert.equal(phaseText('en', 'Diseñando el mesociclo 2: Fuerza'), 'Designing mesocycle 2: Fuerza');
  assert.equal(phaseText('es', 'Ordenando tus series…'), 'Ordenando tus series…');
  assert.equal(languageNote('es'), '');
  assert.match(languageNote('he'), /Hebrew/);
  assert.match(languageNote('en'), /Lunes/);
});
