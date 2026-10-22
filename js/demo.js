// Servidor de demonstração no navegador: responde às mesmas rotas /api/* do Flask (backend/app.py) quando o app roda
// sem backend (GitHub Pages ou ?demo). Regras portadas de backend/rules.py, services.py e seed.py.
// Dados e fotos ficam no IndexedDB deste navegador; POST /api/demo/reset volta aos laudos de exemplo.

const DEMO_PASSWORD = 'fenix123';
const USERS = [
  ['tec1', 'Técnico Demo', 'tecnico'], ['pat', 'Patrícia', 'gestao'], ['her', 'Herval', 'gestao'], ['rod', 'Rodrigo', 'gestao'],
  ['tha', 'Thais', 'projetos'], ['ana', 'Ana', 'projetos'], ['and', 'Anderson', 'adm'], ['cur', 'Cury', 'adm'],
  ['duf', 'Duarte', 'adm'], ['bia', 'Bianca', 'consulta'], ['car', 'Carlos (Téc.)', 'tecnico'], ['mar', 'Marcos (Téc.)', 'tecnico'],
].map(([id, nome, perfil]) => ({ id, nome, perfil, ativo: 1 }));

const CHECK = [
  ['eletrica', 'Instalação Elétrica (Régua/Timer)'], ['acesso', 'Acessibilidade do Percurso'], ['conect', 'Conectividade (Sinal de Dados)'],
  ['fixacao', 'Fixação e Estabilidade'], ['espaco', 'Espaço Frontal (mín. 1,10 m p/ porta)'], ['limpeza', 'Limpeza do Equipamento e Local'],
  ['adesiv', 'Integridade da Adesivação (visual)'], ['estrut', 'Estrutura (sem riscos/amassados)'],
];
const CHECK_KEYS = CHECK.map(([k]) => k);
const FOTO_SLOTS = ['f1', 'f2', 'f3', 'f4', 'f5', 'f6'], FOTO_EXTRA = 'fx', ALL_SLOTS = [...FOTO_SLOTS, FOTO_EXTRA];
const AGUARDANDO = 'AGUARDANDO_VALIDACAO', DISPONIVEL = 'DISPONIVEL_PROJETOS';
const TERMO_PADRAO = 'Este documento atesta a conformidade da instalação e da integridade da comunicação visual conforme o escopo do projeto. '
  + 'Ao validar este laudo, o cliente declara que o equipamento de série [Nº Série] foi entregue em perfeitas condições de uso, '
  + 'com a adesivação íntegra e de acordo com as especificações contratadas.';

const CMS = {
  'RM-2026-0147': { pin: '482913', apk: '3.8.2', modem: { op: 'Vivo', modelo: 'Quectel EC25', imei: '867530041226781', ns: 'MD-77120' },
    chip: { op: 'Vivo', linha: '(11) 91234-5678', iccid: '8955101234567890123' } },
  'RM-2026-0152': { pin: '551207', apk: '3.8.2', modem: { op: 'Claro', modelo: 'Teltonika RUT241', imei: '352093081452237', ns: 'MD-77188' },
    chip: { op: 'Claro', linha: '(11) 98765-4321', iccid: '8955201234567890456' } },
};

class ApiError extends Error { constructor(msg, status = 400) { super(msg); this.status = status; } }
class Reply { constructor(body, status) { this.body = body; this.status = status; } }   // resposta com status ≠ 200

/* ---------------- Regras (backend/rules.py) ---------------- */
function buildLei(cl, avaria, obs) {
  const ok = k => cl[k]?.ok === true;
  const fmt = rows => rows.map(([t, d, o]) => ({ t, d, ok: o }));
  const tec = [
    ['Montagem física', 'Instalado conforme projeto, nivelado e fixado.', ok('fixacao')],
    ['Espaço operacional', 'Confirmado recuo frontal mínimo de 1,10 m para abertura total da porta e manutenção.', ok('espaco')],
    ['Componentes adicionais', 'Régua de energia, modem, timer e acessórios instalados e validados.', ok('eletrica')],
    ['Conectividade', 'Sistema de comunicação chip/modem testado e ativo.', ok('conect')],
    ['Status de entrega', 'Equipamento configurado, ligado e em operação.', ok('eletrica') && ok('conect') && ok('acesso')],
  ];
  const est = [
    ['Adesivação', 'Sem bolhas, riscos, rasgos ou descolamentos.', ok('adesiv')],
    ['Estrutura externa', 'Sem avarias, amassados ou danos decorrentes do transporte/manuseio.', ok('estrut')],
  ];
  const notas = CHECK.filter(([k]) => cl[k]?.ok === false).map(([k, nome]) => `${nome}: ${cl[k].obs || ''}`);
  if (avaria) notas.push('Avaria de transporte registrada (canhoto do frete com ressalva anexado).');
  if (obs && obs.trim()) notas.push(obs.trim());
  return { tec: fmt(tec), est: fmt(est), obs: notas.join('\n') || 'Sem ressalvas.', termo: TERMO_PADRAO };
}

