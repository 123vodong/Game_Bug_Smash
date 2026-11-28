@echo off
setlocal
cd /d "%~dp0"
echo Generating Bug Smash vs Summoner's Rift comparison report...
node "%~dp0tools\map_preview_compare.mjs"
if errorlevel 1 (
  echo Failed to generate comparison report.
  exit /b 1
)
echo Opening docs\maps\map_preview.html ...
start "" "%~dp0docs\maps\map_preview.html"
endlocal
