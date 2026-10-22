// App do técnico: wizard do ROI, offline-first (rascunho contínuo no IndexedDB do aparelho).
import { db, api, CHECK, FOTOS, FOTO_EXTRA, net, uuid, syncAll, notify } from './data.js';
import { $, $$, esc, fmtDT, fmtT, pad, toast, openModal, closeModal, svgi, hexi, mo, spring, shake, chip, setPath, getPath, drawHex, reduced } from './ui.js';
import { roiHTML, openPrint } from './docs.js';

const STEPS = ['Local', 'Equipamento', 'Checklist', 'Fotos', 'Aceite'];
let root, user, D, step = 0, mode = 'home', saveTimer, clock, doneId;

const newDraft = u => ({ id: 'DRAFT-' + u.id, draft: true, tecnico: u.nome, tecnicoId: u.id, iniciadoEm: Date.now(), local: {}, equip: { modem: {}, chip: {} }, checklist: {}, fotos: {}, avaria: false, obs: '', aceite: {} });

export async function renderTecnico(el, u) {
  root = el; user = u; step = 0; mode = 'home';
  D = await db.get('DRAFT-' + u.id);
  await home();
  root.onclick = onClick; root.oninput = onInput; root.onchange = onChange;
  const onData = () => { if (mode === 'home') home(false); else if (mode === 'done') refreshDone(); };
  window.addEventListener('fenix:data', onData);
  return () => { window.removeEventListener('fenix:data', onData); clearInterval(clock); };
}

/* ------------------------------ Home ------------------------------ */
async function home(animate = true) {
  mode = 'home'; clearInterval(clock);
  const mine = (await db.all()).filter(r => !r.draft && r.tecnicoId === user.id).sort((a, b) => b.closedAt - a.closedAt);
  const pend = mine.filter(r => r.sync === 'pendente' && !r.syncError).length;
  const rej = mine.filter(r => r.syncError);
  root.innerHTML = `<section class="phone-home">
    <p class="eyebrow">Olá, ${esc(user.nome)}</p>
    <h1 class="h-xl">Nova <span class="hl">instalação</span></h1>
    <p class="lead">Preencha o ROI mesmo sem sinal. Tudo fica salvo neste aparelho até a sincronização.</p>
    <button class="btn lime big" data-act="new">${svgi('leaf', 22)} ${D ? 'Continuar rascunho' : 'Iniciar ROI'}</button>
    ${D ? `<button class="btn-link" data-act="discard">Descartar rascunho</button>` : ''}
    <div class="sync-card ${pend ? 'has' : ''}">
      <div>${hexi(net.online ? 'cloud' : 'wifi')}</div>
      <div><b>${pend ? `${pend} ROI aguardando sincronização` : 'Tudo sincronizado'}</b>
      <span>${net.online ? 'Conectado — dados seguem para o servidor e as fotos para o Drive.' : 'Sem conexão — a fila é enviada quando o sinal voltar.'}</span></div>
      ${pend ? `<button class="btn dark sm" data-act="sync" ${net.online ? '' : 'disabled'}>Sincronizar</button>` : ''}
    </div>
    ${rej.map(r => `<p class="rule">${svgi('alert', 16)}<span><b>${esc(r.local.cliente)}</b> foi recusado pelo servidor: ${esc(r.syncError)}</span></p>`).join('')}
    <h2 class="h-md">Minhas instalações</h2>
    <div class="list">${mine.length ? mine.map(r => `<div class="li"><div><b>${esc(r.local.cliente)} · ${esc(r.local.ambiente)}</b><span>${esc(r.codigo || 'Aguardando envio')} · ${fmtDT(r.closedAt)}</span></div>
      <div class="li-r">${r.syncError ? chip('Recusado', 'bad') : r.sync === 'pendente' ? chip('Pendente', 'warn') : chip('Sincronizado', 'lime')}<button class="icon-btn" data-act="pdf" data-id="${r.id}" aria-label="Ver ROI em PDF">${svgi('doc', 18)}</button></div></div>`).join('') : '<p class="empty">Nenhuma instalação concluída ainda.</p>'}</div>
  </section>`;
  if (animate) { drawHex(root); mo($$('.phone-home > *', root), { opacity: [0, 1], y: [16, 0] }, { duration: 0.45, delay: window.Motion?.stagger(0.06) }); window.gsap?.fromTo('.phone-home .hl', { '--w': '0%' }, { '--w': '100%', duration: 0.8, delay: 0.25, ease: 'power3.out' }); }
}

