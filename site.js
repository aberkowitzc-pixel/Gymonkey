// Textos de la página de inicio (index.html) y de la página legal (legal.html), en español, inglés y hebreo.
// La app usa t() con lang/*.js; estas páginas tienen textos largos y se escriben completos por idioma.

export const UPDATED = { es: '28 de noviembre de 2026', en: 'November 28, 2026', he: '28 בנובמבר 2026' };

export const SITE = {
  es: {
    meta: { title: 'Gymonkey · Tu entrenador de gimnasio con IA', description: 'Plan de entrenamiento con IA, cargas sugeridas en cada serie, calendario con Google Calendar y tu progreso. Gratis, en el móvil.' },
    nav: { login: 'Iniciar sesión', lang: 'Idioma', open: 'Abrir Gymonkey' },
    hero: {
      eyebrow: 'Entrenador de gimnasio con IA',
      title: 'Entrena con un plan. Progresa en cada serie.',
      sub: 'Gymonkey diseña tu plan, te dice cuánto peso levantar hoy y lleva tu calendario, tu historial y tu progreso. Gratis y desde el móvil.',
      signup: 'Crear cuenta con Google',
      login: 'Ya tengo cuenta',
      note: 'Al crear tu cuenta aceptas los {terms} y la {privacy}.',
      terms: 'Términos',
      privacy: 'Política de privacidad',
      tryIt: 'Probar sin cuenta',
    },
    mock: { today: 'Hoy · Martes 07:30', session: 'Torso A', week: 'Semana 3 de 6', ex: [['Press de banca', '4×6-8', '62,5 kg'], ['Remo con barra', '4×8-10', '55 kg'], ['Press militar', '3×8-10', '35 kg']], next: 'Siguiente serie: 62,5 kg × 8', aria: 'Vista previa de una sesión en Gymonkey' },
    features: {
      title: 'Todo lo que necesitas para entrenar mejor',
      items: [
        ['coach', 'Plan con IA', 'Responde un cuestionario y recibe un plan por bloques basado en evidencia: volumen, frecuencia, RIR, descansos y semanas de descarga. Ajústalo cuando cambie tu semana.'],
        ['dumbbell', 'Cargas sugeridas', 'Cada serie llega con peso y repeticiones propuestos por sobrecarga progresiva. Confirmas con un toque o corriges.'],
        ['calendar', 'Calendario y Google Calendar', 'Fija tu horario semanal y tus sesiones aparecen en tu Google Calendar con el detalle de ejercicios, series y cargas.'],
        ['plus', 'Sesiones extra al instante', '¿Un día libre? Elige torso, pierna o lo que menos has trabajado y Gymonkey te propone la sesión.'],
        ['mic', 'Registra hablando', 'Dicta lo que hiciste y la IA lo ordena en series. También puedes importar tu historial.'],
        ['trend', 'Historial y progreso', 'Cada sesión en una tabla clara y la evolución de tu fuerza por ejercicio.'],
      ],
    },
    steps: {
      title: 'Cómo funciona',
      items: [
        ['Crea tu cuenta', 'Entra con Google. Tus datos se guardan en tu cuenta y se sincronizan entre dispositivos.'],
        ['Recibe tu plan', 'Cuéntale al entrenador tu objetivo, tus días y tu material. En un minuto tienes tu plan.'],
        ['Entrena y progresa', 'Sigue la sesión del día, confirma tus series y deja que la app ajuste las cargas.'],
      ],
    },
    extras: ['Funciona sin conexión', 'Se instala como app', 'Español · English · עברית'],
    cta: { title: '¿Empezamos?', text: 'Crea tu cuenta gratis y ten tu plan hoy mismo.', button: 'Crear cuenta con Google' },
    footer: { legal: 'Términos y privacidad', health: 'Gymonkey no sustituye el consejo de un médico ni de un profesional del deporte. Consulta antes de empezar un programa de ejercicio.', rights: 'Gymonkey' },
    auth: { working: 'Conectando con Google…', error: 'No se pudo iniciar sesión. Inténtalo de nuevo.', signedAs: 'Sesión iniciada como {name}' },
  },

  en: {
    meta: { title: 'Gymonkey · Your AI gym coach', description: 'AI training plan, suggested loads for every set, a calendar synced with Google Calendar and your progress. Free, on your phone.' },
    nav: { login: 'Sign in', lang: 'Language', open: 'Open Gymonkey' },
    hero: {
      eyebrow: 'AI gym coach',
      title: 'Train with a plan. Progress every set.',
      sub: 'Gymonkey designs your plan, tells you how much to lift today and keeps your calendar, history and progress. Free, on your phone.',
      signup: 'Sign up with Google',
      login: 'I already have an account',
      note: 'By creating an account you accept the {terms} and the {privacy}.',
      terms: 'Terms',
      privacy: 'Privacy Policy',
      tryIt: 'Try it without an account',
    },
    mock: { today: 'Today · Tuesday 07:30', session: 'Upper A', week: 'Week 3 of 6', ex: [['Bench press', '4×6-8', '62.5 kg'], ['Barbell row', '4×8-10', '55 kg'], ['Overhead press', '3×8-10', '35 kg']], next: 'Next set: 62.5 kg × 8', aria: 'Preview of a session in Gymonkey' },
    features: {
      title: 'Everything you need to train better',
      items: [
        ['coach', 'AI training plan', 'Answer a short questionnaire and get an evidence-based plan in blocks: volume, frequency, RIR, rest and deload weeks. Adjust it whenever your week changes.'],
        ['dumbbell', 'Suggested loads', 'Every set comes with a proposed weight and reps based on progressive overload. Confirm with one tap or correct it.'],
        ['calendar', 'Calendar and Google Calendar', 'Set your weekly schedule and your sessions show up in Google Calendar with the exercises, sets and loads.'],
        ['plus', 'Extra sessions in seconds', 'A free day? Pick upper body, legs or what you have trained least and Gymonkey builds the session.'],
        ['mic', 'Log by voice', 'Say what you did and the AI turns it into sets. You can also import your history.'],
        ['trend', 'History and progress', 'Every session in a clear table and your strength trend for each exercise.'],
      ],
    },
    steps: {
      title: 'How it works',
      items: [
        ['Create your account', 'Sign in with Google. Your data is saved to your account and synced across devices.'],
        ['Get your plan', 'Tell the coach your goal, your days and your equipment. Your plan is ready in a minute.'],
        ['Train and progress', 'Follow the session of the day, confirm your sets and let the app adjust your loads.'],
      ],
    },
    extras: ['Works offline', 'Installs like an app', 'Español · English · עברית'],
    cta: { title: 'Ready to start?', text: 'Create your free account and get your plan today.', button: 'Sign up with Google' },
    footer: { legal: 'Terms and privacy', health: 'Gymonkey is not a substitute for advice from a doctor or a sports professional. Check with one before starting an exercise program.', rights: 'Gymonkey' },
    auth: { working: 'Connecting to Google…', error: 'Could not sign in. Please try again.', signedAs: 'Signed in as {name}' },
  },

  he: {
    meta: { title: 'Gymonkey · מאמן חדר כושר עם בינה מלאכותית', description: 'תוכנית אימונים עם בינה מלאכותית, משקל מוצע לכל סט, לוח אימונים מסונכרן עם יומן Google וההתקדמות שלך. בחינם, בטלפון.' },
    nav: { login: 'התחברות', lang: 'שפה', open: 'פתח את Gymonkey' },
    hero: {
      eyebrow: 'מאמן חדר כושר עם בינה מלאכותית',
      title: 'מתאמנים לפי תוכנית. מתקדמים בכל סט.',
      sub: 'Gymonkey בונה לך תוכנית, אומר לך כמה להרים היום ומנהל את לוח האימונים, ההיסטוריה וההתקדמות שלך. בחינם, בטלפון.',
      signup: 'הרשמה עם Google',
      login: 'כבר יש לי חשבון',
      note: 'ביצירת החשבון אתה מסכים ל{terms} ול{privacy}.',
      terms: 'תנאי השימוש',
      privacy: 'מדיניות הפרטיות',
      tryIt: 'לנסות בלי חשבון',
    },
    mock: { today: 'היום · שלישי 07:30', session: 'פלג גוף עליון A', week: 'שבוע 3 מתוך 6', ex: [['לחיצת חזה', '4×6-8', '62.5 ק״ג'], ['חתירה עם מוט', '4×8-10', '55 ק״ג'], ['לחיצת כתפיים', '3×8-10', '35 ק״ג']], next: 'הסט הבא: 62.5 ק״ג × 8', aria: 'תצוגה מקדימה של אימון ב-Gymonkey' },
    features: {
      title: 'כל מה שצריך כדי להתאמן טוב יותר',
      items: [
        ['coach', 'תוכנית עם בינה מלאכותית', 'עונים על שאלון קצר ומקבלים תוכנית מבוססת מחקר לפי בלוקים: נפח, תדירות, RIR, מנוחה ושבועות הורדת עומס. אפשר לעדכן אותה כשהשבוע משתנה.'],
        ['dumbbell', 'משקל מוצע', 'כל סט מגיע עם משקל וחזרות מוצעים לפי עומס מתקדם. מאשרים בהקשה או מתקנים.'],
        ['calendar', 'לוח אימונים ויומן Google', 'קובעים שעות קבועות לשבוע והאימונים מופיעים ביומן Google עם התרגילים, הסטים והמשקלים.'],
        ['plus', 'אימון נוסף בשניות', 'יום פנוי? בוחרים פלג גוף עליון, רגליים או מה שהכי פחות אימנת, ו-Gymonkey מציע את האימון.'],
        ['mic', 'רישום בקול', 'מספרים מה עשית והבינה המלאכותית מסדרת את זה בסטים. אפשר גם לייבא היסטוריה.'],
        ['trend', 'היסטוריה והתקדמות', 'כל אימון בטבלה ברורה, ומגמת הכוח שלך בכל תרגיל.'],
      ],
    },
    steps: {
      title: 'איך זה עובד',
      items: [
        ['יוצרים חשבון', 'מתחברים עם Google. הנתונים נשמרים בחשבון שלך ומסתנכרנים בין המכשירים.'],
        ['מקבלים תוכנית', 'מספרים למאמן על המטרה, הימים והציוד. התוכנית מוכנה תוך דקה.'],
        ['מתאמנים ומתקדמים', 'עוקבים אחרי האימון של היום, מאשרים סטים והאפליקציה מעדכנת את המשקלים.'],
      ],
    },
    extras: ['עובד בלי חיבור', 'מותקן כמו אפליקציה', 'Español · English · עברית'],
    cta: { title: 'מתחילים?', text: 'צור חשבון בחינם וקבל את התוכנית שלך עוד היום.', button: 'הרשמה עם Google' },
    footer: { legal: 'תנאים ופרטיות', health: 'Gymonkey אינו תחליף לייעוץ של רופא או של איש מקצוע בתחום הספורט. התייעץ לפני שאתה מתחיל תוכנית אימונים.', rights: 'Gymonkey' },
    auth: { working: 'מתחבר ל-Google…', error: 'ההתחברות נכשלה. נסה שוב.', signedAs: 'מחובר בתור {name}' },
  },
};