function validatePayload(d) {
  const txt = (...path) => { const v = path.reduce((a, p) => (a && typeof a === 'object' ? a[p] : undefined), d); return v == null ? '' : String(v).trim(); };
  for (const [path, nome] of [[['local', 'cliente'], 'cliente'], [['local', 'ambiente'], 'ambiente'], [['local', 'endereco'], 'endereço'],
    [['local', 'localizacao'], 'localização'], [['equip', 'serie'], 'nº de série'], [['equip', 'pin'], 'PIN'], [['equip', 'apk'], 'APK'],
    [['equip', 'modem', 'op'], 'operadora do modem'], [['equip', 'chip', 'op'], 'operadora do chip'],
    [['aceite', 'nome'], 'nome do responsável'], [['aceite', 'doc'], 'documento do responsável']]) {
    if (!txt(...path)) return `Campo obrigatório ausente: ${nome}`;
  }
  const cl = d.checklist || {};
  for (const [k, nome] of CHECK) {
    const v = cl[k];
    if (!v || typeof v.ok !== 'boolean') return `Checklist sem resposta: ${nome}`;
    if (v.ok === false && !String(v.obs || '').trim()) return `Observação obrigatória (não conforme): ${nome}`;
  }
  if (typeof d.closedAt !== 'number') return 'closedAt ausente';
  return null;
}

async function sniff(blob) {
  const b = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  const s = (i, j) => String.fromCharCode(...b.slice(i, j));
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpg';
  if (b[0] === 0x89 && s(1, 4) === 'PNG') return 'png';
  if (s(0, 4) === 'RIFF' && s(8, 12) === 'WEBP') return 'webp';
  if (s(4, 8) === 'ftyp' && ['heic', 'heix', 'mif1', 'msf1', 'heim'].includes(s(8, 12))) return 'heic';
  return null;
}

/* ---------------- Armazenamento: estado (JSON) + arquivos (Blob) no IndexedDB ---------------- */
const idb = () => new Promise((res, rej) => {
  const r = indexedDB.open('fenix-demo', 1);
  r.onupgradeneeded = () => { r.result.createObjectStore('state'); r.result.createObjectStore('files'); };
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});
async function tx(store, mode, fn) {
  const d = await idb();
  return new Promise((res, rej) => {
    const t = d.transaction(store, mode);
    const q = fn(t.objectStore(store));
    t.oncomplete = () => { d.close(); res(q?.result); };
    t.onerror = () => rej(t.error);
  });
}
const files = {
  get: k => tx('files', 'readonly', s => s.get(k)),
  put: (k, b) => tx('files', 'readwrite', s => s.put(b, k)),
  clear: () => tx('files', 'readwrite', s => s.clear()),
};

let S = null;   // { users, inst: [...] }
async function state() {
  if (!S) S = await tx('state', 'readonly', s => s.get('db'));
  if (!S) { S = seed(); await persist(); }
  return S;
}
const persist = () => tx('state', 'readwrite', s => s.put(S, 'db'));

