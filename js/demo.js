// Servidor de demonstração no navegador: responde às mesmas rotas /api/* do Flask (backend/app.py) quando o app roda
// sem backend (GitHub Pages ou ?demo). Regras portadas de backend/rules.py, services.py e seed.py.
// Dados e fotos ficam no IndexedDB deste navegador; POST /api/demo/reset volta aos laudos de exemplo.

const DEMO_PASSWORD = 'fenix123';
const USERS = [
  ['tec1', 'André', 'tecnico', 'SP,RJ'], ['pat', 'Patrícia', 'gestao'], ['her', 'Herval', 'gestao'], ['rod', 'Rodrigo', 'gestao'],
  ['tha', 'Thais', 'projetos'], ['ana', 'Ana', 'projetos'], ['and', 'Anderson', 'adm'], ['cur', 'Cury', 'adm'],
  ['duf', 'Duarte', 'adm'], ['bia', 'Bianca', 'consulta'], ['car', 'Carlos (Téc.)', 'tecnico', 'SP,MG'], ['mar', 'Marcos (Téc.)', 'tecnico', 'MG'],
  ['joa', 'Joana (Téc.)', 'tecnico', 'PE,BA'], ['raf', 'Rafael (Téc.)', 'tecnico', 'BA,MA'],
].map(([id, nome, perfil, ufs = '']) => ({ id, nome, perfil, ufs: ufs ? ufs.split(',') : [], ativo: 1 }));
const SEED_VERSION = 4;   // mudou o formato do seed: navegadores com dados antigos recomeçam do zero
const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI',
  'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];

const CHECK = [
  ['eletrica', 'Instalação Elétrica (Régua/Timer)'], ['acesso', 'Acessibilidade do Percurso'], ['conect', 'Conectividade (Sinal de Dados)'],
  ['fixacao', 'Fixação e Estabilidade'], ['espaco', 'Espaço Frontal (mín. 1,10 m p/ porta)'], ['limpeza', 'Limpeza do Equipamento e Local'],
  ['adesiv', 'Integridade da Adesivação (visual)'], ['estrut', 'Estrutura (sem riscos/amassados)'],
];
const CHECK_KEYS = CHECK.map(([k]) => k);
const FOTO_SLOTS = ['f1', 'f2', 'f3', 'f4', 'f5', 'f6'], FOTO_EXTRA = 'fx', AVARIA_SLOTS = [FOTO_EXTRA, 'fx2', 'fx3', 'fx4', 'fx5'];
const ALL_SLOTS = [...FOTO_SLOTS, ...AVARIA_SLOTS];
const AGUARDANDO = 'AGUARDANDO_VALIDACAO', DISPONIVEL = 'DISPONIVEL_PROJETOS';
const TERMO_PADRAO = 'Este documento atesta a conformidade da instalação e da integridade da comunicação visual conforme o escopo do projeto. '
  + 'Ao validar este laudo, o cliente declara que o equipamento de série [Nº Série] foi entregue em perfeitas condições de uso, '
  + 'com a adesivação íntegra e de acordo com as especificações contratadas.';

const CMS = {
  'RM-2026-0147': { pin: '482913', apk: '3.8.2', modem: { op: 'Vivo', modelo: 'Quectel EC25', imei: '867530041226781', ns: 'MD-77120' },
    chip: { op: 'Vivo', linha: '(11) 91234-5678', iccid: '8955101234567890123' } },
  'RM-2026-0152': { pin: '551207', apk: '3.8.2', modem: { op: 'Claro', modelo: 'Teltonika RUT241', imei: '352093081452237', ns: 'MD-77188' },
    chip: { op: 'Claro', linha: '(11) 98765-4321', iccid: '8955201234567890456' } },
  'RM-2026-0160': { pin: '613044', apk: '3.9.0', modem: { op: 'Vivo', modelo: 'Quectel EC25', imei: '867530041318842', ns: 'MD-77240' },
    chip: { op: 'Vivo', linha: '(81) 99812-3344', iccid: '8955101234567890789' } },
  'RM-2026-0163': { pin: '709381', apk: '3.9.0', modem: { op: 'Claro', modelo: 'Teltonika RUT241', imei: '352093081577104', ns: 'MD-77263' },
    chip: { op: 'Claro', linha: '(71) 98455-1209', iccid: '8955201234567890912' } },
};

