# ESPECIFICACIÓN — Backends Apps Script + Frontend Reservas

> Contrato técnico aprobado por Guille (2026-08-12). Implementar EXACTAMENTE lo aquí descrito.
> Stack: Google Apps Script (ES5/ES6 compatible con Apps Script), HTML/JS/CSS vanilla en frontend.

---

## 0. Archivos a crear/modificar

```
AppsScript/
├── sorteo.gs      → backend Sorteo Home Office (se pega en script.google.com, proyecto propio)
├── reservas.gs    → backend Reserva de Isla (proyecto propio, SEPARADO del sorteo)
└── LEEME.md       → guía de deploy (lo escribe el orquestador, NO Claude)

Reservas/index.html → MODIFICAR: select dinámico de proyectos (Basecamp) + select de islas HEBA
```

Los dos scripts son **plataformas independientes**: cada uno vive en su propio proyecto de Apps Script con su propia URL de Web App.

---

## A) `sorteo.gs` — backend del Sorteo Home Office

### A.1 Configuración (constantes al inicio del archivo, con comentarios)

```javascript
var CALENDAR_NAME = "Social Content Studio Calendar";
var RRHH_EMAILS   = ["PEGA_EMAIL_RRHH_1@henribarrett.com", "PEGA_EMAIL_RRHH_2@henribarrett.com"];
var HO_INVITEES   = ["PEGA_EMAIL_PROJECTS@henribarrett.com", "PEGA_EMAIL_GIANCARLO@henribarrett.com",
                     "PEGA_EMAIL_PABLO@henribarrett.com", "PEGA_EMAIL_RENZO@henribarrett.com",
                     "PEGA_EMAIL_SUZANNE@henribarrett.com", "PEGA_EMAIL_FILM@henribarrett.com"];
```

### A.2 Punto de entrada

```javascript
function doPost(e) {
  var payload = JSON.parse(e.postData.contents);
  try {
    var result = procesarSorteo(payload);
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    Logger.log("ERROR: " + err);
    return ContentService.createTextOutput(JSON.stringify({ok:false, error:String(err)}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
```

### A.3 `procesarSorteo(payload)` — hace EXACTAMENTE 3 cosas, en orden

**Payload recibido** (del frontend, `Sorteo/index.html` línea 524):
```json
{
  "weekLabel": "5 al 9 de agosto 2026",
  "weekNumber": 3,
  "areaName": "Audiovisual",
  "directorEmail": "director@henribarrett.com",
  "areaEmails": {"Nombre Editor": "editor@henribarrett.com", "...": "..."},
  "days": [
    {"dayName": "Lunes", "date": "2026-08-05", "people": ["Nombre Editor", "Otro Editor"]},
    {"dayName": "Martes", "date": "2026-08-06", "people": ["Tercer Editor"]}
  ]
}
```

**Acción 1 — Mail compilatorio a RRHH:**
- Para: `RRHH_EMAILS` (emails de RRHH, definidos al desplegar)
- Asunto: `HO {areaName} — Semana {weekNumber} de 5`
- Cuerpo (texto plano, sin HTML):
  ```
  PROGRAMA HOME OFFICE — {areaName}
  Semana {weekNumber} de 5 | {weekLabel}

  Lunes {fecha}: {personas separadas por coma}
  Martes {fecha}: ...
  (solo días con personas; si un día no tiene asignaciones, omitir o marcar "sin asignaciones")

  Enviado automáticamente por el Toolkit de Henri Barrett.
  ```

