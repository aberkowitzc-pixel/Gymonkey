// Modo demo: simula las respuestas de la IA con planes de ejemplo construidos
// a partir del cuestionario. Sirve para probar la app sin servidor ni coste.
// No es la IA: la IA real razona sobre todo el perfil y cita la evidencia a medida.

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

/** Simula el avance de la IA: sube poco a poco con frases como las reales. */
async function fakeProgress(onProgress, phases, ms) {
  if (!onProgress) { await wait(ms); return; }
  const step = ms / phases.length;
  for (let i = 0; i < phases.length; i++) {
    onProgress({ pct: Math.round(((i + 1) / (phases.length + 1)) * 95), phase: phases[i] });
    await wait(step);
  }
}

const has = (p, item) => (p.equipment || []).includes(item);

function exerciseBank(p) {
  const bar = has(p, 'Barra y discos');
  const rack = has(p, 'Rack o jaula') || has(p, 'Máquina Smith');
  const pulley = has(p, 'Poleas');
  const machines = has(p, 'Máquinas guiadas');
  const pullup = has(p, 'Barra de dominadas');
  const e = (name, muscle_group, sets, reps, rir, rest_seconds, notes = '', alternatives = [], type = 'reps') =>
    ({ name, muscle_group, type, sets, reps, rir, rest_seconds, start_load_kg: 0, notes, alternatives });
  return {
    pressBanca: bar ? e('Press de banca', 'Pecho', 3, '6-8', '2', 150, 'Escápulas juntas y pies firmes.', ['Press con mancuernas']) : e('Press con mancuernas', 'Pecho', 3, '8-10', '2', 120, '', ['Flexiones lastradas']),
    pressInclinado: e('Press inclinado con mancuernas', 'Pecho', 3, '8-12', '2', 120, 'Banco a 30°.', ['Press inclinado en máquina']),
    aperturas: pulley ? e('Aperturas en polea', 'Pecho', 2, '12-15', '1', 75) : e('Aperturas', 'Pecho', 2, '12-15', '1', 75),
    remo: bar ? e('Remo con barra', 'Espalda', 3, '8-10', '2', 120, 'Torso a unos 45°, espalda neutra.', ['Remo con mancuerna']) : e('Remo con mancuerna', 'Espalda', 3, '10-12', '2', 90),
    remoPolea: pulley ? e('Remo en polea baja', 'Espalda', 3, '10-12', '2', 90) : e('Remo con mancuerna', 'Espalda', 3, '10-12', '2', 90),
    vertical: pullup ? e('Dominadas', 'Espalda', 3, '6-10', '2', 120, 'Usa banda o asistencia si no llegas al rango.', ['Jalón al pecho']) : e('Jalón al pecho', 'Espalda', 3, '10-12', '2', 90),
    pressMilitar: bar ? e('Press militar', 'Hombros', 3, '6-8', '2', 120, '', ['Press de hombros con mancuernas']) : e('Press de hombros con mancuernas', 'Hombros', 3, '8-10', '2', 120),
    laterales: e('Elevaciones laterales', 'Hombros', 3, '12-15', '1', 60, 'Controla la bajada.'),
    curl: e('Curl de bíceps', 'Brazos', 2, '10-12', '1', 75),
    martillo: e('Curl martillo', 'Brazos', 2, '10-12', '1', 75),
    triceps: pulley ? e('Extensión de tríceps en polea', 'Brazos', 2, '10-12', '1', 75) : e('Extensión de tríceps', 'Brazos', 2, '10-12', '1', 75),
    sentadilla: bar && rack ? e('Sentadilla', 'Piernas', 3, '6-8', '2', 180, 'Profundidad hasta donde mantengas la espalda neutra.', ['Sentadilla goblet']) : e('Sentadilla goblet', 'Piernas', 3, '8-12', '2', 120),
    rumano: bar ? e('Peso muerto rumano', 'Piernas', 3, '8-10', '2', 150, 'Cadera atrás, barra pegada a las piernas.') : e('Peso muerto rumano con mancuernas', 'Piernas', 3, '10-12', '2', 120),
    prensa: has(p, 'Prensa de piernas') ? e('Prensa de piernas', 'Piernas', 3, '10-12', '2', 120) : e('Zancadas', 'Piernas', 3, '10-12', '2', 90, 'Repeticiones por pierna.'),
    bulgara: e('Sentadilla búlgara', 'Piernas', 3, '8-10', '2', 90, 'Repeticiones por pierna.'),
    femoral: machines ? e('Curl femoral en máquina', 'Piernas', 3, '10-12', '1', 75) : e('Puente de glúteos', 'Glúteos', 3, '12-15', '1', 75),
    hipThrust: e('Hip thrust', 'Glúteos', 3, '8-12', '2', 120),
    gemelos: e('Elevación de gemelos', 'Piernas', 3, '12-15', '1', 60),
    plancha: e('Plancha', 'Core', 3, '30-45', '1', 60, '', [], 'time'),
  };
}