// Checklist de preparação na base (backend/rules.py: PREP)
const PREP = ['hw', 'sw', 'seg', 'modem', 'promo', 'adesiv'], PREP_NOMES = ['Instalação de hardware', 'Instalação de software', 'Instalação de módulos de segurança',
  'Configuração de modem', 'Tela/botão promocional', 'Adesivação'], PREP_OPCIONAL = ['promo'];
const PREP_FOTOS = [['mf', 'Frontal (adesivada e ligada)'], ['me', 'Lateral esquerda'], ['md', 'Lateral direita']];
const PREP_SLOTS = [...PREP.map(k => 'i_' + k), ...PREP_FOTOS.map(([k]) => k)];
const M_DISPONIVEL = 'DISPONIVEL', M_NAO_CONFORME = 'NAO_CONFORME', M_INSTALADA = 'INSTALADA';
function validatePrep(d, slots) {
  if (!String(d.serie || '').trim()) return 'Campo obrigatório ausente: nº de série';
  if (!UFS.includes(String(d.uf || '').trim())) return 'Campo obrigatório ausente: estado (UF) da base';
  for (const [i, k] of PREP.entries()) {
    const v = d.itens?.[k];
    if (!v || !(typeof v.ok === 'boolean' || (PREP_OPCIONAL.includes(k) && v.ok === null))) return `Checklist sem resposta: ${PREP_NOMES[i]}`;
    if (v.ok === false && !String(v.obs || '').trim()) return `Observação obrigatória (não conforme): ${PREP_NOMES[i]}`;
    if (v.ok !== null && !slots.includes('i_' + k)) return `Foto obrigatória ausente: ${PREP_NOMES[i]}`;
  }
  for (const [k, nome] of PREP_FOTOS) if (!slots.includes(k)) return `Foto obrigatória ausente: ${nome}`;
  return null;
}
const prepConforme = itens => PREP.every(k => itens[k].ok === true || (PREP_OPCIONAL.includes(k) && itens[k].ok === null));
const prepCorrigidos = (antes, agora) => PREP.filter(k => antes?.[k]?.ok === false && agora[k].ok !== false);

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

/** Máquinas de uma mesma visita (rules.visita): { grupo, maquina: { i, n } } ou {} quando é uma máquina só. */
function visita(d) {
  const g = String(d.grupo || '').trim().slice(0, 64), i = parseInt(d.maquina?.i, 10), n = parseInt(d.maquina?.n, 10);
  return g && i >= 1 && i <= n && n <= 50 ? { grupo: g, maquina: { i, n } } : {};
}

