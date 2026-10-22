// Geração dos documentos: LEI (cliente), ROI (interno) e Check-in Fotográfico (slides).
import { CHECK, FOTOS, FOTO_EXTRA } from './data.js';
import { esc, fmtD, fmtDT, wordmark } from './ui.js';

const cb = on => `<i class="cb ${on ? 'on' : ''}"></i>`;

export function leiHTML(r) {
  const L = r.lei, e = r.equip, l = r.local;
  const row = (i, bad) => `<div class="lrow"><div><b>${esc(i.t)}:</b>
      <span class="mk">${cb(i.ok)} CONFORME</span><span class="mk">${cb(!i.ok)} ${bad}</span></div>
      <div class="ld">(${esc(i.d)})</div></div>`;
  const termo = esc(L.termo).replaceAll('[Nº Série]', `<b>${esc(e.serie)}</b>`);
  return `<article class="paper">
    <header class="ph">${wordmark()}<div><h1>Laudo de Entrega e Instalação (LEI)</h1><p>Retorna Machine · ${esc(r.id)}</p></div></header>
    <h3><span class="n">1</span> Identificação do Projeto</h3>
    <dl class="kv">
      <dt>Cliente</dt><dd>${esc(l.cliente)}</dd><dt>Ambiente</dt><dd>${esc(l.ambiente)}</dd>
      <dt>Localização do equipamento</dt><dd>${esc(l.localizacao)}</dd><dt>Data de conclusão</dt><dd>${fmtD(r.closedAt)}</dd>
      <dt>Endereço</dt><dd>${esc(l.endereco)}</dd><dt>Técnico responsável</dt><dd>${esc(r.tecnico)}</dd>
      <dt>Responsável pelo recebimento</dt><dd>${esc(r.aceite?.nome)}</dd>
    </dl>
    <h3><span class="n">2</span> Especificações do Equipamento</h3>
    <dl class="kv"><dt>Equipamento</dt><dd>Retorna Machine</dd><dt>Nº de Série</dt><dd>${esc(e.serie)}</dd></dl>
    <h3><span class="n">3</span> Checklist de Conformidade Técnica</h3>
    ${L.tec.map(i => row(i, 'NÃO CONFORME')).join('')}
    <h3><span class="n">4</span> Integridade Estética e Visual</h3>
    ${L.est.map(i => row(i, 'AVARIADO')).join('')}
    <h3><span class="n">5</span> Observações</h3>
    <p class="obs">${esc(L.obs).replace(/\n/g, '<br>')}</p>
    <h3>Validação e Termo de Aceite</h3>
    <p class="termo">“${termo}”</p>
    <div class="sigs">
      <div><div class="sline">${L.validadoPor ? `<span class="signed">${esc(L.validadoPor)}</span>` : ''}</div>
        <b>Ambipar Pós-Consumo</b><span>Supervisão Operacional${L.validadoPor ? ` · ${esc(L.validadoPor)}` : ''}</span>
        ${L.chave ? `<small>Chave de autenticação: ${esc(L.chave)}<br>Validado em ${fmtDT(L.validadoEm)}</small>` : '<small class="pend">Aguardando validação da Supervisão</small>'}</div>
      <div><div class="sline"></div><b>Cliente</b><span>Validação cliente</span><small>(Assinatura ou confirmação por e-mail)</small></div>
    </div>
  </article>`;
}

