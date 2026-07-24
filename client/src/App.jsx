/*
 * App.jsx — Frontend UI. Talks to the Express backend (index.js) via fetch.
 * They never share memory — just HTTP requests and JSON responses.
 */

import React, { useEffect, useMemo, useState, useRef } from "react";

const API = "http://localhost:5179";

const SEVERITY_OPTIONS = [
  { value: "Stable", icon: "●", color: "var(--green)" },
  { value: "Watcher", icon: "◐", color: "var(--amber)" },
  { value: "Unstable", icon: "▲", color: "var(--red)" },
];

const REQUIRED = [
  { key: "allergies", label: "Allergies", icon: "⚕", placeholder: "e.g. Penicillin, Latex" },
  { key: "codeStatus", label: "Code status", icon: "♡", placeholder: "e.g. Full code, DNR/DNI" },
  { key: "isolation", label: "Isolation", icon: "⊘", placeholder: "e.g. Contact, Droplet, None" },
  { key: "fallRisk", label: "Fall risk", icon: "⚠", placeholder: "e.g. High – bed alarm on" },
];

const DISCHARGE_CHECKS = [
  { key: "avsReviewed", label: "After-Visit Summary (AVS) reviewed with patient" },
  { key: "medsExplained", label: "Medications, dosages, and side effects explained" },
  { key: "followUpScheduled", label: "Follow-up appointments scheduled and confirmed" },
  { key: "equipmentArranged", label: "Medical equipment arranged (walker, monitor, etc.)" },
  { key: "safeTransport", label: "Safe transport confirmed — patient accompanied to vehicle" },
];

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// ── Shared components ──

