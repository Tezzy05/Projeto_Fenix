@echo off
rem ============================================================
rem  Projeto Fenix - inicia o servidor Flask (demonstracao)
rem
rem  iniciar_servidor.bat          -> so neste computador (localhost)
rem  iniciar_servidor.bat lan      -> tambem acessivel por celulares na mesma rede
rem  iniciar_servidor.bat reset    -> apaga os dados da demo e recomeca do zero
rem
rem  Senha de todos os usuarios de demonstracao: fenix123
rem ============================================================
setlocal
cd /d "%~dp0"
title Projeto Fenix - Servidor
chcp 65001 >nul

if /i "%~1"=="reset" goto :reset
if /i "%~1"=="lan" set "FENIX_HOST=0.0.0.0"
if not defined FENIX_HOST set "FENIX_HOST=127.0.0.1"
if not defined FENIX_PORT set "FENIX_PORT=5000"
if not defined FENIX_DEMO set "FENIX_DEMO=1"

set "PYEXE="
where python >nul 2>&1 && set "PYEXE=python"
if not defined PYEXE (
  py -3 --version >nul 2>&1 && set "PYEXE=py -3"
)
if not defined PYEXE (
  echo.
  echo  [ERRO] Python nao encontrado. Instale em https://www.python.org/downloads/
  echo         ^(marque "Add python.exe to PATH" na instalacao^) e rode este arquivo de novo.
  echo.
  pause
  exit /b 1
)

rem  Um .venv copiado de outro computador aponta para o Python da maquina antiga e nao funciona
rem  aqui (nao e portatil). Se estiver quebrado, apaga e recria automaticamente.
if exist ".venv\Scripts\python.exe" (
  ".venv\Scripts\python.exe" --version >nul 2>&1
  if errorlevel 1 (
    echo  Ambiente virtual de outro computador detectado e quebrado. Recriando...
    rmdir /s /q ".venv"
  )
)

if not exist ".venv\Scripts\python.exe" (
  echo  Criando ambiente virtual ^(so na primeira vez neste computador^)...
  %PYEXE% -m venv .venv
  if errorlevel 1 goto :falha
  if exist ".venv\deps.ok" del ".venv\deps.ok"
)

if not exist ".venv\deps.ok" (
  echo  Instalando dependencias ^(so na primeira vez^)...
  ".venv\Scripts\python.exe" -m pip install --disable-pip-version-check -q -r backend\requirements.txt
  if errorlevel 1 goto :falha
  if defined FENIX_DRIVE_CREDENTIALS (
    ".venv\Scripts\python.exe" -m pip install --disable-pip-version-check -q -r backend\requirements-drive.txt
    if errorlevel 1 goto :falha
  )
  echo ok> ".venv\deps.ok"
)

echo.
echo  ------------------------------------------------------------
echo   Projeto Fenix  -  http://localhost:%FENIX_PORT%
if /i "%FENIX_HOST%"=="0.0.0.0" (
  echo   Na rede local, abra no celular:
  for /f "tokens=2 delims=:" %%a in ('ipconfig ^| findstr /c:"IPv4"') do for /f "tokens=*" %%b in ("%%a") do echo     http://%%b:%FENIX_PORT%
  echo   ^(GPS e instalacao como app so funcionam em HTTPS; sem isso a foto sai com "GPS indisponivel"^)
)
echo   Login demo: escolha o usuario  /  senha: fenix123
echo   Para encerrar: Ctrl+C
echo  ------------------------------------------------------------
echo.

start "" cmd /c "ping -n 4 127.0.0.1 >nul & start http://localhost:%FENIX_PORT%"
".venv\Scripts\python.exe" backend\app.py --host %FENIX_HOST% --port %FENIX_PORT%
echo.
echo  Servidor encerrado.
pause
exit /b 0

:reset
echo.
echo  Isto apaga o banco e as fotos da DEMONSTRACAO em backend\instance.
choice /c SN /n /m " Confirmar? [S/N] "
if errorlevel 2 exit /b 0
if exist "backend\instance" rmdir /s /q "backend\instance"
echo  Dados da demo apagados. Rode o arquivo novamente sem parametros.
pause
exit /b 0

:falha
echo.
echo  [ERRO] Nao foi possivel preparar o ambiente. Verifique a conexao com a internet e tente de novo.
pause
exit /b 1
