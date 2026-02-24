$repoRoot = "N:\Coding (backup)"
$nodeExe = "C:\Program Files\nodejs\node.exe"
$viteScript = Join-Path $repoRoot "node_modules\vite\bin\vite.js"
$stdoutLog = Join-Path $repoRoot "devserver.log"
$stderrLog = Join-Path $repoRoot "devserver.err.log"

if (-not (Test-Path $nodeExe)) {
  throw "Node executable not found at: $nodeExe"
}
if (-not (Test-Path $viteScript)) {
  throw "Vite entrypoint not found at: $viteScript"
}

$proc = Start-Process `
  -FilePath $nodeExe `
  -ArgumentList @("`"$viteScript`"", "--host", "127.0.0.1", "--port", "5173") `
  -WorkingDirectory $repoRoot `
  -WindowStyle Hidden `
  -RedirectStandardOutput $stdoutLog `
  -RedirectStandardError $stderrLog `
  -PassThru

Write-Output ("Started Vite dev server PID: {0}" -f $proc.Id)
