;; Custom NSIS hooks for the GoldenHope installer.
;;
;; Fixes the upgrade path: installing the new version over an already
;; running instance left the old process holding the single-instance lock
;; and locked the app files, so the freshly installed build appeared to
;; "not open". These hooks close any running GoldenHope processes before
;; install/uninstall so files are replaced cleanly.

!macro customInit
  DetailPrint "Closing running GoldenHope instances..."
  nsExec::ExecToLog 'cmd /c taskkill /IM GoldenHope.exe /F /T /Q 2>nul'
!macroend

!macro customUnInit
  DetailPrint "Closing running GoldenHope instances..."
  nsExec::ExecToLog 'cmd /c taskkill /IM GoldenHope.exe /F /T /Q 2>nul'
!macroend