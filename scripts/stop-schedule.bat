@echo off
echo Disabling TechnocoreAgent scheduled task...
schtasks /change /tn TechnocoreAgent /disable
echo.
echo Task is paused. Run setup-schedule.bat or 'schtasks /change /tn TechnocoreAgent /enable' to resume.
pause
