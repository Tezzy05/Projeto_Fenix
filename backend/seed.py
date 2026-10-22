"""Usuários e laudos de exemplo para demonstração (FENIX_DEMO=1)."""
import json
import time

from werkzeug.security import generate_password_hash

import rules
from services import log_event, now_ms

DEMO_PASSWORD = "fenix123"
USERS = [
    ("tec1", "Técnico Demo", "tecnico"), ("pat", "Patrícia", "gestao"), ("her", "Herval", "gestao"), ("rod", "Rodrigo", "gestao"),
    ("tha", "Thais", "projetos"), ("ana", "Ana", "projetos"), ("and", "Anderson", "adm"), ("cur", "Cury", "adm"),
    ("duf", "Duarte", "adm"), ("bia", "Bianca", "consulta"), ("car", "Carlos (Téc.)", "tecnico"), ("mar", "Marcos (Téc.)", "tecnico"),
]


def seed_users(db, password=DEMO_PASSWORD):
    h = generate_password_hash(password)
    for uid, nome, perfil in USERS:
        db.execute("INSERT OR IGNORE INTO usuarios(id,nome,perfil,senha_hash) VALUES(?,?,?,?)", (uid, nome, perfil, h))
    db.commit()


def seed_installations(db):
    if db.execute("SELECT COUNT(*) FROM instalacoes").fetchone()[0]:
        return
    H, now, y = 3600e3, now_ms(), time.localtime().tm_year
    ok_all = lambda: {k: {"ok": True, "obs": ""} for k in rules.CHECK_KEYS}

    def add(n, tec_id, tec_nome, cliente, ambiente, end, loc, ago, over_cl=None, avaria=False, obs="", validado=None):
        cl = ok_all()
        cl.update(over_cl or {})
        closed = int(now - ago * H)
        cur = db.execute(
            """INSERT INTO instalacoes(codigo,client_uuid,tecnico_id,tecnico_nome,cliente,ambiente,endereco,localizacao,iniciado_em,encerrado_em,sincronizado_em,
               serie,pin,apk,modem_op,modem_modelo,modem_imei,modem_ns,chip_op,chip_linha,chip_iccid,avaria,obs,aceite_nome,aceite_doc)
               VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (f"ROI-{y}-{n:04d}", f"seed-{n}", tec_id, tec_nome, cliente, ambiente, end, loc, closed - 2400000, closed, closed + 60000,
             f"RM-{y}-{n:04d}", f"4{n * 7919 % 100000:05d}", "3.8.2", "Vivo", "Quectel EC25", f"86753004{n * 10007 % 10**7:07d}", f"MD-{70000 + n}",
             "Vivo", f"(11) 9{n * 30011 % 10000:04d}-0000", f"895510{n * 99991 % 10**13:013d}", int(avaria), obs,
             f"Responsável {cliente.split()[0]}", "000.000.000-00"))
        iid = cur.lastrowid
        for k in rules.CHECK_KEYS:
            db.execute("INSERT INTO checklist VALUES(?,?,?,?)", (iid, k, int(cl[k]["ok"]), cl[k]["obs"]))
        lei = rules.build_lei(cl, avaria, obs)
        db.execute("INSERT INTO laudos(instalacao_id,status,tec,est,obs,termo) VALUES(?,?,?,?,?,?)",
                   (iid, rules.AGUARDANDO, json.dumps(lei["tec"]), json.dumps(lei["est"]), lei["obs"], lei["termo"]))
        if validado:
            who_id, who, hrs = validado
            db.execute("UPDATE laudos SET status=?, validado_por_id=?, validado_por=?, validado_em=?, chave=? WHERE instalacao_id=?",
                       (rules.DISPONIVEL, who_id, who, int(now - hrs * H), f"FNX-{n:04d}-A9F2-C7D1-B3E4", iid))
        log_event(db, iid, tec_id, "ROI_SINCRONIZADO", "seed")

    add(131, "mar", "Marcos (Téc.)", "Drogaria Central", "Matriz", "Av. Brasil, 4500 — Campinas/SP", "Entrada principal", 52, validado=("her", "Herval", 48))
    add(135, "car", "Carlos (Téc.)", "Supermercado Bom Preço", "Loja 12 · Hall", "Rua das Acácias, 250 — Osasco/SP", "Ao lado da saída", 30, validado=("pat", "Patrícia", 26))
    add(138, "car", "Carlos (Téc.)", "IMMU", "Sede · Recepção", "Av. Paulista, 1000 — Bela Vista, São Paulo/SP", "Próximo aos caixas", 3)
    add(139, "mar", "Marcos (Téc.)", "IMMU", "Terminal 1", "Terminal Rodoviário Tietê, Plataforma 3 — São Paulo/SP", "Entrada principal", 6,
        over_cl={"estrut": {"ok": False, "obs": "Amassado na lateral direita, próximo à base."},
                 "adesiv": {"ok": False, "obs": "Descolamento parcial da adesivação (frete)."}},
        avaria=True, obs="Necessária readesivação parcial.")
    db.commit()
