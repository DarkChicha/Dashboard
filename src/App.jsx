import { useState, useRef } from "react";
import "./App.css";

// ─── CONFIGURACIÓN ────────────────────────────────────────────

const DURATION_CONFIG = {
  "30s": { label: "A", title: "30 seg", desc: "Impacto directo", rango: "25–35 segundos",
    instrucciones: `LONGITUD PARA 30 SEGUNDOS:
- [0] CONTRATO: 1 línea, máximo 8 palabras.
- [1] PROBLEMA: 2 líneas, frases muy cortas.
- [2] REENCUADRE: 1–2 líneas, frase screenshot breve.
- [3] INSIGHT: 2 líneas, referencia integrada brevemente.
- [4] RESOLUCIÓN: 1–2 líneas, consecuencia directa.
- [5] APERTURA: 1 línea, pregunta abierta.
Total: entre 55 y 85 palabras.` },
  "60s": { label: "B", title: "1 min", desc: "Desarrollo completo", rango: "55–65 segundos",
    instrucciones: `LONGITUD PARA 1 MINUTO:
- [0] CONTRATO: 1–2 líneas.
- [1] PROBLEMA: 3–4 líneas, puede incluir dato concreto.
- [2] REENCUADRE: 2–3 líneas, frase screenshot destacada.
- [3] INSIGHT: 3–5 líneas, referencias integradas con más desarrollo.
- [4] RESOLUCIÓN: 2–3 líneas desde dos ángulos.
- [5] APERTURA: 1–2 líneas, pregunta más imagen mental.
Total: entre 130 y 165 palabras.` },
};

const TONE_CONFIG = {
  academico:  { label: "Académico",  desc: "Preciso, conceptual, con peso intelectual" },
  coloquial:  { label: "Coloquial",  desc: "Cercano, directo, como una conversación real" },
  genz:       { label: "Gen Z",      desc: "Fragmentado, irónico, autoconsciente del formato" },
  ironico:    { label: "Irónico retador", desc: "Provoca, cuestiona, no da nada por sentado" },
};

const REFERENCE_CONFIG = {
  autores:        { label: "Autores",              sub: "Filósofos, sociólogos, pensadores" },
  historicos:     { label: "Hechos históricos",    sub: "Eventos que marcaron época" },
  celebridades:   { label: "Celebridades",         sub: "Escándalos, declaraciones, cultura pop" },
  dialogos:       { label: "Citas culturales",     sub: "Diálogos de películas, letras, personajes de libros o animes" },
  folklore:       { label: "Cultura popular",      sub: "Folklore, creencias, dichos y saberes colectivos" },
};

const TONE_INSTRUCTIONS = {
  academico:  `TONO ACADÉMICO: Usá lenguaje preciso y conceptual. Podés citar ideas con rigor. El espectador debe sentir que está escuchando a alguien que sabe de lo que habla. Sin jerga coloquial. Frases densas pero no herméticas.`,
  coloquial:  `TONO COLOQUIAL: Escribí como si le estuvieras hablando a alguien en una conversación. Sin tecnicismos. Contracciones naturales. El espectador debe sentir que esto lo podría decir cualquiera que piensa bien.`,
  genz:       `TONO GEN Z: Frases cortadas. Autoconciencia del formato. Podés romper la cuarta pared. Ironía suave. Ritmo sincopado. No explicar de más. El espectador siente que el video sabe que es un video.`,
  ironico:    `TONO IRÓNICO RETADOR: Cuestioná lo obvio. Usá la contradicción como herramienta. El espectador debe sentirse interpelado, casi incómodo. No agresivo, pero sí desafiante. Cada línea debe tener filo.`,
};

