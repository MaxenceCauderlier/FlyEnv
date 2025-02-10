@echo off
set NVM_PATH=##NVM_PATH##
set NVM_HOME=%NVM_PATH%
set NVM_SYMLINK=##NVM_SYMLINK##
setx /M NVM_HOME "%NVM_HOME%"
setx /M NVM_SYMLINK "%NVM_SYMLINK%"

echo PATH=%PATH% > %NVM_HOME%\PATH.txt

for /f "skip=2 tokens=2,*" %%A in ('reg query "HKLM\System\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul') do (
  setx /M PATH "%%B;%%NVM_HOME%%;%%NVM_SYMLINK%%"
)

if exist "%SYSTEMDRIVE%\Program Files (x86)\" (
set SYS_ARCH=64
) else (
set SYS_ARCH=32
)
(echo root: %NVM_HOME% && echo path: %NVM_SYMLINK% && echo arch: %SYS_ARCH% && echo proxy: none) > "%NVM_HOME%\settings.txt"
@echo on
