# CONTANET: inventario y comparativa con el ERP

16/11/2026. Fases 1 y 2 de `PLAN_CONTANET.md`. Sale de las 68 capturas que hizo Cowork (ContaNet 6.0.211,
empresas «Ofipapel 2026» y «Ofipapel 2018»). Las capturas no están en el repositorio: llevan datos reales.

**Qué está comprobado y qué no.** Los menús están completos (41 capturas, todos los desplegables). De
pantallas de trabajo solo hay 12. Lo que hace cada opción que no tiene captura está deducido de su nombre,
y así se marca («sin captura»). Qué módulos usa de verdad Mónica no se sabe todavía.

---

## 1. Cómo es CONTANET por fuera

- **Barra de menús:** Archivo · Edición · Ver · Herramientas · Plan · Diario · Balances · IVA/IGIC ·
  Retenciones · Módulos · ?
- **La pantalla principal es el diario.** No hay «entrar en una opción para meter asientos»: se abre la
  empresa y ya se está escribiendo. Una rejilla con letra grande: marca de punteo · Código (cuenta de 8
  cifras) · Fecha · Asiento · Descripción · Referencia · Canal · Importe. El haber se ve en rojo y con
  signo menos. Debajo, la línea donde se teclea y los botones Calculadora, Debe y Haber.
- **Arriba:** barra de botones, desplegable para cambiar de empresa y pestañas con los años.
- **Abajo (zona de estado):** tipo de diario; totales de la cuenta, del asiento, de lo marcado y del
  diario entero con su descuadre; el árbol de «apuntes modelo» (asientos predefinidos) y el reparto por
  centros de costo.
- **Cada año es una «empresa» distinta**, y se pasa de una a otra con las pestañas.

## 2. Árbol de menús completo

### Archivo
Nuevo · Abrir · Cerrar · Crear empresa de pruebas · Guardar · Guardar como · Mover · Imprimir · Enviar ·
Recibir · Borrar Empresa · Conceptos Contables (F7) · Otros › Editar Otros · Idioma · Exportar · Importar ·
Conversores · Editar · (empresas recientes) · Salir

**Exportar** (con captura) saca, en CSV: plan contable, diario/extracto, datos supletorios, IVA/IGIC,
efectos en cartera, presupuestos, elementos del activo, plan de centros de costo, plan alternativo,
extracto analítico, datos globales, empresa a Excel y diario con IVA/IGIC combinado.

### Edición
Deshacer · Cortar · Copiar · Copiar Sencillo · Pegar · Seleccionar todo · Buscar · Reemplazar · Filtro ·
Punteo · Nombre Empresa · Título de Cuenta · IVA · Cartera · Enviar · Notas · Retenciones · Ver factura

### Ver
Pantalla Completa · Barra de Herramientas · Zona de Estado · Calculadora (F2) · Apuntes Modelo · Punteo ·
Analítica

### Herramientas
- **Utilidades del Programa:** Analizar estructura del Plan · Auditoría (Limpieza) de Archivos ·
  Reindexación · Recálculo de apuntes · Importar datos de otros programas (Plan, Diario/Extractos/Otros,
  Formatos de importación, desde archivo Sec) · Cambiar de N.º a la empresa · Borrar Diario/Extracto o Rango
  de Asientos · Renumerar Número de Asiento · Instalar Red Local · Euros · Ajustar Tamaño de Cuentas ·
  Mayúsculas/Minúsculas · Comprobar Asientos Inexistentes · Remover Movimientos Repetidos · Pasar a
  Referencia (factura o asiento) · Registrar Componentes · Capacidad utilizada por empresas · Bloquear
  empresa para trabajo exclusivo · Actualizar Apuntes Modelo Online
- Personalización · Macros
- **Datos Globales** (la ficha de terceros, común a todas las empresas): Datos Globales · Informes
  (comparativo con nombres de la AEAT, NIF de baja o no identificado) · Utilidades (Auditoría, Otras)
- Copias de seguridad

### Plan
Visualizar Plan (F6) · Consulta del Plan Contable (F4) · Imprimir Plan Contable · Extractos Contables (F5) ·
Gráficos · Informe por N.I.F. · Nuevo PGC 2007 (Relación de cuentas, Comprobar cuentas, Convertir
Contabilidad, Convertir varias, Informe de Conversión) · Datos Adicionales (Consultar Fichas de Datos,
Informe Ficha de Datos, Eliminar Fichas Repetidas, Reemplazar con Datos Globales) · Traspasar Nif a Plan
Contable · Auditoría administrativa del Plan Contable · Naturaleza de las cuentas

