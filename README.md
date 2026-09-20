# Projeto Fênix — protótipo (Retorna Machine)

Protótipo navegável do fluxo **ROI → LEI → Check-in Fotográfico**, com visual inspirado em ambipar.com.

## Rodar
```
python -m http.server 5173 --directory fenix
```
Abra http://localhost:5173 (precisa de servidor: usa ES modules e service worker).

## Estrutura
- `js/data.js` — perfis, checklist, fotos, regras ROI→LEI, IndexedDB (`db.*`) e `syncAll()` (simulam a API Flask + Google Drive)
- `js/tecnico.js` — wizard do técnico (offline-first, marca d'água com data/hora/GPS, assinatura em canvas)
- `js/painel.js` — Visão geral, Laudos, editor/validação do LEI, Projetos, Fotos/Check-in, Usuários
- `js/docs.js` — HTML do LEI, ROI e slides do Check-in; impressão → "Salvar como PDF"
- `js/scene.js` — three.js (floresta low-poly do login)
- Animações: GSAP (entradas, marca-texto, scroll), Motion (springs, toggles), anime.js (hexágonos, contadores, check)
- `vendor/` — bibliotecas locais (funcionam offline)

## Pendências para o produto real
- Backend Flask no PythonAnywhere: autenticação por perfil, `POST /api/roi` (sync), tabelas instalações/checklist/fotos/usuários
- Upload das fotos originais via Google Drive API (Service Account) e link no ROI
- PDF no servidor (WeasyPrint/ReportLab) em vez de `window.print()`
- Consulta ao CMS real pelo Nº de Série (hoje é um dicionário fictício em `CMS`)
- Trocar o wordmark provisório pelo SVG oficial da Ambipar e a fonte Exo 2 pela Neo Sans licenciada
