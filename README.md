# Neuquén Escucha

Plataforma de participación ciudadana: los vecinos cargan reclamos, proyectos e ideas desde `index.html`, y el equipo del Ing. Rubén Fernández Seppi los audita y analiza desde `admin/` (el panel **no tiene ningún botón ni link visible en la web pública** — se accede escribiendo la URL directamente).

## Estructura del proyecto

```
/
├── index.html              → Formulario público (lo que ve el vecino)
├── admin/
│   └── index.html            → Panel de estadísticas (URL: /admin/, sin link público)
├── assets/
│   ├── shared.css           → Estilos comunes a ambas páginas
│   ├── shared.js             → Config de Supabase + datos comunes (barrios, categorías)
│   ├── citizen.js            → Lógica del formulario público
│   └── admin.js               → Lógica del panel (login, KPIs, gráficos, exportar)
├── supabase-schema.sql      → Script SQL para crear la base de datos en Supabase
└── README.md                 → Este archivo
```

**Regla de oro:** si necesitás cambiar algo del panel de estadísticas, tocás `admin/index.html` / `admin.js` y no rozás el formulario público. Si necesitás cambiar algo del formulario, tocás `index.html` / `citizen.js` y no rozás el panel. Los barrios, categorías y la configuración de Supabase están en un solo lugar (`assets/shared.js`) para no tener que duplicar cambios en los dos archivos.

## 1. Poner en marcha sin Supabase (modo prototipo)

Si subís el repositorio a GitHub Pages tal cual, **ya funciona**: el formulario guarda los datos solo en la memoria del navegador (se pierden al recargar), y el panel (`/admin/`) te deja entrar con cualquier usuario/contraseña, mostrando datos de ejemplo. Sirve para mostrar el diseño, probar el flujo, o hacer una demo — **no para producción real**, porque los datos no se guardan de verdad y cualquiera puede entrar al panel.

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
6. Subí los cambios a GitHub. Listo: el formulario ya guarda en Supabase de verdad, y el panel solo deja entrar a los usuarios con rol asignado.

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

## 3. Verificación antispam por CAPTCHA (falta un paso tuyo)

El formulario usa **Cloudflare Turnstile** (gratis, sin pedir teléfono, sin cuenta de pago) para evitar cargas automatizadas/falsas. El botón de enviar aparece **bloqueado con candado** hasta que la persona resuelve el casillero de verificación — recién ahí se habilita.

Por ahora está usando la *site key* de prueba oficial de Cloudflare (`1x00000000000000000000AA`), que siempre muestra un aviso de "Solo para pruebas" — hay que reemplazarla por la tuya real:

1. Entrá a [dash.cloudflare.com](https://dash.cloudflare.com) (gratis, no pide tarjeta), creá una cuenta si no tenés.
2. En el menú, buscá **Turnstile** → **Add site**. Poné el dominio de tu sitio (`antuhenestudio.github.io` o tu dominio propio si tenés uno), modo **Managed**.
3. Te va a dar una **Site Key**. Copiala.
4. En `index.html`, buscá esta línea (cerca del botón de enviar) y reemplazá el valor de ejemplo por tu Site Key real:
   ```html
   <div class="cf-turnstile" data-sitekey="1x00000000000000000000AA" ...>
   ```
5. Subí el cambio a GitHub. Listo — a partir de ahí el CAPTCHA es real.

**Sobre la regla de edad anterior:** antes había una regla que saltaba la verificación a partir de los 40 años (cuando la verificación era por WhatsApp, más incómoda). Con CAPTCHA — mucho más simple, un solo click — ya no hace falta esa excepción: **todos** pasan por la misma verificación, sin importar la edad.

## 4. Adjuntar fotos, videos y PDF

Cada reclamo puede incluir hasta **5 fotos, 3 videos y 2 PDF** (15MB máximo por archivo). Se van agregando de a uno: la persona elige un archivo, se suma a una lista con su nombre y tamaño (con botón para quitarlo si se equivocó), y puede repetir hasta llegar al límite de cada tipo. Los límites se pueden cambiar en `assets/citizen.js`, buscando `LIMITES_ADJUNTOS`.

Los archivos se suben a Supabase Storage al enviar el formulario, y quedan visibles solo desde el panel admin (botón "Ver foto"/"Ver video"/"Ver PDF" en la tabla, y en el popup de cada punto del mapa) — nunca son públicos.

## 5. El video de bienvenida obligatorio

En `assets/citizen.js`, buscá esta línea para cambiar el video:
```js
const GATE_VIDEO_ID = "GhmAAyCkHg4"; // el ID es la parte final de la URL de YouTube
```
Aparece como un popup ajustado a la pantalla apenas se entra al sitio, con volumen al 30% (cuando el navegador lo permite — algunos exigen un toque para activar el sonido, es una política de los navegadores, no del código). Tiene botón de cerrar (X) en todo momento, y hay un límite de seguridad de 7 segundos: si YouTube no llega a cargar, se habilita el acceso al sitio igual.

## 6. Publicar en GitHub Pages

1. Subí todo este repositorio a GitHub.
2. En el repositorio: **Settings → Pages → Branch**: elegí `main` (o la rama que uses) y carpeta `/ (root)`.
3. En un par de minutos el sitio queda disponible en `https://tu-usuario.github.io/nombre-del-repo/`.
4. El panel queda en `https://tu-usuario.github.io/nombre-del-repo/admin/` — **no hay ningún botón que lleve ahí desde la página pública**, a propósito. Guardalo en tus favoritos o compartilo solo con quien tenga que usarlo.

**Importante — esto no reemplaza la seguridad real:** que la URL no tenga un link visible solo evita que un visitante casual la encuentre por accidente; no es una barrera real (alguien podría adivinarla, encontrarla en el historial del navegador, en una captura, etc.). La protección de verdad sigue siendo el login con usuario y contraseña de Supabase Auth que ya tiene el panel — eso es lo que impide que alguien sin credenciales válidas vea los datos, aunque llegue a la URL.

## 7. Evitar que Supabase pause el proyecto por falta de uso

El plan gratuito de Supabase **pausa el proyecto después de 7 días sin ninguna llamada a la API** (no borra los datos, pero el sitio deja de responder hasta reactivarlo manualmente desde el dashboard). Este repositorio incluye un workflow de GitHub Actions (`.github/workflows/keep-alive.yml`) que hace una consulta mínima cada 3-4 días para que esto nunca pase, sin costo extra.

Para activarlo (una sola vez):
1. En GitHub: **Settings → Secrets and variables → Actions → New repository secret**.
2. Creá dos secrets con los mismos valores que pusiste en `assets/shared.js`:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
3. Listo. Podés probarlo manualmente desde la pestaña **Actions** del repositorio → `Mantener Supabase activo` → botón **Run workflow**.

Si en algún momento el proyecto crece y necesita estar siempre disponible sin depender de este workaround (por ejemplo, si empieza a recibir tráfico real de forma sostenida), la alternativa definitiva es pasar al plan **Pro de Supabase (USD 25/mes)**, que no pausa proyectos y suma backups diarios.

## 8. Barrios, categorías y subproblemáticas

Todo vive en `assets/shared.js`, en las constantes `barriosNeuquen`, `subcategoriasDict` y `barrioCoords`. Agregar un barrio o una subproblemática nueva es agregar una línea ahí — se refleja automáticamente en el formulario público y en los filtros del panel, sin tocar ningún otro archivo.
