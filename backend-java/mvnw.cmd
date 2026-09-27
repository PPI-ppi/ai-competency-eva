@echo off
@setlocal
rem Maven Wrapper Windows entry point.
rem The repo only ships the POSIX mvnw script, so PowerShell/cmd has no runnable entry.
rem ASCII only: cmd.exe decodes .cmd with the ANSI code page (GBK on zh-CN),
rem and any non-ASCII bytes get parsed as garbage commands.
set BASE_DIR=%~dp0
if "%BASE_DIR:~-1%"=="\" set BASE_DIR=%BASE_DIR:~0,-1%
set JAVA_EXE=java.exe
if defined JAVA_HOME set JAVA_EXE=%JAVA_HOME%\bin\java.exe
"%JAVA_EXE%" -Dmaven.multiModuleProjectDirectory="%BASE_DIR%" -cp "%BASE_DIR%\.mvn\wrapper\maven-wrapper.jar" org.apache.maven.wrapper.MavenWrapperMain %*
exit /b %ERRORLEVEL%