function validatePayload(d) {
  const txt = (...path) => { const v = path.reduce((a, p) => (a && typeof a === 'object' ? a[p] : undefined), d); return v == null ? '' : String(v).trim(); };
  if (!UFS.includes(txt('local', 'uf'))) return 'Campo obrigatório ausente: estado (UF)';
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

let S = null;   // { v, users, inst: [...] }
async function state() {
  if (!S) S = await tx('state', 'readonly', s => s.get('db'));
  if (!S || S.v !== SEED_VERSION) await reset();
  return S;
}
async function reset() {
  await files.clear();
  urls.forEach(u => URL.revokeObjectURL(u)); urls.clear();
  S = await seed(); await persist();
}
const persist = () => tx('state', 'readwrite', s => s.put(S, 'db'));

/* ---------------- Laudos de exemplo (backend/seed.py) ---------------- */
// Fotos ilustrativas: img/demo/<slot>.jpg (limpa) e <slot>_marca.jpg (com a faixa de marca d'água), guardadas uma vez no IndexedDB.
async function seedPhotos() {
  const out = {};
  for (const slot of [...FOTO_SLOTS, 'fx', 'fx2']) {
    try {
      const [o, m] = await Promise.all([`img/demo/${slot}.jpg`, `img/demo/${slot}_marca.jpg`].map(u => fetch(u).then(r => r.ok ? r.blob() : null)));
      if (!o || !m) continue;
      await files.put(`seed/${slot}_orig.jpg`, o); await files.put(`seed/${slot}_marca.jpg`, m);
      out[slot] = { orig: `seed/${slot}_orig.jpg`, mark: `seed/${slot}_marca.jpg` };
    } catch { /* sem a foto de exemplo: o laudo fica sem ela */ }
  }
  return out;
}
async function seed() {
  const photos = await seedPhotos();
  const H = 3600e3, now = Date.now(), y = new Date().getFullYear();
  const p = (n, w) => String(n).padStart(w, '0');
  const inst = [];
  const nome = id => USERS.find(u => u.id === id).nome;
  const add = (n, tecId, cliente, ambiente, endereco, uf, localizacao, ago, { over = {}, avaria = false, obs = '', validado, grupo } = {}) => {
    const cl = Object.fromEntries(CHECK_KEYS.map(k => [k, { ok: true, obs: '' }]));
    Object.assign(cl, over);
    const closed = Math.round(now - ago * H);
    const lei = { status: AGUARDANDO, ...buildLei(cl, avaria, obs), validadoPor: null, validadoEm: null, chave: null };
    if (validado) Object.assign(lei, { status: DISPONIVEL, validadoPor: nome(validado[0]), validadoEm: Math.round(now - validado[1] * H), chave: `FNX-${p(n, 4)}-A9F2-C7D1-B3E4` });
    const fotos = {};
    [...FOTO_SLOTS, ...(avaria ? ['fx', 'fx2'] : [])].forEach((slot, i) => { if (photos[slot]) fotos[slot] = { ...photos[slot], ts: closed - 2000000 + i * 120000, lat: null, lng: null }; });
    inst.push({
      id: `ROI-${y}-${p(n, 4)}`, clientId: `seed-${n}`, tecnico: nome(tecId), tecnicoId: tecId,
      iniciadoEm: closed - 2400000, closedAt: closed, syncedAt: closed + 60000,
      local: { cliente, ambiente, endereco, localizacao, uf },
      equip: { serie: `RM-${y}-${p(n, 4)}`, pin: `4${p(n * 7919 % 100000, 5)}`, apk: '3.8.2',
        modem: { op: 'Vivo', modelo: 'Quectel EC25', imei: `86753004${p(n * 10007 % 1e7, 7)}`, ns: `MD-${70000 + n}` },
        chip: { op: 'Vivo', linha: `(11) 9${p(n * 30011 % 10000, 4)}-0000`, iccid: `895510${p(n * 99991 % 1e13, 13)}` } },
      checklist: cl, avaria, obs, aceite: { nome: `Responsável ${cliente.split(' ')[0]}`, doc: '000.000.000-00' },
      sig: null, fotos, lei, ...(grupo ? { grupo: grupo[0], maquina: { i: grupo[1], n: grupo[2] } } : {}),
    });
  };
  add(131, 'mar', 'Drogaria Central', 'Matriz', 'Av. Afonso Pena, 1500 — Belo Horizonte/MG', 'MG', 'Entrada principal', 52, { validado: ['her', 48] });
  add(135, 'car', 'Supermercado Bom Preço', 'Loja 12 · Hall', 'Rua das Acácias, 250 — Osasco/SP', 'SP', 'Ao lado da saída', 30, { validado: ['pat', 26] });
  add(138, 'car', 'IMMU', 'Sede · Recepção', 'Av. Paulista, 1000 — Bela Vista, São Paulo/SP', 'SP', 'Próximo aos caixas', 3);
  add(139, 'car', 'IMMU', 'Terminal 1', 'Terminal Rodoviário Tietê, Plataforma 3 — São Paulo/SP', 'SP', 'Entrada principal', 6, {
    over: { estrut: { ok: false, obs: 'Amassado na lateral direita, próximo à base.' }, adesiv: { ok: false, obs: 'Descolamento parcial da adesivação (frete).' } },
    avaria: true, obs: 'Necessária readesivação parcial.' });
  // visita com 2 máquinas no mesmo cliente: um ROI/LEI por máquina, ligados pelo grupo
  add(140, 'tec1', 'Shopping Barra Sul', 'Piso L1 · Praça de alimentação', 'Av. das Américas, 4666 — Barra da Tijuca, Rio de Janeiro/RJ', 'RJ',
    'Ao lado dos sanitários', 20, { validado: ['pat', 12], grupo: ['seed-visita-1', 1, 2] });
  add(144, 'tec1', 'Shopping Barra Sul', 'Estacionamento G1', 'Av. das Américas, 4666 — Barra da Tijuca, Rio de Janeiro/RJ', 'RJ',
    'Junto aos elevadores', 20, { grupo: ['seed-visita-1', 2, 2] });
  add(141, 'joa', 'Atacadão Recife', 'Loja Imbiribeira', 'Av. Mascarenhas de Morais, 5000 — Recife/PE', 'PE', 'Saída dos caixas', 9, {
    over: { conect: { ok: false, obs: 'Sinal 4G fraco no ponto; instalada antena externa provisória.' } } });
  add(142, 'raf', 'Hiper Ideal', 'Unidade Pituba', 'Av. Tancredo Neves, 1189 — Salvador/BA', 'BA', 'Hall de entrada', 40, { validado: ['rod', 36] });
  add(143, 'raf', 'Mateus Supermercados', 'Loja Holandeses', 'Av. dos Holandeses, 9 — São Luís/MA', 'MA', 'Próximo ao estacionamento', 2);
  return { v: SEED_VERSION, users: USERS, inst, maqs: await seedMaquinas(y, now, H, nome), prepSeq: 100 };
}
/** Máquinas preparadas na base (backend/seed.py: seed_maquinas). */
async function seedMaquinas(y, now, H, nome) {
  const fotos = {};
  for (const slot of PREP_SLOTS) {
    try {
      const [o, m] = await Promise.all([`img/demo/prep/${slot}.jpg`, `img/demo/prep/${slot}_marca.jpg`].map(u => fetch(u).then(r => r.ok ? r.blob() : null)));
      if (o && m) { await files.put(`seedprep/${slot}_orig.jpg`, o); await files.put(`seedprep/${slot}_marca.jpg`, m); fotos[slot] = { orig: `seedprep/${slot}_orig.jpg`, mark: `seedprep/${slot}_marca.jpg` }; }
    } catch { /* sem a foto de exemplo */ }
  }
  let pid = 0;
  const maqs = [];
  const maq = (n, uf, preps, { designado, instalada } = {}) => {
    const serie = `RM-${y}-${String(n).padStart(4, '0')}`, list = [];
    for (const [tec, ago, { nok = {}, naPromo = false } = {}] of preps) {
      const em = Math.round(now - ago * H);
      const itens = Object.fromEntries(PREP.map(k => [k, { ok: k === 'promo' && naPromo ? null : true, obs: '' }]));
      Object.entries(nok).forEach(([k, obs]) => { itens[k] = { ok: false, obs }; });
      const f = {};
      PREP_SLOTS.forEach((slot, i) => { if (fotos[slot] && !(slot === 'i_promo' && naPromo)) f[slot] = { ...fotos[slot], ts: em - (PREP_SLOTS.length - i) * 60000, lat: null, lng: null }; });
      list.unshift({ id: ++pid, clientId: `seed-prep-${serie}-${ago}`, em, tecnico: nome(tec), tecnicoId: tec, uf, itens, conforme: prepConforme(itens), corrigidos: list[0] ? prepCorrigidos(list[0].itens, itens) : [], fotos: f });
    }
    const last = list[0];
    maqs.push({ serie, pin: String(n * 7919 % 1000000).padStart(6, '0'), uf, status: instalada ? M_INSTALADA : last.conforme ? M_DISPONIVEL : M_NAO_CONFORME,
      designado: designado ? { id: designado[0], nome: nome(designado[0]), por: nome(designado[1]), em: Math.round(now - designado[2] * H) } : null,
      criadoEm: last.em, atualizadoEm: last.em, instaladaRoi: instalada ? `ROI-${y}-${String(instalada[0]).padStart(4, '0')}` : null,
      instaladaEm: instalada ? Math.round(now - instalada[1] * H) : null, preps: list });
  };
  maq(147, 'SP', [['car', 30]], { designado: ['tec1', 'pat', 26] });
  maq(152, 'RJ', [['tec1', 28, { naPromo: true }]]);
  maq(160, 'PE', [['joa', 22]], { designado: ['joa', 'her', 20] });
  maq(163, 'BA', [['raf', 18, { naPromo: true }]]);
  maq(170, 'MG', [['mar', 40]], { designado: ['mar', 'rod', 36] });
  maq(171, 'SP', [['car', 10, { nok: { adesiv: 'Bolha na lateral direita; aguardando readesivação.' } }]]);
  maq(172, 'MA', [['raf', 50, { nok: { modem: 'Sem sinal da operadora; chip será trocado.' } }], ['raf', 24]]);
  maq(140, 'RJ', [['tec1', 60]], { designado: ['tec1', 'pat', 50], instalada: [140, 20] });
  return maqs.sort((a, b) => b.atualizadoEm - a.atualizadoEm);
}

/* ---------------- Serialização (services.roi_json): arquivos viram blob: URLs ---------------- */
const urls = new Map();
async function fileUrl(key) {
  if (!key) return null;
  if (!urls.has(key)) { const b = await files.get(key); if (!b) return null; urls.set(key, URL.createObjectURL(b)); }
  return urls.get(key);
}
async function roiJson(r, photos = true, u = null) {
  const { clientId, sig, fotos, ...out } = structuredClone(r);
  Object.assign(out, { sync: 'sincronizado', drive: { status: 'desativado', pasta: null } });
  out.aceite.assinatura = await fileUrl(sig);
  if (photos) {
    out.fotos = {};
    for (const [slot, f] of Object.entries(fotos)) out.fotos[slot] = { ts: f.ts, lat: f.lat, lng: f.lng, origem: f.origem || 'camera', mark: await fileUrl(f.mark), origUrl: await fileUrl(f.orig) };
  }
  return u?.perfil === 'consulta' ? consultaJson(out) : out;
}
/** Perfil Consulta (services.consulta_json): só cliente, localidade, máquina, datas e fotos. */
const consultaJson = f => ({ id: f.id, iniciadoEm: f.iniciadoEm, closedAt: f.closedAt, local: f.local, equip: { serie: f.equip.serie },
  lei: { status: f.lei.status }, ...(f.fotos ? { fotos: f.fotos } : {}) });

/* ---------------- Sessão ---------------- */
const SESSION = 'fenix.demo.uid';
const sess = { get: () => { try { return localStorage.getItem(SESSION); } catch { return null; } }, set: v => { try { v ? localStorage.setItem(SESSION, v) : localStorage.removeItem(SESSION); } catch { } } };
const pub = u => ({ id: u.id, nome: u.nome, perfil: u.perfil, ufs: u.ufs || [] });
async function current() { const id = sess.get(); return id ? (await state()).users.find(u => u.id === id && u.ativo) || null : null; }
async function auth(...perfis) {
  const u = await current();
  if (!u) throw new ApiError('Não autenticado', 401);
  if (perfis.length && !perfis.includes(u.perfil)) throw new ApiError('Sem permissão para este perfil', 403);
  return u;
}
async function roiOr404(cod, u) {
  const r = (await state()).inst.find(x => x.id === cod);
  if (!r || (u.perfil === 'tecnico' && r.tecnicoId !== u.id)) throw new ApiError('Não encontrado', 404);
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
  if (u.ufs?.length && !u.ufs.includes(String(data.local.uf).trim())) throw new ApiError('Estado (UF) fora da sua área de atuação', 422);
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
    fotos[slot] = { mark: `${base}/${slot}_marca.jpg`, orig, ts: p.meta.ts ?? null, lat: p.meta.lat ?? null, lng: p.meta.lng ?? null,
      origem: p.meta.origem === 'galeria' ? 'galeria' : 'camera' };
  }
  const t = s => String(s ?? '').trim();
  const { local: L, equip: E, aceite: A } = data, mo = E.modem || {}, ch = E.chip || {};
  const cl = Object.fromEntries(CHECK_KEYS.map(k => [k, { ok: !!data.checklist[k].ok, obs: String(data.checklist[k].obs || '').slice(0, 2000) }]));
  const obs = String(data.obs || '').slice(0, 5000);
  const r = {
    id: codigo, clientId: cid, tecnico: u.nome, tecnicoId: u.id, iniciadoEm: data.iniciadoEm ?? null, closedAt: Math.trunc(data.closedAt), syncedAt: Date.now(),
    local: { cliente: t(L.cliente), ambiente: t(L.ambiente), endereco: t(L.endereco), localizacao: t(L.localizacao), uf: t(L.uf) },
    equip: { serie: t(E.serie), pin: E.pin || '', apk: E.apk || '', modem: { op: mo.op || '', modelo: mo.modelo || '', imei: mo.imei || '', ns: mo.ns || '' },
      chip: { op: ch.op || '', linha: ch.linha || '', iccid: ch.iccid || '' } },
    checklist: cl, avaria, obs, aceite: { nome: t(A.nome), doc: t(A.doc) }, sig: `${base}/assinatura.png`, fotos,
    lei: { status: AGUARDANDO, ...buildLei(cl, avaria, data.obs || ''), validadoPor: null, validadoEm: null, chave: null }, ...visita(data),
  };
  st.inst.push(r);
  const mq = st.maqs.find(m => m.serie === r.equip.serie.toUpperCase() && m.status !== M_INSTALADA);   // máquina preparada na base: instalada
  if (mq) Object.assign(mq, { status: M_INSTALADA, instaladaRoi: codigo, instaladaEm: r.closedAt, atualizadoEm: Date.now() });
  await persist();
  return [r, false];
}

