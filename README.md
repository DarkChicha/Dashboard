# Dashboard — Herramientas internas de Social Content Studio

Portal de herramientas internas del equipo **Social Content Studio** (Henri Barrett).
Rápidas, sin cuentas, sin pasos de más.

## Herramientas

| Herramienta | Descripción |
|---|---|
| **Generador de Guión** | Genera guiones con la Estructura Maestra de Video Editorial (6 bloques: Contrato, Problema, Reencuadre, Insight, Resolución, Apertura). Elige duración, tono y referencias. |
| **Sorteo Home Office** | Sistema de rotación justa para el programa de Home Office (2 cupos diarios, períodos de 5 semanas, export para RRHH). |
| **Reserva de Isla de Edición** | Reserva de islas de edición por turno (mañana 08:00–15:00 / noche 15:00–23:00). Agrega el evento al Google Calendar del equipo. |

## Stack

- React 19 + Vite
- Firebase Hosting (`video-editorial.web.app`)
- Claude Sonnet 4 / Gemini 2.5 Flash (generación de guiones)

## Setup local

```bash
npm install
cp .env.example .env.local   # pega tus API keys aquí (nunca se suben a git)
npm run dev
```

## Deploy

```bash
./deploy.ps1   # build + firebase deploy
```

> **Nota de seguridad**: las API keys y los datos del equipo (emails) viven en
> archivos locales ignorados por git (`.env.local`, `Sorteo/team-data.js`,
> `reservas-team.js`). No se suben al repositorio.
