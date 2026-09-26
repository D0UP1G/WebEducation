@echo off
setlocal
cd /d "%~dp0.." || exit /b 1

where docker >nul 2>nul
if errorlevel 1 (
    echo Docker CLI was not found. Start Docker Desktop first.
    exit /b 1
)
docker compose version >nul 2>nul
if errorlevel 1 (
    echo Docker Compose v2 is unavailable. Start or update Docker Desktop.
    exit /b 1
)

if not exist ".env" (
    copy /Y ".env.example" ".env" >nul
    if errorlevel 1 exit /b 1
    echo Created .env from .env.example.
)

docker compose up --build --detach --wait --wait-timeout 180
if errorlevel 1 (
    echo Compose could not start the demo. Current containers and recent logs:
    docker compose ps --all
    docker compose logs --no-color --tail=60
    exit /b 1
)

docker compose exec -T web python manage.py seed_demo
if errorlevel 1 exit /b 1

echo Demo is ready at http://localhost:8080/ unless PROXY_PORT was changed in .env.
echo Demo accounts use password: demo
echo Stop the stack with: docker compose down
