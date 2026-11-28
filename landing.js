// Página de inicio: qué es Gymonkey, crear cuenta / iniciar sesión con Google y enlace a términos y privacidad.
import { SITE, pickLang, saveLang, applyTheme, esc } from './site.js';
import { ic } from './icons.js';
import * as cloud from './cloud.js';

const LANG_NAMES = { es: 'ES', en: 'EN', he: 'עב' };
const params = new URLSearchParams(location.search);
const root = document.getElementById('site');
let lang = pickLang();
let user = null;
let wantsApp = false;      // se pulsó crear cuenta / iniciar sesión: al entrar, ir a la app
let status = '';           // '', 'working', 'error'

const fill = (s, vars) => s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));

function authButtons(c, where) {
  if (user) {
    return `<a class="btn primary lg" href="app">${esc(c.nav.open)}</a>
      <p class="small muted">${esc(fill(c.auth.signedAs, { name: user.displayName || user.email || '' }))}</p>`;
  }
  return `<div class="btn-row">
      <button class="btn primary lg" data-auth="signup">${google()}${esc(where === 'cta' ? c.cta.button : c.hero.signup)}</button>
      ${where === 'hero' ? `<button class="btn lg" data-auth="login">${esc(c.hero.login)}</button>` : ''}
    </div>
    <p class="small muted">${fill(esc(c.hero.note), { terms: `<a href="legal?lang=${lang}#terms">${esc(c.hero.terms)}</a>`, privacy: `<a href="legal?lang=${lang}#privacy">${esc(c.hero.privacy)}</a>` })}</p>
    ${status ? `<p class="small status ${status}" role="status">${esc(status === 'working' ? c.auth.working : c.auth.error)}</p>` : '<p class="small status" role="status"></p>'}`;
}

/** Logo de Google (marca requerida en los botones de "Iniciar sesión con Google"). */
const google = () => '<span class="g" aria-hidden="true"><svg viewBox="0 0 24 24" focusable="false"><path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"/><path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"/><path fill="#FBBC05" d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"/><path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09C6.22 6.86 8.87 4.75 12 4.75z"/></svg></span>';

function mock(c) {
  const m = c.mock;
  return `<div class="mock" role="img" aria-label="${esc(m.aria)}">
    <div class="mock-top"><img src="icon.svg" alt="" width="22" height="22"><b>Gymonkey</b></div>
    <div class="mock-card accent">
      <small>${esc(m.today)}</small>
      <div class="mock-row"><strong>${esc(m.session)}</strong><span class="pill">${esc(m.week)}</span></div>
    </div>
    <div class="mock-card">
      ${m.ex.map(([n, s, kg], i) => `<div class="mock-ex${i === 0 ? ' cur' : ''}"><span>${esc(n)}</span><span class="num" dir="ltr">${esc(s)}</span><span class="num kg" dir="ltr">${esc(kg)}</span></div>`).join('')}
    </div>
    <div class="mock-next">${ic('check')}<span dir="auto">${esc(m.next)}</span></div>
  </div>`;
}

function render() {
  const c = SITE[lang];
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr';
  document.title = c.meta.title;
  document.querySelector('meta[name="description"]')?.setAttribute('content', c.meta.description);
  root.innerHTML = `
    <header class="top">
      <div class="wrap top-in">
        <a class="brand" href="./?home"><img src="icon.svg" alt="" width="32" height="32"><span>Gymonkey</span></a>
        <div class="top-actions">
          <label class="lang"><span class="sr-only">${esc(c.nav.lang)}</span>
            <select id="lang" aria-label="${esc(c.nav.lang)}">${Object.entries(LANG_NAMES).map(([k, v]) => `<option value="${k}" ${k === lang ? 'selected' : ''} lang="${k}">${v}</option>`).join('')}</select>
          </label>
          ${user ? `<a class="btn sm" href="app">${esc(c.nav.open)}</a>` : `<button class="btn sm" data-auth="login">${esc(c.nav.login)}</button>`}
        </div>
      </div>
    </header>

    <main>
      <section class="hero">
        <div class="wrap hero-in">
          <div class="hero-text">
            <p class="eyebrow">${esc(c.hero.eyebrow)}</p>
            <h1>${esc(c.hero.title)}</h1>
            <p class="lead">${esc(c.hero.sub)}</p>
            ${authButtons(c, 'hero')}
            ${user ? '' : `<a class="try" href="app">${esc(c.hero.tryIt)} <span aria-hidden="true">${lang === 'he' ? '←' : '→'}</span></a>`}
          </div>
          ${mock(c)}
        </div>
      </section>

      <section class="features" aria-labelledby="f-title">
        <div class="wrap">
          <h2 id="f-title">${esc(c.features.title)}</h2>
          <ul class="grid">
            ${c.features.items.map(([icon, title, text]) => `<li class="feat"><span class="feat-ic">${ic(icon)}</span><h3>${esc(title)}</h3><p>${esc(text)}</p></li>`).join('')}
          </ul>
          <ul class="chips">${c.extras.map((x) => `<li>${ic('check')}<span>${esc(x)}</span></li>`).join('')}</ul>
        </div>
      </section>

      <section class="steps" aria-labelledby="s-title">
        <div class="wrap">
          <h2 id="s-title">${esc(c.steps.title)}</h2>
          <ol class="step-list">
            ${c.steps.items.map(([title, text], i) => `<li><span class="step-n" aria-hidden="true">${i + 1}</span><div><h3>${esc(title)}</h3><p>${esc(text)}</p></div></li>`).join('')}
          </ol>
        </div>
      </section>

      <section class="cta">
        <div class="wrap cta-in">
          <h2>${esc(c.cta.title)}</h2>
          <p>${esc(c.cta.text)}</p>
          ${authButtons(c, 'cta')}
        </div>
      </section>
    </main>

    <footer class="foot">
      <div class="wrap">
        <p class="health">${ic('alert')}<span>${esc(c.footer.health)}</span></p>
        <nav class="foot-links"><a href="legal?lang=${lang}#terms">${esc(c.footer.legal)}</a><span>© ${new Date().getFullYear()} ${esc(c.footer.rights)}</span></nav>
      </div>
    </footer>`;
}

root.addEventListener('change', (ev) => {
  if (ev.target.id !== 'lang') return;
  lang = ev.target.value;
  saveLang(lang);
  render();
  document.getElementById('lang')?.focus();
});

root.addEventListener('click', async (ev) => {
  const b = ev.target.closest('[data-auth]');
  if (!b) return;
  if (!cloud.cloudConfigured || user) { location.href = 'app'; return; }
  wantsApp = true;
  status = 'working';
  render();
  try {
    await ready;
    await cloud.signIn();
    // Si la ventana se cerró sin entrar, se vuelve al estado normal.
    if (!cloud.currentUser()) { status = ''; render(); }
  } catch (e) {
    console.error(e);
    status = 'error';
    render();
  }
});

applyTheme();
render();

// Firebase se carga en segundo plano para que el botón de Google abra la ventana al instante.
const ready = cloud.initCloud((u) => {
  user = u;
  // Con sesión iniciada se va a la app (salvo que se haya pedido ver esta página con ?home).
  if (u && (wantsApp || !params.has('home'))) { location.replace('app'); return; }
  status = '';
  render();
}).catch((e) => console.error('No se pudo iniciar Firebase', e));
