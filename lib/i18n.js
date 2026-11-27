// Idiomas del servidor: los mensajes y las fases de progreso se escriben en español (esa es la clave)
// y se traducen aquí al inglés y al hebreo. Si falta una traducción, se envía el español.

export const LANGS = ['es', 'en', 'he'];
export const normLang = (l) => (LANGS.includes(l) ? l : 'es');
const LOCALE = { es: 'es', en: 'en', he: 'he-IL-u-ca-gregory' };

const EN = {
  'Método no permitido.': 'Method not allowed.',
  'Petición no válida.': 'Invalid request.',
  'La petición es demasiado grande.': 'The request is too large.',
  'El servidor no tiene configurada la clave de la IA (ANTHROPIC_API_KEY).': 'The server has no AI key configured (ANTHROPIC_API_KEY).',
  'La IA está saturada. Espera un minuto y vuelve a intentarlo.': 'The AI is overloaded. Wait a minute and try again.',
  'La clave de la IA del servidor no es válida.': "The server's AI key is not valid.",
  'La IA no está disponible ahora mismo. Inténtalo más tarde.': 'The AI is not available right now. Try again later.',
  'Error inesperado en el servidor.': 'Unexpected server error.',
  'El servidor no está configurado (falta FIREBASE_PROJECT_ID).': 'The server is not configured (FIREBASE_PROJECT_ID is missing).',
  'Inicia sesión con Google para usar la IA.': 'Sign in with Google to use the AI.',
  'Tu sesión ha caducado. Vuelve a iniciar sesión.': 'Your session has expired. Sign in again.',
  'Tu cuenta no tiene acceso a la IA de Gymonkey.': "Your account doesn't have access to Gymonkey's AI.",
  'No hay ejercicios para estimar.': 'There are no exercises to estimate.',
  'Faltan los datos de la semana.': 'The week data is missing.',
  'No hay nada que registrar: cuéntame qué entrenaste.': 'Nothing to log: tell me what you trained.',
  'Modo no válido.': 'Invalid mode.',
  'Faltan los datos.': 'The data is missing.',
  'Faltan los datos del perfil.': 'The profile data is missing.',
  'La IA no pudo procesar esta petición. Prueba a reformularla.': "The AI couldn't process this request. Try rephrasing it.",
  'La respuesta de la IA quedó incompleta. Inténtalo de nuevo.': 'The AI response was left incomplete. Try again.',
  'La IA devolvió un formato inesperado. Inténtalo de nuevo.': 'The AI returned an unexpected format. Try again.',
  'El documento adjunto es demasiado largo (máximo {max} caracteres). Resume lo más importante.': 'The attached document is too long (maximum {max} characters). Summarize the key points.',
  'El texto es demasiado largo (máximo {max} caracteres). Resume lo más importante.': 'The text is too long (maximum {max} characters). Summarize the key points.',
  'No hay nada que responder.': 'There is nothing to answer.',
  'Pensando…': 'Thinking…',
  'Escribiendo…': 'Writing…',
  // fases de progreso
  'Analizando tu perfil y la evidencia…': 'Analyzing your profile and the evidence…',
  'Conectando con el entrenador…': 'Connecting to the coach…',
  'Redactando el resumen y los principios…': 'Writing the summary and principles…',
  'Diseñando los mesociclos…': 'Designing the mesocycles…',
  'Añadiendo reglas de progresión y notas…': 'Adding progression rules and notes…',
  'Diseñando el mesociclo {n}: {name}': 'Designing mesocycle {n}: {name}',
  'Revisando el plan completo…': 'Reviewing the full plan…',
  'Pensando qué preguntarte…': 'Thinking what to ask you…',
  'Redactando las preguntas…': 'Writing the questions…',
  'Leyendo lo que has contado…': "Reading what you've told me…",
  'Conectando con el asistente…': 'Connecting to the assistant…',
  'Ordenando tus sesiones ({n} hasta ahora)…': 'Organizing your sessions ({n} so far)…',
  'Ordenando tus series…': 'Organizing your sets…',
  'Revisando tu semana…': 'Reviewing your week…',
  'Preparando propuestas ({n})…': 'Preparing suggestions ({n})…',
  'Valorando qué falta…': "Assessing what's missing…",
  'Calculando tus cargas…': 'Calculating your loads…',
  'Estimando cargas ({n})…': 'Estimating loads ({n})…',
};

