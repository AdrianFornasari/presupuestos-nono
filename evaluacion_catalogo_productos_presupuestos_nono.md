# Evaluación: catálogo de productos cotizados en Presupuestos Nono
Agregado adrian
## 1. Pedido del usuario

El usuario consulta si la app podría ir recopilando automáticamente cada producto ingresado en los presupuestos para formar una especie de catálogo de productos cotizados. La finalidad sería que, en presupuestos posteriores, pueda seleccionar rápidamente un producto ya usado en vez de volver a escribir manualmente la descripción, unidad, peso total o precio unitario.

La idea es razonable y puede aportar mucho valor, especialmente porque la app está pensada para uso frecuente, en tablet, con una interfaz simple y con foco en reducir carga visual y movimientos innecesarios.

---

## 2. Ventajas

### 2.1. Menos carga manual

El principal beneficio es que el usuario no tendría que escribir varias veces productos similares o repetidos. En una actividad de presupuestación de hierros, aceros y productos relacionados, es esperable que muchas descripciones se repitan con pequeñas variaciones.

Esto puede ahorrar tiempo y reducir errores de tipeo.

### 2.2. Mejor consistencia en las descripciones

Si el producto ya fue ingresado antes, seleccionarlo desde un catálogo ayuda a mantener nombres más uniformes.

Por ejemplo, evita que un mismo producto quede cargado como:

- `Hierro redondo 10 mm`
- `Redondo 10mm`
- `H. redondo 10`
- `Hierro liso redondo 10`

La consistencia mejora la lectura de presupuestos, el historial y eventuales búsquedas futuras.

### 2.3. Menos esfuerzo visual

Como el usuario final tiene dificultades visuales, reducir la escritura manual es especialmente valioso. Un buscador con botones grandes y resultados claros puede ser más cómodo que ingresar textos largos repetidamente.

### 2.4. Base para mejoras futuras

Un catálogo simple puede ser el punto de partida para futuras funciones:

- productos frecuentes;
- últimos productos usados;
- búsqueda por descripción;
- autocompletado;
- actualización de precios;
- estadísticas de productos más cotizados;
- plantillas de presupuestos;
- precios sugeridos.

---

## 3. Riesgos y desventajas

### 3.1. Catálogo sucio o duplicado

Si se guarda automáticamente todo lo que el usuario escribe, el catálogo puede llenarse de variantes, errores o productos casi iguales.

Ejemplo:

- `Chapa 1/8`
- `chapa 1/8`
- `Chapa 1/8 pulg`
- `Chapa 1/8"`
- `Chpa 1/8`

Esto puede hacer que el catálogo termine siendo confuso y más difícil de usar.

### 3.2. Riesgo de usar precios viejos

Guardar el precio unitario anterior puede ser cómodo, pero también peligroso si el usuario selecciona un producto viejo y no revisa el precio.

En el rubro de hierros y aceros, los precios pueden cambiar con frecuencia. Por eso, el catálogo no debería cargar precios como si fueran definitivos sin avisar o permitir edición clara.

### 3.3. Peso total no siempre es reutilizable

El campo `Peso total` depende de la cantidad, largo, medidas o cálculo específico de ese presupuesto. En muchos casos no conviene guardarlo como atributo fijo del producto.

Ejemplo: un perfil IPN 100 puede cotizarse en 6 metros, 12 metros o varias unidades. El peso total cambia según el caso.

Por eso, conviene diferenciar entre:

- datos relativamente estables del producto: descripción, unidad, tipo de producto;
- datos variables del presupuesto: cantidad, peso total, precio unitario.

### 3.4. Más complejidad de interfaz

Si se agrega una pantalla completa de catálogo, administración, edición, borrado, categorías, etc., se corre el riesgo de hacer la app más compleja de lo necesario.

La prioridad de esta app debe seguir siendo: pocos botones, flujo simple, pantalla clara y sin scroll innecesario.

