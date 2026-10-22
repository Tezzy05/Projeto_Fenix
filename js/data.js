// Constantes do domínio, cliente da API Flask, fila local (IndexedDB) e sincronização.
// O que ainda não foi enviado ao servidor vive só no aparelho (rascunho + fila); o servidor é a fonte da verdade.

export const PERFIS = {
  tecnico:  { label: 'Operacional · Técnicos', nav: [['#/tecnico', 'Instalações']], routes: ['/tecnico'] },
  gestao:   { label: 'Gestão · Supervisão Operacional', nav: [['#/painel', 'Visão geral'], ['#/laudos', 'Laudos']], routes: ['/painel', '/laudos', '/lei', '/fotos'] },
  projetos: { label: 'Projetos · Relatórios de clientes', nav: [['#/painel', 'Visão geral'], ['#/projetos', 'Laudos disponíveis']], routes: ['/painel', '/projetos', '/fotos', '/lei'] },
  adm:      { label: 'ADM', nav: [['#/painel', 'Visão geral'], ['#/laudos', 'Laudos'], ['#/projetos', 'Projetos'], ['#/usuarios', 'Usuários']], routes: ['/painel', '/laudos', '/lei', '/projetos', '/fotos', '/usuarios'] },
  consulta: { label: 'Consulta', nav: [['#/painel', 'Visão geral'], ['#/laudos', 'Laudos']], routes: ['/painel', '/laudos', '/lei', '/fotos'] },
};

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
  { k: 'f1', t: 'Vista frontal no galpão', s: 'Pré-embalagem / embarque na base' },
  { k: 'f2', t: 'Equipamento embarcado / protegido', s: 'Validação logística' },
  { k: 'f3', t: 'Check-in estético · Vista frontal', s: 'Ligada e com APK' },
  { k: 'f4', t: 'Check-in estético · Lateral esquerda', s: '' },
  { k: 'f5', t: 'Check-in estético · Lateral direita', s: '' },
  { k: 'f6', t: 'Vista de contexto / ambiente', s: 'Comprovação do recuo de 1,10 m' },
];
export const FOTO_EXTRA = { k: 'fx', t: 'Canhoto do frete com ressalva manuscrita', s: 'Avaria de transporte' };

export const countNok = r => CHECK.filter(x => r.checklist?.[x.k]?.ok === false).length;
export const uuid = () => crypto.randomUUID?.() ?? ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c => (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16));
export const notify = () => window.dispatchEvent(new Event('fenix:data'));

/* ---------- Cliente da API ---------- */
export class ApiErr extends Error { constructor(m, status) { super(m); this.status = status; } }
async function req(path, opt = {}) {
  let r;
  try { r = await fetch(path, { credentials: 'same-origin', ...opt }); }
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
  try { const c = new AbortController(); const t = setTimeout(() => c.abort(), 3000); const r = await fetch('/api/health', { cache: 'no-store', signal: c.signal }); clearTimeout(t); net.serverUp = r.ok; }
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
        fotos[k] = { ts: p.ts, lat: p.lat, lng: p.lng };
        fd.append(`mark_${k}`, dataUrlToBlob(p.mark), `${k}.jpg`);
        if (p.orig) fd.append(`orig_${k}`, p.orig, p.orig.name || `${k}.jpg`);
      }
      if (r.aceite?.assinatura) fd.append('assinatura', dataUrlToBlob(r.aceite.assinatura), 'assinatura.png');
      fd.append('data', JSON.stringify({ clientId: r.id, iniciadoEm: r.iniciadoEm, closedAt: r.closedAt, local: r.local, equip: r.equip, checklist: r.checklist,
        avaria: r.avaria, obs: r.obs, aceite: { nome: r.aceite?.nome, doc: r.aceite?.doc }, fotos }));
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