/* ------------------------------ Wizard ------------------------------ */
async function startWizard() {
  if (!D) { D = newDraft(user); await db.put(D); }
  mode = 'wizard'; step = D.step || 0;
  root.innerHTML = `<div class="wiz">
    <div class="wiz-head"><button class="icon-btn" data-act="exit" aria-label="Sair e salvar">${svgi('back')}</button>
      <div class="wiz-t"><small>Passo <b id="stepN"></b> de 5</small><b id="stepT"></b></div><span class="saved" id="saved">${svgi('check', 14)} Salvo no aparelho</span></div>
    <div class="prog"><i id="progBar"></i></div>
    <div class="wiz-body" id="wizBody"></div>
    <div class="wiz-bar"><button class="btn ghost" data-act="prev">${svgi('back', 18)} Voltar</button><button class="btn lime" data-act="next" id="nextBtn"></button></div>
  </div>`;
  renderStep(false);
}

function renderStep(animate = true) {
  D.step = step;
  $('#stepN').textContent = step + 1; $('#stepT').textContent = STEPS[step];
  $('[data-act=prev]').style.visibility = step === 0 ? 'hidden' : 'visible';
  $('#nextBtn').innerHTML = step === 4 ? `${svgi('check', 18)} Concluir instalação` : `Avançar ${svgi('next', 18)}`;
  const pct = (step + 1) / 5 * 100;
  mo($('#progBar'), { width: pct + '%' }, spring); if (reduced) $('#progBar').style.width = pct + '%';
  $('#progBar').style.width = pct + '%';
  const body = $('#wizBody');
  body.innerHTML = [stepLocal, stepEquip, stepCheck, stepFotos, stepAceite][step]();
  body.scrollTop = 0; scrollTo({ top: 0 });
  if (animate) mo($$('#wizBody > *', root), { opacity: [0, 1], x: [24, 0] }, { duration: 0.35, delay: window.Motion?.stagger(0.04) });
  if (step === 2) $$('.seg', body).forEach(s => placeSeg(s, s.dataset.s, false));
  if (step === 3) warmGPS();
  if (step === 4) sigPad($('#sig'));
  if (step === 0) { clearInterval(clock); const t = $('#now'); clock = setInterval(() => { if (t.isConnected) t.textContent = fmtDT(Date.now()) + ':' + pad(new Date().getSeconds()); }, 1000); }
  save(true);
}

const field = (p, label, opts = {}) => `<label class="fld"><span>${label}${opts.req === false ? '' : ' <em>*</em>'}</span>
  <input data-p="${p}" value="${esc(getPath(D, p) ?? '')}" ${opts.ph ? `placeholder="${esc(opts.ph)}"` : ''} ${opts.mode ? `inputmode="${opts.mode}"` : ''} autocomplete="off" ${opts.ro ? 'readonly' : ''}></label>`;
const opSel = p => `<div class="fld"><span>Operadora <em>*</em></span><div class="pills" data-op="${p}">${['Vivo', 'Claro'].map(o => `<button type="button" class="pill ${getPath(D, p) === o ? 'on' : ''}" data-v="${o}">${o}</button>`).join('')}</div></div>`;

