@echo off
cd /d "%~dp0"
call .venv\Scripts\activate.bat
python main.py
echo.
echo Pulsa una tecla para cerrar esta ventana...
pause >nul