/* ---------------- Máquinas (services.create_prep / maquina_json / designar) ---------------- */
const maqVisivel = (m, u) => u.perfil !== 'tecnico' || m.designado?.id === u.id || !u.ufs?.length || u.ufs.includes(m.uf);
async function maqOr404(serie, u) {
  const m = (await state()).maqs.find(x => x.serie === String(serie).toUpperCase());
  if (!m || !maqVisivel(m, u)) throw new ApiError('Não encontrado', 404);
  return m;
}
async function prepJson(p, photos) {
  const { clientId, fotos, ...out } = structuredClone(p);
  if (photos) {
    out.fotos = {};
    for (const [slot, f] of Object.entries(fotos)) out.fotos[slot] = { ts: f.ts, lat: f.lat, lng: f.lng, mark: await fileUrl(f.mark), origUrl: await fileUrl(f.orig) };
  }
  return out;
}
async function maquinaJson(m, detail = false) {
  const st = await state(), i = m.instaladaRoi && st.inst.find(r => r.id === m.instaladaRoi);
  const out = { serie: m.serie, pin: m.pin, uf: m.uf, status: m.status, criadoEm: m.criadoEm, atualizadoEm: m.atualizadoEm, designado: m.designado ? { ...m.designado } : null,
    instalada: m.instaladaRoi ? { roi: m.instaladaRoi, em: m.instaladaEm, cliente: i?.local.cliente ?? null, ambiente: i?.local.ambiente ?? null, tecnico: i?.tecnico ?? null } : null,
    nPreps: m.preps.length, ultimaPrep: m.preps[0] ? await prepJson(m.preps[0], false) : null };
  if (detail) out.preps = await Promise.all(m.preps.map(p => prepJson(p, true)));
  return out;
}
async function createPrep(u, fd) {
  let data;
  try { data = JSON.parse(fd.get('data') || ''); } catch { throw new ApiError("JSON inválido em 'data'"); }
  const st = await state(), cid = String(data.clientId || '').slice(0, 64) || null;
  const dup = cid && st.maqs.find(m => m.preps.some(p => p.clientId === cid));
  if (dup) return [dup, false];
  const photos = {};
  for (const slot of PREP_SLOTS) {
    const mk = fd.get(`mark_${slot}`), o = fd.get(`orig_${slot}`);
    if (!mk) continue;
    if (!['jpg', 'png', 'webp'].includes(await sniff(mk))) throw new ApiError(`Imagem inválida: ${slot}`, 415);
    if (o && !(await sniff(o))) throw new ApiError(`Original inválido: ${slot}`, 415);
    photos[slot] = { mk, o, meta: data.fotos?.[slot] || {} };
  }
  const err = validatePrep(data, Object.keys(photos));
  if (err) throw new ApiError(err, 422);
  const serie = String(data.serie).trim().toUpperCase().slice(0, 40), uf = String(data.uf).trim();
  if (u.ufs?.length && !u.ufs.includes(uf)) throw new ApiError('Estado (UF) fora da sua área de atuação', 422);
  let m = st.maqs.find(x => x.serie === serie);
  if (m?.status === M_INSTALADA) throw new ApiError('Esta máquina já foi instalada', 409);
  const itens = Object.fromEntries(PREP.map(k => [k, { ok: data.itens[k].ok, obs: String(data.itens[k].obs || '').slice(0, 2000) }]));
  const em = Date.now(), id = ++st.prepSeq, fotos = {};
  for (const [slot, p] of Object.entries(photos)) {
    const orig = p.o ? `prep/${id}/${slot}_orig.${await sniff(p.o)}` : null;
    if (orig) await files.put(orig, p.o);
    await files.put(`prep/${id}/${slot}_marca.jpg`, p.mk);
    fotos[slot] = { mark: `prep/${id}/${slot}_marca.jpg`, orig, ts: p.meta.ts ?? null, lat: p.meta.lat ?? null, lng: p.meta.lng ?? null };
  }
  const conforme = prepConforme(itens);
  const prep = { id, clientId: cid, em, tecnico: u.nome, tecnicoId: u.id, uf, itens, conforme, corrigidos: m?.preps[0] ? prepCorrigidos(m.preps[0].itens, itens) : [], fotos };
  if (!m) { m = { serie, pin: '', uf, status: M_NAO_CONFORME, designado: null, criadoEm: em, atualizadoEm: em, instaladaRoi: null, instaladaEm: null, preps: [] }; st.maqs.unshift(m); }
  m.preps.unshift(prep);
  Object.assign(m, { pin: String(data.pin || '').slice(0, 20), uf, status: conforme ? M_DISPONIVEL : M_NAO_CONFORME, atualizadoEm: em });
  await persist();
  return [m, true];
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
    await reset(); sess.set(null);
    return { ok: true };
  }
  if (M === 'GET me') return pub(await auth());
  if (M === 'GET tecnicos') { await auth('gestao', 'adm', 'projetos'); return (await state()).users.filter(u => u.perfil === 'tecnico' && u.ativo).map(pub).sort((a, b) => a.nome.localeCompare(b.nome)); }
  if (seg[0] === 'maquinas') {
    if (method === 'POST' && seg[1] === 'prep') { const u = await auth('tecnico'); const [m, criado] = await createPrep(u, body); return new Reply(await maquinaJson(m), criado ? 201 : 200); }
    const u = await auth('tecnico', 'gestao', 'adm', 'projetos'), st = await state();
    if (method === 'GET' && seg.length === 1) {
      const rows = [...st.maqs].sort((a, b) => b.atualizadoEm - a.atualizadoEm).filter(m => u.perfil !== 'tecnico' || (maqVisivel(m, u) && m.status !== M_INSTALADA));
      return Promise.all(rows.map(m => maquinaJson(m)));
    }
    if (method === 'GET' && seg.length === 2) return maquinaJson(await maqOr404(seg[1], u), true);
    if (method === 'POST' && seg[2] === 'designar') {
      if (u.perfil !== 'gestao') throw new ApiError('Sem permissão para este perfil', 403);
      const m = await maqOr404(seg[1], u), tid = body?.tecnicoId;
      const tec = tid ? st.users.find(x => x.id === String(tid) && x.perfil === 'tecnico' && x.ativo) : null;
      if (tid && !tec) throw new ApiError('Técnico não encontrado', 404);
      if (m.status !== M_DISPONIVEL) throw new ApiError('Só máquinas disponíveis para instalação podem ser designadas', 409);
      if (tec?.ufs?.length && !tec.ufs.includes(m.uf)) throw new ApiError(`${tec.nome} não atua em ${m.uf}`, 422);
      m.designado = tec ? { id: tec.id, nome: tec.nome, por: u.nome, em: Date.now() } : null; m.atualizadoEm = Date.now();
      await persist();
      return maquinaJson(m);
    }
  }
  if (M === 'GET usuarios') { await auth('adm'); return (await state()).users.map(u => ({ ...pub(u), ativo: u.ativo })); }
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
      const rows = (await state()).inst.filter(r => u.perfil !== 'tecnico' || r.tecnicoId === u.id)
        .sort((a, b) => b.closedAt - a.closedAt).slice(0, 2000);
      return Promise.all(rows.map(r => roiJson(r, false, u)));
    }
    if (method === 'POST' && seg.length === 1) {
      const u = await auth('tecnico');
      const [r, dup] = await createInstallation(u, body);
      return new Reply(await roiJson(r), dup ? 200 : 201);
    }
    if (method === 'GET' && seg.length === 2) { const u = await auth(); return roiJson(await roiOr404(seg[1], u), true, u); }
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