Con captura: **Visualización del Plan Contable**, árbol por niveles (1, 2, 3, 4, 5 y 8 cifras), ordenable
por número, alfabético o NIF, con buscador.

### Diario
Diario Oficial · Editar tipos de Diario · Escoger Diario · Grabar Diario en archivo · Exportar Diario ·
Eliminar Diario (por Diario, por Canal) · Regularización · Cierre del ejercicio · Apertura nuevo ejercicio
(Actualizar Apertura, Centros de costo, Crear Nuevo Ejercicio, Crear Nuevo Ejercicio Global) · Diario de
Movimientos Mensuales · Diario de Ingresos y Gastos · Memoria

Con captura: **tipos de diario**, nueve: Ventas, Compras, Gastos, Bancos, Caja y cuatro libres.

### Balances
Balance General · Balance de Sumas y Saldos · Balances Especiales (PGC 1990) · Modelos Financieros ·
Balances Detallados · Sumas y Saldos Comparativo · Sumas y Saldos Entre Fechas · Cuentas Anuales (VBA para
Excel) · Cuentas Anuales (NSZ) · Memoria

Con captura: **Balance de Sumas y Saldos**. Se elige nivel de cuentas, período (de apertura a un mes),
rango de cuentas, grupos, canal, «mes + acumulado», «un balance por mes», «solo cuentas con saldo», y
salida a impresora, pantalla, PDF o Excel.

### IVA/IGIC
Grabar IVA Repercutido (F8) · Grabar IVA Soportado (F9) · Acumulados · Imprimir Libro · Consultar/Editar ·
Renumerar · Tipos de IVA/IGIC · Comprobar Libro con Diario · Corregir N.I.F. · Comprobar Nombres
Libro/Datos Supletorios · Incidencias en Libro · Apuntes con Inversión de Sujeto Pasivo · Apuntes de
Agencia de Viaje

- **Catorce libros**, cada uno con su letra: IVA repercutido y soportado, IGIC repercutido y soportado,
  AIEM repercutido y soportado, cuatro de rectificativas y cuatro de criterio de caja.
- **Comprobar Libro con Diario:** por cuentas de IVA/IGIC (472, 477), por proveedores, acreedores y
  clientes (400, 410, 430), por cuenta y tipo, por gastos e ingresos (6, 7), apuntes al 0 %, crear tipos
  vacíos, comprobar bases imponibles.
- Con captura: **tabla de tipos**, con porcentaje y recargo de equivalencia.

### Retenciones
Acumulados · Visualizar/Imprimir Libro de Retenciones · Comprobar Libro con Diario · Utilidades (Crear
Libro, Crear registros que faltan, Crear Referencias Catastrales desde el Diario, Actualizar importe de
Gastos, Actualizar clave/subclave con el plan)

### Módulos
| Módulo | Opciones | Captura |
|---|---|---|
| Cartera | Grabar Cartera (F11) · Imprimir · Anular Apuntes · Consultar | Consultar e Imprimir |
| Consolidación | | no |
| Amortizaciones (F12) | ficha de cada bien, con «Amortizaciones» y «Contabilizar» | sí |
| Presupuestos | | no |
| Centros de Costo | hasta 5 niveles y cuentas auxiliares | sí (solo la estructura) |
| Cuentas Alternas | | no |
| Control de Morosos | Morosos · Cobros y Pagos Atrasados · Pagos Atrasados por Trimestre · PMP a Proveedores (abreviado y normal) | no |
| Impresión de talones y efectos | | no |
| Liquidación de intereses | | no |
| Conciliación Bancaria | Cuaderno 43 y Excel · importar el extracto como asientos · punteo automático | sí |
| Registro Mercantil | Libros Oficiales · Cuentas Anuales | no |
| Sociedades, Cuentas Anuales y Memoria | (en gris: no contratado) · Módulo RIC/DIC | no |
| Módulo Fiscal | | no |
| Usuarios | Usuarios Activos · Bloquear empresa · Trazabilidad | no |
| Módulo SII | es una DEMO («no apto para su presentación») | sí |
| Previsión de Liquidez | | no |
| Zonas | Crear Zonas | no |
| Módulo 347/415 | Acumular · Último informe 347 · Último informe 415 · Comprobación Cuentas Excluidas | sí |
| Requerimientos | Libros de Requerimiento | no |
| Resumen para declaración de IRPF | | no |
| Periodificación de Cuentas | | no |
| Utilidades Contanet | | no |

### ?
Actualizaciones, soporte, formación y web del fabricante. No se calca.

