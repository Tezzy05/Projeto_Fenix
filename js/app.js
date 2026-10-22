// Shell (barra utilitária + header), login e roteador por hash com controle de acesso por perfil.
import { PERFIS, net, db, api, ApiErr, pingServer } from './data.js';
import { $, $$, esc, svgi, hexi, wordmark, mo, reduced, toast, closeModal, drawHex } from './ui.js';
import { mountForest } from './scene.js';
import { renderTecnico, syncUI } from './tecnico.js';
import * as P from './painel.js';

const app = $('#app');
let cleanup = null, shellFor = null, me = null;

/* ---------------- Sessão ---------------- */
const cache = { get: () => { try { return JSON.parse(localStorage.getItem('fenix.me')); } catch { return null; } }, set: u => localStorage.setItem('fenix.me', JSON.stringify(u)), clear: () => localStorage.removeItem('fenix.me') };
async function loadMe() {
  if (me) return me;
  try { me = await api.get('/api/me'); cache.set(me); }
  catch (e) {
    if (e.status === 0) me = cache.get();          // offline/servidor fora: técnico continua usando o app com a sessão em cache
    else { me = null; cache.clear(); }
  }
  return me;
}

/* ---------------- Shell ---------------- */
async function pendingCount() { return (await db.all()).filter(r => !r.draft && r.sync === 'pendente' && !r.syncError).length; }
async function shell(u, path) {
  const nav = PERFIS[u.perfil].nav;
  app.innerHTML = `<div class="top"><div class="util"><span class="dot ${net.online ? 'on' : ''}" id="dot"></span><span id="netTxt"></span><span class="sp"></span>
      <span id="pendTxt"></span><label class="sw-l"><input type="checkbox" id="offSw" ${net.forced ? 'checked' : ''}><span class="sw-t">Simular offline</span></label></div>
    <header class="site"><a href="${nav[0][0]}" class="logo">${wordmark()}<small>Projeto Fênix</small></a>
      <nav>${nav.map(([h, t]) => `<a href="${h}" class="${path && h.slice(1).split('/')[1] === path.split('/')[1] ? 'act' : ''}">${t}</a>`).join('')}</nav>
      <div class="me"><span class="av">${esc(u.nome[0])}</span><span class="who"><b>${esc(u.nome)}</b><small>${esc(u.perfil)}</small></span><button class="icon-btn" id="logout" aria-label="Sair">${svgi('x', 18)}</button></div></header></div>
    <main id="main"></main>`;
  shellFor = u.id;
  $('#offSw').onchange = e => { net.forced = e.target.checked; onNetChange(true); };
  $('#logout').onclick = async () => { await api.post('/api/logout').catch(() => { }); me = null; cache.clear(); location.hash = '#/login'; };
  refreshUtil();
}
async function refreshUtil() {
  const d = $('#dot'); if (!d) return;
  const n = await pendingCount();
  d.classList.toggle('on', net.online);
  $('#netTxt').textContent = net.forced ? 'Offline (simulado)' : !navigator.onLine ? 'Sem rede' : net.serverUp === false ? 'Servidor indisponível' : 'Online';
  $('#pendTxt').textContent = n ? `${n} na fila local` : '';
}
let lastOnline = null;
async function onNetChange(announce = false) {
  await refreshUtil();
  const on = net.online;
  if (announce || (lastOnline !== null && lastOnline !== on)) toast(on ? 'Conexão restabelecida' : 'Sem conexão · trabalhando offline');
  const back = on && lastOnline === false || (announce && on);
  lastOnline = on;
  if (back && me?.perfil === 'tecnico' && await pendingCount()) syncUI();
  else window.dispatchEvent(new Event('fenix:data'));
}
window.addEventListener('fenix:data', refreshUtil);
window.addEventListener('fenix:net', () => onNetChange());
addEventListener('online', () => pingServer().then(() => onNetChange())); addEventListener('offline', () => onNetChange());
window.addEventListener('fenix:unauth', () => { if (me) { me = null; cache.clear(); toast('Sessão expirada. Entre novamente.', 'err'); location.hash = '#/login'; } });
setInterval(() => { if (!document.hidden) pingServer(); }, 8000);

