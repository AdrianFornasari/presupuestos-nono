Ya incorporé el MVP de calculadora de metales en Presupuestos Nono.

Archivos agregados/modificados:
- src/App.tsx
- src/components/MetalWeightCalculatorModal.tsx
- src/components/MetalWeightCalculatorModal.css

Funcionamiento:
- En el formulario Agregar producto, al entrar al campo Peso total, si está vacío o en 0, abre un modal centrado.
- El modal calcula peso para:
  - Chapa / planchuela
  - Barra redonda
  - Barra cuadrada
  - Tubo cuadrado
  - Tubo rectangular
  - Caño redondo
- Usa densidad fija de acero: 7850 kg/m³.
- Toma la cantidad desde el campo Cantidad.
- Al aceptar, carga Peso total con 4 decimales.
- El subtotal debe seguir siendo Peso total * Precio unitario.

Quiero revisar compilación, errores de TypeScript y UX en Android.