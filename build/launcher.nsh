; NSIS does not consume electron-builder's protocols metadata. Register the
; launch-only URL in the installer's current user/machine context instead.
; No %1 argument is forwarded: any URL simply opens the fixed application.
!macro customInstall
  WriteRegStr SHELL_CONTEXT "Software\Classes\galaxymap" "" "URL:Galaxy Map"
  WriteRegStr SHELL_CONTEXT "Software\Classes\galaxymap" "URL Protocol" ""
  WriteRegStr SHELL_CONTEXT "Software\Classes\galaxymap\DefaultIcon" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}",0'
  WriteRegStr SHELL_CONTEXT "Software\Classes\galaxymap\shell\open\command" "" '"$INSTDIR\${APP_EXECUTABLE_FILENAME}"'
!macroend

!macro customUnInstall
  ; Only remove the registration if this installation still owns it.
  ReadRegStr $R0 SHELL_CONTEXT "Software\Classes\galaxymap\shell\open\command" ""
  StrCpy $R1 '"$INSTDIR\${APP_EXECUTABLE_FILENAME}"'
  ${If} $R0 == $R1
    DeleteRegKey SHELL_CONTEXT "Software\Classes\galaxymap"
  ${EndIf}
!macroend