function stepLocal() {
  return `<div class="card"><h2 class="h-md">${hexi('pin')}<span>Identificação do local</span></h2>
    <div class="fld auto"><span>Data/Hora <small>preenchido automaticamente</small></span><b id="now">${fmtDT(Date.now())}</b></div>
    ${field('local.cliente', 'Cliente', { ph: 'Ex.: IMMU' })}${field('local.ambiente', 'Ambiente', { ph: 'Ex.: Terminal 1' })}
    ${field('local.endereco', 'Endereço')}${field('local.localizacao', 'Localização do equipamento', { ph: 'Ex.: Próximo aos caixas / Entrada principal' })}
    <div class="fld auto"><span>Técnico responsável <small>usuário logado</small></span><b>${esc(D.tecnico)}</b></div></div>`;
}
function stepEquip() {
  return `<div class="card"><h2 class="h-md">${hexi('box')}<span>Equipamento</span></h2>
    <div class="fld"><span>Nº de Série <em>*</em></span><div class="inline"><input data-p="equip.serie" id="serie" value="${esc(D.equip.serie ?? '')}" placeholder="Digite ou escaneie" autocomplete="off" autocapitalize="characters"><button type="button" class="btn dark sm" data-act="cms">${svgi('refresh', 16)} CMS</button></div>
    <small class="hint">Teste: <button type="button" class="tag-btn" data-act="demo">RM-2026-0147</button> preenche modem e chip como o CMS faria.</small></div>
    ${field('equip.pin', 'PIN', { mode: 'numeric' })}${field('equip.apk', 'APK versão', { ph: 'Ex.: 3.8.2' })}</div>
    <div class="card"><h2 class="h-md">${hexi('chip')}<span>Modem</span></h2>${opSel('equip.modem.op')}${field('equip.modem.modelo', 'Modelo')}${field('equip.modem.imei', 'IMEI', { mode: 'numeric' })}${field('equip.modem.ns', 'N/S (número de série)')}</div>
    <div class="card"><h2 class="h-md">${hexi('wifi')}<span>Chip</span></h2>${opSel('equip.chip.op')}${field('equip.chip.linha', 'Número da linha', { mode: 'tel', ph: '(11) 9....-....' })}${field('equip.chip.iccid', 'ICCID do chip', { mode: 'numeric' })}</div>`;
}
function stepCheck() {
  const done = CHECK.filter(x => D.checklist[x.k]?.ok != null).length;
  return `<p class="rule">${svgi('alert', 16)}<span>Respostas obrigatórias. Se <b>Não conforme</b>, a observação técnica é obrigatória.</span><b id="chkCount" class="cnt">${done}/8</b></p>
    ${CHECK.map(x => { const v = D.checklist[x.k] || {}; const s = v.ok === true ? 'ok' : v.ok === false ? 'nok' : ''; return `<div class="card chk" data-k="${x.k}">
      <b>${x.t}</b>
      <div class="seg" data-k="${x.k}" data-s="${s}"><span class="thumb"></span><button type="button" data-v="ok">Conforme</button><button type="button" data-v="nok">Não conforme</button></div>
      <div class="obs-wrap ${s === 'nok' ? 'open' : ''}"><div><textarea data-p="checklist.${x.k}.obs" rows="2" placeholder="Escrever observação (obrigatória)">${esc(v.obs || '')}</textarea></div></div></div>`; }).join('')}`;
}
function placeSeg(seg, s, animate = true) {
  const th = $('.thumb', seg); const w = th.offsetWidth;
  seg.dataset.s = s;
  const x = s === 'nok' ? w : 0;
  th.style.opacity = s ? 1 : 0;
  if (animate) mo(th, { x }, spring); else { th.style.transform = `translateX(${x}px)`; }
  if (animate && reduced) th.style.transform = `translateX(${x}px)`;
}