function dayTemplates(n, b) {
  const torsoA = ['Torso A', 'Empuje y tirón horizontal', [b.pressBanca, b.remo, b.pressMilitar, b.vertical, b.curl, b.triceps, b.laterales]];
  const piernaA = ['Pierna A', 'Sentadilla y cadena posterior', [b.sentadilla, b.rumano, b.prensa, b.femoral, b.gemelos, b.plancha]];
  const torsoB = ['Torso B', 'Tirón vertical y empuje inclinado', [b.vertical, b.pressInclinado, b.remoPolea, b.laterales, b.aperturas, b.martillo]];
  const piernaB = ['Pierna B', 'Unilateral y glúteo', [b.hipThrust, b.bulgara, b.rumano, b.femoral, b.plancha]];
  const fullA = ['Full body A', 'Cuerpo completo', [b.sentadilla, b.pressBanca, b.remo, b.pressMilitar, b.plancha, b.curl]];
  const fullB = ['Full body B', 'Cuerpo completo', [b.rumano, b.pressInclinado, b.vertical, b.prensa, b.laterales, b.triceps]];
  const empuje = ['Empuje', 'Pecho, hombro y tríceps', [b.pressBanca, b.pressMilitar, b.pressInclinado, b.laterales, b.triceps, b.aperturas]];
  const tiron = ['Tirón', 'Espalda y bíceps', [b.vertical, b.remo, b.remoPolea, b.curl, b.martillo]];
  return {
    1: [fullA], 2: [fullA, fullB], 3: [torsoA, piernaA, fullB], 4: [torsoA, piernaA, torsoB, piernaB],
    5: [empuje, tiron, piernaA, torsoB, piernaB], 6: [empuje, tiron, piernaA, torsoA, torsoB, piernaB], 7: [empuje, tiron, piernaA, torsoA, torsoB, piernaB],
  }[Math.min(n, 7)];
}

function blocks(weeks, goal) {
  const names = goal === 'fuerza' ? ['Base', 'Fuerza', 'Pico'] : goal === 'grasa' || goal === 'salud' ? ['Adaptación', 'Progresión', 'Consolidación'] : ['Acumulación', 'Intensificación', 'Realización'];
  const count = weeks <= 4 ? 1 : weeks <= 8 ? 2 : 3;
  const base = Math.floor(weeks / count);
  return Array.from({ length: count }, (_, i) => ({ name: names[i], weeks: base + (i < weeks % count ? 1 : 0) }));
}

