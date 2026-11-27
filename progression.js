// Sobrecarga progresiva: propone la carga de hoy a partir de lo que registraste.
//
// Método: DOBLE PROGRESIÓN (rango de repeticiones + peso).
//  · Si completaste todas las series en el TOPE del rango → sube el peso.
//  · Si llegaste al mínimo del rango en todas → mismo peso, intenta sumar 1 repetición por serie.
//  · Si te quedaste a 1 repetición del mínimo → repite el peso.
//  · Si te quedaste más lejos → baja el peso un 5 %.
//  · Semana de descarga: 90 % del peso. Tras 3 semanas sin entrenar el ejercicio: 90 %.
// No usa IA: es una regla fija y predecible. Ajústala con tu criterio si un día vas mal de energía.

const num = (v) => { const n = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
const fmt = (n) => (Math.round(n * 100) / 100).toLocaleString('es');
const DAY = 864e5;

export function parseRange(reps) {
  const m = String(reps ?? '').match(/(\d+)\s*[-–a]\s*(\d+)/);
  if (m) return [Math.min(+m[1], +m[2]), Math.max(+m[1], +m[2])];
  const n = parseInt(reps, 10);
  return n > 0 ? [n, n] : [8, 12];
}

/** Incremento habitual de carga según el tipo de ejercicio (kg). */
export function loadStep(name = '') {
  const n = name.toLowerCase();
  if (/mancuerna|curl|elevaci|apertura|martillo|face pull|extensi|patada|pullover|goblet/.test(n)) return 1;
  if (/sentadilla|peso muerto|prensa|hip thrust|zancada|b[uú]lgara|rumano/.test(n)) return 5;
  return 2.5;
}

function roundLoad(w) {
  const unit = w >= 40 ? 2.5 : w >= 15 ? 1 : 0.5;
  return Math.max(0, Math.round(w / unit) * unit);
}

/**
 * @param {object} p
 * @param {string} p.name       nombre del ejercicio
 * @param {string} p.reps       rango objetivo, p. ej. "6-8" (si falta, 8-12)
 * @param {Array}  p.history    sesiones previas, la más reciente primero: [{ t, sets: [{ w, r }] }]
 * @param {number} [p.startLoad] peso inicial sugerido por el plan (0 = sin dato)
 * @param {boolean} [p.deload]  semana de descarga
 * @param {number} [p.now]
 * @returns {{ weight: number|null, kind: string, note: string, lastText?: string }}
 */
export function suggestLoad({ name, reps, history = [], startLoad = 0, deload = false, now = Date.now() }) {
  const [lo, hi] = parseRange(reps);
  const last = history.find((h) => h.sets.some((s) => num(s.r) > 0));

  if (!last) {
    if (startLoad > 0) {
      return { weight: roundLoad(startLoad), kind: 'start', lo, hi, lastReps: [], note: `Punto de partida según tus marcas de referencia. Ajusta para llegar a ${lo}-${hi} reps dejando 2-3 en reserva.` };
    }
    return { weight: null, kind: 'calibrate', lo, hi, lastReps: [], note: `Primera vez: elige un peso con el que completes ${lo}-${hi} reps dejando 2-3 en reserva. Desde la próxima sesión la app te propone la carga.` };
  }

  const sets = last.sets.filter((s) => num(s.r) > 0);
  const maxW = Math.max(...sets.map((s) => num(s.w)));
  const lastText = sets.map((s) => (num(s.w) ? `${fmt(num(s.w))}×${num(s.r)}` : `${num(s.r)} reps`)).join(', ');
  const lastReps = sets.map((s) => num(s.r));

  // Ejercicio con el propio peso corporal.
  if (maxW === 0) {
    const allTop = sets.every((s) => num(s.r) >= hi);
    return {
      weight: null, kind: allTop ? 'up' : 'hold', lastText, lo, hi, lastReps,
      note: allTop
        ? `Llegaste a ${hi} reps en todas las series: añade lastre (2,5-5 kg) o pasa a una variante más difícil.`
        : `Intenta sumar 1 repetición por serie (objetivo ${lo}-${hi}).`,
    };
  }

  const work = sets.filter((s) => num(s.w) >= maxW * 0.9); // descarta series de aproximación
  const reached = work.map((s) => num(s.r));
  const minR = Math.min(...reached);
  const step = loadStep(name);
  const gapDays = (now - last.t) / DAY;

  let weight = maxW, kind, note;
  if (reached.every((r) => r >= hi)) {
    weight = maxW + step; kind = 'up';
    note = `Completaste ${hi}+ reps en todas las series con ${fmt(maxW)} kg → sube ${fmt(step)} kg.`;
  } else if (minR >= lo) {
    kind = 'hold';
    note = `Mantén ${fmt(maxW)} kg e intenta sumar 1 repetición por serie (hasta ${hi}).`;
  } else if (minR >= lo - 1) {
    kind = 'hold';
    note = `Casi: repite ${fmt(maxW)} kg y busca llegar a ${lo}+ reps en todas las series.`;
  } else {
    weight = maxW * 0.95; kind = 'down';
    note = `No llegaste a ${lo} reps con ${fmt(maxW)} kg → baja un 5 % para trabajar dentro del rango.`;
  }

  if (deload) {
    weight = maxW * 0.9; kind = 'deload';
    note = `Semana de descarga: ${fmt(roundLoad(weight))} kg (≈ 90 %) y la mitad de series para recuperarte.`;
  } else if (gapDays > 21 && kind !== 'down') {
    weight = maxW * 0.9; kind = 'break';
    note = `Llevas ${Math.round(gapDays / 7)} semanas sin hacer este ejercicio: vuelve con ≈ 90 % del peso y sube de nuevo.`;
  }

  return { weight: roundLoad(weight), kind, note, lastText, lo, hi, lastReps };
}

/**
 * Repeticiones que se proponen para la serie i (0 = primera), para confirmar con un toque.
 *  · Mantienes el peso → una repetición más que la última vez (sin pasar del tope ni bajar del mínimo).
 *  · Sube el peso, baja, descarga o primera vez → el mínimo del rango (con más peso se hacen menos repeticiones).
 *  · Vuelta tras una pausa → lo que hacías, dentro del rango.
 */
export function suggestedReps(s, i = 0) {
  if (!s) return null;
  const { kind, lo, hi, lastReps = [] } = s;
  const last = lastReps[i] ?? lastReps[lastReps.length - 1];
  if (kind === 'hold') return Math.min(hi, Math.max(lo, (last ?? lo - 1) + 1));
  if (kind === 'break') return Math.min(hi, Math.max(lo, last ?? lo));
  return lo;
}

/** Rango de repeticiones deducido de la última sesión, para ejercicios sin objetivo del plan. */
export function inferRange(sets = []) {
  const reps = sets.map((s) => num(s.r)).filter((r) => r > 0);
  if (!reps.length) return '8-12';
  const lo = Math.min(...reps), hi = Math.max(...reps);
  return `${lo}-${hi > lo ? hi : lo + 2}`;
}
