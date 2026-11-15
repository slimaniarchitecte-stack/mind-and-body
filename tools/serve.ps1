# Mind and Body: tiny local web server (PowerShell only, nothing to install).
#
# Run it from the project folder:
#     powershell -ExecutionPolicy Bypass -File tools/serve.ps1
# Then open http://localhost:8080/ in your browser. Stop it with Ctrl+C.

param(
  [int]$Port = 8080,
  [string]$Root = (Split-Path -Parent $PSScriptRoot)
)

$Root = (Resolve-Path $Root).Path.TrimEnd('\')

$mime = @{
  '.html' = 'text/html; charset=utf-8'
  '.js' = 'text/javascript; charset=utf-8'
  '.css' = 'text/css; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.webmanifest' = 'application/manifest+json; charset=utf-8'
  '.svg' = 'image/svg+xml'
  '.png' = 'image/png'
  '.jpg' = 'image/jpeg'
  '.ico' = 'image/x-icon'
  '.woff2' = 'font/woff2'
  '.ics' = 'text/calendar; charset=utf-8'
  '.txt' = 'text/plain; charset=utf-8'
  '.md' = 'text/plain; charset=utf-8'
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Mind and Body is running at http://localhost:$Port/  (Ctrl+C to stop)"

try {
  while ($listener.IsListening) {
    # Wait in short slices so Ctrl+C works.
    $task = $listener.GetContextAsync()
    while (-not $task.AsyncWaitHandle.WaitOne(200)) { }
    $context = $task.GetAwaiter().GetResult()
    $response = $context.Response
    try {
      $path = [System.Uri]::UnescapeDataString($context.Request.Url.AbsolutePath)
      $file = [System.IO.Path]::GetFullPath((Join-Path $Root $path.TrimStart('/')))
      if ((Test-Path $file -PathType Container)) { $file = Join-Path $file 'index.html' }

      $inside = $file.StartsWith($Root + '\', [System.StringComparison]::OrdinalIgnoreCase)
      if ($inside -and (Test-Path $file -PathType Leaf)) {
        $ext = [System.IO.Path]::GetExtension($file).ToLowerInvariant()
        $type = $mime[$ext]
        if (-not $type) { $type = 'application/octet-stream' }
        $bytes = [System.IO.File]::ReadAllBytes($file)
        $response.StatusCode = 200
        $response.ContentType = $type
        $response.Headers['Cache-Control'] = 'no-cache'
        $response.ContentLength64 = $bytes.Length
        if ($context.Request.HttpMethod -ne 'HEAD') {
          $response.OutputStream.Write($bytes, 0, $bytes.Length)
        }
      } else {
        $response.StatusCode = 404
        $msg = [System.Text.Encoding]::UTF8.GetBytes('Not found')
        $response.ContentType = 'text/plain; charset=utf-8'
        $response.OutputStream.Write($msg, 0, $msg.Length)
      }
      Write-Host "$($response.StatusCode) $path"
    } catch {
      Write-Host "error: $($_.Exception.Message)"
    } finally {
      try { $response.Close() } catch { }
    }
  }
} finally {
  $listener.Stop()
}
