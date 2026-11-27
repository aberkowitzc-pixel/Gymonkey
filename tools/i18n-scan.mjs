// Escáner de textos: lista los textos visibles escritos en el código que NO pasan por t()/tn().
// Uso: node tools/i18n-scan.mjs [archivos…]   ·   También lo usa la prueba test/i18n.test.js.
import fs from 'node:fs';
import * as acorn from 'acorn';

export const FILES = ['app.js', 'plan.js', 'sessions.js', 'week.js', 'loads.js', 'context.js', 'weekplan.js', 'progression.js', 'calendar.js', 'exercises.js'];

// Identificadores internos que no son texto para la persona (se comparan con el texto completo del literal).
const IDENT = /^(?:[a-z][a-z0-9_-]*|[A-Z][A-Z0-9_]+|\d+(?:[-–.]\d+)*|[A-Za-z]+:[a-z-]+)$/;
const SKIP_VALUES = new Set([
  // identificadores en español que el código usa como datos (no se muestran tal cual: pasan por t() al mostrarse)
  'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo',
  'Pecho', 'Espalda', 'Piernas', 'Glúteos', 'Hombros', 'Brazos', 'Core', 'Cardio', 'Otros',
  'Plancha', 'Entreno libre', 'Mujer', 'Hombre',
]);

const HUMAN = /[A-Za-zÁÉÍÓÚáéíóúñÑ¿¡]{3,}/;
/** Quita etiquetas HTML y expresiones ${…} y deja el texto que vería la persona. */
function visibleText(s) {
  return s.replace(/<[^>]*>/g, ' ').replace(/\$\{[^}]*\}/g, ' ').replace(/&[a-z#0-9]+;/g, ' ').replace(/\s+/g, ' ').trim();
}

export function scanSource(src, file = '') {
  const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
  const found = [];
  const lineOf = (n) => n.loc.start.line;

  function isTCall(parent, node) {
    return parent && parent.type === 'CallExpression' && parent.callee.type === 'Identifier' && ['t', 'tn', 'T', 'E'].includes(parent.callee.name) && parent.arguments.includes(node);
  }

  function visit(node, parent, ancestors) {
    if (!node || typeof node.type !== 'string') return;
    const anc = [...ancestors, node];
    if (node.type === 'Literal' && typeof node.value === 'string') check(node.value, node, parent, anc);
    if (node.type === 'TemplateLiteral') {
      const s = node.quasis.map((q) => q.value.cooked).join('${}');
      check(s, node, parent, anc, true);
    }
    for (const k of Object.keys(node)) {
      if (k === 'loc' || k === 'type') continue;
      const v = node[k];
      if (Array.isArray(v)) v.forEach((c) => c && typeof c.type === 'string' && visit(c, node, anc));
      else if (v && typeof v.type === 'string') visit(v, node, anc);
    }
  }

  function check(value, node, parent, anc, template = false) {
    if (isTCall(parent, node)) return;                        // ya está traducido
    // Dentro de un t(...) anidado en una expresión de plantilla se ignora (se evalúa aparte).
    if (parent?.type === 'ImportDeclaration' || parent?.type === 'ExportAllDeclaration' || parent?.type === 'ExportNamedDeclaration') return;
    if (parent?.type === 'Property' && parent.key === node) return;       // clave de objeto
    if (parent?.type === 'MemberExpression' && parent.property === node) return;
    let text = template ? visibleText(value) : value.trim();
    if (!template && text.startsWith('<')) text = visibleText(text);
    if (/^(🎯\s*)?[×·\s]*(RIR)?\s*$/.test(text.replace(/\$\{\}/g, '')) || /^[\w-]+=["']/.test(text)) return;   // solo marcado, siglas o atributos
    if (!text || !HUMAN.test(text)) return;
    if (text.length > 600) return;   // prompts largos para otra IA: tienen su propia versión por idioma
    if (/^[×·+\s]*(RIR[\s×·+]*)+$/.test(text.replace(/\$\{\}/g, ''))) return;   // solo siglas y símbolos (p. ej. "3×8-10 · RIR 2")
    if (SKIP_VALUES.has(text) || text.startsWith('Write the content of the document in Hebrew')) return;   // este último es parte del prompt para otra IA
    if (!template && IDENT.test(text)) return;
    // Selectores, expresiones regulares en cadenas, rutas, colores…
    if (/^(Bearer|q_|gymonkey-|Enter$|Gymonkey$|Notification$|2-digit$|banner$|icon-|&[a-z]+;)|^[a-z]+\[[a-z-]+/.test(text)) return;
    if (parent?.type === 'CallExpression' && parent.callee.type === 'MemberExpression' && parent.callee.object.name === 'console') return;
    if (/^[.#\[]|^\/|^https?:|^#[0-9a-f]{3,8}$|^[\w-]+\.(js|png|svg|json|css|md)$/i.test(text)) return;
    // Plantillas que solo contienen marcado y expresiones (sin texto propio).
    if (template && !/[A-Za-zÁÉÍÓÚáéíóúñÑ¿¡]{3,}/.test(text.replace(/[A-Za-z]+\([^)]*\)/g, ' '))) return;
    // Una cadena con una sola palabra en minúsculas (id, clase, tipo) no es texto.
    if (!template && !/\s|[ÁÉÍÓÚáéíóúñ¿¡]/.test(text) && /^[a-z]/.test(text)) return;
    found.push({ file, line: lineOf(node), text: text.length > 140 ? `${text.slice(0, 140)}…` : text });
  }

  visit(ast, null, []);
  return found;
}

/** Claves (textos en español) usadas en llamadas t(), tn() y T() con literal. */
export function usedKeys(src, exKeys = new Set()) {
  const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module' });
  const keys = new Set();
  const lit = (n) => (n?.type === 'Literal' && typeof n.value === 'string' ? n.value : n?.type === 'TemplateLiteral' && n.expressions.length === 0 ? n.quasis[0].value.cooked : null);
  (function walk(n) {
    if (!n || typeof n.type !== 'string') return;
    if (n.type === 'CallExpression' && n.callee.type === 'Identifier') {
      const name = n.callee.name;
      const idx = name === 'tn' ? [1, 2] : ['t', 'T'].includes(name) ? [0] : [];
      if (name === 'E') { const k = lit(n.arguments[0]); if (k) exKeys.add(k); }
      idx.forEach((i) => { const k = lit(n.arguments[i]); if (k) keys.add(k); });
    }
    for (const k of Object.keys(n)) { const v = n[k]; if (Array.isArray(v)) v.forEach(walk); else if (v && typeof v.type === 'string') walk(v); }
  })(ast);
  return keys;
}

export function scanFiles(files = FILES) {
  return files.filter((f) => fs.existsSync(f)).flatMap((f) => scanSource(fs.readFileSync(f, 'utf8'), f));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const files = process.argv.slice(2);
  const out = scanFiles(files.length ? files : FILES);
  for (const f of out) console.log(`${f.file}:${f.line}  ${f.text}`);
  console.log(`\n${out.length} textos sin traducir`);
}
