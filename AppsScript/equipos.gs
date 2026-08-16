// ============================================================
// PEDIDO DE EQUIPOS AV — backend Apps Script
// Proyecto independiente (script.google.com), separado de reservas.gs / sorteo.gs
// ============================================================

// ── Configuración ──────────────────────────────────────────
var TIME_ZONE   = "America/Lima";           // zona horaria de fechas y timestamps
var CARPETA_DOC = "Solicitud de Equipos";   // carpeta de Drive donde se guardan los pedidos
var SHEET_NAME  = "Registro Pedidos AV";    // hoja de registro de pedidos

// EQUIPOS_TEAM: copia de Equipos/equipos-data.js del repo. NO se versiona con
// emails reales, el orquestador pega el contenido real al momento del deploy
// en script.google.com. Solo se usa como respaldo si el payload no trae email.
var EQUIPOS_TEAM = [
  {name:"PEGA_NOMBRE_01", email:"PEGA_EMAIL_01@henribarrett.com"},
  {name:"PEGA_NOMBRE_02", email:"PEGA_EMAIL_02@henribarrett.com"}
  /* ... COPIAR EL RESTO DEL EQUIPO AQUÍ AL DEPLOY ... */
];

// ── Rutas ───────────────────────────────────────────────────
function doGet(e) {
  return responderJSON({ok:false, error:"Usa POST"});
}

function doPost(e) {
  var payload = JSON.parse(e.postData.contents);
  var respuesta = {ok:true};

  // 1) Google Doc enriquecido en la carpeta "Solicitud de Equipos"
  var doc = null;
  try {
    doc = crearDocPedido(payload);
    respuesta.archivo = doc.getName();
  } catch (err) {
    Logger.log("ERROR al crear el Google Doc: " + err);
    respuesta.ok = false;
    respuesta.error = "No se pudo generar el documento del pedido: " + err;
  }

  // 2) Mail al usuario que hizo el pedido
  try {
    enviarMailPedido(payload, doc);
  } catch (err) {
    Logger.log("ERROR al enviar el mail del pedido: " + err);
  }

  // 3) Registro en la hoja "Registro Pedidos AV"
  try {
    registrarEnSheet(payload, doc);
  } catch (err) {
    Logger.log("ERROR al registrar el pedido en el Sheet: " + err);
  }

  return responderJSON(respuesta);
}

// ── 1) Documento del pedido ──────────────────────────────────
// Nombre: Pedido_YYYY-MM-DD_PROYECTO_NOMBRESINESPACIOS (sin extensión)
function crearDocPedido(payload) {
  var carpeta = obtenerCarpeta();
  var nombreDoc = "Pedido_" + payload.fecha + "_" + payload.proyecto + "_" + String(payload.nombre || "").replace(/\s+/g, "");

  var doc = DocumentApp.create(nombreDoc);
  var body = doc.getBody();
  body.clear();

  body.appendParagraph("SOLICITUD DE EQUIPOS AUDIOVISUALES")
    .setHeading(DocumentApp.ParagraphHeading.TITLE);
  body.appendParagraph("Henri Barrett · Social Content Studio")
    .setHeading(DocumentApp.ParagraphHeading.SUBTITLE);

  var meta = body.appendParagraph("");
  meta.appendText("Quién: ").setBold(true);
  meta.appendText(payload.nombre + "\n").setBold(false);
  meta.appendText("Fecha: ").setBold(true);
  meta.appendText(payload.fecha + "\n").setBold(false);
  meta.appendText("Turno: ").setBold(true);
  meta.appendText(payload.turnoLabel + "\n").setBold(false);
  meta.appendText("Proyecto: ").setBold(true);
  meta.appendText(payload.proyecto).setBold(false);

  body.appendParagraph("Equipos solicitados").setHeading(DocumentApp.ParagraphHeading.HEADING2);

  var equipos = payload.equipos || [];
  for (var i = 0; i < equipos.length; i++) {
    var eq = equipos[i];
    body.appendListItem(eq.nombre + " (" + eq.categoria + ") ×" + eq.cantidad)
      .setGlyphType(DocumentApp.GlyphType.BULLET);
  }

  body.appendParagraph("Total de unidades: " + payload.totalUnidades)
    .setHeading(DocumentApp.ParagraphHeading.HEADING3);

  body.appendParagraph("Generado: " + Utilities.formatDate(new Date(), TIME_ZONE, "yyyy-MM-dd HH:mm:ss") + " (" + TIME_ZONE + ")");

  doc.saveAndClose();

  var file = DriveApp.getFileById(doc.getId());
  file.moveTo(carpeta);

  return doc;
}

