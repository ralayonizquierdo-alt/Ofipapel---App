"""Autenticacion contra Microsoft Graph via MSAL (device code flow)."""

import os

import msal


def _authority(tenant_id: str) -> str:
    return f"https://login.microsoftonline.com/{tenant_id}"


def load_token_cache(path: str) -> msal.SerializableTokenCache:
    cache = msal.SerializableTokenCache()
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            cache.deserialize(f.read())
    return cache


def save_token_cache(cache: msal.SerializableTokenCache, path: str) -> None:
    if cache.has_state_changed:
        with open(path, "w", encoding="utf-8") as f:
            f.write(cache.serialize())


def build_msal_app(client_id: str, tenant_id: str, cache: msal.SerializableTokenCache) -> msal.PublicClientApplication:
    return msal.PublicClientApplication(
        client_id=client_id,
        authority=_authority(tenant_id),
        token_cache=cache,
    )


def get_access_token(auth_config: dict) -> str:
    """Devuelve un access token valido, usando el cache si es posible.

    Si no hay sesion cacheada (o ya no es valida), lanza el flujo de
    device code: el usuario abre una URL, introduce un codigo e inicia
    sesion con su cuenta de trabajo. El token (y el refresh token) se
    guardan en disco para no tener que repetir el login en cada ejecucion.
    """
    cache_path = auth_config["token_cache_path"]
    cache = load_token_cache(cache_path)
    app = build_msal_app(auth_config["client_id"], auth_config["tenant_id"], cache)
    scopes = auth_config["scopes"]

    result = None
    accounts = app.get_accounts()
    if accounts:
        result = app.acquire_token_silent(scopes, account=accounts[0])

    if not result:
        flow = app.initiate_device_flow(scopes=scopes)
        if "user_code" not in flow:
            raise RuntimeError(f"No se pudo iniciar el login: {flow.get('error_description', flow)}")
        print(flow["message"])
        result = app.acquire_token_by_device_flow(flow)

    save_token_cache(cache, cache_path)

    if "access_token" not in result:
        raise RuntimeError(
            "No se pudo obtener el token de acceso: "
            f"{result.get('error')}: {result.get('error_description')}"
        )
    return result["access_token"]
