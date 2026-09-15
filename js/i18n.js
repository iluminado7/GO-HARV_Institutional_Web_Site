/**
 * GoHarv.® — Motor i18n con i18next
 * Robusto para: header dinámico, Apache, async race conditions
 */

const STORAGE_KEY  = 'gh_lang';
const DEFAULT_LANG = 'es';
const SUPPORTED    = ['es', 'en', 'pt'];

let currentLang = localStorage.getItem(STORAGE_KEY) || DEFAULT_LANG;
if (!SUPPORTED.includes(currentLang)) currentLang = DEFAULT_LANG;

let i18nReady = false;
window.i18nReady = false;

/* ─────────────────────────────────────────
   INIT
───────────────────────────────────────── */
async function initI18n() {

  await i18next.init({
    lng:           currentLang,
    fallbackLng:   'es',
    supportedLngs: SUPPORTED,
    resources:     {},
    interpolation: { escapeValue: false }
  });

  /* Ruta base: la raíz del sitio. Se toma de document.baseURI y no de
     location.href para respetar <base>: las páginas de team/ están un
     nivel más abajo y declaran <base href="../">. Sin <base>, las dos
     coinciden. */
  const base = document.baseURI.replace(/[?#].*$/, '').replace(/\/[^/]*$/, '');

  await Promise.all(
    SUPPORTED.map(lang =>
      fetch(`${base}/locales/${lang}/translation.json`)
        .then(r => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        })
        .then(data => {
          i18next.addResourceBundle(lang, 'translation', data, true, true);
        })
        .catch(err => console.warn(`[i18n] No se pudo cargar '${lang}':`, err))
    )
  );

  await i18next.changeLanguage(currentLang);
  i18nReady = true;
  window.i18nReady = true;

  translateDOM();
  updateToggle(currentLang);
  bindToggleButtons();
}

/* ─────────────────────────────────────────
   TRADUCIR DOM
───────────────────────────────────────── */
function translateDOM() {
  if (!i18nReady) return;

  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const val = i18next.t(key);
    if (val && val !== key) el.innerHTML = val;
  });

  document.querySelectorAll('[data-i18n-ph]').forEach(el => {
    const key = el.getAttribute('data-i18n-ph');
    const val = i18next.t(key);
    if (val && val !== key) el.placeholder = val;
  });

  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-title');
    const val = i18next.t(key);
    if (val && val !== key) el.title = val;
  });

  document.documentElement.lang = i18next.language;
}

/* ─────────────────────────────────────────
   CAMBIAR IDIOMA
───────────────────────────────────────── */
async function changeLang(lang) {
  if (!SUPPORTED.includes(lang)) return;
  currentLang = lang;
  localStorage.setItem(STORAGE_KEY, lang);
  await i18next.changeLanguage(lang);
  translateDOM();
  updateToggle(lang);
}

/* ─────────────────────────────────────────
   TOGGLE VISUAL
───────────────────────────────────────── */
function updateToggle(lang) {
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.classList.toggle('lang-active', btn.dataset.lang === lang);
  });
}

/* ─────────────────────────────────────────
   BIND BOTONES
───────────────────────────────────────── */
function bindToggleButtons() {
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.removeEventListener('click', _onLangClick);
    document.addEventListener('click', function(e) {
  const btn = e.target.closest('.lang-btn')
  if (!btn) return
  changeLang(btn.dataset.lang)
})
  });
}

function _onLangClick() {
  changeLang(this.dataset.lang);
}

/* ─────────────────────────────────────────
   REBIND — llamado desde layout.js después
   de inyectar el header dinámico
───────────────────────────────────────── */
window.i18nRebind = function() {
  bindToggleButtons();
  updateToggle(currentLang);
  translateDOM();
};

/* ─────────────────────────────────────────
   ARRANCAR — esperar a que i18next cargue
───────────────────────────────────────── */
function waitForI18nextAndInit() {
  if (typeof i18next !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initI18n);
    } else {
      initI18n();
    }
  } else {
    setTimeout(waitForI18nextAndInit, 50);
  }
}

waitForI18nextAndInit();