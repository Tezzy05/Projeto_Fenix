// Máquinas: checklist de preparação na base (técnico) → disponível para instalação → designação pela Gestão → instalada.
// Técnico: máquinas dos seus estados, com as designadas a ele no topo. Gestão, ADM e Projetos: visão nacional.
import { api, db, net, uuid, notify, syncAll, PREP, PREP_FOTOS, MSTATUS, UFS, EXPORTA, CMS_DEMO } from './data.js';
import { $, $$, esc, fmtD, fmtDT, toast, openModal, closeModal, svgi, hexi, chip, mo, spring, shake, drawHex, reduced } from './ui.js';
import { draftFromMachine, watermark, warmGPS } from './tecnico.js';
import { heroTitle, sweep, reveal, opts, dayStart, dt, periodo, writeXlsx } from './painel.js';

const mchip = s => chip(MSTATUS[s]?.[0] || s, MSTATUS[s]?.[1] || '');
const conf = v => (v === true ? 'Conforme' : v === false ? 'Não conforme' : 'Não se aplica');
const itemNome = k => PREP.find(x => x.k === k)?.t || k;
const nokItens = p => PREP.filter(x => p?.itens?.[x.k]?.ok === false);
const CACHE = u => 'fenix.maquinas.' + u.id;

export async function maquinas(el, u, arg) {
  if (u.perfil === 'tecnico') return arg?.startsWith('preparar') ? prepWizard(el, u, arg.slice(9)) : tecLista(el, u);
  return arg ? detalhe(el, u, arg) : nacional(el, u);
}

/* ======================= Técnico: máquinas dos seus estados ======================= */
async function tecLista(el, u) {
  let ms, offline = false;
  try { ms = await api.get('/api/maquinas'); try { localStorage.setItem(CACHE(u), JSON.stringify(ms)); } catch { } }
  catch (e) { if (e.status !== 0) throw e; offline = true; try { ms = JSON.parse(localStorage.getItem(CACHE(u))) || []; } catch { ms = []; } }
  const all = await db.all();
  const drafts = all.filter(r => r.kind === 'prep' && r.draft && r.tecnicoId === u.id);
  const fila = all.filter(r => r.kind === 'prep' && !r.draft && r.tecnicoId === u.id && (r.sync === 'pendente' || r.syncError));
  let q = '';
  el.innerHTML = `<section class="phone-home">
    <p class="eyebrow">Máquinas · ${esc(u.ufs?.length ? u.ufs.join(', ') : 'todos os estados')}</p>
    <h1 class="h-xl">Máquinas <span class="hl">disponíveis</span></h1>
    <p class="lead">Preparadas na base e prontas para instalar nos seus estados. As que a Gestão designou a você aparecem primeiro.</p>
    <a class="btn lime big" href="#/maquinas/preparar">${svgi('check', 22)} Checklist de preparação (base)</a>
    ${offline ? `<p class="rule">${svgi('wifi', 16)}<span>Sem conexão: lista da última consulta.</span></p>` : ''}
    ${drafts.length ? `<h2 class="h-md">Preparações em andamento</h2><div class="list">${drafts.map(d => `<div class="li"><div><b>${esc(d.serie || 'Série não informada')}</b><span>Iniciada em ${fmtDT(d.iniciadoEm)}</span></div>
      <div class="li-r"><a class="btn dark sm" href="#/maquinas/preparar:${esc(d.id)}">Continuar</a><button class="icon-btn" data-del="${esc(d.id)}" aria-label="Descartar">${svgi('x', 18)}</button></div></div>`).join('')}</div>` : ''}
    ${fila.length ? `<div class="sync-card has"><div>${hexi('cloud')}</div><div><b>${fila.length} checklist${fila.length > 1 ? 's' : ''} aguardando envio</b>
      <span>${fila.filter(r => r.syncError).map(r => `${esc(r.serie)}: ${esc(r.syncError)}`).join(' · ') || 'Envia quando houver conexão.'}</span></div>
      <button class="btn dark sm" data-sync ${net.online ? '' : 'disabled'}>Sincronizar</button></div>` : ''}
    <input type="search" id="mq" placeholder="Buscar nº de série, estado ou técnico" aria-label="Buscar máquinas">
    <div id="ml"></div></section>`;
  const card = (m, act) => {
    const p = m.ultimaPrep, d = m.designado;
    return `<div class="li mq ${d?.id === u.id ? 'mine' : ''}"><div><b>${esc(m.serie)}</b>
      <span>${esc(m.uf)} · PIN ${esc(m.pin || '—')}${p ? ` · preparada em ${fmtD(p.em)} por ${esc(p.tecnico)}` : ''}</span>
      ${m.status === 'NAO_CONFORME' ? `<span class="nokl">${nokItens(p).map(x => `${esc(x.t)}: ${esc(p.itens[x.k].obs)}`).join(' · ')}</span>`
        : `<span>${d ? (d.id === u.id ? `<b class="you">Designada a você</b> por ${esc(d.por)} em ${fmtD(d.em)}` : `Designada a ${esc(d.nome)}`) : 'Sem técnico designado'}</span>`}</div>
      <div class="li-r">${act}</div></div>`;
  };
  const draw = () => {
    const t = q.trim().toLowerCase();
    const list = ms.filter(m => !t || [m.serie, m.uf, m.designado?.nome, m.ultimaPrep?.tecnico].some(v => String(v || '').toLowerCase().includes(t)));
    const mine = list.filter(m => m.status === 'DISPONIVEL' && m.designado?.id === u.id);
    const others = list.filter(m => m.status === 'DISPONIVEL' && m.designado?.id !== u.id);
    const nok = list.filter(m => m.status === 'NAO_CONFORME');
    const start = m => `<button class="btn lime sm" data-start="${esc(m.serie)}">Iniciar instalação</button>`;
    $('#ml', el).innerHTML = `
      <h2 class="h-md">Pendências de instalação <small class="mute">${mine.length}</small></h2>
      <div class="list">${mine.map(m => card(m, start(m))).join('') || '<p class="empty sm">Nenhuma máquina designada a você.</p>'}</div>
      <h2 class="h-md">Disponíveis no seu estado <small class="mute">${others.length}</small></h2>
      <div class="list">${others.map(m => card(m, start(m))).join('') || '<p class="empty sm">Nenhuma outra máquina disponível.</p>'}</div>
      ${nok.length ? `<h2 class="h-md">Não conformes · aguardando correção <small class="mute">${nok.length}</small></h2>
      <div class="list">${nok.map(m => card(m, `<a class="btn dark sm" href="#/maquinas/preparar:${esc(m.serie)}">Refazer checklist</a>`)).join('')}</div>` : ''}`;
  };
  el.oninput = e => { if (e.target.id === 'mq') { q = e.target.value; draw(); } };
  el.onclick = async e => {
    const s = e.target.closest('[data-start]');
    if (s) {
      const id = await draftFromMachine(u, ms.find(m => m.serie === s.dataset.start));
      try { sessionStorage.setItem('fenix.abrirRascunho', id); } catch { }
      location.hash = '#/tecnico'; return;
    }
    const d = e.target.closest('[data-del]');
    if (d && confirm('Descartar esta preparação?')) { await db.del(d.dataset.del); return tecLista(el, u); }
    const b = e.target.closest('[data-sync]');
    if (b) { b.disabled = true; try { const r = await syncAll(); if (r.n) toast(`${r.n} checklist${r.n > 1 ? 's' : ''} enviado${r.n > 1 ? 's' : ''}`); r.errors.forEach(m => toast('Recusado: ' + m, 'err')); } catch (err) { toast(err.message, 'err'); } return tecLista(el, u); }
  };
  draw(); drawHex(el);
  if (!reduced) mo($$('.phone-home > *', el), { opacity: [0, 1], y: [16, 0] }, { duration: 0.45, delay: window.Motion?.stagger(0.05) });
}

