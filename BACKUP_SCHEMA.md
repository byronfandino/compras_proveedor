# Esquema de copia de Compras Offiesco

La copia JSON nueva usa UTF-8 y el formato `compras-offiesco`, versión 1:

```json
{
  "format": "compras-offiesco",
  "version": 1,
  "app": "Compras Offiesco",
  "exportedAt": "2026-10-25T15:00:00.000Z",
  "products": [
    { "reference": "OFI-2048", "quantity": 4 }
  ]
}
```

La referencia es texto no vacío y única, ignorando mayúsculas/minúsculas y espacios repetidos. La cantidad es un entero seguro no negativo. No se exportan identificadores internos ni índices de IndexedDB.

El importador admite el formato nuevo y copias `inventario-local` versiones 1 y 2. Para estas últimas convierte el código de barras cuando existe; si no, usa el nombre antiguo como referencia. Conserva las cantidades y descarta los campos que ya no existen en Compras Offiesco. La base de datos de InventarioPhone no se abre ni se modifica.

CSV sigue disponible como formato de exportación, con BOM UTF-8, encabezados y celdas entrecomilladas con escape de comillas. El proyecto original solamente importaba copias JSON; por eso CSV no se presenta como formato importable.

Los archivos exportados se nombran `compras_offiesco_DD-MM-AAAA_HH-mm-ss.ext`, en la hora local del dispositivo.

La importación JSON valida el archivo completo antes de escribir. En modo reemplazo, `clear` y todas las altas ocurren dentro de una transacción `readwrite`, por lo que una falla revierte la operación completa. En modo agregar, un conflicto de referencia impide que se guarde cualquier producto.
