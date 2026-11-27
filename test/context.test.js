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

test('el prompt pide resumir lo que la otra IA ya sabe de la persona, no entregarle datos', () => {
  // Orientación: se pega en una conversación que ya tiene el historial.
  assert.match(PROMPT_OTRA_IA, /a partir de TODO lo que sabes de mí/);
  assert.match(PROMPT_OTRA_IA, /esta conversación, tu memoria y las conversaciones anteriores/);
  assert.doesNotMatch(PROMPT_OTRA_IA, /Voy a darte|Aquí está mi información|te voy a pasar/i);
  assert.doesNotMatch(PROMPT_OTRA_IA, /Aquí está/);
  assert.ok(!PROMPT_OTRA_IA.trimEnd().endsWith(':') || /Datos que faltan/.test(PROMPT_OTRA_IA), 'no debe terminar esperando que se pegue algo');
});

test('el prompt cubre todo el contexto útil con la estructura que lee el entrenador', () => {
  for (const h of ['## Perfil', '## Historial de entrenamiento', '## Plan actual', '## Sesiones anteriores', '## Progresión y marcas', '## Cómo me está yendo', '## Preferencias', '## Qué quiero cambiar', '## Observaciones']) assert.ok(PROMPT_OTRA_IA.includes(h), h);
  assert.match(PROMPT_OTRA_IA, /No inventes cifras/);
  assert.match(PROMPT_OTRA_IA, /No consta/);
  assert.match(PROMPT_OTRA_IA, /contradictorios|contradicción/);
  assert.match(PROMPT_OTRA_IA, /Omite datos que me identifiquen/);
  assert.match(PROMPT_OTRA_IA, /UN solo bloque de código Markdown/);
  assert.match(PROMPT_OTRA_IA, /No me hagas preguntas/);
  assert.match(PROMPT_OTRA_IA, /No añadas consejos/);
  assert.match(PROMPT_OTRA_IA, /AAAA-MM-DD/);
  assert.match(PROMPT_OTRA_IA, /alternando serie a serie/);
  assert.match(PROMPT_OTRA_IA, /No inventes sesiones, series ni fechas/);
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
