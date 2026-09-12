# Presupuestos Nono - V14

## Cambios en la app

- Nuevo producto especial: **Mallas**.
- Mallas no tiene subtipo.
- Se cotiza por unidad.
- El usuario ingresa:
  - cantidad pedida;
  - precio unitario USD/Und.
- El subtotal de Mallas es `cantidad x precio unitario`.
- Se agrega el nuevo `TipoCalculoLinea = 'unidad'`.
- En las tarjetas de productos el largo sólo se muestra cuando existe y es mayor que cero.
- Para Mallas y Recortes no se muestra Largo.
- La calculadora de metales devuelve ahora también el largo utilizado, para conservarlo en las líneas calculadas cuando corresponda.
- Se elimina del frontend el campo **Cotización USD**.

## Cambios en el PDF

Orden de columnas:

1. Producto
2. Unid.
3. Cant.
4. Precio
5. Imp. (U$S)

Criterios:

- **Unid.** = cantidad física pedida: 5 caños, 3 mallas, 4 chapas, etc.
- **Cant.** = cantidad cotizada con unidad de medida:
  - productos por peso: kg;
  - chapas por metro: m;
  - Mallas: Und.
- **Precio** usa 4 decimales.
- Se elimina Total en pesos.
- Se elimina Total de kg.
- Se mantiene sólo Total U$S.
- Se elimina la cotización del dólar del pie.
- Se elimina Dirección del encabezado del cliente.
- Teléfono queda debajo del nombre del cliente.
- Se agrega el número de presupuesto debajo de “Cotización”.
- La letra X queda centrada respecto de los márgenes de la tabla.
- “VENDEDOR” pasa a “CONTACTO”.

## Archivos a reemplazar

- `src/App.tsx`
- `src/types/presupuesto.ts`
- `src/db/lineasPresupuestoService.ts`
- `src/db/presupuestosService.ts`
- `src/components/MetalWeightCalculatorModal.tsx`
- `src/pdf/presupuestoPdfService.ts`

No se requiere una nueva versión de IndexedDB porque no se agregan índices ni tablas.