---

## 4. Recomendación general

La idea es conveniente, pero debe implementarse de manera gradual y con el menor impacto posible en la pantalla principal.

La recomendación es no empezar con un “catálogo” complejo, sino con una función de **productos usados recientemente / productos guardados automáticamente**.

En vez de pedir al usuario que administre un catálogo desde cero, la app puede aprender de los productos cargados en presupuestos anteriores y ofrecerlos como sugerencias.

---

## 5. Implementación más sencilla y cómoda para el usuario

### 5.1. Enfoque recomendado para MVP

Agregar en la tarjeta **Agregar producto** un botón grande:

> Buscar producto anterior

Al tocarlo, se abre una modal centrada, similar a la calculadora de metales, con fondo oscuro y textos grandes.

Dentro de la modal:

1. Campo de búsqueda grande.
2. Lista de productos encontrados.
3. Cada resultado muestra:
   - descripción;
   - unidad;
   - último precio unitario usado;
   - fecha o presupuesto de último uso, si se desea.
4. Botón grande `Usar`.

Al tocar `Usar`, la app completa automáticamente:

- descripción;
- unidad;
- precio unitario sugerido.

Y deja para que el usuario cargue o revise manualmente:

- cantidad;
- peso total.

Esto evita cargar automáticamente datos que pueden depender de cada operación.

---

## 6. Qué datos conviene guardar

Para cada producto usado, conviene guardar o derivar estos campos:

```ts
interface ProductoCatalogo {
  id: string;
  descripcionNormalizada: string;
  descripcionVisible: string;
  unidad: string;
  ultimoPrecioUnitario: number;
  cantidadUsos: number;
  ultimaFechaUso: string;
  creadoEn: string;
  actualizadoEn: string;
}
```

### Campos recomendados

| Campo | Uso |
|---|---|
| `descripcionVisible` | texto que verá el usuario |
| `descripcionNormalizada` | clave interna para detectar duplicados |
| `unidad` | unidad habitual del producto |
| `ultimoPrecioUnitario` | precio sugerido, editable |
| `cantidadUsos` | permite ordenar por productos más frecuentes |
| `ultimaFechaUso` | permite mostrar primero lo usado recientemente |

---

## 7. Qué datos NO conviene guardar como fijos

No conviene guardar como valor fijo automático:

- `cantidad`;
- `pesoTotal`;
- `subtotal`.

Estos datos pertenecen a cada presupuesto concreto.

Sí podría guardarse a futuro un dato auxiliar como `pesoUnitarioKgPorMetro` o `perfilNormalizado`, pero eso ya sería una etapa posterior más avanzada.

---

## 8. Regla para evitar duplicados

Cuando se agregue un producto a un presupuesto, la app puede generar una versión normalizada de la descripción:

- pasar a minúsculas;
- quitar espacios dobles;
- quitar puntos innecesarios;
- unificar coma/punto;
- quitar espacios al inicio y final.

Ejemplo:

```ts
function normalizarDescripcion(texto: string): string {
  return texto
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}
```

Luego, antes de crear un nuevo producto de catálogo, busca si ya existe uno con esa descripción normalizada y la misma unidad.

Si existe, actualiza:

- último precio;
- cantidad de usos;
- fecha de último uso.

Si no existe, crea un nuevo producto.

---

## 9. Flujo recomendado

### Al agregar un producto nuevo

Cuando el usuario presiona `Agregar producto`:

1. Se guarda la línea del presupuesto como hasta ahora.
2. La app busca si ese producto ya existe en catálogo.
3. Si existe:
   - actualiza precio unitario;
   - suma un uso;
   - actualiza fecha.
4. Si no existe:
   - lo agrega al catálogo automáticamente.

El usuario no tiene que hacer nada adicional.

### Al usar un producto anterior

En la tarjeta `Agregar producto`:

