// Painel web: visão geral (cards que filtram), fila de laudos (busca, filtros e relatório Excel), editor do LEI,
// visualizador de fotos em tela cheia, download de fotos originais (.zip), Projetos e usuários.
import { api, CHECK, PERFIS, EXPORTA, countNok, fotoList, notify, lib } from './data.js';
import { $, $$, esc, fmtD, fmtDT, toast, openModal, closeModal, svgi, hexi, chip, statusChip, mo, spring, countUp, drawHex, reduced, download, slug } from './ui.js';
import { leiHTML, roiHTML, slidesHTML, openPrint } from './docs.js';

const G = () => window.gsap;
const reveal = (sel, root) => {
  const els = $$(sel, root); if (!els.length || reduced || !G()) return;
  if (window.ScrollTrigger) { G().registerPlugin(window.ScrollTrigger); G().set(els, { opacity: 0, y: 24 }); window.ScrollTrigger.batch(els, { onEnter: b => G().to(b, { opacity: 1, y: 0, duration: 0.6, stagger: 0.08, ease: 'power3.out' }), once: true, start: 'top 92%' }); }
  else G().from(els, { opacity: 0, y: 24, duration: 0.6, stagger: 0.08 });
};
const heroTitle = (txt, hl) => `<h1 class="h-xl">${txt} <span class="hl">${hl}</span></h1>`;
const sweep = root => { if (!reduced) G()?.fromTo($$('.hl', root), { '--w': '0%' }, { '--w': '100%', duration: 0.8, delay: 0.2, ease: 'power3.out' }); };

const validated = rs => rs.filter(r => r.lei?.status === 'DISPONIVEL_PROJETOS');
const load = () => api.get('/api/roi');                       // o servidor já filtra por perfil (técnico: os seus; Consulta: sem detalhes técnicos)
const getRoi = id => api.get('/api/roi/' + encodeURIComponent(id)).catch(e => { if (e.status === 404) return null; throw e; });
const driveTxt = d => ({ ok: 'no Google Drive', pendente: 'envio ao Drive pendente', desativado: 'guardadas no servidor (Drive não configurado)' }[d?.status] || '');
const STATUS = { AGUARDANDO_VALIDACAO: 'Aguardando validação', DISPONIVEL_PROJETOS: 'Disponível p/ Projetos' };
const maqTxt = r => (r.maquina?.n > 1 ? ` · máquina ${r.maquina.i} de ${r.maquina.n}` : '');   // várias máquinas na mesma visita