/* ---------------- Laudos de exemplo (backend/seed.py) ---------------- */
function seed() {
  const H = 3600e3, now = Date.now(), y = new Date().getFullYear();
  const p = (n, w) => String(n).padStart(w, '0');
  const inst = [];
  const add = (n, tecId, tecNome, cliente, ambiente, endereco, localizacao, ago, { over = {}, avaria = false, obs = '', validado } = {}) => {
    const cl = Object.fromEntries(CHECK_KEYS.map(k => [k, { ok: true, obs: '' }]));
    Object.assign(cl, over);
    const closed = Math.round(now - ago * H);
    const lei = { status: AGUARDANDO, ...buildLei(cl, avaria, obs), validadoPor: null, validadoEm: null, chave: null };
    if (validado) Object.assign(lei, { status: DISPONIVEL, validadoPor: validado[1], validadoEm: Math.round(now - validado[2] * H), chave: `FNX-${p(n, 4)}-A9F2-C7D1-B3E4` });
    inst.push({
      id: `ROI-${y}-${p(n, 4)}`, clientId: `seed-${n}`, tecnico: tecNome, tecnicoId: tecId,
      iniciadoEm: closed - 2400000, closedAt: closed, syncedAt: closed + 60000,
      local: { cliente, ambiente, endereco, localizacao },
      equip: { serie: `RM-${y}-${p(n, 4)}`, pin: `4${p(n * 7919 % 100000, 5)}`, apk: '3.8.2',
        modem: { op: 'Vivo', modelo: 'Quectel EC25', imei: `86753004${p(n * 10007 % 1e7, 7)}`, ns: `MD-${70000 + n}` },
        chip: { op: 'Vivo', linha: `(11) 9${p(n * 30011 % 10000, 4)}-0000`, iccid: `895510${p(n * 99991 % 1e13, 13)}` } },
      checklist: cl, avaria, obs, aceite: { nome: `Responsável ${cliente.split(' ')[0]}`, doc: '000.000.000-00' },
      sig: null, fotos: {}, lei,
    });
  };
  add(131, 'mar', 'Marcos (Téc.)', 'Drogaria Central', 'Matriz', 'Av. Brasil, 4500 — Campinas/SP', 'Entrada principal', 52, { validado: ['her', 'Herval', 48] });
  add(135, 'car', 'Carlos (Téc.)', 'Supermercado Bom Preço', 'Loja 12 · Hall', 'Rua das Acácias, 250 — Osasco/SP', 'Ao lado da saída', 30, { validado: ['pat', 'Patrícia', 26] });
  add(138, 'car', 'Carlos (Téc.)', 'IMMU', 'Sede · Recepção', 'Av. Paulista, 1000 — Bela Vista, São Paulo/SP', 'Próximo aos caixas', 3);
  add(139, 'mar', 'Marcos (Téc.)', 'IMMU', 'Terminal 1', 'Terminal Rodoviário Tietê, Plataforma 3 — São Paulo/SP', 'Entrada principal', 6, {
    over: { estrut: { ok: false, obs: 'Amassado na lateral direita, próximo à base.' }, adesiv: { ok: false, obs: 'Descolamento parcial da adesivação (frete).' } },
    avaria: true, obs: 'Necessária readesivação parcial.' });
  return { users: USERS, inst };
}

/* ---------------- Serialização (services.roi_json): arquivos viram blob: URLs ---------------- */
const urls = new Map();
async function fileUrl(key) {
  if (!key) return null;
  if (!urls.has(key)) { const b = await files.get(key); if (!b) return null; urls.set(key, URL.createObjectURL(b)); }
  return urls.get(key);
}
async function roiJson(r, photos = true) {
  const { clientId, sig, fotos, ...out } = structuredClone(r);
  Object.assign(out, { sync: 'sincronizado', drive: { status: 'desativado', pasta: null } });
  out.aceite.assinatura = await fileUrl(sig);
  if (photos) {
    out.fotos = {};
    for (const [slot, f] of Object.entries(fotos)) out.fotos[slot] = { ts: f.ts, lat: f.lat, lng: f.lng, mark: await fileUrl(f.mark), origUrl: await fileUrl(f.orig) };
  }
  return out;
}

/* ---------------- Sessão ---------------- */
const SESSION = 'fenix.demo.uid';
const sess = { get: () => { try { return localStorage.getItem(SESSION); } catch { return null; } }, set: v => { try { v ? localStorage.setItem(SESSION, v) : localStorage.removeItem(SESSION); } catch { } } };
const pub = u => ({ id: u.id, nome: u.nome, perfil: u.perfil });
async function current() { const id = sess.get(); return id ? (await state()).users.find(u => u.id === id && u.ativo) || null : null; }
async function auth(...perfis) {
  const u = await current();
  if (!u) throw new ApiError('Não autenticado', 401);
  if (perfis.length && !perfis.includes(u.perfil)) throw new ApiError('Sem permissão para este perfil', 403);
  return u;
}
async function roiOr404(cod, u) {
  const r = (await state()).inst.find(x => x.id === cod);
  if (!r || (u.perfil === 'tecnico' && r.tecnicoId !== u.id) || (u.perfil === 'projetos' && r.lei.status !== DISPONIVEL)) throw new ApiError('Não encontrado', 404);
  return r;
}