**Acción 2 — Separar HO en Google Calendar:**
- Calendario: buscar por nombre `CALENDAR_NAME`. Si no existe → `throw new Error("Calendario no encontrado: " + CALENDAR_NAME)`
- Por CADA día con personas, por CADA persona:
  - Evento **all-day** en la fecha del día (`new Date(payload.days[i].date + "T12:00:00")` para evitar problemas de timezone)
  - Título: `{Nombre} H.O.` (ej: `Nombre Editor H.O.`)
  - Invitados: `HO_INVITEES` (todos, vía `event.addGuest(email)`)
  - **Sin duplicados:** antes de crear, comprobar si ya existe evento de esa persona ese día. Buscar por título `{Nombre} H.O.` en esa fecha (`CalendarApp.getCalendarByName(...).getEventsForDay(fecha)`) y si ya existe uno con ese título exacto → skip.

**Acción 3 — Mail de recordatorio al usuario:**
- Por CADA persona que tiene HO (recorrer `days`), usar `areaEmails[persona]` para el destinatario
- Asunto: `Tu Home Office: {dayName} {fecha}`
- Cuerpo:
  ```
  Hola {nombre},

  Tenés Home Office el {dayName} {fecha}.

  Recordá ingresarlo en Buk.
  ```
- Solo a quienes tienen HO. Si la persona no tiene email en `areaEmails`, loguear warning y seguir.

**Retorno:** `{ok:true, eventos: N, mails: N}`

### A.4 Notas
- Usar `MailApp.sendEmail`, `CalendarApp` (no hace falta Advanced Calendar Service para el sorteo: no usa color)
- `doGet` no es necesario (solo POST), pero incluir uno que responda `{ok:false, error:"Usa POST"}` por si acaso
- Los emails del equipo NO van hardcodeados: llegan en `areaEmails` del payload

---

## B) `reservas.gs` — backend de Reserva de Isla

### B.1 Configuración (constantes)

```javascript
var CALENDAR_NAME = "Social Content Studio Calendar";
var SHEET_NAME    = "Registro de Edición";
var ISLAS_VALIDAS = ["HEBA-101","HEBA-102","HEBA-103","HEBA-104","HEBA-106","HEBA-107"];
var BASECAMP_API  = "https://3.basecampapi.com/4977992";  // account id real
```

### B.2 Rutas (doGet + doPost)

```javascript
function doGet(e) {
  var accion = e.parameter.accion;
  if (accion === "proyectos") {
    var email = e.parameter.email;
    var proyectos = listarProyectosDe(email);   // → [{id, name}]
    return ContentService.createTextOutput(JSON.stringify(proyectos))
      .setMimeType(ContentService.MimeType.JSON);
  }
  // OAuth callback de Basecamp (ver B.5)
  if (e.parameter.code) return handleOAuthCallback(e.parameter);
  return ContentService.createTextOutput(JSON.stringify({error:"Acción no válida"}))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var payload = JSON.parse(e.postData.contents);
  try {
    var result = crearReserva(payload);
    return ContentService.createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    Logger.log("ERROR reserva: " + err);
    return ContentService.createTextOutput(JSON.stringify({ok:false, error:String(err)}))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
```

### B.3 `crearReserva(payload)` — crea evento + registra

**Payload recibido** (del frontend, `Reservas/index.html` líneas 289-300):
```json
{
  "nombre": "Nombre Editor",
  "fecha": "2026-08-12",
  "proyecto": "Campaña Verano (HEBA-103)",   // nombre del proyecto Basecamp
  "isla": "HEBA-103",
  "turno": "manana",
  "turnoLabel": "Mañana (08:00–15:00)",
  "startDateTime": "2026-08-12T08:00:00",
  "endDateTime": "2026-08-12T15:00:00",
  "title": "[HEBA-103] Campaña Verano · Mañana · Nombre Editor",
  "descripcion": "..."
}
```