function AnimatedNumber({ value }) {
  const [display, setDisplay] = useState(0);
  useEffect(() => {
    let cur = display;
    const step = () => {
      cur += (value - cur) * 0.15;
      if (Math.abs(value - cur) < 1) { setDisplay(value); return; }
      setDisplay(Math.round(cur));
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [value]);
  return <span>{display}</span>;
}

function ProgressRing({ value }) {
  const r = 28, c = 2 * Math.PI * r, offset = c - (value / 100) * c;
  const color = value === 100 ? "var(--green)" : value >= 50 ? "var(--amber)" : "var(--red)";
  return (
    <div className="progressRing">
      <svg width="72" height="72" viewBox="0 0 72 72">
        <circle cx="36" cy="36" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="5" />
        <circle cx="36" cy="36" r={r} fill="none" stroke={color} strokeWidth="5"
          strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.6s ease, stroke 0.4s ease", transform: "rotate(-90deg)", transformOrigin: "center" }} />
      </svg>
      <div className="ringLabel"><AnimatedNumber value={value} /><span className="ringPercent">%</span></div>
    </div>
  );
}

function PatientCard({ patient, active, onClick, index }) {
  const sevColor = patient.tags.includes("UNSTABLE") ? "var(--red)" : patient.tags.includes("FALL") ? "var(--amber)" : "var(--green)";
  const discharged = patient.status === "discharged";
  const handedOff = patient.status === "handed-off";
  return (
    <button className={`patientCard ${active ? "active" : ""} ${discharged || handedOff ? "dimmed" : ""}`}
      onClick={onClick} style={{ animationDelay: `${index * 80}ms` }}>
      <div className="cardAccent" style={{ background: active ? "var(--red)" : discharged ? "var(--text3)" : handedOff ? "var(--amber)" : sevColor }} />
      <div className="patientInner">
        <div className="patientTop"><div className="patientName">{patient.name}</div><div className="patientRoom">{patient.room}</div></div>
        <div className="patientMeta">Age {patient.age} · {patient.tags.length} flag{patient.tags.length !== 1 ? "s" : ""}</div>
        <div className="patientTags">
          {discharged && <span className="tag tagDischarged">DISCHARGED</span>}
          {handedOff && <span className="tag tagHandedOff">HANDED OFF</span>}
          {patient.tags.map(t => <span key={t} className={`tag ${t === "FALL" ? "tagWarn" : t === "ISO" ? "tagAlert" : ""}`}>{t}</span>)}
        </div>
      </div>
    </button>
  );
}

function OutputSection({ title, icon, children, delay = 0 }) {
  return (
    <div className="outputSection" style={{ animationDelay: `${delay}ms` }}>
      <div className="outputHeader"><span className="outputIcon">{icon}</span><span className="outputTitle">{title}</span></div>
      {children}
    </div>
  );
}

function AiOutputDisplay({ ai, timestamp, showMeta }) {
  if (!ai) return null;
  return (
    <div className="outputWrap">
      {showMeta && (
        <div className="outputMeta">
          <span>Generated at {timestamp}</span>
          {ai.meta && <span className="metaPill">{ai.meta.usedLLM ? `LLM: ${ai.meta.model}` : "Mock engine"}</span>}
        </div>
      )}
      {ai.output.missingRequired.length > 0 ? (
        <div className="alertBanner alertWarn fadeUp"><span className="alertIcon">⚠</span>
          <div><div className="alertTitle">Missing required safety fields</div><div className="alertBody">{ai.output.missingRequired.join(", ")}</div></div>
        </div>
      ) : (
        <div className="alertBanner alertGood fadeUp"><span className="alertIcon">✓</span><div><div className="alertTitle">Safety Net: All clear</div></div></div>
      )}
      <OutputSection title="Summary" icon="📋" delay={80}><ul className="bulletList">{ai.output.summaryBullets.map((b, i) => <li key={i}>{b}</li>)}</ul></OutputSection>
      <OutputSection title="Watchouts" icon="👁" delay={160}><ul className="bulletList watchList">{ai.output.watchouts.map((w, i) => <li key={i}>{w}</li>)}</ul></OutputSection>
      <OutputSection title="Ask-Back Questions" icon="💬" delay={240}><div className="questionChips">{ai.output.askBackQuestions.map((q, i) => <div className="questionChip" key={i}>{q}</div>)}</div></OutputSection>
      <OutputSection title="Task Baton" icon="📌" delay={320}>
        <div className="taskList">{ai.output.tasks.map((t, i) => (
          <div className={`taskItem taskPriority-${t.priority}`} key={i}><span className="taskPriorityBadge">{t.priority}</span><span className="taskText">{t.text}</span></div>
        ))}</div>
      </OutputSection>
    </div>
  );
}

function ScheduleCalendar({ schedule, compact }) {
  return (
    <div className={`calendarGrid ${compact ? "calendarCompact" : ""}`}>
      {DAYS.map(day => {
        const shift = schedule.find(s => s.day === day);
        return (
          <div key={day} className={`calDay ${shift ? "calOn" : "calOff"}`}>
            <div className="calDayLabel">{day}</div>
            {shift ? (<div className="calShift"><div className="calShiftType">{shift.shift}</div><div className="calShiftTime">{shift.startFormatted}–{shift.endFormatted}</div></div>)
              : (<div className="calShiftOff">Off</div>)}
          </div>
        );
      })}
    </div>
  );
}

function RecCard({ nurse, selected, onClick, usedLLM }) {
  return (
    <button className={`recNurseBtn ${selected ? "recActive" : ""}`} onClick={onClick}>
      <div className="nurseAvatar nurseAvatarSm">{nurse.name.split(" ").map(w => w[0]).join("")}</div>
      <div className="recInfo">
        <div className="recNameRow">
          <span className="recName">{nurse.name}</span>
          <span className="recExp">{nurse.yearsExp}yr · {nurse.specialties?.join(", ")}</span>
        </div>
        {nurse.reasoning && (
          <div className="recReasoning">{nurse.reasoning}</div>
        )}
        {nurse.matchedSkills?.length > 0 && (
          <div className="recSkills">
            {nurse.matchedSkills.map((s, i) => <span key={i} className="recSkillTag">{s}</span>)}
          </div>
        )}
      </div>
    </button>
  );
}

// ── Login ──
function LoginScreen({ nurses, onLogin }) {
  return (
    <div className="loginWrap">
      <div className="loginCard fadeUp">
        <div className="loginLogo">
          <svg width="48" height="48" viewBox="0 0 28 28" fill="none">
            <rect x="2" y="10" width="24" height="8" rx="2" fill="var(--red)" opacity="0.9"/>
            <rect x="10" y="2" width="8" height="24" rx="2" fill="var(--red)" opacity="0.9"/>
          </svg>
        </div>
        <h1 className="loginTitle">Handoff Copilot</h1>
        <p className="loginSubtitle">Select your nurse profile to begin</p>
        <div className="nurseList">
          {nurses.map(n => (
            <button key={n.id} className="nurseBtn" onClick={() => onLogin(n)}>
              <div className="nurseAvatar">{n.name.split(" ").map(w => w[0]).join("")}</div>
              <div>
                <div className="nurseBtnName">{n.name}</div>
                <div className="nurseBtnRole">{n.role} · Unit {n.unit} · {n.yearsExp}yr exp</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [nurses, setNurses] = useState([]);
  const [currentNurse, setCurrentNurse] = useState(null);
  const [patients, setPatients] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [sidebarTab, setSidebarTab] = useState("patients");
  const [inbox, setInbox] = useState([]);
  const [selectedHandoff, setSelectedHandoff] = useState(null);

  const [fields, setFields] = useState({ illnessSeverity: "Stable", oneLiner: "", allergies: "", codeStatus: "", isolation: "", fallRisk: "" });
  const [vitals, setVitals] = useState({ weight: "", height: "", bp: "", hr: "", temp: "" });
  const [note, setNote] = useState("");
  const [ai, setAi] = useState(null);
  const [loading, setLoading] = useState(false);
  const [showOutput, setShowOutput] = useState(false);
  const [timestamp, setTimestamp] = useState(null);
  const [submitTarget, setSubmitTarget] = useState("");
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [incomingNotes, setIncomingNotes] = useState("");

  const [showDischarge, setShowDischarge] = useState(false);
  const [dcChecklist, setDcChecklist] = useState({ avsReviewed: false, medsExplained: false, followUpScheduled: false, equipmentArranged: false, safeTransport: false });
  const [dcNotes, setDcNotes] = useState("");
  const [dcSuccess, setDcSuccess] = useState(false);

  const [scheduleData, setScheduleData] = useState([]);
  const [recommended, setRecommended] = useState([]);
  const [recMeta, setRecMeta] = useState({});
  const [recLoading, setRecLoading] = useState(false);
  const [patientHistory, setPatientHistory] = useState([]);
  const [redirectTarget, setRedirectTarget] = useState("");
  const [redirectReason, setRedirectReason] = useState("");
  const [showRedirect, setShowRedirect] = useState(false);
  const [viewingNurse, setViewingNurse] = useState(null);

  const outputRef = useRef(null);
  const selectedPatient = useMemo(() => patients.find(p => p.id === selectedId), [patients, selectedId]);
  const myPatients = useMemo(() => patients.filter(p => p.assignedTo === currentNurse?.id && p.status !== "handed-off"), [patients, currentNurse]);
  const otherNurses = useMemo(() => nurses.filter(n => n.id !== currentNurse?.id), [nurses, currentNurse]);
  const completeness = useMemo(() => {
    const filled = REQUIRED.filter(r => String(fields[r.key] || "").trim() !== "").length;
    return Math.round((filled / REQUIRED.length) * 100);
  }, [fields]);
  const dcComplete = useMemo(() => DISCHARGE_CHECKS.every(c => dcChecklist[c.key]), [dcChecklist]);

  // Asks the backend for all nurse profiles on first render. Backend sends back names, specialties, certs, and bios.
  useEffect(() => { fetch(`${API}/api/nurses`).then(r => r.json()).then(d => setNurses(d.nurses)).catch(() => {}); }, []);

  useEffect(() => {
    // After login, asks the backend for the patient list and all nurse schedules with availability.
    if (!currentNurse) return;
    refreshPatients();
    fetch(`${API}/api/schedules`).then(r => r.json()).then(d => setScheduleData(d.nurses)).catch(() => {});
  }, [currentNurse]);

  useEffect(() => {
    if (!currentNurse || sidebarTab !== "inbox") return;
    refreshInbox();
  }, [currentNurse, sidebarTab]);

  useEffect(() => {
    if (!selectedId || sidebarTab !== "patients") { setPatientHistory([]); return; }
    // Asks the backend for this patient's full handoff history. Backend sends back past handoffs sorted by time.
    fetch(`${API}/api/handoffs/history/${selectedId}`).then(r => r.json()).then(d => setPatientHistory(d.history || [])).catch(() => setPatientHistory([]));
  }, [selectedId, sidebarTab]);

  // Asks the backend for recommended nurses for this patient. Backend runs the LLM (or mock fallback) and sends back the top 2 with reasoning.
  useEffect(() => {
    if (!currentNurse || !selectedId) { setRecommended([]); setRecMeta({}); return; }
    setRecLoading(true);
    fetch(`${API}/api/schedules/recommended/${currentNurse.id}?patientId=${selectedId}`)
      .then(r => r.json())
      .then(d => { setRecommended(d.recommended || []); setRecMeta(d.meta || {}); })
      .catch(() => { setRecommended([]); setRecMeta({}); })
      .finally(() => setRecLoading(false));
  }, [currentNurse, selectedId]);

  async function refreshPatients() { const res = await fetch(`${API}/api/patients`); const data = await res.json(); setPatients(data.patients); }
  // Asks the backend for all handoffs addressed to this nurse. Backend sends back pending and acknowledged ones.
  async function refreshInbox() { const res = await fetch(`${API}/api/handoffs/inbox/${currentNurse.id}`); const data = await res.json(); setInbox(data.handoffs); }

  // Sends patientId, form fields, and shift notes to the backend. Backend merges with the patient record, runs the LLM (or mock), and sends back the structured AI output.
  async function generate() {
    if (!selectedId) return;
    setLoading(true); setAi(null); setShowOutput(false); setSubmitSuccess(false);
    try {
      const res = await fetch(`${API}/api/handoff/generate`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patientId: selectedId, fields, note }),
      });
      const data = await res.json();
      setAi(data);
      setTimestamp(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
      setTimeout(() => setShowOutput(true), 50);
      setTimeout(() => outputRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 200);
    } finally { setLoading(false); }
  }

  // Sends updated vitals or age to the backend. Fire-and-forget — local state updates immediately, server patches in the background.
  async function saveVitals(v) { setVitals(v); if (selectedId) await fetch(`${API}/api/patients/${selectedId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ vitals: v }) }).catch(() => {}); }
  async function saveAge(val) { if (!selectedId) return; const n = parseInt(val); if (isNaN(n)) return; setPatients(prev => prev.map(p => p.id === selectedId ? { ...p, age: n } : p)); await fetch(`${API}/api/patients/${selectedId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ age: n }) }).catch(() => {}); }

  // Sends the full handoff package (both nurse IDs, patient, fields, vitals, AI output) to the backend. Backend stores it and marks the patient as handed-off.
  async function submitHandoff() {
    if (!submitTarget || !ai) return;
    const res = await fetch(`${API}/api/handoff/submit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fromNurseId: currentNurse.id, toNurseId: submitTarget, patientId: selectedId, fields, note, vitals, aiOutput: ai }) });
    const data = await res.json();
    if (data.handoff) { setSubmitSuccess(true); await refreshPatients(); }
  }

  // Tells the backend to accept this handoff. Backend marks it acknowledged and moves the patient to this nurse's active list.
  async function acknowledgeHandoff(handoffId) {
    const res = await fetch(`${API}/api/handoff/acknowledge`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ handoffId, incomingNotes }) });
    const data = await res.json();
    if (data.handoff) { setSelectedHandoff(data.handoff); await refreshInbox(); await refreshPatients(); }
  }

  // Tells the backend to redirect this handoff to a different nurse. Backend logs the redirect and moves it to the new nurse's inbox.
  async function redirectHandoff(handoffId) {
    if (!redirectTarget) return;
    const res = await fetch(`${API}/api/handoff/redirect`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ handoffId, newNurseId: redirectTarget, reason: redirectReason }) });
    const data = await res.json();
    if (data.handoff) { setShowRedirect(false); setRedirectTarget(""); setRedirectReason(""); await refreshInbox(); setSelectedHandoff(null); }
  }

  // Sends the discharge checklist to the backend. Backend validates all 5 items are checked, then marks the patient as discharged (or rejects with 400).
  async function dischargePatient() {
    if (!selectedId || !dcComplete) return;
    const res = await fetch(`${API}/api/patients/${selectedId}/discharge`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nurseId: currentNurse.id, checklist: dcChecklist, dischargeNotes: dcNotes }) });
    const data = await res.json();
    if (data.discharge) { setDcSuccess(true); await refreshPatients(); }
  }

  function updateField(key, val) { setFields(prev => ({ ...prev, [key]: val })); }
  function selectPatient(id) {
    setSelectedId(id); setAi(null); setShowOutput(false); setSubmitSuccess(false); setSelectedHandoff(null);
    setFields({ illnessSeverity: "Stable", oneLiner: "", allergies: "", codeStatus: "", isolation: "", fallRisk: "" });
    setVitals({ weight: "", height: "", bp: "", hr: "", temp: "" }); setNote(""); setSubmitTarget("");
    setShowDischarge(false); setDcSuccess(false); setDcNotes("");
    setDcChecklist({ avsReviewed: false, medsExplained: false, followUpScheduled: false, equipmentArranged: false, safeTransport: false });
  }
  function handleLogin(nurse) { setCurrentNurse(nurse); setSidebarTab("patients"); setSelectedHandoff(null); setViewingNurse(null); }
  function handleLogout() { setCurrentNurse(null); setPatients([]); setSelectedId(null); setAi(null); setInbox([]); setSelectedHandoff(null); setScheduleData([]); setRecommended([]); setViewingNurse(null); }

  if (!currentNurse) return <LoginScreen nurses={nurses} onLogin={handleLogin} />;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebarHeader">
          <div className="logoMark"><svg width="28" height="28" viewBox="0 0 28 28" fill="none"><rect x="2" y="10" width="24" height="8" rx="2" fill="var(--red)" opacity="0.9"/><rect x="10" y="2" width="8" height="24" rx="2" fill="var(--red)" opacity="0.9"/></svg></div>
          <div><div className="brandName">Handoff Copilot</div><div className="unitLabel">Unit 4B · Night Shift</div></div>
        </div>
        <div className="nurseInfo">
          <div className="nurseAvatar nurseAvatarSm">{currentNurse.name.split(" ").map(w => w[0]).join("")}</div>
          <div className="nurseInfoText"><div className="nurseInfoName">{currentNurse.name}</div><div className="nurseInfoRole">{currentNurse.role} · {currentNurse.yearsExp}yr</div></div>
          <button className="logoutBtn" onClick={handleLogout}>Sign out</button>
        </div>
        <div className="sidebarDivider" />
        <div className="tabRow">
          <button className={`tabBtn ${sidebarTab === "patients" ? "tabActive" : ""}`} onClick={() => { setSidebarTab("patients"); setSelectedHandoff(null); setViewingNurse(null); }}>Patients</button>
          <button className={`tabBtn ${sidebarTab === "inbox" ? "tabActive" : ""}`} onClick={() => { setSidebarTab("inbox"); setViewingNurse(null); }}>
            Inbox {inbox.filter(h => h.status === "pending").length > 0 && <span className="inboxBadge">{inbox.filter(h => h.status === "pending").length}</span>}
          </button>
          <button className={`tabBtn ${sidebarTab === "team" ? "tabActive" : ""}`} onClick={() => setSidebarTab("team")}>Team</button>
        </div>

        {sidebarTab === "patients" && (<><div className="sectionLabel">ASSIGNED TO ME</div><div className="patientList">{myPatients.length === 0 && <div className="emptyPatients">No patients assigned</div>}{myPatients.map((p, i) => <PatientCard key={p.id} patient={p} active={p.id === selectedId} onClick={() => selectPatient(p.id)} index={i} />)}</div></>)}

        {sidebarTab === "inbox" && (<><div className="sectionLabel">INCOMING HANDOFFS</div><div className="patientList">{inbox.length === 0 && <div className="emptyPatients">No handoffs received</div>}{inbox.map((h, i) => (
          <button key={h.id} className={`patientCard ${selectedHandoff?.id === h.id ? "active" : ""}`} onClick={() => { setSelectedHandoff(h); setIncomingNotes(h.incomingNotes || ""); setShowRedirect(false); }} style={{ animationDelay: `${i * 80}ms` }}>
            <div className="cardAccent" style={{ background: h.status === "acknowledged" ? "var(--green)" : "var(--amber)" }} />
            <div className="patientInner"><div className="patientTop"><div className="patientName">{h.patient.name}</div><div className="patientRoom">{h.patient.room}</div></div><div className="patientMeta">From {h.fromNurse.name}</div>
              <div className="patientTags"><span className={`tag ${h.status === "acknowledged" ? "tagAck" : "tagPending"}`}>{h.status === "acknowledged" ? "ACKNOWLEDGED" : "PENDING"}</span>{h.redirectHistory.length > 0 && <span className="tag tagRedirect">REDIRECTED</span>}</div></div>
          </button>))}</div></>)}

        {sidebarTab === "team" && (<><div className="sectionLabel">UNIT 4B TEAM</div><div className="patientList">{nurses.map((n, i) => (
          <button key={n.id} className={`patientCard ${viewingNurse?.id === n.id ? "active" : ""}`} onClick={() => setViewingNurse(n)} style={{ animationDelay: `${i * 60}ms` }}>
            <div className="cardAccent" style={{ background: n.id === currentNurse.id ? "var(--red)" : "var(--green)" }} />
            <div className="patientInner"><div className="patientTop"><div className="patientName">{n.name}</div><div className="patientRoom">{n.yearsExp}yr</div></div><div className="patientMeta">{n.specialties?.join(", ")}</div></div>
          </button>))}</div></>)}


      </aside>

      <main className="main">

        {/* ── Team / Nurse profile ── */}
        {sidebarTab === "team" && viewingNurse && (
          <div className="nurseProfile fadeUp">
            <div className="topBar"><div className="topLeft"><h1 className="pageTitle">Nurse Profile</h1>
              <div className="breadcrumb"><span className="bcName">{viewingNurse.name}</span><span className="bcSep">›</span><span>{viewingNurse.role} · {viewingNurse.yearsExp} years</span>{viewingNurse.id === currentNurse.id && <span className="youBadge">You</span>}</div></div></div>
            <div className="profileGrid">
              <div className="card fadeUp"><div className="cardLabel">BIO</div><p className="profileBio">{viewingNurse.bio}</p></div>
              <div className="card fadeUp" style={{ animationDelay: "60ms" }}><div className="cardLabel">SPECIALTIES</div><div className="profileTags">{viewingNurse.specialties?.map(s => <span key={s} className="profileTag specTag">{s}</span>)}</div></div>
              <div className="card fadeUp" style={{ animationDelay: "120ms" }}><div className="cardLabel">CERTIFICATIONS</div><div className="profileTags">{viewingNurse.certifications?.map(c => <span key={c} className="profileTag certTag">{c}</span>)}</div></div>
              <div className="card fadeUp" style={{ animationDelay: "180ms" }}><div className="cardLabel">CLINICAL STRENGTHS</div><div className="strengthsList">{viewingNurse.strengths?.map((s, i) => <div key={i} className="strengthItem">• {s}</div>)}</div></div>
              {scheduleData.find(n => n.id === viewingNurse.id) && (
                <div className="card fadeUp" style={{ animationDelay: "240ms" }}><div className="cardLabel">THIS WEEK'S SCHEDULE</div>
                  <ScheduleCalendar schedule={scheduleData.find(n => n.id === viewingNurse.id).schedule} />
                  <div className="schedMeta">{scheduleData.find(n => n.id === viewingNurse.id).availability.shiftDays} shifts · {scheduleData.find(n => n.id === viewingNurse.id).availability.totalHours}h · {scheduleData.find(n => n.id === viewingNurse.id).availability.activePatients} active patient{scheduleData.find(n => n.id === viewingNurse.id).availability.activePatients !== 1 ? "s" : ""}</div>
                </div>
              )}
            </div>
          </div>
        )}
        {sidebarTab === "team" && !viewingNurse && <div className="emptyState fadeUp" style={{ marginTop: 60 }}><div className="emptyIcon">👥</div><div className="emptyTitle">Select a team member</div><div className="emptyDesc">View profiles, specialties, certifications, and schedules.</div></div>}

        {/* ── Inbox ── */}
        {sidebarTab === "inbox" && selectedHandoff && (
          <div className="inboxDetail fadeUp">
            <div className="topBar"><div className="topLeft"><h1 className="pageTitle">Incoming Handoff</h1><div className="breadcrumb"><span className="bcName">{selectedHandoff.patient.name}</span><span className="bcSep">›</span><span>Room {selectedHandoff.patient.room}</span></div></div></div>
            <div className="handoffMetaCard card fadeUp">
              <div className="handoffMetaRow">
                <div className="handoffMetaItem"><div className="handoffMetaLabel">From</div><div className="handoffMetaValue">{selectedHandoff.fromNurse.name}</div></div>
                <div className="handoffMetaItem"><div className="handoffMetaLabel">Submitted</div><div className="handoffMetaValue">{new Date(selectedHandoff.timestamp).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</div></div>
                <div className="handoffMetaItem"><div className="handoffMetaLabel">Severity</div><div className="handoffMetaValue">{selectedHandoff.fields?.illnessSeverity || "N/A"}</div></div>
                <div className="handoffMetaItem"><div className="handoffMetaLabel">Status</div><div className={`handoffStatusBadge ${selectedHandoff.status === "acknowledged" ? "badgeAck" : "badgePending"}`}>{selectedHandoff.status === "acknowledged" ? "Acknowledged" : "Pending Review"}</div></div>
              </div>
              {selectedHandoff.redirectHistory.length > 0 && <div className="redirectTrail">{selectedHandoff.redirectHistory.map((r, i) => <div key={i} className="redirectItem">↳ Redirected from {r.from.name} to {r.to.name}{r.reason && <span className="redirectReason"> — "{r.reason}"</span>}</div>)}</div>}
            </div>

            <div className="card fadeUp" style={{ animationDelay: "60ms" }}>
              <div className="cardLabel">OUTGOING NURSE DOCUMENTATION</div>
              <div className="notesScroll">
                {selectedHandoff.fields?.oneLiner && <div className="noteBlock"><div className="noteBlockLabel">One-Liner</div><div className="noteBlockText">{selectedHandoff.fields.oneLiner}</div></div>}
                <div className="noteBlock"><div className="noteBlockLabel">Safety Fields</div>
                  <div className="safetyReadGrid">{REQUIRED.map(r => (<div key={r.key} className="safetyReadItem"><span className="safetyReadLabel">{r.label}</span><span className={`safetyReadValue ${selectedHandoff.fields?.[r.key] ? "" : "safetyMissing"}`}>{selectedHandoff.fields?.[r.key] || "Not provided"}</span></div>))}</div></div>
                {selectedHandoff.vitals && Object.values(selectedHandoff.vitals).some(v => v) && <div className="noteBlock"><div className="noteBlockLabel">Vitals</div><div className="vitalsRead">{Object.entries(selectedHandoff.vitals).filter(([,v]) => v).map(([k, v]) => <span key={k} className="vitalReadItem">{k}: {v}</span>)}</div></div>}
                {selectedHandoff.note && <div className="noteBlock"><div className="noteBlockLabel">Shift Notes</div><div className="noteBlockText">{selectedHandoff.note}</div></div>}
              </div>
            </div>

            {selectedHandoff.aiOutput && <div className="fadeUp" style={{ animationDelay: "120ms" }}><AiOutputDisplay ai={selectedHandoff.aiOutput} timestamp={new Date(selectedHandoff.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} showMeta={true} /></div>}

            <div className="card fadeUp" style={{ animationDelay: "180ms" }}>
              <div className="cardLabel">MY NOTES & INSIGHTS</div>
              <textarea className="field fieldTextarea" placeholder="Add your observations, follow-up actions, or clarifications…" value={incomingNotes} onChange={e => setIncomingNotes(e.target.value)} />
              {selectedHandoff.status !== "acknowledged" && (
                <div className="inboxActions">
                  <button className="generateBtn" onClick={() => acknowledgeHandoff(selectedHandoff.id)}><span className="btnIcon">✓</span> Acknowledge & Take Over Patient</button>
                  <button className="redirectToggle" onClick={() => setShowRedirect(!showRedirect)}>↗ Can't accept — transfer to another nurse</button>
                </div>
              )}
              {selectedHandoff.status === "acknowledged" && <div className="ackConfirm fadeUp"><span>✓</span> Acknowledged — {selectedHandoff.patient.name} is now in your Patients tab</div>}
              {showRedirect && selectedHandoff.status !== "acknowledged" && (
                <div className="redirectPanel fadeUp">
                  <div className="cardLabel">REDIRECT HANDOFF</div>
                  {recommended.length > 0 && <div className="recNurses"><div className="recLabel">AI-recommended {recMeta.usedLLM ? "(clinical fit + availability)" : "(workload-based)"}</div>
                    {recommended.filter(n => n.id !== selectedHandoff.fromNurse.id).map(n => <RecCard key={n.id} nurse={n} selected={redirectTarget === n.id} onClick={() => setRedirectTarget(n.id)} usedLLM={recMeta.usedLLM} />)}</div>}
                  <select className="field" style={{ marginTop: 10 }} value={redirectTarget} onChange={e => setRedirectTarget(e.target.value)}>
                    <option value="">Or select manually…</option>
                    {otherNurses.filter(n => n.id !== selectedHandoff.fromNurse.id).map(n => <option key={n.id} value={n.id}>{n.name} — {n.specialties?.join(", ")}</option>)}
                  </select>
                  <input className="field" style={{ marginTop: 8 }} placeholder="Reason (optional)" value={redirectReason} onChange={e => setRedirectReason(e.target.value)} />
                  <button className="submitBtn" style={{ marginTop: 10, width: "100%" }} onClick={() => redirectHandoff(selectedHandoff.id)} disabled={!redirectTarget}>Redirect Handoff</button>
                </div>
              )}
            </div>
          </div>
        )}
        {sidebarTab === "inbox" && !selectedHandoff && <div className="emptyState fadeUp" style={{ marginTop: 60 }}><div className="emptyIcon">📥</div><div className="emptyTitle">Select a handoff from your inbox</div><div className="emptyDesc">Review details, add notes, and accept or redirect.</div></div>}

        {/* ── Patient workspace ── */}
        {sidebarTab === "patients" && (
          <>
            <div className="topBar">
              <div className="topLeft"><h1 className="pageTitle">Shift Handoff</h1>
                {selectedPatient && (<div className="breadcrumb"><span className="bcName">{selectedPatient.name}</span><span className="bcSep">›</span><span>Room {selectedPatient.room}</span>{selectedPatient.status === "discharged" && <span className="bcStatus bcDischarged">Discharged</span>}</div>)}</div>
              {selectedPatient && selectedPatient.status === "active" && (
                <div className="topRight"><div className="completenessCard"><ProgressRing value={completeness} />
                  <div className="completenessText"><div className="completenessLabel">Safety Check</div><div className="completenessStatus">{completeness === 100 ? "All fields complete" : `${REQUIRED.filter(r => !String(fields[r.key] || "").trim()).length} remaining`}</div></div></div></div>
              )}
            </div>

            {!selectedPatient && <div className="emptyState fadeUp" style={{ marginTop: 20 }}><div className="emptyIcon">👤</div><div className="emptyTitle">No patient selected</div><div className="emptyDesc">Select a patient from the sidebar.</div></div>}
            {selectedPatient && selectedPatient.status === "discharged" && <div className="emptyState fadeUp" style={{ marginTop: 20 }}><div className="emptyIcon">🏠</div><div className="emptyTitle">{selectedPatient.name} has been discharged</div><div className="emptyDesc">Discharge complete.</div></div>}

            {selectedPatient && selectedPatient.status === "active" && !showDischarge && (
              <div className="contentGrid">
                <div className="formColumn">
                  {patientHistory.length > 0 && (
                    <div className="card fadeUp priorCard"><div className="cardLabel">HANDOFF HISTORY</div>
                      <div className="historyScroll">{patientHistory.map((h, i) => (
                        <div key={h.id} className="historyEntry">
                          <div className="historyHeader"><div className="historyNurse">{h.fromNurse.name} → {h.toNurse.name}</div><div className="historyTime">{new Date(h.timestamp).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}</div></div>
                          {h.fields?.oneLiner && <div className="historyOneLiner">{h.fields.oneLiner}</div>}
                          {h.note && <div className="historyNote">{h.note}</div>}
                          {h.incomingNotes && <div className="historyIncoming"><span className="historyIncomingLabel">Incoming nurse notes:</span> {h.incomingNotes}</div>}
                          {h.aiOutput?.output?.summaryBullets && <details className="historyAiDetails"><summary>View AI Summary</summary><ul className="historyAiBullets">{h.aiOutput.output.summaryBullets.map((b, j) => <li key={j}>{b}</li>)}</ul></details>}
                          {i < patientHistory.length - 1 && <div className="historyDivider" />}
                        </div>))}</div></div>
                  )}

                  <div className="card fadeUp"><div className="cardLabel">PATIENT INFO</div>
                    <div className="patientInfoRow">
                      <div className="infoItem"><label className="infoLabel">Age</label><input className="field fieldSm" type="number" value={selectedPatient.age} onChange={e => saveAge(e.target.value)} /></div>
                      <div className="infoItem"><label className="infoLabel">Room</label><div className="infoStatic">{selectedPatient.room}</div></div>
                      <div className="infoItem infoTags"><label className="infoLabel">Flags</label><div className="infoTagRow">{selectedPatient.tags.map(t => <span key={t} className={`tag tagDark ${t === "FALL" ? "tagWarn" : t === "ISO" ? "tagAlert" : ""}`}>{t}</span>)}</div></div>
                    </div></div>

                  <div className="card fadeUp" style={{ animationDelay: "40ms" }}><div className="cardLabel">VITALS <span className="optional">optional</span></div>
                    <div className="vitalsGrid">{[{ key: "weight", label: "Weight", placeholder: "e.g. 72 kg" }, { key: "height", label: "Height", placeholder: "e.g. 170 cm" }, { key: "bp", label: "Blood Pressure", placeholder: "e.g. 120/80" }, { key: "hr", label: "Heart Rate", placeholder: "e.g. 78 bpm" }, { key: "temp", label: "Temperature", placeholder: "e.g. 98.6 °F" }].map(v => (
                      <div key={v.key} className="vitalItem"><label className="vitalLabel">{v.label}</label><input className="field fieldSm" placeholder={v.placeholder} value={vitals[v.key]} onChange={e => saveVitals({ ...vitals, [v.key]: e.target.value })} /></div>
                    ))}</div></div>

                  <div className="card fadeUp" style={{ animationDelay: "80ms" }}><div className="cardLabel">ILLNESS SEVERITY</div>
                    <div className="severityRow">{SEVERITY_OPTIONS.map(opt => (
                      <button key={opt.value} className={`severityBtn ${fields.illnessSeverity === opt.value ? "severityActive" : ""}`} style={{ "--sev-color": opt.color }} onClick={() => updateField("illnessSeverity", opt.value)}>
                        <span className="sevIcon">{opt.icon}</span><span>{opt.value}</span></button>
                    ))}</div></div>

                  <div className="card fadeUp" style={{ animationDelay: "120ms" }}><div className="cardLabel">ONE-LINER <span className="optional">optional</span></div>
                    <input className="field" placeholder="Brief context for the incoming nurse…" value={fields.oneLiner} onChange={e => updateField("oneLiner", e.target.value)} /></div>

                  <div className="card fadeUp" style={{ animationDelay: "160ms" }}><div className="cardLabel">REQUIRED SAFETY FIELDS <span className={`reqBadge ${completeness === 100 ? "reqComplete" : ""}`}>{REQUIRED.filter(r => String(fields[r.key] || "").trim()).length}/{REQUIRED.length}</span></div>
                    <div className="safetyGrid">{REQUIRED.map(r => { const filled = String(fields[r.key] || "").trim() !== ""; return (
                      <div key={r.key} className={`safetyField ${filled ? "safetyFilled" : ""}`}><div className="safetyTop"><span className="safetyIcon">{r.icon}</span><span className="safetyLabel">{r.label}</span>{filled && <span className="checkMark">✓</span>}</div>
                        <input className="field fieldSafety" placeholder={r.placeholder} value={fields[r.key]} onChange={e => updateField(r.key, e.target.value)} /></div>);})}</div></div>

                  <div className="card fadeUp" style={{ animationDelay: "200ms" }}><div className="cardLabel">SHIFT NOTES <span className="optional">or paste voice transcript</span></div>
                    <textarea className="field fieldTextarea" placeholder="O2 dips on ambulation, CT pending, pain controlled with PRN Dilaudid…" value={note} onChange={e => setNote(e.target.value)} />
                    <div className="noteHint">Keywords like <code>pending</code>, <code>CT</code>, <code>O2</code>, <code>pain</code>, <code>IV</code> generate richer output</div></div>

                  <button className={`generateBtn fadeUp ${loading ? "generating" : ""}`} style={{ animationDelay: "240ms" }} onClick={generate} disabled={loading}>
                    {loading ? <><span className="spinner" /> Generating…</> : <><span className="btnIcon">⚡</span> Generate Handoff Summary</>}</button>
                  <button className="dischargeToggle fadeUp" style={{ animationDelay: "260ms" }} onClick={() => setShowDischarge(true)}> Begin Discharge Process</button>
                </div>

                <div className="outputColumn" ref={outputRef}>
                  {!ai && !loading && <div className="emptyState fadeUp"><div className="emptyIcon"><svg width="48" height="48" viewBox="0 0 48 48" fill="none"><rect x="6" y="18" width="36" height="12" rx="3" stroke="var(--red-muted)" strokeWidth="2" strokeDasharray="4 3"/><rect x="18" y="6" width="12" height="36" rx="3" stroke="var(--red-muted)" strokeWidth="2" strokeDasharray="4 3"/></svg></div><div className="emptyTitle">No handoff generated yet</div><div className="emptyDesc">Fill in the form and click Generate.</div></div>}
                  {loading && <div className="loadingState"><div className="pulseRing" /><div className="loadingText">Analyzing patient data…</div></div>}
                  {ai && showOutput && (
                    <>
                      <AiOutputDisplay ai={ai} timestamp={timestamp} showMeta={true} />
                      {!submitSuccess && (
                        <div className="card submitCard fadeUp" style={{ animationDelay: "400ms" }}>
                          <div className="cardLabel">HAND OFF TO NEXT NURSE</div>

                          {recLoading && <div className="recLoading"><span className="spinner recSpinner" /> Analyzing nurse-patient fit…</div>}

                          {!recLoading && recommended.length > 0 && (
                            <div className="recNurses" style={{ marginBottom: 12 }}>
                              <div className="recLabel">
                                AI-recommended {recMeta.usedLLM ? "(clinical fit + availability)" : "(workload-based)"}
                              </div>
                              {recommended.map(n => <RecCard key={n.id} nurse={n} selected={submitTarget === n.id} onClick={() => setSubmitTarget(n.id)} usedLLM={recMeta.usedLLM} />)}
                            </div>
                          )}

                          <div className="submitRow">
                            <select className="field submitSelect" value={submitTarget} onChange={e => setSubmitTarget(e.target.value)}>
                              <option value="">Or select manually…</option>
                              {otherNurses.map(n => <option key={n.id} value={n.id}>{n.name} — {n.specialties?.join(", ")}</option>)}
                            </select>
                            <button className="submitBtn" onClick={submitHandoff} disabled={!submitTarget}>Submit Handoff</button>
                          </div>
                        </div>
                      )}
                      {submitSuccess && <div className="alertBanner alertGood fadeUp" style={{ animationDelay: "400ms" }}><span className="alertIcon">✓</span><div><div className="alertTitle">Handoff submitted</div><div className="alertBody">{otherNurses.find(n => n.id === submitTarget)?.name || "Nurse"} will see this in their inbox.</div></div></div>}
                    </>
                  )}
                </div>
              </div>
            )}

            {selectedPatient && selectedPatient.status === "active" && showDischarge && !dcSuccess && (
              <div className="dischargeWrap fadeUp">
                <button className="backBtn" onClick={() => setShowDischarge(false)}>← Back to handoff form</button>
                <div className="card"><div className="cardLabel">DISCHARGE: {selectedPatient.name} · ROOM {selectedPatient.room}</div><p className="dischargeDesc">Complete all items before discharge. A nurse's responsibility only ends when all steps are verified.</p></div>
                <div className="card fadeUp" style={{ animationDelay: "60ms" }}><div className="cardLabel">DISCHARGE EDUCATION CHECKLIST</div>
                  <div className="checklistItems">{DISCHARGE_CHECKS.map(item => (<label key={item.key} className={`checkItem ${dcChecklist[item.key] ? "checkDone" : ""}`}><input type="checkbox" checked={dcChecklist[item.key]} onChange={e => setDcChecklist(prev => ({ ...prev, [item.key]: e.target.checked }))} /><span className="checkBox">{dcChecklist[item.key] ? "✓" : ""}</span><span className="checkText">{item.label}</span></label>))}</div>
                  <div className="checkProgress">{DISCHARGE_CHECKS.filter(c => dcChecklist[c.key]).length} of {DISCHARGE_CHECKS.length} completed</div></div>
                <div className="card fadeUp" style={{ animationDelay: "120ms" }}><div className="cardLabel">DISCHARGE NOTES <span className="optional">optional</span></div><textarea className="field fieldTextarea" placeholder="Final observations, patient questions, follow-up details…" value={dcNotes} onChange={e => setDcNotes(e.target.value)} /></div>
                <button className={`generateBtn dischargeBtn fadeUp ${dcComplete ? "" : "dischargeLocked"}`} style={{ animationDelay: "180ms" }} onClick={dischargePatient} disabled={!dcComplete}>{dcComplete ? <><span className="btnIcon">🏠</span> Discharge Patient</> : <><span className="btnIcon">🔒</span> Complete all checklist items to discharge</>}</button>
              </div>
            )}
            {selectedPatient && showDischarge && dcSuccess && <div className="dischargeWrap fadeUp"><div className="alertBanner alertGood" style={{ marginTop: 20 }}><span className="alertIcon">✓</span><div><div className="alertTitle">{selectedPatient.name} discharged successfully</div><div className="alertBody">All education completed, documentation finalized, patient safely released.</div></div></div></div>}
          </>
        )}
      </main>
    </div>
  );
}