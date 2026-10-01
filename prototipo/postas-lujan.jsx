import React, { useState, useEffect, useRef, useCallback } from "react";

/* ------------------------------------------------------------------ */
/*  Postas — Peregrinación a Luján, 3 de octubre                       */
/*  Dos formas de marcar: el responsable desde la lista, o el          */
/*  peregrino cargando el código que ve en el cartel de la posta.      */
/* ------------------------------------------------------------------ */

const CSS = `
.pl{
  --noche:#0B1830; --sup:#132648; --sup2:#1C3462;
  --celeste:#7EC0F2; --celeste-op:#3C7FB8; --vela:#F0B54B;
  --texto:#EAF2FB; --tenue:#93AACB; --ok:#66D19E; --alerta:#F2856E;
  background:var(--noche); color:var(--texto); min-height:100vh;
  font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  font-variant-numeric: tabular-nums; display:flex; flex-direction:column;
  -webkit-font-smoothing:antialiased;
}
.pl *{box-sizing:border-box}
.pl button{font:inherit;color:inherit;background:none;border:none;cursor:pointer}
.pl input,.pl textarea{font:inherit;color:inherit}
.pl :focus-visible{outline:2px solid var(--celeste);outline-offset:2px;border-radius:5px}
.pl a{color:var(--celeste)}

.cab{position:sticky;top:0;z-index:5;background:var(--noche);padding:14px 16px 12px;
  border-bottom:1px solid rgba(126,192,242,.18)}
.navp{display:flex;align-items:center;gap:10px}
.fle{width:38px;height:38px;border-radius:50%;background:var(--sup);display:grid;
  place-items:center;font-size:18px;flex:none}
.fle[disabled]{opacity:.3;cursor:default}
.tit{flex:1;min-width:0;text-align:center}
.tit b{display:block;font-size:19px;font-weight:650;letter-spacing:-.01em;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tit span{font-size:12px;color:var(--tenue)}

.cont{display:flex;align-items:baseline;gap:8px;margin:14px 0 8px}
.cont .n{font-size:46px;font-weight:700;line-height:.9;letter-spacing:-.03em}
.cont .de{font-size:15px;color:var(--tenue)}
.cont .fa{margin-left:auto;font-size:14px;color:var(--vela);font-weight:600}

.ticks{display:flex;flex-wrap:wrap;gap:2px;margin-top:4px}
.tk{width:6px;height:13px;border-radius:1px;background:rgba(147,170,203,.22)}
.tk.on{background:var(--celeste)}
.tk.qr{background:var(--ok)}

.sync{margin-top:10px;display:flex;align-items:center;gap:6px;font-size:12px;color:var(--tenue)}
.pt{width:7px;height:7px;border-radius:50%;background:var(--ok);flex:none}
.pt.pend{background:var(--vela)} .pt.mal{background:var(--alerta)}

.cpo{flex:1;padding:14px 16px 96px}
.busc{width:100%;background:var(--sup);border:none;border-radius:12px;padding:13px 14px;font-size:16px}
.busc::placeholder{color:var(--tenue)}
.chips{display:flex;gap:8px;margin:10px 0 14px}
.chip{padding:7px 13px;border-radius:999px;background:var(--sup);font-size:13px;color:var(--tenue)}
.chip.act{background:var(--celeste);color:#06121f;font-weight:650}

.fila{display:flex;align-items:center;gap:12px;width:100%;text-align:left;padding:11px 12px;
  border-radius:12px;background:var(--sup);margin-bottom:7px;border-left:3px solid transparent}
.fila.on{background:var(--sup2);border-left-color:var(--celeste)}
.fila.qr{border-left-color:var(--ok)}
.num{flex:none;width:36px;font-size:13px;color:var(--tenue);font-weight:600}
.fila.on .num{color:var(--celeste)}
.nom{flex:1;min-width:0;font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nom small{display:block;font-size:11px;color:var(--tenue);font-weight:400}
.mar{flex:none;width:26px;height:26px;border-radius:50%;border:1.5px solid rgba(147,170,203,.4);
  display:grid;place-items:center;font-size:14px}
.fila.on .mar{background:var(--celeste);border-color:var(--celeste);color:#06121f;font-weight:800}
.fila.qr .mar{background:var(--ok);border-color:var(--ok)}
.pill{flex:none;font-size:12px;color:var(--celeste);padding:6px 10px;
  border:1px solid rgba(126,192,242,.35);border-radius:999px;text-decoration:none}

.tabs{position:fixed;bottom:0;left:0;right:0;display:flex;background:var(--noche);
  border-top:1px solid rgba(126,192,242,.18);padding:6px 4px 10px}
.tab{flex:1;padding:8px 2px;font-size:11px;color:var(--tenue);text-align:center;line-height:1.5}
.tab i{display:block;font-size:17px;font-style:normal}
.tab.act{color:var(--celeste);font-weight:650}

.vac{text-align:center;padding:44px 20px;color:var(--tenue);font-size:14px;line-height:1.6}
.h{font-size:13px;color:var(--tenue);margin:22px 0 9px;font-weight:600}
.h:first-child{margin-top:4px}
.caja{background:var(--sup);border-radius:14px;padding:15px}
.btn{display:block;width:100%;background:var(--celeste);color:#06121f;font-weight:700;
  padding:14px;border-radius:12px;font-size:15px;text-align:center}
.btn.sec{background:var(--sup2);color:var(--texto);font-weight:600}
.btn+.btn{margin-top:9px}
.area{width:100%;min-height:120px;background:var(--noche);border:1px solid rgba(147,170,203,.25);
  border-radius:10px;padding:11px;font-size:13px;resize:vertical;
  font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
.res{display:flex;align-items:center;gap:11px;padding:10px 0;
  border-bottom:1px solid rgba(147,170,203,.13)}
.res:last-child{border-bottom:none}
.res .nm{flex:1;font-size:14px}
.res .ct{font-size:14px;font-weight:650}
.bar{width:60px;height:6px;border-radius:3px;background:rgba(147,170,203,.2);overflow:hidden;flex:none}
.bar i{display:block;height:100%;background:var(--celeste)}

.grp{margin-bottom:18px}
.grp h4{margin:0 0 8px;font-size:14px;font-weight:650;display:flex;align-items:center;gap:8px}
.grp h4 em{font-style:normal;font-size:12px;color:var(--tenue);font-weight:500}
.grp.atras h4{color:var(--vela)}
.gente{display:flex;flex-wrap:wrap;gap:6px}
.per{background:var(--sup);border-radius:8px;padding:6px 10px;font-size:13px}
.grp.atras .per{background:rgba(240,181,75,.14)}

.yo{padding:26px 18px;text-align:center}
.yo .g{font-size:25px;font-weight:700;margin:6px 0 2px;letter-spacing:-.02em}
.yo .s{color:var(--tenue);font-size:14px}
.codin{width:100%;background:var(--sup);border:1px solid rgba(126,192,242,.3);border-radius:16px;
  padding:20px;font-size:38px;font-weight:700;text-align:center;letter-spacing:.18em}
.gigante{width:100%;padding:28px 18px;border-radius:20px;background:var(--celeste);color:#06121f;
  font-size:20px;font-weight:750;line-height:1.3;margin-top:12px}
.gigante.listo{background:var(--sup2);color:var(--celeste);border:1px solid var(--celeste-op)}
.ruta{margin-top:26px;text-align:left}
.paso{display:flex;gap:12px;align-items:center;padding:8px 0;font-size:14px}
.bol{width:11px;height:11px;border-radius:50%;background:rgba(147,170,203,.28);flex:none}
.bol.on{background:var(--celeste)}
.paso.pend{color:var(--tenue)}

.cartel{background:#fff;color:#0B1830;border-radius:16px;padding:22px;text-align:center}
.cartel .pn{font-size:13px;letter-spacing:.06em;color:#5b7196}
.cartel .pnom{font-size:24px;font-weight:750;margin:2px 0 14px;letter-spacing:-.02em}
.cartel img{width:100%;max-width:230px;height:auto;display:block;margin:0 auto;border-radius:8px}
.cartel .cod{font-size:52px;font-weight:800;letter-spacing:.14em;margin:14px 0 2px}
.cartel .ay{font-size:13px;color:#5b7196;line-height:1.5}
.aviso{font-size:13px;color:var(--tenue);line-height:1.6;margin:0 0 11px}

.avi{display:flex;align-items:center;gap:10px;padding:11px 12px;border-radius:12px;
  background:rgba(242,133,110,.12);border-left:3px solid var(--alerta);margin-bottom:7px}
.avi .nom small{color:var(--alerta);opacity:.9}
.tab{position:relative}
.dot{position:absolute;top:5px;right:calc(50% - 22px);width:8px;height:8px;
  border-radius:50%;background:var(--alerta)}
`;

