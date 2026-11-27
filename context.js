// Contexto que se puede llevar a otra IA y traer de vuelta:
//  · PROMPT_OTRA_IA: texto para pegar en ChatGPT, Gemini, etc. junto con tu plan actual (texto, foto o PDF).
//    Devuelve un Markdown con el formato que entiende el entrenador de Gymonkey.
//  · buildExport(): tus datos de Gymonkey en Markdown, para llevarlos a otra IA.
//  · MAX_DOC: límite de tamaño del documento que se envía al entrenador.

import { t } from './i18n.js';

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

## Sesiones anteriores
Las sesiones concretas que recuerdes, de la más antigua a la más reciente, con su fecha (AAAA-MM-DD) y las series reales (peso × repeticiones). Por ejemplo:

### 2026-11-20 — Torso A (60 min)
- Press de banca: 60×8, 60×8, 60×7
- Remo con barra: 50×10, 50×10, 50×9
- Plancha: 45 s, 40 s, 40 s

Si dos ejercicios se hicieron alternando serie a serie, indícalo (por ejemplo, "[alternado con Remo con barra]"). Si no sabes la fecha exacta, escribe la aproximada y márcala como "(aprox.)". No inventes sesiones, series ni fechas.

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

const PROMPT_EN = `I want to move my training information to another app (an AI coach) so it can continue my program without starting from scratch. Using EVERYTHING you know about me, prepare a Markdown summary with the structure below.

Use every source you have: this conversation, your memory and any previous conversations you can access, and any file or image I have shared with you. The more useful context you include, the better.

Rules:
- Deliver everything inside ONE single Markdown code block (start with \`\`\`markdown and end with \`\`\`) so I can copy it in one go. Write nothing before or after the block.
- Don't ask me questions now: use what you have. If you don't know something, write "Not stated". Don't invent figures, don't round and don't fill in with typical values.
- If a data point changed over time, order it chronologically and add dates or weeks. If data conflicts, keep the most recent and note the conflict under "Notes".
- Only extract and organize. Don't add advice, judgments or changes to the plan.
- Prioritize the last 8-12 weeks in detail and summarize what came before. Be complete but concise.
- Omit data that identifies me (name, email, phone, location). Age, sex and body weight are useful: include them if known.
- Weights in kg.

Document structure:

# Training context

## Profile
- Main goal (and deadlines or events, if any):
- Approximate age, sex and body weight (trend if you know it):
- Time lifting weights and level:
- Days I train per week (and which) and length of each session:
- Available equipment and gym:
- Injuries, aches or limitations (with their history):

## Training history
- Previous plans or methods and how long they lasted:
- What worked well and what didn't, and why:

## Current plan
- Type of plan (for example upper/lower, push/pull/legs, full body) and since when:
- Total length and the week I'm in now:
- Current phase or block (accumulation, strength, deload…):

### Day 1 — name (weekday)
| Exercise | Sets × reps | Current weight (kg) | RIR/RPE | Rest | Notes |
|---|---|---|---|---|---|

(Repeat "### Day N" for each training day.)

## Previous sessions
The specific sessions you remember, from oldest to newest, with their date (YYYY-MM-DD) and the actual sets (weight × reps). For example:

### 2026-11-20 — Upper A (60 min)
- Bench press: 60×8, 60×8, 60×7
- Barbell row: 50×10, 50×10, 50×9
- Plank: 45 s, 40 s, 40 s

If two exercises were done alternating set by set, say so (for example, "[alternated with Barbell row]"). If you don't know the exact date, write the approximate one and mark it "(approx.)". Don't invent sessions, sets or dates.

## Progression and records
- For each main exercise, the evolution of weight × reps with dates or weeks, from oldest to newest (and estimated 1RMs if you calculated them):

## How it's going
- Where I'm progressing well:
- Stalled exercises:
- Adherence (sessions I usually complete) and recent routine changes:
- Fatigue, sleep, stress and current aches:
- Diet and body weight, only if we have discussed it (data, not advice):

## Preferences
- Exercises I like or want to keep:
- Exercises I dislike or want to avoid:
- Cardio, sports or other activities I do:

## What I want to change
- Changes I have asked for or pending decisions:

## Notes
- Where the data comes from (this conversation, memory, files) and how complete it is:
- Missing, ambiguous or conflicting data:
`;

const PROMPT_HE_NOTE = '\n\nWrite the content of the document in Hebrew (keep the section headings exactly as above, in English).\n';

