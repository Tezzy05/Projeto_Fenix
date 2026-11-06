"""Usuários e laudos de exemplo para demonstração (FENIX_DEMO=1)."""
import json
import time
from pathlib import Path

from werkzeug.security import generate_password_hash

import rules
from services import log_event, now_ms

DEMO_PASSWORD = "fenix123"
# (id, nome, perfil, UFs de atuação — só técnicos têm estado)
USERS = [
    ("tec1", "André", "tecnico", "SP,RJ"), ("pat", "Patrícia", "gestao", ""), ("her", "Herval", "gestao", ""), ("rod", "Rodrigo", "gestao", ""),
    ("tha", "Thais", "projetos", ""), ("ana", "Ana", "projetos", ""), ("and", "Anderson", "adm", ""), ("cur", "Cury", "adm", ""),
    ("duf", "Duarte", "adm", ""), ("bia", "Bianca", "consulta", ""), ("car", "Carlos (Téc.)", "tecnico", "SP,MG"),
    ("mar", "Marcos (Téc.)", "tecnico", "MG"), ("joa", "Joana (Téc.)", "tecnico", "PE,BA"), ("raf", "Rafael (Téc.)", "tecnico", "BA,MA"),
]
# Fotos ilustrativas (img/demo/<slot>.jpg limpa e <slot>_marca.jpg com a faixa de marca d'água)
DEMO_IMG = Path(__file__).resolve().parent.parent / "img" / "demo"


def seed_users(db, password=DEMO_PASSWORD):
    """Cria os usuários de demonstração; nos já existentes atualiza nome e UFs e mantém a senha."""
    h = generate_password_hash(password)
    for uid, nome, perfil, ufs in USERS:
        db.execute("INSERT INTO usuarios(id,nome,perfil,senha_hash,ufs) VALUES(?,?,?,?,?) "
                   "ON CONFLICT(id) DO UPDATE SET nome=excluded.nome, ufs=excluded.ufs", (uid, nome, perfil, h, ufs))
    db.commit()


