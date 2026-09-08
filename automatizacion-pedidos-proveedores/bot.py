"""Bot de Telegram para disparar el script de cruce de precios de proveedores.

Comandos:
  /start   - Bienvenida
  /ping    - Comprueba que el PC esta encendido
  /run     - Ejecuta el script completo (crea borradores en Outlook)
  /dryrun  - Ejecuta sin crear borradores ni tocar Outlook

Primera vez: envia el texto  Vincular  para registrar tu chat.
"""

import socket
import subprocess
import sys
import time
from pathlib import Path

import yaml
from telegram import Update
from telegram.ext import Application, CommandHandler, ContextTypes, MessageHandler, filters

START_TIME = time.time()
SCRIPT_DIR = Path(__file__).parent
CONFIG_PATH = SCRIPT_DIR / "config.yaml"
CHAT_ID_FILE = SCRIPT_DIR / ".telegram_chat_id"


def _cargar_token() -> str:
    with open(CONFIG_PATH, encoding="utf-8") as f:
        return yaml.safe_load(f)["telegram"]["token"]


def _chat_autorizado() -> int | None:
    if CHAT_ID_FILE.exists():
        try:
            return int(CHAT_ID_FILE.read_text().strip())
        except ValueError:
            return None
    return None


def _guardar_chat_id(chat_id: int) -> None:
    CHAT_ID_FILE.write_text(str(chat_id))


async def cmd_start(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    await update.message.reply_text(
        "Bot de pedidos Ofipapel\n"
        "Envia  Vincular  para registrar este chat.\n"
        "Comandos: /ping  /run  /dryrun"
    )


async def cmd_ping(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    autorizado = _chat_autorizado()
    if autorizado and update.effective_chat.id != autorizado:
        return
    uptime_s = int(time.time() - START_TIME)
    h, rem = divmod(uptime_s, 3600)
    m = rem // 60
    pc = socket.gethostname()
    await update.message.reply_text(f"pong - {pc}\nEncendido hace {h}h {m}m")


async def _ejecutar(update: Update, dry: bool) -> None:
    autorizado = _chat_autorizado()
    if not autorizado:
        await update.message.reply_text("Chat no autorizado. Envia Vincular primero.")
        return
    if update.effective_chat.id != autorizado:
        return

    await update.message.reply_text(
        f"Ejecutando script{'  (dry-run)' if dry else ''}... espera."
    )
    args = [sys.executable, str(SCRIPT_DIR / "main.py")]
    if dry:
        args.append("--dry-run")
    try:
        res = subprocess.run(args, capture_output=True, text=True, cwd=str(SCRIPT_DIR), timeout=300)
        salida = (res.stdout + res.stderr).strip() or "Script finalizado sin salida."
        for chunk in [salida[i : i + 4000] for i in range(0, len(salida), 4000)]:
            await update.message.reply_text(chunk)
    except subprocess.TimeoutExpired:
        await update.message.reply_text("El script tardo mas de 5 minutos.")
    except Exception as e:
        await update.message.reply_text(f"Error: {e}")


async def cmd_run(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    await _ejecutar(update, dry=False)


async def cmd_dryrun(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    await _ejecutar(update, dry=True)


async def msg_texto(update: Update, ctx: ContextTypes.DEFAULT_TYPE) -> None:
    if update.message.text.strip().lower() != "vincular":
        return
    chat_id = update.effective_chat.id
    _guardar_chat_id(chat_id)
    pc = socket.gethostname()
    await update.message.reply_text(
        f"Vinculado correctamente con {pc}\n"
        f"Bot activo en {pc}\n"
        f"Comandos: /run, /ping, /dryrun"
    )


def main() -> None:
    token = _cargar_token()
    app = Application.builder().token(token).build()
    app.add_handler(CommandHandler("start", cmd_start))
    app.add_handler(CommandHandler("ping", cmd_ping))
    app.add_handler(CommandHandler("run", cmd_run))
    app.add_handler(CommandHandler("dryrun", cmd_dryrun))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, msg_texto))
    print(f"Bot arrancado en {socket.gethostname()}")
    app.run_polling()


if __name__ == "__main__":
    main()
