// App do técnico: wizard do ROI, offline-first (rascunho contínuo no IndexedDB do aparelho).
// Uma visita = um cliente com uma ou mais máquinas. O cliente é preenchido uma vez; cada máquina tem os seus passos
// (fotos 1 e 2, local, equipamento, checklist, fotos, aceite com assinatura) e vira um ROI separado ao concluir.
import { db, api, CHECK, FOTOS, AVARIA, CMS_DEMO, UFS, net, uuid, syncAll, notify } from './data.js';
import { $, $$, esc, fmtDT, pad, toast, openModal, closeModal, svgi, hexi, mo, spring, shake, chip, setPath, getPath, drawHex, reduced } from './ui.js';
import { roiHTML, openPrint } from './docs.js';

const MSTEPS = ['Galpão e chegada', 'Local', 'Equipamento', 'Checklist', 'Fotos', 'Aceite'];   // passos de cada máquina
const PRE = FOTOS.slice(0, 2), POS = FOTOS.slice(2);   // fotos 1 e 2 (antes do checklist; câmera ou galeria) e 3 a 6
let root, user, D, M, mode = 'home', saveTimer, clock, doneIds = [];
const F = { q: '', s: 'todas', de: '', ate: '' };     // busca e filtros de "Minhas instalações"

const newMaquina = () => ({ ambiente: '', localizacao: '', equip: { modem: {}, chip: {} }, checklist: {}, fotos: {}, avaria: false, avariaN: 1, obs: '', aceite: {} });
// Vários rascunhos por técnico: cada um tem id próprio (os antigos, 'DRAFT-<usuário>', continuam valendo).
const newDraft = u => ({ id: 'draft-' + uuid(), draft: true, tecnico: u.nome, tecnicoId: u.id, iniciadoEm: Date.now(),
  local: { cliente: '', endereco: '', uf: u.ufs?.length === 1 ? u.ufs[0] : '' }, maquinas: [newMaquina()], stage: 'cliente', mi: 0, ms: 0 });
/** Rascunho do formato antigo (uma máquina, campos na raiz) → formato com lista de máquinas. */
function upgrade(d) {
  if (d.maquinas) return d;
  const { local = {}, equip, checklist, fotos, avaria, avariaN, obs, aceite, step = 0 } = d;
  return { ...d, local: { cliente: local.cliente || '', endereco: local.endereco || '', uf: local.uf || '' }, stage: step ? 'maquina' : 'cliente', mi: 0, ms: Math.min(step + 1, 5),
    maquinas: [{ ...newMaquina(), ambiente: local.ambiente || '', localizacao: local.localizacao || '', equip: equip || newMaquina().equip, checklist: checklist || {}, fotos: fotos || {},
      avaria: !!avaria, avariaN: avariaN || 1, obs: obs || '', aceite: aceite || {} }] };
}
const myUfs = () => user.ufs?.length ? user.ufs : UFS;   // sem UFs cadastradas: qualquer estado
// Caminhos dos campos: 'm.<campo>' é da máquina atual; o resto é da visita (cliente, endereço, UF).
const val = p => (p.startsWith('m.') ? getPath(M, p.slice(2)) : getPath(D, p));
const setVal = (p, v) => (p.startsWith('m.') ? setPath(M, p.slice(2), v) : setPath(D, p, v));

/** Rascunho de ROI já com o estado e o equipamento de uma máquina disponível (lista "Máquinas"). Devolve o id. */
export async function draftFromMachine(u, m) {
  const d = newDraft(u);
  d.local.uf = m.uf; d.maquinaRef = m.serie;
  Object.assign(d.maquinas[0].equip, { serie: m.serie, pin: m.pin || '' });
  await db.put(d);
  return d.id;
}
const OPEN = 'fenix.abrirRascunho';   // aberto pela tela de máquinas: entra direto no wizard

export async function renderTecnico(el, u) {
  root = el; user = u; mode = 'home'; D = M = null;
  let open = null; try { open = sessionStorage.getItem(OPEN); sessionStorage.removeItem(OPEN); } catch { }
  if (open) { await startWizard(open); toast('Máquina carregada: preencha o cliente e siga os passos'); }
  else await home();
  root.onclick = onClick; root.oninput = onInput; root.onchange = onChange;
  const onData = () => { if (mode === 'home') home(false); else if (mode === 'done') refreshDone(); };
  window.addEventListener('fenix:data', onData);
  return () => { window.removeEventListener('fenix:data', onData); clearInterval(clock); };
}

