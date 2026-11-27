// Estima el avance de la generación leyendo el JSON que la IA va escribiendo.
// Es una estimación: el orden de los campos lo marca el esquema (resumen → principios →
// mesociclos → reglas), así que se puede contar cuántos días de cada mesociclo se han escrito.

const NAME_WEEKS = /"name"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*"weeks"\s*:\s*(\d+)/g;
const WEEKDAY = /"weekday"\s*:/g;
const count = (text, re) => (text.match(re) || []).length;

export function planProgress(text, { thinking = false, totalWeeks = 12, daysPerWeek = 3, expectedChars = 20000 } = {}) {
  if (!text) {
    return thinking
      ? { pct: 3, phase: 'Analizando tu perfil y la evidencia…' }
      : { pct: 1, phase: 'Conectando con el entrenador…' };
  }
  const tw = +(text.match(/"total_weeks"\s*:\s*(\d+)/)?.[1]) || totalWeeks;
  const dpw = +(text.match(/"days_per_week"\s*:\s*(\d+)/)?.[1]) || daysPerWeek || 3;
  const chars = Math.min(95, 10 + (text.length / expectedChars) * 85);

  if (/"progression_rules"/.test(text)) return { pct: 96, phase: 'Añadiendo reglas de progresión y notas…' };

  const mi = text.indexOf('"mesocycles"');
  if (mi < 0) return { pct: Math.min(9, 4 + text.length / 400), phase: 'Redactando el resumen y los principios…' };

  const body = text.slice(mi);
  const mesos = [...body.matchAll(NAME_WEEKS)].map((m) => ({ name: m[1], weeks: +m[2] }));
  if (!mesos.length) return { pct: Math.max(10, chars), phase: 'Diseñando los mesociclos…' };

  const days = count(body, WEEKDAY);
  const done = Math.min(Math.floor(days / dpw), mesos.length);
  const cur = mesos[done];
  const sumDone = mesos.slice(0, done).reduce((t, m) => t + m.weeks, 0);
  const inside = cur ? cur.weeks * (days % dpw === 0 ? 0.1 : 0.1 + 0.9 * ((days % dpw) / dpw)) : 0;
  const frac = Math.min(1, (sumDone + inside) / tw);
  const pct = Math.min(95, 10 + 85 * frac);
  const label = cur ? `Diseñando el mesociclo ${done + 1}: ${cur.name}` : 'Revisando el plan completo…';
  return { pct: Math.max(pct, 10), phase: label };
}

/** Preguntas de seguimiento: salida corta, se estima por tamaño. */
export function questionsProgress(text, { thinking = false } = {}) {
  if (!text) return { pct: thinking ? 8 : 2, phase: thinking ? 'Pensando qué preguntarte…' : 'Conectando con el entrenador…' };
  return { pct: Math.min(95, 15 + (text.length / 1500) * 80), phase: 'Redactando las preguntas…' };
}

/** Tamaño esperado del JSON (caracteres) para el caso en que no se pueda leer la estructura. */
export function expectedChars(profile = {}) {
  const weeks = +profile.weeks || 12;
  const days = (profile.days || []).length || 3;
  const exercises = Math.max(3, Math.min(8, Math.floor(((+profile.minutes || 60) - 10) / 8)));
  const mesos = weeks <= 4 ? 1 : weeks <= 8 ? 2 : 3;
  return 3500 + mesos * (1500 + days * (350 + exercises * 420));
}

/** Registro de sesiones: el tamaño de la salida depende del texto de entrada. */
export function sessionsProgress(text, { thinking = false, expected = 3000 } = {}) {
  if (!text) return { pct: thinking ? 6 : 2, phase: thinking ? 'Leyendo lo que has contado…' : 'Conectando con el asistente…' };
  const sessions = (text.match(/"entries"\s*:/g) || []).length;
  return {
    pct: Math.min(95, 8 + (text.length / expected) * 87),
    phase: sessions > 1 ? `Ordenando tus sesiones (${sessions} hasta ahora)…` : 'Ordenando tus series…',
  };
}
