// Painel web: visão geral, fila de laudos, editor do LEI, Projetos (fotos / check-in) e usuários.
import { api, FOTOS, FOTO_EXTRA, PERFIS, countNok, notify } from './data.js';
import { $, $$, esc, fmtD, fmtDT, toast, openModal, closeModal, svgi, hexi, chip, statusChip, mo, spring, countUp, drawHex, reduced } from './ui.js';
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
const waiting = rs => rs.filter(r => r.lei?.status === 'AGUARDANDO_VALIDACAO');
const load = () => api.get('/api/roi');                       // o servidor já filtra por perfil (Projetos só vê validados)
const driveTxt = d => ({ ok: 'no Google Drive', pendente: 'envio ao Drive pendente', desativado: 'guardadas no servidor (Drive não configurado)' }[d?.status] || '');

/* ------------------------- Visão geral ------------------------- */
export async function overview(el, u) {
  const rs = await load();
  const kpis = [
    ['doc', rs.length, 'Laudos recebidos'], ['clock', waiting(rs).length, 'Aguardando validação'],
    ['check', validated(rs).length, 'Disponíveis p/ Projetos'], ['alert', rs.filter(r => countNok(r) > 0).length, 'Com não conformidades'],
  ];
  el.innerHTML = `<section class="band"><div class="wrap">
    <p class="eyebrow">${esc(PERFIS[u.perfil].label)}</p>${heroTitle('Olá,', esc(u.nome) + '.')}
    <p class="lead">${{ gestao: 'Valide os laudos pendentes e libere para Projetos.', projetos: 'Baixe os LEIs validados e monte os dossiês fotográficos.', adm: 'Acompanhe toda a operação e gerencie os acessos.', consulta: 'Consulte laudos e fotos das instalações.' }[u.perfil]}</p></div></section>
    <section class="wrap"><div class="kpis">${kpis.map(([i, n, t]) => `<div class="kpi">${hexi(i)}<b data-n="${n}">0</b><span>${t}</span></div>`).join('')}</div>
    <div class="sec-h"><h2 class="h-lg">Últimos <span class="hl">laudos</span></h2><a class="btn dark sm" href="${u.perfil === 'projetos' ? '#/projetos' : '#/laudos'}">Ver todos ${svgi('next', 16)}</a></div>
    ${table(rs.slice(0, 5), u)}</section>`;
  drawHex(el); sweep(el);
  $$('.kpi b', el).forEach(b => countUp(b, +b.dataset.n));
  reveal('.kpi, .tbl tbody tr', el);
}

/* ------------------------- Fila de laudos ------------------------- */
function table(rs, u) {
  if (!rs.length) return '<p class="empty">Nenhum laudo por aqui ainda. Conclua um ROI no app do técnico e sincronize.</p>';
  return `<div class="tw"><table class="tbl"><thead><tr><th>ROI</th><th>Cliente / Ambiente</th><th>Técnico</th><th>Concluído</th><th>NOK</th><th>Status</th><th></th></tr></thead><tbody>
    ${rs.map(r => { const n = countNok(r); return `<tr><td><b>${r.id}</b></td><td>${esc(r.local.cliente)}<small>${esc(r.local.ambiente)}</small></td><td>${esc(r.tecnico)}</td><td>${fmtD(r.closedAt)}</td>
    <td>${n ? chip(n, 'bad') : '<span class="mute">—</span>'}</td><td>${statusChip(r.lei)}</td>
    <td class="ta-r"><a class="btn ${u.perfil === 'gestao' && r.lei.status !== 'DISPONIVEL_PROJETOS' ? 'lime' : 'ghost'} sm" href="#/lei/${r.id}">${u.perfil === 'gestao' && r.lei.status !== 'DISPONIVEL_PROJETOS' ? 'Validar' : 'Abrir'}</a></td></tr>`; }).join('')}</tbody></table></div>`;
}
export async function laudos(el, u) {
  const rs = await load(); let f = 'todos';
  const draw = () => {
    const list = f === 'todos' ? rs : f === 'aguardando' ? waiting(rs) : validated(rs);
    $('#tb', el).innerHTML = table(list, u);
    $$('.filters button', el).forEach(b => b.classList.toggle('on', b.dataset.f === f));
    reveal('.tbl tbody tr', el);
  };
  el.innerHTML = `<section class="band"><div class="wrap"><p class="eyebrow">Fila de laudos</p>${heroTitle('Laudos de', 'entrega')}</div></section>
    <section class="wrap"><div class="filters">${[['todos', `Todos (${rs.length})`], ['aguardando', `Aguardando (${waiting(rs).length})`], ['validados', `Validados (${validated(rs).length})`]].map(([k, t]) => `<button data-f="${k}">${t}</button>`).join('')}</div><div id="tb"></div></section>`;
  el.onclick = e => { const b = e.target.closest('[data-f]'); if (b) { f = b.dataset.f; draw(); } };
  sweep(el); draw();
}

