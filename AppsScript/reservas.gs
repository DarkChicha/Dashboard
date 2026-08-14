// ============================================================
// RESERVA DE ISLA — backend Apps Script
// Proyecto independiente (script.google.com), separado de sorteo.gs
// Requiere habilitar el servicio avanzado "Calendar API" (Calendar.Events)
// ============================================================

// ── Configuración ──────────────────────────────────────────
// ID directo del calendario (más robusto que el nombre: el nombre tiene emoji 🎥)
var CALENDAR_ID    = "c_7cd9e113a6e29b2d0259fbe467148f3bbdfe5c50a258e7e59adb3e130c46fc2a@group.calendar.google.com";
var TIME_ZONE      = "America/Lima";   // zona horaria de los eventos
var SHEET_NAME    = "Registro de Edición";
var ISLAS_VALIDAS = ["HEBA-101","HEBA-102","HEBA-103","HEBA-104","HEBA-106","HEBA-107"];
var BASECAMP_API  = "https://3.basecampapi.com/4977992";  // account id real

// RES_TEAM: copia de reservas-team.js del repo. NO se versiona con emails reales,
// el orquestador pega el contenido real al momento del deploy en script.google.com.
var RES_TEAM = [/* COPIAR AQUÍ AL DEPLOY */];

// Constantes OAuth Basecamp (el orquestador pega valores reales al deploy)
var BC_CLIENT_ID     = "PEGA_CLIENT_ID";
var BC_CLIENT_SECRET = "PEGA_CLIENT_SECRET";
var REDIRECT_URI     = "PEGA_URL_DEL_WEBAPP";