/** Prompt para otra IA, en el idioma de la app (hebreo: estructura en inglés y contenido en hebreo). */
export const promptOtraIA = (lang = 'es') => (lang === 'en' ? PROMPT_EN : lang === 'he' ? PROMPT_EN + PROMPT_HE_NOTE : PROMPT_OTRA_IA);

const day = (ts) => new Date(ts).toISOString().slice(0, 10);
const list = (v) => (Array.isArray(v) ? v.filter(Boolean).join(', ') : v) || t('No consta');

/**
 * Tus datos de Gymonkey en Markdown.
 * @param {object} d { profile, plan, week, workouts, routines, exName, fmtSet, fmtMin, now }
 */
export function buildExport({ profile = null, plan = null, week = null, workouts = [], routines = [], exName, fmtSet, now = Date.now(), limit = 8 }) {
  const out = [t('# Mis datos de entrenamiento (exportado de Gymonkey el {date})', { date: day(now) }), ''];

  out.push(t('## Perfil'));
  if (profile) {
    out.push(`${t('- Objetivo:')} ${profile.goal || t('No consta')}`);
    out.push(`${t('- Experiencia:')} ${profile.experience || t('No consta')}`);
    out.push(`${t('- Días disponibles:')} ${list(profile.days)}`);
    out.push(`${t('- Minutos por sesión:')} ${profile.minutes || t('No consta')}`);
    out.push(`${t('- Material:')} ${list(profile.equipment)}`);
    out.push(`${t('- Lesiones o limitaciones:')} ${profile.injuries || t('No consta')}`);
    if (profile.priorities) out.push(`${t('- Prioridades:')} ${profile.priorities}`);
    if (profile.preferences) out.push(`${t('- Preferencias:')} ${profile.preferences}`);
  } else {
    out.push(`- ${t('No consta')}`);
  }
  out.push('');

  out.push(t('## Plan actual'));
  if (plan) {
    out.push(`**${plan.title}** — ${plan.split} · ${t('{d} días/semana · {m} min · {w} semanas', { d: plan.days_per_week, m: plan.session_minutes, w: plan.total_weeks })}`);
    if (week) {
      const m = plan.mesocycles[week.meso];
      out.push(`- ${t('Voy en la semana {w} de {total}', { w: week.week, total: plan.total_weeks })}${m ? t(', mesociclo "{name}" (semana {n} de {of})', { name: m.name, n: week.weekInMeso, of: m.weeks }) : ''}${week.wp?.deload ? t(' — semana de descarga') : ''}`);
      if (week.wp?.guidance) out.push(`${t('- Guía de esta semana:')} ${week.wp.guidance}`);
    }
    out.push(`${t('- Días:')} ${list(plan.schedule)}`);
    out.push(`${t('- Mesociclos:')} ${plan.mesocycles.map((m) => `${m.name} (${t('{n} sem', { n: m.weeks })}, ${m.focus})`).join(' → ')}`);
    out.push('');
    const meso = plan.mesocycles[week?.meso ?? 0];
    if (meso) {
      out.push(t('### Mesociclo actual: {name}', { name: meso.name }));
      for (const d of meso.days) {
        out.push('', `#### ${d.weekday} — ${d.name} (${d.focus})`, t('| Ejercicio | Series × reps | RIR | Descanso |'), '|---|---|---|---|');
        for (const x of d.exercises) out.push(`| ${x.name} | ${x.sets}×${x.reps}${x.type === 'time' ? ' s' : ''} | ${x.rir} | ${x.rest_seconds} s |`);
      }
    }
  } else if (routines.length) {
    out.push(t('Sin plan con IA. Mis rutinas:'));
    for (const r of routines) out.push(`- ${r.name}: ${r.exerciseIds.map(exName).join(', ') || t('sin ejercicios')}`);
  } else {
    out.push(`- ${t('No consta')}`);
  }
  out.push('');

  out.push(t('## Entrenos recientes (últimos {n})', { n: limit }));
  const recent = workouts.slice(-limit).reverse();
  if (!recent.length) out.push(t('- Aún no hay entrenos registrados.'));
  for (const w of recent) {
    out.push('', `### ${day(w.start)} — ${w.name} (${Math.max(1, Math.round((w.end - w.start) / 60000))} min)${w.partial ? t(' · sesión parcial') : ''}`);
    for (const e of w.entries) out.push(`- ${exName(e.exerciseId)}: ${e.sets.map((s) => fmtSet(e.exerciseId, s)).join(', ') || '—'}`);
    if (w.skipped?.length) out.push(`${t('- Sin hacer:')} ${w.skipped.map(exName).join(', ')}`);
  }
  out.push('');
  return out.join('\n');
}
