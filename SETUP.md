# Puesta en marcha de Gymonkey (cuentas, IA y publicación)

La app tiene tres piezas. Cada una necesita una cuenta gratuita (la IA cobra por uso):

| Pieza | Servicio | Para qué | Coste |
|---|---|---|---|
| Web + servidor de IA | **Vercel** | Publica la app y ejecuta el servidor que habla con la IA. Funciona con el repositorio **privado**. | Gratis (plan Hobby, uso personal no comercial) |
| Cuentas y datos | **Firebase** (Google) | Inicio de sesión con Google y guardar tus datos en la nube | Gratis (plan Spark) |
| Inteligencia artificial | **Anthropic (Claude)** | Genera y ajusta los planes | Pago por uso: ≈ 0,25–0,40 USD por plan o ajuste |

Tiempo total: unos 30 minutos. Mejor desde un ordenador.

---

## 0. Vuelve a poner el repositorio en privado

Si lo hiciste público para GitHub Pages:

1. GitHub → repositorio **Gymonkey** → **Settings** → **Pages** → si aparece activo, en *Source* elige **None** / **Unpublish site**.
2. **Settings → General → Danger Zone → Change visibility → Change to private**.

> El código que se ejecuta en el navegador (HTML/JS) siempre lo puede descargar quien visita una web: pasa con todas. Lo importante es que **las claves secretas no están en ese código**: la clave de la IA solo vive en el servidor de Vercel.

## 1. Firebase (cuentas y datos)

1. Entra en <https://console.firebase.google.com> con tu cuenta de Google → **Crear un proyecto** → nombre `gymonkey` → puedes desactivar Google Analytics → **Crear**.
2. Menú izquierdo → **Compilación (Build) → Authentication → Comenzar** → pestaña **Método de acceso** → **Google** → **Habilitar** → elige tu correo de asistencia → **Guardar**.
3. Menú izquierdo → **Compilación → Firestore Database → Crear base de datos** → ubicación cercana (p. ej. `eur3` o `southamerica-east1`) → **Modo de producción** → **Crear**.
4. En Firestore → pestaña **Reglas** → borra lo que hay, pega el contenido del archivo [`firestore.rules`](firestore.rules) → **Publicar**.
5. Rueda ⚙️ (arriba a la izquierda) → **Configuración del proyecto** → abajo, en **Tus apps**, pulsa el icono **`</>`** (Web) → nombre `Gymonkey` → **Registrar app**.
6. Te mostrará un bloque `const firebaseConfig = { apiKey: ..., authDomain: ..., projectId: ... }`. **Cópialo y pásaselo a Claude** (no es secreto) para que lo ponga en `config.js`, o pégalo tú en ese archivo.
7. Apunta el **projectId** (lo necesitas en el paso 3).

## 2. Anthropic (la IA)

1. Entra en <https://console.anthropic.com> y crea una cuenta.
2. **Settings → Billing**: añade una tarjeta y algo de saldo (con 5–10 USD tienes para muchos planes). Puedes poner un **límite de gasto mensual** en *Limits*.
3. **Settings → API Keys → Create Key** → nombre `gymonkey` → copia la clave (empieza por `sk-ant-…`). **No la compartas con nadie ni la pegues en el chat**: solo va en Vercel (paso 3).

## 3. Vercel (publicar la app)

1. Entra en <https://vercel.com/signup> → **Continue with GitHub**.
2. **Add New… → Project** → busca **Gymonkey** → **Import**. (Si no aparece, pulsa *Adjust GitHub App Permissions* y dale acceso a ese repositorio).
3. *Framework Preset*: **Other**. No cambies nada más de la compilación.
4. Despliega **Environment Variables** y añade:

   | Nombre | Valor |
   |---|---|
   | `ANTHROPIC_API_KEY` | tu clave `sk-ant-…` |
   | `FIREBASE_PROJECT_ID` | el projectId de Firebase |
   | `ALLOWED_EMAILS` | tu correo de Google (y los de quien quieras invitar, separados por comas). Así nadie más gasta tu saldo de IA. |
   | `ALLOWED_EMAILS_EXTRA` | (opcional) correos invitados, separados por comas. Se suman a `ALLOWED_EMAILS`, así puedes invitar sin tocar la tuya. |

5. **Deploy**. En 1–2 minutos tendrás una dirección tipo `https://gymonkey-xxxx.vercel.app`.
6. Vuelve a Firebase → **Authentication → Configuración (Settings) → Dominios autorizados → Agregar dominio** → pega `gymonkey-xxxx.vercel.app` (sin `https://`).

Cada vez que se suban cambios al repositorio, Vercel publica la nueva versión automáticamente.

## 4. Instalar en el móvil (Android)

