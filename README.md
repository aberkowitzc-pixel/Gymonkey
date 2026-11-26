# Gymonkey 🏋️

App web (PWA) para registrar tus entrenamientos en el gimnasio. Funciona en el móvil, se puede instalar en la pantalla de inicio y funciona sin conexión.

## Qué puedes hacer

- **Entrenar**: empieza un entreno desde una rutina o vacío, apunta peso y repeticiones de cada serie y márcala como hecha. Ves lo que hiciste la última vez en cada serie y se lanza un temporizador de descanso (90 s) al completar una serie.
- **Rutinas**: crea y edita rutinas (vienen 3 de ejemplo: Push, Pull y Legs) y tu propia lista de ejercicios.
- **Historial**: todos tus entrenos con duración, series y volumen total.
- **Progreso**: gráfica del 1RM estimado (fórmula de Epley), peso máximo y evolución por ejercicio.
- **Copia de seguridad**: exporta e importa tus datos en JSON (pestaña Rutinas → Datos).

Los datos se guardan solo en tu dispositivo (`localStorage`); no hay servidor ni cuenta.

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
| `sw.js` | Service worker para funcionar sin conexión |
| `manifest.webmanifest`, `icon.svg` | Datos para instalarla como app |
