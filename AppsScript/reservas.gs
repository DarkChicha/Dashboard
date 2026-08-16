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
    var nombre = e.parameter.nombre || e.parameter.email;   // filtra por NOMBRE (los emails Basecamp vienen enmascarados)
    var proyectos = listarProyectosDe(nombre);   // → [{id, name}]
    return ContentService.createTextOutput(JSON.stringify(proyectos))
      .setMimeType(ContentService.MimeType.JSON);
  }
  if (accion === "estado") {
    var estado = obtenerEstadoReservas();
    return ContentService.createTextOutput(JSON.stringify(estado))
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

// ── crearReserva: crea evento en Calendar + registra en Sheet ──
// Valida conflicto (misma isla, mismo horario) antes de crear.
function crearReserva(payload) {
  // 1. Validar isla
  if (ISLAS_VALIDAS.indexOf(payload.isla) === -1) {
    return {ok:false, error:"Isla no válida"};
  }

  // 2. Validar que no exista otra reserva en la misma isla en ese horario
  var calId = getCalendarId(CALENDAR_ID);
  var conflicto = buscarConflicto(calId, payload);
  if (conflicto) {
    return {ok:false, error: conflicto};
  }

  // 3. Crear evento con el color de la isla
  var evento = {
    summary: payload.title,
    description: (payload.descripcion || "") + "\nEditor: " + payload.nombre,
    start: {dateTime: payload.startDateTime, timeZone: TIME_ZONE},
    end:   {dateTime: payload.endDateTime, timeZone: TIME_ZONE},
    colorId: colorDeIsla(payload.isla)
  };

  try {
    Calendar.Events.insert(evento, calId);
  } catch (err) {
    Logger.log("ERROR al crear evento en Calendar: " + err);
    throw new Error("No se pudo crear el evento en Calendar: " + err);
  }

  // 4. Registrar en la hoja "Registro de Edición"
  var emailEditor = obtenerEmailEditor(payload.nombre);
  registrarEnSheet(payload, emailEditor);

  return {ok:true};
}

// ── Color de Google Calendar por isla (distinto para cada una) ──
// colorIds de Google Calendar: 1 lavanda, 2 salmón, 3 uva, 4 flamenco,
// 5 plátano, 6 mandarina, 7 pavo real, 8 grafito, 9 arándano, 10 verde, 11 tomate
var COLORES_ISLA = {
  "HEBA-101": "1",   // lavanda
  "HEBA-102": "2",   // salmón
  "HEBA-103": "4",   // flamenco
  "HEBA-104": "5",   // plátano
  "HEBA-106": "7",   // pavo real
  "HEBA-107": "9"    // arándano
};
function colorDeIsla(isla) {
  return COLORES_ISLA[isla] || "3";
}

// ── obtenerEstadoReservas: grilla de la semana actual y la próxima ──
// Consulta Calendar.Events.list (Advanced Calendar Service) desde el lunes de
// la semana actual hasta el domingo de la próxima (14 días, zona America/Lima)
// y devuelve, por semana, un mapa {fecha: {isla: {turno: nombre}}}.
function obtenerEstadoReservas() {
  var calId = getCalendarId(CALENDAR_ID);
  var hoyLima = Utilities.formatDate(new Date(), TIME_ZONE, "yyyy-MM-dd");

  // Lunes de la semana actual (día ISO: 1=Lun ... 7=Dom)
  var lunesStr   = sumarDiasStr(hoyLima, 1 - diaDeSemanaISO(hoyLima));
  var domingoStr = sumarDiasStr(lunesStr, 13);   // domingo de la semana próxima

  // Límites del rango: Lun 00:00:00 → Dom 23:59:59 en America/Lima
  var timeMin = Utilities.parseDate(lunesStr + " 00:00:00", TIME_ZONE, "yyyy-MM-dd HH:mm:ss");
  var timeMax = Utilities.parseDate(domingoStr + " 23:59:59", TIME_ZONE, "yyyy-MM-dd HH:mm:ss");

  var eventos;
  try {
    eventos = Calendar.Events.list(calId, {
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      singleEvents: true,
      orderBy: "startTime"
    });
  } catch (err) {
    Logger.log("ERROR al consultar calendario para estado: " + err);
    return {ok:false, error:"No se pudo consultar el calendario"};
  }

  // Mapa { "YYYY-MM-DD": { "HEBA-101": {"manana": "Nombre", "tarde": "Nombre"} } }
  var reservasPorDia = {};
  var items = (eventos && eventos.items) || [];

  for (var i = 0; i < items.length; i++) {
    var ev = items[i];
    var summary = String(ev.summary || "");
    if (summary.indexOf("[HEBA-") === -1) continue;   // solo reservas de isla

    var matchIsla = summary.match(/\[(HEBA-\d+)\]/);
    if (!matchIsla) continue;

    var inicio = ev.start && ev.start.dateTime;
    if (!inicio) continue;   // eventos de día completo no aplican

    var fecha = Utilities.formatDate(new Date(inicio), TIME_ZONE, "yyyy-MM-dd");
    var hora  = Utilities.formatDate(new Date(inicio), TIME_ZONE, "HH");
    var turno = (hora === "09") ? "manana" : ((hora === "14") ? "tarde" : "");
    if (!turno) continue;

    var partes = summary.split("·");
    var nombre = partes.length > 1 ? partes[partes.length - 1].trim() : "";

    if (!reservasPorDia[fecha]) reservasPorDia[fecha] = {};
    if (!reservasPorDia[fecha][matchIsla[1]]) reservasPorDia[fecha][matchIsla[1]] = {};
    reservasPorDia[fecha][matchIsla[1]][turno] = nombre;
  }

  return {
    ok: true,
    semanas: [
      construirSemanaEstado("Semana actual", lunesStr, reservasPorDia),
      construirSemanaEstado("Semana próxima", sumarDiasStr(lunesStr, 7), reservasPorDia)
    ]
  };
}

// Arma una semana hábil (Lun–Vie) con sus 5 fechas y las reservas de ese rango
function construirSemanaEstado(etiqueta, lunesStr, reservasPorDia) {
  var DIAS_LABEL = ["Lun", "Mar", "Mié", "Jue", "Vie"];
  var dias = [];
  var reservas = {};

  for (var i = 0; i < 5; i++) {
    var fecha = sumarDiasStr(lunesStr, i);
    dias.push({fecha: fecha, diaLabel: DIAS_LABEL[i]});
    if (reservasPorDia[fecha]) reservas[fecha] = reservasPorDia[fecha];
  }

  return {
    etiqueta: etiqueta,
    lunes: lunesStr,
    dias: dias,
    reservas: reservas
  };
}

// Suma días a una fecha "YYYY-MM-DD" (aritmética UTC para evitar saltos de zona)
function sumarDiasStr(fechaStr, dias) {
  var partes = fechaStr.split("-");
  var d = new Date(Date.UTC(Number(partes[0]), Number(partes[1]) - 1, Number(partes[2]) + dias));
  return Utilities.formatDate(d, "UTC", "yyyy-MM-dd");
}

// Día de la semana ISO (1=Lun ... 7=Dom) de una fecha "YYYY-MM-DD"
function diaDeSemanaISO(fechaStr) {
  var partes = fechaStr.split("-");
  var d = new Date(Date.UTC(Number(partes[0]), Number(partes[1]) - 1, Number(partes[2])));
  var dow = d.getUTCDay();   // 0=Dom ... 6=Sáb
  return dow === 0 ? 7 : dow;
}

// ── Busca si la isla ya está reservada en ese rango horario ──
// Devuelve un mensaje de error si hay conflicto, o null si está libre.
function buscarConflicto(calId, payload) {
  var timeMin = payload.startDateTime;
  var timeMax = payload.endDateTime;
  var eventos;

  try {
    eventos = Calendar.Events.list(calId, {
      timeMin: new Date(timeMin).toISOString(),
      timeMax: new Date(timeMax).toISOString(),
      singleEvents: true,
      orderBy: "startTime"
    });
  } catch (err) {
    Logger.log("ERROR al consultar eventos para conflicto: " + err);
    return null;   // si no se puede consultar, no bloquear la reserva
  }

  var islaTag = "[" + payload.isla + "]";
  var items = (eventos && eventos.items) || [];
  for (var i = 0; i < items.length; i++) {
    var ev = items[i];
    if (String(ev.summary || "").indexOf(islaTag) !== -1) {
      var otro = String(ev.summary || "").replace(islaTag, "").split("·")[0].trim();
      return "La isla " + payload.isla + " ya está reservada en ese horario" +
             (otro ? " (" + otro + ")" : "") +
             ". Elegí otra isla u otro turno.";
    }
  }
  return null;
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
    payload.horas || 7,   // mañana=4, tarde=2 (viene del frontend)
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
// Filtra por NOMBRE con matching flexible: Basecamp enmascara los emails de
// los demás, pero devuelve los nombres completos de todos los miembros.
function listarProyectosDe(nombre) {
  var token;
  try {
    token = getBasecampToken();
  } catch (err) {
    Logger.log("ERROR token Basecamp: " + err);
    return {error:"Basecamp no configurado"};
  }

  var mapa = obtenerMapaProyectos(token);
  if (mapa.error) return mapa;

  var nombreBuscado = String(nombre || "").trim();
  var resultado = [];

  Object.keys(mapa).forEach(function (proyectoId) {
    var proyecto = mapa[proyectoId];
    var esMiembro = (proyecto.nombres || []).some(function (n) {
      return nombreCoincide(n, nombreBuscado);
    });
    if (esMiembro) {
      resultado.push({id: proyectoId, name: proyecto.name});
    }
  });

  return resultado;
}

// ── Matching flexible de nombres ──
// Normaliza y compara de 3 formas: exacto, compacto (sin espacios) y por tokens.
// Ejemplos que resuelve:
//   "Luis Guillermo"  ==  "LuisGuillermo"  (sin espacio)
//   "Johann Chao"     ==  "Johann"         (solo nombre)
//   "Gabriel Carrera" ==  "Gabriel"        (solo nombre)
function nombreCoincide(nombreMiembro, nombreBuscado) {
  var m = normalizarNombre(nombreMiembro);   // compacto, sin espacios
  var b = normalizarNombre(nombreBuscado);
  if (!m || !b) return false;
  if (m === b) return true;                  // exacto (ya cubre acentos/espacios)

  var tm = tokensNombre(nombreMiembro);      // tokens con espacios preservados
  var tb = tokensNombre(nombreBuscado);
  if (!tm.length || !tb.length) return false;

  // El conjunto de tokens más pequeño debe estar contenido en el más grande
  var menor = tm.length <= tb.length ? tm : tb;
  var mayor = tm.length <= tb.length ? tb : tm;

  // Caso "LuisGuillermo" (1 token) vs "Luis Guillermo" (2 tokens):
  // comparar el token único contra la concatenación del otro lado
  if (menor.length === 1 && mayor.length > 1) {
    if (menor[0] === mayor.join("")) return true;
  }

  return menor.every(function (token) {
    if (token.length < 4) return false;      // evita falsos positivos ("ana")
    return mayor.some(function (gt) {
      return gt === token
        || (gt.length >= 5 && token.length >= 5 && gt.indexOf(token) === 0)  // prefijo (ambos ≥5: evita "fran"→"francisco")
        || (gt.length >= 5 && token.length >= 5 && token.indexOf(gt) === 0);
    });
  });
}

// Normaliza un nombre a su forma compacta: minúsculas, sin acentos, sin espacios
function normalizarNombre(s) {
  return tokensNombre(s).join("");
}

// Normaliza a tokens: minúsculas, sin acentos, sin símbolos (espacios preservados)
function tokensNombre(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[áàäâ]/g, "a").replace(/[éèëê]/g, "e")
    .replace(/[íìïî]/g, "i").replace(/[óòöô]/g, "o")
    .replace(/[úùüû]/g, "u").replace(/[ñ]/g, "n")
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter(function (t) { return t.length > 0; });
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

// ── Consulta Basecamp: TODOS los proyectos (con paginación) y sus personas ──
// Basecamp pagina los resultados; hay que seguir el header "Link: rel=next"
// hasta agotar las páginas, o el script solo verá la primera página (~15).
function barrerProyectosBasecamp(token) {
  var headers = {Authorization: "Bearer " + token};
  var proyectos = [];
  var url = BASECAMP_API + "/projects.json?per_page=100";

  while (url) {
    var resProyectos = UrlFetchApp.fetch(url, {
      headers: headers,
      muteHttpExceptions: true
    });

    if (resProyectos.getResponseCode() === 401) {
      throw new Error("Token de Basecamp inválido o vencido (401)");
    }

    var pagina = JSON.parse(resProyectos.getContentText());
    proyectos = proyectos.concat(pagina);

    // Buscar el enlace a la siguiente página en el header "Link"
    url = null;
    var linkHeader = resProyectos.getHeaders()["Link"] || "";
    var matches = linkHeader.match(/<([^>]+)>\s*;\s*rel="next"/);
    if (matches) url = matches[1];
  }

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
    var emails  = (personas || []).map(function (p) { return p.email_address; });
    var nombres = (personas || []).map(function (p) { return p.name; });

    mapa[proyecto.id] = {name: proyecto.name, emails: emails, nombres: nombres};
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
