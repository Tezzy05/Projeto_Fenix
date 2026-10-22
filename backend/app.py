"""Projeto Fênix — API Flask (ROI, LEI, fotos) + entrega do front estático.

Execução local:  python backend/app.py            (ou iniciar_servidor.bat)
PythonAnywhere:  aponte o WSGI para  `from app import app as application`.
Variáveis: FENIX_DEMO=1 (usuários/laudos de exemplo), FENIX_SECRET, FENIX_HOST, FENIX_PORT, FENIX_HTTPS=1,
           FENIX_DRIVE_CREDENTIALS + FENIX_DRIVE_FOLDER_ID (Google Drive).
"""
import argparse
import getpass
import json
import os
import secrets
import time
from datetime import timedelta
from functools import wraps
from pathlib import Path

from flask import Flask, abort, g, jsonify, request, send_file, send_from_directory, session
from werkzeug.security import check_password_hash, generate_password_hash

import cms
import rules
import seed
import services
from database import close_db, get_db, init_db
from storage import LocalStorage, make_drive

ROOT = Path(__file__).resolve().parent.parent            # pasta fenix/ (front)
INSTANCE = Path(os.environ.get("FENIX_DATA", Path(__file__).resolve().parent / "instance"))
INSTANCE.mkdir(parents=True, exist_ok=True)
DEMO = os.environ.get("FENIX_DEMO", "0") == "1"

app = Flask(__name__, static_folder=None)
app.config.update(
    DB_PATH=str(INSTANCE / "fenix.db"),
    MAX_CONTENT_LENGTH=150 * 1024 * 1024,                 # 7 fotos originais + assinatura
    PERMANENT_SESSION_LIFETIME=timedelta(days=30),        # técnico precisa abrir o app offline por dias
    SESSION_COOKIE_HTTPONLY=True, SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=os.environ.get("FENIX_HTTPS") == "1",
)


def _secret() -> str:
    if os.environ.get("FENIX_SECRET"):
        return os.environ["FENIX_SECRET"]
    f = INSTANCE / "secret.key"
    if not f.exists():
        f.write_text(secrets.token_hex(32))
    return f.read_text().strip()


app.secret_key = _secret()
app.teardown_appcontext(close_db)
storage = LocalStorage(INSTANCE / "storage")
drive = make_drive()

init_db(app.config["DB_PATH"])
with app.app_context():
    _db = get_db()
    if DEMO and not _db.execute("SELECT 1 FROM usuarios LIMIT 1").fetchone():
        seed.seed_users(_db)
        seed.seed_installations(_db)


# ------------------------------------------------------------------ segurança / helpers
CSP = ("default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
       "font-src https://fonts.gstatic.com; script-src 'self'; connect-src 'self'; frame-src 'self'; worker-src 'self'; "
       "object-src 'none'; base-uri 'self'; form-action 'self'")


@app.after_request
def headers(resp):
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["Referrer-Policy"] = "same-origin"
    resp.headers["Content-Security-Policy"] = CSP
    if request.path.startswith("/api/"):
        resp.headers["Cache-Control"] = "no-store" if resp.mimetype == "application/json" else "private, max-age=3600"
    return resp


@app.errorhandler(services.ApiError)
def api_error(e):
    return jsonify(error=e.msg), e.status


@app.errorhandler(413)
def too_big(_):
    return jsonify(error="Envio muito grande"), 413


def current_user():
    uid = session.get("uid")
    if not uid:
        return None
    u = get_db().execute("SELECT id,nome,perfil FROM usuarios WHERE id=? AND ativo=1", (uid,)).fetchone()
    return dict(u) if u else None


def auth(*perfis):
    def deco(fn):
        @wraps(fn)
        def wrap(*a, **kw):
            u = current_user()
            if not u:
                return jsonify(error="Não autenticado"), 401
            if perfis and u["perfil"] not in perfis:
                return jsonify(error="Sem permissão para este perfil"), 403
            g.user = u
            return fn(*a, **kw)
        return wrap
    return deco