const HE = {
  'Método no permitido.': 'השיטה אינה מותרת.',
  'Petición no válida.': 'בקשה לא תקינה.',
  'La petición es demasiado grande.': 'הבקשה גדולה מדי.',
  'El servidor no tiene configurada la clave de la IA (ANTHROPIC_API_KEY).': 'בשרת לא הוגדר מפתח AI‏ (ANTHROPIC_API_KEY).',
  'La IA está saturada. Espera un minuto y vuelve a intentarlo.': 'ה-AI עמוס. המתן דקה ונסה שוב.',
  'La clave de la IA del servidor no es válida.': 'מפתח ה-AI של השרת אינו תקין.',
  'La IA no está disponible ahora mismo. Inténtalo más tarde.': 'ה-AI אינו זמין כרגע. נסה שוב מאוחר יותר.',
  'Error inesperado en el servidor.': 'שגיאה בלתי צפויה בשרת.',
  'El servidor no está configurado (falta FIREBASE_PROJECT_ID).': 'השרת לא מוגדר (חסר FIREBASE_PROJECT_ID).',
  'Inicia sesión con Google para usar la IA.': 'התחבר עם Google כדי להשתמש ב-AI.',
  'Tu sesión ha caducado. Vuelve a iniciar sesión.': 'פג תוקף ההתחברות שלך. התחבר שוב.',
  'Tu cuenta no tiene acceso a la IA de Gymonkey.': 'לחשבון שלך אין גישה ל-AI של Gymonkey.',
  'No hay ejercicios para estimar.': 'אין תרגילים להערכה.',
  'Faltan los datos de la semana.': 'חסרים נתוני השבוע.',
  'No hay nada que registrar: cuéntame qué entrenaste.': 'אין מה לרשום: ספר לי מה התאמנת.',
  'Modo no válido.': 'מצב לא תקין.',
  'Faltan los datos.': 'חסרים נתונים.',
  'Faltan los datos del perfil.': 'חסרים נתוני הפרופיל.',
  'La IA no pudo procesar esta petición. Prueba a reformularla.': 'ה-AI לא הצליח לעבד את הבקשה. נסה לנסח אותה מחדש.',
  'La respuesta de la IA quedó incompleta. Inténtalo de nuevo.': 'תשובת ה-AI נותרה חלקית. נסה שוב.',
  'La IA devolvió un formato inesperado. Inténtalo de nuevo.': 'ה-AI החזיר פורמט בלתי צפוי. נסה שוב.',
  'El documento adjunto es demasiado largo (máximo {max} caracteres). Resume lo más importante.': 'המסמך המצורף ארוך מדי (מקסימום {max} תווים). סכם את החשוב.',
  'El texto es demasiado largo (máximo {max} caracteres). Resume lo más importante.': 'הטקסט ארוך מדי (מקסימום {max} תווים). סכם את החשוב.',
  'No hay nada que responder.': 'אין מה להשיב.',
  'Pensando…': 'חושב…',
  'Escribiendo…': 'כותב…',
  'Analizando tu perfil y la evidencia…': 'מנתח את הפרופיל שלך ואת הראיות…',
  'Conectando con el entrenador…': 'מתחבר למאמן…',
  'Redactando el resumen y los principios…': 'כותב את הסיכום והעקרונות…',
  'Diseñando los mesociclos…': 'מתכנן את המזוציקלים…',
  'Añadiendo reglas de progresión y notas…': 'מוסיף כללי התקדמות והערות…',
  'Diseñando el mesociclo {n}: {name}': 'מתכנן את מזוציקל {n}: {name}',
  'Revisando el plan completo…': 'בודק את התוכנית המלאה…',
  'Pensando qué preguntarte…': 'חושב מה לשאול אותך…',
  'Redactando las preguntas…': 'כותב את השאלות…',
  'Leyendo lo que has contado…': 'קורא את מה שסיפרת…',
  'Conectando con el asistente…': 'מתחבר לעוזר…',
  'Ordenando tus sesiones ({n} hasta ahora)…': 'מסדר את האימונים שלך ({n} עד כה)…',
  'Ordenando tus series…': 'מסדר את הסטים שלך…',
  'Revisando tu semana…': 'סוקר את השבוע שלך…',
  'Preparando propuestas ({n})…': 'מכין הצעות ({n})…',
  'Valorando qué falta…': 'בודק מה חסר…',
  'Calculando tus cargas…': 'מחשב את המשקלים שלך…',
  'Estimando cargas ({n})…': 'מעריך משקלים ({n})…',
};
const DICT = { en: EN, he: HE };