1. Usuario toca `Buscar producto anterior`.
2. Se abre modal de búsqueda.
3. Usuario busca por texto o ve productos recientes.
4. Usuario toca `Usar`.
5. Se completan descripción, unidad y precio unitario.
6. Usuario carga cantidad y peso total.
7. Usuario confirma con `Agregar producto`.

---

## 10. Diseño de interfaz recomendado

### Botón en la tarjeta Agregar producto

Ubicación sugerida:

- debajo del título `Agregar producto`;
- antes del campo descripción.

Texto:

> Buscar producto anterior

Debe ser un botón grande, con el mismo estilo de la app.

### Modal de selección

La modal debería tener:

- título: `Buscar producto`;
- input grande de búsqueda;
- resultados en tarjetas;
- botón `Usar`;
- botón `Cerrar`.

Ejemplo de tarjeta:

```text
Hierro redondo 10 mm
Unidad: kg
Último precio: u$s 2,5000
[Usar]
```

---

## 11. Variante aún más simple

Si se quiere una primera versión muy mínima, se puede evitar crear una tabla nueva y simplemente buscar en las líneas ya cargadas históricamente.

Es decir: consultar todas las `lineasPresupuesto`, agrupar por descripción + unidad, y mostrar las más recientes o frecuentes.

### Ventajas

- No requiere migrar estructura de base de datos.
- No agrega tabla nueva.
- Se puede implementar rápido.
- Usa datos reales ya existentes.

### Desventajas

- Puede ser más lento si en el futuro hay muchísimas líneas.
- Menos control sobre edición o limpieza del catálogo.
- Más difícil eliminar productos mal cargados.
- Más difícil consolidar duplicados.

Para el estado actual de la app, esta variante puede ser suficiente como primer paso.

---

## 12. Recomendación técnica final

Para implementar más adelante, sugiero hacerlo en dos etapas.

### Etapa 1: búsqueda sobre productos ya cargados

Implementar una modal que busque en las líneas históricas existentes.

No se crea todavía una tabla `productosCatalogo`.

La app genera una lista derivada:

- agrupa por descripción + unidad;
- toma el último precio usado;
- ordena por uso reciente;
- permite seleccionar y completar el formulario.

Esta es la opción más rápida y menos riesgosa.

### Etapa 2: catálogo persistente

Cuando la función ya esté probada, crear una tabla real:

```ts
productosCatalogo
```

Y guardar allí productos consolidados, con contador de uso, último precio y fecha.

Esto permitiría después:

- editar productos del catálogo;
- ocultar productos mal cargados;
- marcar favoritos;
- ordenar por frecuencia;
- mostrar precio histórico;
- exportar catálogo.

---

## 13. Archivos que probablemente habría que tocar

Para una implementación simple basada en historial:

- `src/App.tsx`
- `src/index.css`
- `src/db/lineasPresupuestoService.ts`

Probablemente no sería necesario modificar el esquema de Dexie si se consulta directamente `lineasPresupuesto`.

Para una implementación con catálogo persistente:

- `src/types/presupuesto.ts`
- `src/db/appDb.ts`
- `src/db/productosCatalogoService.ts`
- `src/db/lineasPresupuestoService.ts`
- `src/App.tsx`
- `src/index.css`
- `src/db/backupService.ts`

---

## 14. Conclusión

El pedido es muy conveniente y está alineado con el objetivo central de la app: reducir carga manual, simplificar el uso en tablet y evitar movimientos innecesarios.

La implementación más cómoda para el usuario sería que la app aprenda automáticamente de los productos ya ingresados y ofrezca un botón `Buscar producto anterior` dentro de la tarjeta `Agregar producto`.

Para una primera versión, conviene evitar un catálogo administrable complejo. Lo más simple es buscar y reutilizar productos desde las líneas históricas ya existentes. Luego, si la función resulta útil, se puede evolucionar hacia un catálogo persistente con edición, limpieza y favoritos.
