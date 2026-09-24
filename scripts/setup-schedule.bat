@echo off
echo Registering TechnocoreAgent scheduled task (hourly)...
schtasks /create /tn "TechnocoreAgent" /tr "\"%~dp0run-agent.bat\"" /sc MINUTE /mo 15 /f
echo.
schtasks /query /tn "TechnocoreAgent"
pause
