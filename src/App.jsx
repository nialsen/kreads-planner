import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "./lib/supabase";

/* ── Helpers ── */
function getMonday(d = new Date()) {
  const dt = new Date(d);
  const day = dt.getDay();
  const diff = dt.getDate() - day + (day === 0 ? -6 : 1);
  dt.setDate(diff);
  dt.setHours(0, 0, 0, 0);
  return dt.toISOString().split("T")[0];
}

function shiftWeek(weekStr, delta) {
  const d = new Date(weekStr);
  d.setDate(d.getDate() + delta * 7);
  return d.toISOString().split("T")[0];
}

function formatWeek(weekStr) {
  const d = new Date(weekStr);
  const end = new Date(d);
  end.setDate(end.getDate() + 4);
  const fmt = (dt) => dt.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
  return `${fmt(d)} — ${fmt(end)}`;
}

/* ── DA Tokens ── */
const C = {
  bg: "#FCFBF8", card: "#FFFFFF", accent: "#00D2C1", accentDark: "#00B5A6",
  black: "#111111", text: "#111111", textMuted: "#777777", textLight: "#999999",
  border: "#E0DDDA", danger: "#D94F4F", warning: "#E8A135", purple: "#8B5CF6", blue: "#3B82F6",
};
const LEVELS = { senior: "Senior", confirmed: "Confirmé", junior: "Junior" };
const LEVEL_CLR = {
  senior: { text: "#E8A135", bg: "#FDF6E8" },
  confirmed: { text: "#00B5A6", bg: "#E6FAF8" },
  junior: { text: "#777777", bg: "#F0F0EE" },
};
const PACK_LABELS = ["", "Pack 1", "Pack 2", "Pack 3"];
const DAY_LABELS = ["", "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi"];

/* ── Scoring ── */
function priorityScore(d) {
  let s = 0;
  s += ({ 1: 2, 2: 5, 3: 10 }[d.pack] || 2);
  if (d.at_risk) s += 12;
  if (d.behind_schedule) s += 8;
  if (d.quality_required) s += 3;
  if (d.has_deadline && d.deadline_date) {
    const days = Math.ceil((new Date(d.deadline_date) - new Date()) / 864e5);
    if (days <= 3) s += 15; else if (days <= 7) s += 10; else if (days <= 14) s += 5; else s += 2;
  } else if (d.has_deadline) s += 5;
  return s;
}

/* ── Assignment Algorithm ── */
function computePlanning(demands, editors, affinityMap) {
  const scored = demands
    .filter(d => d.concepts_requested > 0)
    .map(d => ({ ...d, score: priorityScore(d), remaining: d.concepts_requested }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return (a.rush_day || 0) - (b.rush_day || 0);
    });

  const pool = editors
    .filter(e => e.days_available > 0)
    .map(e => ({ ...e, capacity: e.days_available * 5, used: 0 }));

  const lvl = { senior: 3, confirmed: 2, junior: 1 };
  const assignments = [];
  const overflow = [];

  for (const client of scored) {
    let rem = client.remaining;
    const needQ = client.quality_required;
    const affs = affinityMap[client.client_id] || [];

    const tryAssign = (list) => {
      for (const ed of list) {
        if (rem <= 0) break;
        const can = Math.min(rem, ed.capacity - ed.used);
        if (can > 0) {
          assignments.push({
            client_id: client.client_id, client_name: client.client_name, score: client.score,
            editor_id: ed.id, editor_name: ed.name, editor_level: ed.level, concepts: can,
            has_affinity: affs.includes(ed.id), rush_day: client.rush_day,
            at_risk: client.at_risk, has_deadline: client.has_deadline,
            quality_required: client.quality_required, behind_schedule: client.behind_schedule,
          });
          ed.used += can;
          rem -= can;
        }
      }
    };

    // Affinity editors first
    tryAssign(pool.filter(e => affs.includes(e.id) && e.capacity - e.used > 0 && (!needQ || e.level !== "junior")).sort((a, b) => lvl[b.level] - lvl[a.level]));
    // Then others
    if (rem > 0) tryAssign(pool.filter(e => !affs.includes(e.id) && e.capacity - e.used > 0 && (!needQ || e.level !== "junior")).sort((a, b) => lvl[b.level] - lvl[a.level]));

    if (rem > 0) overflow.push({ client_id: client.client_id, client_name: client.client_name, score: client.score, remaining: rem, at_risk: client.at_risk, has_deadline: client.has_deadline });
  }

  return { assignments, overflow, pool };
}

