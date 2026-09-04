# OEX CRM — Paquetería & SHEIN

Aplicación React + Vite para gestionar pedidos de importación SHEIN y envíos de paquetería (Ometepe/Managua), con dashboard, CRM de clientes sin duplicados, facturación PDF, exportación a Excel y seguimiento de estado.

## Instalar y ejecutar

```bash
npm install
cp .env.example .env   # completa tus credenciales de Supabase
npm run dev
```

## Estructura del proyecto

```
src/
  supabase.js              Cliente de Supabase (variables de entorno)
  App.jsx                  Orquestador: sesión, navegación, layout
  main.jsx

  utils/                   Funciones puras (sin React, sin Supabase) — testeables
    numero.js
    fechas.js               Días hábiles Nicaragua, fechas de entrega estimadas
    clientes.js              Normalizadores de filas de Supabase + teléfono
    calculosShein.js         Costos, tax, comisión, resumen SHEIN
    calculosPaqueteria.js    Tarifas por destino/tipo, costo interno por tracking
    historial.js             Línea de tiempo (seguimiento) a partir de audit_log

  services/                 Todo lo que habla con Supabase
    coreService.js           Auditoría, generación de códigos OEX, carga general
    clientesService.js       resolverCliente() — evita clientes duplicados
    pedidosService.js        CRUD + lógica de pedidos SHEIN
    enviosService.js         CRUD + lógica de envíos/paquetería
    gastosService.js
    pdfService.js            Generación de PDFs (jsPDF)
    excelService.js          Exportación a Excel (xlsx)

  hooks/
    useAuth.js               Sesión, perfil, rol
    useDatosOEX.js            Carga de las 6 tablas
    useTarifas.js             Tarifas (persistidas en localStorage)
    useToast.js

  components/               Piezas de UI reutilizables
  pages/                    Una carpeta/archivo por módulo (Dashboard, SHEIN,
                             Paquetería, Finanzas, Clientes, Auditoría, Configuración)

  styles/global.css          Sistema de diseño (variables CSS, modo oscuro)
```

## Cómo evita duplicados de cliente

Cada vez que se guarda un pedido o envío sin usar el buscador de clientes,
`clientesService.resolverCliente()` busca primero por teléfono normalizado
(memoria → base de datos) y solo crea un cliente nuevo si de verdad no existe.
Así cada persona tiene **un solo `codigo_cliente`**, sin importar por qué
módulo se registró primero.

Para blindarlo también a nivel de base de datos, agrega en Supabase:

```sql
ALTER TABLE clientes ADD CONSTRAINT clientes_telefono_unico UNIQUE (telefono);
```

## Costo interno y tarifas en Paquetería

- La tarifa que se cobra al cliente depende de **destino + tipo (marítimo/aéreo)**,
  aplicada tracking por tracking — un envío puede tener trackings mixtos.
- El costo interno (para calcular ganancia real) también se calcula por
  tracking, usando su propio tipo (o un valor manual si lo defines en el
  formulario de registro, sección "Ajustar costo interno por tracking").
- El campo "tipo de envío" del envío se **deriva automáticamente** de sus
  trackings: si son todos iguales usa ese tipo, si están mezclados guarda "Mixto".

## Seguimiento de pedidos/envíos

Cada cambio de estado ya se registra en `audit_log`. La sección "Seguimiento"
en cada pedido/envío arma una línea de tiempo a partir de esos registros —
no requiere cambios en el esquema de la base de datos.

## Identidad de marca aplicada

Colores, tipografía y logo ya siguen el Manual de Identidad OEX v1.0:
Naranja `#F4562D`, Navy `#0F2445`, tipografía Poppins (títulos) + Arial
(texto), fondo con patrón de puntos sutil, y los PDFs usan la misma paleta
con header/footer de marca, tipo de cambio y datos de contacto configurables
en Configuración → Empresa y documentos.

## Pipeline de estados (por destino)

Managua y Ometepe tienen rutas distintas después de "Tránsito OEX"
(`src/utils/estadosEnvio.js`):

- **Managua**: Miami → Tránsito NI → Managua → Tránsito OEX → Tránsito Managua → Punto UNI → Jardines de Veracruz → Entregado
- **Ometepe**: Miami → Tránsito NI → Managua → Tránsito OEX → Tránsito Ometepe → Ometepe → Entregado

Cuando un envío llega a **Punto UNI**, **Jardines de Veracruz** u **Ometepe**
aparece el botón "📦 Avisar listo para retirar" en la lista de envíos: baja
el PDF del recibo (para que lo adjuntes manualmente — WhatsApp no permite
adjuntar archivos desde un link `wa.me`, solo texto) y abre WhatsApp con un
mensaje que incluye la dirección del punto (si la configuraste) y el saldo
pendiente.



Los valores por defecto en `src/hooks/useTarifas.js` y los estados de envío en
`src/utils/estadosEnvio.js` ya reflejan tu operación real, tomados de
`OEX_FINANCE.xlsx`:

- **Tarifas**: Ometepe estándar ($2.90 aéreo / $7.50 marítimo), Managua
  estándar ($2.50 / $6.50), y un tercer nivel **Emprendedor Ometepe**
  ($2.50 / $6.00) — aparece automáticamente en el selector de tarifa cuando
  el destino es Ometepe. Edítalos en Configuración cuando cambien.
- **Estados de envío**: ver sección "Pipeline de estados (por destino)" arriba.
- **ID de almacén**: cada tracking ahora tiene un campo `almacenId` separado
  del número de tracking — es el ID que asigna tu courier (Global Connection)
  apenas el paquete llega a Miami, antes de tener tracking asignado. Se
  busca junto con el tracking en la lista de envíos, y se incluye en la
  exportación a Excel.

## Base de datos

Ejecuta tu `schema.sql` en el SQL editor de Supabase. Tablas usadas:
`clientes`, `pedidos`, `envios`, `tracking_registros` (prealertas),
`gastos_operativos`, `audit_log`, `perfiles`.

RPCs esperadas: `generar_codigo_oex(p_tipo)`, `generar_codigo_cliente_oex()`
(si no existen, el código cae a un generador local de respaldo).
