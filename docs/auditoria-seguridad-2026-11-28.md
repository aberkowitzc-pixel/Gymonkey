# Auditoría de seguridad de Gymonkey — 2026-11-28

Commit auditado: `1e957e9`. Metodología: skills de Trail of Bits instalados en `.claude/skills/`
(ver `.claude/skills/README.md`), aplicados en cuatro frentes y verificados con `fp-check`.

| Frente | Skill | Resultado |
|---|---|---|
| 1. Configuración insegura por defecto | `insecure-defaults` | F3, F4, F5 |
| 2. APIs y diseños propensos a error | `sharp-edges` | F1, F2 |
| 3. Cadena de suministro | `supply-chain-risk-auditor` (+ `npm audit`) | F6 |
| 4. Análisis estático | `semgrep` (OSS) | 784 resultados brutos; 1 relevante (F2), el resto falsos positivos o ruido |

## Estado de las correcciones (aplicadas tras la auditoría)

| ID | Corrección | Comprobación |
|---|---|---|
| F1 | Las respuestas que la IA ya generó (`max_tokens`, `refusal`, formato inesperado) se marcan `billed` y no devuelven la cuota (`lib/planner.js`, `lib/handler.js`). | PoC: 2 peticiones servidas de 10 (límite 2). Test nuevo en `test/handler.test.js`. |
| F2 | `esc(day.movedTo)` y `esc(x.sets)`. `migrate()` descarta `moves` y `adjust` con fechas que no son ISO y fuerza `sets` a número; cubre la copia local, la importada y la de la nube (`app.js`). | PoC: el movimiento malicioso se descarta y no se ejecuta JS. |
| F3 | `ALLOW_ANONYMOUS` se ignora con `VERCEL_ENV=production`, y la protección 503 también se aplica en producción (`lib/auth.js`, `lib/handler.js`). | Test nuevo. |
| F4 | `generate` falla en cerrado (503 «El control de uso no está disponible…») si Upstash no responde; el resto sigue en abierto (`lib/quota.js`). | Test actualizado en `test/quota.test.js`. |
| F5 | `vercel.json`: `Content-Security-Policy` (`script-src 'self' https://apis.google.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none'`), `X-Content-Type-Options` y `Referrer-Policy`. | En Chromium la app carga sin errores y bloquea un `onerror` inyectado. **Falta probar el inicio de sesión con Google en el despliegue real.** |
| F6 | Sin cambios: solo afecta a desarrollo. | — |

## Resumen de hallazgos

| ID | Severidad | Hallazgo | Ubicación | Verificado |
|---|---|---|---|---|
| F1 | **Alta** | La cuota diaria se devuelve en cualquier fallo de la IA, incluidos los que provoca el propio cliente → gasto de IA ilimitado | `lib/handler.js:75` | PoC: 10 planes servidos con límite 2 |
| F2 | **Media** | XSS DOM almacenado vía `moves[].to` en una copia de seguridad importada | `app.js:1345` | PoC en Chromium: se ejecuta JS |
| F3 | Media (configurable) | `ALLOW_ANONYMOUS=true` sin `FIREBASE_PROJECT_ID` abre la IA sin sesión y se salta la protección 503 | `lib/auth.js:20`, `lib/handler.js:50` | Traza de código |
| F4 | Baja | La cuota falla en abierto si Upstash no responde | `lib/quota.js:51-54` | Traza de código (intencionado) |
| F5 | Baja | Sin cabeceras de seguridad (CSP, `frame-ancestors`, `nosniff`, `Referrer-Policy`) | `vercel.json` | Revisión de configuración |
| F6 | Baja (solo desarrollo) | `@grpc/grpc-js@1.9.16` con 2 avisos de severidad alta, vía `firebase` (devDependency) | `package-lock.json:1230` | `npm audit` |

---

## F1 — Bypass de la cuota diaria por reembolso (Alta)

**Qué pasa.** `handlePlanRequest` devuelve el intento de cuota (`slot.refund()`) ante *cualquier*
excepción de `runPlanner` que no sea una cancelación (`lib/handler.js:73-75`). Entre esas
excepciones están `PlannerError` por `stop_reason === 'max_tokens'`, `'refusal'` o
`parsed_output` vacío (`lib/planner.js:496-498`). Esos casos se producen **después** de que
Anthropic haya facturado la generación completa: en `generate` son hasta 64 000 tokens de
salida de Sonnet por petición (`maxTokens: 64000`).

