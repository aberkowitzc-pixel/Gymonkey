# Gymonkey 🏋️

App web (PWA) para registrar tus entrenamientos en el gimnasio, con un **entrenador IA** que diseña y ajusta tu plan. Funciona en el móvil, se instala en la pantalla de inicio y el registro de entrenos funciona sin conexión.

👉 **Para ponerla en marcha (cuentas, IA y publicación) sigue [SETUP.md](SETUP.md).**

## Qué puedes hacer

- **Plan con IA** (pestaña 🧠): cuestionario inicial (objetivo, días, tiempo, experiencia, material, lesiones) → preguntas de seguimiento de la IA → plan por **mesociclos** basado en evidencia científica (volumen, frecuencia, RIR, descansos, descargas), con las fuentes citadas. Se convierte en tus rutinas con un toque, se puede **editar a mano** y **ajustar con IA** (menos/más días, cambiar días, sesiones más cortas, molestias…), con opción de deshacer.
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
| `cloud.js`, `config.js` | Inicio de sesión con Google y guardado en Firestore |
| `api/plan.js`, `lib/` | Servidor (Vercel): verifica al usuario y llama a Claude |
| `firestore.rules` | Reglas de seguridad: cada persona solo ve sus datos |
| `vendor/firebase.js` | SDK de Firebase empaquetado (`npm run build:firebase`) |
| `sw.js` | Service worker: funciona sin conexión y gestiona las notificaciones |
| `manifest.webmanifest`, `icon*.svg/png` | Datos e iconos para instalarla como app |
