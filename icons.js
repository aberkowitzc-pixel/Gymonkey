// Iconos SVG de trazo uniforme (24×24, color = el del texto). Sustituyen a los emojis.
const PATHS = {
 "train": "<path d=\"M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11\"/>",
 "coach": "<path d=\"M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z\"/><path d=\"M8.5 12h.01M12 12h.01M15.5 12h.01\"/>",
 "list": "<path d=\"M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01\"/>",
 "calendar": "<rect x=\"3.5\" y=\"5\" width=\"17\" height=\"15\" rx=\"2\"/><path d=\"M3.5 10h17M8 3v4M16 3v4\"/>",
 "trend": "<path d=\"M3 17l6-6 4 4 8-8M15 7h6v6\"/>",
 "settings": "<path d=\"M4 7h10M18 7h2M4 17h2M10 17h10\"/><circle cx=\"16\" cy=\"7\" r=\"2\"/><circle cx=\"8\" cy=\"17\" r=\"2\"/>",
 "mic": "<rect x=\"9\" y=\"3\" width=\"6\" height=\"11\" rx=\"3\"/><path d=\"M5 11a7 7 0 0 0 14 0M12 18v3\"/>",
 "import": "<path d=\"M12 4v11M7.5 10.5L12 15l4.5-4.5M5 20h14\"/>",
 "export": "<path d=\"M12 15V4M7.5 8.5L12 4l4.5 4.5M5 20h14\"/>",
 "check": "<path d=\"M5 12.5l4.5 4.5L19 7.5\"/>",
 "x": "<path d=\"M6 6l12 12M18 6L6 18\"/>",
 "plus": "<path d=\"M12 5v14M5 12h14\"/>",
 "target": "<circle cx=\"12\" cy=\"12\" r=\"8.5\"/><circle cx=\"12\" cy=\"12\" r=\"4.5\"/><circle cx=\"12\" cy=\"12\" r=\"1\"/>",
 "bulb": "<path d=\"M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z\"/>",
 "clock": "<circle cx=\"12\" cy=\"12\" r=\"8.5\"/><path d=\"M12 7.5V12l3 2\"/>",
 "send": "<path d=\"M12 19V5M6 11l6-6 6 6\"/>",
 "undo": "<path d=\"M9 7L4 12l5 5M4 12h10a5 5 0 0 1 0 8h-3\"/>",
 "edit": "<path d=\"M4 20l1-4L16.5 4.5a2 2 0 0 1 3 3L8 19l-4 1z\"/>",
 "clip": "<path d=\"M20 11.5l-8.2 8.2a5 5 0 0 1-7-7L13 4.5a3.3 3.3 0 0 1 4.7 4.7l-8.3 8.3a1.7 1.7 0 0 1-2.4-2.4l7.6-7.6\"/>",
 "file": "<path d=\"M7 3h7l5 5v13H7zM14 3v5h5\"/>",
 "clipboard": "<rect x=\"6\" y=\"5\" width=\"12\" height=\"16\" rx=\"2\"/><path d=\"M9 5V4h6v1M9 11h6M9 15h6\"/>",
 "lock": "<rect x=\"5\" y=\"11\" width=\"14\" height=\"9\" rx=\"2\"/><path d=\"M8 11V8a4 4 0 0 1 8 0v3\"/>",
 "alert": "<path d=\"M12 4l9 16H3z\"/><path d=\"M12 10v4M12 17h.01\"/>",
 "flask": "<path d=\"M9 3h6M10 3v6L5 19a1.5 1.5 0 0 0 1.3 2h11.4A1.5 1.5 0 0 0 19 19l-5-10V3\"/>",
 "flag": "<path d=\"M5 21V4M5 4h11l-2 4 2 4H5\"/>",
 "book": "<path d=\"M5 4h10a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h10\"/>",
 "move": "<path d=\"M5 12h14M13 6l6 6-6 6\"/>",
 "skip": "<path d=\"M5 5l9 7-9 7zM18 5v14\"/>",
 "link": "<path d=\"M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1\"/>",
 "reorder": "<path d=\"M8 4v16M5 7l3-3 3 3M16 20V4M13 17l3 3 3-3\"/>",
 "stop": "<rect x=\"6\" y=\"6\" width=\"12\" height=\"12\" rx=\"2\"/>",
 "dumbbell": "<path d=\"M6.5 6.5v11M17.5 6.5v11M3.5 9v6M20.5 9v6M6.5 12h11\"/>"
};

/** Devuelve el SVG del icono; `cls` añade clases. Son decorativos: el texto del botón ya dice qué hace. */
export const ic = (name, cls = '') => `<svg class="ico${cls ? ` ${cls}` : ''}" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${PATHS[name] || ''}</svg>`;
