# Gymonkey 🏋️

App web (PWA) para registrar tus entrenamientos en el gimnasio, con un **entrenador IA** que diseña y ajusta tu plan. Funciona en el móvil, se instala en la pantalla de inicio y el registro de entrenos funciona sin conexión.

👉 **Para ponerla en marcha (cuentas, IA y publicación) sigue [SETUP.md](SETUP.md).**

## Qué puedes hacer

- **Plan con IA** (pestaña 🧠): cuestionario inicial (objetivo, días, tiempo, experiencia, material, lesiones) → preguntas de seguimiento de la IA → plan por **mesociclos** basado en evidencia científica (volumen, frecuencia, RIR, descansos, descargas), con las fuentes citadas. Se convierte en tus rutinas con un toque, se puede **editar a mano** y **ajustar con IA** (menos/más días, cambiar días, sesiones más cortas, molestias…), con opción de deshacer.
- **Continuidad con lo que ya haces**: al crear el plan y en "Ajustar con IA" puedes adjuntar un archivo `.md`/`.txt` o pegar tu plan actual y tus notas. La app también copia un **prompt para tu otra IA** (ChatGPT, Gemini, Claude…): lo pegas en la conversación donde ya hablaste de tu entrenamiento y te devuelve un resumen en Markdown con todo lo que sabe de ti (perfil, historial, plan actual, progresión de marcas, preferencias…). Y puedes exportar tus datos de Gymonkey en Markdown. El entrenador mantiene tu estructura, usa tus pesos y entra en la semana del plan que te corresponde. Límite: 40.000 caracteres.
- **Calendario en Entrenar**: la tarjeta de hoy con un botón para empezar, y esta semana y la próxima con lo que toca, lo que hiciste (✓ hecho, ◐ parcial) y lo que se quedó sin hacer. Un entreno hecho otro día de la semana cuenta para su día previsto.
- **Reprogramar**: si un día no entrenas, mueves esa sesión a otro día (libre, o intercambiándola con otra), la saltas, o haces solo lo que faltó de una sesión parcial. Es un cambio de esa semana: el plan no se toca.
- **Revisión de la semana con IA**: cuando hay sesiones sin hacer o a medias, la IA mira el volumen por músculo de la semana (previsto, hecho y lo que aún queda) y decide si compensar. Puede proponer mover una sesión, saltarla, o repartir lo que faltó en las sesiones que quedan (series extra o algún ejercicio). Con una semana de descarga o un déficit pequeño dice que no hace falta cambiar nada. Tú eliges qué propuestas aplicar; las que no encajan con tu calendario se descartan.
- **Terminar a medias**: al terminar puedes guardar lo que hiciste aunque no completes todos los ejercicios (series con datos sin marcar ✓ incluidas). La sesión queda como parcial, anota lo que no hiciste y las cargas siguientes lo tienen en cuenta (no sube el peso de un ejercicio que quedó incompleto).
- **Ejercicios reconocidos**: "Press banca" y "Press de banca" se reconocen como el mismo (sin confundir variantes como sentadilla búlgara o el material: barra, mancuernas). Si hay duplicados, la app te los propone para **unir**, conservando todo el historial. En el historial puedes **editar** un entreno (kilos, series, fecha, a qué ejercicio corresponde).
- **Entrenar con todo sugerido**: cada serie viene con peso y repeticiones propuestos (en verde) y solo tienes que confirmarlos con ✓ o corregirlos.
- **Orden y bloques**: reordena los ejercicios del entreno arrastrando (o con flechas) y une ejercicios en **bloques alternados** (una serie de cada uno, "uno y uno"): la app te dice qué toca ahora y descansa al terminar cada ronda.
- **Registrar hablando**: dicta (o escribe) lo que hiciste y la IA lo ordena en series. Si algo queda incompleto, te lo pregunta antes de guardar. Sirve para un entreno ya hecho o para completar uno en curso.
- **Importar historial**: pega o sube el resumen de tu otra IA (el prompt ya le pide las sesiones con fecha) y las sesiones antiguas se añaden a tu historial, sin duplicar las que ya tienes.
- **Un plan completo: ejercicios, series, repeticiones, carga y descanso**: cada ejercicio con carga externa lleva su peso de partida, calculado desde tus marcas reales (tu historial y las marcas del cuestionario), por relación con ejercicios parecidos, o estimado con prudencia según tu nivel y tu peso corporal. Se ve en la tabla del plan ("≈ 40 kg" estimada, "60 kg" de tus marcas, "peso corp.") y es el punto de partida de la primera sesión; desde la segunda, la app lo actualiza con la progresión.
- **Estimar cargas con IA**: si algún ejercicio de tu plan no tiene carga de partida ni historial (por ejemplo, en un plan creado antes), aparece un aviso con un botón que las calcula; puedes corregir cada valor antes de guardarlo.
- **Cargas y sobrecarga progresiva**: la app propone el peso de cada ejercicio por **doble progresión** a partir de lo que registras (si completas todas las series en el tope del rango de repeticiones, sube; si no, mantén y suma repeticiones; si te quedas lejos, baja un 5 %). En la semana de descarga baja el peso a ≈ 90 % y las series a la mitad. La primera vez te pide calibrar, o parte de las marcas de referencia que des en el cuestionario.
- **Generación robusta**: barra de progreso real mientras la IA escribe el plan, botón Cancelar, y Reintentar sin perder tus respuestas si se corta la conexión.
- **Cuenta de Google**: inicia sesión para guardar todos tus datos en la nube y sincronizarlos entre dispositivos.
- **Entrenar**: empieza un entreno desde una rutina o vacío, apunta peso y repeticiones de cada serie y márcala como hecha (✓). Ves lo que hiciste la última vez en cada serie.
- **Cronómetro de serie** (▶): mide cuánto dura cualquier serie. En los ejercicios por tiempo (p. ej. plancha) avisa al llegar al objetivo y guarda los segundos.
- **Descanso entre series**: empieza solo al terminar cada serie. Muestra cuánto llevas y cuánto queda, se puede alargar o acortar (±15 s) y avisa con sonido, vibración y notificación. Descanso por defecto en ⚙️ Ajustes y descanso propio por ejercicio con el botón ⏱.
- **Pantalla de bloqueo**: el temporizador aparece en los controles multimedia del móvil, también bloqueado (se puede desactivar en Ajustes; si escuchas música en el mismo móvil, puede pausarla).
- **Rutinas**: crea y edita rutinas (vienen 3 de ejemplo: Push, Pull y Legs) y tu propia lista de ejercicios.
- **Historial**: todos tus entrenos con duración, series y volumen total.
- **Progreso**: gráfica del 1RM estimado (fórmula de Epley), peso máximo y evolución por ejercicio.
- **Copia de seguridad**: exporta e importa tus datos en JSON (pestaña Rutinas → Datos).