def get_roi_or_404(codigo):
    r = get_db().execute("SELECT * FROM instalacoes WHERE codigo=?", (codigo,)).fetchone()
    if not r:
        abort(404)
    u = g.user
    if u["perfil"] == "tecnico" and r["tecnico_id"] != u["id"]:
        abort(404)                                        # não revela existência
    if u["perfil"] == "projetos":
        l = get_db().execute("SELECT status FROM laudos WHERE instalacao_id=?", (r["id"],)).fetchone()
        if not l or l["status"] != rules.DISPONIVEL:
            abort(404)
    return r


_fails: dict = {}


def throttled(key) -> bool:
    now = time.time()
    _fails[key] = [t for t in _fails.get(key, []) if now - t < 300]
    return len(_fails[key]) >= 5


# ------------------------------------------------------------------ autenticação
@app.get("/api/health")
def health():
    return jsonify(ok=True, ts=services.now_ms(), demo=DEMO, drive=drive is not None)


@app.get("/api/login-options")
def login_options():
    """Só em modo demo: lista de usuários para o seletor da tela de login."""
    if not DEMO:
        return jsonify(demo=False, users=[])
    rows = get_db().execute("SELECT id,nome,perfil FROM usuarios WHERE ativo=1 ORDER BY rowid").fetchall()
    return jsonify(demo=True, senha=seed.DEMO_PASSWORD, users=[dict(r) for r in rows])


@app.post("/api/login")
def login():
    d = request.get_json(silent=True) or {}
    uid, senha = str(d.get("id", "")).strip(), str(d.get("senha", ""))
    key = (request.remote_addr, uid)
    if throttled(key):
        return jsonify(error="Muitas tentativas. Aguarde alguns minutos."), 429
    u = get_db().execute("SELECT * FROM usuarios WHERE id=? AND ativo=1", (uid,)).fetchone()
    if not u or not check_password_hash(u["senha_hash"], senha):
        _fails.setdefault(key, []).append(time.time())
        return jsonify(error="Usuário ou senha inválidos"), 401
    session.clear()
    session.permanent = True
    session["uid"] = u["id"]
    return jsonify(id=u["id"], nome=u["nome"], perfil=u["perfil"])


@app.post("/api/logout")
def logout():
    session.clear()
    return jsonify(ok=True)


@app.get("/api/me")
@auth()
def me():
    return jsonify(g.user)


# ------------------------------------------------------------------ ROI / laudos
@app.get("/api/roi")
@auth()
def list_roi():
    db, u = get_db(), g.user
    sql, args = "SELECT i.* FROM instalacoes i JOIN laudos l ON l.instalacao_id=i.id", []
    if u["perfil"] == "tecnico":
        sql += " WHERE i.tecnico_id=?"; args.append(u["id"])
    elif u["perfil"] == "projetos":
        sql += " WHERE l.status=?"; args.append(rules.DISPONIVEL)
    rows = db.execute(sql + " ORDER BY i.encerrado_em DESC LIMIT 500", args).fetchall()
    return jsonify([services.roi_json(db, r, photos=False) for r in rows])


@app.get("/api/roi/<codigo>")
@auth()
def get_roi(codigo):
    return jsonify(services.roi_json(get_db(), get_roi_or_404(codigo)))


