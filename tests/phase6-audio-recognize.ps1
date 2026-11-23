# Optional corroboration from the installed Windows recognizer. File input only;
# no microphone, network service, constrained expected-word grammar or new model.
# Run with Windows PowerShell 5.1 (System.Speech is installed with .NET Framework).
param([Parameter(Mandatory=$true)][string]$WaveFile,[Parameter(Mandatory=$true)][string]$OutputFile)
$ErrorActionPreference='Stop'
if(Test-Path -LiteralPath $OutputFile){throw 'Use a fresh recognition record'}
$recognizer=$null
$record=[ordered]@{method='Installed in-process Windows English recognizer, free dictation on captured audio file; no expected-text grammar';input=[IO.Path]::GetFullPath($WaveFile);engine=$null;results=@();limits='Machine transcription corroborates recognizable speech; it is not a substitute for human pronunciation and listening-quality critique.'}
try {
 Add-Type -AssemblyName System.Speech
 $recognizer=New-Object System.Speech.Recognition.SpeechRecognitionEngine([Globalization.CultureInfo]::GetCultureInfo('en-US'))
 $record.engine=$recognizer.RecognizerInfo.Description
 $recognizer.LoadGrammar((New-Object System.Speech.Recognition.DictationGrammar))
 $recognizer.SetInputToWaveFile($record.input)
 for($i=0;$i -lt 3;$i++){
  $result=$recognizer.Recognize([TimeSpan]::FromSeconds(10))
  if($null -eq $result){break}
  $record.results+=@{text=$result.Text;confidence=$result.Confidence;audioPositionSeconds=$result.Audio.AudioPosition.TotalSeconds;durationSeconds=$result.Audio.Duration.TotalSeconds}
 }
 $record.status=if($record.results.Count){'recognized'}else{'no-recognition'}
} catch {
 $record.error=$_.Exception.Message
 if($record.results.Count -gt 0 -and $record.error -like '*No audio input is supplied*'){$record.status='recognized';$record.endOfInput=$true}
 elseif($record.results.Count -gt 0){$record.status='partial-recognition'}
 else{$record.status='unavailable'}
}
finally {if($recognizer){$recognizer.Dispose()};$record | ConvertTo-Json -Depth 7 | Set-Content -LiteralPath $OutputFile -Encoding utf8}
$record | ConvertTo-Json -Depth 7
