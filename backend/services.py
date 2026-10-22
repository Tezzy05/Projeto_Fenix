"""Casos de uso: gravar ROI (sincronização do app), serializar para a API, validar LEI."""
import hashlib
import json
import time

import rules

MIME = {"jpg": "image/jpeg", "png": "image/png", "webp": "image/webp", "heic": "image/heic"}


def now_ms() -> int:
    return int(time.time() * 1000)


def sniff_ext(b: bytes) -> str | None:
    """Tipo pelo conteúdo (não confia no nome/Content-Type enviados pelo cliente)."""
    if b[:3] == b"\xff\xd8\xff":
        return "jpg"
    if b[:8] == b"\x89PNG\r\n\x1a\n":
        return "png"
    if b[:4] == b"RIFF" and b[8:12] == b"WEBP":
        return "webp"
    if b[4:8] == b"ftyp" and b[8:12] in (b"heic", b"heix", b"mif1", b"msf1", b"heim"):
        return "heic"
    return None


def log_event(db, inst_id, user_id, acao, detalhe=""):
    db.execute("INSERT INTO eventos(instalacao_id,usuario_id,acao,detalhe,em) VALUES(?,?,?,?,?)", (inst_id, user_id, acao, detalhe, now_ms()))


def next_codigo(db, year: int) -> str:
    n = db.execute("SELECT COALESCE(MAX(CAST(substr(codigo,-4) AS INTEGER)),0) FROM instalacoes WHERE codigo LIKE ?", (f"ROI-{year}-%",)).fetchone()[0]
    return f"ROI-{year}-{n + 1:04d}"


class ApiError(Exception):
    def __init__(self, msg, status=400):
        super().__init__(msg)
        self.msg, self.status = msg, status