**Pasos:**
1. **Validar isla:** `ISLAS_VALIDAS.indexOf(payload.isla) === -1` → retornar `{ok:false, error:"Isla no válida"}`
2. **Crear evento con color verde:** usar **Advanced Calendar Service** (`Calendar.Events.insert`), NO `CalendarApp` (CalendarApp no soporta color):
   ```javascript
   var calId = getCalendarId(CALENDAR_NAME);  // CalendarApp.getCalendarsByName()[0].getId()
   var evento = {
     summary: payload.title,
     description: (payload.descripcion || "") + "\nEditor: " + payload.nombre,
     start: {dateTime: payload.startDateTime},
     end:   {dateTime: payload.endDateTime},
     colorId: "6"   // VERDE
   };
   Calendar.Events.insert(evento, calId);
   ```
3. **Registrar en Sheet** `Registro de Edición` (crear si no existe con `SpreadsheetApp.create` — guardar ID en `PropertiesService.getScriptProperties()` para reutilizar):
   - Headers (si hoja nueva): `fecha | editor | email | proyecto | isla | turno | inicio | fin | horas | timestamp`
   - Append: `payload.fecha, payload.nombre, EMAIL_DEL_EDITOR, payload.proyecto, payload.isla, payload.turno, payload.startDateTime, payload.endDateTime, 7, new Date().toISOString()`
   - El email del editor: buscar en una constante local `RES_TEAM` (copia de `reservas-team.js` del repo — OJO: al pegar en script.google.com los datos quedan en el script de Google, no en git; el orquestador decide si va hardcodeado en el .gs versionado o se quita y se agrega al pegar). **Decisión: en el .gs del repo va `var RES_TEAM = [/* COPIAR AQUÍ AL DEPLOY */];` con instrucción, y el orquestador pega el contenido real al deploy.**
4. Retornar `{ok:true}`

### B.4 `listarProyectosDe(email)` — proyectos Basecamp de una persona

**Flujo:**
1. `var token = getBasecampToken();` — de `PropertiesService` (ver B.5)
2. **Caché:** clave `proyectos_cache` + `proyectos_cache_ts` en PropertiesService, TTL **24h**. Si el caché es válido → usarlo; si no, hacer barrido:
   - `GET {BASECAMP_API}/projects.json` con header `Authorization: Bearer {token}` → todos los proyectos `[{id, name}]`
   - Por cada proyecto: `GET {BASECAMP_API}/projects/{id}/people/people.json` → `[{id, name, email_address}]`
   - Guardar mapa `{projectId: {name, emails:[...]}}` en caché
3. Filtrar: proyectos cuyo `emails` incluya el `email` buscado (comparación case-insensitive, trim)
4. Retornar `[{id, name}]` — **solo los de esa persona**

**Errores:** si el token no está configurado → `{error:"Basecamp no configurado"}`. Si la API responde 401 → loguear y retornar error claro.

### B.5 OAuth Basecamp (37signals Launchpad)

El token se obtiene por OAuth 2.0 web server flow con redirect al Web App. El orquestador da las instrucciones en LEEME.md; el script implementa:

```javascript
// Constantes (el orquestador pega valores reales al deploy):
var BC_CLIENT_ID = "PEGA_CLIENT_ID";
var BC_CLIENT_SECRET = "PEGA_CLIENT_SECRET";
var REDIRECT_URI = "PEGA_URL_DEL_WEBAPP";

function getBasecampToken() {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty("BC_ACCESS_TOKEN");
  var exp = Number(props.getProperty("BC_TOKEN_EXPIRES") || 0);
  if (token && Date.now() < exp) return token;
  // refresh token
  var refresh = props.getProperty("BC_REFRESH_TOKEN");
  if (!refresh) throw new Error("Basecamp no configurado — ejecutar /auth");
  var res = UrlFetchApp.fetch("https://launchpad.37signals.com/authorization/token", {
    method: "post",
    payload: {
      type: "refresh", client_id: BC_CLIENT_ID, client_secret: BC_CLIENT_SECRET,
      refresh_token: refresh
    }
  });
  var data = JSON.parse(res.getContentText());
  // Basecamp emite access tokens con vida de 2 semanas (sin expires_in en el body):
  // usar expiración fija de 13 días (~1123200 seg) por seguridad.
  props.setProperty("BC_ACCESS_TOKEN", data.access_token);
  props.setProperty("BC_TOKEN_EXPIRES", String(Date.now() + 13 * 24 * 3600 * 1000));
  props.setProperty("BC_REFRESH_TOKEN", data.refresh_token);
  return data.access_token;
}

function handleOAuthCallback(params) {
  // intercambiar code → access+refresh token, guardar en PropertiesService
  // responder HTML "Listo, ya podés cerrar esta pestaña"
}
```