/* ---------- Términos y privacidad ---------- */
// Cada sección: [título, [párrafos]]. Texto general para una app de este tipo; no es asesoría legal.

export const LEGAL = {
  es: {
    title: 'Términos y privacidad',
    updated: 'Última actualización: {date}',
    back: 'Volver al inicio',
    toc: { terms: 'Términos y condiciones', privacy: 'Política de privacidad' },
    terms: [
      ['1. Aceptación', ['Estos términos regulan el uso de Gymonkey (la «app»), disponible en gymonkey.vercel.app. Al crear una cuenta o usar la app aceptas estos términos y la política de privacidad. Si no estás de acuerdo, no uses la app.']],
      ['2. Qué es Gymonkey', ['Gymonkey es una herramienta para planificar y registrar entrenamientos de fuerza: plan de entrenamiento generado con inteligencia artificial, cargas sugeridas, calendario, historial y progreso. Se ofrece de forma gratuita y puede cambiar, ampliarse o dejar de estar disponible en cualquier momento.']],
      ['3. Salud y riesgos del ejercicio', ['Gymonkey no es un servicio médico ni sustituye el consejo de un médico, fisioterapeuta o entrenador cualificado. Consulta con un profesional de la salud antes de empezar o cambiar un programa de ejercicio, sobre todo si tienes una lesión, una enfermedad, estás embarazada o hace tiempo que no entrenas.', 'El entrenamiento con cargas conlleva riesgo de lesión. Tú decides qué ejercicios haces, con qué peso y cómo. Usa una técnica correcta, calienta, escucha a tu cuerpo y detente si sientes dolor, mareo o falta de aire. Entrenas bajo tu propia responsabilidad.']],
      ['4. Contenido generado por inteligencia artificial', ['Los planes, cargas, ajustes y textos que propone la app se generan de forma automática y pueden contener errores o no adaptarse a tu situación. Son orientativos: revísalos con criterio antes de seguirlos y ajústalos a lo que sientes en cada sesión.']],
      ['5. Tu cuenta', ['Para guardar tus datos en la nube inicias sesión con tu cuenta de Google. Debes tener al menos 16 años (o la edad mínima que exija la ley de tu país) y ser responsable de la actividad de tu cuenta. Puedes usar la app sin cuenta; en ese caso tus datos solo se guardan en tu dispositivo.']],
      ['6. Uso aceptable', ['No uses la app para fines ilegales, para intentar acceder a datos de otras personas, para sobrecargar o atacar el servicio ni para automatizar peticiones a la inteligencia artificial. Las funciones de IA tienen un límite diario de uso por persona. Podemos suspender cuentas que incumplan estos términos.']],
      ['7. Tus datos y contenidos', ['Los datos de entrenamiento que introduces son tuyos. Nos das permiso para almacenarlos y procesarlos solo para prestarte el servicio, como se explica en la política de privacidad. Puedes exportarlos en cualquier momento desde la app.']],
      ['8. Servicios de terceros', ['La app funciona con servicios de terceros: Google (inicio de sesión, Firebase y, si lo activas, Google Calendar), Vercel (alojamiento), Anthropic (modelos de IA) y Upstash (contadores de uso). Su uso también está sujeto a sus propias condiciones.']],
      ['9. Propiedad intelectual', ['El nombre, el diseño y el código de Gymonkey pertenecen a sus responsables. No puedes copiarlos ni redistribuirlos salvo lo que permita la ley.']],
      ['10. Sin garantías', ['La app se ofrece «tal cual» y «según disponibilidad», sin garantías de ningún tipo, incluidas las de exactitud, disponibilidad continua o adecuación a un fin concreto. Haz copias de seguridad de los datos importantes con la función de exportar.']],
      ['11. Limitación de responsabilidad', ['En la medida máxima que permita la ley, los responsables de Gymonkey no serán responsables de lesiones, daños para la salud, pérdida de datos ni daños indirectos derivados del uso de la app o de seguir sus sugerencias. Nada de esto limita los derechos que te reconozca la ley de protección al consumidor de tu país.']],
      ['12. Baja', ['Puedes dejar de usar la app cuando quieras y pedir que borremos tu cuenta y tus datos. También podemos cerrar cuentas que incumplan estos términos o dejar de ofrecer el servicio, avisando con antelación razonable cuando sea posible.']],
      ['13. Cambios', ['Podemos actualizar estos términos. Publicaremos la versión nueva en esta página con su fecha. Si los cambios son importantes, te lo indicaremos en la app. Seguir usándola después significa que aceptas los cambios.']],
      ['14. Ley aplicable y contacto', ['Estos términos se rigen por la ley del país de residencia del responsable del servicio, sin perjuicio de las normas imperativas que te protejan como consumidor. Para cualquier consulta, escríbenos al correo de contacto indicado al final de esta página.']],
    ],
    privacy: [
      ['Qué datos tratamos', ['Datos de tu cuenta de Google: nombre, correo electrónico, foto de perfil e identificador de usuario, para iniciar sesión y asociar tus datos a tu cuenta.', 'Datos de entrenamiento que introduces: perfil y objetivos del cuestionario (por ejemplo, edad, peso, experiencia, material y lesiones o molestias que decidas contar), plan, rutinas, entrenos, series, cargas, notas y ajustes.', 'Si activas Google Calendar: acceso para crear, modificar y borrar los eventos de tus sesiones. Gymonkey solo trabaja con los eventos que crea; no lee ni guarda el resto de tu calendario.']],
      ['Para qué los usamos', ['Para prestarte el servicio: guardar y sincronizar tus datos, generar y ajustar tu plan, sugerir cargas, mostrar tu calendario y tu progreso y, si lo pides, crear los eventos de tus sesiones. No vendemos tus datos, no mostramos publicidad y no los usamos para perfilarte con fines comerciales.']],
      ['Inteligencia artificial', ['Cuando usas una función de IA (crear o ajustar el plan, dictar un entreno, estimar cargas, revisar la semana), el contenido necesario para responder —tu perfil, tu plan y el historial relevante— se envía a la API de Anthropic para generar la respuesta. Según sus condiciones comerciales, Anthropic no usa estos datos para entrenar sus modelos.']],
      ['Datos de las API de Google', ['El uso y la transferencia a cualquier otra aplicación de la información recibida de las API de Google se ajustan a la Política de datos de usuario de los servicios de API de Google (Google API Services User Data Policy), incluidos los requisitos de uso limitado.']],
      ['Dónde se guardan', ['Con sesión iniciada, en Google Firebase (Firestore), protegidos por reglas que solo te permiten acceder a tus propios datos. Sin sesión, en el almacenamiento local de tu navegador. La app no usa cookies de seguimiento ni herramientas de analítica de terceros.']],
      ['Con quién se comparten', ['Solo con los proveedores que hacen funcionar la app y únicamente para eso: Google (cuenta, base de datos y calendario), Vercel (alojamiento y servidor), Anthropic (IA) y Upstash (contadores de uso diario, asociados a tu identificador de usuario). Pueden tratar datos fuera de tu país con las garantías que exige la ley.']],
      ['Cuánto tiempo', ['Conservamos tus datos mientras tengas la cuenta. Si pides la baja, los borramos en un plazo razonable, salvo lo que la ley obligue a conservar. Los contadores de uso se borran a los pocos días.']],
      ['Tus derechos', ['Puedes acceder a tus datos, corregirlos, exportarlos (desde la app) y pedir que los borremos. Puedes retirar el acceso a Google Calendar cuando quieras desde la configuración de tu cuenta de Google (Seguridad → Apps de terceros). Si crees que no tratamos bien tus datos, puedes reclamar ante la autoridad de protección de datos de tu país.']],
      ['Menores', ['La app no está dirigida a menores de 16 años y no recogemos sus datos a sabiendas.']],
      ['Cambios y contacto', ['Si cambia esta política, publicaremos la nueva versión aquí con su fecha. Para ejercer tus derechos o cualquier consulta sobre privacidad, escríbenos al correo de contacto.']],
    ],
    contact: 'Contacto',
  },

  en: {
    title: 'Terms and privacy',
    updated: 'Last updated: {date}',
    back: 'Back to home',
    toc: { terms: 'Terms and Conditions', privacy: 'Privacy Policy' },
    terms: [
      ['1. Acceptance', ['These terms govern your use of Gymonkey (the “app”), available at gymonkey.vercel.app. By creating an account or using the app you accept these terms and the privacy policy. If you do not agree, do not use the app.']],
      ['2. What Gymonkey is', ['Gymonkey is a tool to plan and log strength training: an AI-generated training plan, suggested loads, a calendar, history and progress. It is provided free of charge and may change, grow or stop being available at any time.']],
      ['3. Health and exercise risks', ['Gymonkey is not a medical service and does not replace the advice of a doctor, physiotherapist or qualified coach. Check with a health professional before starting or changing an exercise program, especially if you have an injury or a medical condition, are pregnant or have not trained for a while.', 'Resistance training carries a risk of injury. You decide which exercises you do, with what weight and how. Use proper technique, warm up, listen to your body and stop if you feel pain, dizziness or shortness of breath. You train at your own risk.']],
      ['4. AI-generated content', ['The plans, loads, adjustments and texts suggested by the app are generated automatically and may contain errors or not fit your situation. They are guidance only: review them with judgment before following them and adapt them to how you feel in each session.']],
      ['5. Your account', ['To save your data in the cloud you sign in with your Google account. You must be at least 16 years old (or the minimum age required in your country) and you are responsible for the activity on your account. You can use the app without an account; your data is then stored only on your device.']],
      ['6. Acceptable use', ['Do not use the app for illegal purposes, to try to access other people’s data, to overload or attack the service, or to automate requests to the AI. AI features have a daily usage limit per person. We may suspend accounts that breach these terms.']],
      ['7. Your data and content', ['The training data you enter is yours. You allow us to store and process it only to provide the service, as described in the privacy policy. You can export it at any time from the app.']],
      ['8. Third-party services', ['The app relies on third-party services: Google (sign-in, Firebase and, if you enable it, Google Calendar), Vercel (hosting), Anthropic (AI models) and Upstash (usage counters). Their use is also subject to their own terms.']],
      ['9. Intellectual property', ['The Gymonkey name, design and code belong to its operators. You may not copy or redistribute them except as permitted by law.']],
      ['10. No warranty', ['The app is provided “as is” and “as available”, without warranties of any kind, including accuracy, continuous availability or fitness for a particular purpose. Back up important data with the export feature.']],
      ['11. Limitation of liability', ['To the fullest extent permitted by law, the operators of Gymonkey are not liable for injuries, health damage, data loss or indirect damages arising from using the app or following its suggestions. Nothing here limits the rights you have under the consumer protection law of your country.']],
      ['12. Closing your account', ['You can stop using the app at any time and ask us to delete your account and data. We may also close accounts that breach these terms or stop offering the service, giving reasonable notice when possible.']],
      ['13. Changes', ['We may update these terms. We will publish the new version on this page with its date and let you know in the app if the changes are significant. Continuing to use the app afterwards means you accept the changes.']],
      ['14. Governing law and contact', ['These terms are governed by the law of the country of residence of the service operator, without prejudice to mandatory rules that protect you as a consumer. For any question, write to the contact email shown at the end of this page.']],
    ],
    privacy: [
      ['What data we process', ['Your Google account data: name, email address, profile photo and user ID, to sign you in and link your data to your account.', 'Training data you enter: profile and goals from the questionnaire (for example age, weight, experience, equipment and any injuries or discomfort you choose to share), plan, routines, workouts, sets, loads, notes and settings.', 'If you enable Google Calendar: access to create, change and delete the events for your sessions. Gymonkey only works with the events it creates; it does not read or store the rest of your calendar.']],
      ['How we use it', ['To provide the service: store and sync your data, create and adjust your plan, suggest loads, show your calendar and progress and, if you ask, create the events for your sessions. We do not sell your data, show ads or use it to profile you for commercial purposes.']],
      ['Artificial intelligence', ['When you use an AI feature (creating or adjusting your plan, logging a workout by voice, estimating loads, reviewing your week), the content needed to answer —your profile, your plan and the relevant history— is sent to the Anthropic API to generate the response. Under its commercial terms, Anthropic does not use this data to train its models.']],
      ['Google API data', ['Gymonkey’s use and transfer to any other app of information received from Google APIs will adhere to the Google API Services User Data Policy, including the Limited Use requirements.']],
      ['Where it is stored', ['When you are signed in, in Google Firebase (Firestore), protected by rules that only let you access your own data. When you are not, in your browser’s local storage. The app does not use tracking cookies or third-party analytics.']],
      ['Who it is shared with', ['Only with the providers that run the app, and only for that purpose: Google (account, database and calendar), Vercel (hosting and server), Anthropic (AI) and Upstash (daily usage counters, linked to your user ID). They may process data outside your country with the safeguards required by law.']],
      ['How long we keep it', ['We keep your data while you have an account. If you ask us to delete it, we do so within a reasonable time, except what the law requires us to keep. Usage counters are deleted after a few days.']],
      ['Your rights', ['You can access, correct, export (from the app) and ask us to delete your data. You can revoke Google Calendar access at any time from your Google Account settings (Security → Third-party apps). If you believe we are not handling your data properly, you can complain to the data protection authority in your country.']],
      ['Children', ['The app is not intended for children under 16 and we do not knowingly collect their data.']],
      ['Changes and contact', ['If this policy changes, we will publish the new version here with its date. To exercise your rights or for any privacy question, write to the contact email.']],
    ],
    contact: 'Contact',
  },

  he: {
    title: 'תנאים ופרטיות',
    updated: 'עדכון אחרון: {date}',
    back: 'חזרה לדף הבית',
    toc: { terms: 'תנאי שימוש', privacy: 'מדיניות פרטיות' },
    terms: [
      ['1. הסכמה', ['תנאים אלה חלים על השימוש ב-Gymonkey (״האפליקציה״), הזמינה בכתובת gymonkey.vercel.app. ביצירת חשבון או בשימוש באפליקציה אתה מסכים לתנאים אלה ולמדיניות הפרטיות. אם אינך מסכים, אל תשתמש באפליקציה.']],
      ['2. מה זה Gymonkey', ['Gymonkey הוא כלי לתכנון ולתיעוד אימוני כוח: תוכנית אימונים שנוצרת בבינה מלאכותית, משקלים מוצעים, לוח אימונים, היסטוריה והתקדמות. השירות ניתן בחינם ועשוי להשתנות, להתרחב או להפסיק לפעול בכל עת.']],
      ['3. בריאות וסיכוני אימון', ['Gymonkey אינו שירות רפואי ואינו מחליף ייעוץ של רופא, פיזיותרפיסט או מאמן מוסמך. התייעץ עם איש מקצוע בתחום הבריאות לפני שאתה מתחיל או משנה תוכנית אימונים, במיוחד אם יש לך פציעה או מצב רפואי, את בהריון או שלא התאמנת זמן רב.', 'אימון עם משקלים כרוך בסיכון לפציעה. אתה מחליט אילו תרגילים לבצע, באיזה משקל ואיך. הקפד על טכניקה נכונה, התחמם, הקשב לגוף והפסק אם אתה מרגיש כאב, סחרחורת או קוצר נשימה. האימון הוא באחריותך בלבד.']],
      ['4. תוכן שנוצר בבינה מלאכותית', ['התוכניות, המשקלים, ההתאמות והטקסטים שהאפליקציה מציעה נוצרים באופן אוטומטי ועלולים להכיל טעויות או לא להתאים למצבך. הם להכוונה בלבד: בדוק אותם בשיקול דעת לפני שאתה פועל לפיהם והתאם אותם לתחושה שלך בכל אימון.']],
      ['5. החשבון שלך', ['כדי לשמור את הנתונים בענן מתחברים עם חשבון Google. עליך להיות בן 16 לפחות (או בגיל המינימלי הנדרש בחוק במדינתך) ואתה אחראי לפעילות בחשבונך. אפשר להשתמש באפליקציה גם בלי חשבון; במקרה כזה הנתונים נשמרים רק במכשיר שלך.']],
      ['6. שימוש מותר', ['אין להשתמש באפליקציה למטרות בלתי חוקיות, לניסיון לגשת לנתונים של אחרים, להעמסה או לתקיפה של השירות, או לשליחה אוטומטית של בקשות לבינה המלאכותית. לפונקציות הבינה המלאכותית יש מגבלת שימוש יומית לכל אדם. אנו רשאים להשעות חשבונות שמפרים תנאים אלה.']],
      ['7. הנתונים והתוכן שלך', ['נתוני האימון שאתה מזין שייכים לך. אתה מרשה לנו לשמור ולעבד אותם רק כדי לספק לך את השירות, כמתואר במדיניות הפרטיות. אפשר לייצא אותם בכל עת מתוך האפליקציה.']],
      ['8. שירותי צד שלישי', ['האפליקציה פועלת באמצעות שירותי צד שלישי: Google (התחברות, Firebase ו, אם תפעיל, יומן Google), Vercel (אחסון), Anthropic (מודלי בינה מלאכותית) ו-Upstash (מוני שימוש). השימוש בהם כפוף גם לתנאים שלהם.']],
      ['9. קניין רוחני', ['השם, העיצוב והקוד של Gymonkey שייכים למפעיליו. אין להעתיק או להפיץ אותם אלא כפי שהחוק מתיר.']],
      ['10. ללא אחריות', ['האפליקציה ניתנת ״כמות שהיא״ ו״לפי זמינות״, ללא אחריות מכל סוג, לרבות לדיוק, לזמינות רציפה או להתאמה למטרה מסוימת. גבה נתונים חשובים בעזרת פונקציית הייצוא.']],
      ['11. הגבלת אחריות', ['במידה המרבית שהחוק מתיר, מפעילי Gymonkey לא יהיו אחראים לפציעות, לנזק בריאותי, לאובדן נתונים או לנזקים עקיפים הנובעים מהשימוש באפליקציה או מביצוע ההמלצות שלה. אין באמור כדי לגרוע מזכויותיך לפי דיני הגנת הצרכן במדינתך.']],
      ['12. סגירת חשבון', ['אפשר להפסיק להשתמש באפליקציה בכל עת ולבקש שנמחק את החשבון והנתונים. אנו רשאים גם לסגור חשבונות שמפרים תנאים אלה או להפסיק את השירות, בהודעה מוקדמת סבירה כשהדבר אפשרי.']],
      ['13. שינויים', ['אנו עשויים לעדכן תנאים אלה. הגרסה החדשה תפורסם בעמוד זה עם תאריך, ונודיע באפליקציה אם השינויים מהותיים. המשך השימוש לאחר מכן מהווה הסכמה לשינויים.']],
      ['14. הדין החל ויצירת קשר', ['תנאים אלה כפופים לדין של מדינת מגוריו של מפעיל השירות, מבלי לגרוע מכללים מחייבים שמגנים עליך כצרכן. לכל שאלה, כתוב לכתובת הדוא״ל ליצירת קשר שמופיעה בסוף עמוד זה.']],
    ],
    privacy: [
      ['אילו נתונים אנו מעבדים', ['נתוני חשבון Google: שם, כתובת דוא״ל, תמונת פרופיל ומזהה משתמש, כדי לחבר אותך ולשייך את הנתונים לחשבונך.', 'נתוני אימון שאתה מזין: פרופיל ומטרות מהשאלון (למשל גיל, משקל, ניסיון, ציוד ופציעות או כאבים שתבחר לשתף), תוכנית, שגרות, אימונים, סטים, משקלים, הערות והגדרות.', 'אם תפעיל את יומן Google: גישה ליצירה, לשינוי ולמחיקה של אירועי האימונים שלך. Gymonkey עובד רק עם האירועים שהוא יוצר; הוא לא קורא ולא שומר את שאר היומן שלך.']],
      ['למה אנו משתמשים בהם', ['כדי לספק את השירות: לשמור ולסנכרן את הנתונים, ליצור ולהתאים את התוכנית, להציע משקלים, להציג את לוח האימונים וההתקדמות, ואם תבקש, ליצור את אירועי האימונים. איננו מוכרים את הנתונים שלך, איננו מציגים פרסומות ואיננו משתמשים בהם לפרופיילינג מסחרי.']],
      ['בינה מלאכותית', ['כשאתה משתמש בפונקציית בינה מלאכותית (יצירה או עדכון של התוכנית, רישום אימון בקול, הערכת משקלים, סקירת השבוע), התוכן הדרוש לתשובה —הפרופיל, התוכנית וההיסטוריה הרלוונטית— נשלח ל-API של Anthropic. לפי התנאים המסחריים שלה, Anthropic אינה משתמשת בנתונים אלה לאימון המודלים שלה.']],
      ['נתונים מממשקי Google', ['השימוש של Gymonkey במידע שמתקבל מממשקי ה-API של Google והעברתו לכל אפליקציה אחרת יעמדו במדיניות נתוני המשתמש של שירותי ה-API של Google (Google API Services User Data Policy), כולל דרישות השימוש המוגבל.']],
      ['היכן הם נשמרים', ['כשאתה מחובר, ב-Google Firebase (Firestore), תחת כללים שמאפשרים לך לגשת רק לנתונים שלך. כשאינך מחובר, באחסון המקומי של הדפדפן. האפליקציה אינה משתמשת בעוגיות מעקב או בכלי ניתוח של צד שלישי.']],
      ['עם מי הם משותפים', ['רק עם הספקים שמפעילים את האפליקציה ולמטרה זו בלבד: Google (חשבון, מסד נתונים ויומן), Vercel (אחסון ושרת), Anthropic (בינה מלאכותית) ו-Upstash (מוני שימוש יומי, המקושרים למזהה המשתמש שלך). הם עשויים לעבד נתונים מחוץ למדינתך בכפוף לאמצעי ההגנה שהחוק דורש.']],
      ['כמה זמן', ['אנו שומרים את הנתונים כל עוד יש לך חשבון. אם תבקש למחוק אותם, נעשה זאת תוך זמן סביר, למעט מה שהחוק מחייב לשמור. מוני השימוש נמחקים אחרי ימים ספורים.']],
      ['הזכויות שלך', ['אפשר לעיין בנתונים, לתקן אותם, לייצא אותם (מתוך האפליקציה) ולבקש למחוק אותם. אפשר לבטל את הגישה ליומן Google בכל עת בהגדרות חשבון Google (אבטחה ← אפליקציות של צד שלישי). אם אתה סבור שאיננו מטפלים בנתונים כראוי, אפשר להגיש תלונה לרשות להגנת הפרטיות במדינתך.']],
      ['קטינים', ['האפליקציה אינה מיועדת לילדים מתחת לגיל 16 ואיננו אוספים ביודעין את הנתונים שלהם.']],
      ['שינויים ויצירת קשר', ['אם המדיניות תשתנה, נפרסם כאן את הגרסה החדשה עם תאריך. למימוש זכויותיך או לכל שאלה בנושא פרטיות, כתוב לכתובת הדוא״ל ליצירת קשר.']],
    ],
    contact: 'יצירת קשר',
  },
};

