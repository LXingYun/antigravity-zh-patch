@echo off
call "%~dp0scripts\windows.cmd" install %*
exit /b %errorlevel%