export function buildPlan(p) {
  const days = p.days?.length ? p.days : ['Lunes', 'Miércoles', 'Viernes'];
  const minutes = p.minutes || 60;
  const maxEx = Math.max(3, Math.min(7, Math.floor((minutes - 10) / 8)));
  const bank = exerciseBank(p);
  const templates = dayTemplates(days.length, bank).slice(0, days.length);
  const goal = p.goal || 'hipertrofia';
  const mesocycles = blocks(p.weeks || 12, goal).map((blk, bi) => ({
    name: blk.name,
    weeks: blk.weeks,
    focus: bi === 0 ? 'Técnica y volumen progresivo' : bi === 1 ? 'Más carga en los básicos' : 'Consolidar y medir el progreso',
    description: bi === 0
      ? 'Empiezas lejos del fallo y vas sumando series o repeticiones cada semana.'
      : bi === 1 ? 'Bajan un poco las repeticiones de los ejercicios principales y sube el peso.' : 'Mantienes el volumen y te acercas a tu mejor marca en los ejercicios clave.',
    intensity: bi === 0 ? 'RIR 3 → 1' : bi === 1 ? 'RIR 2 → 1' : 'RIR 2 → 0',
    weeks_plan: Array.from({ length: blk.weeks }, (_, w) => {
      const deload = blk.weeks >= 4 && w === blk.weeks - 1;
      const rir = Math.max(bi === 2 ? 0 : 1, 3 - bi - w);
      return {
        week: w + 1,
        label: deload ? `Semana ${w + 1} · Descarga` : `Semana ${w + 1}`,
        guidance: deload ? 'Descarga: la mitad de series y RIR 4 para recuperarte.' : `Series a RIR ${rir}. ${w === 0 ? 'Encuentra los pesos de trabajo.' : 'Intenta sumar 1 repetición o 2,5 kg respecto a la semana anterior.'}`,
        deload,
      };
    }),
    days: templates.map(([name, focus, list], di) => {
      const exercises = list.slice(0, maxEx).map((x, xi) => ({
        ...x,
        sets: bi === 1 && xi < 2 ? x.sets + 1 : x.sets,
        reps: bi === 1 && xi === 0 && x.type === 'reps' ? '5-7' : x.reps,
      }));
      return { name, weekday: days[di], focus, estimated_minutes: Math.min(minutes, 10 + exercises.reduce((t, x) => t + x.sets * 3, 0)), exercises };
    }),
  }));
  const total = mesocycles.reduce((t, m) => t + m.weeks, 0);
  return {
    title: `Plan de ${total} semanas · ${days.length} días`,
    summary: `Plan de ejemplo con ${mesocycles.length} mesociclo${mesocycles.length > 1 ? 's' : ''}, progresión semanal y semanas de descarga.`,
    goal,
    split: days.length <= 2 ? 'Cuerpo completo' : days.length === 3 ? 'Torso / Pierna / Full body' : days.length === 4 ? 'Torso / Pierna' : 'Empuje / Tirón / Pierna',
    days_per_week: days.length,
    session_minutes: minutes,
    total_weeks: total,
    start_week: 1,
    schedule: days,
    warmup: '5 minutos de cardio suave, movilidad de las articulaciones que vas a usar y 2-3 series de aproximación en el primer ejercicio.',
    principles: [
      { title: 'Volumen semanal', detail: 'Entre 10 y 20 series efectivas por músculo y semana para ganar masa muscular, empezando por la parte baja.', source: 'Schoenfeld, Ogborn y Krieger, 2017' },
      { title: 'Frecuencia', detail: 'Cada músculo se entrena al menos dos veces por semana cuando los días lo permiten.', source: 'Schoenfeld, Ogborn y Krieger, 2016' },
      { title: 'Cerca del fallo', detail: 'La mayoría de series terminan a 1-3 repeticiones del fallo (RIR).', source: 'Refalo et al., 2023' },
      { title: 'Descansos', detail: '2-3 minutos en ejercicios multiarticulares y 1-2 en aislamientos.', source: 'Schoenfeld et al., 2016' },
      { title: 'Periodización y descargas', detail: 'Bloques de 3-6 semanas con progresión y una semana de descarga.', source: 'Williams et al., 2017' },
    ],
    mesocycles,
    progression_rules: [
      'Doble progresión: cuando completes todas las series en el tope del rango de repeticiones, sube el peso (2,5 kg en la mayoría; 5 kg en ejercicios de pierna; 1 kg en mancuernas pequeñas). La app te propone la carga de cada sesión.',
      'Si en una sesión te quedas lejos del rango, repite el peso la semana siguiente.',
      'En la semana 1, calibra: elige pesos con los que llegues al rango dejando 2-3 repeticiones en reserva.',
      'En las semanas de descarga, la app baja el peso a un 90 % y la mitad de series.',
    ],
    notes: [
      'Duerme 7-9 horas y toma suficiente proteína para recuperarte.',
      p.injuries ? `Con tu molestia (${p.injuries}), evita el dolor: reduce el rango o cambia por la alternativa y consulta a un profesional si persiste.` : 'Si algún ejercicio te molesta, cámbialo por su alternativa.',
    ],
  };
}