/* ---------------- Casos de uso ---------------- */
async function createInstallation(u, fd) {
  let data;
  try { data = JSON.parse(fd.get('data') || ''); } catch { throw new ApiError("JSON inválido em 'data'"); }
  const st = await state();
  const cid = String(data.clientId || '').slice(0, 64) || null;
  const dup = cid && st.inst.find(r => r.clientId === cid);
  if (dup) return [dup, true];                                     // idempotente: reenvio após queda não duplica
  const err = validatePayload(data);
  if (err) throw new ApiError(err, 422);
  const avaria = !!data.avaria;
  const photos = {};
  for (const slot of ALL_SLOTS) {
    const m = fd.get(`mark_${slot}`), o = fd.get(`orig_${slot}`);
    if (!m) continue;
    if (!['jpg', 'png', 'webp'].includes(await sniff(m))) throw new ApiError(`Imagem inválida: ${slot}`, 415);
    if (o && !(await sniff(o))) throw new ApiError(`Original inválido: ${slot}`, 415);
    photos[slot] = { m, o, meta: data.fotos?.[slot] || {} };
  }
  for (const slot of [...FOTO_SLOTS, ...(avaria ? [FOTO_EXTRA] : [])]) if (!photos[slot]) throw new ApiError(`Foto obrigatória ausente: ${slot}`, 422);
  const sig = fd.get('assinatura');
  if (!sig || await sniff(sig) !== 'png') throw new ApiError('Assinatura do responsável ausente ou inválida', 422);

  const y = new Date().getFullYear();
  const n = Math.max(0, ...st.inst.filter(r => r.id.startsWith(`ROI-${y}-`)).map(r => +r.id.slice(-4)));
  const codigo = `ROI-${y}-${String(n + 1).padStart(4, '0')}`;
  const base = `roi/${codigo}`;
  await files.put(`${base}/assinatura.png`, sig);
  const fotos = {};
  for (const [slot, p] of Object.entries(photos)) {
    const orig = p.o ? `${base}/${slot}_orig.${await sniff(p.o)}` : null;
    if (orig) await files.put(orig, p.o);
    await files.put(`${base}/${slot}_marca.jpg`, p.m);
    fotos[slot] = { mark: `${base}/${slot}_marca.jpg`, orig, ts: p.meta.ts ?? null, lat: p.meta.lat ?? null, lng: p.meta.lng ?? null };
  }
  const t = s => String(s ?? '').trim();
  const { local: L, equip: E, aceite: A } = data, mo = E.modem || {}, ch = E.chip || {};
  const cl = Object.fromEntries(CHECK_KEYS.map(k => [k, { ok: !!data.checklist[k].ok, obs: String(data.checklist[k].obs || '').slice(0, 2000) }]));
  const obs = String(data.obs || '').slice(0, 5000);
  const r = {
    id: codigo, clientId: cid, tecnico: u.nome, tecnicoId: u.id, iniciadoEm: data.iniciadoEm ?? null, closedAt: Math.trunc(data.closedAt), syncedAt: Date.now(),
    local: { cliente: t(L.cliente), ambiente: t(L.ambiente), endereco: t(L.endereco), localizacao: t(L.localizacao) },
    equip: { serie: t(E.serie), pin: E.pin || '', apk: E.apk || '', modem: { op: mo.op || '', modelo: mo.modelo || '', imei: mo.imei || '', ns: mo.ns || '' },
      chip: { op: ch.op || '', linha: ch.linha || '', iccid: ch.iccid || '' } },
    checklist: cl, avaria, obs, aceite: { nome: t(A.nome), doc: t(A.doc) }, sig: `${base}/assinatura.png`, fotos,
    lei: { status: AGUARDANDO, ...buildLei(cl, avaria, data.obs || ''), validadoPor: null, validadoEm: null, chave: null },
  };
  st.inst.push(r);
  await persist();
  return [r, false];
}

async function validarLei(r, u) {
  const ts = Date.now(), l = r.lei;
  const conteudo = JSON.stringify([l.tec, l.est, l.obs, l.termo, r.id, u.id, ts]);
  let h;
  try { h = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(conteudo)))].map(b => b.toString(16).padStart(2, '0')).join(''); }
  catch { h = [...crypto.getRandomValues(new Uint8Array(8))].map(b => b.toString(16).padStart(2, '0')).join(''); }   // sem crypto.subtle (http)
  h = h.slice(0, 16).toUpperCase();
  Object.assign(l, { status: DISPONIVEL, validadoPor: u.nome, validadoEm: ts, chave: 'FNX-' + h.match(/.{4}/g).join('-') });
  await persist();
}

