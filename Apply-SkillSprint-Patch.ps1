param(
    [string]$TargetPath = (Join-Path $HOME 'Downloads\SkillSprint-Username-Splash-Update\SkillSprint-v4-auth-redesign'),
    [switch]$SkipInstall
)

$ErrorActionPreference = 'Stop'
$SourceRoot = $PSScriptRoot

$Files = @(
    'index.html',
    'package.json',
    'src\main.js',
    'src\lib\app-core.js',
    'src\lib\supabase.js',
    'src\styles\auth.css',
    'tests\progress.test.js',
    'tests\app-contract.test.js',
    '.env.example',
    'public\manifest.webmanifest',
    'public\icons\apple-touch-icon.png',
    'public\icons\icon-192.png',
    'public\icons\icon-512.png',
    'public\icons\icon-maskable-512.png',
    'README.md',
    'AUTH-EMAIL-SETUP.md'
)

if (!(Test-Path (Join-Path $TargetPath 'package.json'))) {
    throw "Existing SkillSprint project not found: $TargetPath. Pass -TargetPath with the folder containing package.json."
}

foreach ($RelativePath in $Files) {
    $SourcePath = Join-Path $SourceRoot $RelativePath
    if (!(Test-Path $SourcePath -PathType Leaf)) {
        throw "The patch archive is incomplete. Missing file: $RelativePath"
    }
}

$BackupRoot = Join-Path $HOME 'Downloads\SkillSprint-backups'
$BackupPath = Join-Path $BackupRoot (Get-Date -Format 'yyyyMMdd-HHmmss')
New-Item -ItemType Directory -Path $BackupPath -Force | Out-Null

# Back up only files that this installer will replace. User environment files are never touched.
foreach ($RelativePath in $Files) {
    $DestinationPath = Join-Path $TargetPath $RelativePath
    if (Test-Path $DestinationPath -PathType Leaf) {
        $BackupFile = Join-Path $BackupPath $RelativePath
        New-Item -ItemType Directory -Path (Split-Path $BackupFile -Parent) -Force | Out-Null
        Copy-Item -LiteralPath $DestinationPath -Destination $BackupFile -Force
    }
}

$ExistingLock = Join-Path $TargetPath 'package-lock.json'
if (Test-Path $ExistingLock -PathType Leaf) {
    Copy-Item -LiteralPath $ExistingLock -Destination (Join-Path $BackupPath 'package-lock.json') -Force
}

foreach ($RelativePath in $Files) {
    $SourcePath = Join-Path $SourceRoot $RelativePath
    $DestinationPath = Join-Path $TargetPath $RelativePath
    New-Item -ItemType Directory -Path (Split-Path $DestinationPath -Parent) -Force | Out-Null
    Copy-Item -LiteralPath $SourcePath -Destination $DestinationPath -Force
}

Write-Host 'SkillSprint files have been updated in the existing project.' -ForegroundColor Green
Write-Host "Backup: $BackupPath" -ForegroundColor Yellow
Write-Host 'Your .env.local, .env and Supabase database were not changed.' -ForegroundColor Cyan

if ($SkipInstall) {
    Write-Host 'Skipped npm install and build because -SkipInstall was supplied.' -ForegroundColor Yellow
    exit 0
}

Set-Location $TargetPath
Write-Host 'Installing the pinned project dependencies…' -ForegroundColor Cyan
npm install
if ($LASTEXITCODE -ne 0) {
    throw 'npm install failed. Check your internet connection. The patch is applied and the backup is available.'
}

Write-Host 'Running syntax and unit tests…' -ForegroundColor Cyan
npm run check
if ($LASTEXITCODE -ne 0) {
    throw 'SkillSprint checks failed. The backup is available for rollback.'
}

Write-Host 'Building the production app…' -ForegroundColor Cyan
npm run build
if ($LASTEXITCODE -ne 0) {
    throw 'Vite production build failed. The backup is available for rollback.'
}

Write-Host 'SkillSprint update and production build completed successfully.' -ForegroundColor Green
Write-Host 'Run npm run dev to start the updated app.' -ForegroundColor Cyan
