import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planProgress, questionsProgress, expectedChars } from '../lib/progress.js';

const ex = (n) => `{"name":"${n}","muscle_group":"Pecho","type":"reps","sets":3,"reps":"8-10","rir":"2","rest_seconds":120,"start_load_kg":0,"notes":"","alternatives":[]}`;
const day = (n, wd) => `{"name":"${n}","weekday":"${wd}","focus":"x","estimated_minutes":55,"exercises":[${ex('A')},${ex('B')}]}`;
const wk = (i) => `{"week":${i},"label":"Semana ${i}","guidance":"x","deload":false}`;
const meso = (name, weeks, days) => `{"name":"${name}","weeks":${weeks},"focus":"f","description":"d","intensity":"i","weeks_plan":[${Array.from({ length: weeks }, (_, i) => wk(i + 1))}],"days":[${days}]}`;
const head = '{"message":"hola","changes":[],"plan":{"title":"t","summary":"s","goal":"g","split":"x","days_per_week":3,"session_minutes":60,"total_weeks":12,"schedule":["Lunes"],"warmup":"w","principles":[{"title":"a","detail":"b","source":"c"}],"mesocycles":[';
const opts = { totalWeeks: 12, daysPerWeek: 3, expectedChars: 20000 };

test('sin texto: conectando o pensando', () => {
  assert.equal(planProgress('', { thinking: false }).phase, 'Conectando con el entrenador…');
  assert.equal(planProgress('', { thinking: true }).phase, 'Analizando tu perfil y la evidencia…');
});

test('el avance sube de forma monótona a medida que se escribe el plan', () => {
  const d = (k) => [day('Día 1', 'Lunes'), day('Día 2', 'Miércoles'), day('Día 3', 'Viernes')].slice(0, k).join(',');
  const stages = [
    head.slice(0, 200),
    head,
    head + meso('Acumulación', 4, d(1)).slice(0, -12),
    head + meso('Acumulación', 4, d(3)) + ',' + meso('Intensificación', 4, d(2)).slice(0, -20),
    head + meso('Acumulación', 4, d(3)) + ',' + meso('Intensificación', 4, d(3)) + ',' + meso('Realización', 4, d(1)),
    head + meso('Acumulación', 4, d(3)) + ',' + meso('Intensificación', 4, d(3)) + ',' + meso('Realización', 4, d(3)) + '],"progression_rules":["x"]',
  ];
  const out = stages.map((t) => planProgress(t, opts));
  for (let i = 1; i < out.length; i++) assert.ok(out[i].pct >= out[i - 1].pct, `etapa ${i}: ${out[i - 1].pct} → ${out[i].pct}`);
  assert.ok(out[0].pct < 10);
  assert.match(out[2].phase, /mesociclo 1: Acumulación/);
  assert.match(out[3].phase, /mesociclo 2: Intensificación/);
  assert.match(out[4].phase, /mesociclo 3: Realización/);
  assert.equal(out[5].pct, 96);
  assert.ok(out[3].pct > 30 && out[3].pct < 75, `a mitad: ${out[3].pct}`);
});

test('nunca pasa de 96 antes del final y no falla con texto raro', () => {
  assert.ok(planProgress('{"mesocycles":[' + 'x'.repeat(100000), opts).pct <= 95);
  assert.doesNotThrow(() => planProgress('basura {{{ "weekday": ', opts));
});

test('preguntas y tamaño esperado', () => {
  assert.equal(questionsProgress('', { thinking: true }).phase, 'Pensando qué preguntarte…');
  assert.ok(questionsProgress('x'.repeat(750)).pct > 40);
  assert.ok(expectedChars({ weeks: 12, days: ['a', 'b', 'c'], minutes: 60 }) > expectedChars({ weeks: 4, days: ['a'], minutes: 30 }));
});

import { sessionsProgress } from '../lib/progress.js';

test('progreso del registro de sesiones: sube con lo escrito y nombra la fase', () => {
  assert.match(sessionsProgress('', { thinking: false }).phase, /Conectando/);
  assert.match(sessionsProgress('', { thinking: true }).phase, /Leyendo/);
  const a = sessionsProgress('{"sessions":[{"date":"2026-11-20","entries":[', { expected: 3000 });
  const b = sessionsProgress('x'.repeat(1500), { expected: 3000 });
  assert.ok(b.pct > a.pct && b.pct < 95);
  assert.match(sessionsProgress('"entries":[] "entries":[] "entries":[', { expected: 3000 }).phase, /3 hasta ahora/);
  assert.equal(sessionsProgress('x'.repeat(100000), { expected: 3000 }).pct, 95);
});