Sin iniciar sesión, los datos se guardan solo en el dispositivo. Con sesión iniciada se guardan también en tu cuenta (Firebase Firestore).

## Probarla en local

```bash
npm install
npx vercel dev      # web + servidor de IA (necesita las variables de entorno de SETUP.md)
npm test            # pruebas del servidor de IA (no llaman a la API)
```

Solo la parte sin IA: `python3 -m http.server 8000` y abre http://localhost:8000.

## Archivos

| Archivo | Para qué sirve |
|---|---|
| `index.html` | Estructura de la página y barra de pestañas |
| `styles.css` | Estilos (modo claro y oscuro automático) |
| `app.js` | Lógica principal: datos, vistas, temporizadores y sincronización |
| `plan.js` | Plan con IA: cuestionario, mesociclos, edición y ajustes |
| `context.js` | Prompt para otra IA y exportación de tus datos en Markdown |
| `progression.js` | Doble progresión: carga y repeticiones sugeridas de cada ejercicio |
| `sessions.js` | Registrar entrenos dictando y importar historial |
| `cloud.js`, `config.js` | Inicio de sesión con Google y guardado en Firestore |
| `api/plan.js`, `lib/` | Servidor (Vercel): verifica al usuario y llama a Claude |
| `firestore.rules` | Reglas de seguridad: cada persona solo ve sus datos |
| `vendor/firebase.js` | SDK de Firebase empaquetado (`npm run build:firebase`) |
| `sw.js` | Service worker: funciona sin conexión y gestiona las notificaciones |
| `manifest.webmanifest`, `icon*.svg/png` | Datos e iconos para instalarla como app |
