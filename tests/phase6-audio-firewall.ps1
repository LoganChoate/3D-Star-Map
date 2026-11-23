# Temporary, exact-program outbound block. This never changes adapters, DNS,
# firewall profiles, or pre-existing rules. Root must review and run explicitly.
#Requires -RunAsAdministrator
param([Parameter(Mandatory=$true)][string]$ApplicationExe,[Parameter(Mandatory=$true)][string]$OutputDirectory,[string]$CaptureExe,[switch]$ExternalCapture=$true)
$ErrorActionPreference='Stop'
$audioExe=[IO.Path]::GetFullPath($ApplicationExe)
$audioOutput=[IO.Path]::GetFullPath($OutputDirectory)
if (!(Test-Path -LiteralPath $audioExe -PathType Leaf)) {throw 'Application executable missing'}
if (Test-Path -LiteralPath $audioOutput) {throw 'Use a fresh audio evidence directory'}
New-Item -ItemType Directory -Path $audioOutput | Out-Null
$nodePath=if(!$ExternalCapture){(Get-Command node -ErrorAction Stop).Source}else{$null}
$hostScript=Join-Path $PSScriptRoot 'phase6-audio-host.cjs'
$probeScript=Join-Path $PSScriptRoot 'phase6-audio-network-probe.cjs'
$ruleName='GalaxyMapStep5Audio-'+[guid]::NewGuid().ToString('N')
$guardScript=Join-Path $PSScriptRoot 'phase6-audio-firewall-watchdog.ps1'
$guardStop=Join-Path $audioOutput 'watchdog-stop'
$captureDirectory=Join-Path $audioOutput 'capture'
$captureSignal=Join-Path $audioOutput 'capture-complete.json'
$proof=[ordered]@{status='running';executable=$audioExe;executableSha256=(Get-FileHash -LiteralPath $audioExe -Algorithm SHA256).Hash.ToLowerInvariant();ruleName=$ruleName;startedAt=[DateTime]::UtcNow.ToString('o');externalCapture=[bool]$ExternalCapture;captureDirectory=$captureDirectory;captureSignal=$captureSignal;method='Temporary exact-executable outbound deny, with same executable TCP positive/negative control. Only synthetic probe sends connection metadata; zero payload.';cleanupConfirmed=$false}
function Save-AudioProof { $proof | ConvertTo-Json -Depth 9 | Set-Content -LiteralPath (Join-Path $audioOutput 'network-isolation.json') -Encoding utf8 }
function Invoke-AudioProbe {
 $oldElectronFlag=$env:ELECTRON_RUN_AS_NODE
 $probeProcess=$null
 try {
  $env:ELECTRON_RUN_AS_NODE='1'
  # Wait explicitly for the GUI-subsystem Electron executable in Node mode;
  # shell invocation can otherwise return before the probe has produced evidence.
  $startInfo=New-Object Diagnostics.ProcessStartInfo
  $startInfo.FileName=$audioExe;$startInfo.Arguments='"'+$probeScript+'"'
  $startInfo.UseShellExecute=$false;$startInfo.CreateNoWindow=$true
  $startInfo.RedirectStandardOutput=$true;$startInfo.RedirectStandardError=$true
  $probeProcess=[Diagnostics.Process]::Start($startInfo)
  $stdoutTask=$probeProcess.StandardOutput.ReadToEndAsync();$stderrTask=$probeProcess.StandardError.ReadToEndAsync()
  if(!$probeProcess.WaitForExit(8000)){$probeProcess.Kill();throw 'Exact-executable network probe exceeded its deadline'}
  $probeText=$stdoutTask.GetAwaiter().GetResult();$probeError=$stderrTask.GetAwaiter().GetResult()
  $probeRecord=($probeText -split '\r?\n' | Where-Object {$_.StartsWith('{')} | Select-Object -Last 1) | ConvertFrom-Json
  if(!$probeRecord){throw 'Executable probe did not return JSON'}
  return @{exitCode=$probeProcess.ExitCode;result=$probeRecord;stderr=$probeError}
 }
 finally {if($probeProcess){$probeProcess.Dispose()};if($null -eq $oldElectronFlag){Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue}else{$env:ELECTRON_RUN_AS_NODE=$oldElectronFlag} }
}
try {
 $profiles=@(Get-NetFirewallProfile -PolicyStore ActiveStore | Select-Object Name,Enabled,DefaultOutboundAction)
 if(@($profiles | Where-Object {!$_.Enabled}).Count){throw 'A firewall profile is disabled; cannot claim dependable all-profile isolation'}
 $proof.profiles=$profiles;$proof.before=Invoke-AudioProbe
 if($proof.before.result.status -ne 'connected'){throw 'Positive TCP control failed before isolation; offline proof is inconclusive'}
 # Start the cleanup watchdog before adding the one new rule. It only removes this exact unique name.
 $watchArgs=@('-NoProfile','-File',('"'+$guardScript+'"'),'-RuleName',$ruleName,'-StopFile',('"'+$guardStop+'"'),'-ProofDirectory',('"'+$audioOutput+'"'))
 $watchdog=Start-Process -FilePath (Get-Process -Id $PID).Path -ArgumentList $watchArgs -WindowStyle Hidden -PassThru
 $rule=New-NetFirewallRule -Name $ruleName -DisplayName 'Galaxy Map Step 5 temporary audio offline check' -Description 'Temporary exact-program block; cleanup watchdog removes this rule within 180 seconds.' -Direction Outbound -Action Block -Program $audioExe -Protocol Any -Profile Any -Enabled True
 $proof.rule=Get-NetFirewallRule -Name $ruleName | Select-Object Name,Enabled,Direction,Action,Profile
 $proof.applicationFilter=Get-NetFirewallRule -Name $ruleName | Get-NetFirewallApplicationFilter | Select-Object Program
 $proof.blocked=Invoke-AudioProbe
 if($proof.blocked.result.status -ne 'blocked-or-unreachable'){throw 'Exact executable still connected after the outbound deny rule'}
 if($ExternalCapture){
  # Keep the GUI and recorder at the caller's normal permission level. Only this
  # wrapper's rule/probes/watchdog run elevated. The caller must signal both
  # success and failure; the bounded wait and watchdog still protect abandonment.
  $proof.externalCaptureReadyAt=[DateTime]::UtcNow.ToString('o')
  $proof.externalCaptureDeadlineAt=[DateTime]::UtcNow.AddSeconds(120).ToString('o')
  $proof.status='awaiting-external-capture';Save-AudioProof
  $captureWait=[Diagnostics.Stopwatch]::StartNew()
  while(!(Test-Path -LiteralPath $captureSignal -PathType Leaf) -and $captureWait.Elapsed.TotalSeconds -lt 120){
   $remainingMs=[Math]::Max(1,[Math]::Min(250,[int](120000-$captureWait.Elapsed.TotalMilliseconds)))
   Start-Sleep -Milliseconds $remainingMs
  }
  $captureWait.Stop();$proof.externalCaptureWaitSeconds=$captureWait.Elapsed.TotalSeconds
  if(!(Test-Path -LiteralPath $captureSignal -PathType Leaf)){throw 'External capture did not signal completion within 120 seconds'}
  $signal=Get-Content -Raw -LiteralPath $captureSignal | ConvertFrom-Json
  $proof.externalCaptureSignal=$signal;$proof.externalCaptureSignalObservedAt=[DateTime]::UtcNow.ToString('o')
  if($signal.ruleName -ne $ruleName){throw 'External capture signal does not identify this isolation run'}
  if($signal.status -ne 'success'){throw "External capture failed: $($signal.error)"}
 }else{
  Save-AudioProof
  $audioHostArgs=@($hostScript,"--exe=$audioExe","--output=$captureDirectory")
  if($CaptureExe){$audioHostArgs+="--capture=$([IO.Path]::GetFullPath($CaptureExe))"}
  & $nodePath @audioHostArgs
  if($LASTEXITCODE -ne 0){throw 'Actual application audio capture failed'}
 }
 # Never treat a caller's success signal alone as evidence of captured speech.
 # Read only the fixed expected artifact under this fresh run directory.
 $captureRecordPath=Join-Path $captureDirectory 'audio-host.json'
 $captureRecord=Get-Content -Raw -LiteralPath $captureRecordPath | ConvertFrom-Json
 if($captureRecord.status -ne 'captured'){throw 'Actual host artifact does not report captured'}
 if(![string]::Equals([IO.Path]::GetFullPath([string]$captureRecord.exe),$audioExe,[StringComparison]::OrdinalIgnoreCase)){throw 'Actual capture used a different executable'}
 if($captureRecord.exeSha256 -ne $proof.executableSha256){throw 'Actual capture executable hash differs from the isolated executable'}
 if($ExternalCapture){
  $captureStarted=[DateTimeOffset]::Parse([string]$captureRecord.startedAt).UtcDateTime
  $captureFinished=[DateTimeOffset]::Parse([string]$captureRecord.finishedAt).UtcDateTime
  if($captureStarted -lt [DateTimeOffset]::Parse($proof.externalCaptureReadyAt).UtcDateTime -or $captureFinished -lt $captureStarted -or $captureFinished -gt [DateTimeOffset]::Parse($proof.externalCaptureSignalObservedAt).UtcDateTime){throw 'External capture timestamps are outside this isolation handshake'}
 }
 $proof.captureArtifact=@{path=$captureRecordPath;sha256=(Get-FileHash -LiteralPath $captureRecordPath -Algorithm SHA256).Hash.ToLowerInvariant();status=$captureRecord.status;pid=$captureRecord.pid;appAsarSha256=$captureRecord.appAsarSha256;captureExeSha256=$captureRecord.captureExeSha256}
 $proof.ruleStillActiveAfterCapture=!!(Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue | Where-Object {$_.Enabled -eq 'True' -and $_.Action -eq 'Block'})
 if(!$proof.ruleStillActiveAfterCapture){throw 'Offline rule expired before the audio check completed'}
 $proof.status='capture-completed-under-isolation'
} catch { $proof.status='failed';$proof.error=$_.Exception.Message;throw }
finally {
 Remove-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue
 $lookupErrors=@();$remaining=Get-NetFirewallRule -Name $ruleName -ErrorAction SilentlyContinue -ErrorVariable lookupErrors
 $unexpectedLookupErrors=@($lookupErrors | Where-Object {$_.FullyQualifiedErrorId -notmatch 'CmdletizationQuery_NotFound'})
 $proof.cleanupConfirmed=!$remaining -and !$unexpectedLookupErrors.Count
 if($unexpectedLookupErrors.Count){$proof.cleanupLookupErrors=@($unexpectedLookupErrors | ForEach-Object {$_.Exception.Message})}
 Set-Content -LiteralPath $guardStop -Value 'cleanup requested' -Encoding ascii
 $proof.finishedAt=[DateTime]::UtcNow.ToString('o');Save-AudioProof
 if(!$proof.cleanupConfirmed){throw 'Temporary audio firewall rule cleanup could not be confirmed'}
}
# Recovery control after finally: same executable must be able to connect again.
$proof.after=Invoke-AudioProbe
$proof.status=if($proof.after.result.status -eq 'connected'){'passed'}else{'failed-recovery-control'}
Save-AudioProof
if($proof.status -ne 'passed'){throw 'Post-cleanup TCP recovery control failed'}