**Cómo se explota.** El perfil y los textos libres que manda el cliente acaban en el prompt.
Un usuario con sesión (en modo acceso abierto, cualquiera con cuenta de Google) puede pedir
una salida que agote `max_tokens` («repite X sin parar», un plan de 52 semanas y 7 días con
notas enormes…). Cada petición falla con `max_tokens`, la cuota se devuelve y el contador
vuelve a 0. Así repite sin límite la tarea más cara.

**PoC** (cliente de Anthropic simulado que termina en `max_tokens`, Redis simulado, límite `generate` = 2):

```
{ limitGenerate: 2, requestsServed: 10, billedModelCalls: 10, counterAfter: [ 0 ] }
```

**Arreglo propuesto.**
- Devolver la cuota solo cuando la IA no llegó a generar (errores de red o `Anthropic.APIError`
  antes de la respuesta, `RateLimitError`, 5xx), nunca en `max_tokens`, `refusal` ni con un
  formato inesperado. Una regla sencilla: no reembolsar si `message.usage.output_tokens > 0`.
- Añadir un tope global diario de gasto o de peticiones (`quota:global:<día>`) como red de seguridad.
- Configurar un límite de gasto mensual en la consola de Anthropic.

## F2 — XSS DOM almacenado vía copia importada (Media)

**Qué pasa.** En el diálogo de un día movido, `app.js:1345` interpola `day.movedTo` sin escapar
cuando `calCell(day.movedTo)` no encuentra el día:

```js
`↪ ${t('Movida al {day}', { day: dest ? dayLabel(dest) : day.movedTo })}`
```

`day.movedTo` sale de `state.moves[].to` (`calendar.js:81,111`). La importación de copias
(`app.js:1486-1490`) solo comprueba que haya tres arrays y no valida `moves`. `t()` no escapa
los parámetros (`i18n.js:40`).

**Cómo se explota.** El atacante comparte un `.json` («mi rutina, impórtala») con
`moves: [{ name, from: <lunes con rutina>, to: '<img src=x onerror=…>' }]`. Al tocar ese día en
el calendario, el JS se ejecuta en el origen de la app. Puede leer el token de Firebase
(IndexedDB), leer y modificar los datos de la víctima en Firestore y gastar su cuota de IA. El
dato se sincroniza con la nube, así que el XSS persiste en todos sus dispositivos durante 21 días
(`pruneSchedule`).

**PoC.** Con Playwright y ese estado en `localStorage`, al pulsar el día se obtiene
`window.__xss = 127.0.0.1`.

**Arreglo propuesto.**
- `esc(day.movedTo)` (y revisar el mismo patrón en los toasts, que usan `textContent` y son seguros).
- Validar la copia importada: `moves[].from/to` con `/^\d{4}-\d{2}-\d{2}$/`, y tipos y longitudes en el resto.
- Añadir una CSP (ver F5) como defensa en profundidad.

## F3 — `ALLOW_ANONYMOUS` abre la IA sin límites (Media, configurable)

Si `FIREBASE_PROJECT_ID` no está definido y `ALLOW_ANONYMOUS === 'true'`, `verifyUser` devuelve
`{ uid: 'anonimo' }` sin token (`lib/auth.js:19-21`). La protección «acceso abierto sin
contadores → 503» (`lib/handler.js:50`) solo se activa **si** `FIREBASE_PROJECT_ID` existe, así
que en esa configuración cualquiera en Internet usa la IA sin sesión y, sin Upstash, sin cuota.
La variable no aparece en `SETUP.md`. Solo se produce si alguien la activa: hoy no es un fallo
en producción, pero un solo interruptor desactiva toda la seguridad.

**Arreglo propuesto.** Quitar `ALLOW_ANONYMOUS` o limitarlo a `NODE_ENV !== 'production'`/`VERCEL_ENV !== 'production'`.
Además, aplicar la regla 503 según el estado efectivo (sin allowlist y sin cuota), no según `FIREBASE_PROJECT_ID`.

## F4 — Cuota en modo fail-open (Baja)

