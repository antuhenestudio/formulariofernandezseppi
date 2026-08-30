# Neuquén Escucha

Plataforma de participación ciudadana: los vecinos cargan reclamos, proyectos e ideas desde `index.html`, y el equipo del Ing. Rubén Fernández Seppi los audita y analiza desde `admin.html`.

## Estructura del proyecto

```
/
├── index.html              → Formulario público (lo que ve el vecino)
├── admin.html               → Panel de estadísticas (lo que ves vos/tu equipo)
├── assets/
│   ├── shared.css           → Estilos comunes a ambas páginas
│   ├── shared.js             → Config de Supabase + datos comunes (barrios, categorías)
│   ├── citizen.js            → Lógica del formulario público
│   └── admin.js               → Lógica del panel (login, KPIs, gráficos, exportar)
├── supabase-schema.sql      → Script SQL para crear la base de datos en Supabase
└── README.md                 → Este archivo
```

**Regla de oro:** si necesitás cambiar algo del panel de estadísticas, tocás `admin.html` / `admin.js` y no rozás el formulario público. Si necesitás cambiar algo del formulario, tocás `index.html` / `citizen.js` y no rozás el panel. Los barrios, categorías y la configuración de Supabase están en un solo lugar (`assets/shared.js`) para no tener que duplicar cambios en los dos archivos.

## 1. Poner en marcha sin Supabase (modo prototipo)

Si subís el repositorio a GitHub Pages tal cual, **ya funciona**: el formulario guarda los datos solo en la memoria del navegador (se pierden al recargar), y `admin.html` te deja entrar con cualquier usuario/contraseña, mostrando datos de ejemplo. Sirve para mostrar el diseño, probar el flujo, o hacer una demo — **no para producción real**, porque los datos no se guardan de verdad y cualquiera puede entrar al panel.

## 2. Configurar Supabase (para datos reales y login seguro)

Supabase es gratis para este volumen de uso (plan Free: hasta 500MB de base de datos y 50.000 usuarios activos por mes, más que suficiente).

### Paso a paso

1. Creá una cuenta en [supabase.com](https://supabase.com) y un proyecto nuevo.
2. Andá a **SQL Editor** → **New query**, pegá todo el contenido de [`supabase-schema.sql`](./supabase-schema.sql) y ejecutalo (botón "Run"). Esto crea las tablas, los índices, la seguridad (RLS) y la función de estadísticas públicas.
3. Andá a **Settings → API** y copiá dos valores: **Project URL** y **anon public key**.
4. Abrí `assets/shared.js` y reemplazá estas dos líneas con tus valores:
   ```js
   const SUPABASE_URL = "https://TU-PROYECTO.supabase.co";
   const SUPABASE_ANON_KEY = "TU_ANON_KEY";
   ```
5. Creá tu primer usuario administrador — los pasos exactos están al final de `supabase-schema.sql`, en resumen:
   - **Authentication → Users → Add user**: cargá tu email y una contraseña.
   - Volvé al SQL Editor y corré:
     ```sql
     update public.profiles set role = 'super_admin' where email = 'tu-email@ejemplo.com';
     ```
6. Subí los cambios a GitHub. Listo: el formulario ya guarda en Supabase de verdad, y `admin.html` solo deja entrar a los usuarios con rol asignado.

### Seguridad: cómo queda protegido

- El login usa **Supabase Auth** (el mismo sistema que usan miles de apps en producción) — contraseñas hasheadas, nunca en texto plano.
- La tabla de registros tiene **Row Level Security (RLS)** activado: cualquiera puede *insertar* un reclamo nuevo (necesario para que el formulario público funcione sin login), pero **nadie puede leer, editar ni borrar nada sin haber iniciado sesión con un rol autorizado** (`admin`, `super_admin` o `visor`).
- Un usuario nuevo que se registre queda con rol `sin_asignar` (sin ningún acceso) hasta que un `super_admin` le asigne rol manualmente desde el SQL Editor — nadie puede autoasignarse permisos.
- La `anon key` que va en `shared.js` es pública por diseño (así funciona Supabase) — la seguridad real la da RLS, no el secreto de esa key.

### Roles disponibles

| Rol | Puede ver el panel | Puede Validar/Descartar registros | Puede asignar roles a otros |
|---|---|---|---|
| `visor` | ✅ | ❌ | ❌ |
| `admin` | ✅ | ✅ | ❌ |
| `super_admin` | ✅ | ✅ | ✅ (solo desde SQL Editor) |

## 3. Verificación por edad y comprobantes (ya vienen configurados)

- **Regla de verificación:** las personas de **40 años o más** cargan su reclamo directo. Las **menores de 40** pasan primero por una verificación antispam vía WhatsApp (reciben un código de 4 dígitos y lo confirman en el sitio). Esto reduce cargas falsas del segmento más propenso a usar formularios de forma automatizada/maliciosa, sin ponerle una fricción extra a los vecinos mayores. El número se cambia en `assets/citizen.js`, buscando `EDAD_MINIMA_SIN_VERIFICACION`.
- **Comprobante:** al terminar de cargar, aparece un botón "Recibir comprobante por WhatsApp" que abre WhatsApp con un mensaje ya armado (resumen del reclamo) para que la persona se lo envíe a sí misma como constancia. No tiene costo ni depende de ningún servicio de terceros — usa el enlace estándar `wa.me`.
- Si en el futuro querés notificaciones por **SMS real** (por ejemplo con Twilio) o **email transaccional** (por ejemplo con Resend, que tiene plan gratis), es una capa aparte que se agrega llamando a una Edge Function de Supabase desde `finalizeSubmission()` en `citizen.js` — avisame si querés que lo armemos, ambos tienen algún costo o límite gratuito mensual a diferencia de WhatsApp.

## 4. El video de bienvenida obligatorio

En `assets/citizen.js`, buscá esta línea para cambiar el video:
```js
const GATE_VIDEO_ID = "GhmAAyCkHg4"; // el ID es la parte final de la URL de YouTube
```
Aparece como un popup ajustado a la pantalla apenas se entra al sitio, con volumen al 30% (cuando el navegador lo permite — algunos exigen un toque para activar el sonido, es una política de los navegadores, no del código). Tiene botón de cerrar (X) en todo momento, y hay un límite de seguridad de 7 segundos: si YouTube no llega a cargar, se habilita el acceso al sitio igual.

## 5. Publicar en GitHub Pages

1. Subí todo este repositorio a GitHub.
2. En el repositorio: **Settings → Pages → Branch**: elegí `main` (o la rama que uses) y carpeta `/ (root)`.
3. En un par de minutos el sitio queda disponible en `https://tu-usuario.github.io/nombre-del-repo/`.
4. El link al panel es `https://tu-usuario.github.io/nombre-del-repo/admin.html`.

## 6. Barrios, categorías y subproblemáticas

Todo vive en `assets/shared.js`, en las constantes `barriosNeuquen`, `subcategoriasDict` y `barrioCoords`. Agregar un barrio o una subproblemática nueva es agregar una línea ahí — se refleja automáticamente en el formulario público y en los filtros del panel, sin tocar ningún otro archivo.