/* ------------------------- Editor do LEI ------------------------- */
export async function lei(el, u, id) {
  const r = await api.get('/api/roi/' + encodeURIComponent(id)).catch(e => { if (e.status === 404) return null; throw e; });
  if (!r?.lei) { el.innerHTML = '<section class="wrap"><p class="empty">Laudo não encontrado.</p></section>'; return; }
  const L = r.lei, locked = L.status === 'DISPONIVEL_PROJETOS', canEdit = u.perfil === 'gestao' && !locked;
  const seg = (grp, i, it, bad) => `<div class="card chk"><b>${esc(it.t)}</b><div class="seg static ${it.ok ? 'ok' : 'nok'}" data-g="${grp}" data-i="${i}" ${canEdit ? '' : 'aria-disabled="true"'}><span class="thumb"></span><button type="button" data-v="ok">Conforme</button><button type="button" data-v="nok">${bad}</button></div><small class="hint">${esc(it.d)}</small></div>`;
  el.innerHTML = `<section class="wrap lei-wrap">
    <div class="crumbs"><a href="${u.perfil === 'projetos' ? '#/projetos' : '#/laudos'}">${svgi('back', 16)} Laudos</a><span>${r.id}</span>${statusChip(L)}</div>
    <div class="lei-grid"><aside class="editor">
      <h2 class="h-lg">${canEdit ? 'Revisão da <span class="hl">Supervisão</span>' : 'Laudo <span class="hl">' + (locked ? 'validado' : 'em revisão') + '</span>'}</h2>
      <p class="hint">${canEdit ? 'Edite checklist, observações e o termo com base no seu entendimento e na análise das fotos. Dados do local vêm do ROI.' : locked ? `Validado por ${esc(L.validadoPor)} em ${fmtDT(L.validadoEm)}. Somente leitura.` : 'Somente a Supervisão Operacional edita este laudo.'}</p>
      <div class="row gap wrapx"><button class="btn dark sm" data-a="fotos">${svgi('camera', 16)} Ver fotos do ROI</button><button class="btn ghost sm" data-a="roi">${svgi('doc', 16)} ROI (interno)</button></div>
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

/* ------------------------- Fotos ------------------------- */
function gallery(r) {
  const list = [...FOTOS, ...(r.avaria ? [FOTO_EXTRA] : [])];
  openModal(`<h3 class="h-md">Fotos · ${esc(r.local.cliente)} — ${esc(r.local.ambiente)}</h3><div class="ggrid">${list.map(f => { const p = r.fotos?.[f.k]; return p?.mark ? `<figure><img src="${p.mark}" alt=""><figcaption>${esc(f.t)}</figcaption></figure>` : `<figure class="ph-img"><span>Foto de exemplo</span><figcaption>${esc(f.t)}</figcaption></figure>`; }).join('')}</div>
    <div class="row gap"><button class="btn lime" data-m="x">Fechar</button></div>`, { wide: true }).onclick = e => { if (e.target.closest('[data-m]')) closeModal(); };
}

export async function fotos(el, u, id) {
  const r = await api.get('/api/roi/' + encodeURIComponent(id)).catch(e => { if (e.status === 404) return null; throw e; });
  if (!r) { el.innerHTML = '<section class="wrap"><p class="empty">ROI não encontrado.</p></section>'; return; }
  const list = [...FOTOS, ...(r.avaria ? [FOTO_EXTRA] : [])];
  el.innerHTML = `<section class="wrap"><div class="crumbs"><a href="#/projetos">${svgi('back', 16)} Projetos</a><span>${r.id}</span></div>
    ${heroTitle('Fotos e', 'check-in')}<p class="lead">${esc(r.local.cliente)} · ${esc(r.local.ambiente)} — fotos originais ${driveTxt(r.drive)}.</p>
    <div class="row gap wrapx"><button class="btn lime" data-a="slides">${svgi('grid', 18)} Montar Check-in Fotográfico</button><button class="btn ghost" data-a="lei">${svgi('doc', 18)} LEI (PDF)</button></div>
    <div class="ggrid big">${list.map(f => { const p = r.fotos?.[f.k]; return p?.mark ? `<figure><img src="${esc(p.mark)}" alt=""><figcaption><span>${esc(f.t)}</span>${p.origUrl ? `<a class="btn dark sm" href="${esc(p.origUrl)}" download>${svgi('download', 14)} Original</a>` : ''}</figcaption></figure>` : `<figure class="ph-img"><span>Foto de exemplo</span><figcaption><span>${esc(f.t)}</span></figcaption></figure>`; }).join('')}</div></section>`;
  sweep(el); reveal('.ggrid figure', el);
  el.onclick = e => {
    const a = e.target.closest('[data-a]')?.dataset.a;
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
    <section class="wrap">${rs.length ? `<div class="cards">${rs.map(r => `<article class="pcard"><header>${hexi('doc')}<div><b>${esc(r.local.cliente)}</b><span>${esc(r.local.ambiente)}</span></div></header>
      <dl class="kv sm"><dt>ROI</dt><dd>${r.id}</dd><dt>Série</dt><dd>${esc(r.equip.serie)}</dd><dt>Validado</dt><dd>${esc(r.lei.validadoPor)} · ${fmtD(r.lei.validadoEm)}</dd><dt>Chave</dt><dd class="mono">${esc(r.lei.chave)}</dd></dl>
      <footer><button class="btn lime sm" data-a="pdf" data-id="${r.id}">${svgi('download', 16)} LEI (PDF)</button><a class="btn dark sm" href="#/fotos/${r.id}">${svgi('camera', 16)} Fotos</a><button class="btn ghost sm" data-a="mail" data-id="${r.id}">${svgi('mail', 16)} E-mail</button></footer></article>`).join('')}</div>` : '<p class="empty">Nenhum laudo validado ainda. A Supervisão precisa validar primeiro.</p>'}</section>`;
  sweep(el); reveal('.pcard', el);
  el.onclick = async e => {
    const b = e.target.closest('[data-a]'); if (!b) return;
    const r = rs.find(x => x.id === b.dataset.id);
    if (b.dataset.a === 'pdf') return openPrint(leiHTML(r), r.id + ' LEI');
    if (b.dataset.a === 'mail') {
      const txt = `Assunto: LEI – Retorna Machine – ${r.local.cliente} (${r.local.ambiente}) – Nº série ${r.equip.serie}\n\nPrezados,\n\nSegue em anexo o Laudo de Entrega e Instalação (LEI) do equipamento Retorna Machine, série ${r.equip.serie}, instalado em ${r.local.endereco} em ${fmtD(r.closedAt)}.\n\nPara confirmar o recebimento e a conformidade, pedimos que respondam a este e-mail com o seu aceite. Essa resposta ficará registrada como comprovação de validação.\n\nAtenciosamente,\nAmbipar Pós-Consumo`;
      try { await navigator.clipboard.writeText(txt); toast('Texto do e-mail copiado'); } catch { toast('Não foi possível copiar', 'err'); }
    }
  };
}

