/*
 * index.js — Express backend on port 5179. The frontend (App.jsx) sends fetch
 * requests here, Express processes them (sometimes calling OpenAI), and sends
 * back JSON. No shared memory — just HTTP. Falls back to mocks if no API key.
 */

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import OpenAI from "openai";

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Schedules are randomized on each server start to simulate real shift changes.

const SHIFT_TEMPLATES = [
  { label: "Day", start: 7, end: 19 },
  { label: "Night", start: 19, end: 7 },
  { label: "Mid", start: 11, end: 23 },
];
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function randomShifts() {
  const workDays = 3 + Math.floor(Math.random() * 3);
  const pool = [...DAY_NAMES];
  const schedule = [];
  for (let i = 0; i < workDays; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    const day = pool.splice(idx, 1)[0];
    const shift = SHIFT_TEMPLATES[Math.floor(Math.random() * SHIFT_TEMPLATES.length)];
    schedule.push({ day, shift: shift.label, start: shift.start, end: shift.end });
  }
  schedule.sort((a, b) => DAY_NAMES.indexOf(a.day) - DAY_NAMES.indexOf(b.day));
  return schedule;
}

function formatTime(hour) {
  const h = hour % 24;
  const suffix = h >= 12 ? "PM" : "AM";
  const display = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${display}:00 ${suffix}`;
}

// Nurse profiles — the LLM reads these to decide clinical fit.

const nurses = [
  {
    id: "n1", name: "Sarah Chen", role: "RN", unit: "4B", yearsExp: 8,
    specialties: ["Medical-Surgical", "Geriatrics"],
    certifications: ["CMSRN", "BLS", "ACLS"],
    strengths: ["Fall prevention protocols", "Isolation precautions (contact/droplet/airborne)", "Complex medication reconciliation", "Post-surgical wound assessment"],
    bio: "Eight years in med-surg with a focus on geriatric patients. Experienced with fall risk mitigation, multi-drug regimen management, and coordinating with physical therapy for mobility plans. Comfortable with contact and airborne isolation workflows."
  },
  {
    id: "n2", name: "James Okafor", role: "RN", unit: "4B", yearsExp: 5,
    specialties: ["Emergency", "Trauma"],
    certifications: ["CEN", "BLS", "ACLS", "TNCC"],
    strengths: ["Rapid patient assessment", "Acute pain management", "IV therapy and central line care", "Lab interpretation and escalation"],
    bio: "Five years split between the ED and step-down units. Strong at triaging unstable patients, managing acute pain with PRN protocols, and interpreting lab trends for early intervention. TNCC-certified for trauma stabilization."
  },
  {
    id: "n3", name: "Maria Santos", role: "RN", unit: "4B", yearsExp: 12,
    specialties: ["Critical Care", "Respiratory"],
    certifications: ["CCRN", "BLS", "ACLS"],
    strengths: ["Ventilator and O2 management", "Hemodynamic monitoring", "Code blue response", "Patient and family end-of-life communication"],
    bio: "Twelve years in critical care and ICU step-down. Expert in respiratory deterioration recognition, O2 titration during ambulation, and managing patients transitioning from ICU to floor. Leads code blue responses on the unit."
  },
  {
    id: "n4", name: "Priya Sharma", role: "RN", unit: "4B", yearsExp: 3,
    specialties: ["Oncology", "Infusion Therapy"],
    certifications: ["OCN", "BLS", "CRNI"],
    strengths: ["Chemotherapy administration", "PICC and port access", "Lab draw coordination", "Patient education for chronic conditions"],
    bio: "Three years in oncology and infusion services. Skilled at managing complex IV access, coordinating time-sensitive lab draws, and educating patients on treatment plans and discharge instructions for chronic disease management."
  },
  {
    id: "n5", name: "David Kim", role: "RN", unit: "4B", yearsExp: 6,
    specialties: ["Orthopedics", "Rehabilitation"],
    certifications: ["ONC", "BLS", "CRRN"],
    strengths: ["Post-op mobility assessment", "Fall risk scoring and intervention", "Pain management (surgical)", "Discharge planning with DME coordination"],
    bio: "Six years in orthopedic and rehab units. Specializes in post-surgical recovery, progressive mobility protocols, and fall prevention for patients with gait instability. Experienced coordinating walkers, braces, and home health services at discharge."
  },
  {
    id: "n6", name: "Angela Torres", role: "RN", unit: "4B", yearsExp: 10,
    specialties: ["Medical-Surgical", "Infection Control"],
    certifications: ["CIC", "CMSRN", "BLS", "ACLS"],
    strengths: ["Isolation protocol enforcement", "Wound care and infection assessment", "Antibiotic stewardship monitoring", "Multi-patient assignment coordination"],
    bio: "Ten years in med-surg with an infection control certification. Go-to resource for isolation room workflows, wound VAC management, and tracking culture/sensitivity results. Efficiently manages high patient loads while maintaining safety standards."
  },
];

const nurseSchedules = {};
for (const n of nurses) nurseSchedules[n.id] = randomShifts();

let patients = [
  { id: "p1", name: "J. Patel", room: "312B", tags: ["FALL", "ISO"], age: 67,
    vitals: { weight: "", height: "", bp: "", hr: "", temp: "" },
    assignedTo: "n1", status: "active" },
  { id: "p2", name: "M. Garcia", room: "314A", tags: ["PENDING LAB"], age: 52,
    vitals: { weight: "", height: "", bp: "", hr: "", temp: "" },
    assignedTo: "n1", status: "active" },
  { id: "p3", name: "S. Lin", room: "316C", tags: ["STABLE"], age: 41,
    vitals: { weight: "", height: "", bp: "", hr: "", temp: "" },
    assignedTo: "n2", status: "active" },
];

const handoffs = [];
let handoffIdCounter = 1;
const REQUIRED = ["allergies", "codeStatus", "isolation", "fallRisk"];

function computeMissing(fields) {
  const missing = [];
  for (const key of REQUIRED) {
    if (!fields?.[key] || String(fields[key]).trim() === "") missing.push(key);
  }
  return missing;
}

// Calculates a nurse's current workload — used by both mock and LLM recommendations.

function getAvailability(nurseId) {
  const schedule = nurseSchedules[nurseId] || [];
  const totalHours = schedule.reduce((sum, s) => {
    const hours = s.end > s.start ? s.end - s.start : (24 - s.start) + s.end;
    return sum + hours;
  }, 0);
  const activePatients = patients.filter(p => p.assignedTo === nurseId && p.status === "active").length;
  const pendingHandoffs = handoffs.filter(h => h.toNurse.id === nurseId && h.status === "pending").length;
  return { shiftDays: schedule.length, totalHours, activePatients, pendingHandoffs };
}

// Fallback when no API key — ranks nurses by workload only, no clinical reasoning.

function mockRecommendations(excludeNurseId, patient) {
  const candidates = nurses.filter(n => n.id !== excludeNurseId);
  const scored = candidates.map(n => {
    const avail = getAvailability(n.id);
    const score = avail.totalHours - (avail.activePatients * 10) - (avail.pendingHandoffs * 5);
    return {
      nurseId: n.id, nurseName: n.name, score,
      reasoning: `${n.name} has ${avail.shiftDays} shifts scheduled this week (${avail.totalHours}h), currently managing ${avail.activePatients} active patient${avail.activePatients !== 1 ? "s" : ""} with ${avail.pendingHandoffs} pending handoff${avail.pendingHandoffs !== 1 ? "s" : ""}. Specialties: ${n.specialties.join(", ")}. [Mock reasoning — enable LLM for clinical fit analysis.]`,
      matchedSkills: n.specialties.slice(0, 2),
    };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 2);
}

// Sends nurse profiles and patient context to OpenAI. The LLM picks the top 2 nurses and writes reasoning for each.

async function llmRecommendations(excludeNurseId, patient) {
  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const candidates = nurses.filter(n => n.id !== excludeNurseId).map(n => ({
    nurseId: n.id,
    name: n.name,
    yearsExp: n.yearsExp,
    specialties: n.specialties,
    certifications: n.certifications,
    strengths: n.strengths,
    bio: n.bio,
    availability: getAvailability(n.id),
  }));

  const patientContext = patient ? {
    name: patient.name,
    room: patient.room,
    age: patient.age,
    tags: patient.tags,
    status: patient.status,
  } : null;

  const systemPrompt = [
    "You are a charge nurse staffing assistant for a hospital unit.",
    "Given a patient's current clinical context (tags, age, acuity) and a list of available nurses with their profiles (specialties, certifications, clinical strengths, bio, and current workload), you must:",
    "1. Analyze which nurses are the best clinical fit for this specific patient.",
    "2. Consider BOTH clinical match AND workload/availability.",
    "3. Return the top 2 nurse recommendations.",
    "For each recommendation, provide:",
    "- A 2-3 sentence 'reasoning' explaining WHY this nurse is a good fit for THIS patient. Reference specific skills, certifications, or experience that match the patient's needs. Also mention their workload.",
    "- A list of 'matchedSkills' — the specific competencies from the nurse's profile that are relevant to this patient.",
    "Be specific. Do not give generic answers. Tie the reasoning to the patient's actual tags and conditions.",
    "Return STRICT JSON matching the provided schema."
  ].join(" ");

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      recommendations: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            nurseId: { type: "string" },
            nurseName: { type: "string" },
            reasoning: { type: "string" },
            matchedSkills: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 5 },
          },
          required: ["nurseId", "nurseName", "reasoning", "matchedSkills"],
        },
        minItems: 2,
        maxItems: 2,
      },
    },
    required: ["recommendations"],
  };

  const response = await openai.responses.create({
    model,
    input: [
      { role: "system", content: systemPrompt },
      { role: "user", content: JSON.stringify({ patient: patientContext, candidates }, null, 2) },
    ],
    text: { format: { type: "json_schema", name: "nurse_recommendations", schema, strict: true } },
  });

  const result = JSON.parse(response.output_text);
  return result.recommendations;
}

// Keyword-based mock — scans shift notes for terms like O2, pain, CT and builds a basic handoff package.

function generateMockAI({ patient, fields, note, missingRequired }) {
  const lower = (note || "").toLowerCase();

  const watchouts = [];
  if (lower.includes("o2") || lower.includes("oxygen")) watchouts.push("Monitor oxygen saturation with ambulation — desats may indicate worsening respiratory status.");
  if (lower.includes("pain")) watchouts.push("Reassess pain within 60 min of PRN administration and document effectiveness.");
  if (lower.includes("pending") || lower.includes("await")) watchouts.push("Follow up on pending results before discharge decisions — escalate if not back by 0200.");
  if (lower.includes("fall") || patient.tags.includes("FALL")) watchouts.push("Fall precautions active — ensure bed alarm is on and call light within reach.");
  if (lower.includes("iv")) watchouts.push("Monitor IV site for signs of infiltration or phlebitis.");

  const tasks = [];
  if (lower.includes("ct")) tasks.push({ text: "Follow up CT result and notify MD of findings", priority: "high" });
  if (lower.includes("cbc") || lower.includes("lab")) tasks.push({ text: "Check CBC/BMP when available and trend against prior values", priority: "medium" });
  if (lower.includes("iv")) tasks.push({ text: "Assess IV site patency and evaluate need for continued access", priority: "low" });
  if (lower.includes("pain")) tasks.push({ text: "Reassess pain score after next PRN dose", priority: "high" });
  if (tasks.length === 0) tasks.push({ text: "Review chart for pending labs/imaging and flag any overdue results", priority: "medium" });

  const questions = [];
  if (missingRequired.includes("codeStatus")) questions.push("Can you confirm code status — has the goals-of-care conversation happened?");
  if (missingRequired.includes("allergies")) questions.push("Any known allergies or adverse drug reactions I should know about?");
  if (lower.includes("pending")) questions.push("Which results are still pending and what's the expected turnaround?");
  questions.push("What are you most worried about for this patient overnight?");
  questions.push("What are the top 1-2 tasks you'd want me to tackle first?");

  const severity = fields.illnessSeverity || "not specified";
  const summaryBullets = [
    `${patient.name}, age ${patient.age}, room ${patient.room}. Current acuity: ${severity}.`,
    fields.oneLiner ? `Context: ${fields.oneLiner}` : "No one-liner context provided by outgoing nurse.",
    `Key updates: ${note?.trim() ? note.trim() : "No free-text shift notes provided."}`,
    `Safety profile: allergies=${fields.allergies || "\u26a0 missing"}, code status=${fields.codeStatus || "\u26a0 missing"}, isolation=${fields.isolation || "\u26a0 missing"}, fall risk=${fields.fallRisk || "\u26a0 missing"}.`
  ];

  return {
    sbar: {
      situation: summaryBullets[0],
      background: fields.oneLiner || "Background not specified.",
      assessment: `Acuity: ${severity}. ${watchouts.length > 0 ? watchouts[0] : "No acute concerns."}`,
      recommendation: "Next shift: complete any missing required fields, execute task list, monitor watchouts, close loop on pending items."
    },
    summaryBullets,
    watchouts: watchouts.length ? watchouts : ["No specific watchouts inferred from shift note."],
    missingRequired,
    askBackQuestions: questions,
    tasks
  };
}

// OpenAI client — null if no API key, everything still works with mocks.
const openai = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

// Sends patient record, fields, and notes to OpenAI with a strict JSON schema. OpenAI sends back sbar, summaryBullets, watchouts, tasks, askBackQuestions, and missingRequired.
async function generateWithLLM({ patient, fields, note, missingRequired }) {
  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";
  const instructions = [
    "You are a nursing shift-handoff assistant (documentation aid).",
    "Focus on summarization, safety/completeness, tasks, and watchouts. DO NOT diagnose or suggest treatments.",
    "Use ONLY the provided input. Do not invent vitals, labs, meds, or diagnoses.",
    "Treat patient info as de-identified; do not add any new identifiers.",
    "Keep language concise and handoff-friendly.",
    "Return STRICT JSON that matches the provided schema."
  ].join(" ");

  const schema = {
    type: "object", additionalProperties: false,
    properties: {
      sbar: {
        type: "object", additionalProperties: false,
        properties: { situation: { type: "string" }, background: { type: "string" }, assessment: { type: "string" }, recommendation: { type: "string" } },
        required: ["situation", "background", "assessment", "recommendation"]
      },
      summaryBullets: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 8 },
      watchouts: { type: "array", items: { type: "string" }, minItems: 1, maxItems: 6 },
      missingRequired: { type: "array", items: { type: "string", enum: ["allergies", "codeStatus", "isolation", "fallRisk"] } },
      askBackQuestions: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 8 },
      tasks: {
        type: "array",
        items: {
          type: "object", additionalProperties: false,
          properties: { text: { type: "string" }, priority: { type: "string", enum: ["high", "medium", "low"] } },
          required: ["text", "priority"]
        },
        minItems: 1, maxItems: 8
      }
    },
    required: ["sbar", "summaryBullets", "watchouts", "missingRequired", "askBackQuestions", "tasks"]
  };

  const response = await openai.responses.create({
    model,
    input: [
      { role: "system", content: instructions },
      { role: "user", content: JSON.stringify({ patient: { id: patient.id, name: patient.name, room: patient.room, tags: patient.tags, age: patient.age }, fields, note, missingRequired, requiredKeys: REQUIRED }, null, 2) }
    ],
    text: { format: { type: "json_schema", name: "handoff_output", schema, strict: true } }
  });
  return JSON.parse(response.output_text);
}

// ── Routes — each one handles a fetch call from App.jsx ──

app.get("/api/health", (req, res) => res.json({ status: "ok", llm: Boolean(openai) }));

// Frontend asks for all nurses. Sends back their profiles with specialties, certs, strengths, and bios.
app.get("/api/nurses", (req, res) => {
  res.json({
    nurses: nurses.map(n => ({
      id: n.id, name: n.name, role: n.role, unit: n.unit,
      yearsExp: n.yearsExp, specialties: n.specialties,
      certifications: n.certifications, strengths: n.strengths, bio: n.bio,
    }))
  });
});

// Frontend asks for the patient list. Sends back all patients.
app.get("/api/patients", (req, res) => res.json({ patients }));

// Frontend asks for schedules. Sends back each nurse's weekly schedule and availability snapshot.
app.get("/api/schedules", (req, res) => {
  const result = nurses.map(n => ({
    id: n.id, name: n.name, role: n.role, yearsExp: n.yearsExp,
    specialties: n.specialties, certifications: n.certifications,
    schedule: nurseSchedules[n.id].map(s => ({ ...s, startFormatted: formatTime(s.start), endFormatted: formatTime(s.end) })),
    availability: getAvailability(n.id),
  }));
  res.json({ nurses: result });
});

// Frontend asks for recommended nurses for a patient. Runs the LLM (or mock fallback) and sends back the top 2 with reasoning and matched skills.
app.get("/api/schedules/recommended/:excludeNurseId", async (req, res) => {
  const patientId = req.query.patientId || null;
  const patient = patients.find(p => p.id === patientId) || null;

  try {
    let recs;
    if (openai && patient) {
      // Let the AI analyze nurse profiles against this specific patient
      recs = await llmRecommendations(req.params.excludeNurseId, patient);
    } else {
      // Fallback: workload-based heuristic
      recs = mockRecommendations(req.params.excludeNurseId, patient);
    }

    // Enrich with schedule/availability data for the frontend
    const enriched = recs.map(rec => {
      const nurse = nurses.find(n => n.id === rec.nurseId);
      if (!nurse) return rec;
      return {
        ...nurse,
        schedule: nurseSchedules[nurse.id].map(s => ({
          ...s, startFormatted: formatTime(s.start), endFormatted: formatTime(s.end)
        })),
        availability: getAvailability(nurse.id),
        reasoning: rec.reasoning,
        matchedSkills: rec.matchedSkills,
      };
    });

    res.json({
      recommended: enriched,
      meta: { usedLLM: Boolean(openai && patient) },
    });
  } catch (err) {
    console.error("Recommendation LLM error:", err?.message || err);
    // Fall back to mock on error
    const recs = mockRecommendations(req.params.excludeNurseId, patient);
    const enriched = recs.map(rec => {
      const nurse = nurses.find(n => n.id === rec.nurseId);
      if (!nurse) return rec;
      return { ...nurse, availability: getAvailability(nurse.id), reasoning: rec.reasoning, matchedSkills: rec.matchedSkills };
    });
    res.json({ recommended: enriched, meta: { usedLLM: false, fallback: true } });
  }
});

// Frontend sends updated vitals or age. Merges them into the patient record and sends back the updated patient.
app.patch("/api/patients/:id", (req, res) => {
  const patient = patients.find(p => p.id === req.params.id);
  if (!patient) return res.status(404).json({ error: "Patient not found" });
  const { age, vitals, tags, status, assignedTo } = req.body;
  if (age !== undefined) patient.age = age;
  if (vitals) patient.vitals = { ...patient.vitals, ...vitals };
  if (tags) patient.tags = tags;
  if (status) patient.status = status;
  if (assignedTo) patient.assignedTo = assignedTo;
  res.json({ patient });
});

// Frontend sends patientId, form fields, and shift notes. Merges with the patient record, runs the LLM (or mock), and sends back the structured AI output.
app.post("/api/handoff/generate", async (req, res) => {
  const { patientId, fields, note } = req.body || {};
  const patient = patients.find(p => p.id === patientId);
  if (!patient) return res.status(404).json({ error: "Patient not found" });
  const missingRequired = computeMissing(fields);
  try {
    const output = openai
      ? await generateWithLLM({ patient, fields, note, missingRequired })
      : generateMockAI({ patient, fields, note, missingRequired });
    res.json({ patient, output, meta: { usedLLM: Boolean(openai), model: process.env.OPENAI_MODEL || "gpt-4.1-mini" } });
  } catch (err) {
    console.error("LLM error:", err?.message || err);
    const output = generateMockAI({ patient, fields, note, missingRequired });
    res.status(200).json({ patient, output, meta: { usedLLM: false, fallback: true } });
  }
});

// Frontend sends the full handoff package. Creates a handoff record, marks the patient as handed-off, and sends back the record.
app.post("/api/handoff/submit", (req, res) => {
  const { fromNurseId, toNurseId, patientId, fields, note, vitals, aiOutput } = req.body;
  const fromNurse = nurses.find(n => n.id === fromNurseId);
  const toNurse = nurses.find(n => n.id === toNurseId);
  const patient = patients.find(p => p.id === patientId);
  if (!fromNurse || !toNurse || !patient) return res.status(400).json({ error: "Invalid IDs" });

  const handoff = {
    id: `h${handoffIdCounter++}`,
    fromNurse: { id: fromNurse.id, name: fromNurse.name },
    toNurse: { id: toNurse.id, name: toNurse.name },
    patient: { id: patient.id, name: patient.name, room: patient.room, age: patient.age, tags: [...patient.tags] },
    fields: { ...fields }, vitals: vitals || { ...patient.vitals },
    note, aiOutput,
    timestamp: new Date().toISOString(),
    status: "pending", incomingNotes: "", redirectHistory: [],
  };
  handoffs.push(handoff);
  patient.status = "handed-off";
  res.json({ handoff });
});

// Frontend asks for this nurse's inbox. Sends back all handoffs addressed to them.
app.get("/api/handoffs/inbox/:nurseId", (req, res) => {
  res.json({ handoffs: handoffs.filter(h => h.toNurse.id === req.params.nurseId) });
});

// Frontend says the nurse accepts this handoff. Marks it acknowledged, transfers the patient to their active list, and sends back the updated handoff.
app.post("/api/handoff/acknowledge", (req, res) => {
  const { handoffId, incomingNotes } = req.body;
  const handoff = handoffs.find(h => h.id === handoffId);
  if (!handoff) return res.status(404).json({ error: "Handoff not found" });
  handoff.status = "acknowledged";
  handoff.incomingNotes = incomingNotes || "";
  handoff.acknowledgedAt = new Date().toISOString();
  const patient = patients.find(p => p.id === handoff.patient.id);
  if (patient) { patient.status = "active"; patient.assignedTo = handoff.toNurse.id; }
  res.json({ handoff });
});

// Frontend says the nurse can't accept — redirect to someone else. Logs the redirect in the history trail and moves the handoff to the new nurse's inbox.
app.post("/api/handoff/redirect", (req, res) => {
  const { handoffId, newNurseId, reason } = req.body;
  const handoff = handoffs.find(h => h.id === handoffId);
  if (!handoff) return res.status(404).json({ error: "Handoff not found" });
  if (handoff.status === "acknowledged") return res.status(400).json({ error: "Already acknowledged" });
  const newNurse = nurses.find(n => n.id === newNurseId);
  if (!newNurse) return res.status(400).json({ error: "Invalid nurse" });
  handoff.redirectHistory.push({
    from: { ...handoff.toNurse }, to: { id: newNurse.id, name: newNurse.name },
    reason: reason || "", timestamp: new Date().toISOString(),
  });
  handoff.toNurse = { id: newNurse.id, name: newNurse.name };
  res.json({ handoff });
});

// Frontend asks for this patient's handoff history. Sends back all past handoffs sorted by time.
app.get("/api/handoffs/history/:patientId", (req, res) => {
  const history = handoffs.filter(h => h.patient.id === req.params.patientId)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  res.json({ history });
});

// Frontend sends the discharge checklist. Validates all 5 items are checked — if yes, marks the patient discharged; if no, rejects with 400.
app.post("/api/patients/:id/discharge", (req, res) => {
  const patient = patients.find(p => p.id === req.params.id);
  if (!patient) return res.status(404).json({ error: "Patient not found" });
  const { nurseId, checklist, dischargeNotes } = req.body;
  const nurse = nurses.find(n => n.id === nurseId);
  if (!nurse) return res.status(400).json({ error: "Invalid nurse" });
  const requiredChecks = ["avsReviewed", "medsExplained", "followUpScheduled", "equipmentArranged", "safeTransport"];
  const incomplete = requiredChecks.filter(c => !checklist?.[c]);
  if (incomplete.length > 0) return res.status(400).json({ error: "Incomplete", incomplete });
  patient.status = "discharged";
  res.json({ discharge: { patient: { id: patient.id, name: patient.name }, nurse: { id: nurse.id, name: nurse.name }, timestamp: new Date().toISOString() } });
});

const PORT = process.env.PORT || 5179;
app.listen(PORT, () => {
  console.log(`Handoff Copilot server running on http://localhost:${PORT}`);
  console.log(openai ? "LLM: enabled — recommendations will use AI analysis" : "LLM: disabled — recommendations use workload heuristic (set OPENAI_API_KEY for AI analysis)");
  console.log("Nurse schedules randomized for this session.");
});