/* ---------------- Rotas ---------------- */
async function route(method, path, body) {
  const seg = path.replace(/^\/api\//, '').split('/').map(decodeURIComponent);
  const M = `${method} ${seg[0]}`;
  if (M === 'GET health') return { ok: true, ts: Date.now(), demo: true, drive: false };
  if (M === 'GET login-options') return { demo: true, local: true, senha: DEMO_PASSWORD, users: (await state()).users.filter(u => u.ativo).map(pub) };
  if (M === 'POST login') {
    const d = body || {}, id = String(d.id ?? '').trim(), u = (await state()).users.find(x => x.id === id && x.ativo);
    if (!u || String(d.senha ?? '') !== DEMO_PASSWORD) throw new ApiError('Usuário ou senha inválidos', 401);
    sess.set(u.id);
    return pub(u);
  }
  if (M === 'POST logout') { sess.set(null); return { ok: true }; }
  if (M === 'POST demo' && seg[1] === 'reset') {
    S = seed(); await persist(); await files.clear();
    urls.forEach(u => URL.revokeObjectURL(u)); urls.clear(); sess.set(null);
    return { ok: true };
  }
  if (M === 'GET me') return pub(await auth());
  if (M === 'GET usuarios') { await auth('adm'); return (await state()).users.map(({ id, nome, perfil, ativo }) => ({ id, nome, perfil, ativo })); }
  if (M === 'GET cms') {
    await auth('tecnico', 'adm');
    const c = CMS[(seg[1] || '').slice(0, 40).trim().toUpperCase()];
    if (!c) throw new ApiError('Nº de série não encontrado no CMS', 404);
    return structuredClone(c);
  }
  if (M === 'POST admin' && seg[1] === 'drive') { await auth('adm'); throw new ApiError('Google Drive não configurado', 409); }
  if (seg[0] === 'roi') {
    if (method === 'GET' && seg.length === 1) {
      const u = await auth();
      const rows = (await state()).inst.filter(r => u.perfil === 'tecnico' ? r.tecnicoId === u.id : u.perfil === 'projetos' ? r.lei.status === DISPONIVEL : true)
        .sort((a, b) => b.closedAt - a.closedAt).slice(0, 500);
      return Promise.all(rows.map(r => roiJson(r, false)));
    }
    if (method === 'POST' && seg.length === 1) {
      const u = await auth('tecnico');
      const [r, dup] = await createInstallation(u, body);
      return new Reply(await roiJson(r), dup ? 200 : 201);
    }
    if (method === 'GET' && seg.length === 2) return roiJson(await roiOr404(seg[1], await auth()));
    if (seg[2] === 'laudo') {
      const u = await auth('gestao'), r = await roiOr404(seg[1], u), l = r.lei;
      if (l.status === DISPONIVEL) throw new ApiError(seg[3] === 'validar' ? 'Laudo já validado' : 'Laudo já validado — não pode mais ser editado', 409);
      if (method === 'POST' && seg[3] === 'validar') { await validarLei(r, u); return (await roiJson(r, false)).lei; }
      if (method === 'PUT' && seg.length === 3) {
        const d = body || {};
        for (const [cur, nw] of [[l.tec, d.tec], [l.est, d.est]]) {
          if (nw == null) continue;
          if (!Array.isArray(nw) || nw.length !== cur.length || !nw.every(x => typeof x?.ok === 'boolean')) throw new ApiError('Checklist inválido', 422);
          cur.forEach((c, i) => { c.ok = nw[i].ok; });
        }
        const obs = String(d.obs ?? l.obs).slice(0, 5000), termo = String(d.termo ?? l.termo).slice(0, 5000);
        if (!termo.trim()) throw new ApiError('O termo de aceite não pode ficar vazio', 422);
        Object.assign(l, { obs, termo });
        await persist();
        return (await roiJson(r, false)).lei;
      }
    }
  }
  throw new ApiError('Não encontrado', 404);
}

/** Atende uma chamada da API como o fetch faria: devolve um Response com JSON. */
export async function handle(path, opt = {}) {
  const method = (opt.method || 'GET').toUpperCase();
  let body = opt.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }
  let status = 200, out;
  try {
    out = await route(method, new URL(path, location.href).pathname.replace(/^.*?(\/api\/)/, '$1'), body);
    if (out instanceof Reply) ({ body: out, status } = out);
  } catch (e) {
    if (!(e instanceof ApiError)) { console.error(e); e = new ApiError('Erro interno da demonstração', 500); }
    status = e.status; out = { error: e.message };
  }
  return new Response(JSON.stringify(out), { status, headers: { 'Content-Type': 'application/json' } });
}