/* ------------------------- Usuários ------------------------- */
export async function usuarios(el) {
  const users = await api.get('/api/usuarios');
  const perms = [['Criar/preencher ROI', 'tecnico'], ['Ver todos os laudos', 'gestao adm consulta projetos'], ['Editar e validar LEI', 'gestao'], ['Baixar LEI, fotos e Check-in', 'projetos adm'], ['Gerenciar usuários', 'adm']];
  el.innerHTML = `<section class="band"><div class="wrap"><p class="eyebrow">ADM</p>${heroTitle('Usuários e', 'acessos')}</div></section>
    <section class="wrap"><div class="tw"><table class="tbl"><thead><tr><th>Usuário</th><th>Perfil</th></tr></thead><tbody>${users.map(x => `<tr><td><b>${esc(x.nome)}</b> <small class="mute">${esc(x.id)}</small></td><td>${esc(PERFIS[x.perfil].label)}</td></tr>`).join('')}</tbody></table></div>
    <div class="sec-h"><h2 class="h-lg">Matriz de <span class="hl">permissões</span></h2></div>
    <div class="tw"><table class="tbl mat"><thead><tr><th></th>${Object.keys(PERFIS).map(k => `<th>${k}</th>`).join('')}</tr></thead><tbody>${perms.map(([t, who]) => `<tr><td>${t}</td>${Object.keys(PERFIS).map(k => `<td>${who.split(' ').includes(k) ? svgi('check', 18) : '<span class="mute">—</span>'}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>`;
  sweep(el); reveal('.tbl tbody tr', el);
}