function slot(f, extra) {
  const p = D.fotos[f.k]; const i = FOTOS.findIndex(x => x.k === f.k);
  return `<div class="slot ${p ? 'done' : ''}" data-k="${f.k}"><button type="button" class="slot-btn" data-act="shot" data-k="${f.k}">
    <span class="sthumb">${p ? `<img src="${p.mark}" alt="">` : svgi('camera', 26)}</span>
    <span class="smeta"><b>${extra ? 'FOTO EXTRA' : 'FOTO ' + (i + 1)}</b><span>${f.t}</span><small>${p ? `${fmtT(p.ts)} · ${p.lat != null ? p.lat.toFixed(4) + ', ' + p.lng.toFixed(4) : 'sem GPS'}` : (f.s || (extra ? 'Obrigatória se houver avaria' : 'Obrigatória'))}</small></span>
    <span class="stag">${p ? 'Refazer' : 'Tirar'}</span></button>
    <input type="file" accept="image/*" capture="environment" hidden data-file="${f.k}"></div>`;
}
function stepFotos() {
  const n = FOTOS.filter(f => D.fotos[f.k]).length;
  return `<p class="rule">${svgi('camera', 16)}<span>Cada foto recebe marca d'água de <b>data/hora e GPS</b> e pode ser refeita antes de confirmar.</span><b id="phCount" class="cnt">${n}/6</b></p>
    ${FOTOS.map(f => slot(f)).join('')}
    <div class="card"><div class="row"><div><b>Avaria no transporte?</b><small class="hint">Se sim, abre o campo do canhoto do frete com ressalva manuscrita.</small></div>
      <button type="button" class="switch ${D.avaria ? 'on' : ''}" role="switch" aria-checked="${!!D.avaria}" data-act="avaria"><i></i></button></div>
      <div class="obs-wrap ${D.avaria ? 'open' : ''}" id="extraSlot">${slot(FOTO_EXTRA, true)}</div></div>`;
}
function stepAceite() {
  return `<div class="card"><h2 class="h-md">${hexi('doc')}<span>Observações e pendências</span></h2>
    <textarea data-p="obs" rows="4" placeholder="Impedimentos de layout, readequação elétrica pelo cliente, necessidade de readesivação parcial/total…">${esc(D.obs || '')}</textarea></div>
    <div class="card"><h2 class="h-md">${hexi('check')}<span>Validação e aceite (cliente)</span></h2>
    <p class="rule soft">Entregue o aparelho ao responsável. Ao assinar, ele declara que acompanhou a instalação e confirma as informações preenchidas.</p>
    ${field('aceite.nome', 'Nome completo do responsável pelo recebimento')}${field('aceite.doc', 'Documento (CPF ou RG)', { mode: 'text' })}
    <div class="fld"><span>Assinatura <em>*</em></span><div class="sigbox"><canvas id="sig"></canvas><button type="button" class="btn-link" data-act="clearSig">Limpar</button></div></div></div>`;
}

/* ------------------------------ Eventos ------------------------------ */
function save(now) {
  clearTimeout(saveTimer);
  const go = async () => { if (!D?.draft) return; await db.put(D); const s = $('#saved'); if (s) mo(s, { opacity: [0.3, 1] }, { duration: 0.4 }); };
  if (now) go(); else saveTimer = setTimeout(go, 350);
}
function onInput(e) {
  const t = e.target; if (!t.dataset.p) return;
  let v = t.value;
  if (t.dataset.p === 'aceite.doc') { v = v.replace(/[^\dxX.\-\/]/g, ''); if (v !== t.value) t.value = v; }
  setPath(D, t.dataset.p, v); save();
}
function onChange(e) {
  const t = e.target;
  if (t.dataset.file) handleFile(t.dataset.file, t.files[0], t);
}
async function onClick(e) {
  const b = e.target.closest('[data-act],.seg button,.pill'); if (!b) return;
  if (b.matches('.seg button')) return setCheck(b);
  if (b.matches('.pill')) { setPath(D, b.parentElement.dataset.op, b.dataset.v); $$('.pill', b.parentElement).forEach(x => x.classList.toggle('on', x === b)); mo(b, { scale: [0.92, 1] }, spring); return save(); }
  const a = b.dataset.act;
  if (a === 'new') return startWizard();
  if (a === 'discard') { if (confirm('Descartar o rascunho deste ROI?')) { await db.del('DRAFT-' + user.id); D = null; home(); } return; }
  if (a === 'exit') { save(true); D = await db.get('DRAFT-' + user.id); toast('Rascunho salvo no aparelho'); return home(); }
  if (a === 'prev') { step = Math.max(0, step - 1); return renderStep(); }
  if (a === 'next') return next();
  if (a === 'cms') return lookupCMS();
  if (a === 'demo') { $('#serie').value = 'RM-2026-0147'; D.equip.serie = 'RM-2026-0147'; return lookupCMS(); }
  if (a === 'shot') return $(`[data-file=${b.dataset.k}]`, root).click();
  if (a === 'avaria') { D.avaria = !D.avaria; b.classList.toggle('on', D.avaria); b.setAttribute('aria-checked', D.avaria); $('#extraSlot').classList.toggle('open', D.avaria); save(); return; }
  if (a === 'clearSig') { const c = $('#sig'); c.getContext('2d').clearRect(0, 0, c.width, c.height); delete D.aceite.assinatura; return save(); }
  if (a === 'sync') return syncUI();
  if (a === 'pdf') { const r = await db.get(b.dataset.id); return openPrint(roiHTML(r), r.codigo || 'ROI'); }
  if (a === 'print') return openPrint(roiHTML(await db.get(b.dataset.id)), 'ROI');
  if (a === 'again') { D = null; return home(); }
}

