// Constantes do domínio, cliente da API Flask, fila local (IndexedDB) e sincronização.
// O que ainda não foi enviado ao servidor vive só no aparelho (rascunho + fila); o servidor é a fonte da verdade.

export const PERFIS = {
  tecnico:  { label: 'Operacional · Técnicos', nav: [['#/tecnico', 'Instalações'], ['#/maquinas', 'Máquinas']], routes: ['/tecnico', '/maquinas'] },
  gestao:   { label: 'Gestão · Supervisão Operacional', nav: [['#/painel', 'Visão geral'], ['#/laudos', 'Laudos'], ['#/maquinas', 'Máquinas']], routes: ['/painel', '/laudos', '/lei', '/fotos', '/maquinas'] },
  projetos: { label: 'Projetos · Relatórios de clientes', nav: [['#/painel', 'Visão geral'], ['#/laudos', 'Laudos'], ['#/maquinas', 'Máquinas'], ['#/projetos', 'Laudos disponíveis'], ['#/fotos', 'Fotos']], routes: ['/painel', '/laudos', '/maquinas', '/projetos', '/fotos', '/lei'] },
  adm:      { label: 'ADM', nav: [['#/painel', 'Visão geral'], ['#/laudos', 'Laudos'], ['#/maquinas', 'Máquinas'], ['#/projetos', 'Projetos'], ['#/fotos', 'Fotos'], ['#/usuarios', 'Usuários']], routes: ['/painel', '/laudos', '/lei', '/maquinas', '/projetos', '/fotos', '/usuarios'] },
  consulta: { label: 'Consulta', nav: [['#/painel', 'Visão geral'], ['#/laudos', 'Instalações'], ['#/fotos', 'Fotos']], routes: ['/painel', '/laudos', '/fotos'] },
};
/** Quem exporta relatórios em Excel (Consulta não). */
export const EXPORTA = ['gestao', 'adm', 'projetos'];

export const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI',
  'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];

export const CHECK = [
  { k: 'eletrica', t: 'Instalação Elétrica (Régua/Timer)' },
  { k: 'acesso', t: 'Acessibilidade do Percurso' },
  { k: 'conect', t: 'Conectividade (Sinal de Dados)' },
  { k: 'fixacao', t: 'Fixação e Estabilidade' },
  { k: 'espaco', t: 'Espaço Frontal (mín. 1,10 m p/ porta)' },
  { k: 'limpeza', t: 'Limpeza do Equipamento e Local' },
  { k: 'adesiv', t: 'Integridade da Adesivação (visual)' },
  { k: 'estrut', t: 'Estrutura (sem riscos/amassados)' },
];

export const FOTOS = [
  { k: 'f1', t: 'Vista frontal no galpão', s: 'Pré-instalação: máquina pronta para ir ao cliente' },
  { k: 'f2', t: 'Chegada ao cliente', s: 'Máquina íntegra ao chegar, antes de instalar' },
  { k: 'f3', t: 'Check-in estético · Vista frontal', s: 'Ligada e com APK' },
  { k: 'f4', t: 'Check-in estético · Lateral esquerda', s: '' },
  { k: 'f5', t: 'Check-in estético · Lateral direita', s: '' },
  { k: 'f6', t: 'Vista de contexto / ambiente', s: 'Comprovação do recuo de 1,10 m' },
];
export const FOTO_EXTRA = { k: 'fx', t: 'Canhoto do frete com ressalva manuscrita', s: 'Avaria de transporte' };
/** Fotos de avaria: o canhoto (obrigatório) + até 4 fotos da avaria, adicionadas uma a uma. */
export const AVARIA = [FOTO_EXTRA, ...[2, 3, 4, 5].map(n => ({ k: 'fx' + n, t: 'Foto da avaria', s: 'Detalhe da avaria' }))];
/** Fotos de um ROI na ordem de exibição: as 6 obrigatórias e, se houver avaria, as de avaria que existem. */
export const fotoList = r => [...FOTOS, ...(r.avaria ? AVARIA.filter((f, i) => i === 0 || r.fotos?.[f.k]) : [])];
/** Nº de série de teste que o CMS de demonstração reconhece. */
export const CMS_DEMO = ['RM-2026-0147', 'RM-2026-0152', 'RM-2026-0160', 'RM-2026-0163'];

