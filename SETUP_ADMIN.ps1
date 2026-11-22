$ErrorActionPreference = 'Stop'
# Generate cryptographically random URL-safe credentials without ambiguous characters.
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
$bytes = New-Object byte[] 24
$secretBytes = New-Object byte[] 48
$rng.GetBytes($bytes)
$rng.GetBytes($secretBytes)
$rng.Dispose()
$alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
$pw = -join ($bytes | ForEach-Object { $alphabet[([int]$_) % $alphabet.Length] })
$jwt = [Convert]::ToBase64String($secretBytes).TrimEnd('=').Replace('+','x').Replace('/','y')
$lines = @(
 'PORT=3000',
 'NODE_ENV=development',
 "JWT_SECRET=$jwt",
 'ADMIN_USERNAME=admin',
 "ADMIN_PASSWORD=$pw",
 'DATABASE_FILE=./db/rahul-mart.sqlite'
)
Set-Content -Path (Join-Path $PSScriptRoot '.env') -Value $lines -Encoding ascii
Write-Host ''
Write-Host 'Admin username: admin' -ForegroundColor Green
Write-Host "Admin password: $pw" -ForegroundColor Yellow
Write-Host 'Credentials have been saved in the local .env file and will be synchronized into the database when server starts.' -ForegroundColor Yellow
Write-Host 'Save these credentials now; the password will not be shown again.' -ForegroundColor Yellow
Write-Host ''
