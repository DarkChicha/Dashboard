# Deploy — Sorteo HO y Reserva de Isla (Apps Script)

Dos proyectos independientes en script.google.com. Cada uno con su propia URL.

## 1. Proyecto SORTEO (APPS_SCRIPT_URL)

1. Ir a script.google.com → Nuevo proyecto → borrar el código por defecto
2. Pegar TODO el contenido de `AppsScript/sorteo.gs`
3. Guardar → Implementar → Nueva implementación → **Web app**
   - Ejecutar como: **Yo (tu cuenta @henribarrett.com)**
   - Acceso: **Cualquier persona**
4. Copiar la URL y pegarla en `Sorteo/index.html` → `APPS_SCRIPT_URL`
5. Test: confirmar un sorteo → verificar mail a renzo+suzanne, eventos en "Social Content Studio Calendar", mails a editores

## 2. Proyecto RESERVAS (RESERVAS_SCRIPT_URL)

1. script.google.com → Nuevo proyecto → pegar `AppsScript/reservas.gs`
2. **Habilitar Calendar API**: Extensiones → Servicios → agregar "Calendar API"
3. En el código, reemplazar:
   - `RES_TEAM` → pegar el contenido real de `reservas-team.js`
   - `BC_CLIENT_ID` / `BC_CLIENT_SECRET` → de launchpad.37signals.com/integrations
   - `REDIRECT_URI` → la URL del Web App (se conoce después del deploy)
4. Implementar como **Web app** (Ejecutar como: Yo / Acceso: Cualquier persona)
5. **Autorizar Basecamp** — abrir en el navegador:
   `https://launchpad.37signals.com/authorization/new?type=web_server&client_id=TU_CLIENT_ID&redirect_uri=TU_URL_WEBAPP`
   → autorizar → el script guarda el token automáticamente
6. Pegar la URL en `Reservas/index.html` → `RESERVAS_SCRIPT_URL`
7. Test: elegir nombre → ver proyectos cargados → reservar → evento verde en Calendar + fila en "Registro de Edición"

## Orden recomendado

1. **Primero Sorteo** (no necesita OAuth) — test rápido
2. **Después Reservas** (OAuth Basecamp = único paso manual)