/* ══════════════════ MAIN APP ══════════════════ */
export default function App() {
  const [editors, setEditors] = useState([]);
  const [clients, setClients] = useState([]);
  const [affinities, setAffinities] = useState([]);
  const [weekEditors, setWeekEditors] = useState([]);
  const [weekClients, setWeekClients] = useState([]);
  const [weekStart, setWeekStart] = useState(getMonday());
  const [tab, setTab] = useState("ref");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // ── Load ref data ──
  const loadRef = useCallback(async () => {
    const [{ data: ed }, { data: cl }, { data: af }] = await Promise.all([
      supabase.from("editors").select("*").order("created_at"),
      supabase.from("clients").select("*").order("created_at"),
      supabase.from("affinities").select("*"),
    ]);
    setEditors(ed || []);
    setClients(cl || []);
    setAffinities(af || []);
  }, []);

  // ── Load week data ──
  const loadWeek = useCallback(async (ws) => {
    const [{ data: we }, { data: wc }] = await Promise.all([
      supabase.from("weekly_editor_availability").select("*").eq("week_start", ws),
      supabase.from("weekly_client_demands").select("*").eq("week_start", ws),
    ]);
    setWeekEditors(we || []);
    setWeekClients(wc || []);
  }, []);

  useEffect(() => {
    (async () => {
      await loadRef();
      await loadWeek(weekStart);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    if (!loading) loadWeek(weekStart);
  }, [weekStart]);

  // ── Realtime subscriptions ──
  useEffect(() => {
    const channels = [
      supabase.channel("editors").on("postgres_changes", { event: "*", schema: "public", table: "editors" }, () => loadRef()).subscribe(),
      supabase.channel("clients").on("postgres_changes", { event: "*", schema: "public", table: "clients" }, () => loadRef()).subscribe(),
      supabase.channel("affinities").on("postgres_changes", { event: "*", schema: "public", table: "affinities" }, () => loadRef()).subscribe(),
      supabase.channel("week_ed").on("postgres_changes", { event: "*", schema: "public", table: "weekly_editor_availability" }, () => loadWeek(weekStart)).subscribe(),
      supabase.channel("week_cl").on("postgres_changes", { event: "*", schema: "public", table: "weekly_client_demands" }, () => loadWeek(weekStart)).subscribe(),
    ];
    return () => channels.forEach(c => supabase.removeChannel(c));
  }, [weekStart, loadRef, loadWeek]);

  // ── Affinity map for algo ──
  const affinityMap = useMemo(() => {
    const m = {};
    affinities.forEach(a => {
      if (!m[a.client_id]) m[a.client_id] = [];
      m[a.client_id].push(a.editor_id);
    });
    return m;
  }, [affinities]);

  // ── Build planning data ──
  const planning = useMemo(() => {
    const demands = clients.map(c => {
      const w = weekClients.find(wc => wc.client_id === c.id) || {};
      return { client_id: c.id, client_name: c.name, pack: c.pack, concepts_requested: w.concepts_requested || 0, at_risk: w.at_risk || false, quality_required: w.quality_required || false, behind_schedule: w.behind_schedule || false, has_deadline: w.has_deadline || false, deadline_date: w.deadline_date || "", rush_day: w.rush_day || 0 };
    });
    const eds = editors.map(e => {
      const w = weekEditors.find(we => we.editor_id === e.id);
      return { id: e.id, name: e.name, level: e.level, is_freelance: e.is_freelance, days_available: w ? w.days_available : 5 };
    });
    return computePlanning(demands, eds, affinityMap);
  }, [clients, editors, weekClients, weekEditors, affinityMap]);

  const totalCap = useMemo(() => editors.reduce((s, e) => {
    const w = weekEditors.find(we => we.editor_id === e.id);
    return s + ((w ? w.days_available : 5) * 5);
  }, 0), [editors, weekEditors]);

  const totalDem = useMemo(() => weekClients.reduce((s, wc) => s + (wc.concepts_requested || 0), 0), [weekClients]);
  const capRatio = totalCap > 0 ? Math.min(totalDem / totalCap, 1) : 0;

  // ── CRUD helpers ──
  const flash = () => { setSaving(true); setTimeout(() => setSaving(false), 600); };

  const addEditor = async () => {
    const { data } = await supabase.from("editors").insert({ name: "", level: "confirmed", is_freelance: false }).select().single();
    if (data) setEditors(p => [...p, data]);
    flash();
  };

  const updateEditor = async (id, field, value) => {
    await supabase.from("editors").update({ [field]: value }).eq("id", id);
    setEditors(p => p.map(e => e.id === id ? { ...e, [field]: value } : e));
    flash();
  };

  const deleteEditor = async (id) => {
    await supabase.from("editors").delete().eq("id", id);
    setEditors(p => p.filter(e => e.id !== id));
    flash();
  };

  const addClient = async () => {
    const { data } = await supabase.from("clients").insert({ name: "", pack: 1, strategist: "" }).select().single();
    if (data) setClients(p => [...p, data]);
    flash();
  };

  const updateClient = async (id, field, value) => {
    await supabase.from("clients").update({ [field]: value }).eq("id", id);
    setClients(p => p.map(c => c.id === id ? { ...c, [field]: value } : c));
    flash();
  };

  const deleteClient = async (id) => {
    await supabase.from("clients").delete().eq("id", id);
    setClients(p => p.filter(c => c.id !== id));
    flash();
  };

  const toggleAffinity = async (clientId, editorId) => {
    const exists = affinities.find(a => a.client_id === clientId && a.editor_id === editorId);
    if (exists) {
      await supabase.from("affinities").delete().eq("id", exists.id);
      setAffinities(p => p.filter(a => a.id !== exists.id));
    } else {
      const { data } = await supabase.from("affinities").insert({ client_id: clientId, editor_id: editorId }).select().single();
      if (data) setAffinities(p => [...p, data]);
    }
    flash();
  };

  const updateWeekEditor = async (editorId, daysAvailable) => {
    const existing = weekEditors.find(w => w.editor_id === editorId);
    if (existing) {
      await supabase.from("weekly_editor_availability").update({ days_available: daysAvailable }).eq("id", existing.id);
      setWeekEditors(p => p.map(w => w.id === existing.id ? { ...w, days_available: daysAvailable } : w));
    } else {
      const { data } = await supabase.from("weekly_editor_availability").insert({ week_start: weekStart, editor_id: editorId, days_available: daysAvailable }).select().single();
      if (data) setWeekEditors(p => [...p, data]);
    }
    flash();
  };

  const updateWeekClient = async (clientId, field, value) => {
    const existing = weekClients.find(w => w.client_id === clientId);
    if (existing) {
      await supabase.from("weekly_client_demands").update({ [field]: value }).eq("id", existing.id);
      setWeekClients(p => p.map(w => w.id === existing.id ? { ...w, [field]: value } : w));
    } else {
      const row = { week_start: weekStart, client_id: clientId, concepts_requested: 0, at_risk: false, quality_required: false, behind_schedule: false, has_deadline: false, deadline_date: null, rush_day: 0, [field]: value };
      const { data } = await supabase.from("weekly_client_demands").insert(row).select().single();
      if (data) setWeekClients(p => [...p, data]);
    }
    flash();
  };

  if (loading) return <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "100vh", background: C.bg, fontFamily: "'Inter',sans-serif" }}>Chargement...</div>;

  return (
    <div style={S.root}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        input,select,button{font-family:'Inter',sans-serif}
        input:focus,select:focus{outline:none;border-color:${C.accent}!important}
        input[type=number]::-webkit-inner-spin-button,input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}
        input[type=number]{-moz-appearance:textfield}
        ::selection{background:${C.accent}33}
      `}</style>

      {/* ── Header ── */}
      <div style={S.header}>
        <div style={S.headerLeft}>
          <span style={{ color: C.black, fontFamily: "'Bebas Neue',sans-serif", fontSize: 26 }}>KREA</span>
          <span style={{ color: C.accent, fontFamily: "'Bebas Neue',sans-serif", fontSize: 26 }}>ADS</span>
          <div style={{ width: 1, height: 28, background: C.border, margin: "0 12px" }} />
          <div>
            <h1 style={S.title}>PRODUCTION PLANNER</h1>
            <p style={S.subtitle}>Répartition & priorisation des concepts {saving && <span style={{ color: C.accent, marginLeft: 8 }}>✓ Sauvegardé</span>}</p>
          </div>
        </div>
        <div style={S.headerRight}>
          <MiniStat label="Capacité" value={totalCap} unit="concepts" color={C.text} />
          <MiniStat label="Demande" value={totalDem} unit="concepts" color={totalDem > totalCap ? C.danger : C.accent} />
          <div style={S.statBox}>
            <span style={S.statLabel}>Charge</span>
            <div style={S.miniBar}><div style={{ height: "100%", borderRadius: 3, width: `${capRatio * 100}%`, background: capRatio > .9 ? C.danger : capRatio > .7 ? C.warning : C.accent, transition: "width .4s" }} /></div>
            <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono',monospace", fontWeight: 600, color: C.textMuted }}>{Math.round(capRatio * 100)}%</span>
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={S.tabBar}>
        {[
          { key: "ref", label: "Référentiel" },
          { key: "affinities", label: "Affinités" },
          { key: "week", label: "Semaine" },
          { key: "planning", label: "Planning" },
        ].map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{ ...S.tab, ...(tab === t.key ? S.tabActive : {}) }}>{t.label}</button>
        ))}
        <div style={{ flex: 1 }} />
        {(tab === "week" || tab === "planning") && (
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <button onClick={() => setWeekStart(s => shiftWeek(s, -1))} style={S.weekBtn}>←</button>
            <span style={{ fontSize: 12, fontWeight: 600, color: C.text, minWidth: 140, textAlign: "center" }}>{formatWeek(weekStart)}</span>
            <button onClick={() => setWeekStart(s => shiftWeek(s, 1))} style={S.weekBtn}>→</button>
            <button onClick={() => setWeekStart(getMonday())} style={{ ...S.weekBtn, fontSize: 10, padding: "4px 8px" }}>Auj.</button>
          </div>
        )}
      </div>

      {/* ── Content ── */}
      <div style={S.content}>
        {tab === "ref" && <RefTab editors={editors} clients={clients} addEditor={addEditor} updateEditor={updateEditor} deleteEditor={deleteEditor} addClient={addClient} updateClient={updateClient} deleteClient={deleteClient} />}
        {tab === "affinities" && <AffinitiesTab editors={editors} clients={clients} affinities={affinities} toggleAffinity={toggleAffinity} />}
        {tab === "week" && <WeekTab editors={editors} clients={clients} weekEditors={weekEditors} weekClients={weekClients} updateWeekEditor={updateWeekEditor} updateWeekClient={updateWeekClient} />}
        {tab === "planning" && <PlanningTab planning={planning} totalCap={totalCap} totalDem={totalDem} />}
      </div>
    </div>
  );
}

function MiniStat({ label, value, unit, color }) {
  return (
    <div style={S.statBox}>
      <span style={S.statLabel}>{label}</span>
      <span style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 22, fontWeight: 700, color, lineHeight: 1 }}>{value}</span>
      <span style={{ fontSize: 10, color: C.textLight }}>{unit}</span>
    </div>
  );
}

/* ══════════════════ RÉFÉRENTIEL ══════════════════ */
function RefTab({ editors, clients, addEditor, updateEditor, deleteEditor, addClient, updateClient, deleteClient }) {
  const [editTimers, setEditTimers] = useState({});

  const debounceUpdate = (fn, id, field, value, delay = 500) => {
    const key = `${id}-${field}`;
    if (editTimers[key]) clearTimeout(editTimers[key]);
    const timer = setTimeout(() => fn(id, field, value), delay);
    setEditTimers(p => ({ ...p, [key]: timer }));
  };

  // Local state for immediate input feedback
  const [localEditors, setLocalEditors] = useState(editors);
  const [localClients, setLocalClients] = useState(clients);
  useEffect(() => setLocalEditors(editors), [editors]);
  useEffect(() => setLocalClients(clients), [clients]);

  return (
    <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
      {/* Clients */}
      <div style={{ flex: 1, minWidth: 340 }}>
        <div style={S.sectionHeader}>
          <h2 style={S.sectionTitle}>CLIENTS</h2>
          <button onClick={addClient} style={S.addBtn}>+ Client</button>
        </div>
        <div style={S.tableHeader}>
          <span style={{ ...S.th, flex: 2 }}>Nom</span>
          <span style={{ ...S.th, flex: 1 }}>Pack</span>
          <span style={{ ...S.th, flex: 1.5 }}>Creative Strategist</span>
          <span style={{ ...S.th, flex: 0.3 }}></span>
        </div>
        {localClients.map(c => (
          <div key={c.id} style={S.row}>
            <div style={{ flex: 2 }}>
              <input style={S.input} placeholder="Nom du client" value={c.name} onChange={e => {
                const v = e.target.value;
                setLocalClients(p => p.map(x => x.id === c.id ? { ...x, name: v } : x));
                debounceUpdate(updateClient, c.id, "name", v);
              }} />
            </div>
            <div style={{ flex: 1, display: "flex", gap: 3 }}>
              {[1, 2, 3].map(s => (
                <button key={s} onClick={() => updateClient(c.id, "pack", s)} style={{ ...S.sizeBtnSm, ...(c.pack === s ? { background: C.black, color: "#fff", borderColor: C.black } : {}) }}>P{s}</button>
              ))}
            </div>
            <div style={{ flex: 1.5 }}>
              <input style={S.input} placeholder="CS attitré" value={c.strategist} onChange={e => {
                const v = e.target.value;
                setLocalClients(p => p.map(x => x.id === c.id ? { ...x, strategist: v } : x));
                debounceUpdate(updateClient, c.id, "strategist", v);
              }} />
            </div>
            <div style={{ flex: 0.3, display: "flex", justifyContent: "center" }}>
              <button onClick={() => deleteClient(c.id)} style={S.delBtn}>×</button>
            </div>
          </div>
        ))}
        {clients.length === 0 && <p style={S.empty}>Ajoute tes clients pour commencer.</p>}
      </div>

      {/* Editors */}
      <div style={{ flex: 1, minWidth: 340 }}>
        <div style={S.sectionHeader}>
          <h2 style={S.sectionTitle}>ÉQUIPE</h2>
          <button onClick={addEditor} style={S.addBtn}>+ Monteur</button>
        </div>
        <div style={S.tableHeader}>
          <span style={{ ...S.th, flex: 2 }}>Nom</span>
          <span style={{ ...S.th, flex: 1 }}>Niveau</span>
          <span style={{ ...S.th, flex: 0.7, textAlign: "center" }}>Freelance</span>
          <span style={{ ...S.th, flex: 0.3 }}></span>
        </div>
        {localEditors.map(e => (
          <div key={e.id} style={S.row}>
            <div style={{ flex: 2 }}>
              <input style={S.input} placeholder="Nom" value={e.name} onChange={ev => {
                const v = ev.target.value;
                setLocalEditors(p => p.map(x => x.id === e.id ? { ...x, name: v } : x));
                debounceUpdate(updateEditor, e.id, "name", v);
              }} />
            </div>
            <div style={{ flex: 1 }}>
              <select style={S.select} value={e.level} onChange={ev => updateEditor(e.id, "level", ev.target.value)}>
                <option value="senior">Senior</option>
                <option value="confirmed">Confirmé</option>
                <option value="junior">Junior</option>
              </select>
            </div>
            <div style={{ flex: 0.7, display: "flex", justifyContent: "center" }}>
              <button onClick={() => updateEditor(e.id, "is_freelance", !e.is_freelance)} style={{ ...S.toggleBtn, background: e.is_freelance ? C.accent + "15" : "transparent", borderColor: e.is_freelance ? C.accent : C.border, color: e.is_freelance ? C.accentDark : C.textLight }}>{e.is_freelance ? "Oui" : "Non"}</button>
            </div>
            <div style={{ flex: 0.3, display: "flex", justifyContent: "center" }}>
              <button onClick={() => deleteEditor(e.id)} style={S.delBtn}>×</button>
            </div>
          </div>
        ))}
        {editors.length === 0 && <p style={S.empty}>Ajoute tes monteurs pour commencer.</p>}
      </div>
    </div>
  );
}

/* ══════════════════ AFFINITÉS ══════════════════ */
function AffinitiesTab({ editors, clients, affinities, toggleAffinity }) {
  const active = editors.filter(e => e.name.trim());
  const activeCl = clients.filter(c => c.name.trim());

  if (!activeCl.length || !active.length) {
    return <div><h2 style={S.sectionTitle}>AFFINITÉS MONTEUR × CLIENT</h2><p style={{ ...S.empty, marginTop: 40 }}>Ajoute au moins un client et un monteur dans le Référentiel.</p></div>;
  }

  return (
    <div>
      <div style={S.sectionHeader}>
        <div>
          <h2 style={S.sectionTitle}>AFFINITÉS MONTEUR × CLIENT</h2>
          <p style={S.sectionDesc}>Coche les monteurs habitués à chaque client. Contrainte forte : ils seront assignés en priorité.</p>
        </div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr>
              <th style={{ ...S.matrixTh, textAlign: "left", minWidth: 160 }}>Client</th>
              {active.map(e => (
                <th key={e.id} style={S.matrixTh}>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                    <span style={{ fontSize: 12, fontWeight: 600 }}>{e.name}</span>
                    <span style={{ fontSize: 9, color: LEVEL_CLR[e.level].text, background: LEVEL_CLR[e.level].bg, padding: "1px 6px", borderRadius: 2, fontWeight: 700, textTransform: "uppercase" }}>{LEVELS[e.level]}</span>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {activeCl.map(c => (
              <tr key={c.id}>
                <td style={S.matrixTd}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{c.name}</span>
                  <span style={{ fontSize: 10, color: C.textLight, marginLeft: 6 }}>{PACK_LABELS[c.pack]}</span>
                </td>
                {active.map(e => {
                  const on = affinities.some(a => a.client_id === c.id && a.editor_id === e.id);
                  return (
                    <td key={e.id} style={{ ...S.matrixTd, textAlign: "center" }}>
                      <button onClick={() => toggleAffinity(c.id, e.id)} style={{
                        width: 32, height: 32, borderRadius: 2, border: `2px solid ${on ? C.accent : C.border}`,
                        background: on ? C.accent : "transparent", cursor: "pointer", display: "inline-flex",
                        alignItems: "center", justifyContent: "center", color: on ? "#fff" : C.border,
                        fontSize: 16, fontWeight: 700, boxShadow: on ? `2px 2px 0px ${C.black}` : "none", transition: "all .15s",
                      }}>{on ? "✓" : ""}</button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ══════════════════ SEMAINE ══════════════════ */
function WeekTab({ editors, clients, weekEditors, weekClients, updateWeekEditor, updateWeekClient }) {
  const activeEd = editors.filter(e => e.name.trim());
  const activeCl = clients.filter(c => c.name.trim());

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
      {/* Dispos */}
      <div>
        <div style={S.sectionHeader}>
          <div>
            <h2 style={S.sectionTitle}>DISPONIBILITÉS ÉQUIPE</h2>
            <p style={S.sectionDesc}>Jours dispo cette semaine. Capacité = jours × 5 concepts.</p>
          </div>
        </div>
        {!activeEd.length && <p style={S.empty}>Aucun monteur dans le référentiel.</p>}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
          {activeEd.map(e => {
            const w = weekEditors.find(we => we.editor_id === e.id);
            const days = w ? w.days_available : 5;
            return (
              <div key={e.id} style={S.dispoCard}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <span style={{ fontWeight: 600, fontSize: 13 }}>{e.name}</span>
                  <span style={{ fontSize: 9, color: LEVEL_CLR[e.level].text, background: LEVEL_CLR[e.level].bg, padding: "1px 6px", borderRadius: 2, fontWeight: 700, textTransform: "uppercase" }}>{LEVELS[e.level]}</span>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input style={{ ...S.inputSm, width: 50, textAlign: "center", fontSize: 15, fontWeight: 700 }} type="number" min="0" max="7" value={days} onChange={ev => updateWeekEditor(e.id, Math.max(0, parseInt(ev.target.value) || 0))} />
                  <span style={{ fontSize: 11, color: C.textLight }}>jours</span>
                  <span style={{ marginLeft: "auto", fontFamily: "'JetBrains Mono',monospace", fontSize: 14, fontWeight: 700, color: C.accent }}>{days * 5}c</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Demands */}
      <div>
        <div style={S.sectionHeader}>
          <div>
            <h2 style={S.sectionTitle}>DEMANDES CLIENTS</h2>
            <p style={S.sectionDesc}>À remplir pendant le call d'anticipation avec le Creative Strategist.</p>
          </div>
        </div>
        {!activeCl.length && <p style={S.empty}>Aucun client dans le référentiel.</p>}
        {activeCl.map(c => {
          const w = weekClients.find(wc => wc.client_id === c.id) || {};
          const score = priorityScore({ ...w, pack: c.pack });
          return (
            <div key={c.id} style={S.clientCard}>
              <div style={S.clientCardHeader}>
                <div style={S.scoreBox}>
                  <span style={S.scoreNum}>{score}</span>
                  <span style={S.scorePts}>PTS</span>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, color: C.black }}>{c.name}</div>
                  <div style={{ fontSize: 11, color: C.textMuted }}>{c.strategist && `CS : ${c.strategist}`} · {PACK_LABELS[c.pack]}</div>
                </div>
              </div>
              <div style={S.clientCardBody}>
                <div style={S.fieldGrp}>
                  <label style={S.label}>Concepts</label>
                  <input style={{ ...S.inputSm, width: 65, textAlign: "center", fontSize: 15, fontWeight: 700 }} type="number" min="0" value={w.concepts_requested || 0} onChange={e => updateWeekClient(c.id, "concepts_requested", Math.max(0, parseInt(e.target.value) || 0))} />
                </div>
                <div style={S.fieldGrp}>
                  <label style={S.label}>Arrivée rushs</label>
                  <select style={{ ...S.select, width: 130 }} value={w.rush_day || 0} onChange={e => updateWeekClient(c.id, "rush_day", parseInt(e.target.value))}>
                    <option value={0}>—</option>
                    {[1, 2, 3, 4, 5].map(d => <option key={d} value={d}>{DAY_LABELS[d]}</option>)}
                  </select>
                </div>
                <div style={S.flagsRow}>
                  {[
                    { key: "at_risk", label: "Insatisfaction", color: C.danger, icon: "⚠" },
                    { key: "quality_required", label: "Qualité exigée", color: C.warning, icon: "★" },
                    { key: "behind_schedule", label: "En retard", color: C.purple, icon: "⏱" },
                    { key: "has_deadline", label: "Deadline imposée", color: C.blue, icon: "📅" },
                  ].map(f => (
                    <button key={f.key} onClick={() => updateWeekClient(c.id, f.key, !w[f.key])} style={{
                      ...S.flagBtn, borderColor: w[f.key] ? f.color : C.border,
                      background: w[f.key] ? f.color + "12" : "transparent",
                      color: w[f.key] ? f.color : C.textLight,
                      boxShadow: w[f.key] ? `2px 2px 0px ${f.color}44` : "none",
                    }}>
                      <span style={{ marginRight: 4 }}>{f.icon}</span>{f.label}
                    </button>
                  ))}
                </div>
                {w.has_deadline && (
                  <div style={S.fieldGrp}>
                    <label style={S.label}>Date limite</label>
                    <input type="date" style={{ ...S.input, width: 160 }} value={w.deadline_date || ""} onChange={e => updateWeekClient(c.id, "deadline_date", e.target.value)} />
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ══════════════════ PLANNING ══════════════════ */
function PlanningTab({ planning, totalCap, totalDem }) {
  const { assignments, overflow, pool } = planning;

  const grouped = {};
  assignments.forEach(a => {
    if (!grouped[a.client_name]) grouped[a.client_name] = { score: a.score, editors: [], total: 0, flags: a };
    grouped[a.client_name].editors.push(a);
    grouped[a.client_name].total += a.concepts;
  });
  const sorted = Object.entries(grouped).sort((a, b) => b[1].score - a[1].score);

  return (
    <div>
      <div style={S.sectionHeader}>
        <div>
          <h2 style={S.sectionTitle}>PLANNING DE LA SEMAINE</h2>
          <p style={S.sectionDesc}>Répartition automatique. Monteurs avec affinité assignés en priorité. Rushs tardifs séquencés en fin de semaine.</p>
        </div>
      </div>

      {totalDem > totalCap && (
        <div style={S.alertBox}>
          <span style={{ fontSize: 18 }}>⚠</span>
          <div><strong>Surcharge</strong> — {totalDem} concepts demandés vs {totalCap} de capacité. {totalDem - totalCap} concepts reportés.</div>
        </div>
      )}

      {!sorted.length && !overflow.length && <p style={S.empty}>Remplis l'onglet Semaine pour voir le planning.</p>}

      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {sorted.map(([name, data], idx) => (
          <div key={name} style={S.planCard}>
            <div style={S.planLeft}>
              <div style={S.rankBadge}>#{idx + 1}</div>
              <div>
                <div style={S.planClient}>
                  {name}
                  {data.flags.at_risk && <span style={{ ...S.miniFlag, background: C.danger + "15", color: C.danger }}>⚠ Insatisfaction</span>}
                  {data.flags.has_deadline && <span style={{ ...S.miniFlag, background: C.blue + "15", color: C.blue }}>📅 Deadline</span>}
                  {data.flags.quality_required && <span style={{ ...S.miniFlag, background: C.warning + "15", color: C.warning }}>★ Qualité</span>}
                  {data.flags.behind_schedule && <span style={{ ...S.miniFlag, background: C.purple + "15", color: C.purple }}>⏱ Retard</span>}
                </div>
                <div style={S.planMeta}>
                  Score : {data.score} · {data.total} concepts
                  {data.flags.rush_day > 0 && <span style={{ color: C.blue, marginLeft: 8 }}>Rushs : {DAY_LABELS[data.flags.rush_day]}</span>}
                </div>
              </div>
            </div>
            <div style={S.planEditors}>
              {data.editors.map((a, i) => (
                <div key={i} style={{ ...S.editorChip, borderColor: a.has_affinity ? C.accent : C.border }}>
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: LEVEL_CLR[a.editor_level].text, flexShrink: 0 }} />
                  <span style={{ fontWeight: 500 }}>{a.editor_name}</span>
                  {a.has_affinity && <span style={{ fontSize: 9, color: C.accent, fontWeight: 700 }}>AFF</span>}
                  <span style={S.chipCount}>{a.concepts}c</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {overflow.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h3 style={{ ...S.sectionTitle, fontSize: 14, color: C.danger }}>⏳ REPORTÉ</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
            {overflow.map(o => (
              <div key={o.client_id} style={S.overflowRow}>
                <span style={{ fontWeight: 600 }}>{o.client_name}</span>
                <span style={{ color: C.danger, fontFamily: "'JetBrains Mono',monospace", fontSize: 13, fontWeight: 600 }}>{o.remaining} concepts</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {pool.length > 0 && (
        <div style={{ marginTop: 32 }}>
          <h3 style={{ ...S.sectionTitle, fontSize: 14 }}>CHARGE PAR MONTEUR</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
            {pool.filter(e => e.name.trim()).map(e => {
              const pct = e.capacity > 0 ? e.used / e.capacity : 0;
              return (
                <div key={e.id} style={S.barRow}>
                  <span style={{ width: 120, fontWeight: 600, fontSize: 13 }}>{e.name}</span>
                  <span style={{ width: 70, fontSize: 9, color: LEVEL_CLR[e.level].text, background: LEVEL_CLR[e.level].bg, padding: "2px 6px", borderRadius: 2, fontWeight: 700, textTransform: "uppercase" }}>{LEVELS[e.level]}</span>
                  <div style={S.barTrack}><div style={{ height: "100%", width: `${pct * 100}%`, background: pct > .9 ? C.danger : pct > .7 ? C.warning : C.accent, transition: "width .4s" }} /></div>
                  <span style={{ width: 70, textAlign: "right", fontFamily: "'JetBrains Mono',monospace", fontSize: 12, fontWeight: 600, color: C.textMuted }}>{e.used}/{e.capacity}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ══════════════════ STYLES ══════════════════ */
const S = {
  root: { fontFamily: "'Inter',sans-serif", background: C.bg, color: C.text, minHeight: "100vh", padding: 28 },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28, flexWrap: "wrap", gap: 16 },
  headerLeft: { display: "flex", alignItems: "center" },
  title: { fontFamily: "'Bebas Neue',sans-serif", fontSize: 18, fontWeight: 400, color: C.black, margin: 0, letterSpacing: "0.08em" },
  subtitle: { fontSize: 12, color: C.textMuted, margin: 0, marginTop: 1 },
  headerRight: { display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" },
  statBox: { display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "10px 16px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 4, minWidth: 85 },
  statLabel: { fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", color: C.textLight, fontWeight: 600 },
  miniBar: { width: 60, height: 6, background: C.border, borderRadius: 3, overflow: "hidden", marginTop: 2 },

  tabBar: { display: "flex", gap: 0, borderBottom: `2px solid ${C.black}`, marginBottom: 28, alignItems: "center", flexWrap: "wrap", rowGap: 8 },
  tab: { padding: "10px 18px", background: "none", border: "1px solid transparent", borderBottom: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: -2, transition: "all .15s" },
  tabActive: { color: C.black, background: C.card, border: `2px solid ${C.black}`, borderBottom: `2px solid ${C.card}`, boxShadow: `3px -3px 0px ${C.accent}` },
  weekBtn: { padding: "4px 10px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 2, cursor: "pointer", fontSize: 13, fontWeight: 600, color: C.text },

  content: { maxWidth: 1060, margin: "0 auto" },
  sectionHeader: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16, gap: 16 },
  sectionTitle: { fontFamily: "'Bebas Neue',sans-serif", fontSize: 20, fontWeight: 400, color: C.black, marginBottom: 4, letterSpacing: "0.04em" },
  sectionDesc: { fontSize: 13, color: C.textMuted, lineHeight: 1.5 },
  addBtn: { padding: "8px 18px", background: C.black, border: `2px solid ${C.black}`, borderRadius: 2, color: "#fff", fontSize: 11, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", boxShadow: `3px 3px 0px ${C.accent}`, textTransform: "uppercase", letterSpacing: "0.04em" },

  tableHeader: { display: "flex", gap: 8, padding: "8px 12px", borderBottom: `2px solid ${C.black}`, alignItems: "center" },
  th: { fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", color: C.textMuted, fontWeight: 700 },
  row: { display: "flex", gap: 8, padding: "8px 12px", alignItems: "center", borderBottom: `1px solid ${C.border}` },

  input: { width: "100%", padding: "7px 9px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 2, color: C.text, fontSize: 13 },
  inputSm: { padding: "5px 7px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 2, color: C.text, fontSize: 13 },
  select: { padding: "7px 9px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 2, color: C.text, fontSize: 13, cursor: "pointer" },
  toggleBtn: { padding: "5px 12px", border: `1px solid ${C.border}`, borderRadius: 2, background: "transparent", fontSize: 11, cursor: "pointer", fontWeight: 600 },
  delBtn: { width: 26, height: 26, border: "none", background: "none", color: C.textLight, fontSize: 17, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
  sizeBtnSm: { width: 34, height: 28, border: `1px solid ${C.border}`, borderRadius: 2, background: "transparent", color: C.textMuted, fontSize: 10, fontWeight: 700, cursor: "pointer" },
  empty: { textAlign: "center", padding: "40px 20px", color: C.textLight, fontSize: 13 },

  matrixTh: { padding: "10px 8px", borderBottom: `2px solid ${C.black}`, fontSize: 11, fontWeight: 600, color: C.text, textAlign: "center", minWidth: 80 },
  matrixTd: { padding: "10px 8px", borderBottom: `1px solid ${C.border}`, fontSize: 13, color: C.text },

  dispoCard: { padding: "12px 14px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 2, minWidth: 200, flex: "1 1 200px" },
  fieldGrp: { display: "flex", flexDirection: "column", gap: 4 },
  label: { fontSize: 9, textTransform: "uppercase", letterSpacing: "0.1em", color: C.textMuted, fontWeight: 700 },

  clientCard: { background: C.card, border: `2px solid ${C.black}`, borderRadius: 2, marginBottom: 12, overflow: "hidden", boxShadow: `4px 4px 0px ${C.accent}` },
  clientCardHeader: { display: "flex", alignItems: "center", padding: "12px 16px", borderBottom: `1px solid ${C.border}`, gap: 12 },
  clientCardBody: { padding: "12px 16px", display: "flex", flexWrap: "wrap", gap: 14, alignItems: "flex-end" },
  scoreBox: { width: 46, height: 46, borderRadius: 2, border: `2px solid ${C.black}`, background: C.accent + "15", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  scoreNum: { fontSize: 18, fontFamily: "'Bebas Neue',sans-serif", color: C.black, lineHeight: 1 },
  scorePts: { fontSize: 7, color: C.textMuted, textTransform: "uppercase", letterSpacing: "0.12em", fontWeight: 700 },
  flagsRow: { display: "flex", gap: 5, flexWrap: "wrap" },
  flagBtn: { padding: "5px 10px", border: `1px solid ${C.border}`, borderRadius: 2, background: "transparent", fontSize: 11, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", whiteSpace: "nowrap", transition: "all .15s" },

  alertBox: { display: "flex", alignItems: "center", gap: 12, padding: "14px 18px", background: C.danger + "10", border: `2px solid ${C.danger}`, borderRadius: 2, marginBottom: 20, color: C.danger, fontSize: 13, boxShadow: `3px 3px 0px ${C.danger}33` },
  planCard: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 18px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 2, gap: 16, flexWrap: "wrap", borderLeft: `4px solid ${C.accent}` },
  planLeft: { display: "flex", alignItems: "center", gap: 14 },
  rankBadge: { fontFamily: "'Bebas Neue',sans-serif", fontSize: 16, color: "#fff", background: C.black, padding: "2px 10px", borderRadius: 2, whiteSpace: "nowrap" },
  planClient: { fontSize: 15, fontWeight: 700, color: C.black, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  planMeta: { fontSize: 12, color: C.textMuted, marginTop: 2, fontFamily: "'JetBrains Mono',monospace" },
  miniFlag: { fontSize: 10, padding: "2px 8px", borderRadius: 2, fontWeight: 600, whiteSpace: "nowrap" },
  planEditors: { display: "flex", gap: 6, flexWrap: "wrap" },
  editorChip: { display: "flex", alignItems: "center", gap: 5, padding: "5px 10px", background: C.bg, border: `1px solid ${C.border}`, borderRadius: 2, fontSize: 12, color: C.text },
  chipCount: { fontFamily: "'JetBrains Mono',monospace", fontWeight: 700, color: C.accentDark, fontSize: 11 },
  overflowRow: { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 16px", background: C.danger + "08", border: `1px solid ${C.danger}30`, borderRadius: 2, gap: 12 },
  barRow: { display: "flex", alignItems: "center", gap: 12, padding: "6px 0" },
  barTrack: { flex: 1, height: 8, background: C.border, overflow: "hidden", border: `1px solid ${C.border}` },
};