@app.post("/api/roi")
@auth("tecnico")
def post_roi():
    """Sincronização do app: multipart com `data` (JSON), `assinatura` e, por slot, `orig_<slot>` / `mark_<slot>`."""
    try:
        data = json.loads(request.form.get("data", ""))
    except ValueError:
        raise services.ApiError("JSON inválido em 'data'")
    photos = {}
    for slot in rules.ALL_SLOTS:
        m, o = request.files.get(f"mark_{slot}"), request.files.get(f"orig_{slot}")
        if not m:
            continue
        mb = m.read()
        if services.sniff_ext(mb) not in ("jpg", "png", "webp"):
            raise services.ApiError(f"Imagem inválida: {slot}", 415)
        ob = o.read() if o else None
        if ob is not None and services.sniff_ext(ob) is None:
            raise services.ApiError(f"Original inválido: {slot}", 415)
        meta = (data.get("fotos") or {}).get(slot, {})
        photos[slot] = {"mark": mb, "orig": ob, "ts": meta.get("ts"), "lat": meta.get("lat"), "lng": meta.get("lng")}
    sig = request.files.get("assinatura")
    db = get_db()
    iid, codigo, dup = services.create_installation(db, storage, g.user, data, photos, sig.read() if sig else None,
                                                    str(data.get("clientId") or "")[:64] or None)
    if not dup:
        services.push_to_drive(db, storage, drive, iid)
    r = db.execute("SELECT * FROM instalacoes WHERE id=?", (iid,)).fetchone()
    return jsonify(services.roi_json(db, r)), (200 if dup else 201)


@app.put("/api/roi/<codigo>/laudo")
@auth("gestao")
def put_laudo(codigo):
    db, r = get_db(), get_roi_or_404(codigo)
    l = db.execute("SELECT * FROM laudos WHERE instalacao_id=?", (r["id"],)).fetchone()
    if l["status"] == rules.DISPONIVEL:
        raise services.ApiError("Laudo já validado — não pode mais ser editado", 409)
    d = request.get_json(silent=True) or {}
    tec, est = json.loads(l["tec"]), json.loads(l["est"])
    for cur, new in ((tec, d.get("tec")), (est, d.get("est"))):
        if new is None:
            continue
        if not isinstance(new, list) or len(new) != len(cur) or not all(isinstance(x.get("ok"), bool) for x in new):
            raise services.ApiError("Checklist inválido", 422)
        for c, n in zip(cur, new):
            c["ok"] = n["ok"]
    obs, termo = str(d.get("obs", l["obs"]))[:5000], str(d.get("termo", l["termo"]))[:5000]
    if not termo.strip():
        raise services.ApiError("O termo de aceite não pode ficar vazio", 422)
    db.execute("UPDATE laudos SET tec=?, est=?, obs=?, termo=? WHERE instalacao_id=?", (json.dumps(tec), json.dumps(est), obs, termo, r["id"]))
    services.log_event(db, r["id"], g.user["id"], "LEI_EDITADO")
    db.commit()
    return jsonify(services.roi_json(db, r, photos=False)["lei"])


@app.post("/api/roi/<codigo>/laudo/validar")
@auth("gestao")
def validar(codigo):
    db, r = get_db(), get_roi_or_404(codigo)
    l = db.execute("SELECT status FROM laudos WHERE instalacao_id=?", (r["id"],)).fetchone()
    if l["status"] == rules.DISPONIVEL:
        raise services.ApiError("Laudo já validado", 409)
    services.validate_lei(db, r, g.user)
    return jsonify(services.roi_json(db, r, photos=False)["lei"])


@app.get("/api/roi/<codigo>/foto/<slot>")
@auth()
def foto(codigo, slot):
    if slot not in rules.ALL_SLOTS:
        abort(404)
    r = get_roi_or_404(codigo)
    f = get_db().execute("SELECT * FROM fotos WHERE instalacao_id=? AND slot=?", (r["id"], slot)).fetchone()
    if not f:
        abort(404)
    orig = request.args.get("v") == "orig" and f["arquivo_orig"]
    p = storage.path(f["arquivo_orig"] if orig else f["arquivo_marca"])
    resp = send_file(p, mimetype=services.MIME.get(p.suffix[1:], "application/octet-stream"),
                     as_attachment=bool(orig), download_name=f"{codigo}-{slot}{p.suffix}")
    return resp


@app.get("/api/roi/<codigo>/assinatura")
@auth()
def assinatura(codigo):
    r = get_roi_or_404(codigo)
    if not r["aceite_assinatura"]:
        abort(404)
    return send_file(storage.path(r["aceite_assinatura"]), mimetype="image/png")


@app.get("/api/cms/<serie>")
@auth("tecnico", "adm")
def cms_lookup(serie):
    try:
        data = cms.lookup(serie[:40], DEMO)
    except NotImplementedError as e:
        return jsonify(error=str(e)), 501
    if not data:
        return jsonify(error="Nº de série não encontrado no CMS"), 404
    return jsonify(data)


@app.get("/api/usuarios")
@auth("adm")
def usuarios():
    return jsonify([dict(u) for u in get_db().execute("SELECT id,nome,perfil,ativo FROM usuarios ORDER BY rowid")])


@app.post("/api/admin/drive/retry")
@auth("adm")
def drive_retry():
    if drive is None:
        raise services.ApiError("Google Drive não configurado", 409)
    db = get_db()
    ids = [r["id"] for r in db.execute("SELECT id FROM instalacoes WHERE drive_status='pendente'")]
    for i in ids:
        services.push_to_drive(db, storage, drive, i)
    return jsonify(reenviados=len(ids))


# ------------------------------------------------------------------ front estático (lista branca: nunca expõe backend/ nem instance/)
STATIC_DIRS = {"css", "js", "vendor"}
STATIC_FILES = {"sw.js", "manifest.webmanifest", "icon.svg"}


@app.get("/")
def index():
    return send_from_directory(ROOT, "index.html", max_age=0)


@app.get("/<path:p>")
def static_files(p):
    if p in STATIC_FILES:
        return send_from_directory(ROOT, p, max_age=0)
    top, _, rest = p.partition("/")
    if top in STATIC_DIRS and rest:
        # confina DENTRO da subpasta pública: `js/../backend/x` não escapa (send_from_directory valida contra esta base)
        return send_from_directory(ROOT / top, rest, max_age=0)
    abort(404)


# ------------------------------------------------------------------ CLI
def cli():
    ap = argparse.ArgumentParser(description="Servidor do Projeto Fênix")
    ap.add_argument("--host", default=os.environ.get("FENIX_HOST", "127.0.0.1"))
    ap.add_argument("--port", type=int, default=int(os.environ.get("FENIX_PORT", "5000")))
    ap.add_argument("--create-user", nargs=3, metavar=("ID", "NOME", "PERFIL"), help="cria usuário e pede a senha")
    ap.add_argument("--passwd", metavar="ID", help="redefine a senha de um usuário")
    a = ap.parse_args()
    if a.create_user or a.passwd:
        with app.app_context():
            db = get_db()
            pw = getpass.getpass("Senha: ")
            if len(pw) < 8:
                raise SystemExit("Use ao menos 8 caracteres.")
            if a.create_user:
                uid, nome, perfil = a.create_user
                if perfil not in rules.PERFIS:
                    raise SystemExit(f"Perfil inválido. Use: {', '.join(rules.PERFIS)}")
                db.execute("INSERT INTO usuarios(id,nome,perfil,senha_hash) VALUES(?,?,?,?)", (uid, nome, perfil, generate_password_hash(pw)))
            else:
                db.execute("UPDATE usuarios SET senha_hash=? WHERE id=?", (generate_password_hash(pw), a.passwd))
            db.commit()
        print("OK")
        return
    print(f"\n  Projeto Fenix rodando em http://{'localhost' if a.host in ('127.0.0.1', '0.0.0.0') else a.host}:{a.port}"
          f"   (demo={'sim' if DEMO else 'nao'}, drive={'ativo' if drive else 'desativado'})\n")
    app.run(host=a.host, port=a.port, threaded=True, debug=False)


if __name__ == "__main__":
    cli()