// Busca la carpeta "Solicitud de Equipos" en el Drive del script; si no existe, la crea.
function obtenerCarpeta() {
  var carpetas = DriveApp.getFoldersByName(CARPETA_DOC);
  if (carpetas.hasNext()) return carpetas.next();
  return DriveApp.createFolder(CARPETA_DOC);
}

// ── 2) Mail al usuario ───────────────────────────────────────
function enviarMailPedido(payload, doc) {
  var email = payload.email || obtenerEmailDe(payload.nombre);
  if (!email) {
    Logger.log("WARNING: pedido sin email (nombre=" + payload.nombre + "), no se envía mail.");
    return;
  }

  var asunto = "Pedido de equipos AV · " + payload.proyecto + " · " + payload.fecha;

  var cuerpo = "SOLICITUD DE EQUIPOS AUDIOVISUALES\n";
  cuerpo += "Henri Barrett · Social Content Studio\n\n";
  cuerpo += "Quién: " + payload.nombre + "\n";
  cuerpo += "Fecha: " + payload.fecha + "\n";
  cuerpo += "Turno: " + payload.turnoLabel + "\n";
  cuerpo += "Proyecto: " + payload.proyecto + "\n\n";
  cuerpo += "Equipos solicitados:\n";

  var equipos = payload.equipos || [];
  for (var i = 0; i < equipos.length; i++) {
    var eq = equipos[i];
    cuerpo += "- " + eq.nombre + " (" + eq.categoria + ") ×" + eq.cantidad + "\n";
  }

  cuerpo += "\nTotal de unidades: " + payload.totalUnidades + "\n\n";
  cuerpo += "Generado: " + Utilities.formatDate(new Date(), TIME_ZONE, "yyyy-MM-dd HH:mm:ss") + " (" + TIME_ZONE + ")\n";
  if (doc) cuerpo += "\nDocumento: " + doc.getUrl() + "\n";

  MailApp.sendEmail(email, asunto, cuerpo);
}

// ── 3) Registro en Sheet ─────────────────────────────────────
// Columnas: fecha, timestamp, nombre, email, proyecto, turno, unidades, archivo
function registrarEnSheet(payload, doc) {
  var sheet = obtenerOCrearSheet();
  sheet.appendRow([
    payload.fecha,
    Utilities.formatDate(new Date(), TIME_ZONE, "yyyy-MM-dd HH:mm:ss"),
    payload.nombre,
    payload.email || obtenerEmailDe(payload.nombre),
    payload.proyecto,
    payload.turno,
    payload.totalUnidades,
    doc ? doc.getName() : ""
  ]);
}

function obtenerOCrearSheet() {
  var props = PropertiesService.getScriptProperties();
  var sheetId = props.getProperty("EQUIPOS_SHEET_ID");
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
  props.setProperty("EQUIPOS_SHEET_ID", spreadsheet.getId());

  var sheet = spreadsheet.getActiveSheet();
  sheet.setName(SHEET_NAME);
  sheet.appendRow(["fecha", "timestamp", "nombre", "email", "proyecto", "turno", "unidades", "archivo"]);

  return sheet;
}

// ── Busca el email en EQUIPOS_TEAM (respaldo si el payload no lo trae) ──
function obtenerEmailDe(nombre) {
  var persona = EQUIPOS_TEAM.filter(function (p) { return p.name === nombre; })[0];
  return persona ? persona.email : "";
}

// ── Respuesta JSON con CORS ───────────────────────────────────
function responderJSON(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