> Nota de implementación: los detalles exactos del endpoint de refresh (grant_type, parámetros) deben verificarse contra la doc oficial de Basecamp 3 API (launchpad.37signals.com). Si hay duda, dejar comentario `// VERIFICAR EN DOC` y que el orquestador lo confirme.

---

## C) `Reservas/index.html` — modificaciones al frontend

### C.1 Select de Proyecto dinámico (Basecamp)

- Reemplazar el `<input id="res-proyecto">` por `<select class="f-select" id="res-proyecto">` con placeholder `Cargando proyectos...`
- **En `onNameChange(name)`** (ya existe, línea 253): además del chip de auth, disparar `loadProyectos(name)`:
  ```javascript
  function loadProyectos(name) {
    var sel = document.getElementById('res-proyecto');
    sel.innerHTML = '<option value="">Cargando proyectos...</option>';
    var email = RES_TEAM.find(function(p){ return p.name === name; }).email;
    fetch(RESERVAS_SCRIPT_URL + '?accion=proyectos&email=' + encodeURIComponent(email))
      .then(function(r){ return r.json(); })
      .then(function(lista){
        sel.innerHTML = '';
        if (!lista || !lista.length) {
          sel.innerHTML = '<option value="">Sin proyectos asignados</option>';
          return;
        }
        lista.forEach(function(p){
          var o = document.createElement('option');
          o.value = p.name; o.textContent = p.name;
          sel.appendChild(o);
        });
      })
      .catch(function(){ sel.innerHTML = '<option value="">Error al cargar</option>'; });
  }
  ```
- **NOTA:** este fetch NO usa `mode:'no-cors'` (necesitamos leer la respuesta). Apps Script Web App con CORS responde bien. El envío de la reserva (`submitReserva`) SÍ mantiene `no-cors` como está.

### C.2 Select de Isla estático

- Reemplazar `<input id="res-isla">` por `<select class="f-select" id="res-isla">` con las opciones: `HEBA-101, HEBA-102, HEBA-103, HEBA-104, HEBA-106, HEBA-107`
- **OJO:** mantener el orden exacto y NO incluir HEBA-105 (no existe)

### C.3 Validación

- `submitReserva` ya valida `!proyecto || !isla` — sigue funcionando con selects
- El `title` del payload se arma igual (usa `proyecto` e `isla` del select): `'[' + isla + '] ' + proyecto + ' · ' + turno + ' · ' + nombre`
- `autoSelectName()` (login con Google, línea 244): después de seleccionar el nombre, también debe llamar `loadProyectos(name)` (no solo `showAuthChip`)

### C.4 Lo que NO se toca

- Estilos, turnos, fechas, `reservas-team.js`, `GOOGLE_CLIENT_ID`, el resto del layout

---

## D) Criterios de calidad

1. Los `.gs` deben pegarse en script.google.com sin errores de sintaxis (ES5/ES6 válido para Apps Script)
2. Comentarios en español, explicando cada bloque
3. Nombres de funciones en camelCase, consistentes con el estilo del proyecto
4. NO subir emails del equipo dentro de archivos versionados (RES_TEAM en reservas.gs va como placeholder con instrucción)
5. El sorteo usa CalendarApp (sin color). Las reservas usan Calendar API avanzada (colorId 6 = verde)
6. Manejo de errores en todas las llamadas externas (fetch a Basecamp, insert en Calendar)