const VERSION = 2;

const POSTAS_DEFAULT = [
  { nombre: "Morón — salida", codigo: "4108" },
  { nombre: "La Reja", codigo: "7245" },
  { nombre: "General Rodríguez", codigo: "3961" },
  { nombre: "Luján — llegada", codigo: "8630" },
  { nombre: "Luján — subida al micro", codigo: "5274" },
].map((p, i) => ({ id: "po" + (i + 1), ...p }));

const EJEMPLO = [
  "1,PEREZ,ANA", "2,GOMEZ,LUIS", "3,SOSA,MARTA", "4,DIAZ,JUAN", "5,ROMERO,SOFIA",
  "6,LOPEZ,MATEO", "7,SILVA,CAMILA", "8,TORRES,DIEGO", "9,MOLINA,JULIETA",
  "10,VEGA,NICOLAS", "11,CASTRO,LUCIA", "12,HERRERA,PABLO",
].join("\n");

const hayStore = () => typeof window !== "undefined" && window.storage;

async function leer(clave) {
  if (!hayStore()) return null;
  try {
    const r = await window.storage.get(clave, true);
    return r ? JSON.parse(r.value) : null;
  } catch { return null; }
}
async function guardar(clave, valor) {
  if (!hayStore()) throw new Error("sin almacenamiento");
  const r = await window.storage.set(clave, JSON.stringify(valor), true);
  if (!r) throw new Error("no guardó");
  return r;
}

