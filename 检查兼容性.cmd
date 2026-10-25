@echo off
call "%~dp0scripts\windows.cmd" check %*
exit /b %errorlevel%
