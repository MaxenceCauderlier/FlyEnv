@echo off
chcp 65001>nul
for /f "skip=2 tokens=2,*" %%A in ('reg query "HKLM\System\CurrentControlSet\Control\Session Manager\Environment" /v PathExt 2^>nul') do (
  set p=%%B
)
echo %p%
