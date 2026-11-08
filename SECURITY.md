# Política de seguridad

Este repositorio es público y contiene aplicaciones internas de Ofipapel. Si encuentras
un fallo de seguridad o datos que no deberían estar expuestos:

1. **No lo publiques** ni abras una incidencia pública con los detalles.
2. Avísalo en privado: usa «Report a vulnerability» en la pestaña *Security* de este
   repositorio, o díselo directamente al propietario.
3. Indica qué has visto, dónde y cómo reproducirlo. No hace falta que accedas a datos
   reales para demostrarlo: basta con describir el fallo.

Qué cabe esperar: acuse de recibo en unos días, corrección priorizada según el riesgo y
aviso cuando esté cerrado. Los secretos se guardan solo en las variables de entorno de
Netlify, nunca en el código (`scripts/comprobar-secretos.sh` lo vigila en cada cambio).

Las políticas internas están en [`docs/seguridad/`](docs/seguridad/).
