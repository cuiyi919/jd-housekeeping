@echo off
cd /d "%~dp0"
set REACT_NATIVE_PACKAGER_HOSTNAME=
call npm.cmd run start:tunnel
pause