export function roiHTML(r) {
  const e = r.equip, l = r.local, m = e.modem || {}, c = e.chip || {};
  const photos = [...FOTOS, ...(r.avaria ? [FOTO_EXTRA] : [])].filter(f => r.fotos?.[f.k]?.mark);
  return `<article class="paper roi">
    <header class="ph">${wordmark()}<div><h1>Relatório Operacional de Instalação (ROI)</h1><p>Documento interno · ${esc(r.codigo || (r.sync === 'pendente' ? 'pendente de sincronização' : r.id))}</p></div></header>
    <h3><span class="n">1</span> Identificação do local e responsáveis</h3>
    <dl class="kv"><dt>Data/Hora</dt><dd>${fmtDT(r.closedAt)}</dd><dt>Cliente</dt><dd>${esc(l.cliente)}</dd><dt>Ambiente</dt><dd>${esc(l.ambiente)}</dd>
    <dt>Endereço</dt><dd>${esc(l.endereco)}</dd><dt>Localização</dt><dd>${esc(l.localizacao)}</dd><dt>Técnico</dt><dd>${esc(r.tecnico)}</dd></dl>
    <h3><span class="n">2</span> Equipamento e conectividade</h3>
    <dl class="kv"><dt>Nº de Série</dt><dd>${esc(e.serie)}</dd><dt>PIN</dt><dd>${esc(e.pin)}</dd><dt>APK versão</dt><dd>${esc(e.apk)}</dd>
    <dt>Modem</dt><dd>${esc(m.op)} · ${esc(m.modelo)} · IMEI ${esc(m.imei)} · N/S ${esc(m.ns)}</dd>
    <dt>Chip</dt><dd>${esc(c.op)} · ${esc(c.linha)} · ICCID ${esc(c.iccid)}</dd></dl>
    <h3><span class="n">3</span> Checklist de conformidade</h3>
    <table class="tbl small"><tbody>${CHECK.map(x => { const v = r.checklist[x.k] || {}; return `<tr><td>${esc(x.t)}</td><td><b class="${v.ok ? 'okc' : 'nokc'}">${v.ok ? 'OK' : 'NOK'}</b></td><td>${esc(v.obs || '')}</td></tr>`; }).join('')}</tbody></table>
    <h3><span class="n">4</span> Registro fotográfico</h3>
    ${photos.length ? `<div class="pgrid">${photos.map(f => { const p = r.fotos[f.k]; return `<figure><img src="${p.mark}" alt=""><figcaption>${esc(f.t)}</figcaption></figure>`; }).join('')}</div>` : '<p class="obs">Fotos armazenadas em alta resolução no Drive (não anexadas neste exemplo).</p>'}
    <h3><span class="n">5</span> Observações e pendências</h3><p class="obs">${esc(r.obs || 'Sem observações.')}</p>
    <h3>Validação e aceite de entrega (cliente)</h3>
    <dl class="kv"><dt>Responsável</dt><dd>${esc(r.aceite?.nome)}</dd><dt>Documento</dt><dd>${esc(r.aceite?.doc)}</dd></dl>
    ${r.aceite?.assinatura ? `<img class="sigimg" src="${esc(r.aceite.assinatura)}" alt="Assinatura do cliente">` : ''}
    <small class="pend">Encerrado em ${fmtDT(r.closedAt)}</small>
  </article>`;
}

/** Check-in Fotográfico: capa → dados do local → grade de fotos → institucional */
export function slidesHTML(rs) {
  const rows = Array.isArray(rs) ? rs : [rs];
  const cliente = rows[0].local.cliente;
  const tile = (r, f) => { const p = r.fotos?.[f.k]; return p?.mark ? `<figure><img src="${p.mark}" alt=""><figcaption>${esc(f.t)}</figcaption></figure>` : `<figure class="ph-img"><span>Foto de exemplo</span><figcaption>${esc(f.t)}</figcaption></figure>`; };
  const slides = [`<section class="slide cover"><div>${wordmark()}</div><h2>Check-in Fotográfico</h2><p>${esc(cliente)} · Retorna Machine</p><small>Início da implantação do contrato</small></section>`];
  for (const r of rows) {
    slides.push(`<section class="slide"><h4>${esc(r.local.ambiente)}</h4><dl class="kv big"><dt>Endereço</dt><dd>${esc(r.local.endereco)}</dd><dt>Data de entrega</dt><dd>${fmtD(r.closedAt)}</dd><dt>Data de instalação</dt><dd>${fmtD(r.closedAt)}</dd><dt>Equipamento</dt><dd>1 × Retorna Machine · série ${esc(r.equip.serie)}</dd></dl></section>`);
    slides.push(`<section class="slide"><h4>${esc(r.local.ambiente)}</h4><div class="sgrid">${['f3', 'f4', 'f5'].map(k => tile(r, FOTOS.find(f => f.k === k))).join('')}</div></section>`);
  }
  slides.push(`<section class="slide cover end"><div>${wordmark()}</div><h2>Ambipar. A líder em gestão ambiental.</h2></section>`);
  return `<div class="slides">${slides.join('')}</div>`;
}

/** Imprime/“Salvar como PDF” usando o mesmo CSS do app */
export function openPrint(html, title) {
  const f = document.createElement('iframe');
  f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  f.srcdoc = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(title)}</title>
    <link rel="stylesheet" href="${new URL('css/style.css', document.baseURI).href}"></head><body class="printing">${html}</body></html>`;
  f.onload = () => { setTimeout(() => { f.contentWindow.focus(); f.contentWindow.print(); setTimeout(() => f.remove(), 2000); }, 300); };
  document.body.appendChild(f);
}