const REFERENCE_INSTRUCTIONS = {
  autores:      `Incluí 1-2 autores, pensadores, filósofos o académicos relevantes al tema. Mencionados naturalmente dentro del texto, no como cita bibliográfica.`,
  historicos:   `Conectá el argumento con uno o dos hechos históricos concretos que ilustren o amplíen el punto. El hecho debe reforzar el Reencuadre o el Insight.`,
  celebridades: `Anclá el guión en un momento real de una figura pública contemporánea: un escándalo, una declaración polémica, una foto de paparazzi, un momento viral. Usalo como espejo del argumento, no como chisme.`,
  dialogos:     `Usá una cita cultural reconocible — un diálogo de película, una letra de canción, un personaje de libro o anime — que resuene con el tema. Integrada naturalmente, no como epígrafe.`,
  folklore:     `Anclá el argumento en un dicho popular, una creencia colectiva, un mito urbano o un saber cultural compartido. Algo que el espectador ya sabe pero nunca había cuestionado.`,
};

// ─── BUILDER DE PROMPT ───────────────────────────────────────

const buildPrompt = (duracion, tono, referencias) => {
  const durCfg = DURATION_CONFIG[duracion];
  const toneInstr = TONE_INSTRUCTIONS[tono] || "";
  const refInstr = referencias.map((r) => REFERENCE_INSTRUCTIONS[r]).join("\n");

  return `Eres un experto en storytelling editorial para video corto. Generás guiones siguiendo la estructura VIDEO EDITORIAL exactamente.

ESTRUCTURA — 6 BLOQUES:
0. CONTRATO: primer frame, sensorial, NUNCA explica.
1. PROBLEMA: observación que el espectador reconoce pero no cuestionó. Sin juicio.
2. REENCUADRE: el giro. UNA frase screenshotteable obligatoria.
3. INSIGHT: de lo particular a lo universal. Integrá las referencias indicadas.
4. RESOLUCIÓN: consecuencia del insight. NUNCA consejo de coach.
5. APERTURA: transfiere la tensión. No cierra. Pregunta viva.

REGLAS: una idea por línea · frases cortas · tensión siempre en ascenso · NUNCA suena a venta.

${toneInstr}

REFERENCIAS A USAR:
${refInstr || "Sin referencias específicas — usá lo que mejor sirva al argumento."}

${durCfg.instrucciones}

FORMATO EXACTO DE RESPUESTA:

---
**TEMA:** [tema]
**FRASE SCREENSHOT:** [frase del bloque 2]
**DURACIÓN ESTIMADA:** [X segundos]
**REFERENCIAS USADAS:** [detalle de lo que usaste]

---

**[0] CONTRATO**
[texto]

**[1] PROBLEMA**
[texto]

**[2] REENCUADRE**
[texto]

**[3] INSIGHT**
[texto]

**[4] RESOLUCIÓN**
[texto]

**[5] APERTURA**
[texto]

---
**NOTA DE DIRECCIÓN:** [1-2 frases sobre tratamiento visual]
---

Respondé siempre en el idioma del usuario.`;
};

// ─── COLORES BLOQUES ─────────────────────────────────────────

const BLOCK_COLORS = {
  "0": { accent: "#CCFF00", sub: "pre-narrativo · sensorial" },
  "1": { accent: "#FF4D4D", sub: "observación disfrazada" },
  "2": { accent: "#FFD166", sub: "giro · nueva lectura" },
  "3": { accent: "#00E5C8", sub: "universalización" },
  "4": { accent: "#FF8C42", sub: "consecuencia · no receta" },
  "5": { accent: "#C084FC", sub: "transferencia al espectador" },
};

// ─── PARSER ──────────────────────────────────────────────────

function parseSections(text) {
  if (!text) return null;
  const sections = [];
  let current = null;
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t === "---") { if (current) { sections.push(current); current = null; } continue; }
    const bm = t.match(/^\*\*\[(\d)\]\s+([A-Za-záéíóúñÁÉÍÓÚÑ\s]+?)\*\*/i);
    const mm = t.match(/^\*\*([^*]+):\*\*\s*(.*)/);
    if (bm) { if (current) sections.push(current); current = { type: "block", num: bm[1], label: bm[2], lines: [] }; }
    else if (t.startsWith("**NOTA DE DIRECCIÓN:**")) { if (current) { sections.push(current); current = null; } sections.push({ type: "nota", text: t.replace("**NOTA DE DIRECCIÓN:**", "").trim() }); }
    else if (mm && !current) { sections.push({ type: "meta", key: mm[1], value: mm[2] }); }
    else if (current) { const c = t.replace(/\*\*/g, ""); if (c) current.lines.push(c); }
  }
  if (current) sections.push(current);
  return sections;
}

