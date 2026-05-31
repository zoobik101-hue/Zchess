@echo off
setlocal EnableExtensions EnableDelayedExpansion
chcp 65001 >nul
cd /d "%~dp0"

set "GITHUB_OWNER=zoobik101-hue"
set "GITHUB_REPO=Zchess"
set "BRANCH=main"
set "REPO_URL=https://github.com/%GITHUB_OWNER%/%GITHUB_REPO%.git"
set "TOKEN_FILE=github-token.txt"
set "GIT_TERMINAL_PROMPT=0"
set "STEP=0"

echo.
echo ==========================================
echo   ZChess - GitHub Push Script
echo ==========================================
echo.

rem ---- [1] Check token file ----
call :next_step "Read GitHub token"
if not exist "%TOKEN_FILE%" (
    call :log_error "File %TOKEN_FILE% not found! Create it and paste your token inside."
    goto END_FAIL
)
set "GITHUB_TOKEN="
for /f "usebackq tokens=* delims=" %%A in ("%TOKEN_FILE%") do (
    set "GITHUB_TOKEN=%%A"
    goto TOKEN_DONE
)
:TOKEN_DONE
if not defined GITHUB_TOKEN (
    call :log_error "%TOKEN_FILE% is empty. Paste your GitHub token on the first line."
    goto END_FAIL
)
set "AUTH_URL=https://x-access-token:!GITHUB_TOKEN!@github.com/%GITHUB_OWNER%/%GITHUB_REPO%.git"
call :log_ok "Token loaded"

rem ---- [2] Check Git ----
call :next_step "Check Git installation"
where git >nul 2>&1
if errorlevel 1 (
    call :log_error "Git not found! Install from: https://git-scm.com/download/win"
    goto END_FAIL
)
for /f "tokens=*" %%v in ('git --version') do call :log_ok "%%v"

rem ---- [3] Init repo if needed ----
call :next_step "Initialize repository"
if not exist ".git\" (
    git init -b %BRANCH%
    if errorlevel 1 (
        call :log_error "Failed to initialize git repository."
        goto END_FAIL
    )
    call :log_ok "New repo initialized"
) else (
    call :log_ok "Git repo already exists"
)

rem ---- [4] Set git user ----
call :next_step "Configure git user"
for /f "usebackq delims=" %%i in (`git config user.name 2^>nul`) do set "GIT_USER=%%i"
if not defined GIT_USER (
    git config user.name "Zoobastiks"
    call :log_ok "user.name set to Zoobastiks"
) else (
    call :log_ok "user.name: !GIT_USER!"
)
for /f "usebackq delims=" %%i in (`git config user.email 2^>nul`) do set "GIT_MAIL=%%i"
if not defined GIT_MAIL (
    git config user.email "zoobastiks@example.com"
    call :log_ok "user.email set"
) else (
    call :log_ok "user.email: !GIT_MAIL!"
)

rem ---- [5] Setup remote ----
call :next_step "Configure remote origin"
git remote get-url origin >nul 2>&1
if errorlevel 1 (
    git remote add origin "!AUTH_URL!"
    if errorlevel 1 (
        call :log_error "Failed to add remote."
        goto END_FAIL
    )
    call :log_ok "Remote added"
) else (
    git remote set-url origin "!AUTH_URL!"
    call :log_ok "Remote updated"
)

rem ---- [6] .gitattributes ----
call :next_step "Check .gitattributes"
if not exist ".gitattributes" (
    >".gitattributes" echo * text=auto eol=lf
    call :log_ok ".gitattributes created"
) else (
    call :log_ok ".gitattributes exists"
)

rem ---- [7] Security check - verify .gitignore blocks token ----
call :next_step "Security pre-check"
if not exist ".gitignore" (
    call :log_error ".gitignore not found! Cannot guarantee token safety."
    goto END_FAIL
)
findstr /i "github-token.txt" ".gitignore" >nul 2>&1
if errorlevel 1 (
    call :log_error ".gitignore does not block github-token.txt! Aborting."
    goto END_FAIL
)
call :log_ok ".gitignore blocks github-token.txt"

