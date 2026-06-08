# Script Viewer PowerShell fixture
$env:SCRIPT_HOME = "./scripts"

function Sync-Workspace {
  param([string]$Path)
  Invoke-WebRequest -Uri "https://example.invalid/check" -OutFile "$Path/out.txt"
}

Set-StrictMode -Version Latest
