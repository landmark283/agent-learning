# W4 · Cordis 实验场：一键验收
#
# 用法（在本目录下，Windows PowerShell 5.1 或 7 均可）：
#   powershell -ExecutionPolicy Bypass -File .\verify.ps1
#
# 任一实验非 0 退出 → 整体失败。退出码 0 表示 W4 动手部分全部通过。
# 注意：本文件必须保存为「UTF-8 带 BOM」，否则 PowerShell 5.1 会按 ANSI 读取，
# 中文变成乱码并导致语法错误。

$ErrorActionPreference = 'Continue'

# PATH 首项 C:\nvm4w\nodejs\node.exe 可能是悬空 shim，这里挑一个真实存在的 node
$node = (Get-Command node -All -ErrorAction SilentlyContinue |
  Where-Object { Test-Path $_.Source } |
  Select-Object -First 1).Source
if (-not $node) {
  Write-Host '找不到可用的 node，请手动指定路径（如 D:\nvm\v22.19.0\node.exe）' -ForegroundColor Red
  exit 1
}
Write-Host ('使用 node: ' + $node) -ForegroundColor DarkGray
Write-Host ''

$scripts = @(
  '01-minimal.mjs',
  '02-reversible.mjs',
  '03-events.mjs',
  '04-config-and-isolate.mjs',
  'run.mjs'
)

$failedList = @()
foreach ($s in $scripts) {
  Write-Host ('-------- ' + $s + ' --------') -ForegroundColor Cyan
  & $node $s
  if ($LASTEXITCODE -ne 0) { $failedList += $s }
}

Write-Host ''
if ($failedList.Count -eq 0) {
  Write-Host 'W4 验收通过：5 个脚本全部成功' -ForegroundColor Green
  exit 0
} else {
  $joined = $failedList -join ', '
  Write-Host ('以下脚本失败：' + $joined) -ForegroundColor Red
  exit 1
}