export async function demoAI(mode, input, onProgress) {
  if (mode === 'review') {
    await fakeProgress(onProgress, ['Revisando tu semana…', 'Valorando qué falta…'], 1400);
    const c = input.context;
    const missed = c.days.find((d) => d.status === 'missed');
    const free = c.free_days[0];
    if (missed && free) {
      return {
        message: 'Modo demo: te quedó una sesión sin hacer; propongo moverla a un día libre de esta semana.', verdict: 'reprogramar',
        actions: [{ kind: 'move_session', session: missed.session, from_date: missed.date, to_date: free.date, exercise: '', muscle_group: '', exercise_type: 'reps', sets: 0, reps: '', rir: '', rest_seconds: 0, reason: 'Hay un día libre y así mantienes la frecuencia.' }],
      };
    }
    return { message: 'Modo demo: no hace falta cambiar nada esta semana.', verdict: 'sin_cambios', actions: [] };
  }
  if (mode === 'sessions') {
    await fakeProgress(onProgress, ['Leyendo lo que has contado…', 'Ordenando tus series…'], 1500);
    const lib = input.library || [];
    const pick = (re, fallback) => lib.find((n) => re.test(n)) || fallback;
    const ex = (exercise, weight, reps, block = '') => ({ exercise, muscle_group: 'Piernas', type: 'reps', block, notes: '', sets: [0, 1, 2].map(() => ({ weight_kg: weight, reps, complete: true })) });
    const first = ex(pick(/sentadilla/i, 'Sentadilla'), 80, 6, 'A');
    const second = ex('Landmine press', 25, 10, 'A');
    if (input.draft) {
      const sessions = input.draft.sessions.map((s) => ({ ...s, entries: s.entries.map((e) => ({ ...e, sets: e.sets.map((t) => ({ ...t, reps: t.reps || 8, complete: true })) })) }));
      return { message: 'Listo, he actualizado la sesión con tus respuestas (modo demo).', sessions, questions: [] };
    }
    const today = input.today;
    second.sets[2] = { weight_kg: 25, reps: 0, complete: false };
    return {
      message: 'Modo demo: he creado una sesión de ejemplo (la IA real interpreta lo que cuentas).',
      sessions: [{ date: today, name: 'Entreno (demo)', duration_minutes: 55, notes: '', entries: [first, second] }],
      questions: [{ id: 'q1', question: '¿Cuántas repeticiones hiciste en la tercera serie de Landmine press?', options: ['8', '10', '12'] }],
    };
  }
  if (mode === 'questions') await fakeProgress(onProgress, ['Pensando qué preguntarte…', 'Redactando las preguntas…'], 1200);
  else await fakeProgress(onProgress, ['Analizando tu perfil y la evidencia…', 'Redactando el resumen y los principios…', 'Diseñando el mesociclo 1…', 'Diseñando el mesociclo 2…', 'Añadiendo reglas de progresión y notas…'], 4000);
  const p = input.profile || {};
  if (mode === 'questions') {
    return {
      intro: '¡Hola! Antes de diseñar tu plan, unas preguntas rápidas (modo demo).',
      questions: [
        { id: 'sueno', question: '¿Cuántas horas duermes normalmente?', why: 'El descanso marca cuánto volumen puedes recuperar.', options: ['Menos de 6', '6-7', 'Más de 7'] },
        { id: 'basicos', question: '¿Te sientes cómodo con la técnica de sentadilla y peso muerto?', why: 'Decide si empezamos con variantes más sencillas.', options: ['Sí', 'Más o menos', 'No'] },
        { id: 'cardio', question: '¿Quieres incluir cardio en las sesiones?', why: 'Para repartir el tiempo de cada sesión.', options: ['No', '10 min al final', '20 min al final'] },
      ],
    };
  }
  if (mode === 'generate') {
    const doc = (input.context_doc || '').trim();
    return {
      message: 'Este es un plan de EJEMPLO (modo demo). Con el servidor configurado, la IA lo diseña a tu medida.',
      changes: doc ? ['Modo demo: el documento adjunto no se interpreta. La IA real lo usaría para dar continuidad a lo que ya haces (estructura, pesos y semana en la que entras).'] : [],
      plan: buildPlan(p),
    };
  }
  // adapt
  const fb = input.feedback || {};
  const cur = input.plan;
  const profile = { ...p, days: fb.days?.length ? fb.days : cur.schedule, minutes: fb.minutes || cur.session_minutes };
  const opts = fb.options || [];
  if (opts.includes('Sesiones más cortas') && !fb.minutes) profile.minutes = Math.max(30, cur.session_minutes - 15);
  if (opts.includes('Sesiones más largas') && !fb.minutes) profile.minutes = cur.session_minutes + 15;
  const plan = buildPlan({ ...profile, weeks: cur.total_weeks });
  const changes = [];
  if (fb.days?.length) changes.push(`Días de entreno: ${cur.schedule.join(', ')} → ${fb.days.join(', ')}. Se ha reorganizado la división a "${plan.split}".`);
  if (profile.minutes !== cur.session_minutes) changes.push(`Duración de las sesiones: ${cur.session_minutes} → ${profile.minutes} min (ajustado el número de ejercicios).`);
  if (fb.text) changes.push(`Tu comentario ("${fb.text}") lo tendría en cuenta la IA real; en el modo demo no se interpreta.`);
  if (!changes.length) changes.push('En el modo demo solo se simulan cambios de días y de duración.');
  return { message: 'Plan ajustado (modo demo).', changes, plan };
}
