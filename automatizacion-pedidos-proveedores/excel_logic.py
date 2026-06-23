"""Logica de negocio pura: leer Excel de proveedores, cruzar precios y generar
los Excel de salida. No depende de red ni de Graph - testeable con archivos
de ejemplo sin necesidad de conexion.
"""

from dataclasses import dataclass, field
from io import BytesIO

import pandas as pd
from openpyxl.styles import Font


class ExcelFormatoInvalidoError(Exception):
    pass


@dataclass
class ReporteCruce:
    incompletas: list[dict] = field(default_factory=list)
    duplicadas: list[dict] = field(default_factory=list)
    empates: list[dict] = field(default_factory=list)
    sin_stock: list[dict] = field(default_factory=list)
    sin_oferta_valida: list[dict] = field(default_factory=list)


def _normalizar_columnas(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df.columns = [str(c).strip().lower() for c in df.columns]
    return df


def _normalizar_precio(valor) -> float:
    if isinstance(valor, str):
        valor = valor.strip().replace(",", ".")
        if valor == "":
            return float("nan")
    return float(valor)


def _precio_valido(valor: float) -> bool:
    """Un precio en blanco o 0 significa 'sin stock' (no que sea gratis):
    ese proveedor queda descartado para ese articulo, como si fuera carisimo,
    pero sin afectar a la comparativa de los demas proveedores.
    """
    return pd.notna(valor) and valor > 0


def leer_excel_proveedor(contenido_bytes: bytes, nombre_proveedor: str, config_excel: dict) -> pd.DataFrame:
    """Lee el Excel adjunto de un proveedor y lo normaliza a un formato comun."""
    df = pd.read_excel(BytesIO(contenido_bytes), header=config_excel["fila_cabecera"])
    df = _normalizar_columnas(df)

    columnas_esperadas = [c.lower() for c in config_excel["columnas_esperadas"]]
    faltantes = [c for c in columnas_esperadas if c not in df.columns]
    if faltantes:
        raise ExcelFormatoInvalidoError(
            f"El Excel de '{nombre_proveedor}' no tiene las columnas esperadas: {faltantes} "
            f"(columnas encontradas: {list(df.columns)})"
        )

    columna_clave = config_excel["columna_clave"].lower()
    columna_precio = config_excel["columna_precio"].lower()

    df = df[columnas_esperadas].copy()
    df[columna_clave] = df[columna_clave].astype(str).str.strip()
    df[columna_precio] = df[columna_precio].apply(_normalizar_precio)
    df["proveedor"] = nombre_proveedor
    return df


def cruzar_y_determinar_ganador(
    dfs_por_proveedor: dict[str, pd.DataFrame],
    columna_clave: str,
    columna_precio: str,
) -> tuple[pd.DataFrame, ReporteCruce]:
    """Cruza los Excel de los proveedores por columna_clave y asigna, para cada
    articulo, el proveedor con el precio mas bajo. Nunca falla en silencio ante
    datos inconsistentes: cualquier discrepancia queda registrada en el
    ReporteCruce devuelto para que el usuario la revise antes de confiar en el
    resultado.
    """
    reporte = ReporteCruce()
    proveedores = list(dfs_por_proveedor.keys())
    total_proveedores = len(proveedores)

    frames = []
    for nombre, df in dfs_por_proveedor.items():
        duplicados = df[df.duplicated(subset=[columna_clave], keep=False)]
        for referencia in duplicados[columna_clave].unique():
            reporte.duplicadas.append({"proveedor": nombre, "referencia": referencia})
        if not duplicados.empty:
            # Entre duplicados, preferimos quedarnos con una fila de precio
            # valido (>0) antes que con una "sin stock" (blanco o 0).
            orden = df[columna_precio].where(df[columna_precio].apply(_precio_valido), other=float("inf"))
            df = df.assign(_orden=orden).sort_values("_orden").drop_duplicates(subset=[columna_clave], keep="first").drop(columns="_orden")
        frames.append(df)

    consolidado = pd.concat(frames, ignore_index=True)

    cobertura = consolidado.groupby(columna_clave)["proveedor"].nunique()
    for referencia in cobertura[cobertura < total_proveedores].index:
        presentes = consolidado.loc[consolidado[columna_clave] == referencia, "proveedor"].tolist()
        reporte.incompletas.append({
            "referencia": referencia,
            "proveedores_con_cotizacion": presentes,
            "proveedores_sin_cotizacion": [p for p in proveedores if p not in presentes],
        })

    ganador_por_referencia = {}
    for referencia, grupo in consolidado.groupby(columna_clave):
        es_valido = grupo[columna_precio].apply(_precio_valido)
        validos = grupo[es_valido]
        sin_stock = grupo[~es_valido]["proveedor"].tolist()
        if sin_stock:
            reporte.sin_stock.append({"referencia": referencia, "proveedores_sin_stock": sin_stock})

        if validos.empty:
            reporte.sin_oferta_valida.append({"referencia": referencia, "proveedores_sin_stock": sin_stock})
            continue  # ningun proveedor tiene precio valido: no se asigna ganador

        precio_minimo = validos[columna_precio].min()
        empatados = validos[validos[columna_precio] == precio_minimo].sort_values("proveedor")
        ganador = empatados.iloc[0]["proveedor"]
        ganador_por_referencia[referencia] = ganador
        if len(empatados) > 1:
            reporte.empates.append({
                "referencia": referencia,
                "precio": precio_minimo,
                "proveedores_empatados": empatados["proveedor"].tolist(),
                "ganador_asignado": ganador,
            })

    consolidado["proveedor_ganador"] = consolidado[columna_clave].map(ganador_por_referencia)
    return consolidado, reporte


def construir_excel_por_proveedor(df_consolidado: pd.DataFrame, nombre_proveedor: str, columnas_salida: list[str]) -> bytes:
    """Genera el .xlsx con los articulos en los que nombre_proveedor resulto ganador."""
    columnas_salida = [c.lower() for c in columnas_salida]
    es_ganador = df_consolidado["proveedor_ganador"] == nombre_proveedor
    es_propio = df_consolidado["proveedor"] == nombre_proveedor
    filtrado = df_consolidado[es_ganador & es_propio][columnas_salida]

    buffer = BytesIO()
    with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
        filtrado.to_excel(writer, index=False, sheet_name="Ganador")
        hoja = writer.sheets["Ganador"]
        for celda in hoja[1]:
            celda.font = Font(bold=True)
        for columna in hoja.columns:
            ancho = max((len(str(c.value)) for c in columna if c.value is not None), default=10) + 2
            hoja.column_dimensions[columna[0].column_letter].width = ancho

    return buffer.getvalue()


def construir_excel_no_stock(
    df_consolidado: pd.DataFrame,
    columna_clave: str,
    columna_precio: str,
    columnas_salida: list[str],
) -> bytes:
    """Genera el .xlsx con los articulos sin precio valido en ningun proveedor."""
    columnas_salida_lower = [c.lower() for c in columnas_salida]
    columna_clave = columna_clave.lower()
    columna_precio_lower = columna_precio.lower()
    cols_mostrar = [c for c in columnas_salida_lower if c != columna_precio_lower]

    sin_ganador = df_consolidado[df_consolidado["proveedor_ganador"].isna()]
    filtrado = sin_ganador[cols_mostrar].drop_duplicates(subset=[columna_clave])

    buffer = BytesIO()
    with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
        filtrado.to_excel(writer, index=False, sheet_name="NO STOCK")
        hoja = writer.sheets["NO STOCK"]
        for celda in hoja[1]:
            celda.font = Font(bold=True)
        for columna in hoja.columns:
            ancho = max((len(str(c.value)) for c in columna if c.value is not None), default=10) + 2
            hoja.column_dimensions[columna[0].column_letter].width = ancho

    return buffer.getvalue()


def construir_excel_comparativa(
    df_consolidado: pd.DataFrame,
    columna_clave: str,
    columna_precio: str,
    columnas_salida: list[str],
) -> bytes:
    """Genera el .xlsx con todos los articulos y los precios de cada proveedor en columnas separadas."""
    columnas_salida_lower = [c.lower() for c in columnas_salida]
    columna_clave = columna_clave.lower()
    columna_precio_lower = columna_precio.lower()
    cols_info = [c for c in columnas_salida_lower if c != columna_precio_lower]

    info = df_consolidado[cols_info].drop_duplicates(subset=[columna_clave])

    pivot = (
        df_consolidado
        .groupby([columna_clave, "proveedor"])[columna_precio_lower]
        .first()
        .unstack("proveedor")
        .reset_index()
    )
    pivot.columns.name = None
    pivot = pivot.rename(columns={
        col: f"precio_{col}" for col in pivot.columns if col != columna_clave
    })

    ganador = (
        df_consolidado[[columna_clave, "proveedor_ganador"]]
        .drop_duplicates(subset=[columna_clave])
    )

    resultado = info.merge(pivot, on=columna_clave, how="left")
    resultado = resultado.merge(ganador, on=columna_clave, how="left")

    buffer = BytesIO()
    with pd.ExcelWriter(buffer, engine="openpyxl") as writer:
        resultado.to_excel(writer, index=False, sheet_name="Comparativa")
        hoja = writer.sheets["Comparativa"]
        for celda in hoja[1]:
            celda.font = Font(bold=True)
        for columna in hoja.columns:
            ancho = max((len(str(c.value)) for c in columna if c.value is not None), default=10) + 2
            hoja.column_dimensions[columna[0].column_letter].width = ancho

    return buffer.getvalue()