1. Abre la dirección de Vercel en **Chrome**.
2. Menú **⋮ → Instalar app** (o *Añadir a pantalla de inicio*).
3. Abre Gymonkey → **Entrar** (arriba) → elige tu cuenta de Google.
4. Pestaña **🧠 Plan → Crear mi plan**.

En iPhone: Safari → Compartir → *Añadir a pantalla de inicio*.

---

### Opcional

- **Modelos de IA**: para gastar menos, el *plan nuevo* usa *Claude Sonnet 5.5* y todo lo demás (chat, preguntas, ajustes, dictado, cargas, revisión semanal) usa *Claude Haiku 5.5*. Se cambian con variables en Vercel y un nuevo despliegue: `CLAUDE_MODEL_PLAN` (plan nuevo), `CLAUDE_MODEL_FAST` (el resto) o `CLAUDE_MODEL` (fuerza el mismo modelo en todo, por ejemplo `claude-opus-5-5` si quieres máxima calidad). El consumo de cada llamada queda en los logs de Vercel con la etiqueta `ai-usage`.
- **Uso comercial**: el plan gratuito de Vercel es para proyectos personales. Si vas a cobrar por la app, necesitas Vercel Pro.
- **Regenerar el paquete de Firebase** (solo para desarrolladores): `npm install && npm run build:firebase`.

### Google Calendar (poner hora a las sesiones)

En Entrenar, al tocar una sesión del plan → **Poner hora**, la app puede crear el evento en el calendario principal de tu cuenta de Google, con el resumen de la sesión (ejercicios, series, repeticiones, RIR y carga) en las notas. Si mueves, intercambias o saltas la sesión, el evento se mueve o se borra. Para que funcione hay que activarlo una vez en el proyecto de Google Cloud que creó Firebase:

1. Entra en <https://console.cloud.google.com> y elige el proyecto de Firebase (`gymonkey`).
2. **APIs y servicios → Biblioteca** → busca **Google Calendar API** → **Habilitar**.
3. **APIs y servicios → Pantalla de consentimiento de OAuth** (o *Google Auth Platform*) → **Acceso a los datos / Permisos** → **Agregar permisos** → marca `.../auth/calendar.events` → **Guardar**.
4. Mientras la app esté en modo **Prueba**, añade en **Público → Usuarios de prueba** los correos que la vayan a usar. Google mostrará el aviso «Google no ha verificado esta aplicación»: toca *Continuar*. Para quitar el aviso a todo el mundo hay que pasar la verificación de Google (el permiso de calendario es «sensible»).

**Enlaces para la pantalla de consentimiento** (Google los pide para verificar la app): en <https://console.cloud.google.com/auth/branding?project=gymonkey> usa como página principal `https://gymonkey.vercel.app`, como política de privacidad `https://gymonkey.vercel.app/legal#privacy` y como condiciones del servicio `https://gymonkey.vercel.app/legal#terms`. El correo de contacto de la página legal se configura en `CONTACT_EMAIL` (archivo `site.js`).

El permiso de calendario se pide la primera vez que guardas una hora con la casilla marcada (una ventana de Google). El token dura una hora: pasado ese tiempo, al guardar otra hora la ventana se abre y se cierra sola; si algún cambio queda pendiente, aparece un botón **Actualizar** en el calendario de Entrenar.

### Acceso abierto con cuota por persona

Para que cualquiera pueda registrarse con Google y usar la IA sin que lo apruebes, deja **vacías** `ALLOWED_EMAILS` y `ALLOWED_EMAILS_EXTRA`
y conecta un Upstash Redis (Vercel → tu proyecto → **Storage** → **Create** → Upstash for Redis → conéctalo al proyecto; añade solo las variables
`KV_REST_API_URL` y `KV_REST_API_TOKEN`). El servidor cuenta las peticiones de cada persona por día (UTC) y por tipo, y pasado el límite responde con un aviso:

| Tipo | Por día y persona | Variable para cambiarlo |
|---|---|---|
| Preguntas previas al plan | 4 | `QUOTA_QUESTIONS` |
| Planes nuevos | 2 | `QUOTA_GENERATE` |
| Ajustes del plan | 8 | `QUOTA_ADAPT` |
| Mensajes al coach | 60 | `QUOTA_CHAT` |
| Dictado e importación | 20 | `QUOTA_SESSIONS` |
| Revisión de la semana | 6 | `QUOTA_REVIEW` |
| Estimación de cargas | 6 | `QUOTA_LOADS` |

Si la IA falla, esa petición no cuenta. Si el acceso está abierto y no hay contadores configurados, el servidor **se niega a usar la IA** (para no abrir el gasto sin freno por error).