---

## 3. Comparativa CONTANET ↔ ERP

### Está en los dos (se queda el motor del ERP, con la forma de CONTANET)
| Función | En CONTANET | En el ERP hoy | Qué falta en el ERP |
|---|---|---|---|
| Introducir asientos | Rejilla continua, línea a línea, siempre a la vista | Lista de asientos y un editor aparte | La forma de trabajar entera: es el cambio más grande |
| Plan de cuentas | Árbol por niveles, 8 cifras, con ficha y NIF | Lista de 184 cuentas | El árbol, la búsqueda por NIF y el plan real |
| Extracto de una cuenta | Extractos Contables (F5) | Mayor | Sin captura para comparar |
| Sumas y saldos | Niveles, canal, entre fechas, comparativo, por mes | Uno, por ejercicio | Las opciones |
| Balance y resultados | Balance General, Modelos Financieros, Detallados | Balance de situación, Pérdidas y ganancias | Sin captura para comparar |
| Libros de IGIC | 14 libros | 2 (emitidas y recibidas) | AIEM, rectificativas y criterio de caja, si se usan |
| Modelo 347 | 347 y 415, con claves por cuentas | 347 | El 415 y las claves |
| Conciliación bancaria | Cuaderno 43 y Excel, punteo automático | Cuaderno 43, con reglas que aprenden | Entrada por Excel |
| Cierre y apertura | Regularización, Cierre, Apertura | Cierre con regularización y apertura | Sin captura para comparar |
| Empresas y años | Una «empresa» por año | Empresas con sus ejercicios | Solo darlas de alta |
| Previsión de cobros y pagos | Previsión de Liquidez | Previsión de tesorería | Sin captura para comparar |
| Quién hizo qué | Usuarios, Trazabilidad | Control y firmas | Nada: el ERP tiene más |
| Sacar datos | Exportar, Grabar Diario en archivo | Exportar a gestoría | Formatos |

### Solo en CONTANET (hay que construirlo)
En el orden en que se echarían de menos:

1. **Tipos de diario** (Ventas, Compras, Gastos, Bancos, Caja).
2. **Canales** (Oficina, Almacén 1, Almacén 2…): cada apunte lleva uno y los balances se filtran por él.
3. **Apuntes modelo:** asientos predefinidos que se eligen de un árbol.
4. **Conceptos contables** (F7): textos de descripción ya escritos.
5. **Punteo** de apuntes, a mano y automático.
6. **Referencia** en cada apunte.
7. **Grabar IGIC desde el diario** (F8 y F9) y **comprobar el libro contra el diario**.
8. **Datos globales:** ficha de terceros común a todas las empresas, con comprobación de NIF.
9. **Cartera** de efectos y vencimientos.
10. **Amortizaciones** del inmovilizado.
11. **Centros de costo** (contabilidad analítica).
12. **Retenciones:** libro y acumulados.
13. **Diarios especiales:** Movimientos Mensuales, Ingresos y Gastos.
14. **Morosos y período medio de pago** a proveedores.
15. Presupuestos · Cuentas alternas · Consolidación · Talones y efectos · Liquidación de intereses ·
    Periodificación · Resumen para IRPF · Requerimientos · Libros oficiales y cuentas anuales para el
    Registro Mercantil · Memoria · RIC/DIC · Gráficos · Informe por NIF · Macros.

Los puntos 9 a 15 solo se construyen si se usan. Ver punto 5.

### Solo en el ERP (se conserva, colocado en el menú de CONTANET)
| Utilidad del ERP | Dónde iría |
|---|---|
| Asientos automáticos desde ventas, compras, cobros, pagos y caja | Diario › Generar asientos |
| Asientos pendientes o con errores | Diario |
| Modelos 420 y 425 | IVA/IGIC |
| Remesas SEPA | Módulos, junto a Cartera |
| Conciliación con reglas que aprenden | Módulos › Conciliación Bancaria |
| Resultados por tienda | Balances |
| Exportar a gestoría | Archivo › Exportar |
| Firmas, cierre de meses y comprobación de que nadie tocó un asiento | Módulos › Usuarios |
| Registros VeriFactu | IVA/IGIC |

### No se calca
Euros (viene de la peseta) · Idioma · Instalar Red Local · Registrar Componentes · Reindexación y limpieza
de archivos · Conversión al PGC 2007 y balances del PGC 1990 · Módulo SII (es una demo y no se usa) · el
menú «?».

---

## 4. Lo que falta para poder calcar