/* ------------------------------ Home ------------------------------ */
const draftInfo = r => {
  if (!r.maquinas) return `passo ${(r.step || 0) + 1}`;
  const n = r.maquinas.length;
  return `${n} máquina${n > 1 ? 's' : ''} · ${r.stage === 'cliente' ? 'dados do cliente' : r.stage === 'resumo' ? 'resumo da visita' : `máquina ${r.mi + 1}: ${MSTEPS[r.ms].toLowerCase()}`}`;
};
async function home(animate = true) {
  mode = 'home'; clearInterval(clock);
  const all = await db.all();
  const drafts = all.filter(r => r.draft && !r.kind && r.tecnicoId === user.id).sort((a, b) => b.iniciadoEm - a.iniciadoEm);
  const mine = all.filter(r => !r.draft && !r.kind && r.tecnicoId === user.id);   // kind 'prep': checklist de preparação (tela Máquinas)
  const pend = mine.filter(r => r.sync === 'pendente' && !r.syncError).length;
  const rej = mine.filter(r => r.syncError);
  root.innerHTML = `<section class="phone-home">
    <p class="eyebrow">Olá, ${esc(user.nome)}</p>
    <h1 class="h-xl">Nova <span class="hl">instalação</span></h1>
    <p class="lead">Preencha o ROI mesmo sem sinal. Tudo fica salvo neste aparelho até a sincronização. Várias máquinas no mesmo cliente? Cadastre o cliente uma vez e adicione as máquinas.</p>
    <button class="btn lime big" data-act="new">${svgi('leaf', 22)} Iniciar ROI</button>
    <a class="pend-card" href="#/maquinas" id="pendCard" hidden></a>
    ${drafts.length ? `<h2 class="h-md">Rascunhos <small class="mute">${drafts.length}</small></h2><div class="list">${drafts.map(r => `<div class="li"><div><b>${esc(r.local?.cliente || 'Cliente não informado')}</b>
      <span>Iniciado em ${fmtDT(r.iniciadoEm)} · ${esc(draftInfo(r))}</span></div>
      <div class="li-r"><button class="btn dark sm" data-act="open" data-id="${esc(r.id)}">Continuar</button><button class="icon-btn" data-act="discard" data-id="${esc(r.id)}" aria-label="Descartar rascunho">${svgi('x', 18)}</button></div></div>`).join('')}</div>` : ''}
    <div class="sync-card ${pend ? 'has' : ''}">
      <div>${hexi(net.online ? 'cloud' : 'wifi')}</div>
      <div><b>${pend ? `${pend} ROI aguardando sincronização` : 'Tudo sincronizado'}</b>
      <span>${net.online ? 'Conectado — dados seguem para o servidor e as fotos para o Drive.' : 'Sem conexão — a fila é enviada quando o sinal voltar.'}</span></div>
      ${pend ? `<button class="btn dark sm" data-act="sync" ${net.online ? '' : 'disabled'}>Sincronizar</button>` : ''}
    </div>
    ${rej.map(r => `<p class="rule">${svgi('alert', 16)}<span><b>${esc(r.local.cliente)}</b> foi recusado pelo servidor: ${esc(r.syncError)}</span></p>`).join('')}
    <h2 class="h-md">Minhas instalações</h2>
    ${mine.length ? `<div class="fbar">
      <input type="search" id="fq" placeholder="Buscar cliente, ambiente ou nº de série" value="${esc(F.q)}" aria-label="Buscar instalações">
      <div class="filters sm">${[['todas', 'Todas'], ['pendente', 'Pendentes'], ['sincronizado', 'Sincronizadas'], ['recusado', 'Recusadas']].map(([k, t]) => `<button type="button" data-fs="${k}" class="${F.s === k ? 'on' : ''}">${t}</button>`).join('')}</div>
      <div class="dates"><label>De <input type="date" id="fde" value="${F.de}"></label><label>Até <input type="date" id="fate" value="${F.ate}"></label></div>
    </div>` : ''}
    <div class="list" id="mineList"></div>
  </section>`;
  drawMine(mine);
  pendencias();
  if (animate) { drawHex(root); mo($$('.phone-home > *', root), { opacity: [0, 1], y: [16, 0] }, { duration: 0.45, delay: window.Motion?.stagger(0.06) }); window.gsap?.fromTo('.phone-home .hl', { '--w': '0%' }, { '--w': '100%', duration: 0.8, delay: 0.25, ease: 'power3.out' }); }
}
/** Cartão "Pendências de instalação": máquinas que a Gestão designou a este técnico. */
async function pendencias() {
  let ms;
  try { ms = await api.get('/api/maquinas'); } catch { try { ms = JSON.parse(localStorage.getItem('fenix.maquinas.' + user.id)); } catch { } }
  const n = (ms || []).filter(m => m.status === 'DISPONIVEL' && m.designado?.id === user.id).length, c = $('#pendCard', root);
  if (!c || !ms) return;
  c.hidden = false;
  c.innerHTML = `${hexi('box')}<span><b>${n ? `${n} instalaç${n > 1 ? 'ões pendentes' : 'ão pendente'}` : 'Nenhuma instalação designada a você'}</b>
    <small>${n ? 'Designadas pela Gestão · toque para ver as máquinas' : 'Veja as máquinas disponíveis no seu estado'}</small></span>${svgi('next', 18)}`;
  c.classList.toggle('has', !!n);
}
const dayStart = d => new Date(d + 'T00:00').getTime();
async function drawMine(mine) {
  mine ??= (await db.all()).filter(r => !r.draft && !r.kind && r.tecnicoId === user.id);
  const q = F.q.trim().toLowerCase();
  const st = r => r.syncError ? 'recusado' : r.sync;
  const list = mine.filter(r => (!q || [r.local?.cliente, r.local?.ambiente, r.equip?.serie, r.codigo].some(v => String(v || '').toLowerCase().includes(q)))
    && (F.s === 'todas' || st(r) === F.s) && (!F.de || r.closedAt >= dayStart(F.de)) && (!F.ate || r.closedAt < dayStart(F.ate) + 864e5))
    .sort((a, b) => b.closedAt - a.closedAt);
  const el = $('#mineList', root); if (!el) return;
  el.innerHTML = !mine.length ? '<p class="empty">Nenhuma instalação concluída ainda.</p>' : !list.length ? '<p class="empty">Nenhuma instalação com esses filtros.</p>'
    : list.map(r => `<div class="li"><div><b>${esc(r.local.cliente)} · ${esc(r.local.ambiente)}</b><span>${esc(r.codigo || 'Aguardando envio')} · ${esc(r.local.uf || '')} · ${fmtDT(r.closedAt)}${r.maquina?.n > 1 ? ` · máquina ${r.maquina.i} de ${r.maquina.n}` : ''}</span></div>
      <div class="li-r">${r.syncError ? chip('Recusado', 'bad') : r.sync === 'pendente' ? chip('Pendente', 'warn') : chip('Sincronizado', 'lime')}<button class="icon-btn" data-act="pdf" data-id="${r.id}" aria-label="Ver ROI em PDF">${svgi('doc', 18)}</button></div></div>`).join('');
}

/* ------------------------------ Wizard ------------------------------ */
async function startWizard(id) {
  D = id ? await db.get(id) : null;
  if (D) D = upgrade(D);
  else { D = newDraft(user); await db.put(D); }
  mode = 'wizard';
  root.innerHTML = `<div class="wiz">
    <div class="wiz-head"><button class="icon-btn" data-act="exit" aria-label="Sair e salvar">${svgi('back')}</button>
      <div class="wiz-t"><small id="stepN"></small><b id="stepT"></b></div><span class="saved" id="saved">${svgi('check', 14)} Salvo no aparelho</span></div>
    <div class="prog"><i id="progBar"></i></div>
    <div class="wiz-body" id="wizBody"></div>
    <div class="wiz-bar"><button class="btn ghost" data-act="prev">${svgi('back', 18)} Voltar</button><button class="btn lime" data-act="next" id="nextBtn"></button></div>
  </div>`;
  renderStep(false);
}
const nM = () => D.maquinas.length;
const mLabel = i => `Máquina ${i + 1}${nM() > 1 ? ' de ' + nM() : ''}`;

