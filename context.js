// Contexto que se puede llevar a otra IA y traer de vuelta:
//  · PROMPT_OTRA_IA: texto para pegar en ChatGPT, Gemini, etc. junto con tu plan actual (texto, foto o PDF).
//    Devuelve un Markdown con el formato que entiende el entrenador de Gymonkey.
//  · buildExport(): tus datos de Gymonkey en Markdown, para llevarlos a otra IA.
//  · MAX_DOC: límite de tamaño del documento que se envía al entrenador.

export const MAX_DOC = 40000;

export const PROMPT_OTRA_IA = `Voy a darte mi plan de entrenamiento actual y mis notas (pueden ser texto pegado, capturas, fotos o un PDF). Tu tarea es EXTRAER la información relevante y devolverla en un documento Markdown con la estructura de abajo, para que otra herramienta la use y dé continuidad a lo que ya estoy haciendo.

Reglas:
- Devuelve SOLO el documento Markdown, sin explicaciones antes ni después.
- No inventes nada. Si un dato no aparece, escribe "No consta".
- No me des consejos ni modifiques el plan: solo extrae y ordena.
- Omite datos personales (nombre, correo, teléfono, ubicación).
- Usa nombres de ejercicios en español y pesos en kg (convierte si hace falta).
- Si algo es ambiguo, anótalo en "Observaciones" en vez de suponerlo.

Estructura que debes devolver:

# Contexto de entrenamiento

## Perfil
- Objetivo:
- Tiempo entrenando con pesas:
- Días que entreno por semana (y cuáles):
- Duración de cada sesión (minutos):
- Material disponible:
- Lesiones, molestias o limitaciones:

## Plan actual
- Nombre o tipo de plan (por ejemplo, torso/pierna, push/pull/legs, full body):
- Duración total del plan y semana en la que voy ahora:
- Fase o bloque actual (por ejemplo, acumulación, fuerza, descarga):

### Día 1 — nombre (día de la semana)
| Ejercicio | Series × repeticiones | Peso actual (kg) | RIR/RPE | Descanso |
|---|---|---|---|---|

(Repite "### Día N" para cada día de entrenamiento.)

## Marcas recientes
- Ejercicio: peso × repeticiones (semana o fecha), de las últimas 4-6 semanas si las hay.

## Cómo me está yendo
- Ejercicios o músculos donde progreso bien:
- Ejercicios estancados:
- Fatiga, sueño, molestias:
- Adherencia (sesiones que suelo cumplir):

## Qué quiero cambiar
- Cambios que pido (por ejemplo, menos días, más pierna, evitar un ejercicio):

## Observaciones
- Cualquier dato ambiguo o que no encaje en lo anterior:

Aquí está mi información:
`;

const day = (ts) => new Date(ts).toISOString().slice(0, 10);
const list = (v) => (Array.isArray(v) ? v.filter(Boolean).join(', ') : v) || 'No consta';

/**
 * Tus datos de Gymonkey en Markdown.
 * @param {object} d { profile, plan, week, workouts, routines, exName, fmtSet, fmtMin, now }
 */
export function buildExport({ profile = null, plan = null, week = null, workouts = [], routines = [], exName, fmtSet, now = Date.now(), limit = 8 }) {
  const out = [`# Mis datos de entrenamiento (exportado de Gymonkey el ${day(now)})`, ''];

  out.push('## Perfil');
  if (profile) {
    out.push(`- Objetivo: ${profile.goal || 'No consta'}`);
    out.push(`- Experiencia: ${profile.experience || 'No consta'}`);
    out.push(`- Días disponibles: ${list(profile.days)}`);
    out.push(`- Minutos por sesión: ${profile.minutes || 'No consta'}`);
    out.push(`- Material: ${list(profile.equipment)}`);
    out.push(`- Lesiones o limitaciones: ${profile.injuries || 'No consta'}`);
    if (profile.priorities) out.push(`- Prioridades: ${profile.priorities}`);
    if (profile.preferences) out.push(`- Preferencias: ${profile.preferences}`);
  } else {
    out.push('- No consta');
  }
  out.push('');

  out.push('## Plan actual');
  if (plan) {
    out.push(`**${plan.title}** — ${plan.split} · ${plan.days_per_week} días/semana · ${plan.session_minutes} min · ${plan.total_weeks} semanas`);
    if (week) {
      const m = plan.mesocycles[week.meso];
      out.push(`- Voy en la semana ${week.week} de ${plan.total_weeks}${m ? `, mesociclo "${m.name}" (semana ${week.weekInMeso} de ${m.weeks})` : ''}${week.wp?.deload ? ' — semana de descarga' : ''}`);
      if (week.wp?.guidance) out.push(`- Guía de esta semana: ${week.wp.guidance}`);
    }
    out.push(`- Días: ${list(plan.schedule)}`);
    out.push(`- Mesociclos: ${plan.mesocycles.map((m) => `${m.name} (${m.weeks} sem, ${m.focus})`).join(' → ')}`);
    out.push('');
    const meso = plan.mesocycles[week?.meso ?? 0];
    if (meso) {
      out.push(`### Mesociclo actual: ${meso.name}`);
      for (const d of meso.days) {
        out.push('', `#### ${d.weekday} — ${d.name} (${d.focus})`, '| Ejercicio | Series × reps | RIR | Descanso |', '|---|---|---|---|');
        for (const x of d.exercises) out.push(`| ${x.name} | ${x.sets}×${x.reps}${x.type === 'time' ? ' s' : ''} | ${x.rir} | ${x.rest_seconds} s |`);
      }
    }
  } else if (routines.length) {
    out.push('Sin plan con IA. Mis rutinas:');
    for (const r of routines) out.push(`- ${r.name}: ${r.exerciseIds.map(exName).join(', ') || 'sin ejercicios'}`);
  } else {
    out.push('- No consta');
  }
  out.push('');

  out.push(`## Entrenos recientes (últimos ${limit})`);
  const recent = workouts.slice(-limit).reverse();
  if (!recent.length) out.push('- Aún no hay entrenos registrados.');
  for (const w of recent) {
    out.push('', `### ${day(w.start)} — ${w.name} (${Math.max(1, Math.round((w.end - w.start) / 60000))} min)`);
    for (const e of w.entries) out.push(`- ${exName(e.exerciseId)}: ${e.sets.map((s) => fmtSet(e.exerciseId, s)).join(', ') || '—'}`);
  }
  out.push('');
  return out.join('\n');
}