**Capturas.** Hay menús de todo, pero pantallas de casi nada. Antes de la fase 4 hacen falta, por orden:

1. Meter un asiento completo: una factura de compra y una de venta con su IGIC (F8 y F9), con la ventana
   que se abre.
2. Extracto de una cuenta (F5) ya abierto, y la consulta del plan (F4) con la ficha de una cuenta.
3. Apuntes modelo: el árbol desplegado y uno aplicado. Conceptos contables (F7).
4. Punteo, en pantalla.
5. Datos Globales: la ficha de un tercero.
6. Libro de IGIC: Consultar/Editar y cómo sale impreso. Acumulados.
7. Balance General y Modelos Financieros: la ventana de opciones y una hoja del resultado.
8. Regularización, Cierre y Apertura: las ventanas (sin ejecutar nada).
9. Cartera › Grabar Cartera, y Retenciones › Libro.

**Datos.** De las trece cosas que exporta CONTANET solo se sacaron cuatro. Faltan efectos en cartera,
elementos del activo, centros de costo, presupuestos y datos globales.

## 5. Qué módulos se usan de verdad

No hace falta preguntarlo: lo dicen los datos. Si la exportación de cartera, de activos o de centros de
costo sale vacía, ese módulo no se usa y no se construye. Esa comprobación la hace Cowork (cuántas filas
tiene cada exportación de la empresa de 2026) y decide el alcance de la fase 4.

Lo único que sí se ve ya en las capturas: se usan canales (hay tres), tipos de diario, apuntes modelo,
centros de costo (al menos uno definido) y punteo.

---

## 6. Los datos (llegaron el 17/11/2026)

Diez ZIP con las exportaciones de CONTANET, 491 MB sin comprimir. No están en el repositorio.

| | Ofipapel | Luis Alayón |
|---|---|---|
| Años | 2018 a 2026 | 2018 a 2026 |
| Líneas de diario al año | entre 228.000 y 318.000 | entre 113 y 5.200 |
| Total de líneas | unos 2,6 millones | unas 8.000 |

**Comprobado**
- Todos los diarios cuadran (debe = haber), salvo la copia vieja «03 Ofipapel 2019», por 10 céntimos.
- Ofipapel 2026: 227.761 líneas, 74.838 asientos, 5.037 cuentas con movimiento, ninguno descuadrado.
  Total 26.187.653,30 €, el mismo que enseña CONTANET en pantalla.
- Ofipapel 2018 vino entero (318.538 líneas): ya no falta.

**Lo que dicen los datos**
- **El 94 % de las líneas de 2026 no las teclea nadie: vienen de GeminisWin.** Lo que se mete a mano son
  unas 13.600 líneas al año: bancos, nóminas, seguros, impuestos.
- **La contabilidad va con retraso.** 2026 está al día hasta septiembre; de octubre hay 354 líneas y de
  noviembre 9.
- **No se usan** la cartera de efectos (vacía) ni los presupuestos (vacíos). No se construyen.
- **Canales:** casi todo va al 001; el 000 y el 002 a 004 se usan muy poco.
- **Luis Alayón** tiene datos de verdad, no de demostración, pero es una contabilidad casi parada: poco
  más de cien líneas al año desde 2021.
- **Años repetidos, resueltos por tamaño:** de 2019 la buena es la «10» (314.795 líneas; la «03» tiene
  40.128 y la «04», 26). De 2020 la buena es la «09 Reparada» (238.174; la «06» tiene 574).
  A confirmar con Mónica, pero no hay duda razonable.
- **No caben todos en la base de datos actual.** El plan gratuito da 500 MB y hay 185 ocupados. Un año
  de Ofipapel ocupa unos 60 MB: cabe 2026 y poco más. Para los nueve años hace falta el plan de pago.

**Formato de los ficheros** (sin cabeceras, separados por tabulador)
- DIARIO, 28 columnas: 1 fecha · 2 cuenta · 3 origen (98 = traspasado, 00 = a mano) · 5 clase
  (A = apertura) · 6 asiento · 7 descripción · 9 importe con signo · 15 canal · 19 fecha de grabación ·
  20 referencia. El resto, vacías o restos de la peseta.
- PLAN_CONTABLE: código, título, nivel y los saldos de cada mes.
- IVA_IGIC: cuenta del tercero, nombre, factura, base, tipo, asiento, cuenta de IGIC, libro (letra),
  fecha, número de orden, porcentaje, total, cuota y referencia.
- DATOS_SUPLEMENTARIOS: la ficha de cada cuenta de tercero (nombre, NIF, dirección, país).