function renderStep(animate = true) {
  M = D.stage === 'maquina' ? D.maquinas[D.mi] : null;
  const st = D.stage;
  $('#stepN').textContent = st === 'cliente' ? 'Dados do cliente' : st === 'resumo' ? `Visita · ${nM()} máquina${nM() > 1 ? 's' : ''}` : `${mLabel(D.mi)} · passo ${D.ms + 1} de ${MSTEPS.length}`;
  $('#stepT').textContent = st === 'cliente' ? 'Cliente' : st === 'resumo' ? 'Resumo da visita' : MSTEPS[D.ms];
  $('[data-act=prev]').style.visibility = st === 'cliente' ? 'hidden' : 'visible';
  $('#nextBtn').innerHTML = st === 'resumo' ? `${svgi('check', 18)} Concluir ${nM() > 1 ? `(${nM()} ROIs)` : 'instalação'}` : st === 'maquina' && D.ms === MSTEPS.length - 1 ? `Concluir máquina ${svgi('next', 18)}` : `Avançar ${svgi('next', 18)}`;
  const pct = st === 'cliente' ? 6 : st === 'resumo' ? 100 : 6 + (D.ms + 1) / MSTEPS.length * 88;
  mo($('#progBar'), { width: pct + '%' }, spring);
  $('#progBar').style.width = pct + '%';
  const body = $('#wizBody');
  body.innerHTML = st === 'cliente' ? stepCliente() : st === 'resumo' ? stepResumo() : [stepChegada, stepLocal, stepEquip, stepCheck, stepFotos, stepAceite][D.ms]();
  body.scrollTop = 0; scrollTo({ top: 0 });
  if (animate) mo($$('#wizBody > *', root), { opacity: [0, 1], x: [24, 0] }, { duration: 0.35, delay: window.Motion?.stagger(0.04) });
  clearInterval(clock);
  if (st === 'cliente') { const t = $('#now'); clock = setInterval(() => { if (t.isConnected) t.textContent = fmtDT(Date.now()) + ':' + pad(new Date().getSeconds()); }, 1000); }
  if (st === 'maquina') {
    if (D.ms === 3) $$('.seg', body).forEach(s => placeSeg(s, s.dataset.s, false));
    if (D.ms === 0 || D.ms === 4) warmGPS();
    if (D.ms === 5) sigPad($('#sig'));
  }
  save(true);
}

const field = (p, label, opts = {}) => `<label class="fld"><span>${label}${opts.req === false ? '' : ' <em>*</em>'}</span>
  <input data-p="${p}" value="${esc(val(p) ?? '')}" ${opts.ph ? `placeholder="${esc(opts.ph)}"` : ''} ${opts.mode ? `inputmode="${opts.mode}"` : ''} autocomplete="off" ${opts.ro ? 'readonly' : ''}></label>`;
const opSel = p => `<div class="fld"><span>Operadora <em>*</em></span><div class="pills" data-op="${p}">${['Vivo', 'Claro'].map(o => `<button type="button" class="pill ${val(p) === o ? 'on' : ''}" data-v="${o}">${o}</button>`).join('')}</div></div>`;
const machineHead = () => nM() > 1 || D.mi > 0 ? `<p class="mtag">${hexi('box')}<span><b>${esc(mLabel(D.mi))}</b>${M.ambiente ? ' · ' + esc(M.ambiente) : ''} — ${esc(D.local.cliente)}</span></p>` : '';

function stepCliente() {
  return `<div class="card"><h2 class="h-md">${hexi('pin')}<span>Cliente e endereço</span></h2>
    <p class="hint">Preenchido uma vez por visita. Se houver mais de uma máquina neste cliente, você as adiciona no fim, sem repetir estes dados.</p>
    <div class="fld auto"><span>Data/Hora <small>preenchido automaticamente</small></span><b id="now">${fmtDT(Date.now())}</b></div>
    ${field('local.cliente', 'Cliente', { ph: 'Ex.: IMMU' })}${field('local.endereco', 'Endereço')}
    <div class="fld"><span>Estado (UF) <em>*</em>${user.ufs?.length ? ' <small>sua área de atuação</small>' : ''}</span><div class="pills wrapx" data-op="local.uf">${myUfs().map(o => `<button type="button" class="pill ${D.local.uf === o ? 'on' : ''}" data-v="${o}">${o}</button>`).join('')}</div></div>
    <div class="fld auto"><span>Técnico responsável <small>usuário logado</small></span><b>${esc(D.tecnico)}</b></div></div>`;
}
function stepChegada() {
  return `${machineHead()}<p class="rule">${svgi('camera', 16)}<span><b>Foto 1:</b> a máquina no galpão, pronta para ir ao cliente. Se foi tirada no carregamento do caminhão, escolha da <b>galeria</b>.
    <b>Foto 2:</b> a máquina ao chegar no cliente, antes de instalar. As duas comprovam o estado antes e depois do transporte.</span></p>
    ${PRE.map(f => slot(f, false, true)).join('')}`;
}
function stepLocal() {
  return `${machineHead()}<div class="card"><h2 class="h-md">${hexi('pin')}<span>Local desta máquina</span></h2>
    <div class="fld auto"><span>Cliente</span><b>${esc(D.local.cliente)} · ${esc(D.local.uf)}</b><small>${esc(D.local.endereco)}</small></div>
    ${field('m.ambiente', 'Ambiente', { ph: 'Ex.: Térreo / Estacionamento / Refeitório' })}${field('m.localizacao', 'Localização do equipamento', { ph: 'Ex.: Próximo aos caixas / Entrada principal' })}</div>`;
}
function stepEquip() {
  return `${machineHead()}<div class="card"><h2 class="h-md">${hexi('box')}<span>Equipamento</span></h2>
    <div class="fld"><span>Nº de Série <em>*</em></span><div class="inline"><input data-p="m.equip.serie" id="serie" value="${esc(M.equip.serie ?? '')}" placeholder="Digite ou escaneie" autocomplete="off" autocapitalize="characters"><button type="button" class="btn dark sm" data-act="cms">${svgi('refresh', 16)} CMS</button></div>
    <small class="hint">Teste: ${CMS_DEMO.map(n => `<button type="button" class="tag-btn" data-act="demo" data-sn="${n}">${n}</button>`).join(' ')} preenchem modem e chip como o CMS faria.</small></div>
    ${field('m.equip.pin', 'PIN', { mode: 'numeric' })}${field('m.equip.apk', 'APK versão', { ph: 'Ex.: 3.8.2' })}</div>
    <div class="card"><h2 class="h-md">${hexi('chip')}<span>Modem</span></h2>${opSel('m.equip.modem.op')}${field('m.equip.modem.modelo', 'Modelo')}${field('m.equip.modem.imei', 'IMEI', { mode: 'numeric' })}${field('m.equip.modem.ns', 'N/S (número de série)')}</div>
    <div class="card"><h2 class="h-md">${hexi('wifi')}<span>Chip</span></h2>${opSel('m.equip.chip.op')}${field('m.equip.chip.linha', 'Número da linha', { mode: 'tel', ph: '(11) 9....-....' })}${field('m.equip.chip.iccid', 'ICCID do chip', { mode: 'numeric' })}</div>`;
}
function stepCheck() {
  const done = CHECK.filter(x => M.checklist[x.k]?.ok != null).length;
  return `${machineHead()}<p class="rule">${svgi('alert', 16)}<span>Respostas obrigatórias. Se <b>Não conforme</b>, a observação técnica é obrigatória.</span><b id="chkCount" class="cnt">${done}/8</b></p>
    ${CHECK.map(x => { const v = M.checklist[x.k] || {}; const s = v.ok === true ? 'ok' : v.ok === false ? 'nok' : ''; return `<div class="card chk" data-k="${x.k}">
      <b>${x.t}</b>
      <div class="seg" data-k="${x.k}" data-s="${s}"><span class="thumb"></span><button type="button" data-v="ok">Conforme</button><button type="button" data-v="nok">Não conforme</button></div>
      <div class="obs-wrap ${s === 'nok' ? 'open' : ''}"><div><textarea data-p="m.checklist.${x.k}.obs" rows="2" placeholder="Escrever observação (obrigatória)">${esc(v.obs || '')}</textarea></div></div></div>`; }).join('')}`;
}
function placeSeg(seg, s, animate = true) {
  const th = $('.thumb', seg); const w = th.offsetWidth;
  seg.dataset.s = s;
  const x = s === 'nok' ? w : 0;
  th.style.opacity = s ? 1 : 0;
  if (animate) mo(th, { x }, spring); else { th.style.transform = `translateX(${x}px)`; }
  if (animate && reduced) th.style.transform = `translateX(${x}px)`;
}