// Checklist de preparação na base (backend/rules.py: PREP). Concluído sem não conformidades, a máquina fica disponível para instalação.
export const PREP = [
  { k: 'hw', t: 'Instalação de hardware' }, { k: 'sw', t: 'Instalação de software' }, { k: 'seg', t: 'Instalação de módulos de segurança' },
  { k: 'modem', t: 'Configuração de modem' }, { k: 'promo', t: 'Tela/botão promocional', opt: true }, { k: 'adesiv', t: 'Adesivação' },
];
export const PREP_FOTOS = [{ k: 'mf', t: 'Frontal (adesivada e ligada)' }, { k: 'me', t: 'Lateral esquerda' }, { k: 'md', t: 'Lateral direita' }];
export const MSTATUS = { DISPONIVEL: ['Disponível', 'lime'], NAO_CONFORME: ['Não conforme', 'bad'], INSTALADA: ['Instalada', 'dark'] };

export const countNok = r => CHECK.filter(x => r.checklist?.[x.k]?.ok === false).length;
export const uuid = () => crypto.randomUUID?.() ?? ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16));
export const notify = () => window.dispatchEvent(new Event('fenix:data'));
/** Carrega uma biblioteca de vendor/ só quando for usada (Excel e ZIP são grandes). */
const libs = {};
export const lib = (file, global) => libs[file] ??= new Promise((res, rej) => {
  if (window[global]) return res(window[global]);
  const s = document.createElement('script'); s.src = 'vendor/' + file;
  s.onload = () => res(window[global]); s.onerror = () => { delete libs[file]; rej(new Error('Não foi possível carregar ' + file)); };
  document.head.appendChild(s);
});

/* ---------- Cliente da API ---------- */
// Sem backend (GitHub Pages ou ?demo): a API é atendida no próprio navegador por js/demo.js, com dados de exemplo.
export const LOCAL = /\.github\.io$/i.test(location.hostname) || new URLSearchParams(location.search).has('demo');
const local = LOCAL ? import('./demo.js') : null;
export class ApiErr extends Error { constructor(m, status) { super(m); this.status = status; } }
async function req(path, opt = {}) {
  let r;
  try { r = local ? await (await local).handle(path, opt) : await fetch(path, { credentials: 'same-origin', ...opt }); }
  catch { net.serverUp = false; throw new ApiErr('Sem conexão com o servidor', 0); }
  net.serverUp = true;
  let j = null; try { j = await r.json(); } catch { /* corpo não-JSON */ }
  if (r.status === 401 && !path.startsWith('/api/login')) window.dispatchEvent(new Event('fenix:unauth'));
  if (!r.ok) throw new ApiErr(j?.error || `Erro ${r.status}`, r.status);
  return j;
}
const json = (method, p, b) => req(p, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b ?? {}) });
export const api = {
  get: p => req(p), post: (p, b) => json('POST', p, b), put: (p, b) => json('PUT', p, b),
  form: (p, fd) => req(p, { method: 'POST', body: fd }),
};

/* ---------- Estado de rede: aparelho + servidor alcançável (+ simulação para demo) ---------- */
export const net = {
  forced: false, serverUp: null,
  get online() { return navigator.onLine && !this.forced && this.serverUp !== false; },
};
export async function pingServer() {
  const was = net.online;
  if (LOCAL) net.serverUp = true;
  else try { const c = new AbortController(); const t = setTimeout(() => c.abort(), 3000); const r = await fetch('/api/health', { cache: 'no-store', signal: c.signal }); clearTimeout(t); net.serverUp = r.ok; }
  catch { net.serverUp = false; }
  if (was !== net.online) window.dispatchEvent(new Event('fenix:net'));
  return net.online;
}

