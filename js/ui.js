// Utilitários de UI, ícones e helpers de animação (Motion / anime.js / GSAP).
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const pad = n => String(n).padStart(2, '0');
export const fmtD = t => { const d = new Date(t); return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`; };
export const fmtT = t => { const d = new Date(t); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
export const fmtDT = t => `${fmtD(t)} às ${fmtT(t)}`;
export const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

const M = () => window.Motion, A = () => window.anime, G = () => window.gsap;

/** Motion: animação com respeito a prefers-reduced-motion */
export function mo(el, kf, opt = {}) {
  if (!el || reduced || !M()) return null;
  return M().animate(el, kf, opt);
}
export const spring = { type: 'spring', stiffness: 420, damping: 30 };

export const shake = el => mo(el, { x: [0, -8, 8, -5, 5, 0] }, { duration: 0.4 });

/** anime.js: contador numérico */
export function countUp(el, to, ms = 1000) {
  if (reduced || !A()) { el.textContent = to; return; }
  const o = { v: 0 };
  A().animate(o, { v: to, duration: ms, ease: 'outExpo', onUpdate: () => { el.textContent = Math.round(o.v); } });
}
/** anime.js: desenha o contorno dos hexágonos */
export function drawHex(scope = document) {
  const paths = $$('.hexline', scope);
  if (!paths.length) return;
  if (reduced || !A()) return;
  try {
    const d = A().svg.createDrawable(paths);
    A().animate(d, { draw: ['0 0', '0 1'], duration: 1100, ease: 'inOutQuad', delay: A().stagger(120) });
  } catch (e) { /* sem draw: mantém contorno estático */ }
}

export const ICON = {
  leaf: '<path d="M5 19c0-8 5-13 14-14 0 9-5 14-13 14"/><path d="M5 19c3-5 6-8 10-10"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  camera: '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>',
  doc: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M10 12h5M10 16h5"/>',
  alert: '<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17v.5"/>',
  wifi: '<path d="M3 9.5a13 13 0 0 1 18 0M6 13a8.5 8.5 0 0 1 12 0M9 16.5a4 4 0 0 1 6 0"/><path d="M12 20h.01"/>',
  cloud: '<path d="M7 18a4 4 0 0 1-.5-8A5.5 5.5 0 0 1 17 8.5 4 4 0 0 1 17 18z"/>',
  box: '<path d="M3.5 7.5L12 3l8.5 4.5v9L12 21l-8.5-4.5z"/><path d="M3.5 7.5L12 12l8.5-4.5M12 12v9"/>',
  pin: '<path d="M12 21s7-6 7-11.5a7 7 0 0 0-14 0C5 15 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  users: '<circle cx="9" cy="8.5" r="3.2"/><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6"/><path d="M16 5.5a3 3 0 0 1 0 6M18 14.5c2 .7 3 2.6 3 5.5"/>',
  chip: '<rect x="6" y="6" width="12" height="12" rx="1.5"/><path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3"/>',
  download: '<path d="M12 4v11M7.5 11l4.5 4.5 4.5-4.5M5 20h14"/>',
  mail: '<rect x="3" y="5.5" width="18" height="13" rx="2"/><path d="M3.5 7l8.5 6 8.5-6"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  next: '<path d="M9 5l7 7-7 7"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  refresh: '<path d="M20 11a8 8 0 0 0-14.5-3.5M4 4v4h4M4 13a8 8 0 0 0 14.5 3.5M20 20v-4h-4"/>',
  chart: '<path d="M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-8"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1"/><rect x="13" y="4" width="7" height="7" rx="1"/><rect x="4" y="13" width="7" height="7" rx="1"/><rect x="13" y="13" width="7" height="7" rx="1"/>',
};
export const svgi = (n, s = 20) => `<svg class="ico" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[n]}</svg>`;
export const hexi = n => `<svg class="hexi" viewBox="0 0 100 100" aria-hidden="true"><polygon class="hexline" points="50,5 91,27.5 91,72.5 50,95 9,72.5 9,27.5" fill="none" stroke="#000" stroke-width="3" stroke-linejoin="round"/><g transform="translate(29 29) scale(1.75)" fill="none" stroke="#000" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${ICON[n]}</g></svg>`;

/** Marca da Ambipar como wordmark provisório — trocar pelo SVG oficial da marca. */
export const wordmark = (dark = true) => `<span class="wordmark ${dark ? '' : 'light'}">ambipar<sup>®</sup></span>`;

export function toast(msg, kind = '') {
  const box = $('#toast');
  const el = document.createElement('div');
  el.className = 'toast ' + kind;
  el.setAttribute('role', 'status');
  el.innerHTML = `${svgi(kind === 'err' ? 'alert' : 'check', 18)}<span>${esc(msg)}</span>`;
  box.appendChild(el);
  mo(el, { y: [24, 0], opacity: [0, 1] }, spring);
  setTimeout(() => { const a = mo(el, { opacity: 0, y: -8 }, { duration: 0.25 }); (a?.finished ?? Promise.resolve()).then(() => el.remove()); if (!a) el.remove(); }, 3600);
}

let modalCleanup = null;
export function openModal(html, { wide = false, onClose } = {}) {
  closeModal();
  const m = $('#modal');
  m.innerHTML = `<div class="scrim"></div><div class="dialog ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">${html}</div>`;
  m.classList.add('open');
  modalCleanup = onClose;
  mo($('.scrim', m), { opacity: [0, 1] }, { duration: 0.2 });
  mo($('.dialog', m), { y: [40, 0], opacity: [0, 1] }, spring);
  $('.scrim', m).onclick = () => closeModal();
  document.body.style.overflow = 'hidden';
  return $('.dialog', m);
}
export function closeModal() {
  const m = $('#modal');
  if (!m.classList.contains('open')) return;
  m.classList.remove('open'); m.innerHTML = ''; document.body.style.overflow = '';
  const c = modalCleanup; modalCleanup = null; c?.();
}

export const chip = (txt, kind = '') => `<span class="chip ${kind}">${esc(txt)}</span>`;
export const statusChip = l => l.status === 'DISPONIVEL_PROJETOS' ? chip('Disponível p/ Projetos', 'lime') : chip('Aguardando validação', 'warn');

export function setPath(o, path, v) {
  const k = path.split('.'); const last = k.pop();
  k.reduce((a, p) => (a[p] ??= {}), o)[last] = v;
}
export const getPath = (o, path) => path.split('.').reduce((a, p) => a?.[p], o);
