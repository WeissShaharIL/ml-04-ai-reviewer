param(
    [string]$Action = "up"
)

$ErrorActionPreference = "Stop"

function Write-Step ($msg) {
    Write-Host "`n> $msg" -ForegroundColor Cyan
}

function Write-Success ($msg) {
    Write-Host "OK $msg" -ForegroundColor Green
}

function Write-Fail ($msg) {
    Write-Host "FAIL $msg" -ForegroundColor Red
}

function Init-Dirs {
    Write-Step "Initializing data directories..."
    $dirs = @("data/sqlite", "data/ollama")
    foreach ($dir in $dirs) {
        if (-not (Test-Path $dir)) {
            New-Item -ItemType Directory -Path $dir -Force | Out-Null
            Write-Host "  created $dir" -ForegroundColor DarkGray
        }
    }
    Write-Success "Data directories ready"
}

switch ($Action) {

    "up" {
        Init-Dirs
        Write-Step "Building and starting all services..."
        docker compose up --build -d
        if ($LASTEXITCODE -ne 0) { Write-Fail "docker compose up failed"; exit 1 }
        Write-Success "All services running"
        Write-Host ""
        Write-Host "  Reviewer Dashboard ->  http://localhost:3001" -ForegroundColor Yellow
        Write-Host "  Reviewer API       ->  http://localhost:8000/docs" -ForegroundColor Yellow
        Write-Host "  Ollama             ->  http://localhost:11434" -ForegroundColor Yellow
    }

    "down" {
        Write-Step "Stopping all services..."
        docker compose down
        if ($LASTEXITCODE -ne 0) { Write-Fail "docker compose down failed"; exit 1 }
        Write-Success "All services stopped"
    }

    "restart" {
        Write-Step "Restarting all services..."
        docker compose down
        docker compose up --build -d
        if ($LASTEXITCODE -ne 0) { Write-Fail "Restart failed"; exit 1 }
        Write-Success "All services restarted"
    }

    "logs" {
        docker compose logs -f
    }

    "status" {
        docker compose ps
    }

    "clean" {
        Write-Step "Stopping services and removing volumes..."
        $confirm = Read-Host "This will delete all data. Continue? (y/N)"
        if ($confirm -ne "y") { Write-Host "Aborted."; exit 0 }
        docker compose down -v
        Remove-Item -Recurse -Force data/ -ErrorAction SilentlyContinue
        Write-Success "Clean complete"
    }

    default {
        Write-Host "Usage: .\build.ps1 [up|down|restart|logs|status|clean]"
        Write-Host ""
        Write-Host "  up       Build and start all services (default)"
        Write-Host "  down     Stop all services"
        Write-Host "  restart  Rebuild and restart all services"
        Write-Host "  logs     Tail logs from all services"
        Write-Host "  status   Show running containers"
        Write-Host "  clean    Stop, remove volumes, and delete data/"
    }
}

