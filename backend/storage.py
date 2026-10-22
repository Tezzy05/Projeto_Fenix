"""Armazenamento de arquivos: disco local (sempre) + Google Drive (opcional, via Service Account).

Drive: defina FENIX_DRIVE_CREDENTIALS (JSON da Service Account) e FENIX_DRIVE_FOLDER_ID (pasta/Unidade compartilhada).
Service Accounts não têm cota própria: a pasta deve estar em uma Unidade Compartilhada (Shared Drive) ou o upload falha.
"""
import os
import re
from pathlib import Path


class LocalStorage:
    def __init__(self, base: Path):
        self.base = Path(base)
        self.base.mkdir(parents=True, exist_ok=True)

    def path(self, rel: str) -> Path:
        p = (self.base / rel).resolve()
        if self.base.resolve() not in p.parents:      # bloqueia path traversal
            raise ValueError("caminho inválido")
        return p

    def save(self, rel: str, data: bytes) -> str:
        p = self.path(rel)
        p.parent.mkdir(parents=True, exist_ok=True)
        p.write_bytes(data)
        return rel

    def delete_tree(self, rel_dir: str):
        import shutil
        shutil.rmtree(self.path(rel_dir), ignore_errors=True)


class DriveStorage:
    """Envia as fotos originais para uma subpasta por ROI e devolve os IDs."""

    def __init__(self, credentials_path: str, folder_id: str):
        from google.oauth2 import service_account          # import tardio: dependência opcional
        from googleapiclient.discovery import build
        creds = service_account.Credentials.from_service_account_file(credentials_path, scopes=["https://www.googleapis.com/auth/drive"])
        self.svc = build("drive", "v3", credentials=creds, cache_discovery=False)
        self.root = folder_id

    def _folder(self, name: str) -> str:
        safe = re.sub(r"[^A-Za-z0-9_.-]", "_", name)
        q = f"name = '{safe}' and '{self.root}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false"
        r = self.svc.files().list(q=q, fields="files(id)", supportsAllDrives=True, includeItemsFromAllDrives=True).execute()
        if r.get("files"):
            return r["files"][0]["id"]
        meta = {"name": safe, "mimeType": "application/vnd.google-apps.folder", "parents": [self.root]}
        return self.svc.files().create(body=meta, fields="id", supportsAllDrives=True).execute()["id"]

    def upload_many(self, folder_name: str, files: list[tuple[str, bytes, str]]):
        """files: [(nome, bytes, mime)] -> (folder_id, {nome: file_id})"""
        from googleapiclient.http import MediaInMemoryUpload
        folder = self._folder(folder_name)
        ids = {}
        for name, data, mime in files:
            media = MediaInMemoryUpload(data, mimetype=mime, resumable=False)
            f = self.svc.files().create(body={"name": name, "parents": [folder]}, media_body=media, fields="id", supportsAllDrives=True).execute()
            ids[name] = f["id"]
        return folder, ids


def make_drive():
    cred, folder = os.environ.get("FENIX_DRIVE_CREDENTIALS"), os.environ.get("FENIX_DRIVE_FOLDER_ID")
    if not (cred and folder):
        return None
    try:
        return DriveStorage(cred, folder)
    except Exception as e:                                   # noqa: BLE001
        print(f"[drive] desativado: {e}")
        return None
