param([Parameter(Mandatory=$true)][string]$OutputDirectory)
$ErrorActionPreference = 'Stop'
$audioBuildPath = [IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Path $audioBuildPath -Force | Out-Null
$vsRoot = 'C:\Program Files (x86)\Microsoft Visual Studio\2019\BuildTools'
$compilerRoot = Join-Path $vsRoot 'VC\Tools\MSVC\14.29.30133'
$sdkRoot = 'C:\Program Files (x86)\Windows Kits\10'
$sdkVersion = '10.0.19041.0'
$env:INCLUDE = (@((Join-Path $compilerRoot 'include'),(Join-Path $sdkRoot "Include\$sdkVersion\ucrt"),(Join-Path $sdkRoot "Include\$sdkVersion\shared"),(Join-Path $sdkRoot "Include\$sdkVersion\um"),(Join-Path $sdkRoot "Include\$sdkVersion\winrt")) -join ';')
$env:LIB = (@((Join-Path $compilerRoot 'lib\x64'),(Join-Path $sdkRoot "Lib\$sdkVersion\ucrt\x64"),(Join-Path $sdkRoot "Lib\$sdkVersion\um\x64")) -join ';')
$captureSource = Join-Path $PSScriptRoot 'phase6-audio-capture.cpp'
$captureExe = Join-Path $audioBuildPath 'phase6-audio-capture.exe'
& (Join-Path $compilerRoot 'bin\Hostx64\x64\cl.exe') /nologo /W4 /EHsc /std:c++17 /MT $captureSource "/Fo$(Join-Path $audioBuildPath 'phase6-audio-capture.obj')" "/Fe$captureExe" /link Ole32.lib Mmdevapi.lib
if ($LASTEXITCODE -ne 0) { throw 'Audio capture helper compilation failed' }
Get-FileHash -LiteralPath $captureExe -Algorithm SHA256 | Select-Object Path,Hash