def seed_installations(db, storage):
    if db.execute("SELECT COUNT(*) FROM instalacoes").fetchone()[0]:
        return
    H, now, y = 3600e3, now_ms(), time.localtime().tm_year
    ok_all = lambda: {k: {"ok": True, "obs": ""} for k in rules.CHECK_KEYS}
    names = {u[0]: u[1] for u in USERS}

    def add(n, tec_id, cliente, ambiente, end, uf, loc, ago, over_cl=None, avaria=False, obs="", validado=None, grupo=None):
        cl = ok_all()
        cl.update(over_cl or {})
        closed = int(now - ago * H)
        codigo = f"ROI-{y}-{n:04d}"
        cur = db.execute(
            """INSERT INTO instalacoes(codigo,client_uuid,tecnico_id,tecnico_nome,cliente,ambiente,endereco,localizacao,uf,iniciado_em,encerrado_em,
               sincronizado_em,serie,pin,apk,modem_op,modem_modelo,modem_imei,modem_ns,chip_op,chip_linha,chip_iccid,avaria,obs,aceite_nome,aceite_doc,
               grupo,maquina_i,maquina_n) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (codigo, f"seed-{n}", tec_id, names[tec_id], cliente, ambiente, end, loc, uf, closed - 2400000, closed, closed + 60000,
             f"RM-{y}-{n:04d}", f"4{n * 7919 % 100000:05d}", "3.8.2", "Vivo", "Quectel EC25", f"86753004{n * 10007 % 10**7:07d}", f"MD-{70000 + n}",
             "Vivo", f"(11) 9{n * 30011 % 10000:04d}-0000", f"895510{n * 99991 % 10**13:013d}", int(avaria), obs,
             f"Responsável {cliente.split()[0]}", "000.000.000-00", *(grupo or (None, None, None))))
        iid = cur.lastrowid
        for k in rules.CHECK_KEYS:
            db.execute("INSERT INTO checklist VALUES(?,?,?,?)", (iid, k, int(cl[k]["ok"]), cl[k]["obs"]))
        for i, slot in enumerate(rules.FOTO_SLOTS + (["fx", "fx2"] if avaria else [])):
            if not (DEMO_IMG / f"{slot}.jpg").exists():
                continue
            base = f"roi/{codigo}/{slot}"
            orig = storage.save(f"{base}_orig.jpg", (DEMO_IMG / f"{slot}.jpg").read_bytes())
            mark = storage.save(f"{base}_marca.jpg", (DEMO_IMG / f"{slot}_marca.jpg").read_bytes())
            db.execute("INSERT INTO fotos(instalacao_id,slot,arquivo_orig,arquivo_marca,ts,lat,lng) VALUES(?,?,?,?,?,?,?)",
                       (iid, slot, orig, mark, closed - 2000000 + i * 120000, None, None))
        lei = rules.build_lei(cl, avaria, obs)
        db.execute("INSERT INTO laudos(instalacao_id,status,tec,est,obs,termo) VALUES(?,?,?,?,?,?)",
                   (iid, rules.AGUARDANDO, json.dumps(lei["tec"]), json.dumps(lei["est"]), lei["obs"], lei["termo"]))
        if validado:
            who_id, hrs = validado
            db.execute("UPDATE laudos SET status=?, validado_por_id=?, validado_por=?, validado_em=?, chave=? WHERE instalacao_id=?",
                       (rules.DISPONIVEL, who_id, names[who_id], int(now - hrs * H), f"FNX-{n:04d}-A9F2-C7D1-B3E4", iid))
        log_event(db, iid, tec_id, "ROI_SINCRONIZADO", "seed")

    add(131, "mar", "Drogaria Central", "Matriz", "Av. Afonso Pena, 1500 — Belo Horizonte/MG", "MG", "Entrada principal", 52, validado=("her", 48))
    add(135, "car", "Supermercado Bom Preço", "Loja 12 · Hall", "Rua das Acácias, 250 — Osasco/SP", "SP", "Ao lado da saída", 30, validado=("pat", 26))
    add(138, "car", "IMMU", "Sede · Recepção", "Av. Paulista, 1000 — Bela Vista, São Paulo/SP", "SP", "Próximo aos caixas", 3)
    add(139, "car", "IMMU", "Terminal 1", "Terminal Rodoviário Tietê, Plataforma 3 — São Paulo/SP", "SP", "Entrada principal", 6,
        over_cl={"estrut": {"ok": False, "obs": "Amassado na lateral direita, próximo à base."},
                 "adesiv": {"ok": False, "obs": "Descolamento parcial da adesivação (frete)."}},
        avaria=True, obs="Necessária readesivação parcial.")
    # visita com 2 máquinas no mesmo cliente: um ROI/LEI por máquina, ligados pelo grupo
    add(140, "tec1", "Shopping Barra Sul", "Piso L1 · Praça de alimentação", "Av. das Américas, 4666 — Barra da Tijuca, Rio de Janeiro/RJ", "RJ",
        "Ao lado dos sanitários", 20, validado=("pat", 12), grupo=("seed-visita-1", 1, 2))
    add(144, "tec1", "Shopping Barra Sul", "Estacionamento G1", "Av. das Américas, 4666 — Barra da Tijuca, Rio de Janeiro/RJ", "RJ",
        "Junto aos elevadores", 20, grupo=("seed-visita-1", 2, 2))
    add(141, "joa", "Atacadão Recife", "Loja Imbiribeira", "Av. Mascarenhas de Morais, 5000 — Recife/PE", "PE", "Saída dos caixas", 9,
        over_cl={"conect": {"ok": False, "obs": "Sinal 4G fraco no ponto; instalada antena externa provisória."}})
    add(142, "raf", "Hiper Ideal", "Unidade Pituba", "Av. Tancredo Neves, 1189 — Salvador/BA", "BA", "Hall de entrada", 40, validado=("rod", 36))
    add(143, "raf", "Mateus Supermercados", "Loja Holandeses", "Av. dos Holandeses, 9 — São Luís/MA", "MA", "Próximo ao estacionamento", 2)
    db.commit()


def seed_maquinas(db, storage):
    """Máquinas preparadas na base: disponíveis (algumas já designadas), uma não conforme, uma corrigida e uma instalada."""
    if db.execute("SELECT COUNT(*) FROM maquinas").fetchone()[0]:
        return
    H, now, y = 3600e3, now_ms(), time.localtime().tm_year
    names = {u[0]: u[1] for u in USERS}
    img = DEMO_IMG / "prep"

    def prep(serie, tec, uf, ago, nok=None, na_promo=False):
        ts = int(now - ago * H)
        itens = {k: {"ok": None if (k == "promo" and na_promo) else True, "obs": ""} for k, _ in rules.PREP}
        for k, obs in (nok or {}).items():
            itens[k] = {"ok": False, "obs": obs}
        antes = db.execute("SELECT itens FROM preparacoes WHERE serie=? ORDER BY id DESC LIMIT 1", (serie,)).fetchone()
        corr = rules.prep_corrigidos(json.loads(antes["itens"]), itens) if antes else []
        pid = db.execute("INSERT INTO preparacoes(client_uuid,serie,tecnico_id,tecnico_nome,uf,em,itens,conforme,corrigidos) VALUES(?,?,?,?,?,?,?,?,?)",
                         (f"seed-prep-{serie}-{ago}", serie, tec, names[tec], uf, ts, json.dumps(itens), int(rules.prep_conforme(itens)), json.dumps(corr))).lastrowid
        fotos = {}
        for i, slot in enumerate(rules.PREP_SLOTS):
            if slot == "i_promo" and na_promo or not (img / f"{slot}.jpg").exists():
                continue
            fotos[slot] = {"orig": storage.save(f"prep/{pid}/{slot}_orig.jpg", (img / f"{slot}.jpg").read_bytes()),
                           "mark": storage.save(f"prep/{pid}/{slot}_marca.jpg", (img / f"{slot}_marca.jpg").read_bytes()),
                           "ts": ts - (len(rules.PREP_SLOTS) - i) * 60000, "lat": None, "lng": None}
        db.execute("UPDATE preparacoes SET fotos=? WHERE id=?", (json.dumps(fotos), pid))
        return pid, ts, rules.prep_conforme(itens)

    def maq(n, uf, preps, designado=None, instalada=None):
        serie = f"RM-{y}-{n:04d}"
        db.execute("INSERT INTO maquinas(serie,pin,uf,status,criado_em,atualizado_em) VALUES(?,?,?,?,?,?)",
                   (serie, f"{n * 7919 % 1000000:06d}", uf, rules.M_NAO_CONFORME, now, now))
        for tec, ago, kw in preps:
            pid, ts, ok = prep(serie, tec, uf, ago, **kw)
        status = rules.M_INSTALADA if instalada else rules.M_DISPONIVEL if ok else rules.M_NAO_CONFORME
        db.execute("UPDATE maquinas SET status=?, ultima_prep=?, criado_em=?, atualizado_em=? WHERE serie=?", (status, pid, ts, ts, serie))
        if designado:
            tec, por, ago = designado
            db.execute("UPDATE maquinas SET designado_id=?, designado_nome=?, designado_por=?, designado_em=? WHERE serie=?",
                       (tec, names[tec], names[por], int(now - ago * H), serie))
        if instalada:
            db.execute("UPDATE maquinas SET instalada_roi=?, instalada_em=? WHERE serie=?", (f"ROI-{y}-{instalada[0]:04d}", int(now - instalada[1] * H), serie))

    maq(147, "SP", [("car", 30, {})], designado=("tec1", "pat", 26))
    maq(152, "RJ", [("tec1", 28, {"na_promo": True})])
    maq(160, "PE", [("joa", 22, {})], designado=("joa", "her", 20))
    maq(163, "BA", [("raf", 18, {"na_promo": True})])
    maq(170, "MG", [("mar", 40, {})], designado=("mar", "rod", 36))
    maq(171, "SP", [("car", 10, {"nok": {"adesiv": "Bolha na lateral direita; aguardando readesivação."}})])
    maq(172, "MA", [("raf", 50, {"nok": {"modem": "Sem sinal da operadora; chip será trocado."}}), ("raf", 24, {})])
    maq(140, "RJ", [("tec1", 60, {})], designado=("tec1", "pat", 50), instalada=(140, 20))
    db.commit()
