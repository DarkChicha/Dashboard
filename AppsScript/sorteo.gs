// ============================================================
// SORTEO HOME OFFICE — backend Apps Script
// Proyecto independiente (script.google.com), separado de reservas.gs
// ============================================================

// ── Configuración ──────────────────────────────────────────
var CALENDAR_NAME = "Social Content Studio Calendar";
var RRHH_EMAILS   = ["renzo@henribarrett.com", "suzanne@henribarrett.com"];
var HO_INVITEES   = ["film@henribarrett.com", "renzo@henribarrett.com",
                     "hola@henribarrett.com", "projects@henribarrett.com",
                     "suzanne@henribarrett.com", "pablo@henribarrett.com"];

// ── Punto de entrada POST ──────────────────────────────────
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

// doGet no es necesario (el sorteo solo recibe POST), pero se deja por si acaso
function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({ok:false, error:"Usa POST"}))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── Lógica principal: hace las 3 acciones del sorteo, en orden ──
function procesarSorteo(payload) {
  enviarMailCompilatorio(payload);
  var eventos = crearEventosHO(payload);
  var mails = enviarMailsRecordatorio(payload);

  return {ok:true, eventos: eventos, mails: mails};
}

// ── Acción 1: mail compilatorio a RRHH ─────────────────────
function enviarMailCompilatorio(payload) {
  var asunto = "HO " + payload.areaName + " — Semana " + payload.weekNumber + " de 5";

  var cuerpo = "PROGRAMA HOME OFFICE — " + payload.areaName + "\n";
  cuerpo += "Semana " + payload.weekNumber + " de 5 | " + payload.weekLabel + "\n\n";

  payload.days.forEach(function (dia) {
    if (dia.people && dia.people.length > 0) {
      cuerpo += dia.dayName + " " + dia.date + ": " + dia.people.join(", ") + "\n";
    } else {
      cuerpo += dia.dayName + " " + dia.date + ": sin asignaciones\n";
    }
  });

  cuerpo += "\nEnviado automáticamente por el Toolkit de Henri Barrett.";

  MailApp.sendEmail({
    to: RRHH_EMAILS.join(","),
    subject: asunto,
    body: cuerpo
  });
}

// ── Acción 2: crear eventos all-day de HO en Calendar ──────
function crearEventosHO(payload) {
  // Los eventos HO van al calendario por defecto de la cuenta que ejecuta el script
  var calendario = CalendarApp.getDefaultCalendar();

  var totalEventos = 0;

  payload.days.forEach(function (dia) {
    if (!dia.people || dia.people.length === 0) return;

    // Fecha con hora fija al mediodía para evitar problemas de timezone
    var fecha = new Date(dia.date + "T12:00:00");

    dia.people.forEach(function (persona) {
      var titulo = persona + " H.O.";

      // Evitar duplicados: buscar si ya existe un evento con ese título ese día
      var eventosDelDia = calendario.getEventsForDay(fecha);
      var yaExiste = eventosDelDia.some(function (ev) {
        return ev.getTitle() === titulo;
      });
      if (yaExiste) return;

      var evento = calendario.createAllDayEvent(titulo, fecha);
      HO_INVITEES.forEach(function (email) {
        evento.addGuest(email);
      });
      totalEventos++;
    });
  });

  return totalEventos;
}

// ── Acción 3: mail de recordatorio a cada persona con HO ───
function enviarMailsRecordatorio(payload) {
  var totalMails = 0;

  payload.days.forEach(function (dia) {
    if (!dia.people || dia.people.length === 0) return;

    dia.people.forEach(function (persona) {
      var email = payload.areaEmails[persona];
      if (!email) {
        Logger.log("WARNING: sin email para " + persona + ", se omite recordatorio");
        return;
      }

      var asunto = "Tu Home Office: " + dia.dayName + " " + dia.date;
      var cuerpo = "Hola " + persona + ",\n\n" +
        "Tenés Home Office el " + dia.dayName + " " + dia.date + ".\n\n" +
        "Recordá ingresarlo en Buk.";

      MailApp.sendEmail({
        to: email,
        subject: asunto,
        body: cuerpo
      });
      totalMails++;
    });
  });

  return totalMails;
}