`takeQuota` deja pasar la petición si Upstash falla (`lib/quota.js:51-54`). Está documentado y
es intencionado, pero una caída de Redis equivale a acceso sin límites. Recomendación: fail-closed
para `generate` (la más cara) o un límite en memoria por instancia como respaldo.

## F5 — Faltan cabeceras de seguridad (Baja)

`vercel.json` no define CSP, `X-Frame-Options`/`frame-ancestors`, `X-Content-Type-Options` ni
`Referrer-Policy`. Una CSP como `default-src 'self'; script-src 'self'; connect-src 'self'
https://*.googleapis.com https://*.firebaseio.com; img-src 'self' data: https://*.googleusercontent.com;
frame-src https://gymonkey.firebaseapp.com; object-src 'none'; base-uri 'none'; frame-ancestors 'none'`
habría bloqueado la PoC de F2 (`onerror` inline). Hay que probarla con el inicio de sesión de Google.

## F6 — Dependencias (Baja, solo desarrollo)

- `npm audit --package-lock-only`: 4 avisos de severidad alta, todos en la cadena
  `firebase → @firebase/firestore → @grpc/grpc-js@1.9.16` (GHSA-m9gg-hp2v-232j, GHSA-f596-whhp-79r4).
  `firebase` es devDependency y el bundle del navegador (`vendor/firebase.js`) no incluye el
  transporte gRPC de Node (solo aparece el nombre de una opción), así que no llega a producción.
  `npm audit fix --force` propone bajar a `firebase@9.14.0`, que **no** es recomendable. Basta con
  seguir las versiones nuevas de `firebase`.
- `supply-chain-risk-auditor`: 0 de 5 dependencias directas marcadas. Ninguna está deprecada y
  ninguna ejecuta scripts de instalación. 3 de 5 publican con provenance (no lo hacen `acorn` ni
  `firebase`). Esbuild, protobufjs y @firebase/util declaran `hasInstallScript`; todas son de desarrollo.
- Cobertura limitada: api.osv.dev y api.github.com estaban bloqueados en este entorno, así que no
  se evaluaron con el colector los avisos, el archivado ni el mantenimiento. `npm audit` cubrió los
  avisos de todo el árbol.

## Aspectos revisados sin hallazgos

- **Verificación de JWT** (`lib/auth.js`): `jose` con JWKS remoto de Google, `issuer` y `audience` fijados y
  el algoritmo tomado de la JWKS, no del token. `email_verified` es obligatorio cuando hay allowlist.
- **Reglas de Firestore**: cada usuario solo accede a `users/{uid}/**`.
- **Clave de Firebase en `config.js`**: pública por diseño (5 avisos de Semgrep son falsos positivos).
  Recomendación: restringir la API key por referrer HTTP en Google Cloud y revisar los dominios autorizados.
- **Clave de Anthropic**: solo en el servidor. Los errores que llegan al cliente son mensajes genéricos (`friendlyError`).
- **Service worker**: no cachea `/api/` ni otros orígenes.

## Falsos positivos descartados (Semgrep)

- `insecure-innerhtml` / `insecure-document-method` (6): plantillas con `esc()` aplicado; el único
  caso real es F2, que Semgrep no detectó directamente.
- `prototype-pollution-assignment` (3): las claves vienen de `data-*` que genera la propia app.
- `unsafe-dynamic-method` (2): mapas internos de vistas y acciones con claves fijas.
- `detect-redos` (2): `tools/i18n-scan.mjs`, un script de desarrollo.
- `i18next-key-format`, `missing-template-string-indicator`, `html-in-template-string`,
  `detect-generic-ai-anthprop`: 1 100 resultados de estilo o informativos.

## Limitaciones

- Semgrep corrió en modo OSS (sin taint entre archivos). semgrep.dev estaba bloqueado, así que se
  usaron los repos `trailofbits/semgrep-rules` y `semgrep/semgrep-rules` en lugar de los rulesets
  `p/*` del registro.
- La revisión manual de XSS cubrió los patrones de interpolación más comunes, no todas las plantillas
  de `app.js`, `plan.js` y `sessions.js`.
- La PoC de F1 simula la respuesta de la IA. No se comprobó contra la API real que un prompt fuerce `max_tokens`.