/** Slot de foto. Fotos 1 e 2 (gallery) aceitam câmera ou galeria; as demais só câmera. */
function slot(f, extra, gallery = false) {
  const p = M.fotos[f.k]; const i = FOTOS.findIndex(x => x.k === f.k), a = AVARIA.findIndex(x => x.k === f.k);
  const meta = p ? `${p.origem === 'galeria' ? 'Galeria · ' : ''}${fmtDT(p.ts)} · ${p.lat != null ? p.lat.toFixed(4) + ', ' + p.lng.toFixed(4) : 'sem GPS'}` : (a > 0 ? 'Opcional' : extra ? 'Obrigatória se houver avaria' : f.s || 'Obrigatória');
  const head = `<span class="sthumb">${p ? `<img src="${p.mark}" alt="">` : svgi('camera', 26)}</span>
    <span class="smeta"><b>${extra ? 'AVARIA ' + (a + 1) : 'FOTO ' + (i + 1)}</b><span>${f.t}</span><small>${esc(meta)}</small></span>`;
  return `<div class="slot ${p ? 'done' : ''}" data-k="${f.k}">${gallery
    ? `<div class="slot-btn two">${head}<span class="slot-acts"><button type="button" class="stag" data-act="shot" data-k="${f.k}">${p ? 'Refazer' : 'Câmera'}</button><button type="button" class="stag ghost" data-act="gal" data-k="${f.k}">Galeria</button></span></div>
       <input type="file" accept="image/*" hidden data-gal="${f.k}">`
    : `<button type="button" class="slot-btn" data-act="shot" data-k="${f.k}">${head}<span class="stag">${p ? 'Refazer' : 'Tirar'}</span></button>`}
    <input type="file" accept="image/*" capture="environment" hidden data-file="${f.k}"></div>`;
}
function stepFotos() {
  const n = POS.filter(f => M.fotos[f.k]).length;
  return `${machineHead()}<p class="rule">${svgi('camera', 16)}<span>Cada foto recebe marca d'água de <b>data/hora e GPS</b> e pode ser refeita antes de confirmar.</span><b id="phCount" class="cnt">${n}/${POS.length}</b></p>
    ${POS.map(f => slot(f)).join('')}
    <div class="card"><div class="row"><div><b>Avaria no transporte?</b><small class="hint">Se sim, abre o campo do canhoto do frete com ressalva manuscrita.</small></div>
      <button type="button" class="switch ${M.avaria ? 'on' : ''}" role="switch" aria-checked="${!!M.avaria}" data-act="avaria"><i></i></button></div>
      <div class="obs-wrap ${M.avaria ? 'open' : ''}" id="extraSlot"><div>${avariaSlots()}</div></div></div>`;
}
const avariaN = () => Math.max(M.avariaN || 1, ...AVARIA.map((f, i) => (M.fotos[f.k] ? i + 1 : 0)));
function avariaSlots() {
  const n = avariaN();
  return `${AVARIA.slice(0, n).map(f => slot(f, true)).join('')}
    ${n < AVARIA.length ? `<button type="button" class="btn ghost sm add-av" data-act="addAvaria">+ Adicionar foto da avaria <small>(${n} de ${AVARIA.length})</small></button>` : `<small class="hint">Limite de ${AVARIA.length} fotos de avaria.</small>`}`;
}
function stepAceite() {
  const prev = D.maquinas.slice(0, D.mi).reverse().find(m => m.aceite?.nome);
  return `${machineHead()}<div class="card"><h2 class="h-md">${hexi('doc')}<span>Observações e pendências</span></h2>
    <textarea data-p="m.obs" rows="4" placeholder="Impedimentos de layout, readequação elétrica pelo cliente, necessidade de readesivação parcial/total…">${esc(M.obs || '')}</textarea></div>
    <div class="card"><h2 class="h-md">${hexi('check')}<span>Validação e aceite (cliente)</span></h2>
    <p class="rule soft">Entregue o aparelho ao responsável por esta máquina. Ao assinar, ele declara que acompanhou a instalação e confirma as informações preenchidas.</p>
    ${prev && !M.aceite.nome ? `<button type="button" class="btn ghost sm" data-act="samesig">Mesmo responsável da máquina anterior (${esc(prev.aceite.nome)})</button>` : ''}
    ${field('m.aceite.nome', 'Nome completo do responsável pelo recebimento')}${field('m.aceite.doc', 'Documento (CPF ou RG)', { mode: 'text' })}
    <div class="fld"><span>Assinatura <em>*</em> <small>uma por máquina</small></span><div class="sigbox"><canvas id="sig"></canvas><button type="button" class="btn-link" data-act="clearSig">Limpar</button></div></div></div>`;
}
function stepResumo() {
  return `<div class="card"><h2 class="h-md">${hexi('pin')}<span>${esc(D.local.cliente)}</span></h2><p class="hint">${esc(D.local.endereco)} · ${esc(D.local.uf)}</p></div>
    <div class="list">${D.maquinas.map((m, i) => { const bad = checkMaquina(m, i); return `<div class="li"><div><b>${esc(mLabel(i))}${m.ambiente ? ' · ' + esc(m.ambiente) : ''}</b>
      <span>${m.equip?.serie ? 'Série ' + esc(m.equip.serie) + ' · ' : ''}${bad ? 'Falta: ' + esc(bad.msg.replace(/^.*?: /, '')) : 'Completa · vira um ROI separado'}</span></div>
      <div class="li-r">${bad ? chip('Incompleta', 'warn') : chip('Pronta', 'lime')}<span class="row"><button class="btn dark sm" data-act="editM" data-i="${i}">${bad ? 'Continuar' : 'Revisar'}</button>
      ${nM() > 1 ? `<button class="icon-btn" data-act="delM" data-i="${i}" aria-label="Remover máquina">${svgi('x', 18)}</button>` : ''}</span></div></div>`; }).join('')}</div>
    <button type="button" class="btn ghost big" data-act="addM">${svgi('box', 20)} + Adicionar outra máquina neste cliente</button>
    <p class="hint">Cada máquina gera o seu próprio ROI e LEI para a Gestão. O cliente e o endereço são os mesmos para todas.</p>`;
}

