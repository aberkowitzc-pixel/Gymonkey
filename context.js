// Contexto que se puede llevar a otra IA y traer de vuelta:
//  · PROMPT_OTRA_IA: texto para pegar en ChatGPT, Gemini, etc. junto con tu plan actual (texto, foto o PDF).
//    Devuelve un Markdown con el formato que entiende el entrenador de Gymonkey.
//  · buildExport(): tus datos de Gymonkey en Markdown, para llevarlos a otra IA.
//  · MAX_DOC: límite de tamaño del documento que se envía al entrenador.

export const MAX_DOC = 40000;

export const PROMPT_OTRA_IA = `Quiero llevar mi información de entrenamiento a otra aplicación (un entrenador con IA) para que continúe mi programa sin empezar de cero. Necesito que, a partir de TODO lo que sabes de mí, prepares un resumen en Markdown con la estructura que te indico abajo.

Usa todas las fuentes que tengas: esta conversación, tu memoria y las conversaciones anteriores a las que tengas acceso, y cualquier archivo o imagen que haya compartido contigo. Cuanto más contexto útil incluyas, mejor.

Reglas:
- Entrégalo todo dentro de UN solo bloque de código Markdown (empieza con \`\`\`markdown y termina con \`\`\`) para que pueda copiarlo de una vez. No escribas nada antes ni después del bloque.
- No me hagas preguntas ahora: usa lo que tengas. Si no sabes algo, escribe "No consta". No inventes cifras, no redondees ni completes con valores típicos.
- Si un dato cambió con el tiempo, ordénalo cronológicamente y pon fechas o semanas. Si hay datos contradictorios, quédate con el más reciente y anota la contradicción en "Observaciones".
- Solo extrae y ordena. No añadas consejos, valoraciones ni cambios al plan.
- Prioriza las últimas 8-12 semanas con detalle y resume lo anterior. Sé completo pero conciso.
- Omite datos que me identifiquen (nombre, correo, teléfono, ubicación). La edad, el sexo y el peso corporal sí son útiles: inclúyelos si constan.
- Pesos en kg y nombres de ejercicios en español (convierte si hace falta).

Estructura del documento:

# Contexto de entrenamiento

## Perfil
- Objetivo principal (y plazos o eventos, si los hay):
- Edad aproximada, sexo y peso corporal (tendencia si la conoces):
- Tiempo entrenando con pesas y nivel:
- Días que entreno por semana (y cuáles) y duración de cada sesión:
- Material y gimnasio disponibles:
- Lesiones, molestias o limitaciones (con su historia):

## Historial de entrenamiento
- Planes o métodos anteriores y cuánto duraron:
- Qué me funcionó bien y qué no, y por qué:

## Plan actual
- Tipo de plan (por ejemplo, torso/pierna, push/pull/legs, full body) y desde cuándo:
- Duración total y semana en la que voy ahora:
- Fase o bloque actual (acumulación, fuerza, descarga…):

### Día 1 — nombre (día de la semana)
| Ejercicio | Series × repeticiones | Peso actual (kg) | RIR/RPE | Descanso | Notas |
|---|---|---|---|---|---|

(Repite "### Día N" para cada día de entrenamiento.)

## Progresión y marcas
- Para cada ejercicio principal, la evolución peso × repeticiones con fechas o semanas, de la más antigua a la más reciente (y 1RM estimados si los calculaste):

## Cómo me está yendo
- Dónde progreso bien:
- Ejercicios estancados:
- Adherencia (sesiones que suelo cumplir) y cambios recientes de rutina:
- Fatiga, sueño, estrés y molestias actuales:
- Alimentación y peso corporal, solo si lo hemos comentado (datos, no consejos):

## Preferencias
- Ejercicios que me gustan o quiero conservar:
- Ejercicios que no me gustan o quiero evitar:
- Cardio, deportes u otras actividades que hago:

## Qué quiero cambiar
- Cambios que he pedido o decisiones pendientes:

## Observaciones
- De dónde salen los datos (esta conversación, memoria, archivos) y qué tan completos son:
- Datos que faltan, ambiguos o contradictorios:
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