/** Sustituye {marcadores}; los números grandes se escriben con el formato del idioma. */
export function fill(text, params, lang = 'es') {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (m, k) => {
    if (!(k in params)) return m;
    const v = params[k];
    return typeof v === 'number' && Math.abs(v) >= 1000 ? v.toLocaleString(LOCALE[lang]) : String(v);
  });
}

/** Traduce un mensaje (la clave es el texto en español). */
export function sm(lang, key, params) {
  const d = DICT[lang];
  return fill(d?.[key] ?? key, params, lang);
}

/** Traduce una fase de progreso, incluidas las que llevan un número o un nombre. */
export function phaseText(lang, phase) {
  if (lang === 'es' || !phase) return phase;
  let m;
  if ((m = phase.match(/^Diseñando el mesociclo (\d+): (.*)$/))) return sm(lang, 'Diseñando el mesociclo {n}: {name}', { n: m[1], name: m[2] });
  if ((m = phase.match(/^Ordenando tus sesiones \((\d+) hasta ahora\)…$/))) return sm(lang, 'Ordenando tus sesiones ({n} hasta ahora)…', { n: m[1] });
  if ((m = phase.match(/^Preparando propuestas \((\d+)\)…$/))) return sm(lang, 'Preparando propuestas ({n})…', { n: m[1] });
  if ((m = phase.match(/^Estimando cargas \((\d+)\)…$/))) return sm(lang, 'Estimando cargas ({n})…', { n: m[1] });
  return sm(lang, phase);
}

const NAME = { es: 'español', en: 'English', he: 'Hebrew (עברית)' };

/** Instrucción de idioma que se añade al prompt del sistema (en español no cambia nada). */
export function languageNote(lang) {
  if (lang === 'es') return '';
  return `

IDIOMA DE LA RESPUESTA (prevalece sobre cualquier instrucción anterior sobre el idioma):
Escribe en ${NAME[lang]} todos los textos libres que la persona va a leer (títulos, resúmenes, descripciones, notas, mensajes, preguntas y sus opciones, motivos, alternativas, calentamiento, reglas).
NO traduzcas: las claves del JSON, los valores de tipo enumerado o identificador (por ejemplo "time" y "reps", "marca", "estimado", "peso_corporal", los verbos de las acciones), ni los nombres de los días de la semana (Lunes, Martes, Miércoles, Jueves, Viernes, Sábado, Domingo) ni los grupos musculares (Pecho, Espalda, Piernas, Glúteos, Hombros, Brazos, Core, Cardio, Otros): cópialos exactamente como se piden, en español.
Nombres de ejercicios: si el ejercicio está en la biblioteca de la persona, copia ese nombre exactamente como está escrito (la app lo traduce al mostrarlo). Si es nuevo, usa su nombre habitual en ${lang === 'he' ? 'hebreo' : 'inglés'}.
Los nombres de mesociclos y de sesiones (por ejemplo "Torso A") escríbelos en ${lang === 'he' ? 'hebreo' : 'inglés'}.`;
}
