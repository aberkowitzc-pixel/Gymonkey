# Gymonkey 🏋️

App web (PWA) para registrar tus entrenamientos en el gimnasio. Funciona en el móvil, se puede instalar en la pantalla de inicio y funciona sin conexión.

## Qué puedes hacer

- **Entrenar**: empieza un entreno desde una rutina o vacío, apunta peso y repeticiones de cada serie y márcala como hecha (✓). Ves lo que hiciste la última vez en cada serie.
- **Cronómetro de serie** (▶): mide cuánto dura cualquier serie. En los ejercicios por tiempo (p. ej. plancha) avisa al llegar al objetivo y guarda los segundos.
- **Descanso entre series**: empieza solo al terminar cada serie. Muestra cuánto llevas y cuánto queda, se puede alargar o acortar (±15 s) y avisa con sonido, vibración y notificación. Descanso por defecto en ⚙️ Ajustes y descanso propio por ejercicio con el botón ⏱.
- **Pantalla de bloqueo**: el temporizador aparece en los controles multimedia del móvil, también bloqueado (se puede desactivar en Ajustes; si escuchas música en el mismo móvil, puede pausarla).
- **Rutinas**: crea y edita rutinas (vienen 3 de ejemplo: Push, Pull y Legs) y tu propia lista de ejercicios.
- **Historial**: todos tus entrenos con duración, series y volumen total.
- **Progreso**: gráfica del 1RM estimado (fórmula de Epley), peso máximo y evolución por ejercicio.
- **Copia de seguridad**: exporta e importa tus datos en JSON (pestaña Rutinas → Datos).

Los datos se guardan solo en tu dispositivo (`localStorage`); no hay servidor ni cuenta.

## Publicarla en GitHub Pages

1. El repositorio debe ser **público** (GitHub Pages en repositorios privados requiere un plan de pago).
2. En GitHub: **Settings → Pages → Build and deployment → Source: “Deploy from a branch”**.
3. Elige la rama con la app y la carpeta **/ (root)** y pulsa **Save**.
4. En uno o dos minutos estará en `https://<tu-usuario>.github.io/Gymonkey/`.
5. En el móvil, abre esa dirección y:
   - **Android (Chrome)**: menú ⋮ → *Instalar app* / *Añadir a pantalla de inicio*.
   - **iPhone (Safari)**: botón Compartir → *Añadir a pantalla de inicio*.

## Probarla en local

No necesita instalación ni compilación. Desde la carpeta del proyecto:

```bash
python3 -m http.server 8000
```

y abre http://localhost:8000. Para instalarla en el móvil, publícala con HTTPS (por ejemplo, GitHub Pages) y usa “Añadir a pantalla de inicio”.

## Archivos

| Archivo | Para qué sirve |
|---|---|
| `index.html` | Estructura de la página y barra de pestañas |
| `styles.css` | Estilos (modo claro y oscuro automático) |
| `app.js` | Toda la lógica: datos, vistas y acciones |
| `sw.js` | Service worker: funciona sin conexión y gestiona las notificaciones |
| `manifest.webmanifest`, `icon*.svg/png` | Datos e iconos para instalarla como app |
