$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..\public")
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 0)
$listener.Start()
$port = $listener.LocalEndpoint.Port
$listener.Stop()

$proc = Start-Process -FilePath python -ArgumentList @("-m", "http.server", "$port", "--bind", "127.0.0.1") -WorkingDirectory $root -WindowStyle Hidden -PassThru

try {
  $base = "http://127.0.0.1:$port"
  $ready = $false
  for ($i = 0; $i -lt 30; $i++) {
    try {
      Invoke-WebRequest -Uri "$base/" -UseBasicParsing -TimeoutSec 2 | Out-Null
      $ready = $true
      break
    } catch {
      Start-Sleep -Milliseconds 300
    }
  }
  if (-not $ready) { throw "Smoke server did not start." }

  $checks = @(
    @{ Url = "$base/"; Text = "Stay@Maredumilli" },
    @{ Url = "$base/admin.html"; Text = "Super Admin Portal" },
    @{ Url = "$base/owner.html"; Text = "Owner Portal" },
    @{ Url = "$base/book.html?room=test"; Text = "Stay@Maredumilli" },
    @{ Url = "$base/hotels/pushpa/"; Text = "Pushpa" }
  )

  foreach ($check in $checks) {
    $html = (Invoke-WebRequest -Uri $check.Url -UseBasicParsing -TimeoutSec 10).Content
    if ($html -notmatch [regex]::Escape($check.Text)) {
      throw "Smoke failed for $($check.Url)"
    }
  }

  "Local smoke passed"
} finally {
  Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
}
