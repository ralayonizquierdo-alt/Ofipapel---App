"""Cliente minimo de Microsoft Graph para el flujo de pedidos semanales.

Esta es la unica capa del proyecto que conoce URLs y formatos JSON de Graph.
excel_logic.py y main.py no deberian necesitar saber nada de esto.
"""

import base64
import time
from datetime import datetime, timedelta, timezone

import requests

GRAPH_BASE = "https://graph.microsoft.com/v1.0"
XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
MAX_SIMPLE_ATTACHMENT_BYTES = 3 * 1024 * 1024  # limite del endpoint simple de adjuntos


def _headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


def _request(method: str, url: str, token: str, **kwargs) -> requests.Response:
    """Wrapper con reintento ante 429 (respetando Retry-After) y 5xx."""
    max_intentos = 4
    for intento in range(1, max_intentos + 1):
        resp = requests.request(method, url, headers=_headers(token), timeout=30, **kwargs)
        if resp.status_code == 429:
            espera = int(resp.headers.get("Retry-After", "5"))
            time.sleep(espera)
            continue
        if 500 <= resp.status_code < 600 and intento < max_intentos:
            time.sleep(2 ** intento)
            continue
        return resp
    return resp


def buscar_correos_candidatos(token: str, dias_atras: int) -> list[dict]:
    """Trae mensajes recientes de la bandeja de entrada (filtro solo por fecha).

    El filtrado por asunto/remitente se hace despues en Python
    (filtrar_correos_pedido) porque Graph no soporta de forma fiable
    $filter con contains() sobre 'subject', ni combinar $filter con $search
    en la coleccion /messages.
    """
    desde = (datetime.now(timezone.utc) - timedelta(days=dias_atras)).strftime("%Y-%m-%dT%H:%M:%SZ")
    url = (
        f"{GRAPH_BASE}/me/mailFolders/inbox/messages"
        f"?$filter=receivedDateTime ge {desde}"
        f"&$orderby=receivedDateTime desc"
        f"&$top=50"
        f"&$select=id,subject,from,receivedDateTime,hasAttachments,categories"
    )
    mensajes = []
    while url:
        resp = _request("GET", url, token)
        resp.raise_for_status()
        data = resp.json()
        mensajes.extend(data.get("value", []))
        url = data.get("@odata.nextLink")
    return mensajes


def _remitente_coincide(remitente_email: str, patron: str) -> bool:
    remitente_email = remitente_email.lower()
    patron = patron.lower()
    if patron.startswith("@"):
        return remitente_email.endswith(patron)
    return remitente_email == patron


def _remitente_coincide_alguno(remitente_email: str, patrones: list[str]) -> bool:
    return any(_remitente_coincide(remitente_email, patron) for patron in patrones)


def filtrar_correos_pedido(mensajes: list[dict], proveedores: list[dict], asunto_contiene: str) -> dict[str, dict]:
    """Funcion pura: de los mensajes crudos, identifica el correo de cada proveedor.

    Descarta mensajes ya marcados como procesados, sin adjunto, o cuyo
    asunto no coincide. Si hay varios candidatos para el mismo proveedor
    se queda con el mas reciente (la lista ya viene ordenada desc). Cada
    proveedor puede tener varios remitentes validos (config "remitentes"),
    util cuando la persona habitual esta de vacaciones y responde otra.
    """
    asunto_contiene = asunto_contiene.lower()
    encontrados: dict[str, dict] = {}
    for msg in mensajes:
        if "PedidoProcesado" in (msg.get("categories") or []):
            continue
        if not msg.get("hasAttachments"):
            continue
        asunto = (msg.get("subject") or "").lower()
        if asunto_contiene not in asunto:
            continue
        remitente = ((msg.get("from") or {}).get("emailAddress") or {}).get("address", "")
        for proveedor in proveedores:
            nombre = proveedor["nombre"]
            if nombre in encontrados:
                continue  # ya tenemos el mas reciente para este proveedor
            if _remitente_coincide_alguno(remitente, proveedor["remitentes"]):
                encontrados[nombre] = msg
                break
    return encontrados


def descargar_adjunto_excel(token: str, message_id: str) -> tuple[str, bytes]:
    url = f"{GRAPH_BASE}/me/messages/{message_id}/attachments?$select=name,contentType,contentBytes"
    resp = _request("GET", url, token)
    resp.raise_for_status()
    for attachment in resp.json().get("value", []):
        nombre = attachment.get("name", "")
        if nombre.lower().endswith((".xlsx", ".xls")) and "contentBytes" in attachment:
            return nombre, base64.b64decode(attachment["contentBytes"])
    raise ValueError(f"El correo {message_id} no tiene ningun adjunto Excel (.xlsx/.xls)")


def crear_borrador_respuesta_con_adjunto(
    token: str,
    message_id: str,
    comentario: str,
    nombre_adjunto: str,
    contenido_adjunto: bytes,
) -> str:
    if len(contenido_adjunto) > MAX_SIMPLE_ATTACHMENT_BYTES:
        raise ValueError(
            f"El Excel generado para adjuntar a {message_id} supera ~3MB "
            "(limite del endpoint simple de adjuntos de Graph); no soportado en esta version."
        )

    reply_url = f"{GRAPH_BASE}/me/messages/{message_id}/createReply"
    resp = _request("POST", reply_url, token, json={"comment": comentario})
    resp.raise_for_status()
    draft = resp.json()
    draft_id = draft["id"]

    attachment_url = f"{GRAPH_BASE}/me/messages/{draft_id}/attachments"
    attachment_body = {
        "@odata.type": "#microsoft.graph.fileAttachment",
        "name": nombre_adjunto,
        "contentType": XLSX_CONTENT_TYPE,
        "contentBytes": base64.b64encode(contenido_adjunto).decode("ascii"),
    }
    resp = _request("POST", attachment_url, token, json=attachment_body)
    resp.raise_for_status()

    return draft_id


def marcar_correo_procesado(token: str, message_id: str, categoria: str) -> None:
    get_url = f"{GRAPH_BASE}/me/messages/{message_id}?$select=categories"
    resp = _request("GET", get_url, token)
    resp.raise_for_status()
    categorias_actuales = resp.json().get("categories") or []
    if categoria in categorias_actuales:
        return

    patch_url = f"{GRAPH_BASE}/me/messages/{message_id}"
    resp = _request("PATCH", patch_url, token, json={"categories": categorias_actuales + [categoria]})
    resp.raise_for_status()