/* ------------------------- Filtros comuns ------------------------- */
const CAT = {
  todos: () => true, aguardando: r => r.lei?.status === 'AGUARDANDO_VALIDACAO',
  validados: r => r.lei?.status === 'DISPONIVEL_PROJETOS', nok: r => countNok(r) > 0,
};
const noFilter = () => ({ q: '', st: 'todos', tec: '', uf: '', cliente: '', de: '', ate: '' });
const dayStart = d => new Date(d + 'T00:00').getTime();
function applyFilters(rs, f) {
  const q = f.q.trim().toLowerCase();
  return rs.filter(r => CAT[f.st](r)
    && (!q || [r.id, r.local?.cliente, r.local?.ambiente, r.equip?.serie, r.tecnico].some(v => String(v ?? '').toLowerCase().includes(q)))
    && (!f.tec || r.tecnicoId === f.tec) && (!f.uf || r.local?.uf === f.uf) && (!f.cliente || r.local?.cliente === f.cliente)
    && (!f.de || r.closedAt >= dayStart(f.de)) && (!f.ate || r.closedAt < dayStart(f.ate) + 864e5));
}
const isClean = f => JSON.stringify(f) === JSON.stringify(noFilter());
const tecnicos = rs => [...new Map(rs.filter(r => r.tecnicoId).map(r => [r.tecnicoId, r.tecnico])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
const ufsDe = rs => [...new Set(rs.map(r => r.local?.uf).filter(Boolean))].sort();
const clientesDe = rs => [...new Set(rs.map(r => r.local?.cliente).filter(Boolean))].sort((a, b) => a.localeCompare(b));
const opts = (list, sel, todos) => `<option value="">${todos}</option>${list.map(([v, t]) => `<option value="${esc(v)}" ${v === sel ? 'selected' : ''}>${esc(t)}</option>`).join('')}`;

/* ------------------------- Visão geral ------------------------- */
export async function overview(el, u) {
  const rs = await load(), cons = u.perfil === 'consulta';
  const kpis = [['todos', 'doc', cons ? 'Instalações registradas' : 'Laudos recebidos'], ['aguardando', 'clock', 'Aguardando validação'],
    ['validados', 'check', 'Disponíveis p/ Projetos'], ...(cons ? [] : [['nok', 'alert', 'Com não conformidades']])];
  let f = null;
  el.innerHTML = `<section class="band"><div class="wrap">
    <p class="eyebrow">${esc(PERFIS[u.perfil].label)}</p>${heroTitle('Olá,', esc(u.nome) + '.')}
    <p class="lead">${{ gestao: 'Valide os laudos pendentes e libere para Projetos.', projetos: 'Acompanhe ROIs e LEIs, baixe os laudos validados e as fotos para os relatórios dos clientes.', adm: 'Acompanhe toda a operação e gerencie os acessos.', consulta: 'Consulte as instalações e baixe as fotos.' }[u.perfil] || ''}</p></div></section>
    <section class="wrap"><div class="kpis">${kpis.map(([k, i, t]) => `<button type="button" class="kpi" data-k="${k}" aria-pressed="false">${hexi(i)}<b data-n="${rs.filter(CAT[k]).length}">0</b><span>${t}</span></button>`).join('')}</div>
    <div class="sec-h"><h2 class="h-lg" id="tt"></h2><div class="sec-a"><button type="button" class="btn-link clr" id="clr" hidden>${svgi('x', 14)} Limpar filtro</button><a class="btn dark sm" href="#/laudos">Ver todos ${svgi('next', 16)}</a></div></div>
    <div id="tb"></div></section>`;
  const draw = () => {
    const list = f ? rs.filter(CAT[f]) : rs.slice(0, 5);
    $('#tt', el).innerHTML = f ? `${esc(kpis.find(k => k[0] === f)[2])} <small class="mute">${list.length}</small>` : `Últimos <span class="hl">${cons ? 'registros' : 'laudos'}</span>`;
    $('#tb', el).innerHTML = table(list, u, rs.length ? 'Nenhum registro nesta categoria.' : undefined);
    $$('.kpi', el).forEach(b => { b.classList.toggle('on', b.dataset.k === f); b.setAttribute('aria-pressed', b.dataset.k === f); });
    $('#clr', el).hidden = !f;
    reveal('.tbl tbody tr', el);
  };
  el.onclick = e => {
    const k = e.target.closest('.kpi')?.dataset.k;
    if (k) { f = f === k ? null : k; return draw(); }
    if (e.target.closest('#clr')) { f = null; return draw(); }
    const fid = e.target.closest('[data-fotos]')?.dataset.fotos; if (fid) photoPicker(fid);
  };
  draw(); drawHex(el); sweep(el);
  $$('.kpi b', el).forEach(b => countUp(b, +b.dataset.n));
  reveal('.kpi', el);
}

/* ------------------------- Tabelas ------------------------- */
function table(rs, u, empty = 'Nenhum laudo por aqui ainda. Conclua um ROI no app do técnico e sincronize.') {
  if (!rs.length) return `<p class="empty">${empty}</p>`;
  if (u.perfil === 'consulta') return `<div class="tw"><table class="tbl"><thead><tr><th>Cliente / Ambiente</th><th>Localidade</th><th>UF</th><th>Máquina</th><th>Início da instalação</th><th>Entrega</th><th></th></tr></thead><tbody>
    ${rs.map(r => `<tr><td>${esc(r.local.cliente)}<small>${esc(r.local.ambiente)}</small></td><td>${esc(r.local.localizacao)}<small>${esc(r.local.endereco)}</small></td><td>${esc(r.local.uf || '—')}</td>
    <td>${esc(r.equip.serie)}</td><td>${r.iniciadoEm ? fmtD(r.iniciadoEm) : '—'}</td><td>${fmtD(r.closedAt)}</td>
    <td class="ta-r"><button class="btn ghost sm" data-fotos="${esc(r.id)}">${svgi('camera', 14)} Fotos</button></td></tr>`).join('')}</tbody></table></div>`;
  const val = r => u.perfil === 'gestao' && r.lei.status !== 'DISPONIVEL_PROJETOS';
  return `<div class="tw"><table class="tbl"><thead><tr><th>ROI</th><th>Cliente / Ambiente</th><th>UF</th><th>Técnico</th><th>Concluído</th><th>NOK</th><th>Status</th><th></th></tr></thead><tbody>
    ${rs.map(r => { const n = countNok(r); return `<tr><td><b>${r.id}</b></td><td>${esc(r.local.cliente)}<small>${esc(r.local.ambiente)}${maqTxt(r)}</small></td><td>${esc(r.local.uf || '—')}</td><td>${esc(r.tecnico)}</td><td>${fmtD(r.closedAt)}</td>
    <td>${n ? chip(n, 'bad') : '<span class="mute">—</span>'}</td><td>${statusChip(r.lei)}</td>
    <td class="ta-r"><a class="btn ${val(r) ? 'lime' : 'ghost'} sm" href="#/lei/${r.id}">${val(r) ? 'Validar' : 'Abrir'}</a></td></tr>`; }).join('')}</tbody></table></div>`;
}

/* ------------------------- Fila de laudos ------------------------- */
export async function laudos(el, u) {
  const rs = await load(), cons = u.perfil === 'consulta';
  const f = noFilter();
  el.innerHTML = `<section class="band"><div class="wrap"><p class="eyebrow">${cons ? 'Consulta' : 'Fila de laudos'}</p>${cons ? heroTitle('Instalações', 'registradas') : heroTitle('Laudos de', 'entrega')}</div></section>
    <section class="wrap">
    <div class="fhead">${cons ? '<span></span>' : `<div class="filters" id="st"></div>`}
      ${EXPORTA.includes(u.perfil) ? `<button type="button" class="btn dark sm" data-a="export">${svgi('download', 16)} Exportar relatório</button>` : ''}</div>
    <div class="fbar">
      <input type="search" id="fq" placeholder="${cons ? 'Buscar cliente, ambiente ou nº de série' : 'Buscar cliente, ROI, nº de série ou técnico'}" aria-label="Buscar">
      ${cons ? '' : `<select id="ftec" aria-label="Técnico">${opts(tecnicos(rs), '', 'Todos os técnicos')}</select>`}
      <select id="fuf" aria-label="Estado">${opts(ufsDe(rs).map(x => [x, x]), '', 'Todos os estados')}</select>
      <label class="dt">De <input type="date" id="fde"></label><label class="dt">Até <input type="date" id="fate"></label>
    </div>
    <div class="fcount"><span id="cnt"></span><button type="button" class="btn-link clr" id="clr" hidden>${svgi('x', 14)} Limpar filtros</button></div>
    <div id="tb"></div></section>`;
  const draw = () => {
    const list = applyFilters(rs, f), base = applyFilters(rs, { ...f, st: 'todos' });
    if (!cons) $('#st', el).innerHTML = [['todos', 'Todos'], ['aguardando', 'Aguardando'], ['validados', 'Validados'], ['nok', 'Com NOK']]
      .map(([k, t]) => `<button type="button" data-f="${k}" class="${f.st === k ? 'on' : ''}">${t} (${base.filter(CAT[k]).length})</button>`).join('');
    $('#tb', el).innerHTML = table(list, u, rs.length ? 'Nenhum registro com esses filtros.' : undefined);
    $('#cnt', el).textContent = `${list.length} de ${rs.length} ${cons ? 'instalações' : 'laudos'}`;
    $('#clr', el).hidden = isClean(f);
    reveal('.tbl tbody tr', el);
  };
  const fields = { fq: 'q', ftec: 'tec', fuf: 'uf', fde: 'de', fate: 'ate' };
  el.oninput = el.onchange = e => { const k = fields[e.target.id]; if (k) { f[k] = e.target.value; draw(); } };
  el.onclick = e => {
    const b = e.target.closest('[data-f]'); if (b) { f.st = b.dataset.f; return draw(); }
    if (e.target.closest('#clr')) { Object.assign(f, noFilter()); Object.keys(fields).forEach(id => { const x = $('#' + id, el); if (x) x.value = ''; }); return draw(); }
    if (e.target.closest('[data-a=export]')) return exportDialog(rs, u, f);
    const fid = e.target.closest('[data-fotos]')?.dataset.fotos; if (fid) photoPicker(fid);
  };
  sweep(el); draw();
}

/* ------------------------- Relatório em Excel ------------------------- */
function exportDialog(rs, u, f) {
  const dlg = openModal(`<h3 class="h-md">Exportar relatório</h3><p class="hint">Planilha Excel com todas as informações preenchidas nos laudos, sem as fotos.</p>
    <div class="fld"><span>Relatório</span><div class="pills" id="xt"><button type="button" class="pill on" data-v="roi">ROI</button><button type="button" class="pill" data-v="lei">LEI</button></div></div>
    <div class="grid2"><label class="fld"><span>De</span><input type="date" id="xde" value="${f.de}"></label><label class="fld"><span>Até</span><input type="date" id="xate" value="${f.ate}"></label></div>
    <label class="fld"><span>Cliente</span><select id="xcli">${opts(clientesDe(rs).map(x => [x, x]), f.cliente, 'Todos os clientes')}</select></label>
    <label class="fld"><span>Estado (UF)</span><select id="xuf">${opts(ufsDe(rs).map(x => [x, x]), f.uf, 'Todos os estados')}</select></label>
    <label class="fld"><span>Técnico</span><select id="xtec">${opts(tecnicos(rs), f.tec, 'Todos os técnicos')}</select></label>
    <p class="hint" id="xn"></p>
    <div class="row gap"><button type="button" class="btn ghost" data-m="x">Cancelar</button><button type="button" class="btn lime" data-m="go">${svgi('download', 18)} Baixar Excel</button></div>`);
  let tipo = 'roi';
  const sel = () => ({ ...noFilter(), de: $('#xde').value, ate: $('#xate').value, cliente: $('#xcli').value, uf: $('#xuf').value, tec: $('#xtec').value });
  const count = () => { const n = applyFilters(rs, sel()).length; $('#xn').textContent = `${n} laudo${n === 1 ? '' : 's'} no relatório.`; $('[data-m=go]', dlg).disabled = !n; };
  dlg.onchange = count; count();
  dlg.onclick = async e => {
    const p = e.target.closest('.pill'); if (p) { tipo = p.dataset.v; $$('#xt .pill').forEach(x => x.classList.toggle('on', x === p)); return; }
    const m = e.target.closest('[data-m]')?.dataset.m; if (!m) return;
    if (m === 'x') return closeModal();
    const b = e.target.closest('button'); b.disabled = true; b.textContent = 'Gerando…';
    try { const s = sel(); await xlsx(tipo, applyFilters(rs, s), s, rs, u); closeModal(); toast('Relatório gerado'); }
    catch (err) { console.error(err); toast('Não foi possível gerar o relatório: ' + err.message, 'err'); b.disabled = false; b.innerHTML = `${svgi('download', 18)} Baixar Excel`; }
  };
}
// O ExcelJS grava datas em UTC: desloca pelo fuso para a planilha mostrar o horário local.
const dt = t => (t ? new Date(t - new Date(t).getTimezoneOffset() * 60000) : null);
const conf = v => (v == null ? '' : v ? 'Conforme' : 'Não conforme');
const ROI_COLS = () => [
  ['ROI', r => r.id, 16], ['Status do LEI', r => STATUS[r.lei?.status], 22], ['Cliente', r => r.local.cliente, 26], ['Ambiente', r => r.local.ambiente, 24],
  ['Endereço', r => r.local.endereco, 44], ['UF', r => r.local.uf, 6], ['Localização do equipamento', r => r.local.localizacao, 28],
  ['Máquina da visita', r => (r.maquina?.n > 1 ? `${r.maquina.i} de ${r.maquina.n}` : ''), 12], ['Técnico', r => r.tecnico, 18],
  ['Início', r => dt(r.iniciadoEm), 17, 'd'], ['Conclusão', r => dt(r.closedAt), 17, 'd'], ['Sincronizado em', r => dt(r.syncedAt), 17, 'd'],
  ['Nº de série', r => r.equip.serie, 16], ['PIN', r => r.equip.pin, 10], ['APK', r => r.equip.apk, 8],
  ['Modem · operadora', r => r.equip.modem?.op, 12], ['Modem · modelo', r => r.equip.modem?.modelo, 18], ['Modem · IMEI', r => r.equip.modem?.imei, 18], ['Modem · N/S', r => r.equip.modem?.ns, 12],
  ['Chip · operadora', r => r.equip.chip?.op, 12], ['Chip · linha', r => r.equip.chip?.linha, 16], ['Chip · ICCID', r => r.equip.chip?.iccid, 22],
  ...CHECK.flatMap(x => [[x.t, r => conf(r.checklist?.[x.k]?.ok), 20], [`${x.t} · observação`, r => r.checklist?.[x.k]?.obs, 30, 'w']]),
  ['Não conformidades', r => countNok(r), 10], ['Avaria no transporte', r => (r.avaria ? 'Sim' : 'Não'), 10], ['Observações', r => r.obs, 40, 'w'],
  ['Responsável (cliente)', r => r.aceite?.nome, 24], ['Documento do responsável', r => r.aceite?.doc, 18],
];
const LEI_COLS = rows => [
  ['ROI', r => r.id, 16], ['Status', r => STATUS[r.lei?.status], 22], ['Cliente', r => r.local.cliente, 26], ['Ambiente', r => r.local.ambiente, 24], ['UF', r => r.local.uf, 6],
  ['Nº de série', r => r.equip.serie, 16], ['Técnico', r => r.tecnico, 18], ['Conclusão do ROI', r => dt(r.closedAt), 17, 'd'],
  ...rows[0].lei.tec.map((it, i) => [it.t, r => conf(r.lei.tec[i]?.ok), 18]),
  ...rows[0].lei.est.map((it, i) => [it.t, r => (r.lei.est[i] ? (r.lei.est[i].ok ? 'Conforme' : 'Avariado') : ''), 16]),
  ['Observações do LEI', r => r.lei.obs, 44, 'w'], ['Termo de aceite', r => r.lei.termo.replaceAll('[Nº Série]', r.equip.serie), 60, 'w'],
  ['Responsável (cliente)', r => r.aceite?.nome, 24], ['Validado por', r => r.lei.validadoPor, 16], ['Validado em', r => dt(r.lei.validadoEm), 17, 'd'],
  ['Chave de autenticação', r => r.lei.chave, 26],
];
async function xlsx(tipo, rows, f, all, u) {
  const ExcelJS = await lib('exceljs.min.js', 'ExcelJS');
  const wb = new ExcelJS.Workbook(); wb.creator = 'Projeto Fênix'; wb.created = new Date();
  const ws = wb.addWorksheet(tipo === 'roi' ? 'ROI' : 'LEI', { views: [{ state: 'frozen', ySplit: 1 }] });
  const cols = tipo === 'roi' ? ROI_COLS() : LEI_COLS(rows);
  ws.columns = cols.map(([header, , width, kind]) => ({ header, width, style: kind === 'd' ? { numFmt: 'dd/mm/yyyy hh:mm' } : kind === 'w' ? { alignment: { wrapText: true, vertical: 'top' } } : {} }));
  rows.forEach(r => ws.addRow(cols.map(([, fn]) => fn(r) ?? '')));
  const head = ws.getRow(1);
  head.font = { bold: true }; head.height = 30; head.alignment = { vertical: 'middle', wrapText: true };
  head.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCCFF03' } }; c.border = { bottom: { style: 'thin' } }; });
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: cols.length } };
  const tec = tecnicos(all).find(([id]) => id === f.tec)?.[1];
  const info = wb.addWorksheet('Filtros');
  info.columns = [{ width: 18 }, { width: 50 }];
  info.addRows([['Relatório', tipo === 'roi' ? 'ROI — Relatório Operacional de Instalação' : 'LEI — Laudo de Entrega e Instalação'], ['Gerado em', fmtDT(Date.now())], ['Gerado por', u.nome],
    ['Período', f.de || f.ate ? `${f.de ? fmtD(dayStart(f.de)) : 'início'} a ${f.ate ? fmtD(dayStart(f.ate)) : 'hoje'}` : 'Todos'], ['Cliente', f.cliente || 'Todos'],
    ['Estado (UF)', f.uf || 'Todos'], ['Técnico', tec || 'Todos'], ['Registros', rows.length]]);
  info.getColumn(1).font = { bold: true };
  const buf = await wb.xlsx.writeBuffer();
  download(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `Fenix_${tipo.toUpperCase()}_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

/* ------------------------- Fotos: download das originais (.zip) ------------------------- */
const cleanUrl = p => p.origUrl || p.mark;          // original sem a marca de data/GPS (se não houver, a marcada)
const zipPath = (r, f, blob) => `${slug(r.local.cliente)}/${r.id}_${slug(r.local.ambiente)}/${r.id}_${f.k}_${slug(f.t)}.${{ 'image/png': 'png', 'image/webp': 'webp', 'image/heic': 'heic' }[blob.type] || 'jpg'}`;
async function zipPhotos(items, name, onProgress) {
  const JSZip = await lib('jszip.min.js', 'JSZip');
  const z = new JSZip();
  let i = 0;
  for (const { r, f } of items) {
    const blob = await fetch(cleanUrl(r.fotos[f.k]), { credentials: 'same-origin' }).then(x => { if (!x.ok) throw new Error('foto indisponível'); return x.blob(); });
    z.file(zipPath(r, f, blob), blob);
    onProgress?.(++i, items.length);
  }
  download(await z.generateAsync({ type: 'blob' }), name);
}

/** Seletor de fotos de uma instalação (como no Histórico da cooperativa da Jornada TECSO). */
export async function photoPicker(id) {
  const r = await getRoi(id);
  const list = r ? fotoList(r).filter(f => r.fotos?.[f.k]) : [];
  if (!list.length) return toast('Esta instalação não tem fotos disponíveis.', 'err');
  const sel = new Set();
  const dlg = openModal(`<div class="pk-h"><div><h3 class="h-md">${esc(r.local.cliente)} · ${esc(r.local.ambiente)}</h3>
      <p class="hint">${esc(r.id)}${r.local.uf ? ' · ' + esc(r.local.uf) : ''} · fotos originais, sem a marca de data e GPS</p></div>
      <button type="button" class="icon-btn" data-m="x" aria-label="Fechar">${svgi('x', 18)}</button></div>
    <div class="pk-bar"><b id="pkn"></b><button type="button" class="btn-link" data-m="all">Selecionar todas</button><button type="button" class="btn-link" data-m="none">Limpar seleção</button></div>
    <div class="pk-grid">${list.map(f => `<button type="button" class="pk" data-k="${f.k}" aria-pressed="false"><img src="${esc(cleanUrl(r.fotos[f.k]))}" alt="" loading="lazy"><i class="pk-c">${svgi('check', 14)}</i><span>${esc(f.t)}</span></button>`).join('')}</div>
    <div class="pk-foot"><button type="button" class="btn ghost" data-m="dl-all">${svgi('download', 16)} Baixar todas desta instalação (${list.length})</button>
      <button type="button" class="btn lime" data-m="dl-sel"></button></div>`, { wide: true, cls: 'picker' });
  const paint = () => {
    $$('.pk', dlg).forEach(b => { const on = sel.has(b.dataset.k); b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); });
    $('#pkn', dlg).textContent = `${sel.size} de ${list.length} selecionadas`;
    const b = $('[data-m=dl-sel]', dlg); b.innerHTML = `${svgi('download', 16)} Baixar selecionadas (${sel.size}) .zip`; b.disabled = !sel.size;
  };
  paint();
  dlg.onclick = async e => {
    const pk = e.target.closest('.pk');
    if (pk) { sel.has(pk.dataset.k) ? sel.delete(pk.dataset.k) : sel.add(pk.dataset.k); mo(pk, { scale: [0.96, 1] }, spring); return paint(); }
    const m = e.target.closest('[data-m]')?.dataset.m; if (!m) return;
    if (m === 'x') return closeModal();
    if (m === 'all') { list.forEach(f => sel.add(f.k)); return paint(); }
    if (m === 'none') { sel.clear(); return paint(); }
    const pick = m === 'dl-all' ? list : list.filter(f => sel.has(f.k));
    const b = e.target.closest('button'), txt = b.innerHTML; b.disabled = true;
    try { await zipPhotos(pick.map(f => ({ r, f })), `Fotos_${r.id}_${slug(r.local.cliente)}.zip`, (i, n) => { b.textContent = `Preparando ${i}/${n}…`; }); toast(`${pick.length} foto${pick.length > 1 ? 's' : ''} baixada${pick.length > 1 ? 's' : ''}`); }
    catch (err) { toast('Não foi possível baixar: ' + err.message, 'err'); }
    b.innerHTML = txt; b.disabled = false; paint();
  };
}

/** Lista de instalações para baixar fotos (Projetos, ADM e Consulta). */
async function fotosLista(el, u, openId) {
  const rs = await load(), f = noFilter();
  el.innerHTML = `<section class="band"><div class="wrap"><p class="eyebrow">Relatórios fotográficos</p>${heroTitle('Fotos das', 'instalações')}
    <p class="lead">Fotos originais em tamanho real, sem a marca de data e GPS, para montar os relatórios dos clientes. Escolha as fotos de cada instalação ou baixe todas as da lista.</p></div></section>
    <section class="wrap">
    <div class="fbar">
      <input type="search" id="fq" placeholder="Buscar cliente, ambiente ou nº de série" aria-label="Buscar">
      <select id="fcli" aria-label="Cliente">${opts(clientesDe(rs).map(x => [x, x]), '', 'Todos os clientes')}</select>
      <select id="fuf" aria-label="Estado">${opts(ufsDe(rs).map(x => [x, x]), '', 'Todos os estados')}</select>
      <label class="dt">De <input type="date" id="fde"></label><label class="dt">Até <input type="date" id="fate"></label>
    </div>
    <div class="fcount"><span id="cnt"></span><button type="button" class="btn-link clr" id="clr" hidden>${svgi('x', 14)} Limpar filtros</button><span class="sp"></span>
      <button type="button" class="btn lime sm" data-a="zipall">${svgi('download', 16)} Baixar todas as fotos da lista (.zip)</button></div>
    <div id="tb"></div></section>`;
  let list = rs;
  const draw = () => {
    list = applyFilters(rs, f);
    $('#cnt', el).textContent = `${list.length} de ${rs.length} instalações`;
    $('#clr', el).hidden = isClean(f);
    $('[data-a=zipall]', el).disabled = !list.length;
    $('#tb', el).innerHTML = list.length ? `<div class="tw"><table class="tbl"><thead><tr><th>Cliente / Ambiente</th><th>UF</th><th>Máquina</th><th>Entrega</th><th></th></tr></thead><tbody>
      ${list.map(r => `<tr><td>${esc(r.local.cliente)}<small>${esc(r.local.ambiente)} · ${esc(r.id)}</small></td><td>${esc(r.local.uf || '—')}</td><td>${esc(r.equip.serie)}</td><td>${fmtD(r.closedAt)}</td>
      <td class="ta-r"><button class="btn dark sm" data-fotos="${esc(r.id)}">${svgi('camera', 14)} Escolher fotos</button></td></tr>`).join('')}</tbody></table></div>`
      : `<p class="empty">${rs.length ? 'Nenhuma instalação com esses filtros.' : 'Nenhuma instalação registrada ainda.'}</p>`;
  };
  const fields = { fq: 'q', fcli: 'cliente', fuf: 'uf', fde: 'de', fate: 'ate' };
  el.oninput = el.onchange = e => { const k = fields[e.target.id]; if (k) { f[k] = e.target.value; draw(); } };
  el.onclick = async e => {
    if (e.target.closest('#clr')) { Object.assign(f, noFilter()); Object.keys(fields).forEach(id => { $('#' + id, el).value = ''; }); return draw(); }
    const fid = e.target.closest('[data-fotos]')?.dataset.fotos; if (fid) return photoPicker(fid);
    const b = e.target.closest('[data-a=zipall]'); if (!b) return;
    const txt = b.innerHTML; b.disabled = true; b.textContent = 'Reunindo as fotos…';
    try {
      const items = [];
      for (const x of list) { const r = await getRoi(x.id); if (r) fotoList(r).filter(ft => r.fotos?.[ft.k]).forEach(ft => items.push({ r, f: ft })); }
      if (!items.length) throw new Error('nenhuma foto nas instalações da lista');
      await zipPhotos(items, `Fotos_instalacoes_${new Date().toISOString().slice(0, 10)}.zip`, (i, n) => { b.textContent = `Preparando ${i}/${n}…`; });
      toast(`${items.length} fotos de ${list.length} instalações baixadas`);
    } catch (err) { toast('Não foi possível baixar: ' + err.message, 'err'); }
    b.innerHTML = txt; b.disabled = !list.length;
  };
  sweep(el); draw();
  if (openId) photoPicker(openId);
}

/* ------------------------- Editor do LEI ------------------------- */
export async function lei(el, u, id) {
  const r = await getRoi(id);
  if (!r?.lei) { el.innerHTML = '<section class="wrap"><p class="empty">Laudo não encontrado.</p></section>'; return; }
  const L = r.lei, locked = L.status === 'DISPONIVEL_PROJETOS', canEdit = u.perfil === 'gestao' && !locked;
  const seg = (grp, i, it, bad) => `<div class="card chk"><b>${esc(it.t)}</b><div class="seg static ${it.ok ? 'ok' : 'nok'}" data-g="${grp}" data-i="${i}" ${canEdit ? '' : 'aria-disabled="true"'}><span class="thumb"></span><button type="button" data-v="ok">Conforme</button><button type="button" data-v="nok">${bad}</button></div><small class="hint">${esc(it.d)}</small></div>`;
  el.innerHTML = `<section class="wrap lei-wrap">
    <div class="crumbs"><a href="#/laudos">${svgi('back', 16)} Laudos</a><span>${r.id}</span>${statusChip(L)}${r.maquina?.n > 1 ? chip(`Máquina ${r.maquina.i} de ${r.maquina.n} desta visita`) : ''}</div>
    <div class="lei-grid"><aside class="editor">
      <h2 class="h-lg">${canEdit ? 'Revisão da <span class="hl">Supervisão</span>' : 'Laudo <span class="hl">' + (locked ? 'validado' : 'em revisão') + '</span>'}</h2>
      <p class="hint">${canEdit ? 'Edite checklist, observações e o termo com base no seu entendimento e na análise das fotos. Dados do local vêm do ROI.' : locked ? `Validado por ${esc(L.validadoPor)} em ${fmtDT(L.validadoEm)}. Somente leitura.` : 'Somente a Supervisão Operacional edita este laudo.'}</p>
      <div class="row gap wrapx"><button class="btn dark sm" data-a="fotos">${svgi('camera', 16)} Ver fotos do ROI</button><button class="btn ghost sm" data-a="full">${svgi('eye', 16)} Fotos em tela cheia</button><button class="btn ghost sm" data-a="roi">${svgi('doc', 16)} ROI (interno)</button></div>
      <h3 class="h-sm">Conformidade técnica</h3>${L.tec.map((it, i) => seg('tec', i, it, 'Não conforme')).join('')}
      <h3 class="h-sm">Integridade estética</h3>${L.est.map((it, i) => seg('est', i, it, 'Avariado')).join('')}
      <h3 class="h-sm">Observações</h3><textarea id="lobs" rows="4" ${canEdit ? '' : 'disabled'}>${esc(L.obs)}</textarea>
      <h3 class="h-sm">Termo de aceite <small>use [Nº Série] para inserir o número</small></h3><textarea id="ltermo" rows="6" ${canEdit ? '' : 'disabled'}>${esc(L.termo)}</textarea>
      <div class="row gap wrapx">${canEdit ? `<button class="btn lime big" data-a="validate">${svgi('lock', 20)} Validar e assinar</button>` : ''}<button class="btn ${canEdit ? 'ghost' : 'dark'} big" data-a="pdf">${svgi('download', 20)} ${locked ? 'Baixar LEI (PDF)' : 'Pré-visualizar PDF'}</button></div>
    </aside><div class="preview-col" id="pv">${leiHTML(r)}</div></div></section>`;
  sweep(el);
  const refresh = () => { $('#pv', el).innerHTML = leiHTML(r); };
  const persist = async () => {
    clearTimeout(lei.t);
    try { await api.put(`/api/roi/${encodeURIComponent(id)}/laudo`, { tec: L.tec, est: L.est, obs: L.obs, termo: L.termo }); return true; }
    catch (e) { toast(e.message, 'err'); return false; }
  };
  $$('.seg', el).forEach(s => { const th = $('.thumb', s); const w = th.offsetWidth; th.style.transform = `translateX(${s.classList.contains('nok') ? w : 0}px)`; });
  el.onclick = async e => {
    const sb = e.target.closest('.seg button');
    if (sb && canEdit) {
      const s = sb.parentElement, it = L[s.dataset.g][+s.dataset.i], ok = sb.dataset.v === 'ok'; it.ok = ok;
      s.classList.toggle('ok', ok); s.classList.toggle('nok', !ok); mo($('.thumb', s), { x: ok ? 0 : $('.thumb', s).offsetWidth }, spring);
      if (reduced) $('.thumb', s).style.transform = `translateX(${ok ? 0 : $('.thumb', s).offsetWidth}px)`;
      refresh(); persist(); return;
    }
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'fotos') return gallery(r);
    if (a === 'full') return viewer(r, 0);
    if (a === 'roi') return openPrint(roiHTML(r), r.id + ' ROI');
    if (a === 'pdf') return openPrint(leiHTML(r), r.id + ' LEI');
    if (a === 'validate') {
      const dlg = openModal(`<h3 class="h-md">Validar e assinar o LEI?</h3><p class="hint">Após validar, o laudo fica <b>DISPONIVEL_PROJETOS</b> e não pode mais ser editado. A assinatura digital será gerada em nome de <b>${esc(u.nome)}</b>.</p>
        <div class="row gap"><button class="btn ghost" data-m="no">Revisar mais</button><button class="btn lime" data-m="yes">${svgi('lock', 18)} Validar</button></div>`);
      dlg.onclick = async ev => {
        const m = ev.target.closest('[data-m]')?.dataset.m; if (!m) return; closeModal(); if (m !== 'yes') return;
        if (!await persist()) return;                       // grava a última edição antes de assinar
        try { await api.post(`/api/roi/${encodeURIComponent(id)}/laudo/validar`); }   // chave de autenticação é gerada no servidor
        catch (err) { return toast(err.message, 'err'); }
        notify(); toast('LEI validado · disponível para Projetos'); await lei(el, u, id);
        if (window.gsap && !reduced) window.gsap.from('.paper .signed', { scale: 1.8, opacity: 0, rotate: -8, duration: 0.6, ease: 'back.out(2)' });
      };
    }
  };
  el.oninput = e => {
    if (!canEdit) return;
    if (e.target.id === 'lobs') L.obs = e.target.value; if (e.target.id === 'ltermo') L.termo = e.target.value;
    refresh(); clearTimeout(lei.t); lei.t = setTimeout(persist, 500);
  };
}

/* ------------------------- Fotos do ROI ------------------------- */
function gallery(r) {
  const list = fotoList(r);
  openModal(`<h3 class="h-md">Fotos · ${esc(r.local.cliente)} — ${esc(r.local.ambiente)}</h3><p class="hint">Toque numa foto para abrir em tela cheia, ao lado dos dados do ROI.</p>
    <div class="ggrid">${list.map((f, i) => { const p = r.fotos?.[f.k]; return p?.mark ? `<figure class="zoomable" data-i="${i}"><img src="${p.mark}" alt=""><figcaption>${esc(f.t)}</figcaption></figure>` : `<figure class="ph-img"><span>Sem foto</span><figcaption>${esc(f.t)}</figcaption></figure>`; }).join('')}</div>
    <div class="row gap"><button class="btn lime" data-m="x">Fechar</button></div>`, { wide: true }).onclick = e => {
    const fig = e.target.closest('[data-i]');
    if (fig) return viewer(r, fotoList(r).filter(f => r.fotos?.[f.k]?.mark).indexOf(list[+fig.dataset.i]));
    if (e.target.closest('[data-m]')) closeModal();
  };
}

/** Foto em tamanho cheio (com a marca de data e GPS) ao lado dos dados do ROI, para comparar. Setas trocam a foto. */
function viewer(r, start = 0) {
  const list = fotoList(r).filter(f => r.fotos?.[f.k]?.mark);
  if (!list.length) return toast('Este ROI não tem fotos.', 'err');
  let i = Math.max(0, start), zoom = false;
  const key = e => { if (e.key === 'ArrowRight') go(1); if (e.key === 'ArrowLeft') go(-1); if (e.key === 'Escape') closeModal(); };
  const dlg = openModal(`<div class="vw"><div class="vw-main"><div class="vw-top"><b id="vwt"></b><span id="vwn" class="mute"></span><span class="sp"></span>
      <button type="button" class="btn ghost sm" data-v="zoom" id="vwz">${svgi('eye', 14)} Tamanho real</button><button type="button" class="icon-btn" data-v="x" aria-label="Fechar">${svgi('x', 18)}</button></div>
      <div class="vw-img" id="vwi"></div>
      <button type="button" class="vw-nav prev" data-v="prev" aria-label="Foto anterior">${svgi('back', 22)}</button><button type="button" class="vw-nav next" data-v="next" aria-label="Próxima foto">${svgi('next', 22)}</button></div>
    <aside class="vw-side">
      <h4>${esc(r.id)}</h4>
      <dl class="kv sm"><dt>Cliente</dt><dd>${esc(r.local.cliente)}</dd><dt>Ambiente</dt><dd>${esc(r.local.ambiente)}</dd><dt>Localização</dt><dd>${esc(r.local.localizacao)}</dd>
        <dt>Endereço</dt><dd>${esc(r.local.endereco)}</dd><dt>UF</dt><dd>${esc(r.local.uf || '—')}</dd><dt>Nº de série</dt><dd>${esc(r.equip.serie)}</dd><dt>Técnico</dt><dd>${esc(r.tecnico)}</dd><dt>Conclusão</dt><dd>${fmtDT(r.closedAt)}</dd>${r.maquina?.n > 1 ? `<dt>Visita</dt><dd>Máquina ${r.maquina.i} de ${r.maquina.n}</dd>` : ''}</dl>
      <h5>Esta foto</h5><dl class="kv sm" id="vwm"></dl>
      <h5>Checklist do ROI</h5><ul class="vw-chk">${CHECK.map(x => { const v = r.checklist?.[x.k] || {}; return `<li class="${v.ok ? 'ok' : 'nok'}"><b>${v.ok ? 'OK' : 'NOK'}</b><span>${esc(x.t)}${v.obs ? `<small>${esc(v.obs)}</small>` : ''}</span></li>`; }).join('')}</ul>
      <h5>Avaria no transporte</h5><p>${r.avaria ? 'Sim' : 'Não'}</p>
      ${r.obs ? `<h5>Observações do técnico</h5><p>${esc(r.obs)}</p>` : ''}
    </aside></div>`, { wide: true, cls: 'full', onClose: () => removeEventListener('keydown', key) });
  addEventListener('keydown', key);
  function paint() {
    const f = list[i], p = r.fotos[f.k];
    $('#vwt', dlg).textContent = f.t; $('#vwn', dlg).textContent = `${i + 1} / ${list.length}`;
    $('#vwi', dlg).innerHTML = `<img src="${esc(p.mark)}" alt="${esc(f.t)}" class="${zoom ? 'zoom' : ''}">`;
    $('#vwi', dlg).classList.toggle('zoom', zoom);
    $('#vwz', dlg).innerHTML = `${svgi('eye', 14)} ${zoom ? 'Ajustar à tela' : 'Tamanho real'}`;
    $('#vwm', dlg).innerHTML = `<dt>Registrada em</dt><dd>${p.ts ? fmtDT(p.ts) : '—'}</dd><dt>GPS</dt><dd>${p.lat != null ? `${(+p.lat).toFixed(6)}, ${(+p.lng).toFixed(6)}` : 'indisponível'}</dd>
      <dt>Origem</dt><dd>${p.origem === 'galeria' ? 'Galeria do aparelho (data e GPS da própria foto)' : 'Câmera do app'}</dd>`;
    $$('.vw-nav', dlg).forEach(b => { b.hidden = list.length < 2; });
  }
  function go(d) { i = (i + d + list.length) % list.length; paint(); mo($('#vwi img', dlg), { opacity: [0.4, 1] }, { duration: 0.2 }); }
  dlg.onclick = e => {
    const v = e.target.closest('[data-v]')?.dataset.v;
    if (v === 'x') return closeModal();
    if (v === 'prev') return go(-1);
    if (v === 'next') return go(1);
    if (v === 'zoom' || e.target.closest('#vwi img')) { zoom = !zoom; paint(); }
  };
  paint();
}

export async function fotos(el, u, id) {
  if (!id || u.perfil === 'consulta') return fotosLista(el, u, id);
  const r = await getRoi(id);
  if (!r) { el.innerHTML = '<section class="wrap"><p class="empty">ROI não encontrado.</p></section>'; return; }
  const list = fotoList(r);
  el.innerHTML = `<section class="wrap"><div class="crumbs"><a href="#/projetos">${svgi('back', 16)} Projetos</a><span>${r.id}</span></div>
    ${heroTitle('Fotos e', 'check-in')}<p class="lead">${esc(r.local.cliente)} · ${esc(r.local.ambiente)} — fotos originais ${driveTxt(r.drive)}.</p>
    <div class="row gap wrapx"><button class="btn lime" data-a="slides">${svgi('grid', 18)} Montar Check-in Fotográfico</button><button class="btn dark" data-a="baixar">${svgi('download', 18)} Baixar fotos originais (.zip)</button><button class="btn ghost" data-a="lei">${svgi('doc', 18)} LEI (PDF)</button></div>
    <div class="ggrid big">${list.map((f, i) => { const p = r.fotos?.[f.k]; return p?.mark ? `<figure class="zoomable" data-i="${i}"><img src="${esc(p.mark)}" alt=""><figcaption><span>${esc(f.t)}</span></figcaption></figure>` : `<figure class="ph-img"><span>Sem foto</span><figcaption><span>${esc(f.t)}</span></figcaption></figure>`; }).join('')}</div></section>`;
  sweep(el); reveal('.ggrid figure', el);
  el.onclick = e => {
    const fig = e.target.closest('[data-i]');
    if (fig) return viewer(r, fotoList(r).filter(f => r.fotos?.[f.k]?.mark).indexOf(list[+fig.dataset.i]));
    const a = e.target.closest('[data-a]')?.dataset.a;
    if (a === 'baixar') return photoPicker(r.id);
    if (a === 'lei') return openPrint(leiHTML(r), r.id + ' LEI');
    if (a === 'slides') {
      const html = slidesHTML(r);
      openModal(`<h3 class="h-md">Check-in Fotográfico</h3><p class="hint">Capa → dados do local → fotos → institucional. Exportado em PDF junto ao LEI.</p>${html}<div class="row gap"><button class="btn ghost" data-m="x">Fechar</button><button class="btn lime" data-m="pdf">${svgi('download', 18)} Baixar PDF</button></div>`, { wide: true }).onclick = ev => {
        const m = ev.target.closest('[data-m]')?.dataset.m; if (m === 'x') closeModal(); if (m === 'pdf') openPrint(html, r.id + ' Check-in');
      };
    }
  };
}

/* ------------------------- Projetos ------------------------- */
export async function projetos(el, u) {
  const rs = validated(await load());
  el.innerHTML = `<section class="band"><div class="wrap"><p class="eyebrow">Projetos · Relatórios de clientes</p>${heroTitle('Laudos', 'disponíveis')}<p class="lead">LEIs validados pela Supervisão. Baixe, envie ao cliente por e-mail (com as áreas em cópia) e monte o dossiê fotográfico.</p></div></section>
    <section class="wrap">${rs.length ? `<div class="cards">${rs.map(r => `<article class="pcard"><header>${hexi('doc')}<div><b>${esc(r.local.cliente)}</b><span>${esc(r.local.ambiente)}${r.local.uf ? ' · ' + esc(r.local.uf) : ''}</span></div></header>
      <dl class="kv sm"><dt>ROI</dt><dd>${r.id}</dd><dt>Série</dt><dd>${esc(r.equip.serie)}</dd><dt>Validado</dt><dd>${esc(r.lei.validadoPor)} · ${fmtD(r.lei.validadoEm)}</dd><dt>Chave</dt><dd class="mono">${esc(r.lei.chave)}</dd></dl>
      <footer><button class="btn lime sm" data-a="pdf" data-id="${r.id}">${svgi('download', 16)} LEI (PDF)</button><a class="btn dark sm" href="#/fotos/${r.id}">${svgi('camera', 16)} Fotos</a><button class="btn ghost sm" data-a="mail" data-id="${r.id}">${svgi('mail', 16)} E-mail</button></footer></article>`).join('')}</div>` : '<p class="empty">Nenhum laudo validado ainda. A Supervisão precisa validar primeiro.</p>'}</section>`;
  sweep(el); reveal('.pcard', el);
  el.onclick = async e => {
    const b = e.target.closest('[data-a]'); if (!b) return;
    const r = rs.find(x => x.id === b.dataset.id);
    if (b.dataset.a === 'pdf') return openPrint(leiHTML(await getRoi(r.id) || r), r.id + ' LEI');
    if (b.dataset.a === 'mail') {
      const txt = `Assunto: LEI – Retorna Machine – ${r.local.cliente} (${r.local.ambiente}) – Nº série ${r.equip.serie}\n\nPrezados,\n\nSegue em anexo o Laudo de Entrega e Instalação (LEI) do equipamento Retorna Machine, série ${r.equip.serie}, instalado em ${r.local.endereco} em ${fmtD(r.closedAt)}.\n\nPara confirmar o recebimento e a conformidade, pedimos que respondam a este e-mail com o seu aceite. Essa resposta ficará registrada como comprovação de validação.\n\nAtenciosamente,\nAmbipar Pós-Consumo`;
      try { await navigator.clipboard.writeText(txt); toast('Texto do e-mail copiado'); } catch { toast('Não foi possível copiar', 'err'); }
    }
  };
}

/* ------------------------- Usuários ------------------------- */
export async function usuarios(el) {
  const users = await api.get('/api/usuarios');
  const perms = [['Criar/preencher ROI', 'tecnico'], ['Ver todos os ROIs e LEIs', 'gestao adm projetos'], ['Ver instalações (sem detalhes técnicos)', 'consulta'],
    ['Editar e validar LEI', 'gestao'], ['Baixar LEI e Check-in', 'projetos adm'], ['Baixar fotos originais (.zip)', 'projetos adm consulta'],
    ['Exportar relatórios (Excel)', 'gestao adm projetos'], ['Gerenciar usuários', 'adm']];
  el.innerHTML = `<section class="band"><div class="wrap"><p class="eyebrow">ADM</p>${heroTitle('Usuários e', 'acessos')}</div></section>
    <section class="wrap"><div class="tw"><table class="tbl"><thead><tr><th>Usuário</th><th>Perfil</th><th>Estados</th></tr></thead><tbody>${users.map(x => `<tr><td><b>${esc(x.nome)}</b> <small class="mute">${esc(x.id)}</small></td><td>${esc(PERFIS[x.perfil].label)}</td><td>${x.ufs?.length ? esc(x.ufs.join(', ')) : x.perfil === 'tecnico' ? '<span class="mute">todos</span>' : '<span class="mute">nacional</span>'}</td></tr>`).join('')}</tbody></table></div>
    <div class="sec-h"><h2 class="h-lg">Matriz de <span class="hl">permissões</span></h2></div>
    <div class="tw"><table class="tbl mat"><thead><tr><th></th>${Object.keys(PERFIS).map(k => `<th>${k}</th>`).join('')}</tr></thead><tbody>${perms.map(([t, who]) => `<tr><td>${t}</td>${Object.keys(PERFIS).map(k => `<td>${who.split(' ').includes(k) ? svgi('check', 18) : '<span class="mute">—</span>'}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>`;
  sweep(el); reveal('.tbl tbody tr', el);
}