/** Correo de contacto que se muestra en la página legal (vacío: no se muestra). */
export const CONTACT_EMAIL = '';

/** Idioma de estas páginas: el elegido antes aquí o en la app; si no, el del navegador. */
export function pickLang() {
  const ok = (l) => (l && SITE[l] ? l : null);
  const url = ok(new URLSearchParams(location.search).get('lang'));
  if (url) return url;
  try {
    const saved = ok(localStorage.getItem('gymonkey:lang'));
    if (saved) return saved;
    const app = JSON.parse(localStorage.getItem('gymonkey:v1') || 'null');
    if (ok(app?.settings?.lang)) return app.settings.lang;
  } catch (_) { /* almacenamiento no disponible */ }
  const n = String(navigator.language || 'es').toLowerCase();
  return n.startsWith('he') || n.startsWith('iw') ? 'he' : n.startsWith('en') ? 'en' : 'es';
}

export function saveLang(l) { try { localStorage.setItem('gymonkey:lang', l); } catch (_) { /* ignorar */ } }

/** Tema: el elegido en los ajustes de la app (claro u oscuro) o el del sistema. */
export function applyTheme() {
  try {
    const th = JSON.parse(localStorage.getItem('gymonkey:v1') || 'null')?.settings?.theme;
    if (th === 'light' || th === 'dark') document.documentElement.dataset.theme = th;
  } catch (_) { /* ignorar */ }
}

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