/* ---------- IndexedDB: rascunho e fila de envio ---------- */
const open = () => new Promise((res, rej) => {
  const r = indexedDB.open('fenix', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('roi', { keyPath: 'id' });
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});
const tx = async (mode, fn) => {
  const d = await open();
  return new Promise((res, rej) => {
    const t = d.transaction('roi', mode);
    const req = fn(t.objectStore('roi'));
    t.oncomplete = () => { d.close(); res(req.result); };
    t.onerror = () => rej(t.error);
  });
};
export const db = {
  all: () => tx('readonly', s => s.getAll()),
  get: id => tx('readonly', s => s.get(id)),
  put: r => tx('readwrite', s => s.put(r)),
  del: id => tx('readwrite', s => s.delete(id)),
  clear: () => tx('readwrite', s => s.clear()),
};

/* ---------- Sincronização: fila local → POST /api/roi ---------- */
const dataUrlToBlob = u => {
  const [h, b] = u.split(','); const bin = atob(b); const a = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
  return new Blob([a], { type: h.match(/:(.*?);/)[1] });
};
let syncing = false;
/** Envia os ROIs pendentes. Retorna { n, errors[] }. Idempotente: reenviar após queda não duplica (clientId). */
export async function syncAll(onStage) {
  if (syncing) return { n: 0, errors: [] };
  syncing = true;
  const out = { n: 0, errors: [] };
  try {
    const pend = (await db.all()).filter(r => !r.draft && r.sync === 'pendente' && !r.syncError);
    for (const r of pend) {
      onStage?.('dados', r);
      const fd = new FormData();
      const fotos = {};
      for (const [k, p] of Object.entries(r.fotos || {})) {
        fotos[k] = { ts: p.ts, lat: p.lat, lng: p.lng, origem: p.origem || 'camera' };
        fd.append(`mark_${k}`, dataUrlToBlob(p.mark), `${k}.jpg`);
        if (p.orig) fd.append(`orig_${k}`, p.orig, p.orig.name || `${k}.jpg`);
      }
      if (r.kind === 'prep') {
        fd.append('data', JSON.stringify({ clientId: r.id, serie: r.serie, pin: r.pin, uf: r.uf, itens: r.itens, fotos }));
        onStage?.('fotos', r);
        try { await api.form('/api/maquinas/prep', fd); r.sync = 'sincronizado'; r.syncedAt = Date.now(); for (const p of Object.values(r.fotos || {})) delete p.orig; await db.put(r); out.n++; }
        catch (e) { if (e.status === 0 || e.status === 401 || e.status >= 500) throw e; r.syncError = e.message; await db.put(r); out.errors.push(`${r.serie}: ${e.message}`); }
        continue;
      }
      if (r.aceite?.assinatura) fd.append('assinatura', dataUrlToBlob(r.aceite.assinatura), 'assinatura.png');
      fd.append('data', JSON.stringify({ clientId: r.id, iniciadoEm: r.iniciadoEm, closedAt: r.closedAt, local: r.local, equip: r.equip, checklist: r.checklist,
        avaria: r.avaria, obs: r.obs, aceite: { nome: r.aceite?.nome, doc: r.aceite?.doc }, fotos, grupo: r.grupo || null, maquina: r.maquina || null }));
      onStage?.('fotos', r);
      try {
        const res = await api.form('/api/roi', fd);
        onStage?.('lei', r);
        r.sync = 'sincronizado'; r.codigo = res.id; r.syncedAt = Date.now();
        for (const p of Object.values(r.fotos || {})) delete p.orig;   // original já está no servidor/Drive: libera espaço no aparelho
        await db.put(r); out.n++;
      } catch (e) {
        if (e.status === 0 || e.status === 401 || e.status >= 500) throw e;   // problema de rede/sessão: tenta de novo depois
        r.syncError = e.message; await db.put(r); out.errors.push(`${r.local?.cliente}: ${e.message}`);   // recusado pelo servidor
      }
    }
  } finally { syncing = false; notify(); }
  return out;
}