/* ------------------------------ Eventos ------------------------------ */
function save(now) {
  clearTimeout(saveTimer);
  const go = async () => { if (!D?.draft) return; await db.put(D); const s = $('#saved'); if (s) mo(s, { opacity: [0.3, 1] }, { duration: 0.4 }); };
  if (now) go(); else saveTimer = setTimeout(go, 350);
}
function onInput(e) {
  const t = e.target;
  if (t.id === 'fq') { F.q = t.value; return drawMine(); }
  if (!t.dataset.p) return;
  let v = t.value;
  if (t.dataset.p === 'm.aceite.doc') { v = v.replace(/[^\dxX.\-\/]/g, ''); if (v !== t.value) t.value = v; }
  setVal(t.dataset.p, v); save();
}
function onChange(e) {
  const t = e.target;
  if (t.id === 'fde' || t.id === 'fate') { F[t.id === 'fde' ? 'de' : 'ate'] = t.value; return drawMine(); }
  if (t.dataset.file) handleFile(t.dataset.file, t.files[0], t, 'camera');
  if (t.dataset.gal) handleFile(t.dataset.gal, t.files[0], t, 'galeria');
}
const go = (stage, mi = D.mi, ms = 0) => { Object.assign(D, { stage, mi, ms }); renderStep(); };
async function onClick(e) {
  const fs = e.target.closest('[data-fs]');
  if (fs) { F.s = fs.dataset.fs; $$('[data-fs]', root).forEach(x => x.classList.toggle('on', x === fs)); return drawMine(); }
  const b = e.target.closest('[data-act],.seg button,.pill'); if (!b) return;
  if (b.matches('.seg button')) return setCheck(b);
  if (b.matches('.pill')) { setVal(b.parentElement.dataset.op, b.dataset.v); $$('.pill', b.parentElement).forEach(x => x.classList.toggle('on', x === b)); mo(b, { scale: [0.92, 1] }, spring); return save(); }
  const a = b.dataset.act;
  if (a === 'new') return startWizard();
  if (a === 'open') return startWizard(b.dataset.id);
  if (a === 'discard') { if (confirm('Descartar este rascunho de ROI?')) { await db.del(b.dataset.id); D = null; home(false); } return; }
  if (a === 'exit') { save(true); D = M = null; toast('Rascunho salvo no aparelho'); return home(); }
  if (a === 'prev') return prev();
  if (a === 'next') return next();
  if (a === 'editM') return go('maquina', +b.dataset.i, 0);
  if (a === 'addM') { D.maquinas.push(newMaquina()); toast(`Máquina ${nM()} adicionada · cliente e endereço já preenchidos`); return go('maquina', nM() - 1, 0); }
  if (a === 'delM') { const i = +b.dataset.i; if (confirm(`Remover a ${mLabel(i).toLowerCase()} desta visita?`)) { D.maquinas.splice(i, 1); D.mi = 0; renderStep(); } return; }
  if (a === 'samesig') { const p = D.maquinas.slice(0, D.mi).reverse().find(m => m.aceite?.nome); Object.assign(M.aceite, { nome: p.aceite.nome, doc: p.aceite.doc }); $('[data-p="m.aceite.nome"]').value = M.aceite.nome; $('[data-p="m.aceite.doc"]').value = M.aceite.doc || ''; b.remove(); return save(); }
  if (a === 'cms') return lookupCMS();
  if (a === 'demo') { $('#serie').value = b.dataset.sn; M.equip.serie = b.dataset.sn; return lookupCMS(); }
  if (a === 'addAvaria') { M.avariaN = Math.min(AVARIA.length, avariaN() + 1); $('#extraSlot > div').innerHTML = avariaSlots(); save(); return $(`[data-file=${AVARIA[M.avariaN - 1].k}]`, root).click(); }
  if (a === 'shot') return $(`[data-file=${b.dataset.k}]`, root).click();
  if (a === 'gal') return $(`[data-gal=${b.dataset.k}]`, root).click();
  if (a === 'avaria') { M.avaria = !M.avaria; b.classList.toggle('on', M.avaria); b.setAttribute('aria-checked', M.avaria); $('#extraSlot').classList.toggle('open', M.avaria); save(); return; }
  if (a === 'clearSig') { const c = $('#sig'); c.getContext('2d').clearRect(0, 0, c.width, c.height); delete M.aceite.assinatura; return save(); }
  if (a === 'sync') return syncUI();
  if (a === 'pdf') { const r = await db.get(b.dataset.id); return openPrint(roiHTML(r), r.codigo || 'ROI'); }
  if (a === 'again') { D = M = null; return home(); }
}

function setCheck(btn) {
  const seg = btn.parentElement, k = seg.dataset.k, s = btn.dataset.v;
  M.checklist[k] = { ...(M.checklist[k] || {}), ok: s === 'ok' };
  placeSeg(seg, s);
  const wrap = $('.obs-wrap', seg.closest('.chk')); wrap.classList.toggle('open', s === 'nok');
  if (s === 'nok') setTimeout(() => $('textarea', wrap).focus({ preventScroll: true }), 250);
  $('#chkCount').textContent = CHECK.filter(x => M.checklist[x.k]?.ok != null).length + '/8';
  save();
}

