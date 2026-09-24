@echo off
cd /d "%~dp0.."
node scripts/auto-agent.mjs say lobby "Automated agent heartbeat"