/* ======================= Técnico: checklist de preparação ======================= */
async function prepWizard(el, u, ref) {
  let P = ref?.startsWith('prepdraft-') ? await db.get(ref) : null, prev = null;
  const cached = () => { try { return JSON.parse(localStorage.getItem(CACHE(u))) || []; } catch { return []; } };
  if (!P) {
    P = { id: 'prepdraft-' + uuid(), kind: 'prep', draft: true, tecnicoId: u.id, tecnico: u.nome, iniciadoEm: Date.now(), serie: ref || '', pin: '', uf: u.ufs?.length === 1 ? u.ufs[0] : '', itens: {}, fotos: {} };
    const m = ref && cached().find(x => x.serie === ref);
    if (m) Object.assign(P, { pin: m.pin || '', uf: m.uf });
    await db.put(P);
  }
  if (P.serie) prev = await api.get('/api/maquinas/' + encodeURIComponent(P.serie)).then(m => m.ultimaPrep).catch(() => cached().find(x => x.serie === P.serie)?.ultimaPrep || null);
  const myUfs = u.ufs?.length ? u.ufs : UFS;
  let saveT;
  const save = () => { clearTimeout(saveT); saveT = setTimeout(async () => { await db.put(P); const s = $('#saved', el); if (s) mo(s, { opacity: [0.3, 1] }, { duration: 0.4 }); }, 300); };
  const slot = (k, t, sub) => {
    const p = P.fotos[k];
    return `<div class="slot ${p ? 'done' : ''}" data-k="${k}"><button type="button" class="slot-btn" data-shot="${k}">
      <span class="sthumb">${p ? `<img src="${p.mark}" alt="">` : svgi('camera', 26)}</span>
      <span class="smeta"><b>FOTO</b><span>${esc(t)}</span><small>${p ? fmtDT(p.ts) + (p.lat != null ? ` · ${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}` : ' · sem GPS') : esc(sub || 'Obrigatória')}</small></span>
      <span class="stag">${p ? 'Refazer' : 'Tirar'}</span></button><input type="file" accept="image/*" capture="environment" hidden data-file="${k}"></div>`;
  };
  const item = x => {
    const v = P.itens[x.k], s = v ? (v.ok === true ? 'ok' : v.ok === false ? 'nok' : 'na') : '', era = prev?.itens?.[x.k]?.ok === false ? prev.itens[x.k].obs : null;
    return `<div class="card chk" data-item="${x.k}"><b>${esc(x.t)}${x.opt ? ' <small class="mute">(opcional)</small>' : ''}</b>
      ${era != null ? `<p class="era">${svgi('alert', 14)} Na preparação anterior: não conforme — ${esc(era)}</p>` : ''}
      <div class="pills tri" data-tri="${x.k}"><button type="button" class="pill ${s === 'ok' ? 'on' : ''}" data-v="ok">Conforme</button><button type="button" class="pill nok ${s === 'nok' ? 'on' : ''}" data-v="nok">Não conforme</button>${x.opt ? `<button type="button" class="pill ${s === 'na' ? 'on' : ''}" data-v="na">Não se aplica</button>` : ''}</div>
      <div class="obs-wrap ${s === 'nok' ? 'open' : ''}"><div><textarea data-obs="${x.k}" rows="2" placeholder="O que está não conforme (obrigatório)">${esc(v?.obs || '')}</textarea></div></div>
      <div class="obs-wrap ${s && s !== 'na' ? 'open' : ''}" data-fw="${x.k}"><div>${slot('i_' + x.k, x.t, 'Foto obrigatória')}</div></div></div>`;
  };
  el.innerHTML = `<div class="wiz prep">
    <div class="wiz-head"><a class="icon-btn" href="#/maquinas" aria-label="Sair e salvar">${svgi('back')}</a><div class="wiz-t"><small>Base · antes do transporte</small><b>Checklist de preparação</b></div><span class="saved" id="saved">${svgi('check', 14)} Salvo no aparelho</span></div>
    <div class="wiz-body">
      <div class="card"><h2 class="h-md">${hexi('box')}<span>Máquina</span></h2>
        <div class="fld"><span>Nº de Série <em>*</em></span><div class="inline"><input id="pserie" value="${esc(P.serie)}" placeholder="Digite ou escaneie" autocomplete="off" autocapitalize="characters"><button type="button" class="btn dark sm" data-cms>${svgi('refresh', 16)} CMS</button></div>
          <small class="hint">Teste: ${CMS_DEMO.map(n => `<button type="button" class="tag-btn" data-sn="${n}">${n}</button>`).join(' ')}</small></div>
        <label class="fld"><span>PIN</span><input id="ppin" value="${esc(P.pin)}" inputmode="numeric" autocomplete="off"></label>
        <div class="fld"><span>Estado (UF) da base <em>*</em></span><div class="pills wrapx" data-uf>${myUfs.map(o => `<button type="button" class="pill ${P.uf === o ? 'on' : ''}" data-v="${o}">${o}</button>`).join('')}</div></div></div>
      ${prev && !prev.conforme ? `<p class="rule">${svgi('alert', 16)}<span>Refazendo o checklist: na preparação de ${fmtD(prev.em)} (${esc(prev.tecnico)}) ficaram não conformes: <b>${nokItens(prev).map(x => esc(x.t)).join(', ')}</b>. O que for corrigido fica registrado para a Gestão.</span></p>` : ''}
      <p class="rule">${svgi('alert', 16)}<span>Todos os itens com foto. Se algum ficar <b>não conforme</b>, a máquina fica <b>não disponível</b> até um novo checklist.</span></p>
      ${PREP.map(item).join('')}
      <div class="card"><h2 class="h-md">${hexi('camera')}<span>Máquina adesivada e ligada</span></h2>${PREP_FOTOS.map(f => slot(f.k, f.t)).join('')}</div>
    </div>
    <div class="wiz-bar"><a class="btn ghost" href="#/maquinas">${svgi('back', 18)} Sair</a><button class="btn lime" data-done>${svgi('check', 18)} Concluir checklist</button></div></div>`;
  warmGPS();
  const photoLabel = k => (k.startsWith('i_') ? itemNome(k.slice(2)) : PREP_FOTOS.find(f => f.k === k).t);
  el.oninput = e => {
    const t = e.target;
    if (t.id === 'pserie') { P.serie = t.value.trim().toUpperCase(); save(); }
    if (t.id === 'ppin') { P.pin = t.value.trim(); save(); }
    if (t.dataset.obs) { P.itens[t.dataset.obs] = { ...(P.itens[t.dataset.obs] || {}), obs: t.value }; save(); }
  };
  el.onchange = async e => {
    const t = e.target; if (!t.dataset.file || !t.files[0]) return;
    const k = t.dataset.file, file = t.files[0]; t.value = '';
    const res = await watermark(file, `Preparação · ${P.serie || 'sem série'} · ${photoLabel(k)}`, 'camera');
    const dlg = openModal(`<h3 class="h-md">Revalidar foto</h3><p class="hint">${esc(photoLabel(k))}</p><img class="preview" src="${res.mark}" alt="">
      <div class="row gap"><button class="btn ghost" data-m="retake">Tirar outra</button><button class="btn lime" data-m="use">${svgi('check', 18)} Usar esta foto</button></div>`);
    dlg.onclick = ev => {
      const m = ev.target.closest('[data-m]')?.dataset.m; if (!m) return; closeModal();
      if (m === 'retake') return $(`[data-file=${k}]`, el).click();
      P.fotos[k] = { orig: file, ...res }; db.put(P);
      const old = $(`.slot[data-k=${k}]`, el), tmp = document.createElement('div');
      tmp.innerHTML = slot(k, photoLabel(k)); old.replaceWith(tmp.firstElementChild);
      mo($(`.slot[data-k=${k}]`, el), { scale: [0.96, 1] }, spring); toast('Foto registrada');
    };
  };
  const lookup = async sn => {
    if (!sn) return toast('Digite o Nº de Série', 'err');
    try { const c = await api.get('/api/cms/' + encodeURIComponent(sn)); P.serie = sn; P.pin = c.pin || ''; $('#pserie', el).value = sn; $('#ppin', el).value = P.pin; save(); toast('PIN carregado do CMS'); }
    catch (err) { toast(err.status === 0 ? 'Sem conexão: preencha o PIN manualmente.' : `${err.message}. Preencha o PIN manualmente.`, 'err'); }
  };
  el.onclick = async e => {
    const sn = e.target.closest('[data-sn]'); if (sn) return lookup(sn.dataset.sn);
    if (e.target.closest('[data-cms]')) return lookup(($('#pserie', el).value || '').trim().toUpperCase());
    const shot = e.target.closest('[data-shot]'); if (shot) return $(`[data-file=${shot.dataset.shot}]`, el).click();
    const uf = e.target.closest('[data-uf] .pill');
    if (uf) { P.uf = uf.dataset.v; $$('[data-uf] .pill', el).forEach(x => x.classList.toggle('on', x === uf)); return save(); }
    const tri = e.target.closest('[data-tri] .pill');
    if (tri) {
      const k = tri.parentElement.dataset.tri, v = tri.dataset.v, card = tri.closest('.chk');
      P.itens[k] = { ...(P.itens[k] || {}), ok: v === 'ok' ? true : v === 'nok' ? false : null };
      $$('.pill', tri.parentElement).forEach(x => x.classList.toggle('on', x === tri));
      $$('.obs-wrap', card)[0].classList.toggle('open', v === 'nok'); $(`[data-fw=${k}]`, card).classList.toggle('open', v !== 'na');
      if (v === 'na') delete P.fotos['i_' + k];
      mo(tri, { scale: [0.92, 1] }, spring); return save();
    }
    if (e.target.closest('[data-done]')) return concluir();
  };
  const complain = (sel, msg) => { const x = $(sel, el); x?.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' }); shake(x); toast(msg, 'err'); };
  async function concluir() {
    if (!P.serie) return complain('#pserie', 'Informe o Nº de Série');
    if (!P.uf) return complain('[data-uf]', 'Escolha o estado (UF) da base');
    for (const x of PREP) {
      const v = P.itens[x.k];
      if (!v || !('ok' in v)) return complain(`[data-item=${x.k}]`, `Responda: ${x.t}`);
      if (v.ok === false && !v.obs?.trim()) return complain(`[data-item=${x.k}]`, `Observação obrigatória: ${x.t}`);
      if (v.ok !== null && !P.fotos['i_' + x.k]) return complain(`[data-item=${x.k}]`, `Falta a foto: ${x.t}`);
    }
    for (const f of PREP_FOTOS) if (!P.fotos[f.k]) return complain(`.slot[data-k=${f.k}]`, `Falta a foto: ${f.t}`);
    clearTimeout(saveT);
    const rec = { ...P, id: 'prep-' + uuid(), em: Date.now(), sync: 'pendente' }; delete rec.draft;
    rec.itens = Object.fromEntries(PREP.map(x => [x.k, { ok: P.itens[x.k].ok, obs: P.itens[x.k].ok === false ? P.itens[x.k].obs.trim() : '' }]));
    await db.put(rec); await db.del(P.id); notify();
    const nok = PREP.filter(x => rec.itens[x.k].ok === false);
    el.innerHTML = `<section class="done"><svg class="bigcheck" viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="52" fill="${nok.length ? '#ffe27a' : '#CCFF03'}" stroke="#000" stroke-width="3"/>${nok.length ? '<path d="M60 34v34M60 82v4" stroke="#000" stroke-width="8" stroke-linecap="round"/>' : '<path class="tick" d="M36 62l16 16 32-36" fill="none" stroke="#000" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>'}</svg>
      <h1 class="h-xl">${nok.length ? 'Máquina <span class="hl">não disponível</span>' : 'Máquina <span class="hl">disponível</span>'}</h1>
      <p class="lead">${esc(rec.serie)} · ${esc(rec.uf)} · ${nok.length ? `não conforme em: ${nok.map(x => esc(x.t)).join(', ')}. Corrija e refaça o checklist.` : 'pronta para instalação. A Gestão pode designar o técnico responsável.'}</p>
      <div class="steps-done"><div id="psync">${svgi('clock', 18)} ${net.online ? 'Enviando…' : 'Na fila — envia quando houver sinal'}</div></div>
      <a class="btn lime big" href="#/maquinas">Ver máquinas</a><a class="btn ghost big" href="#/maquinas/preparar">Nova preparação</a></section>`;
    if (net.online) {
      try { const r = await syncAll(); const s = $('#psync'); if (s) s.innerHTML = r.errors.length ? `${svgi('alert', 18)} Recusado: ${esc(r.errors[0])}` : `${svgi('check', 18)} Enviado: a Gestão já vê esta máquina`; }
      catch { const s = $('#psync'); if (s) s.innerHTML = `${svgi('clock', 18)} Na fila — envia quando houver sinal`; }
    }
  }
}

/* ======================= Gestão, ADM e Projetos: visão nacional ======================= */
const CATS = {
  disp: ['Disponíveis', 'check', m => m.status === 'DISPONIVEL'], desig: ['Designadas', 'users', m => m.status === 'DISPONIVEL' && m.designado],
  semtec: ['Sem técnico', 'clock', m => m.status === 'DISPONIVEL' && !m.designado], nok: ['Não conformes', 'alert', m => m.status === 'NAO_CONFORME'],
  inst: ['Instaladas', 'box', m => m.status === 'INSTALADA'],
};
const noF = () => ({ q: '', k: '', uf: '', tec: '', de: '', ate: '' });
function filtrar(ms, f) {
  const q = f.q.trim().toLowerCase();
  return ms.filter(m => (!f.k || CATS[f.k][2](m)) && (!f.uf || m.uf === f.uf) && (!f.tec || m.designado?.id === f.tec)
    && (!q || [m.serie, m.pin, m.designado?.nome, m.ultimaPrep?.tecnico, m.instalada?.cliente].some(v => String(v || '').toLowerCase().includes(q)))
    && (!f.de || (m.ultimaPrep?.em || 0) >= dayStart(f.de)) && (!f.ate || (m.ultimaPrep?.em || 0) < dayStart(f.ate) + 864e5));
}
async function nacional(el, u) {
  const [ms, tecs] = await Promise.all([api.get('/api/maquinas'), api.get('/api/tecnicos')]);
  const f = noF(), ufs = [...new Set(ms.map(m => m.uf))].sort();
  el.innerHTML = `<section class="band"><div class="wrap"><p class="eyebrow">Operação nacional · todas as regiões</p>${heroTitle('Máquinas para', 'instalação')}
    <p class="lead">Máquinas preparadas na base. ${u.perfil === 'gestao' ? 'Designe o técnico responsável por cada instalação disponível.' : 'Acompanhe a preparação, a designação e a instalação.'}</p></div></section>
    <section class="wrap"><div class="kpis k5">${Object.entries(CATS).map(([k, [t, i, fn]]) => `<button type="button" class="kpi" data-k="${k}" aria-pressed="false">${hexi(i)}<b>${ms.filter(fn).length}</b><span>${t}</span></button>`).join('')}</div>
    <div class="ufs">${ufs.map(x => `<button type="button" class="ufc" data-uf="${x}">${x} <b>${ms.filter(m => m.uf === x && m.status === 'DISPONIVEL').length}</b></button>`).join('')}<small class="mute">disponíveis por estado</small></div>
    <div class="fhead"><span></span>${EXPORTA.includes(u.perfil) ? `<button type="button" class="btn dark sm" data-a="export">${svgi('download', 16)} Exportar relatório</button>` : ''}</div>
    <div class="fbar">
      <input type="search" id="fq" placeholder="Buscar nº de série, técnico ou cliente" aria-label="Buscar">
      <select id="fuf" aria-label="Estado">${opts(ufs.map(x => [x, x]), '', 'Todos os estados')}</select>
      <select id="ftec" aria-label="Técnico designado">${opts(tecs.map(t => [t.id, t.nome]), '', 'Todos os técnicos')}</select>
      <label class="dt" title="Data da última preparação">De <input type="date" id="fde"></label><label class="dt">Até <input type="date" id="fate"></label>
    </div>
    <div class="fcount"><span id="cnt"></span><button type="button" class="btn-link clr" id="clr" hidden>${svgi('x', 14)} Limpar filtros</button></div>
    <div id="tb"></div></section>`;
  const draw = () => {
    const list = filtrar(ms, f);
    $$('.kpi', el).forEach(b => { b.classList.toggle('on', b.dataset.k === f.k); b.setAttribute('aria-pressed', b.dataset.k === f.k); });
    $$('.ufc', el).forEach(b => b.classList.toggle('on', b.dataset.uf === f.uf));
    $('#fuf', el).value = f.uf;
    $('#cnt', el).textContent = `${list.length} de ${ms.length} máquinas`;
    $('#clr', el).hidden = JSON.stringify(f) === JSON.stringify(noF());
    $('#tb', el).innerHTML = list.length ? `<div class="tw"><table class="tbl"><thead><tr><th>Nº de série</th><th>UF</th><th>Status</th><th>Técnico designado</th><th>Última preparação</th><th>Instalação</th><th></th></tr></thead><tbody>
      ${list.map(m => `<tr><td><b>${esc(m.serie)}</b><small>PIN ${esc(m.pin || '—')}</small></td><td>${esc(m.uf)}</td><td>${mchip(m.status)}${m.ultimaPrep?.corrigidos?.length ? '<small>corrigida</small>' : ''}</td>
      <td>${m.designado ? `${esc(m.designado.nome)}<small>por ${esc(m.designado.por)} · ${fmtD(m.designado.em)}</small>` : '<span class="mute">—</span>'}</td>
      <td>${m.ultimaPrep ? `${fmtD(m.ultimaPrep.em)}<small>${esc(m.ultimaPrep.tecnico)}${m.nPreps > 1 ? ` · ${m.nPreps} checklists` : ''}</small>` : '—'}</td>
      <td>${m.instalada ? `${esc(m.instalada.cliente || '')}<small>${esc(m.instalada.roi)} · ${fmtD(m.instalada.em)}</small>` : '<span class="mute">—</span>'}</td>
      <td class="ta-r"><span class="row">${u.perfil === 'gestao' && m.status === 'DISPONIVEL' ? `<button class="btn ${m.designado ? 'ghost' : 'lime'} sm" data-des="${esc(m.serie)}">${m.designado ? 'Trocar' : 'Designar'}</button>` : ''}<a class="btn ghost sm" href="#/maquinas/${encodeURIComponent(m.serie)}">Abrir</a></span></td></tr>`).join('')}</tbody></table></div>`
      : `<p class="empty">${ms.length ? 'Nenhuma máquina com esses filtros.' : 'Nenhuma máquina preparada ainda. O técnico faz o checklist de preparação na base.'}</p>`;
    reveal('.tbl tbody tr', el);
  };
  const fields = { fq: 'q', fuf: 'uf', ftec: 'tec', fde: 'de', fate: 'ate' };
  el.oninput = el.onchange = e => { const k = fields[e.target.id]; if (k) { f[k] = e.target.value; draw(); } };
  el.onclick = async e => {
    const k = e.target.closest('.kpi')?.dataset.k; if (k) { f.k = f.k === k ? '' : k; return draw(); }
    const uf = e.target.closest('.ufc')?.dataset.uf; if (uf) { f.uf = f.uf === uf ? '' : uf; return draw(); }
    if (e.target.closest('#clr')) { Object.assign(f, noF()); Object.keys(fields).forEach(id => { $('#' + id, el).value = ''; }); return draw(); }
    if (e.target.closest('[data-a=export]')) return exportMaq(ms, tecs, u, f);
    const d = e.target.closest('[data-des]');
    if (d) { const m = ms.find(x => x.serie === d.dataset.des); return designar(m, tecs, nm => { Object.assign(m, nm); draw(); }); }
  };
  draw(); drawHex(el); sweep(el); reveal('.kpi', el);
}

/** Designar, trocar ou retirar o técnico responsável (só técnicos que atuam no estado da máquina). */
function designar(m, tecs, done) {
  const aptos = tecs.filter(t => !t.ufs?.length || t.ufs.includes(m.uf));
  const dlg = openModal(`<h3 class="h-md">Técnico responsável</h3><p class="hint">${esc(m.serie)} · base em ${esc(m.uf)}. Aparecem os técnicos que atuam em ${esc(m.uf)}; a instalação entra nas pendências dele.</p>
    <div class="list">${aptos.map(t => `<label class="li pick"><input type="radio" name="tec" value="${esc(t.id)}" ${m.designado?.id === t.id ? 'checked' : ''}><div><b>${esc(t.nome)}</b><span>${esc((t.ufs || []).join(', ') || 'todos os estados')}</span></div></label>`).join('') || '<p class="empty sm">Nenhum técnico atua neste estado.</p>'}</div>
    <div class="row gap">${m.designado ? '<button class="btn ghost" data-m="clear">Retirar designação</button>' : '<button class="btn ghost" data-m="x">Cancelar</button>'}<button class="btn lime" data-m="ok">${svgi('check', 18)} Designar</button></div>`);
  dlg.onclick = async e => {
    const a = e.target.closest('[data-m]')?.dataset.m; if (!a) return;
    if (a === 'x') return closeModal();
    const tid = a === 'clear' ? null : $('input[name=tec]:checked', dlg)?.value;
    if (a === 'ok' && !tid) return toast('Escolha o técnico', 'err');
    try { const nm = await api.post(`/api/maquinas/${encodeURIComponent(m.serie)}/designar`, { tecnicoId: tid }); closeModal(); done(nm); toast(tid ? `Designada a ${nm.designado.nome}` : 'Designação retirada'); }
    catch (err) { toast(err.message, 'err'); }
  };
}

function exportMaq(ms, tecs, u, f) {
  const dlg = openModal(`<h3 class="h-md">Exportar relatório de máquinas</h3><p class="hint">Excel com a preparação (checklist e observações), a designação e a instalação, sem as fotos.</p>
    <div class="grid2"><label class="fld"><span>Preparada de</span><input type="date" id="xde" value="${f.de}"></label><label class="fld"><span>Até</span><input type="date" id="xate" value="${f.ate}"></label></div>
    <label class="fld"><span>Estado (UF)</span><select id="xuf">${opts([...new Set(ms.map(m => m.uf))].sort().map(x => [x, x]), f.uf, 'Todos os estados')}</select></label>
    <label class="fld"><span>Técnico designado</span><select id="xtec">${opts(tecs.map(t => [t.id, t.nome]), f.tec, 'Todos os técnicos')}</select></label>
    <label class="fld"><span>Situação</span><select id="xk">${opts(Object.entries(CATS).map(([k, [t]]) => [k, t]), f.k, 'Todas')}</select></label>
    <p class="hint" id="xn"></p>
    <div class="row gap"><button type="button" class="btn ghost" data-m="x">Cancelar</button><button type="button" class="btn lime" data-m="go">${svgi('download', 18)} Baixar Excel</button></div>`);
  const sel = () => ({ ...noF(), de: $('#xde').value, ate: $('#xate').value, uf: $('#xuf').value, tec: $('#xtec').value, k: $('#xk').value });
  const count = () => { const n = filtrar(ms, sel()).length; $('#xn').textContent = `${n} máquina${n === 1 ? '' : 's'} no relatório.`; $('[data-m=go]', dlg).disabled = !n; };
  dlg.onchange = count; count();
  dlg.onclick = async e => {
    const m = e.target.closest('[data-m]')?.dataset.m; if (!m) return;
    if (m === 'x') return closeModal();
    const b = e.target.closest('button'); b.disabled = true; b.textContent = 'Gerando…';
    const s = sel();
    const cols = [['Nº de série', x => x.serie, 16], ['PIN', x => x.pin, 10], ['UF (base)', x => x.uf, 8], ['Situação', x => MSTATUS[x.status]?.[0], 14],
      ['Técnico designado', x => x.designado?.nome, 20], ['Designado por', x => x.designado?.por, 16], ['Designado em', x => dt(x.designado?.em), 17, 'd'],
      ['Última preparação', x => dt(x.ultimaPrep?.em), 17, 'd'], ['Preparada por', x => x.ultimaPrep?.tecnico, 18], ['Nº de checklists', x => x.nPreps, 10],
      ...PREP.flatMap(p => [[p.t, x => (x.ultimaPrep ? conf(x.ultimaPrep.itens[p.k]?.ok) : ''), 20], [`${p.t} · observação`, x => x.ultimaPrep?.itens[p.k]?.obs, 30, 'w']]),
      ['Corrigido na última preparação', x => (x.ultimaPrep?.corrigidos || []).map(itemNome).join(', '), 30, 'w'],
      ['Instalada em', x => dt(x.instalada?.em), 17, 'd'], ['ROI', x => x.instalada?.roi, 16], ['Cliente', x => x.instalada?.cliente, 24], ['Ambiente', x => x.instalada?.ambiente, 22]];
    try {
      await writeXlsx('Máquinas', cols, filtrar(ms, s), [['Relatório', 'Máquinas — preparação, designação e instalação'], ['Gerado por', u.nome], ['Preparação', periodo(s)],
        ['Estado (UF)', s.uf || 'Todos'], ['Técnico designado', tecs.find(t => t.id === s.tec)?.nome || 'Todos'], ['Situação', s.k ? CATS[s.k][0] : 'Todas']], 'Fenix_Maquinas');
      closeModal(); toast('Relatório gerado');
    } catch (err) { toast('Não foi possível gerar o relatório: ' + err.message, 'err'); b.disabled = false; b.innerHTML = `${svgi('download', 18)} Baixar Excel`; }
  };
}

/** Uma máquina: designação, instalação e o histórico de checklists de preparação com fotos e correções. */
async function detalhe(el, u, serie) {
  const m = await api.get('/api/maquinas/' + encodeURIComponent(serie)).catch(e => { if (e.status === 404) return null; throw e; });
  if (!m) { el.innerHTML = '<section class="wrap"><p class="empty">Máquina não encontrada.</p></section>'; return; }
  const tecs = u.perfil === 'gestao' ? await api.get('/api/tecnicos') : [];
  const fotoList = p => [...PREP.filter(x => p.fotos?.['i_' + x.k]).map(x => ['i_' + x.k, x.t]), ...PREP_FOTOS.filter(x => p.fotos?.[x.k]).map(x => [x.k, x.t])];
  el.innerHTML = `<section class="wrap">
    <div class="crumbs"><a href="#/maquinas">${svgi('back', 16)} Máquinas</a><span>${esc(m.serie)}</span>${mchip(m.status)}</div>
    ${heroTitle('Máquina', esc(m.serie))}
    <div class="mgrid"><aside>
      <div class="card"><h3 class="h-sm">Dados</h3><dl class="kv sm"><dt>PIN</dt><dd>${esc(m.pin || '—')}</dd><dt>Base (UF)</dt><dd>${esc(m.uf)}</dd><dt>Primeiro checklist</dt><dd>${fmtDT(m.criadoEm)}</dd><dt>Atualizada</dt><dd>${fmtDT(m.atualizadoEm)}</dd></dl></div>
      <div class="card"><h3 class="h-sm">Técnico responsável</h3>${m.designado ? `<p><b>${esc(m.designado.nome)}</b></p><p class="hint">Designado por ${esc(m.designado.por)} em ${fmtDT(m.designado.em)}</p>` : '<p class="hint">Sem técnico designado.</p>'}
        ${u.perfil === 'gestao' && m.status === 'DISPONIVEL' ? `<button class="btn lime sm" data-des>${m.designado ? 'Trocar técnico' : 'Designar técnico'}</button>` : m.status === 'NAO_CONFORME' ? '<p class="hint">Disponível para designação depois de um checklist sem não conformidades.</p>' : ''}</div>
      <div class="card"><h3 class="h-sm">Instalação</h3>${m.instalada ? `<dl class="kv sm"><dt>Cliente</dt><dd>${esc(m.instalada.cliente || '—')}</dd><dt>Ambiente</dt><dd>${esc(m.instalada.ambiente || '—')}</dd><dt>Técnico</dt><dd>${esc(m.instalada.tecnico || '—')}</dd><dt>Data</dt><dd>${fmtDT(m.instalada.em)}</dd><dt>ROI</dt><dd>${esc(m.instalada.roi)}</dd></dl>
        ${['gestao', 'adm', 'projetos'].includes(u.perfil) ? `<a class="btn ghost sm" href="#/lei/${encodeURIComponent(m.instalada.roi)}">${svgi('doc', 14)} Abrir laudo</a>` : ''}` : '<p class="hint">Ainda não instalada.</p>'}</div>
    </aside><div>
      <h2 class="h-lg">Checklists de <span class="hl">preparação</span></h2>
      ${m.preps.map((p, n) => `<article class="card prep-h"><header><div><b>${fmtDT(p.em)}</b><span>${esc(p.tecnico)} · base ${esc(p.uf)}${n === 0 ? ' · mais recente' : ''}</span></div>${p.conforme ? chip('Conforme', 'lime') : chip('Não conforme', 'bad')}</header>
        ${p.corrigidos?.length ? `<p class="fixed">${svgi('check', 14)} Corrigido nesta preparação: <b>${p.corrigidos.map(itemNome).map(esc).join(', ')}</b></p>` : ''}
        <table class="tbl small"><tbody>${PREP.map(x => { const v = p.itens[x.k] || {}; return `<tr><td>${esc(x.t)}</td><td><b class="${v.ok === false ? 'nokc' : v.ok ? 'okc' : 'mute'}">${conf(v.ok)}</b></td><td>${esc(v.obs || '')}</td></tr>`; }).join('')}</tbody></table>
        <div class="ggrid">${fotoList(p).map(([k, t], i) => `<figure class="zoomable" data-p="${n}" data-i="${i}"><img src="${esc(p.fotos[k].mark)}" alt="" loading="lazy"><figcaption>${esc(t)}</figcaption></figure>`).join('')}</div></article>`).join('') || '<p class="empty">Sem checklists registrados.</p>'}
    </div></div></section>`;
  sweep(el);
  el.onclick = e => {
    if (e.target.closest('[data-des]')) return designar(m, tecs, () => detalhe(el, u, serie));
    const fig = e.target.closest('figure[data-p]');
    if (fig) {
      const p = m.preps[+fig.dataset.p], list = fotoList(p);
      let i = +fig.dataset.i;
      const show = () => { const [k, t] = list[i]; $('#lb img').src = p.fotos[k].mark; $('#lb b').textContent = `${t} · ${i + 1}/${list.length}`; };
      const dlg = openModal(`<div id="lb" class="lb"><div class="vw-top"><b></b><span class="sp"></span><button class="icon-btn" data-l="x" aria-label="Fechar">${svgi('x', 18)}</button></div><img alt="">
        <button class="vw-nav prev" data-l="-1" aria-label="Anterior">${svgi('back', 22)}</button><button class="vw-nav next" data-l="1" aria-label="Próxima">${svgi('next', 22)}</button></div>`, { wide: true, cls: 'lbox' });
      dlg.onclick = ev => { const l = ev.target.closest('[data-l]')?.dataset.l; if (l === 'x') return closeModal(); if (l) { i = (i + +l + list.length) % list.length; show(); } };
      show();
    }
  };
}
