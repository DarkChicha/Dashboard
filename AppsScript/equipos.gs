// ============================================================
// PEDIDO DE EQUIPOS AV — backend Apps Script
// Proyecto independiente (script.google.com), separado de reservas.gs / sorteo.gs
// ============================================================

// ── Configuración ──────────────────────────────────────────
var TIME_ZONE   = "America/Lima";           // zona horaria de fechas y timestamps
var CARPETA_DOC = "Solicitud de Equipos";   // carpeta de Drive donde se guardan los pedidos
var SHEET_NAME  = "Registro Pedidos AV";    // hoja de registro de pedidos
var INVENTARIO_SHEET_ID = "PEGA_INVENTARIO_SHEET_ID"; // ID del spreadsheet de inventario (se reemplaza al deploy)
var INVENTARIO_HOJA     = "Inventario";     // hoja con el catálogo (fuente de verdad)
var INVENTARIO_CACHE_MS = 5 * 60 * 1000;    // caché del inventario: 5 minutos

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
  var accion = e && e.parameter && e.parameter.accion;
  if (accion === "inventario") {
    return responderJSON(obtenerInventario());
  }
  return responderJSON({ok:false, error:"Usa POST o ?accion=inventario"});
}

// ── Inventario (fuente de verdad = hoja "Inventario" del spreadsheet) ──
// Columnas de la hoja: categoria | marca | modelo | stock | notas
// Devuelve {ok:true, equipos:[{cat, id, nombre, stock, tags:[notas]}]}
function obtenerInventario() {
  var props = PropertiesService.getScriptProperties();
  var cache = props.getProperty("INVENTARIO_CACHE");
  var cacheTs = props.getProperty("INVENTARIO_CACHE_TS");
  if (cache && cacheTs && (Date.now() - Number(cacheTs)) < INVENTARIO_CACHE_MS) {
    try { return JSON.parse(cache); } catch (err) { /* caché corrupta: releer */ }
  }

  try {
    var ss = SpreadsheetApp.openById(INVENTARIO_SHEET_ID);
    var hoja = ss.getSheetByName(INVENTARIO_HOJA);
    if (!hoja) {
      return {ok:false, error:"No existe la hoja '" + INVENTARIO_HOJA + "' en el spreadsheet de inventario."};
    }
    var filas = hoja.getDataRange().getValues();
    if (filas.length < 2) {
      return {ok:true, equipos:[]}; // solo header
    }

    var header = filas[0].map(function(h){ return String(h).toLowerCase().trim(); });
    var idxCat = header.indexOf("categoria");
    var idxMar = header.indexOf("marca");
    var idxMod = header.indexOf("modelo");
    var idxSto = header.indexOf("stock");
    var idxNot = header.indexOf("notas");
    var idxId  = header.indexOf("id");
    if (idxCat < 0 || idxMar < 0 || idxMod < 0 || idxSto < 0) {
      return {ok:false, error:"La hoja 'Inventario' debe tener columnas: categoria, marca, modelo, stock."};
    }

    var equipos = [];
    for (var i = 1; i < filas.length; i++) {
      var f = filas[i];
      var categoria = String(f[idxCat] || "").trim();
      var marca     = String(f[idxMar] || "").trim();
      var modelo    = String(f[idxMod] || "").trim();
      var stock     = Number(f[idxSto]) || 0;
      if (!categoria || !modelo) continue; // fila incompleta (marca puede ser "")

      var nombre = (marca + " " + modelo).trim();
      var id = (idxId >= 0 && String(f[idxId] || "").trim())
        ? String(f[idxId]).trim()
        : normalizarId(marca + " " + modelo);
      var notas = (idxNot >= 0) ? String(f[idxNot] || "").trim() : "";

      equipos.push({
        cat: categoria,
        id: id,
        nombre: nombre,
        stock: stock,
        tags: notas ? [notas] : []
      });
    }

    var respuesta = {ok:true, equipos:equipos};
    props.setProperty("INVENTARIO_CACHE", JSON.stringify(respuesta));
    props.setProperty("INVENTARIO_CACHE_TS", String(Date.now()));
    return respuesta;
  } catch (err) {
    Logger.log("ERROR leyendo inventario: " + err);
    return {ok:false, error:"No se pudo leer el inventario: " + err};
  }
}

// Convierte "Sony 24-70 GM" → "Sony2470GM" (id estable para el carrito)
function normalizarId(s) {
  return String(s || "").toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .replace(/(\d+)-(\d+)/g, function(m, a, b){ return a + b; });
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

// ── TEST: crear hoja "Inventario" con el contenido inicial ──
// Ejecutar UNA vez desde el editor (▶️) tras configurar INVENTARIO_SHEET_ID.
// Pega los datos iniciales del catálogo (los 59 equipos normalizados).
function testCrearHojaInventario() {
  var ss = SpreadsheetApp.openById(INVENTARIO_SHEET_ID);
  var hoja = ss.getSheetByName(INVENTARIO_HOJA);
  if (hoja) {
    Logger.log("La hoja '" + INVENTARIO_HOJA + "' ya existe — no se sobrescribe.");
    return "EXISTE";
  }
  hoja = ss.insertSheet(INVENTARIO_HOJA);
  var datos = PEGA_INVENTARIO_INICIAL; // array [[categoria,marca,modelo,stock,notas], ...]
  var filas = [["categoria","marca","modelo","stock","notas"]].concat(datos);
  hoja.getRange(1, 1, filas.length, 5).setValues(filas);
  hoja.getRange(1, 1, 1, 5).setFontWeight("bold");
  hoja.setFrozenRows(1);
  Logger.log("Hoja '" + INVENTARIO_HOJA + "' creada con " + datos.length + " equipos.");
  // Limpiar caché para que el frontend vea los datos nuevos
  PropertiesService.getScriptProperties().deleteProperty("INVENTARIO_CACHE");
  PropertiesService.getScriptProperties().deleteProperty("INVENTARIO_CACHE_TS");
  return "OK";
}

// ── TEST: limpiar caché del inventario (tras editar el sheet) ──
function testLimpiarCacheInventario() {
  PropertiesService.getScriptProperties().deleteProperty("INVENTARIO_CACHE");
  PropertiesService.getScriptProperties().deleteProperty("INVENTARIO_CACHE_TS");
  Logger.log("Caché de inventario limpiada — el próximo ?accion=inventario relee el sheet.");
  return "OK";
}
