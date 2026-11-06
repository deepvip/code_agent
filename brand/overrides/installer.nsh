!macro customInstall
  CreateShortCut "$SMPROGRAMS\Aero Code 设置.lnk" "$INSTDIR\resources\AeroCodeSetup.exe"

  ; 未配置前先放一份“只允许内网网关”的空配置：
  ; 客户端默认会连上游服务，这里把除内网网关外的 provider 全部拒掉。
  IfFileExists "$PROFILE\.config\aero-code\aero-code.jsonc" aero_config_ready
  CreateDirectory "$PROFILE\.config\aero-code"
  FileOpen $R9 "$PROFILE\.config\aero-code\aero-code.jsonc" w
  FileWrite $R9 '{"username":"Aero","share":"disabled","update":"disable","policies":[{"action":"provider.use","resource":"*","effect":"deny"},{"action":"provider.use","resource":"opencode","effect":"allow"}]}'
  FileClose $R9
  aero_config_ready:

  ; Chromium's sandbox needs read/execute access to the installed runtime files.
  ; https://github.com/electron/electron/issues/49143#issuecomment-3618354787
  nsExec::ExecToLog '"$SYSDIR\icacls.exe" "$INSTDIR" /grant "*S-1-15-2-2:(OI)(CI)(RX)"'
  Pop $0
!macroend

!macro customUnInstall
  Delete "$SMPROGRAMS\Aero Code 设置.lnk"
!macroend