function setCheck(btn) {
  const seg = btn.parentElement, k = seg.dataset.k, s = btn.dataset.v;
  D.checklist[k] = { ...(D.checklist[k] || {}), ok: s === 'ok' };
  placeSeg(seg, s);
  const wrap = $('.obs-wrap', seg.closest('.chk')); wrap.classList.toggle('open', s === 'nok');
  if (s === 'nok') setTimeout(() => $('textarea', wrap).focus({ preventScroll: true }), 250);
  $('#chkCount').textContent = CHECK.filter(x => D.checklist[x.k]?.ok != null).length + '/8';
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
  D.equip = { serie: sn, pin: c.pin, apk: c.apk, modem: { ...c.modem }, chip: { ...c.chip } };
  save(true); $('#wizBody').innerHTML = stepEquip();
  window.gsap?.fromTo($$('#wizBody input'), { backgroundColor: '#CCFF03' }, { backgroundColor: '#ffffff', duration: 1.6, ease: 'power2.out', stagger: 0.05 });
  toast('Dados carregados do CMS · edite se houve troca de periférico');
}

/* Fotos */
let gps = null, gpsAt = 0;
function warmGPS() { getGPS(); }
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
async function watermark(file, label) {
  const [bmp, g] = await Promise.all([bitmap(file), getGPS()]);
  const W0 = bmp.naturalWidth || bmp.width, H0 = bmp.naturalHeight || bmp.height;
  const s = Math.min(1, 1600 / Math.max(W0, H0)), w = Math.round(W0 * s), h = Math.round(H0 * s);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d'); x.drawImage(bmp, 0, 0, w, h);
  const ts = Date.now(), d = new Date(ts), fs = Math.max(13, Math.round(w / 42));
  const lines = [`${fmtDT(ts).replace(' às ', ' ')}:${pad(d.getSeconds())}`, g ? `GPS ${g.lat.toFixed(6)}, ${g.lng.toFixed(6)} (±${g.acc} m)` : 'GPS indisponível', label];
  const bh = lines.length * fs * 1.4 + fs;
  x.fillStyle = 'rgba(0,0,0,.6)'; x.fillRect(0, h - bh, w, bh);
  x.textBaseline = 'top'; x.font = `600 ${fs}px "Exo 2", system-ui, sans-serif`;
  lines.forEach((t, i) => { x.fillStyle = i === 0 ? '#CCFF03' : '#fff'; x.fillText(t, fs * 0.6, h - bh + fs * 0.5 + i * fs * 1.4); });
  return { mark: c.toDataURL('image/jpeg', 0.82), ts, lat: g?.lat ?? null, lng: g?.lng ?? null };
}
async function handleFile(k, file, input) {
  if (!file) return;
  const f = k === 'fx' ? FOTO_EXTRA : FOTOS.find(x => x.k === k);
  const res = await watermark(file, `${D.local.cliente || 'Cliente'} · ${f.t}`);
  input.value = '';
  const dlg = openModal(`<h3 class="h-md">Revalidar foto</h3><p class="hint">${esc(f.t)}</p>
    <img class="preview" src="${res.mark}" alt="Pré-visualização com marca d'água">
    <div class="row gap"><button class="btn ghost" data-m="retake">Tirar outra</button><button class="btn lime" data-m="use">${svgi('check', 18)} Usar esta foto</button></div>`);
  dlg.onclick = e => {
    const m = e.target.closest('[data-m]')?.dataset.m; if (!m) return;
    closeModal();
    if (m === 'retake') return $(`[data-file=${k}]`, root).click();
    D.fotos[k] = { orig: file, ...res }; save(true);
    const old = $(`.slot[data-k=${k}]`, root); const tmp = document.createElement('div'); tmp.innerHTML = slot(f, k === 'fx'); old.replaceWith(tmp.firstElementChild);
    mo($(`.slot[data-k=${k}]`, root), { scale: [0.96, 1] }, spring);
    const c = $('#phCount'); if (c) c.textContent = FOTOS.filter(x => D.fotos[x.k]).length + '/6';
    toast('Foto registrada');
  };
}