def create_installation(db, storage, user, data: dict, photos: dict, signature: bytes | None, client_uuid: str | None):
    """Grava o ROI enviado pelo app. Idempotente por client_uuid (reenvio após queda de conexão não duplica)."""
    if client_uuid:
        ex = db.execute("SELECT id, codigo FROM instalacoes WHERE client_uuid=?", (client_uuid,)).fetchone()
        if ex:
            return ex["id"], ex["codigo"], True
    err = rules.validate_roi_payload(data)
    if err:
        raise ApiError(err, 422)
    avaria = bool(data.get("avaria"))
    for slot in rules.FOTO_SLOTS + ([rules.FOTO_EXTRA] if avaria else []):
        p = photos.get(slot)
        if not p or not p.get("mark"):
            raise ApiError(f"Foto obrigatória ausente: {slot}", 422)
    if not signature or sniff_ext(signature) != "png":
        raise ApiError("Assinatura do responsável ausente ou inválida", 422)

    loc, eq, cl = data["local"], data["equip"], data["checklist"]
    modem, chip, ac = eq.get("modem", {}), eq.get("chip", {}), data["aceite"]
    written, ts = [], now_ms()
    try:
        db.execute("BEGIN IMMEDIATE")
        year = time.localtime().tm_year
        codigo = next_codigo(db, year)
        base = f"roi/{codigo}"
        sig_rel = storage.save(f"{base}/assinatura.png", signature)
        written.append(base)
        cur = db.execute(
            """INSERT INTO instalacoes(codigo,client_uuid,tecnico_id,tecnico_nome,cliente,ambiente,endereco,localizacao,iniciado_em,encerrado_em,
               sincronizado_em,serie,pin,apk,modem_op,modem_modelo,modem_imei,modem_ns,chip_op,chip_linha,chip_iccid,avaria,obs,
               aceite_nome,aceite_doc,aceite_assinatura) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
            (codigo, client_uuid, user["id"], user["nome"], loc["cliente"].strip(), loc["ambiente"].strip(), loc["endereco"].strip(),
             loc["localizacao"].strip(), data.get("iniciadoEm"), int(data["closedAt"]), ts, eq["serie"].strip(), eq.get("pin", ""), eq.get("apk", ""),
             modem.get("op", ""), modem.get("modelo", ""), modem.get("imei", ""), modem.get("ns", ""),
             chip.get("op", ""), chip.get("linha", ""), chip.get("iccid", ""), int(avaria), str(data.get("obs", ""))[:5000],
             ac["nome"].strip(), ac["doc"].strip(), sig_rel))
        iid = cur.lastrowid
        for k in rules.CHECK_KEYS:
            db.execute("INSERT INTO checklist VALUES(?,?,?,?)", (iid, k, int(cl[k]["ok"]), str(cl[k].get("obs", ""))[:2000]))
        for slot, p in photos.items():
            if slot not in rules.ALL_SLOTS:
                continue
            orig_rel = None
            if p.get("orig"):
                ext = sniff_ext(p["orig"]) or "jpg"
                orig_rel = storage.save(f"{base}/{slot}_orig.{ext}", p["orig"])
            mark_rel = storage.save(f"{base}/{slot}_marca.jpg", p["mark"])
            db.execute("INSERT INTO fotos(instalacao_id,slot,arquivo_orig,arquivo_marca,ts,lat,lng) VALUES(?,?,?,?,?,?,?)",
                       (iid, slot, orig_rel, mark_rel, p.get("ts"), p.get("lat"), p.get("lng")))
        lei = rules.build_lei({k: {"ok": bool(cl[k]["ok"]), "obs": cl[k].get("obs", "")} for k in rules.CHECK_KEYS}, avaria, data.get("obs", ""))
        db.execute("INSERT INTO laudos(instalacao_id,status,tec,est,obs,termo) VALUES(?,?,?,?,?,?)",
                   (iid, rules.AGUARDANDO, json.dumps(lei["tec"]), json.dumps(lei["est"]), lei["obs"], lei["termo"]))
        log_event(db, iid, user["id"], "ROI_SINCRONIZADO", codigo)
        db.commit()
        return iid, codigo, False
    except Exception:
        db.rollback()
        for d in written:
            storage.delete_tree(d)
        raise


def push_to_drive(db, storage, drive, iid: int):
    """Envia as fotos originais ao Drive. Nunca derruba a sincronização: falha vira drive_status='pendente'."""
    if drive is None:
        return
    row = db.execute("SELECT codigo FROM instalacoes WHERE id=?", (iid,)).fetchone()
    files = []
    for f in db.execute("SELECT slot, arquivo_orig FROM fotos WHERE instalacao_id=? AND arquivo_orig IS NOT NULL", (iid,)):
        p = storage.path(f["arquivo_orig"])
        files.append((f"{row['codigo']}_{f['slot']}{p.suffix}", p.read_bytes(), MIME.get(p.suffix[1:], "application/octet-stream"), f["slot"]))
    try:
        folder, ids = drive.upload_many(row["codigo"], [(n, b, m) for n, b, m, _ in files])
        for name, _b, _m, slot in files:
            db.execute("UPDATE fotos SET drive_file_id=? WHERE instalacao_id=? AND slot=?", (ids[name], iid, slot))
        db.execute("UPDATE instalacoes SET drive_pasta=?, drive_status='ok' WHERE id=?", (folder, iid))
    except Exception as e:                                   # noqa: BLE001
        db.execute("UPDATE instalacoes SET drive_status='pendente' WHERE id=?", (iid,))
        print(f"[drive] falha em {row['codigo']}: {e}")
    db.commit()


def roi_json(db, r, photos=True) -> dict:
    cod = r["codigo"]
    cl = {c["item"]: {"ok": bool(c["ok"]), "obs": c["obs"]} for c in db.execute("SELECT * FROM checklist WHERE instalacao_id=?", (r["id"],))}
    out = {
        "id": cod, "sync": "sincronizado", "tecnico": r["tecnico_nome"], "tecnicoId": r["tecnico_id"],
        "iniciadoEm": r["iniciado_em"], "closedAt": r["encerrado_em"], "syncedAt": r["sincronizado_em"],
        "local": {"cliente": r["cliente"], "ambiente": r["ambiente"], "endereco": r["endereco"], "localizacao": r["localizacao"]},
        "equip": {"serie": r["serie"], "pin": r["pin"], "apk": r["apk"],
                  "modem": {"op": r["modem_op"], "modelo": r["modem_modelo"], "imei": r["modem_imei"], "ns": r["modem_ns"]},
                  "chip": {"op": r["chip_op"], "linha": r["chip_linha"], "iccid": r["chip_iccid"]}},
        "checklist": cl, "avaria": bool(r["avaria"]), "obs": r["obs"],
        "aceite": {"nome": r["aceite_nome"], "doc": r["aceite_doc"], "assinatura": f"/api/roi/{cod}/assinatura" if r["aceite_assinatura"] else None},
        "drive": {"status": r["drive_status"], "pasta": r["drive_pasta"]},
    }
    l = db.execute("SELECT * FROM laudos WHERE instalacao_id=?", (r["id"],)).fetchone()
    if l:
        out["lei"] = {"status": l["status"], "tec": json.loads(l["tec"]), "est": json.loads(l["est"]), "obs": l["obs"], "termo": l["termo"],
                      "validadoPor": l["validado_por"], "validadoEm": l["validado_em"], "chave": l["chave"]}
    if photos:
        out["fotos"] = {f["slot"]: {"ts": f["ts"], "lat": f["lat"], "lng": f["lng"],
                                    "mark": f"/api/roi/{cod}/foto/{f['slot']}?v=marca",
                                    "origUrl": f"/api/roi/{cod}/foto/{f['slot']}?v=orig" if f["arquivo_orig"] else None}
                        for f in db.execute("SELECT * FROM fotos WHERE instalacao_id=?", (r["id"],))}
    return out


def validate_lei(db, r, user) -> str:
    l = db.execute("SELECT * FROM laudos WHERE instalacao_id=?", (r["id"],)).fetchone()
    ts = now_ms()
    conteudo = json.dumps([l["tec"], l["est"], l["obs"], l["termo"], r["codigo"], user["id"], ts], ensure_ascii=False)
    h = hashlib.sha256(conteudo.encode()).hexdigest()[:16].upper()
    chave = "FNX-" + "-".join(h[i:i + 4] for i in range(0, 16, 4))
    db.execute("UPDATE laudos SET status=?, validado_por_id=?, validado_por=?, validado_em=?, chave=? WHERE instalacao_id=?",
               (rules.DISPONIVEL, user["id"], user["nome"], ts, chave, r["id"]))
    log_event(db, r["id"], user["id"], "LEI_VALIDADO", chave)
    db.commit()
    return chave
