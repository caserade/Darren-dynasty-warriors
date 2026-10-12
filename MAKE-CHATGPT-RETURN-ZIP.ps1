$ErrorActionPreference = 'Stop'
$projectRoot = $PSScriptRoot
$staging = Join-Path ([System.IO.Path]::GetTempPath()) ('DarrenReturn-' + [guid]::NewGuid().ToString('N'))
$stageRoot = Join-Path $staging 'Darren-Dynasty-Warriors-Game'
New-Item -ItemType Directory -Path $stageRoot | Out-Null
try {
    & node (Join-Path $projectRoot 'tools/stage-return-package.cjs') $stageRoot
    if ($LASTEXITCODE -ne 0) { throw 'Safe package staging failed; no ZIP was created.' }
    $name = 'Darren-Dynasty-Warriors-ChatGPT-Return-' + (Get-Date -Format 'yyyyMMdd-HHmmss') + '.zip'
    $zip = Join-Path (Split-Path $projectRoot -Parent) $name
    Compress-Archive -LiteralPath $stageRoot -DestinationPath $zip
    Write-Host "Created: $zip"
} finally {
    Remove-Item -LiteralPath $staging -Recurse -Force
}
