@echo off
REM Script Viewer batch fixture
set TARGET=C:\Temp\script-viewer

:deploy
echo Deploying to %TARGET%
powershell -NoProfile -Command "Write-Host test"
goto done

:done
echo Done
