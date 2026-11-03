import dictionaries from './translations.js';
const storageKey = 'cleaneye-demo-v1';
const supported = new Set(['en', 'hi', 'gu']);
function savedLanguage() {
  try { const value = JSON.parse(localStorage.getItem(storageKey) || '{}').lang; return supported.has(value) ? value : 'en'; }
  catch { return 'en'; }
}
let language = savedLanguage();
const listeners = new Set();
function updateLanguage(value = savedLanguage()) {
  const next = supported.has(value) ? value : 'en';
  document.documentElement.lang = `${next}-IN`;
  if (next === language) return;
  language = next;
  listeners.forEach(listener => listener());
}
window.addEventListener('cleaneye:language', event => updateLanguage(event.detail));
window.addEventListener('storage', event => { if (event.key === storageKey) updateLanguage(); });
const escapeRegex = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const patterns = Object.fromEntries(Object.entries(dictionaries).map(([lang, dictionary]) => [lang,
  Object.entries(dictionary).filter(([source]) => /\{\d+\}/.test(source)).map(([source, target]) => {
    const keys = [];
    const expression = source.split(/(\{\d+\})/).map(part => /^\{\d+\}$/.test(part) ? (keys.push(part), '(.+?)') : escapeRegex(part)).join('');
    return { regex: new RegExp(`^${expression}$`), keys, target };
  })
]));
export function translate(value, lang = language) {
  if (lang === 'en' || typeof value !== 'string' || !/[a-z]/i.test(value)) return value;
  const source = value.trim(), dictionary = dictionaries[lang];
  if (!source || !dictionary) return value;
  let translated = dictionary[source];
  if (!translated) {
    for (const pattern of patterns[lang]) {
      const match = pattern.regex.exec(source);
      if (!match) continue;
      translated = pattern.target;
      pattern.keys.forEach((key, index) => { translated = translated.split(key).join(translate(match[index + 1], lang)); });
      break;
    }
  }
  return translated ? value.replace(source, translated) : value;
}
let react;
const subscribeLanguage = listener => { listeners.add(listener); return () => listeners.delete(listener); };
export function LocalizedText({ children }) {
  const lang = react.useSyncExternalStore(subscribeLanguage, () => language, () => 'en');
  return Array.isArray(children) ? children.map(value => translate(value, lang)) : translate(children, lang);
}
export function localizeRuntime(runtime, React) {
  react = React;
  const elements = new Map();
  const subscribe = listener => { listeners.add(listener); return () => listeners.delete(listener); };
  const snapshot = () => language;
  const child = (value, lang) => Array.isArray(value) ? value.map(item => child(item, lang)) : translate(value, lang);
  function element(tag) {
    if (!elements.has(tag)) {
      function LocalizedElement(props) {
        const lang = React.useSyncExternalStore(subscribe, snapshot, () => 'en');
        const next = { ...props };
        if (!['script', 'style', 'textarea'].includes(tag)) next.children = child(props.children, lang);
        for (const key of ['title', 'alt', 'placeholder', 'aria-label', 'aria-description']) {
          if (typeof next[key] === 'string') next[key] = translate(next[key], lang);
        }
        // Preserve option values and form data while translating their visible labels.
        if (tag === 'html') next.lang = `${lang}-IN`;
        return runtime.jsx(tag, next);
      }
      elements.set(tag, LocalizedElement);
    }
    return elements.get(tag);
  }
  const originalCreateElement = React.createElement;
  React.createElement = (tag, props, ...children) => originalCreateElement(typeof tag === 'string' ? element(tag) : tag, props, ...children);
  const wrap = method => (tag, props, key) => runtime[method](typeof tag === 'string' ? element(tag) : tag, props, key);
  return { ...runtime, jsx: wrap('jsx'), jsxs: wrap('jsxs') };
}
