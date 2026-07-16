# =============================================================================
# Genere les certificats HTTPS locaux auto-signes pour Traefik (docker compose).
# =============================================================================
# Traefik monte ./volumes/certs:/certs:ro et attend cert.pem + key.pem
# (voir traefik-dynamic.yml). Sans ces fichiers, le endpoint HTTPS (websecure)
# de Traefik ne demarre pas correctement.
#
# Usage (PowerShell, depuis la racine du depot) :
#   ./scripts/generate-local-certs.ps1
#
# Prerequis : OpenSSL disponible dans le PATH (Git pour Windows en fournit un,
# ou installez "openssl" via votre gestionnaire de paquets).
# =============================================================================

param(
    [string]$CertsDir = "./volumes/certs"
)

$ErrorActionPreference = "Stop"

# Verifie qu'OpenSSL est disponible.
$opensslCmd = $null
$nativeCmd = Get-Command openssl -ErrorAction SilentlyContinue
if ($nativeCmd) {
    $opensslCmd = $nativeCmd.Source
} else {
    # Tente le chemin habituel de Git pour Windows.
    $gitOpenssl = "C:\Program Files\Git\usr\bin\openssl.exe"
    if (Test-Path $gitOpenssl) {
        $opensslCmd = $gitOpenssl
    } else {
        Write-Error "OpenSSL introuvable dans le PATH. Installez Git pour Windows ou OpenSSL, puis relancez ce script."
        exit 1
    }
}

New-Item -ItemType Directory -Force -Path $CertsDir | Out-Null

$certPath = Join-Path $CertsDir "cert.pem"
$keyPath = Join-Path $CertsDir "key.pem"

Write-Host "Generation d'un certificat auto-signe pour localhost (valide 1 an)..."
& $opensslCmd req -x509 -newkey rsa:2048 -sha256 -nodes -days 365 `
    -keyout $keyPath `
    -out $certPath `
    -subj "/C=FR/ST=NA/L=NA/O=Dev Local/CN=localhost" `
    -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"

if ($LASTEXITCODE -eq 0) {
    Write-Host "OK : certificats generes dans $CertsDir" -ForegroundColor Green
    Write-Host "  - $certPath"
    Write-Host "  - $keyPath"
    Write-Host ""
    Write-Host "Note : navigateur affichera un avertissement (certificat auto-signe)."
    Write-Host "       Acceptez l'exception pour localhost en dev."
} else {
    Write-Error "Echec de la generation du certificat (code $LASTEXITCODE)."
    exit 1
}