/* CMS */
async function lookupCMS() {
  const sn = ($('#serie').value || '').trim().toUpperCase();
  if (!sn) return toast('Digite ou escaneie o Nº de Série', 'err');
  if (!net.online) return toast('Sem conexão: preencha manualmente.', 'err');
  const btn = $('[data-act=cms]'); btn.disabled = true;
  let c;
  try { c = await api.get('/api/cms/' + encodeURIComponent(sn)); }
  catch (e) { btn.disabled = false; return toast(e.status === 0 ? 'Servidor indisponível: preencha manualmente.' : `${e.message}. Preencha manualmente.`, 'err'); }
  btn.disabled = false;
  M.equip = { serie: sn, pin: c.pin, apk: c.apk, modem: { ...c.modem }, chip: { ...c.chip } };
  save(true); $('#wizBody').innerHTML = stepEquip();
  window.gsap?.fromTo($$('#wizBody input'), { backgroundColor: '#CCFF03' }, { backgroundColor: '#ffffff', duration: 1.6, ease: 'power2.out', stagger: 0.05 });
  toast('Dados carregados do CMS · edite se houve troca de periférico');
}

/* Fotos */
let gps = null, gpsAt = 0;
export function warmGPS() { getGPS(); }
function getGPS() {
  if (gps && Date.now() - gpsAt < 30000) return Promise.resolve(gps);
  return new Promise(res => {
    if (!navigator.geolocation) return res(null);
    navigator.geolocation.getCurrentPosition(p => { gps = { lat: p.coords.latitude, lng: p.coords.longitude, acc: Math.round(p.coords.accuracy) }; gpsAt = Date.now(); res(gps); }, () => res(null), { enableHighAccuracy: true, timeout: 7000, maximumAge: 20000 });
  });
}
async function bitmap(file) {
  try { return await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch { return await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); }); }
}
/** Data de captura e GPS gravados no EXIF de um JPEG (foto escolhida da galeria). {} se não houver. */
async function exif(file) {
  try {
    const b = new DataView(await file.slice(0, 256 * 1024).arrayBuffer());
    if (b.getUint16(0) !== 0xFFD8) return {};
    for (let o = 2; o + 10 < b.byteLength;) {
      const mk = b.getUint16(o);
      if ((mk & 0xFF00) !== 0xFF00) break;
      if (mk === 0xFFE1 && b.getUint32(o + 4) === 0x45786966) return tiff(b, o + 10);
      o += 2 + b.getUint16(o + 2);
    }
  } catch { /* EXIF ilegível: segue sem */ }
  return {};
}
function tiff(b, t) {
  const le = b.getUint16(t) === 0x4949, u16 = o => b.getUint16(o, le), u32 = o => b.getUint32(o, le);
  const ifd = off => { const n = u16(t + off), out = {}; for (let i = 0; i < n; i++) { const e = t + off + 2 + i * 12; out[u16(e)] = { count: u32(e + 4), at: e + 8 }; } return out; };
  const str = e => { const p = e.count > 4 ? t + u32(e.at) : e.at; let s = ''; for (let i = 0; i < e.count - 1; i++) s += String.fromCharCode(b.getUint8(p + i)); return s; };
  const rat = (e, i) => { const p = t + u32(e.at) + i * 8; return u32(p) / u32(p + 4); };
  const out = {}, i0 = ifd(u32(t + 4)), ex = i0[0x8769] ? ifd(u32(i0[0x8769].at)) : {};
  const d = (ex[0x9003] || i0[0x0132]) && str(ex[0x9003] || i0[0x0132]).match(/(\d{4}):(\d\d):(\d\d) (\d\d):(\d\d):(\d\d)/);
  if (d) out.ts = new Date(+d[1], d[2] - 1, +d[3], +d[4], +d[5], +d[6]).getTime();
  if (i0[0x8825]) {
    const g = ifd(u32(i0[0x8825].at)), deg = e => rat(e, 0) + rat(e, 1) / 60 + rat(e, 2) / 3600;
    if (g[2] && g[4]) { out.lat = deg(g[2]) * (g[1] && str(g[1]) === 'S' ? -1 : 1); out.lng = deg(g[4]) * (g[3] && str(g[3]) === 'W' ? -1 : 1); }
  }
  return out;
}
/** Marca d'água com data/hora, GPS e legenda. Câmera: agora e GPS do aparelho. Galeria: data e GPS da própria foto. */
export async function watermark(file, label, origem) {
  const meta = origem === 'galeria' ? await exif(file) : null;
  const [bmp, g] = await Promise.all([bitmap(file), meta ? (meta.lat != null ? { lat: meta.lat, lng: meta.lng } : null) : getGPS()]);
  const W0 = bmp.naturalWidth || bmp.width, H0 = bmp.naturalHeight || bmp.height;
  const s = Math.min(1, 1600 / Math.max(W0, H0)), w = Math.round(W0 * s), h = Math.round(H0 * s);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d'); x.drawImage(bmp, 0, 0, w, h);
  const ts = meta ? meta.ts || file.lastModified || Date.now() : Date.now(), d = new Date(ts), fs = Math.max(13, Math.round(w / 42));
  const lines = [`${fmtDT(ts).replace(' às ', ' ')}:${pad(d.getSeconds())}${meta ? ' · foto da galeria' : ''}`,
    g ? `GPS ${g.lat.toFixed(6)}, ${g.lng.toFixed(6)}${g.acc ? ` (±${g.acc} m)` : ''}` : 'GPS indisponível', label];
  const bh = lines.length * fs * 1.4 + fs;
  x.fillStyle = 'rgba(0,0,0,.6)'; x.fillRect(0, h - bh, w, bh);
  x.textBaseline = 'top'; x.font = `600 ${fs}px "Exo 2", system-ui, sans-serif`;
  lines.forEach((t, i) => { x.fillStyle = i === 0 ? '#CCFF03' : '#fff'; x.fillText(t, fs * 0.6, h - bh + fs * 0.5 + i * fs * 1.4); });
  return { mark: c.toDataURL('image/jpeg', 0.82), ts, lat: g?.lat ?? null, lng: g?.lng ?? null, origem };
}
async function handleFile(k, file, input, origem) {
  if (!file) return;
  const f = [...FOTOS, ...AVARIA].find(x => x.k === k);
  const res = await watermark(file, `${D.local.cliente || 'Cliente'}${M.ambiente ? ' · ' + M.ambiente : ''} · ${f.t}`, origem);
  input.value = '';
  const dlg = openModal(`<h3 class="h-md">Revalidar foto</h3><p class="hint">${esc(f.t)}${origem === 'galeria' ? ' · da galeria: data e GPS da própria foto' : ''}</p>
    <img class="preview" src="${res.mark}" alt="Pré-visualização com marca d'água">
    <div class="row gap"><button class="btn ghost" data-m="retake">${origem === 'galeria' ? 'Escolher outra' : 'Tirar outra'}</button><button class="btn lime" data-m="use">${svgi('check', 18)} Usar esta foto</button></div>`);
  dlg.onclick = e => {
    const m = e.target.closest('[data-m]')?.dataset.m; if (!m) return;
    closeModal();
    if (m === 'retake') return $(origem === 'galeria' ? `[data-gal=${k}]` : `[data-file=${k}]`, root).click();
    M.fotos[k] = { orig: file, ...res }; save(true);
    const old = $(`.slot[data-k=${k}]`, root); const tmp = document.createElement('div'); tmp.innerHTML = slot(f, k.startsWith('fx'), PRE.includes(f)); old.replaceWith(tmp.firstElementChild);
    mo($(`.slot[data-k=${k}]`, root), { scale: [0.96, 1] }, spring);
    const c = $('#phCount'); if (c) c.textContent = POS.filter(x => M.fotos[x.k]).length + '/' + POS.length;
    toast('Foto registrada');
  };
}

