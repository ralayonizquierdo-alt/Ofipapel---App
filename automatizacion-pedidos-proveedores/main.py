"""Orquesta el flujo completo: detectar los correos de pedido semanal,
cruzar los Excel de los 3 proveedores, generar el Excel ganador de cada uno
y dejar las respuestas como borrador en Outlook.

Uso:
    python main.py            # flujo completo (crea borradores reales en Outlook)
    python main.py --dry-run  # solo cruza y genera los Excel localmente,
                               # sin tocar Outlook (ni crear borradores ni marcar nada)
"""

import argparse
import os
from datetime import date

import yaml

import auth
import graph_client
import excel_logic


def cargar_config(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f)


def imprimir_resumen(correos_por_proveedor: dict, reporte: excel_logic.ReporteCruce, drafts_creados: dict) -> None:
    print("\n--- Resumen ---")
    print(f"Proveedores detectados esta semana: {list(correos_por_proveedor.keys())}")

    if reporte.incompletas:
        print(f"\nAVISO: {len(reporte.incompletas)} referencia(s) con cobertura parcial (no cotizadas por todos):")
        for item in reporte.incompletas:
            print(f"  - {item['referencia']}: faltan {item['proveedores_sin_cotizacion']}")

    if reporte.duplicadas:
        print(f"\nAVISO: referencia(s) duplicada(s) dentro del Excel de un mismo proveedor:")
        for item in reporte.duplicadas:
            print(f"  - {item['proveedor']}: {item['referencia']} (se quedo con el precio mas bajo)")

    if reporte.empates:
        print(f"\nAVISO: empate(s) de precio resueltos por orden alfabetico de proveedor:")
        for item in reporte.empates:
            print(
                f"  - {item['referencia']} (precio {item['precio']}): "
                f"empatados {item['proveedores_empatados']} -> asignado a {item['ganador_asignado']}"
            )

    if reporte.sin_stock:
        print(f"\nAVISO: articulo(s) sin precio (en blanco o 0) en algun proveedor (se descarta ese proveedor para ese articulo):")
        for item in reporte.sin_stock:
            print(f"  - {item['referencia']}: sin stock en {item['proveedores_sin_stock']}")

    if reporte.sin_oferta_valida:
        print(f"\nAVISO IMPORTANTE: {len(reporte.sin_oferta_valida)} articulo(s) sin NINGUN proveedor con precio valido (no se asigna ganador, no apareceran en ningun Excel de salida):")
        for item in reporte.sin_oferta_valida:
            print(f"  - {item['referencia']}")

    if drafts_creados:
        print("\nBorradores creados en Outlook (revisalos antes de enviar):")
        for proveedor, draft_id in drafts_creados.items():
            print(f"  - {proveedor}: draft_id={draft_id}")


def main():
    parser = argparse.ArgumentParser(description="Cruce semanal de precios de proveedores")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Genera los Excel localmente sin crear borradores ni tocar Outlook",
    )
    args = parser.parse_args()

    config = cargar_config("config.yaml")
    os.makedirs(config["salida"]["carpeta"], exist_ok=True)

    # El token hace falta incluso en --dry-run: para detectar los correos y
    # descargar los adjuntos. En --dry-run simplemente no se crean borradores.
    token = auth.get_access_token(config["auth"])

    mensajes = graph_client.buscar_correos_candidatos(token, config["busqueda"]["dias_atras"])
    correos_por_proveedor = graph_client.filtrar_correos_pedido(
        mensajes, config["proveedores"], config["busqueda"]["asunto_contiene"]
    )

    nombres_esperados = [p["nombre"] for p in config["proveedores"]]
    faltantes = [n for n in nombres_esperados if n not in correos_por_proveedor]
    if faltantes:
        print(f"AVISO: no se encontro correo de pedido semanal de: {faltantes}")
        print("Abortando: hacen falta los 3 correos para poder cruzar precios correctamente.")
        return

    dfs = {}
    for nombre, mensaje in correos_por_proveedor.items():
        nombre_archivo, contenido = graph_client.descargar_adjunto_excel(token, mensaje["id"])
        dfs[nombre] = excel_logic.leer_excel_proveedor(contenido, nombre, config["excel"])

    df_consolidado, reporte = excel_logic.cruzar_y_determinar_ganador(
        dfs, config["excel"]["columna_clave"], config["excel"]["columna_precio"]
    )

    hoy = date.today().isoformat()
    drafts_creados = {}
    for nombre, mensaje in correos_por_proveedor.items():
        excel_bytes = excel_logic.construir_excel_por_proveedor(
            df_consolidado, nombre, config["excel"]["columnas_esperadas"]
        )
        nombre_archivo_salida = config["salida"]["nombre_archivo_patron"].format(
            proveedor=nombre.replace(" ", "_"), fecha=hoy
        )
        ruta_local = os.path.join(config["salida"]["carpeta"], nombre_archivo_salida)
        with open(ruta_local, "wb") as f:
            f.write(excel_bytes)
        print(f"Excel generado: {ruta_local}")

        if not args.dry_run:
            draft_id = graph_client.crear_borrador_respuesta_con_adjunto(
                token,
                mensaje["id"],
                config["email"]["plantilla_respuesta"],
                nombre_archivo_salida,
                excel_bytes,
            )
            graph_client.marcar_correo_procesado(token, mensaje["id"], config["email"]["marcar_categoria"])
            drafts_creados[nombre] = draft_id

    excel_bytes_no_stock = excel_logic.construir_excel_no_stock(
        df_consolidado,
        config["excel"]["columna_clave"],
        config["excel"]["columna_precio"],
        config["excel"]["columnas_esperadas"],
    )
    ruta_no_stock = os.path.join(config["salida"]["carpeta"], f"NO_STOCK_{hoy}.xlsx")
    with open(ruta_no_stock, "wb") as f:
        f.write(excel_bytes_no_stock)
    print(f"Excel NO STOCK generado: {ruta_no_stock}")

    excel_bytes_comparativa = excel_logic.construir_excel_comparativa(
        df_consolidado,
        config["excel"]["columna_clave"],
        config["excel"]["columna_precio"],
        config["excel"]["columnas_esperadas"],
    )
    ruta_comparativa = os.path.join(config["salida"]["carpeta"], f"Comparativa_{hoy}.xlsx")
    with open(ruta_comparativa, "wb") as f:
        f.write(excel_bytes_comparativa)
    print(f"Excel comparativa generado: {ruta_comparativa}")

    imprimir_resumen(correos_por_proveedor, reporte, drafts_creados)


if __name__ == "__main__":
    main()
