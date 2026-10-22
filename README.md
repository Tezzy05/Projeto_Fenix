# Projeto Fênix — Retorna Machine

Fluxo **ROI → LEI → Check-in Fotográfico**: front mobile-first offline-first + backend Flask.

## Rodar a demonstração (Windows)
Dê dois cliques em **`iniciar_servidor.bat`** (ou rode no cmd). Na primeira vez ele cria o ambiente virtual e instala o Flask; depois abre http://localhost:5000.

| Comando | O que faz |
|---|---|
| `iniciar_servidor.bat` | sobe só em `localhost` |
| `iniciar_servidor.bat lan` | também acessível por celulares na mesma rede (mostra o IP) |
| `iniciar_servidor.bat reset` | apaga banco e fotos da demo (pede confirmação) |

Login demo: escolha o usuário; senha de todos = `fenix123` (só existe com `FENIX_DEMO=1`, que o `.bat` liga).

**Levando para outro computador:** copie a pasta inteira, mas **apague `.venv\` antes** (não é portátil — fica preso ao Python da máquina de origem). O `.bat` recria automaticamente na primeira execução; se esquecer de apagar, ele mesmo detecta um `.venv` quebrado ("did not find executable at...") e recria sozinho. Pode manter `backend\instance\` se quiser levar os dados já cadastrados.

**Roteiro sugerido de apresentação**
1. `tec1` (Técnico): preencha o ROI (botão `RM-2026-0147` preenche modem/chip via CMS), fotos, assinatura → concluir.
2. Ligue **Simular offline** (ou pare o servidor): conclua outro ROI → fica na "fila local"; volte a conexão → envia sozinho.
3. `pat` (Gestão): abra o laudo, altere checklist/observação, **Validar e assinar**.
4. `tha` (Projetos): baixe o LEI, veja/baixe as fotos originais, monte o Check-in Fotográfico.
5. `and` (ADM): usuários e matriz de permissões. `bia` (Consulta): somente leitura.

## Estrutura
```
iniciar_servidor.bat      # atalho da demo
index.html, css/, js/, vendor/, sw.js   # front (servido pelo Flask, só estas pastas — lista branca)
backend/
  app.py        # rotas da API + entrega do front + CLI
  services.py   # gravar ROI (idempotente), serializar, validar LEI
  rules.py      # checklist, ROI→LEI, validação do payload
  database.py   # SQLite (schema)
  storage.py    # disco local + Google Drive (opcional)
  cms.py        # consulta ao CMS (demo)
  seed.py       # usuários e laudos de exemplo
  instance/     # fenix.db, storage/, secret.key  (gerado; NÃO versionar)
```

## API (resumo)
| Rota | Perfil | Função |
|---|---|---|
| `POST /api/login`, `/api/logout`, `GET /api/me` | todos | sessão (cookie assinado, 30 dias) |
| `POST /api/roi` | tecnico | sincroniza ROI (multipart: `data` JSON + `assinatura` + `orig_<slot>`/`mark_<slot>`). Idempotente por `clientId` |
| `GET /api/roi`, `/api/roi/<cod>` | todos* | *técnico vê os seus; Projetos só laudos validados |
| `PUT /api/roi/<cod>/laudo` | gestao | edita checklist/obs/termo (bloqueado após validar) |
| `POST /api/roi/<cod>/laudo/validar` | gestao | gera chave de autenticação → `DISPONIVEL_PROJETOS` |
| `GET /api/roi/<cod>/foto/<slot>?v=marca\|orig`, `/assinatura` | conforme acesso | arquivos |
| `GET /api/cms/<serie>` | tecnico, adm | autopreenchimento (demo) |
| `GET /api/usuarios` | adm | lista |
| `POST /api/admin/drive/retry` | adm | reenvia ao Drive o que falhou |

## Produção no PythonAnywhere
1. Suba a pasta, crie o virtualenv e `pip install -r backend/requirements.txt` (+ `requirements-drive.txt` para o Drive).
2. WSGI: `sys.path.insert(0, '/home/USUARIO/fenix/backend'); from app import app as application`
3. Variáveis: **sem** `FENIX_DEMO`, `FENIX_SECRET=<aleatório longo>`, `FENIX_HTTPS=1`, `FENIX_DATA=/home/USUARIO/fenix_data`.
4. Crie os usuários: `python backend/app.py --create-user pat "Patrícia" gestao` (pede a senha). Redefinir: `--passwd pat`.
5. HTTPS é obrigatório em produção (GPS, câmera e PWA exigem contexto seguro; PythonAnywhere já fornece).
6. Limite de upload: `MAX_CONTENT_LENGTH` = 150 MB (7 originais + assinatura). Confirme o limite do plano.

## Google Drive (opcional)
`FENIX_DRIVE_CREDENTIALS=<caminho do JSON da Service Account>` e `FENIX_DRIVE_FOLDER_ID=<id da pasta>`.
Service Accounts não têm cota própria: a pasta precisa estar em uma **Unidade Compartilhada** (Shared Drive) da Ambipar, com a conta adicionada como membro. **Não testado** contra o Drive real (sem credenciais neste ambiente); a falha não derruba a sincronização — o ROI fica com `drive_status = pendente` e pode ser reenviado.

## Pendências
- PDF gerado no servidor (hoje: `window.print()` → "Salvar como PDF")
- CMS real (`backend/cms.py`) — hoje dados fictícios
- Cadastro/edição de usuários pela tela do ADM (hoje via CLI)
- Retenção das fotos (≥ 30 dias) e backup do `instance/`
- Trocar wordmark provisório pelo logo oficial e a fonte Exo 2 pela Neo Sans