// ─── API CALLS ───────────────────────────────────────────────

// Las keys viven en .env.local (NO se suben a git). Variables: VITE_CLAUDE_KEY, VITE_GEMINI_KEY
const CLAUDE_KEY  = import.meta.env.VITE_CLAUDE_KEY  || "";
const GEMINI_KEY  = import.meta.env.VITE_GEMINI_KEY  || "";

async function callClaude(prompt, topic) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": CLAUDE_KEY,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1200,
      system: prompt,
      messages: [{ role: "user", content: `Generá un guión para:\n\n"${topic}"` }],
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  return data.content?.map((b) => b.text || "").join("\n") || "";
}

async function callGemini(prompt, topic) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_KEY}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${prompt}\n\nGenerá un guión para:\n\n"${topic}"` }] }],
      generationConfig: { maxOutputTokens: 2500, temperature: 1 },
      systemInstruction: { parts: [{ text: "Respondé SIEMPRE usando exactamente el formato indicado con **[0] CONTRATO**, **[1] PROBLEMA**, etc. Nunca omitas ningún bloque." }] },
    }),
  });
  const data = await res.json();
  if (data.error) throw new Error(data.error.message);
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
console.log("GEMINI RESPONSE:", text);
return text;
}

// ─── COMPONENTE ──────────────────────────────────────────────

export default function VideoEditorialGenerator() {
  const [topic,      setTopic]      = useState("");
  const [duracion,   setDuracion]   = useState("30s");
  const [tono,       setTono]       = useState("coloquial");
  const [refs,       setRefs]       = useState([]);
  const [ai,         setAi]         = useState("claude");
  const [result,     setResult]     = useState(null);
  const [usedAi,     setUsedAi]     = useState("claude");
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState(null);
  const [copied,     setCopied]     = useState(false);
  const textareaRef = useRef(null);

  // Máximo 2 referencias
  const toggleRef = (key) => {
    setRefs((prev) => {
      if (prev.includes(key)) return prev.filter((r) => r !== key);
      if (prev.length >= 2) return prev;
      return [...prev, key];
    });
  };

  const generate = async () => {
    if (!topic.trim()) return;
    setLoading(true); setError(null); setResult(null);
    const prompt = buildPrompt(duracion, tono, refs);
    try {
      let text = "";
      if (ai === "claude") {
        text = await callClaude(prompt, topic);
      } else {
        text = await callGemini(prompt, topic);
      }
      setResult(text);
      setUsedAi(ai);
    } catch (e) {
      setError(`Error: ${e.message || "Verificá tu API key e intentá de nuevo."}`);
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) generate(); };

  const copyResult = () => {
    if (!result) return;
    navigator.clipboard.writeText(result);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const sections   = parseSections(result);
  const meta       = sections?.filter((s) => s.type === "meta") || [];
  const blocks     = sections?.filter((s) => s.type === "block") || [];
  const nota       = sections?.find((s) => s.type === "nota");
  const screenshot = meta.find((m) => m.key === "FRASE SCREENSHOT");
  const durMeta    = meta.find((m) => m.key === "DURACIÓN ESTIMADA");
  const refMeta    = meta.find((m) => m.key === "REFERENCIAS USADAS");
  const canGen     = !loading && topic.trim().length > 0;

  return (
    <div className="ve-page">

      {/* HEADER */}
      <div className="ve-header">
        <div className="ve-header-left">
          <span className="ve-header-brand">HENRI BARRETT</span>
          <span className="ve-header-div">|</span>
          <span className="ve-header-sub">VIDEO EDITORIAL</span>
        </div>
        <div className="ve-header-pill">CURIOSITY IS SEXY</div>
      </div>

      <div className="ve-main">

        {/* TÍTULO */}
        <div className="ve-title">
          <h1>GENERADOR<br />DE GUIÓN</h1>
          <p>Estructura Maestra · Video Editorial</p>
        </div>

        {/* ── P1: DURACIÓN ── */}
        <div className="ve-section">
          <div className="ve-param-label">
            <span className="ve-param-tag">PARÁMETRO 1</span>
            <span className="ve-param-name">— DURACIÓN</span>
          </div>
          <div className="ve-dur-grid">
            {Object.entries(DURATION_CONFIG).map(([key, cfg]) => (
              <button key={key} className={`ve-dur-btn${duracion === key ? " active" : ""}`}
                onClick={() => setDuracion(key)}>
                <span className="ve-dur-badge">{cfg.label}</span>
                <div className="ve-dur-title">{cfg.title}</div>
                <div className="ve-dur-desc">{cfg.desc}</div>
                <div className="ve-dur-range">{cfg.rango}</div>
              </button>
            ))}
          </div>
        </div>

        {/* ── P2: TONO ── */}
        <div className="ve-section">
          <div className="ve-param-label">
            <span className="ve-param-tag">PARÁMETRO 2</span>
            <span className="ve-param-name">— TONO</span>
          </div>
          <div className="ve-grid-4">
            {Object.entries(TONE_CONFIG).map(([key, cfg]) => (
              <button key={key} className={`ve-opt-btn${tono === key ? " active" : ""}`}
                onClick={() => setTono(key)}>
                <div className="ve-opt-title">{cfg.label}</div>
                <div className="ve-opt-desc">{cfg.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {/* ── P3: REFERENCIAS ── */}
        <div className="ve-section">
          <div className="ve-param-label">
            <span className="ve-param-tag">PARÁMETRO 3</span>
            <span className="ve-param-name">— REFERENCIAS {refs.length > 0 ? `(${refs.length}/2)` : "(máx. 2)"}</span>
          </div>
          <div className="ve-check-grid">
            {Object.entries(REFERENCE_CONFIG).map(([key, cfg]) => {
              const checked = refs.includes(key);
              const disabled = !checked && refs.length >= 2;
              return (
                <button key={key}
                  className={`ve-check-btn${checked ? " active" : ""}`}
                  onClick={() => !disabled && toggleRef(key)}
                  style={{ opacity: disabled ? 0.4 : 1, cursor: disabled ? "not-allowed" : "pointer" }}>
                  <div className="ve-check-box">
                    {checked && <span className="ve-check-mark">✓</span>}
                  </div>
                  <div>
                    <div className="ve-check-label">{cfg.label}</div>
                    <div className="ve-check-sub">{cfg.sub}</div>
                  </div>
                </button>
              );
            })}
          </div>
          {refs.length === 0 && (
            <p className="ve-check-limit">Sin selección: el modelo elige las referencias más relevantes.</p>
          )}
        </div>

        {/* ── P4: IA ── */}
        <div className="ve-section">
          <div className="ve-param-label">
            <span className="ve-param-tag">PARÁMETRO 4</span>
            <span className="ve-param-name">— INTELIGENCIA ARTIFICIAL</span>
          </div>
          <div className="ve-ai-grid">
            <button className={`ve-ai-btn claude${ai === "claude" ? " active" : ""}`}
              onClick={() => setAi("claude")}>
              <div className="ve-ai-name">Claude</div>
              <div className="ve-ai-model">Anthropic · Sonnet 4</div>
            </button>
            <button className={`ve-ai-btn gemini${ai === "gemini" ? " active" : ""}`}
              onClick={() => setAi("gemini")}>
              <div className="ve-ai-name">Gemini</div>
              <div className="ve-ai-model">Google · 2.5 Flash</div>
            </button>
          </div>
        </div>

        {/* ── TEMA ── */}
        <div className="ve-section">
          <label className="ve-field-label">TEMA O PREGUNTA</label>
          <textarea ref={textareaRef} className="ve-textarea" value={topic}
            onChange={(e) => setTopic(e.target.value)} onKeyDown={handleKey}
            placeholder="Ej: Por qué las personas pagan más por marcas que hacen exactamente lo mismo que las genéricas"
            rows={3} />
          <p className="ve-hint">⌘ + Enter para generar</p>
        </div>

        {/* ── BOTÓN ── */}
        <button className={`ve-gen-btn${canGen ? " active" : ""}`} onClick={generate} disabled={!canGen}>
          {loading ? "GENERANDO GUIÓN..." : `GENERAR CON ${ai === "claude" ? "CLAUDE" : "GEMINI"} · ${DURATION_CONFIG[duracion].title.toUpperCase()} · ${TONE_CONFIG[tono].label.toUpperCase()}`}
        </button>

        {/* ── LOADING ── */}
        {loading && (
          <div className="ve-loading">
            <div className="ve-dots">
              {["0","1","2","3","4","5"].map((n) => (
                <div key={n} className="ve-dot" style={{
                  background: BLOCK_COLORS[n].accent,
                  animation: `ve-pulse 1.3s ease-in-out ${parseInt(n) * 0.15}s infinite`,
                }} />
              ))}
            </div>
            <p className="ve-loading-text">CONSTRUYENDO ESTRUCTURA...</p>
          </div>
        )}

        {/* ── ERROR ── */}
        {error && <div className="ve-error">{error}</div>}

        {/* ── RESULTADO ── */}
        {result && sections && (
          <div className="ve-result">

            <div className="ve-result-header">
              <span className={`ve-result-ai-badge ${usedAi}`}>
                {usedAi === "claude" ? "CLAUDE · SONNET 4" : "GEMINI · 2.5 FLASH"}
              </span>
            </div>

            <div className="ve-meta">
              {screenshot && (
                <>
                  <div className="ve-ss-label">FRASE SCREENSHOT</div>
                  <div className="ve-ss-text">"{screenshot.value}"</div>
                </>
              )}
              <div className="ve-meta-row">
                {durMeta && (
                  <div>
                    <div className="ve-meta-key">DURACIÓN</div>
                    <div className="ve-meta-val">{durMeta.value}</div>
                  </div>
                )}
                <div>
                  <div className="ve-meta-key">TONO</div>
                  <div className="ve-meta-val">{TONE_CONFIG[tono]?.label}</div>
                </div>
                {refMeta && (
                  <div>
                    <div className="ve-meta-key">REFERENCIAS</div>
                    <div className="ve-meta-val">{refMeta.value}</div>
                  </div>
                )}
              </div>
            </div>

            <div className="ve-blocks">
              {blocks.map((block, i) => {
                const bc = BLOCK_COLORS[block.num] || { accent: "#555", sub: "" };
                return (
                  <div key={i} className="ve-block">
                    <div className="ve-block-bar" style={{ background: bc.accent }} />
                    <div className="ve-block-inner">
                      <div className="ve-block-header">
                        <span className="ve-block-num" style={{ color: bc.accent }}>{block.num}</span>
                        <div>
                          <div className="ve-block-label">{block.label}</div>
                          <div className="ve-block-sub">{bc.sub}</div>
                        </div>
                      </div>
                      {block.lines.map((line, j) => (
                        <p key={j} className={`ve-block-line${block.num === "2" ? " hl" : ""}`}>{line}</p>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {nota && (
              <div className="ve-nota">
                <div className="ve-nota-label">NOTA DE DIRECCIÓN</div>
                <p className="ve-nota-text">{nota.text.replace(/\*\*/g, "")}</p>
              </div>
            )}

            <button className={`ve-copy-btn${copied ? " copied" : ""}`} onClick={copyResult}>
              {copied ? "✓ COPIADO AL PORTAPAPELES" : "COPIAR GUIÓN COMPLETO"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
