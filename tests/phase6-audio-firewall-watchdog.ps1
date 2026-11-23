# Invoked by phase6-audio-firewall.ps1 only; removes one uniquely named test rule.
#Requires -RunAsAdministrator
param([Parameter(Mandatory=$true)][ValidatePattern('^GalaxyMapStep5Audio-[a-f0-9]{32}$')][string]$RuleName,[Parameter(Mandatory=$true)][string]$StopFile,[Parameter(Mandatory=$true)][string]$ProofDirectory)
$deadline=[DateTime]::UtcNow.AddSeconds(180)
while([DateTime]::UtcNow -lt $deadline -and !(Test-Path -LiteralPath $StopFile)){Start-Sleep -Seconds 2}
Remove-NetFirewallRule -Name $RuleName -ErrorAction SilentlyContinue
$lookupErrors=@();$remaining=Get-NetFirewallRule -Name $RuleName -ErrorAction SilentlyContinue -ErrorVariable lookupErrors
$unexpected=@($lookupErrors | Where-Object {$_.FullyQualifiedErrorId -notmatch 'CmdletizationQuery_NotFound'})
@{ruleName=$RuleName;removed=(!$remaining -and !$unexpected.Count);lookupErrors=@($unexpected | ForEach-Object {$_.Exception.Message});endedAt=[DateTime]::UtcNow.ToString('o');requested=Test-Path -LiteralPath $StopFile} | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $ProofDirectory 'watchdog-cleanup.json') -Encoding utf8
