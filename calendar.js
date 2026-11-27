// Calendario de entrenos: la semana actual y la siguiente, con lo planificado y lo que ya hiciste.
// Lógica pura (sin DOM) para poder probarla.

export const WEEKDAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const pad = (n) => String(n).padStart(2, '0');
export const isoLocal = (d) => { const x = new Date(d); return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`; };

/** Lunes (a las 12:00, para evitar saltos por cambios de hora) de la semana que contiene `ts`. */
export function mondayOf(ts) {
  const d = new Date(ts);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

/** Qué parte de los ejercicios de la rutina aparece en el entreno. */
export function overlap(workout, routine) {
  const ids = new Set(workout.entries.map((e) => e.exerciseId));
  return routine.exerciseIds.length ? routine.exerciseIds.filter((id) => ids.has(id)).length / routine.exerciseIds.length : 0;
}

/** ¿Este entreno es el de esa rutina? Por su vínculo, o por parecerse (al menos la mitad de los ejercicios). */
export const isRoutineWorkout = (w, routine) => (w.routineId ? w.routineId === routine.id : overlap(w, routine) >= 0.5);

/** Rutina del plan a la que más se parece un entreno (para vincular lo dictado o importado). */
export function guessRoutine(routines, exerciseIds, dateISO) {
  const planned = routines.filter((r) => r.fromPlan);
  const fake = { entries: exerciseIds.map((exerciseId) => ({ exerciseId })) };
  const wd = dateISO ? WEEKDAYS[(new Date(`${dateISO}T12:00:00`).getDay() + 6) % 7] : null;
  let best = null;
  for (const r of planned) {
    const o = overlap(fake, r);
    if (o < 0.5) continue;
    const score = o + (r.weekday === wd ? 0.05 : 0);
    if (!best || score > best.score) best = { routine: r, score };
  }
  return best?.routine || null;
}

/** Nombre corto para la celda: "Torso A" → "Torso A", "Empuje (Push)" → "Empuje". */
export function shortName(name = '') {
  const parts = name.replace(/\(.*?\)/g, '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  return parts.length > 1 && parts[1].length === 1 ? `${parts[0]} ${parts[1]}` : parts[0];
}

/**
 * Semanas del calendario (por defecto, esta y la siguiente), de lunes a domingo.
 * Estado de cada día: done · partial · missed · planned · extra (entreno fuera de plan) · rest.
 * Un entreno de una rutina hecho otro día de esa misma semana cuenta para su día previsto.
 */
export function buildWeeks({ now = Date.now(), routines = [], workouts = [], weeks = 2 }) {
  const planned = routines.filter((r) => r.fromPlan && r.weekday);
  const start = mondayOf(now);
  const todayISO = isoLocal(now);
  const out = [];
  for (let wk = 0; wk < weeks; wk++) {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(start);
      date.setDate(start.getDate() + wk * 7 + i);
      days.push({ date, iso: isoLocal(date), idx: i, weekday: WEEKDAYS[i] });
    }
    const inWeek = workouts.filter((w) => { const iso = isoLocal(w.start); return iso >= days[0].iso && iso <= days[6].iso; });
    const used = new Set();
    const claim = (day, routine) => {
      const cands = inWeek.filter((w) => !used.has(w) && isRoutineWorkout(w, routine));
      const w = cands.find((x) => isoLocal(x.start) === day.iso) || cands[0] || null;
      if (w) used.add(w);
      return w;
    };
    const cells = days.map((day) => {
      const routine = planned.find((r) => r.weekday === day.weekday) || null;
      return { ...day, routine, workout: routine ? claim(day, routine) : null };
    });
    cells.forEach((c) => {
      c.isToday = c.iso === todayISO;
      c.isPast = c.iso < todayISO;
      if (c.routine) {
        c.status = c.workout ? (c.workout.partial ? 'partial' : 'done') : c.isPast ? 'missed' : 'planned';
        c.movedTo = c.workout && isoLocal(c.workout.start) !== c.iso ? isoLocal(c.workout.start) : null;
      } else {
        const own = inWeek.filter((w) => isoLocal(w.start) === c.iso && !used.has(w));
        c.extra = own[0] || null;
        c.status = own.length ? 'extra' : 'rest';
      }
    });
    out.push({ monday: days[0].date, days: cells });
  }
  return out;
}
