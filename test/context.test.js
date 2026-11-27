import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROMPT_OTRA_IA, buildExport, MAX_DOC } from '../context.js';

const exName = (id) => ({ a: 'Press de banca', b: 'Plancha' }[id] || id);
const fmtSet = (id, s) => (id === 'b' ? `${s.r} s` : `${s.w}×${s.r}`);
const plan = {
  title: 'Hipertrofia', split: 'Torso/Pierna', days_per_week: 2, session_minutes: 60, total_weeks: 8, schedule: ['Lunes', 'Jueves'],
  mesocycles: [{ name: 'Acumulación', weeks: 4, focus: 'Volumen', days: [{ name: 'Torso A', weekday: 'Lunes', focus: 'Empuje', exercises: [{ name: 'Press de banca', sets: 3, reps: '6-8', rir: '2', rest_seconds: 150, type: 'reps' }] }] }],
};
const week = { week: 2, meso: 0, weekInMeso: 2, wp: { guidance: 'RIR 2', deload: false } };
const workouts = [
  { start: Date.UTC(2026, 10, 20), end: Date.UTC(2026, 10, 20, 1), name: 'Torso A', entries: [{ exerciseId: 'a', sets: [{ w: 60, r: 8 }, { w: 60, r: 7 }] }] },
];

test('el prompt para otra IA pide un documento con la estructura que lee el entrenador', () => {
  for (const h of ['## Perfil', '## Plan actual', '## Marcas recientes', '## Cómo me está yendo', '## Qué quiero cambiar']) assert.ok(PROMPT_OTRA_IA.includes(h), h);
  assert.match(PROMPT_OTRA_IA, /No inventes nada/);
  assert.match(PROMPT_OTRA_IA, /datos personales/);
  assert.ok(PROMPT_OTRA_IA.length < MAX_DOC / 4);
});

test('la exportación incluye perfil, plan, semana actual y entrenos con cargas', () => {
  const md = buildExport({ profile: { goal: 'Ganar músculo', experience: 'Intermedio', days: ['Lunes', 'Jueves'], minutes: 60, equipment: ['Barra'], injuries: 'Hombro' }, plan, week, workouts, exName, fmtSet, now: Date.UTC(2026, 10, 27) });
  assert.match(md, /exportado de Gymonkey el 2026-11-27/);
  assert.match(md, /Objetivo: Ganar músculo/);
  assert.match(md, /Voy en la semana 2 de 8, mesociclo "Acumulación" \(semana 2 de 4\)/);
  assert.match(md, /\| Press de banca \| 3×6-8 \| 2 \| 150 s \|/);
  assert.match(md, /### 2026-11-20 — Torso A \(60 min\)/);
  assert.match(md, /- Press de banca: 60×8, 60×7/);
  assert.ok(md.length < MAX_DOC);
});

test('la exportación funciona sin perfil, sin plan y sin entrenos', () => {
  const md = buildExport({ routines: [{ name: 'Push', exerciseIds: ['a'] }], exName, fmtSet });
  assert.match(md, /Sin plan con IA/);
  assert.match(md, /Push: Press de banca/);
  assert.match(md, /Aún no hay entrenos/);
  assert.match(buildExport({ exName, fmtSet }), /No consta/);
});