rem ---- [7.5] Generate version.json (triggers auto-reload on site) ----
call :next_step "Generate version.json"
set "VER_DATE=%date%"
set "VER_TIME=%time%"
set "VER_BUILD=%VER_DATE: =_%_%VER_TIME::=-%"
set "VER_BUILD=%VER_BUILD:/=-%"
echo {"version":"%VER_DATE% %VER_TIME%","build":"%RANDOM%%RANDOM%"} > version.json
call :log_ok "version.json updated - build timestamp written"

rem ---- [8] Stage all files ----
call :next_step "Stage all files (git add)"
git add -A
if errorlevel 1 (
    call :log_error "git add -A failed."
    goto END_FAIL
)

rem ---- [9] Security: check staged files ----
call :next_step "Security scan of staged files"
git diff --cached --name-only > "%TEMP%\zchess_staged.txt" 2>nul

findstr /i "github-token" "%TEMP%\zchess_staged.txt" >nul 2>&1
if not errorlevel 1 (
    git reset HEAD . >nul 2>&1
    call :log_error "DANGER: github-token.txt was staged! Commit aborted."
    del "%TEMP%\zchess_staged.txt" >nul 2>&1
    goto END_FAIL
)

findstr /i "\.env" "%TEMP%\zchess_staged.txt" >nul 2>&1
if not errorlevel 1 (
    git reset HEAD . >nul 2>&1
    call :log_error "DANGER: .env file detected in staged! Commit aborted."
    del "%TEMP%\zchess_staged.txt" >nul 2>&1
    goto END_FAIL
)

echo   Staged files:
type "%TEMP%\zchess_staged.txt"
del "%TEMP%\zchess_staged.txt" >nul 2>&1
call :log_ok "Security scan passed - no sensitive files"

rem ---- [10] Commit ----
call :next_step "Commit changes"
git diff --cached --quiet
if errorlevel 1 (
    set "MSG=ZChess update %date% %time%"
    git commit -m "!MSG!"
    if errorlevel 1 (
        call :log_error "Commit failed."
        goto END_FAIL
    )
    call :log_ok "Commit created"
) else (
    call :log_ok "Nothing to commit - already up to date"
)

rem ---- [11] Fix branch name ----
call :next_step "Check branch"
for /f "usebackq delims=" %%i in (`git branch --show-current 2^>nul`) do set "CUR_BRANCH=%%i"
if /I not "!CUR_BRANCH!"=="%BRANCH%" (
    git branch -M %BRANCH%
    call :log_ok "Branch renamed to %BRANCH%"
) else (
    call :log_ok "Branch: %BRANCH%"
)

rem ---- [12] Push ----
call :next_step "Push to GitHub"
echo   Pushing to: %REPO_URL%
git -c credential.helper= -c core.askPass= -c credential.interactive=never push -u origin %BRANCH% --force
if errorlevel 1 (
    call :log_error "Push failed! Check token permissions, network, repo access."
    call git remote set-url origin "%REPO_URL%"
    set "GITHUB_TOKEN="
    set "AUTH_URL="
    goto END_FAIL
)
call :log_ok "Push successful!"

rem ---- [13] Clean token from config ----
call :next_step "Remove token from remote URL"
git remote set-url origin "%REPO_URL%"
if errorlevel 1 (
    call :log_warning "Could not restore clean URL - run: git remote set-url origin %REPO_URL%"
) else (
    call :log_ok "Remote URL cleaned (no token)"
)
set "GITHUB_TOKEN="
set "AUTH_URL="

goto END_OK

rem ==========================================
rem  SUBROUTINES
rem ==========================================

:next_step
set /a STEP+=1
echo.
echo [%STEP%] %~1
exit /b 0

:log_ok
echo   [OK] %~1
exit /b 0

:log_warning
echo   [WARN] %~1
exit /b 0

:log_error
echo   [ERROR] %~1
exit /b 0

:END_FAIL
echo.
echo ==========================================
echo   FAILED - see error above
echo ==========================================
echo.
pause
exit /b 1

:END_OK
echo.
echo ==========================================
echo   SUCCESS!
echo   https://github.com/%GITHUB_OWNER%/%GITHUB_REPO%
echo ==========================================
echo.
pause
exit /b 0
