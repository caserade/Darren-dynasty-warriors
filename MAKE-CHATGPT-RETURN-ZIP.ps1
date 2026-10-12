$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$staging = Join-Path ([System.IO.Path]::GetTempPath()) ('DarrenReturn-' + [guid]::NewGuid().ToString('N'))
$stageRoot = Join-Path $staging 'Darren-Dynasty-Warriors-Game'
New-Item -ItemType Directory -Path $stageRoot | Out-Null
try {
    Get-ChildItem -LiteralPath $projectRoot -Force | Where-Object {
        $_.Name -notin @('.git', 'node_modules', '.sites-runtime', '.env', '.env.local') -and
        $_.Name -notlike '.env.*' -and $_.Extension -ne '.zip'
    } | Copy-Item -Destination $stageRoot -Recurse -Force
    $name = 'Darren-Dynasty-Warriors-ChatGPT-Return-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.zip'
    $zip = Join-Path (Split-Path $projectRoot -Parent) $name
    Compress-Archive -LiteralPath $stageRoot -DestinationPath $zip
    Write-Host "Created: $zip"
} finally {
    Remove-Item -LiteralPath $staging -Recurse -Force
}
