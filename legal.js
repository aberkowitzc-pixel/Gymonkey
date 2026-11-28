// Página de términos y condiciones y política de privacidad (es / en / he).
import { SITE, LEGAL, UPDATED, CONTACT_EMAIL, pickLang, saveLang, applyTheme, esc } from './site.js';

const LANG_NAMES = { es: 'ES', en: 'EN', he: 'עב' };
const root = document.getElementById('site');
let lang = pickLang();

const section = ([title, paras]) => `<h3>${esc(title)}</h3>${paras.map((p) => `<p>${esc(p)}</p>`).join('')}`;

function render() {
  const c = LEGAL[lang], s = SITE[lang];
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr';
  document.title = `Gymonkey · ${c.title}`;
  root.innerHTML = `
    <header class="top">
      <div class="wrap top-in">
        <a class="brand" href="./?home"><img src="icon.svg" alt="" width="32" height="32"><span>Gymonkey</span></a>
        <label class="lang"><span class="sr-only">${esc(s.nav.lang)}</span>
          <select id="lang" aria-label="${esc(s.nav.lang)}">${Object.entries(LANG_NAMES).map(([k, v]) => `<option value="${k}" ${k === lang ? 'selected' : ''} lang="${k}">${v}</option>`).join('')}</select>
        </label>
      </div>
    </header>
    <main class="legal">
      <div class="wrap">
        <h1>${esc(c.title)}</h1>
        <p class="muted">${esc(c.updated.replace('{date}', UPDATED[lang]))}</p>
        <nav class="toc"><a href="#terms">${esc(c.toc.terms)}</a><a href="#privacy">${esc(c.toc.privacy)}</a></nav>
        <h2 id="terms">${esc(c.toc.terms)}</h2>
        ${c.terms.map(section).join('')}
        <h2 id="privacy">${esc(c.toc.privacy)}</h2>
        ${c.privacy.map(section).join('')}
        ${CONTACT_EMAIL ? `<p class="contact"><b>${esc(c.contact)}:</b> <a href="mailto:${esc(CONTACT_EMAIL)}" dir="ltr">${esc(CONTACT_EMAIL)}</a></p>` : ''}
        <p style="margin-top:32px"><a href="./?home">${esc(c.back)}</a></p>
      </div>
    </main>`;
}

root.addEventListener('change', (ev) => {
  if (ev.target.id !== 'lang') return;
  lang = ev.target.value;
  saveLang(lang);
  const hash = location.hash;
  history.replaceState(null, '', `?lang=${lang}${hash}`);
  render();
  document.getElementById('lang')?.focus();
});

applyTheme();
render();
// El contenido se dibuja con JavaScript: se salta al apartado del enlace (#terms o #privacy) una vez dibujado.
if (location.hash) document.querySelector(location.hash)?.scrollIntoView();