// ── Rutas ───────────────────────────────────────────────────
function doGet(e) {
  var accion = e.parameter.accion;
  if (accion === "proyectos") {
    var email = e.parameter.email;
    var proyectos = listarProyectosDe(email);   // → [{id, name}]
    return ContentService.createTextOutput(JSON.stringify(proyectos))
      .setMimeType(ContentService.MimeType.JSON);
  }
  // OAuth callback de Basecamp (ver handleOAuthCallback)
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

// ── crearReserva: crea evento en Calendar (verde) + registra en Sheet ──
function crearReserva(payload) {
  // 1. Validar isla
  if (ISLAS_VALIDAS.indexOf(payload.isla) === -1) {
    return {ok:false, error:"Isla no válida"};
  }

  // 2. Crear evento con color verde vía Advanced Calendar Service
  //    (CalendarApp normal no soporta asignar color al evento)
  var calId = getCalendarId(CALENDAR_ID);
  var evento = {
    summary: payload.title,
    description: (payload.descripcion || "") + "\nEditor: " + payload.nombre,
    start: {dateTime: payload.startDateTime, timeZone: TIME_ZONE},
    end:   {dateTime: payload.endDateTime, timeZone: TIME_ZONE},
    colorId: "6"
  };

  try {
    Calendar.Events.insert(evento, calId);
  } catch (err) {
    Logger.log("ERROR al crear evento en Calendar: " + err);
    throw new Error("No se pudo crear el evento en Calendar: " + err);
  }

  // 3. Registrar en la hoja "Registro de Edición"
  var emailEditor = obtenerEmailEditor(payload.nombre);
  registrarEnSheet(payload, emailEditor);

  return {ok:true};
}

// ── Resuelve el ID del calendario por nombre ────────────────
function getCalendarId(nombreCalendario) {
  var calendario = CalendarApp.getCalendarById(CALENDAR_ID);
  if (!calendario) {
    throw new Error("Calendario no encontrado: " + CALENDAR_ID);
  }
  return calendario.getId();
}

// ── Busca el email del editor en RES_TEAM ───────────────────
function obtenerEmailEditor(nombre) {
  var persona = RES_TEAM.filter(function (p) { return p.name === nombre; })[0];
  return persona ? persona.email : "";
}

// ── Registra la reserva en la hoja de cálculo ───────────────
function registrarEnSheet(payload, emailEditor) {
  var sheet = obtenerOCrearSheet();
  sheet.appendRow([
    payload.fecha,
    payload.nombre,
    emailEditor,
    payload.proyecto,
    payload.isla,
    payload.turno,
    payload.startDateTime,
    payload.endDateTime,
    7,
    new Date().toISOString()
  ]);
}

// ── Obtiene el Spreadsheet guardado en Script Properties, o lo crea ──
function obtenerOCrearSheet() {
  var props = PropertiesService.getScriptProperties();
  var sheetId = props.getProperty("REGISTRO_SHEET_ID");
  var spreadsheet;

  if (sheetId) {
    try {
      spreadsheet = SpreadsheetApp.openById(sheetId);
      return spreadsheet.getSheetByName(SHEET_NAME);
    } catch (err) {
      Logger.log("No se pudo abrir el sheet guardado, se creará uno nuevo: " + err);
    }
  }

  spreadsheet = SpreadsheetApp.create(SHEET_NAME);
  props.setProperty("REGISTRO_SHEET_ID", spreadsheet.getId());

  var sheet = spreadsheet.getActiveSheet();
  sheet.setName(SHEET_NAME);
  sheet.appendRow(["fecha", "editor", "email", "proyecto", "isla", "turno", "inicio", "fin", "horas", "timestamp"]);

  return sheet;
}

// ── listarProyectosDe: proyectos Basecamp donde la persona es miembro ──
function listarProyectosDe(email) {
  var token;
  try {
    token = getBasecampToken();
  } catch (err) {
    Logger.log("ERROR token Basecamp: " + err);
    return {error:"Basecamp no configurado"};
  }

  var mapa = obtenerMapaProyectos(token);
  if (mapa.error) return mapa;

  var emailBuscado = String(email || "").trim().toLowerCase();
  var resultado = [];

  Object.keys(mapa).forEach(function (proyectoId) {
    var proyecto = mapa[proyectoId];
    var tieneEmail = proyecto.emails.some(function (e) {
      return String(e || "").trim().toLowerCase() === emailBuscado;
    });
    if (tieneEmail) {
      resultado.push({id: proyectoId, name: proyecto.name});
    }
  });

  return resultado;
}

// ── Devuelve el mapa {projectId: {name, emails:[...]}} con caché de 24h ──
function obtenerMapaProyectos(token) {
  var cache = PropertiesService.getScriptProperties();
  var cacheTs = Number(cache.getProperty("proyectos_cache_ts") || 0);
  var TTL_24H = 24 * 60 * 60 * 1000;

  if (cacheTs && (Date.now() - cacheTs) < TTL_24H) {
    var cacheado = cache.getProperty("proyectos_cache");
    if (cacheado) return JSON.parse(cacheado);
  }

  // Caché vencido o inexistente: barrer la API de Basecamp
  var mapa;
  try {
    mapa = barrerProyectosBasecamp(token);
  } catch (err) {
    Logger.log("ERROR al barrer Basecamp: " + err);
    return {error: "No se pudo consultar Basecamp: " + err};
  }

  cache.setProperty("proyectos_cache", JSON.stringify(mapa));
  cache.setProperty("proyectos_cache_ts", String(Date.now()));

  return mapa;
}

// ── Consulta Basecamp: todos los proyectos y sus personas ──
function barrerProyectosBasecamp(token) {
  var headers = {Authorization: "Bearer " + token};

  var resProyectos = UrlFetchApp.fetch(BASECAMP_API + "/projects.json", {
    headers: headers,
    muteHttpExceptions: true
  });

  if (resProyectos.getResponseCode() === 401) {
    throw new Error("Token de Basecamp inválido o vencido (401)");
  }

  var proyectos = JSON.parse(resProyectos.getContentText());
  var mapa = {};

  proyectos.forEach(function (proyecto) {
    var resPersonas = UrlFetchApp.fetch(BASECAMP_API + "/projects/" + proyecto.id + "/people.json", {
      headers: headers,
      muteHttpExceptions: true
    });

    if (resPersonas.getResponseCode() === 401) {
      throw new Error("Token de Basecamp inválido o vencido (401)");
    }

    var personas = JSON.parse(resPersonas.getContentText());
    var emails = (personas || []).map(function (p) { return p.email_address; });

    mapa[proyecto.id] = {name: proyecto.name, emails: emails};
  });

  return mapa;
}

// ── OAuth Basecamp (37signals Launchpad) ────────────────────

// Obtiene el access token vigente, refrescándolo si venció
function getBasecampToken() {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty("BC_ACCESS_TOKEN");
  var exp = Number(props.getProperty("BC_TOKEN_EXPIRES") || 0);
  if (token && Date.now() < exp) return token;

  // Refrescar el token usando el refresh_token guardado
  var refresh = props.getProperty("BC_REFRESH_TOKEN");
  if (!refresh) throw new Error("Basecamp no configurado — ejecutar /auth");

  // Refresh oficial de Basecamp (doc: launchpad.37signals.com/authorization/token con type=refresh)
  var res = UrlFetchApp.fetch("https://launchpad.37signals.com/authorization/token", {
    method: "post",
    payload: {
      type: "refresh",
      client_id: BC_CLIENT_ID,
      client_secret: BC_CLIENT_SECRET,
      refresh_token: refresh
    },
    muteHttpExceptions: true
  });

  var data = JSON.parse(res.getContentText());
  if (!data.access_token) {
    throw new Error("No se pudo refrescar el token de Basecamp: " + res.getContentText());
  }

  // Basecamp no devuelve expires_in en el body: el access token dura 2 semanas
  // (doc oficial). Usar expiración fija de 13 días por seguridad.
  props.setProperty("BC_ACCESS_TOKEN", data.access_token);
  props.setProperty("BC_TOKEN_EXPIRES", String(Date.now() + 13 * 24 * 3600 * 1000));
  // VERIFICAR EN DOC: confirmar si Basecamp siempre devuelve un refresh_token nuevo en cada refresh
  if (data.refresh_token) {
    props.setProperty("BC_REFRESH_TOKEN", data.refresh_token);
  }

  return data.access_token;
}

// Callback del flujo OAuth web_server: intercambia el code por access+refresh token
function handleOAuthCallback(params) {
  var props = PropertiesService.getScriptProperties();

  // Exchange inicial oficial de Basecamp (doc: authorization/token con type=web_server + code)
  var res = UrlFetchApp.fetch("https://launchpad.37signals.com/authorization/token", {
    method: "post",
    payload: {
      type: "web_server",
      client_id: BC_CLIENT_ID,
      client_secret: BC_CLIENT_SECRET,
      redirect_uri: REDIRECT_URI,
      code: params.code
    },
    muteHttpExceptions: true
  });

  var data = JSON.parse(res.getContentText());

  if (!data.access_token) {
    return HtmlService.createHtmlOutput("Error al autorizar Basecamp: " + res.getContentText());
  }

  props.setProperty("BC_ACCESS_TOKEN", data.access_token);
  props.setProperty("BC_TOKEN_EXPIRES", String(Date.now() + 13 * 24 * 3600 * 1000));
  props.setProperty("BC_REFRESH_TOKEN", data.refresh_token);

  return HtmlService.createHtmlOutput("Listo, ya podés cerrar esta pestaña");
}
