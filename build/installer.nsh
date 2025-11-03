; Custom NSIS installer script for Meeting AI Assistant
; This script adds custom installation steps and registry entries

!macro customInstall
  ; Create registry entries for the application
  WriteRegStr HKCU "Software\MeetingAIAssistant" "InstallPath" "$INSTDIR"
  WriteRegStr HKCU "Software\MeetingAIAssistant" "Version" "${VERSION}"
  
  ; Add to Windows Defender exclusions (optional, requires admin)
  ; This helps prevent false positives from antivirus software
  
  ; Create application data directory
  CreateDirectory "$APPDATA\MeetingAIAssistant"
  CreateDirectory "$APPDATA\MeetingAIAssistant\meetings"
  CreateDirectory "$APPDATA\MeetingAIAssistant\exports"
!macroend

!macro customUnInstall
  ; Remove registry entries
  DeleteRegKey HKCU "Software\MeetingAIAssistant"
  
  ; Optionally keep user data (meetings, exports)
  ; User can manually delete from %APPDATA%\MeetingAIAssistant if needed
!macroend

; Custom header for installer
!macro customHeader
  !system "echo 'Building Meeting AI Assistant Installer...'"
!macroend

; Custom init
!macro customInit
  ; Check if another instance is running
  System::Call 'kernel32::CreateMutex(i 0, i 0, t "MeetingAIAssistantMutex") i .r1 ?e'
  Pop $R0
  
  StrCmp $R0 0 +3
    MessageBox MB_OK|MB_ICONEXCLAMATION "Meeting AI Assistant is currently running. Please close it before installing."
    Abort
!macroend