/* Assinatura */
function sigPad(cv) {
  const dpr = devicePixelRatio || 1, r = cv.getBoundingClientRect();
  cv.width = r.width * dpr; cv.height = r.height * dpr;
  const x = cv.getContext('2d'); x.scale(dpr, dpr); x.lineWidth = 2.4; x.lineCap = 'round'; x.lineJoin = 'round'; x.strokeStyle = '#000';
  if (D.aceite.assinatura) { const i = new Image(); i.onload = () => x.drawImage(i, 0, 0, r.width, r.height); i.src = D.aceite.assinatura; }
  let down = false, last;
  const pt = e => { const b = cv.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
  cv.onpointerdown = e => { down = true; last = pt(e); cv.setPointerCapture(e.pointerId); x.beginPath(); x.moveTo(...last); x.lineTo(last[0] + 0.1, last[1]); x.stroke(); };
  cv.onpointermove = e => { if (!down) return; const p = pt(e); x.beginPath(); x.moveTo(...last); x.lineTo(...p); x.stroke(); last = p; };
  const end = () => { if (!down) return; down = false; D.aceite.assinatura = cv.toDataURL('image/png'); save(); };
  cv.onpointerup = end; cv.onpointercancel = end;
}

/* Validação por passo */
function validate() {
  const need = (p, label) => { if (!String(getPath(D, p) ?? '').trim()) return { p, msg: `Preencha: ${label}` }; };
  if (step === 0) return need('local.cliente', 'Cliente') || need('local.ambiente', 'Ambiente') || need('local.endereco', 'Endereço') || need('local.localizacao', 'Localização do equipamento');
  if (step === 1) return need('equip.serie', 'Nº de Série') || need('equip.pin', 'PIN') || need('equip.apk', 'APK versão') || need('equip.modem.op', 'Operadora do modem') || need('equip.modem.modelo', 'Modelo do modem') || need('equip.modem.imei', 'IMEI') || need('equip.modem.ns', 'N/S do modem') || need('equip.chip.op', 'Operadora do chip') || need('equip.chip.linha', 'Número da linha') || need('equip.chip.iccid', 'ICCID');
  if (step === 2) {
    for (const x of CHECK) { const v = D.checklist[x.k]; if (v?.ok == null) return { sel: `.chk[data-k=${x.k}]`, msg: `Responda: ${x.t}` }; if (v.ok === false && !v.obs?.trim()) return { sel: `.chk[data-k=${x.k}] textarea`, msg: `Observação obrigatória: ${x.t}` }; }
  }
  if (step === 3) {
    const f = FOTOS.find(x => !D.fotos[x.k]); if (f) return { sel: `.slot[data-k=${f.k}]`, msg: `Falta a foto: ${f.t}` };
    if (D.avaria && !D.fotos.fx) return { sel: '.slot[data-k=fx]', msg: 'Avaria informada: foto do canhoto é obrigatória' };
  }
  if (step === 4) {
    if (!D.aceite.nome?.trim()) return { p: 'aceite.nome', msg: 'Informe o nome do responsável pelo recebimento' };
    if ((D.aceite.doc || '').replace(/\W/g, '').length < 5) return { p: 'aceite.doc', msg: 'Informe CPF ou RG do responsável' };
    if (!D.aceite.assinatura) return { sel: '.sigbox', msg: 'Colha a assinatura do responsável' };
  }
}
async function next() {
  const bad = validate();
  if (bad) { const el = bad.sel ? $(bad.sel, root) : $(`[data-p="${bad.p}"]`, root); el?.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' }); el?.focus?.({ preventScroll: true }); shake(el?.closest('.fld,.card,.slot,.sigbox') || el); return toast(bad.msg, 'err'); }
  if (step < 4) { step++; return renderStep(); }
  return finish();
}

async function finish() {
  clearTimeout(saveTimer);
  D.closedAt = Date.now();
  const old = D.id; D.id = 'roi-' + uuid(); delete D.draft; delete D.step; D.sync = 'pendente';   // código ROI-AAAA-#### é atribuído pelo servidor
  await db.del(old); await db.put(D); notify();
  const r = D; D = null; mode = 'done'; clearInterval(clock); scrollTo(0, 0);
  root.innerHTML = `<section class="done"><svg class="bigcheck" viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="52" fill="#CCFF03" stroke="#000" stroke-width="3"/><path class="tick" d="M36 62l16 16 32-36" fill="none" stroke="#000" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/></svg>
    <h1 class="h-xl">Instalação <span class="hl">concluída</span></h1>
    <p class="lead"><span id="codeTxt">Código gerado ao sincronizar</span> · encerrada em ${fmtDT(r.closedAt)}:${pad(new Date(r.closedAt).getSeconds())}</p>
    <div class="steps-done"><div>${svgi('check', 18)} ROI gravado no aparelho</div><div>${svgi('doc', 18)} PDF do ROI pronto para compartilhar</div><div id="syncLine">${svgi('clock', 18)} ${net.online ? 'Sincronizando…' : 'Na fila — envia quando houver sinal'}</div></div>
    <button class="btn lime big" data-act="print" data-id="${r.id}">${svgi('doc', 20)} Ver/compartilhar PDF do ROI</button>
    <button class="btn ghost big" data-act="again">Voltar ao início</button></section>`;
  if (window.anime && !reduced) {
    const A = window.anime; const t = A.svg.createDrawable('.tick'); A.animate(t, { draw: ['0 0', '0 1'], duration: 700, ease: 'outCubic', delay: 250 });
    A.animate('.steps-done > div', { opacity: [0, 1], translateY: [12, 0], delay: A.stagger(140, { start: 500 }) });
  }
  doneId = r.id;
  if (net.online) await syncUI(true);
  refreshDone();
}

/** Atualiza o rodapé da tela "concluída" conforme o estado real do registro (também quando o auto-envio termina depois). */
async function refreshDone() {
  const s = $('#syncLine'); if (!s || !doneId) return;
  const saved = await db.get(doneId); if (!saved) return;
  const c = $('#codeTxt');
  if (saved.sync === 'sincronizado') { s.innerHTML = `${svgi('check', 18)} Enviado: dados e fotos no servidor, LEI gerado`; if (c) c.textContent = saved.codigo; }
  else s.innerHTML = `${svgi('clock', 18)} ${saved.syncError ? 'Recusado: ' + esc(saved.syncError) : net.online ? 'Enviando…' : 'Na fila — envia quando houver sinal'}`;
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
