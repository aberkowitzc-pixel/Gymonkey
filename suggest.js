// Sesiones extra: ejercicios sugeridos para un entreno fuera del plan (sin IA, al instante).
// Lógica pura (sin DOM) para poder probarla.

import { isoLocal, mondayOf } from './calendar.js';

const DAY = 864e5;
/** Grupos musculares (guardados en español) de cada enfoque. */
export const FOCUS = {
  gap: null,
  torso: ['Pecho', 'Espalda', 'Hombros', 'Brazos'],
  pierna: ['Piernas', 'Glúteos', 'Core'],
  full: ['Piernas', 'Pecho', 'Espalda', 'Hombros', 'Glúteos', 'Brazos', 'Core'],
};

const defaultTarget = (ex) => (ex.type === 'time' ? { sets: 3, reps: '30-45', rir: 2 } : { sets: 3, reps: '8-12', rir: 2 });

/** Series hechas por grupo muscular en los entrenos desde `since`. */
export function setsByMuscle(workouts, exercises, since) {
  const muscle = (id) => exercises.find((e) => e.id === id)?.muscle;
  const out = {};
  for (const w of workouts) {
    if (w.start < since) continue;
    for (const e of w.entries) {
      const m = muscle(e.exerciseId);
      if (m) out[m] = (out[m] || 0) + e.sets.filter((s) => s.done).length;
    }
  }
  return out;
}

/** Series previstas por semana y grupo muscular en las sesiones del plan. */
export function plannedByMuscle(routines, exercises) {
  const out = {};
  for (const r of routines.filter((x) => x.fromPlan && x.weekday)) {
    for (const id of r.exerciseIds) {
      const m = exercises.find((e) => e.id === id)?.muscle;
      if (m) out[m] = (out[m] || 0) + (r.targets?.[id]?.sets || 3);
    }
  }
  return out;
}

/**
 * Orden de prioridad de los grupos musculares para "lo que menos has trabajado":
 * primero los que más series les faltan respecto al plan esta semana; si el plan está cubierto
 * (o no hay plan), los menos trabajados en los últimos 7 días.
 */
export function gapMuscles({ routines, workouts, exercises, now = Date.now() }) {
  const planned = plannedByMuscle(routines, exercises);
  const week = setsByMuscle(workouts, exercises, mondayOf(now).getTime() - 12 * 36e5);
  const deficit = Object.keys(planned).map((m) => ({ m, d: planned[m] - (week[m] || 0) })).filter((x) => x.d > 0 && x.m !== 'Otros' && x.m !== 'Cardio');
  if (deficit.length) return deficit.sort((a, b) => b.d - a.d).map((x) => x.m);
  const recent = setsByMuscle(workouts, exercises, now - 7 * DAY);
  return FOCUS.full.slice().sort((a, b) => (recent[a] || 0) - (recent[b] || 0));
}

/**
 * Sesión sugerida: `count` ejercicios, uno por grupo muscular en turno, con su objetivo (series, reps, RIR).
 * Los ejercicios salen primero de tu plan (con los objetivos del plan) y, si no bastan, de tu lista.
 * Se evitan los ejercicios hechos en las últimas 48 h si hay alternativa.
 */
export function suggestSession({ focus = 'gap', routines = [], workouts = [], exercises = [], now = Date.now(), count = 5 }) {
  const muscles = focus === 'gap' ? gapMuscles({ routines, workouts, exercises, now }) : FOCUS[focus] || FOCUS.full;
  const ex = (id) => exercises.find((e) => e.id === id);
  // Candidatos en orden: los del plan (en su orden, que suele poner los multiarticulares primero) y luego el resto.
  const targets = {};
  const pool = [];
  for (const r of routines.filter((x) => x.fromPlan)) {
    for (const id of r.exerciseIds) {
      if (!ex(id) || targets[id]) continue;
      targets[id] = r.targets?.[id] ? { ...r.targets[id] } : defaultTarget(ex(id));
      pool.push(id);
    }
  }
  for (const e of exercises) if (!targets[e.id]) { targets[e.id] = defaultTarget(e); pool.push(e.id); }

  const recentIds = new Set(workouts.filter((w) => w.start >= now - 2 * DAY).flatMap((w) => w.entries.map((e) => e.exerciseId)));
  const byMuscle = {};
  for (const m of muscles) {
    const all = pool.filter((id) => ex(id).muscle === m);
    byMuscle[m] = [...all.filter((id) => !recentIds.has(id)), ...all.filter((id) => recentIds.has(id))];
  }
  const chosen = [];
  const active = muscles.filter((m) => byMuscle[m].length);
  for (let round = 0; chosen.length < count && active.some((m) => byMuscle[m].length > round); round++) {
    for (const m of active) {
      if (chosen.length >= count) break;
      const id = byMuscle[m][round];
      if (id && !chosen.includes(id)) chosen.push(id);
    }
  }
  return chosen.map((id) => ({ exerciseId: id, target: targets[id] }));
}

/** Días disponibles para una sesión extra: desde hoy, `days` días, sin sesión ni entreno ese día. */
export function freeDays(weeks, todayISO, days = 14) {
  const last = isoLocal(new Date(`${todayISO}T12:00:00`).getTime() + (days - 1) * DAY);
  return weeks.flatMap((w) => w.days).filter((d) => d.iso >= todayISO && d.iso <= last && !d.routine && !d.workout && !d.extra && d.status === 'rest');
}
