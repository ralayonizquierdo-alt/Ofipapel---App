@echo off
cd /d "C:\Users\ralay\Ofipapel---App\automatizacion-pedidos-proveedores"
git pull
call .venv\Scripts\activate.bat
python main.py
echo.
echo Pulsa una tecla para cerrar esta ventana...
pause >nul
