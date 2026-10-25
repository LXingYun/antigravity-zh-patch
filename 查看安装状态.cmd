@echo off
call "%~dp0scripts\windows.cmd" status %*
exit /b %errorlevel%