/* ---------------- Login ---------------- */
// Usuário e senha, como em produção. Em modo demo, o "Acesso de demonstração" (recolhido sob o botão Entrar) lista os
// usuários de exemplo e entra com um clique. Ele só aparece quando o servidor informa demo (FENIX_DEMO=1 ou js/demo.js).
async function login() {
  shellFor = null;
  let opts = { demo: false, users: [] };
  try { opts = await api.get('/api/login-options'); } catch { /* servidor fora: só o formulário */ }
  const quick = Object.entries(PERFIS).map(([k, p]) => {
    const us = opts.users.filter(u => u.perfil === k);
    return us.length ? `<p class="quick-g">${esc(p.label)}</p>${us.map(u => `<button type="button" class="quick-u" data-id="${esc(u.id)}"><span class="av">${esc(u.nome[0])}</span><span><b>${esc(u.nome)}</b> <small>· ${esc(u.id)}</small></span>${svgi('next', 16)}</button>`).join('')}` : '';
  }).join('');
  app.innerHTML = `<section class="login"><canvas id="forest" aria-hidden="true"></canvas>
    <div class="login-top">${wordmark(false)}</div>
    <div class="leaf"><p class="eyebrow">Retorna Machine · Operação</p>
      <h1 class="h-hero"><span class="ln">Projeto</span><span class="ln"><span class="hl">Fênix.</span></span></h1>
      <p class="lead tag">Instalação registrada, do campo ao laudo.</p>
      <p class="lead sm">ROI offline-first para o técnico, validação da Supervisão e LEI pronto para o cliente.</p>
      <form id="lf">
        <label class="fld"><span>Usuário</span><input id="who" name="usuario" autocomplete="username" autocapitalize="none" spellcheck="false" required></label>
        <label class="fld"><span>Senha</span><span class="pw"><input id="pw" type="password" name="senha" autocomplete="current-password" required><button type="button" class="icon-btn" id="eye" aria-label="Mostrar senha">${svgi('eye', 18)}</button></span></label>
        <p class="form-err" id="lerr" role="alert"></p>
        <button class="btn lime big" type="submit">Entrar ${svgi('next', 20)}</button></form>
      ${opts.demo ? `<div class="quick"><button type="button" class="quick-toggle" id="qt" aria-expanded="false" aria-controls="ql">Acesso de demonstração ${svgi('down', 14)}</button>
        <div class="quick-list" id="ql" hidden>${quick}<p class="quick-pw">Senha de todos: <b>${esc(opts.senha || '')}</b></p>
          ${opts.local ? '<p class="quick-pw"><button type="button" class="btn-link" id="reset">Restaurar dados de exemplo</button></p>' : ''}</div></div>` : ''}
      <ul class="feat"><li>${hexi('wifi')}<span>Funciona sem sinal</span></li><li>${hexi('camera')}<span>Fotos com data e GPS</span></li><li>${hexi('doc')}<span>ROI e LEI em PDF</span></li></ul></div></section>`;
  const stop = mountForest($('#forest'));
  const g = window.gsap;
  if (g && !reduced) {
    const tl = g.timeline({ defaults: { ease: 'power3.out' } });
    tl.fromTo('.leaf', { clipPath: 'inset(0 100% 0 0 round 96px 14px)' }, { clipPath: 'inset(0 0% 0 0 round 96px 14px)', duration: 1, ease: 'power3.inOut', clearProps: 'clipPath' }, 0.1)
      .from('.leaf .ln', { yPercent: 110, opacity: 0, duration: 0.7, stagger: 0.1 }, 0.55)
      .fromTo('.leaf .hl', { '--w': '0%' }, { '--w': '100%', duration: 0.7 }, 1.05)
      .from('.leaf .eyebrow,.leaf .lead,.leaf form,.leaf .quick', { opacity: 0, y: 16, duration: 0.6, stagger: 0.1 }, 0.9)
      .from('.feat li', { opacity: 0, y: 14, duration: 0.5, stagger: 0.1 }, 1.3)
      .from('.login-top', { opacity: 0, y: -12, duration: 0.6 }, 0.2);
    tl.eventCallback('onComplete', () => drawHex(app));
  } else drawHex(app);

  const enter = async (id, senha, btn) => {
    if (btn) btn.disabled = true;
    $('#lerr').textContent = '';
    try {
      me = await api.post('/api/login', { id, senha }); cache.set(me);
      location.hash = PERFIS[me.perfil].nav[0][0];
    } catch (err) {
      if (btn) btn.disabled = false;
      $('#lerr').textContent = err.status === 0 ? 'Servidor indisponível. Verifique a conexão.' : err.message;
      mo($('.leaf'), { x: [0, -8, 8, -5, 5, 0] }, { duration: 0.4 });
    }
  };
  $('#lf').onsubmit = e => { e.preventDefault(); enter($('#who').value.trim(), $('#pw').value, $('button[type=submit]', e.target)); };
  $('#eye').onclick = e => {
    const pw = $('#pw'), show = pw.type === 'password';
    pw.type = show ? 'text' : 'password';
    e.currentTarget.innerHTML = svgi(show ? 'eyeoff' : 'eye', 18);
    e.currentTarget.setAttribute('aria-label', show ? 'Ocultar senha' : 'Mostrar senha');
  };
  if (opts.demo) {
    $('#qt').onclick = e => {
      const open = e.currentTarget.getAttribute('aria-expanded') !== 'true', ql = $('#ql');
      e.currentTarget.setAttribute('aria-expanded', open);
      ql.hidden = !open;
      if (open) mo(ql, { opacity: [0, 1], y: [-6, 0] }, { duration: 0.25 });
    };
    $('#ql').onclick = e => { const b = e.target.closest('.quick-u'); if (b) enter(b.dataset.id, opts.senha, b); };
    if (opts.local) $('#reset').onclick = async () => { await api.post('/api/demo/reset'); await db.clear(); toast('Dados de exemplo restaurados'); };
  }
  return stop;
}