/* Assinatura */
function sigPad(cv) {
  const dpr = devicePixelRatio || 1, r = cv.getBoundingClientRect();
  cv.width = r.width * dpr; cv.height = r.height * dpr;
  const x = cv.getContext('2d'); x.scale(dpr, dpr); x.lineWidth = 2.4; x.lineCap = 'round'; x.lineJoin = 'round'; x.strokeStyle = '#000';
  if (M.aceite.assinatura) { const i = new Image(); i.onload = () => x.drawImage(i, 0, 0, r.width, r.height); i.src = M.aceite.assinatura; }
  let down = false, last;
  const pt = e => { const b = cv.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
  cv.onpointerdown = e => { down = true; last = pt(e); cv.setPointerCapture(e.pointerId); x.beginPath(); x.moveTo(...last); x.lineTo(last[0] + 0.1, last[1]); x.stroke(); };
  cv.onpointermove = e => { if (!down) return; const p = pt(e); x.beginPath(); x.moveTo(...last); x.lineTo(...p); x.stroke(); last = p; };
  const end = () => { if (!down) return; down = false; M.aceite.assinatura = cv.toDataURL('image/png'); save(); };
  cv.onpointerup = end; cv.onpointercancel = end;
}

/* Validação */
function checkCliente() {
  const need = (p, label) => (!String(getPath(D, p) ?? '').trim() ? { p, msg: `Preencha: ${label}` } : null);
  return need('local.cliente', 'Cliente') || need('local.endereco', 'Endereço') || (!D.local.uf ? { sel: '[data-op="local.uf"]', msg: 'Escolha o estado (UF)' } : null);
}
/** Primeiro problema de um passo da máquina m (índice i). Sem `ms`, confere todos os passos (resumo e conclusão). */
function checkMaquina(m, i, ms) {
  const need = (p, label) => (!String(getPath(m, p) ?? '').trim() ? { p: 'm.' + p, msg: `Preencha: ${label}` } : null);
  const steps = [
    () => { const f = PRE.find(x => !m.fotos[x.k]); return f && { sel: `.slot[data-k=${f.k}]`, msg: `Falta a foto: ${f.t}` }; },
    () => need('ambiente', 'Ambiente') || need('localizacao', 'Localização do equipamento'),
    () => need('equip.serie', 'Nº de Série') || need('equip.pin', 'PIN') || need('equip.apk', 'APK versão') || need('equip.modem.op', 'Operadora do modem') || need('equip.modem.modelo', 'Modelo do modem') || need('equip.modem.imei', 'IMEI') || need('equip.modem.ns', 'N/S do modem') || need('equip.chip.op', 'Operadora do chip') || need('equip.chip.linha', 'Número da linha') || need('equip.chip.iccid', 'ICCID')
      || (D.maquinas.some((o, j) => j !== i && o.equip?.serie && o.equip.serie.trim().toUpperCase() === m.equip.serie.trim().toUpperCase()) ? { p: 'm.equip.serie', msg: 'Nº de Série repetido em outra máquina desta visita' } : null),
    () => { for (const x of CHECK) { const v = m.checklist[x.k]; if (v?.ok == null) return { sel: `.chk[data-k=${x.k}]`, msg: `Responda: ${x.t}` }; if (v.ok === false && !v.obs?.trim()) return { sel: `.chk[data-k=${x.k}] textarea`, msg: `Observação obrigatória: ${x.t}` }; } },
    () => { const f = POS.find(x => !m.fotos[x.k]); if (f) return { sel: `.slot[data-k=${f.k}]`, msg: `Falta a foto: ${f.t}` }; if (m.avaria && !m.fotos.fx) return { sel: '.slot[data-k=fx]', msg: 'Avaria informada: foto do canhoto é obrigatória' }; },
    () => !m.aceite?.nome?.trim() ? { p: 'm.aceite.nome', msg: 'Informe o nome do responsável pelo recebimento' }
      : (m.aceite.doc || '').replace(/\W/g, '').length < 5 ? { p: 'm.aceite.doc', msg: 'Informe CPF ou RG do responsável' }
      : !m.aceite.assinatura ? { sel: '.sigbox', msg: 'Colha a assinatura do responsável' } : null,
  ];
  if (ms != null) return steps[ms]() || null;
  for (let s = 0; s < steps.length; s++) { const bad = steps[s](); if (bad) return { ...bad, ms: s }; }
  return null;
}
function complain(bad) {
  const el = bad.sel ? $(bad.sel, root) : $(`[data-p="${bad.p}"]`, root);
  el?.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' }); el?.focus?.({ preventScroll: true });
  shake(el?.closest('.fld,.card,.slot,.sigbox') || el); toast(bad.msg, 'err');
}
function prev() {
  if (D.stage === 'resumo') return go('maquina', nM() - 1, MSTEPS.length - 1);
  if (D.stage === 'maquina' && D.ms > 0) return go('maquina', D.mi, D.ms - 1);
  if (D.stage === 'maquina' && (D.mi > 0 || nM() > 1)) return go('resumo', D.mi);
  return go('cliente', 0);
}
async function next() {
  if (D.stage === 'cliente') { const bad = checkCliente(); if (bad) return complain(bad); return go('maquina', D.mi, 0); }
  if (D.stage === 'maquina') {
    const bad = checkMaquina(M, D.mi, D.ms); if (bad) return complain(bad);
    if (D.ms < MSTEPS.length - 1) return go('maquina', D.mi, D.ms + 1);
    return go('resumo', D.mi);
  }
  const i = D.maquinas.findIndex((m, j) => checkMaquina(m, j));
  if (i >= 0) { const bad = checkMaquina(D.maquinas[i], i); go('maquina', i, bad.ms); return toast(`${mLabel(i)}: ${bad.msg}`, 'err'); }
  return finish();
}

/** Cada máquina vira um registro na fila de envio (um ROI). As da mesma visita compartilham o `grupo`. */
async function finish() {
  clearTimeout(saveTimer);
  const closedAt = Date.now(), n = nM(), grupo = n > 1 ? 'visita-' + uuid() : null;
  const recs = D.maquinas.map((m, i) => ({
    id: 'roi-' + uuid(), sync: 'pendente', tecnico: D.tecnico, tecnicoId: D.tecnicoId, iniciadoEm: D.iniciadoEm, closedAt,   // código ROI-AAAA-#### é atribuído pelo servidor
    local: { cliente: D.local.cliente, endereco: D.local.endereco, uf: D.local.uf, ambiente: m.ambiente, localizacao: m.localizacao },
    equip: m.equip, checklist: m.checklist, fotos: m.fotos, avaria: m.avaria, obs: m.obs, aceite: m.aceite, ...(grupo ? { grupo, maquina: { i: i + 1, n } } : {}),
  }));
  for (const r of recs) await db.put(r);
  await db.del(D.id); notify();
  const cliente = D.local.cliente; D = M = null; mode = 'done'; clearInterval(clock); scrollTo(0, 0);
  doneIds = recs.map(r => r.id);
  root.innerHTML = `<section class="done"><svg class="bigcheck" viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="52" fill="#CCFF03" stroke="#000" stroke-width="3"/><path class="tick" d="M36 62l16 16 32-36" fill="none" stroke="#000" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>
    <h1 class="h-xl">Instalação <span class="hl">concluída</span></h1>
    <p class="lead">${esc(cliente)} · ${n > 1 ? `${n} máquinas, ${n} ROIs` : '1 máquina'} · encerrada em ${fmtDT(closedAt)}:${pad(new Date(closedAt).getSeconds())}</p>
    <div class="steps-done"><div>${svgi('check', 18)} ROI${n > 1 ? 's gravados' : ' gravado'} no aparelho</div><div>${svgi('doc', 18)} PDF${n > 1 ? 's' : ''} do ROI pronto${n > 1 ? 's' : ''} para compartilhar</div><div id="syncLine">${svgi('clock', 18)} ${net.online ? 'Sincronizando…' : 'Na fila — envia quando houver sinal'}</div></div>
    <div class="list" id="doneList"></div>
    <button class="btn ghost big" data-act="again">Voltar ao início</button></section>`;
  if (window.anime && !reduced) {
    const A = window.anime; const t = A.svg.createDrawable('.tick'); A.animate(t, { draw: ['0 0', '0 1'], duration: 700, ease: 'outCubic', delay: 250 });
    A.animate('.steps-done > div', { opacity: [0, 1], translateY: [12, 0], delay: A.stagger(140, { start: 500 }) });
  }
  await refreshDone();
  if (net.online) await syncUI(true);
  refreshDone();
}

/** Atualiza a tela "concluída" conforme o estado real dos registros (também quando o auto-envio termina depois). */
async function refreshDone() {
  const s = $('#syncLine'), l = $('#doneList'); if (!s || !doneIds.length) return;
  const recs = (await Promise.all(doneIds.map(id => db.get(id)))).filter(Boolean); if (!recs.length) return;
  const ok = recs.filter(r => r.sync === 'sincronizado').length, err = recs.find(r => r.syncError);
  s.innerHTML = ok === recs.length ? `${svgi('check', 18)} Enviado: dados e fotos no servidor, LEI${recs.length > 1 ? 's' : ''} gerado${recs.length > 1 ? 's' : ''}`
    : `${svgi('clock', 18)} ${err ? 'Recusado: ' + esc(err.syncError) : net.online ? 'Enviando…' : 'Na fila — envia quando houver sinal'}`;
  l.innerHTML = recs.map(r => `<div class="li"><div><b>${esc(r.local.ambiente)}</b><span>${esc(r.codigo || 'Código gerado ao sincronizar')} · série ${esc(r.equip.serie)}</span></div>
    <div class="li-r"><button class="btn lime sm" data-act="pdf" data-id="${r.id}">${svgi('doc', 16)} PDF do ROI</button></div></div>`).join('');
}

/* Sincronização com feedback */
export async function syncUI(silent = false) {
  if (!net.online) return toast('Sem conexão. Tente novamente com sinal.', 'err');
  const names = { dados: 'Importando dados para a base', fotos: 'Enviando fotos em alta resolução ao Drive', lei: 'Gerando LEI pré-preenchido' };
  const dlg = silent ? null : openModal(`<h3 class="h-md">Sincronizando…</h3><div class="syncsteps">${Object.entries(names).map(([k, v]) => `<div data-s="${k}">${svgi('clock', 18)} ${v}</div>`).join('')}</div>`);
  const done = d => { d.classList.remove('now'); d.classList.add('ok'); d.innerHTML = d.innerHTML.replace(/<svg.*?<\/svg>/, svgi('check', 18)); };
  let prev, res = { n: 0, errors: [] };
  try {
    res = await syncAll(st => { if (!dlg) return; if (prev) done(prev); prev = $(`[data-s=${st}]`, dlg); prev.classList.add('now'); });
    if (dlg) { $$('.syncsteps div', dlg).forEach(done); await new Promise(r => setTimeout(r, 500)); }
  } catch (e) {
    toast(e.status === 401 ? 'Sessão expirada — entre novamente para enviar.' : e.status === 0 ? 'Servidor indisponível. Os dados continuam salvos no aparelho.' : e.message, 'err');
  }
  closeModal();
  if (res.n) toast(`${res.n} ROI sincronizado${res.n > 1 ? 's' : ''} · LEI enviado à Supervisão`);
  res.errors.forEach(m => toast('Recusado: ' + m, 'err'));
  if (mode === 'home') home(false);
  return res;
}
