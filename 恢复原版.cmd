@echo off
call "%~dp0scripts\windows.cmd" restore %*
exit /b %errorlevel%