/* ---------------- Roteador ---------------- */
const views = { '/tecnico': (el, u) => renderTecnico(el, u), '/painel': P.overview, '/laudos': P.laudos, '/lei': P.lei, '/projetos': P.projetos, '/fotos': P.fotos, '/usuarios': P.usuarios };

async function route() {
  closeModal();
  const parts = location.hash.replace(/^#\/?/, '').split('/');
  const path = '/' + (parts[0] || 'login'), arg = decodeURIComponent(parts[1] || '');
  if (typeof cleanup === 'function') { try { cleanup(); } catch { } cleanup = null; }
  const u = await loadMe();
  if (path === '/login') { if (u) { location.hash = PERFIS[u.perfil].nav[0][0]; return; } cleanup = await login(); return; }
  if (!u) { location.hash = '#/login'; return; }
  if (!PERFIS[u.perfil].routes.includes(path)) { location.hash = PERFIS[u.perfil].nav[0][0]; return; }
  if (shellFor !== u.id || !$('#main')) await shell(u, path); else $$('header.site nav a').forEach(a => a.classList.toggle('act', a.getAttribute('href').split('/')[1] === path.split('/')[1]));
  const main = $('#main');
  main.className = path === '/tecnico' ? 'phone' : '';
  main.onclick = main.oninput = main.onchange = null;
  main.innerHTML = '';
  try { cleanup = await views[path](main, u, arg); }
  catch (err) {
    if (!(err instanceof ApiErr && err.status === 401)) { console.error(err); main.innerHTML = `<section class="wrap"><p class="empty">${err.status === 0 ? 'Servidor indisponível. Tente novamente quando a conexão voltar.' : 'Erro ao abrir a tela: ' + esc(err.message)}</p></section>`; }
  }
  scrollTo(0, 0);
  mo(main, { opacity: [0, 1], y: [10, 0] }, { duration: 0.35 });
  refreshUtil();
}

addEventListener('hashchange', route);
pingServer().finally(() => { lastOnline = net.online; route(); });
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => { });
