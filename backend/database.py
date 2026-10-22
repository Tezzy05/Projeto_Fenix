"""SQLite (stdlib). Em produção no PythonAnywhere pode ser trocado por MySQL sem mudar as rotas (só esta camada)."""
import sqlite3
from flask import g, current_app

SCHEMA = """
CREATE TABLE IF NOT EXISTS usuarios(
  id TEXT PRIMARY KEY, nome TEXT NOT NULL,
  perfil TEXT NOT NULL CHECK(perfil IN ('tecnico','gestao','projetos','adm','consulta')),
  senha_hash TEXT NOT NULL, ativo INTEGER NOT NULL DEFAULT 1);

CREATE TABLE IF NOT EXISTS instalacoes(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  codigo TEXT UNIQUE NOT NULL,
  client_uuid TEXT UNIQUE,
  tecnico_id TEXT NOT NULL REFERENCES usuarios(id),
  tecnico_nome TEXT NOT NULL,
  cliente TEXT NOT NULL, ambiente TEXT NOT NULL, endereco TEXT NOT NULL, localizacao TEXT NOT NULL,
  iniciado_em INTEGER, encerrado_em INTEGER NOT NULL, sincronizado_em INTEGER NOT NULL,
  serie TEXT NOT NULL, pin TEXT, apk TEXT,
  modem_op TEXT, modem_modelo TEXT, modem_imei TEXT, modem_ns TEXT,
  chip_op TEXT, chip_linha TEXT, chip_iccid TEXT,
  avaria INTEGER NOT NULL DEFAULT 0, obs TEXT NOT NULL DEFAULT '',
  aceite_nome TEXT, aceite_doc TEXT, aceite_assinatura TEXT,
  drive_pasta TEXT, drive_status TEXT NOT NULL DEFAULT 'desativado');
CREATE INDEX IF NOT EXISTS ix_inst_tecnico ON instalacoes(tecnico_id);

CREATE TABLE IF NOT EXISTS checklist(
  instalacao_id INTEGER NOT NULL REFERENCES instalacoes(id) ON DELETE CASCADE,
  item TEXT NOT NULL, ok INTEGER NOT NULL, obs TEXT NOT NULL DEFAULT '',
  PRIMARY KEY(instalacao_id, item));

CREATE TABLE IF NOT EXISTS fotos(
  instalacao_id INTEGER NOT NULL REFERENCES instalacoes(id) ON DELETE CASCADE,
  slot TEXT NOT NULL, arquivo_orig TEXT, arquivo_marca TEXT,
  ts INTEGER, lat REAL, lng REAL, drive_file_id TEXT,
  PRIMARY KEY(instalacao_id, slot));

CREATE TABLE IF NOT EXISTS laudos(
  instalacao_id INTEGER PRIMARY KEY REFERENCES instalacoes(id) ON DELETE CASCADE,
  status TEXT NOT NULL, tec TEXT NOT NULL, est TEXT NOT NULL, obs TEXT NOT NULL, termo TEXT NOT NULL,
  validado_por_id TEXT, validado_por TEXT, validado_em INTEGER, chave TEXT);

CREATE TABLE IF NOT EXISTS eventos(
  id INTEGER PRIMARY KEY AUTOINCREMENT, instalacao_id INTEGER, usuario_id TEXT,
  acao TEXT NOT NULL, detalhe TEXT, em INTEGER NOT NULL);
"""


def connect(path):
    con = sqlite3.connect(path, timeout=15)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys=ON")
    return con


def get_db():
    if "db" not in g:
        g.db = connect(current_app.config["DB_PATH"])
    return g.db


def close_db(_exc=None):
    con = g.pop("db", None)
    if con is not None:
        con.close()


def init_db(path):
    con = connect(path)
    con.executescript(SCHEMA)
    con.commit()
    con.close()