/* se queda con la marca más reciente de cada peregrino en cada posta */
function unir(a = {}, b = {}) {
  const out = { ...a };
  for (const [posta, marcas] of Object.entries(b)) {
    out[posta] = { ...(out[posta] || {}) };
    for (const [num, m] of Object.entries(marcas)) {
      const prev = out[posta][num];
      if (!prev || (m.t || 0) > (prev.t || 0)) out[posta][num] = m;
    }
  }
  return out;
}
const cuenta = (m = {}) => Object.values(m).filter((x) => x && x.p).length;

/* junta los avisos de los dos lados; si alguno lo dio por resuelto, queda resuelto */
function unirAvisos(a = [], b = []) {
  const m = new Map();
  for (const x of [...a, ...b]) {
    const prev = m.get(x.id);
    m.set(x.id, prev ? { ...prev, ...x, ok: prev.ok || x.ok } : x);
  }
  return [...m.values()].sort((x, y) => (y.t || 0) - (x.t || 0));
}

export default function PostasLujan() {
  const [padron, setPadron] = useState([]);
  const [postas, setPostas] = useState(POSTAS_DEFAULT);
  const [idx, setIdx] = useState(0);
  const [marcas, setMarcas] = useState({});
  const [link, setLink] = useState("");
  const [vista, setVista] = useState("marcar");
  const [rol, setRol] = useState(null);
  const [miNum, setMiNum] = useState("");
  const [codigo, setCodigo] = useState("");
  const [aviso, setAviso] = useState(null);
  const [avisos, setAvisos] = useState([]);
  const [pidiendo, setPidiendo] = useState(null);
  const [busq, setBusq] = useState("");
  const [filtro, setFiltro] = useState("faltan");
  const [sync, setSync] = useState("ok");
  const [pegado, setPegado] = useState("");
  const [qrRoto, setQrRoto] = useState(false);
  const [cargando, setCargando] = useState(true);

  const pend = useRef(null);
  const ref = useRef(marcas);
  ref.current = marcas;

  useEffect(() => {
    (async () => {
      const [cfg, pad, mk, av] = await Promise.all([
        leer("config"), leer("padron"), leer("marcas"), leer("avisos"),
      ]);
      const vigente = cfg?.v === VERSION && cfg?.postas?.length;
      if (vigente) setPostas(cfg.postas);
      else guardar("config", { v: VERSION, postas: POSTAS_DEFAULT, idx: 0, link: cfg?.link || "" }).catch(() => {});
      if (vigente && typeof cfg.idx === "number") setIdx(cfg.idx);
      if (cfg?.link) setLink(cfg.link);
      if (pad?.length) setPadron(pad);
      if (mk) setMarcas(mk);
      if (Array.isArray(av)) setAvisos(av);
      try {
        const yo = await window.storage.get("mi-numero", false);
        if (yo?.value) { setMiNum(yo.value); setRol("peregrino"); }
      } catch { /* todavía no eligió rol */ }
      setCargando(false);
    })();
  }, []);

  const subir = useCallback(() => {
    clearTimeout(pend.current);
    setSync("pend");
    pend.current = setTimeout(async () => {
      try {
        const remoto = await leer("marcas");
        const u = unir(remoto || {}, ref.current);
        await guardar("marcas", u);
        setMarcas(u);
        setSync("ok");
      } catch { setSync("mal"); }
    }, 1200);
  }, []);

  useEffect(() => {
    const t = setInterval(async () => {
      if (document.hidden || sync === "pend") return;
      const [r, a] = await Promise.all([leer("marcas"), leer("avisos")]);
      if (r) setMarcas((m) => unir(r, m));
      if (Array.isArray(a)) setAvisos((prev) => unirAvisos(a, prev));
    }, 20000);
    return () => clearInterval(t);
  }, [sync]);

  const posta = postas[idx] || postas[0];
  const acá = marcas[posta?.id] || {};
  const nPres = cuenta(acá);

  function marcar(num, postaId, via, valor) {
    const n = String(num);
    const actual = !!marcas[postaId]?.[n]?.p;
    const p = valor === undefined ? !actual : valor;
    setMarcas((m) => ({
      ...m,
      [postaId]: { ...(m[postaId] || {}), [n]: { p, t: Date.now(), via } },
    }));
    subir();
  }

  async function guardarCfg(next = {}) {
    const cfg = { v: VERSION, postas, idx, link, ...next };
    try { await guardar("config", cfg); } catch { setSync("mal"); }
  }

  function ultimaPostaDe(num) {
    let u = null;
    postas.forEach((p) => { if (marcas[p.id]?.[String(num)]?.p) u = p.nombre; });
    return u;
  }

  async function sincronizarAvisos(lista) {
    setAvisos(lista);
    try {
      const remoto = await leer("avisos");
      const u = unirAvisos(Array.isArray(remoto) ? remoto : [], lista);
      await guardar("avisos", u);
      setAvisos(u);
    } catch { setSync("mal"); }
  }

  function avisar(tipo) {
    const nuevo = {
      id: miNum + "-" + Date.now(), n: Number(miNum), tipo,
      t: Date.now(), desde: ultimaPostaDe(miNum),
    };
    sincronizarAvisos(unirAvisos(avisos, [nuevo]));
    setAviso({ txt: "Avisamos al equipo. Quedate donde estás." });
  }

  function resolver(id) {
    sincronizarAvisos(avisos.map((a) => (a.id === id ? { ...a, ok: true } : a)));
  }

  function importar(texto) {
    const lista = [];
    for (const f of texto.split("\n").map((l) => l.trim()).filter(Boolean)) {
      const c = f.split(/\t|,|;/).map((x) => x.trim().replace(/^"|"$/g, ""));
      const n = parseInt(c[0], 10);
      if (!n || !c[1]) continue;
      lista.push({ n, apellido: c[1], nombre: c[2] || "", micro: c[3] || "", tel: (c[4] || "").replace(/\D/g, "") });
    }
    if (!lista.length) { setAviso({ mal: true, txt: "No encontré filas con número y apellido." }); return; }
    setPadron(lista); setPegado("");
    guardar("padron", lista).catch(() => setSync("mal"));
    setAviso({ txt: `Cargados ${lista.length} peregrinos.` });
    setVista("marcar");
  }

  /* el peregrino carga el código que ve en el cartel */
  function usarCodigo() {
    const c = codigo.trim();
    const destino = postas.find((p) => p.codigo === c);
    if (!destino) { setAviso({ mal: true, txt: "Ese código no es de ninguna posta. Mirá bien el cartel." }); return; }
    if (marcas[destino.id]?.[String(miNum)]?.p) {
      setAviso({ txt: `Ya estabas marcado en ${destino.nombre}.` });
    } else {
      marcar(miNum, destino.id, "qr");
      setAviso({ txt: `Listo, quedaste marcado en ${destino.nombre}.` });
    }
    setCodigo("");
  }

  const urlQR = (txt) =>
    `https://api.qrserver.com/v1/create-qr-code/?size=420x420&margin=10&data=${encodeURIComponent(txt)}`;

  if (cargando) {
    return <div className="pl"><style>{CSS}</style><div className="vac" style={{ marginTop: 80 }}>Cargando…</div></div>;
  }

  if (!rol) {
    return (
      <div className="pl"><style>{CSS}</style>
        <div className="yo" style={{ marginTop: 40 }}>
          <div className="g">Postas</div>
          <div className="s" style={{ marginBottom: 26 }}>Peregrinación a Luján · 3 de octubre</div>
          <button className="btn" onClick={() => setRol("resp")}>Soy responsable de posta</button>
          <button className="btn sec" onClick={() => setRol("peregrino")}>Soy peregrino</button>
        </div>
      </div>
    );
  }

  /* ---------------------------- peregrino ---------------------------- */
  if (rol === "peregrino") {
    const yo = padron.find((p) => String(p.n) === String(miNum));
    return (
      <div className="pl"><style>{CSS}</style>
        <div className="yo">
          {!miNum ? (
            <>
              <div className="g">Tu número</div>
              <div className="s" style={{ marginBottom: 18 }}>El que tenés en la lista del micro</div>
              <input className="codin" inputMode="numeric" placeholder="47"
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "");
                  if (v) {
                    setMiNum(v);
                    try { window.storage.set("mi-numero", v, false); } catch { /* sigue igual */ }
                  }
                }} />
            </>
          ) : (
            <>
              <div className="s">Peregrino {miNum}{yo ? ` · ${yo.nombre} ${yo.apellido}` : ""}</div>
              <div className="g" style={{ marginBottom: 16 }}>Código de la posta</div>
              <input className="codin" inputMode="numeric" maxLength={4} value={codigo}
                placeholder="••••"
                onChange={(e) => setCodigo(e.target.value.replace(/\D/g, ""))} />
              <button className="gigante" onClick={usarCodigo} disabled={codigo.length < 4}
                style={codigo.length < 4 ? { opacity: .45 } : undefined}>
                Marcar que pasé
              </button>
              {aviso && (
                <div className="s" style={{ marginTop: 14, color: aviso.mal ? "var(--alerta)" : "var(--ok)" }}>
                  {aviso.txt}
                </div>
              )}
              <div className="ruta">
                {postas.map((p) => {
                  const ok = !!marcas[p.id]?.[String(miNum)]?.p;
                  return (
                    <div key={p.id} className={"paso" + (ok ? "" : " pend")}>
                      <span className={"bol" + (ok ? " on" : "")} />
                      <span style={{ flex: 1 }}>{p.nombre}</span>
                      {ok && <span style={{ fontSize: 11, color: "var(--celeste)" }}>pasaste</span>}
                    </div>
                  );
                })}
              </div>
              {pidiendo ? (
                <div className="caja" style={{ marginTop: 20, textAlign: "left" }}>
                  <p className="aviso">
                    {pidiendo === "ayuda"
                      ? "El equipo va a ver que necesitás ayuda y por dónde pasaste la última vez."
                      : "El equipo va a ver que no seguís caminando, para pasar a buscarte."}
                  </p>
                  <button className="btn" onClick={() => { avisar(pidiendo); setPidiendo(null); }}>Sí, avisar</button>
                  <button className="btn sec" onClick={() => setPidiendo(null)}>Mejor no</button>
                </div>
              ) : (
                <>
                  <button className="btn sec" style={{ marginTop: 20 }}
                    onClick={() => setPidiendo("bajo")}>No puedo seguir</button>
                  <button className="btn sec" onClick={() => setPidiendo("ayuda")}>Necesito ayuda</button>
                </>
              )}

              <button className="btn sec" style={{ marginTop: 24, opacity: .6 }}
                onClick={() => { setMiNum(""); setRol(null); setAviso(null); }}>
                Salir
              </button>
            </>
          )}
        </div>
      </div>
    );
  }

  /* ---------------------------- responsable ---------------------------- */
  const lista = padron
    .filter((p) => {
      const on = !!acá[String(p.n)]?.p;
      if (filtro === "faltan" && on) return false;
      if (filtro === "presentes" && !on) return false;
      if (!busq.trim()) return true;
      const q = busq.toLowerCase();
      return String(p.n) === q || `${p.apellido} ${p.nombre}`.toLowerCase().includes(q);
    })
    .sort((a, b) => a.n - b.n);

  /* última posta por la que pasó cada uno */
  const ultima = {};
  padron.forEach((p) => {
    let u = -1;
    postas.forEach((po, i) => { if (marcas[po.id]?.[String(p.n)]?.p) u = i; });
    ultima[p.n] = u;
  });
  const frente = Math.max(-1, ...Object.values(ultima));
  const grupos = postas.map((po, i) => ({
    posta: po, i, gente: padron.filter((p) => ultima[p.n] === i),
  })).filter((g) => g.gente.length).reverse();
  const sinRegistro = padron.filter((p) => ultima[p.n] === -1);

  return (
    <div className="pl"><style>{CSS}</style>

      {vista === "marcar" && (
        <>
          <div className="cab">
            <div className="navp">
              <button className="fle" disabled={idx === 0} aria-label="Posta anterior"
                onClick={() => { setIdx(idx - 1); guardarCfg({ idx: idx - 1 }); }}>‹</button>
              <div className="tit">
                <b>{posta?.nombre}</b>
                <span>posta {idx + 1} de {postas.length} · código {posta?.codigo}</span>
              </div>
              <button className="fle" disabled={idx === postas.length - 1} aria-label="Posta siguiente"
                onClick={() => { setIdx(idx + 1); guardarCfg({ idx: idx + 1 }); }}>›</button>
            </div>

            <div className="cont">
              <span className="n">{nPres}</span>
              <span className="de">de {padron.length} pasaron</span>
              {padron.length - nPres > 0 && <span className="fa">faltan {padron.length - nPres}</span>}
            </div>

            <div className="ticks">
              {padron.map((p) => {
                const m = acá[String(p.n)];
                return <span key={p.n} className={"tk" + (m?.p ? (m.via === "qr" ? " qr" : " on") : "")} />;
              })}
            </div>

            <div className="sync">
              <span className={"pt" + (sync === "pend" ? " pend" : sync === "mal" ? " mal" : "")} />
              {sync === "ok" && "Al día con el resto del equipo"}
              {sync === "pend" && "Guardando…"}
              {sync === "mal" && "Sin conexión — queda guardado y sube solo"}
            </div>
          </div>

          <div className="cpo">
            {padron.length === 0 ? (
              <div className="vac">Todavía no cargaste el padrón.<br />Está en la pestaña Datos.</div>
            ) : (
              <>
                <input className="busc" placeholder="Buscar por número o apellido"
                  value={busq} onChange={(e) => setBusq(e.target.value)} />
                <div className="chips">
                  {[["faltan", "Faltan"], ["todos", "Todos"], ["presentes", "Pasaron"]].map(([k, t]) => (
                    <button key={k} className={"chip" + (filtro === k ? " act" : "")}
                      onClick={() => setFiltro(k)}>{t}</button>
                  ))}
                </div>
                {lista.length === 0 ? (
                  <div className="vac">{filtro === "faltan" ? "Pasaron todos por acá." : "Nada para mostrar."}</div>
                ) : lista.map((p) => {
                  const m = acá[String(p.n)];
                  return (
                    <button key={p.n} className={"fila" + (m?.p ? " on" : "") + (m?.p && m.via === "qr" ? " qr" : "")}
                      onClick={() => marcar(p.n, posta.id, "resp")}>
                      <span className="num">{p.n}</span>
                      <span className="nom">
                        {p.apellido}, {p.nombre}
                        {m?.p && <small>{m.via === "qr" ? "marcó con el código" : "lo marcó la posta"}</small>}
                      </span>
                      <span className="mar">{m?.p ? "✓" : ""}</span>
                    </button>
                  );
                })}
              </>
            )}
          </div>
        </>
      )}

      {vista === "donde" && (
        <div className="cpo" style={{ paddingTop: 18 }}>
          {avisos.some((a) => !a.ok) && (
            <>
              <div className="h" style={{ color: "var(--alerta)" }}>Pidieron ayuda</div>
              {avisos.filter((a) => !a.ok).map((a) => {
                const p = padron.find((x) => x.n === a.n);
                return (
                  <div key={a.id} className="avi">
                    <span className="nom">
                      {a.n} {p ? `${p.apellido}, ${p.nombre}` : ""}
                      <small>
                        {a.tipo === "ayuda" ? "necesita ayuda" : "no puede seguir"}
                        {a.desde ? ` · pasó por ${a.desde}` : " · sin registro de postas"}
                        {" · "}{new Date(a.t).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })}
                      </small>
                    </span>
                    {p?.tel && <a className="pill" href={`tel:${p.tel}`}>Llamar</a>}
                    <button className="pill" onClick={() => resolver(a.id)}>Listo</button>
                  </div>
                );
              })}
            </>
          )}
          <div className="h">Última posta por la que pasó cada uno</div>
          {padron.length === 0 && <div className="vac">Cargá el padrón para ver esto.</div>}
          {grupos.map((g) => (
            <div key={g.posta.id} className={"grp" + (frente - g.i >= 2 ? " atras" : "")}>
              <h4>{g.posta.nombre} <em>{g.gente.length}</em>
                {frente - g.i >= 2 && <em>quedaron atrás</em>}</h4>
              <div className="gente">
                {g.gente.map((p) => <span key={p.n} className="per">{p.n} {p.apellido}</span>)}
              </div>
            </div>
          ))}
          {sinRegistro.length > 0 && (
            <div className="grp atras">
              <h4>Sin ningún registro <em>{sinRegistro.length}</em></h4>
              <div className="gente">
                {sinRegistro.map((p) => <span key={p.n} className="per">{p.n} {p.apellido}</span>)}
              </div>
            </div>
          )}
          <div className="h">Cuántos pasaron por cada posta</div>
          <div className="caja">
            {postas.map((p) => {
              const c = cuenta(marcas[p.id]);
              const pct = padron.length ? Math.round((c / padron.length) * 100) : 0;
              return (
                <div key={p.id} className="res">
                  <span className="nm">{p.nombre}</span>
                  <span className="bar"><i style={{ width: pct + "%" }} /></span>
                  <span className="ct">{c}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {vista === "cartel" && (
        <div className="cpo" style={{ paddingTop: 18 }}>
          <p className="aviso">
            Este es el cartel de <b>{posta?.nombre}</b>. Imprimilo grande y colgalo en la posta.
            El que tenga señal escanea el QR; el que no, escribe el número en la app.
          </p>
          <div className="cartel">
            <div className="pn">POSTA {idx + 1}</div>
            <div className="pnom">{posta?.nombre}</div>
            {!qrRoto && (
              <img alt={`QR de la posta ${posta?.nombre}`} onError={() => setQrRoto(true)}
                src={urlQR(link ? `${link}${link.includes("?") ? "&" : "?"}c=${posta?.codigo}` : `Posta ${posta?.nombre} - codigo ${posta?.codigo}`)} />
            )}
            <div className="cod">{posta?.codigo}</div>
            <div className="ay">Escaneá el QR o cargá este número en la app</div>
          </div>
          <button className="btn sec" style={{ marginTop: 14 }}
            onClick={() => { try { window.print(); } catch { /* sacale una captura */ } }}>
            Imprimir
          </button>
          <div className="h">Todos los códigos</div>
          <div className="caja">
            {postas.map((p, i) => (
              <div key={p.id} className="res">
                <span className="nm">{i + 1}. {p.nombre}</span>
                <span className="ct">{p.codigo}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {vista === "datos" && (
        <div className="cpo" style={{ paddingTop: 18 }}>
          <div className="h">Padrón ({padron.length} peregrinos)</div>
          <div className="caja">
            <p className="aviso">
              Copiá de la planilla las columnas número, apellido y nombre. Si querés, sumá
              una cuarta con el micro y una quinta con el celular.
            </p>
            <textarea className="area" value={pegado} placeholder="1,ROMERO,JUAN,2,1100000001"
              onChange={(e) => setPegado(e.target.value)} />
            <button className="btn" style={{ marginTop: 10 }} onClick={() => importar(pegado)}>Cargar padrón</button>
            <button className="btn sec" onClick={() => importar(EJEMPLO)}>Probar con datos de ejemplo</button>
            {aviso && <p className="aviso" style={{ marginTop: 10, color: aviso.mal ? "var(--alerta)" : "var(--ok)" }}>{aviso.txt}</p>}
          </div>

          <div className="h">Postas y códigos</div>
          <div className="caja">
            {postas.map((p, i) => (
              <div key={p.id} className="res">
                <input className="nm" style={{ background: "none", border: "none", width: "100%" }}
                  value={p.nombre}
                  onChange={(e) => setPostas(postas.map((x, j) => j === i ? { ...x, nombre: e.target.value } : x))}
                  onBlur={() => guardarCfg()} />
                <input style={{ width: 62, background: "var(--noche)", border: "none", borderRadius: 7, padding: "5px 7px", textAlign: "center", fontSize: 13 }}
                  value={p.codigo} maxLength={4}
                  onChange={(e) => setPostas(postas.map((x, j) => j === i ? { ...x, codigo: e.target.value.replace(/\D/g, "") } : x))}
                  onBlur={() => guardarCfg()} />
                <button className="pill" onClick={() => {
                  const ps = postas.filter((_, j) => j !== i);
                  setPostas(ps); setIdx(0); guardarCfg({ postas: ps, idx: 0 });
                }}>Quitar</button>
              </div>
            ))}
            <button className="btn sec" style={{ marginTop: 12 }} onClick={() => {
              const ps = [...postas, { id: "po" + Date.now(), nombre: "Posta nueva", codigo: String(1000 + Math.floor(Math.random() * 8999)) }];
              setPostas(ps); guardarCfg({ postas: ps });
            }}>Agregar posta</button>
          </div>

          <div className="h">Link de la app</div>
          <div className="caja">
            <p className="aviso">Cuando publiques la app, pegá acá su dirección y los QR van a llevar directo al marcado.</p>
            <input className="busc" placeholder="https://…" value={link}
              onChange={(e) => setLink(e.target.value)}
              onBlur={() => { setQrRoto(false); guardarCfg(); }} />
          </div>

          <div className="h">Para volver a la planilla</div>
          <textarea className="area" readOnly value={
            ["numero,apellido,nombre," + postas.map((p) => p.nombre.replace(/,/g, "")).join(",")]
              .concat(padron.map((p) => [p.n, p.apellido, p.nombre]
                .concat(postas.map((po) => marcas[po.id]?.[String(p.n)]?.p ? "1" : "")).join(",")))
              .join("\n")
          } />

          <button className="btn sec" style={{ marginTop: 14 }} onClick={() => setRol("peregrino")}>
            Usar este celular como peregrino
          </button>
        </div>
      )}

      <nav className="tabs">
        {[["marcar", "◉", "Marcar"], ["donde", "⌖", "Dónde están"],
          ["cartel", "▣", "Cartel"], ["datos", "⚙", "Datos"]].map(([k, ic, t]) => (
          <button key={k} className={"tab" + (vista === k ? " act" : "")} onClick={() => { setVista(k); setAviso(null); }}>
            {k === "donde" && avisos.some((a) => !a.ok) && <span className="dot" />}
            <i>{ic}</i>{t}
          </button>
        ))}
      </nav>
    </div>
  );
}
