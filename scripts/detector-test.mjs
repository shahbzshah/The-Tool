import { detectDecisions, valueAgreesWithLock } from "../src/lib/decisions.ts";

const LOCK = {
  database: "Supabase (PostgreSQL)",
  frontend: "React Native + Expo",
  backend: "Supabase",
  auth: "Email + password (JWT)",
  speech: "Cloud STT/TTS (Google Cloud)",
  sync: "Offline-first with outbox + last-write-wins",
  hosting: "EAS",
};
let fails = 0;
const check = (name, cond) => { console.log((cond ? "PASS" : "FAIL") + " " + name); if (!cond) fails++; };
const vals = (docs, key) => detectDecisions(docs, LOCK).find(d => d.key === key)?.values ?? [];
const hasConflict = (docs, key) => detectDecisions(docs, LOCK).find(d => d.key === key)?.conflict ?? false;

// 1. TECHNICAL_SPEC override bullet — Firebase/AWS must NOT count
const techSpec = [{ kind: "TECHNICAL_SPEC", content: `The Stitch design mentions "Firebase/AWS" for backup, but the **LOCKED TECH STACK** mandates **Supabase**. Supabase (Postgres) will be the canonical cloud backup provider.` }];
check("1a override bullet: backend has no Firebase", !vals(techSpec, "backend").includes("Firebase"));
check("1b override bullet: backend has Supabase", vals(techSpec, "backend").includes("Supabase"));
check("1c override bullet: no backend conflict", !hasConflict(techSpec, "backend"));

// 2. ARCHITECTURE speech lines — Google Cloud must NOT count as hosting
const arch = [{ kind: "ARCHITECTURE", content: `- **Speech Services:** Google Cloud STT/TTS\n2. Audio is captured and sent to **Google Cloud STT**.\n- **Google Cloud:** Provides the speech-to-text (STT) and text-to-speech (TTS) engines for hands-free journaling.\n|-- [ Google Cloud (STT/TTS) ]` }];
check("2a speech lines: hosting has no Google Cloud", !vals(arch, "hosting").includes("Google Cloud"));
check("2b speech lines: speech has Google Cloud", vals(arch, "speech").includes("Cloud STT/TTS (Google Cloud)"));
check("2c speech lines: no hosting conflict", !hasConflict(arch, "hosting"));

// 3. UI transcription — Firebase/AWS MUST still count (no override on the line)
const ui = [{ kind: "UI", content: `- **Cloud Vault Section**: AWS S3 + Firebase status, AES-256 GCM encryption confirmation, and "Last automated backup" timestamp.\n| Automatic background sync (Firebase/AWS) | Data Management & Sync Settings | ✅ |` }];
check("3a transcription: backend still has Firebase", vals(ui, "backend").includes("Firebase"));
check("3b transcription: hosting still has AWS", vals(ui, "hosting").includes("AWS"));
check("3c transcription: backend conflict true", hasConflict(ui, "backend"));

// 4. TECHNICAL_SPEC speech table row
const row = [{ kind: "TECHNICAL_SPEC", content: `| **Google Cloud STT/TTS** | Voice Journaling | Cloud-based speech-to-text for rapid psychology logging. |` }];
check("4a speech row: hosting has no Google Cloud", !vals(row, "hosting").includes("Google Cloud"));
check("4b speech row: speech has Google Cloud", vals(row, "speech").includes("Cloud STT/TTS (Google Cloud)"));

// 5. "Rendering" is not the host Render
const rendering = [{ kind: "TECHNICAL_SPEC", content: `| **Chart.js / MPAndroidChart** | Visualizations | Rendering equity curves and PnL distributions. |` }];
check("5 rendering word: hosting has no Render", !vals(rendering, "hosting").includes("Render"));

// 6. Genuine disagreement still flags
const stale = [{ kind: "RULES", content: `Backend: Firebase.\nHosting: deployed on Render.` }];
check("6a stale claim: backend has Firebase", vals(stale, "backend").includes("Firebase"));
check("6b stale claim: hosting has Render", vals(stale, "hosting").includes("Render"));
check("6c stale claim: backend conflict true", hasConflict(stale, "backend"));
check("6d stale claim: hosting conflict true", hasConflict(stale, "hosting"));

// 7. Layer/alias agreement
check("7a SQLite agrees with Supabase lock", valueAgreesWithLock("database", "SQLite", "Supabase (PostgreSQL)"));
check("7b React agrees with React Native lock", valueAgreesWithLock("frontend", "React", "React Native + Expo"));
check("7c Express agrees with Supabase lock", valueAgreesWithLock("backend", "Node.js + Express", "Supabase"));
check("7d unspecified speech agrees with Google lock", valueAgreesWithLock("speech", "Cloud STT/TTS (unspecified provider)", "Cloud STT/TTS (Google Cloud)"));
check("7e Firebase disagrees with Supabase lock", !valueAgreesWithLock("backend", "Firebase", "Supabase"));
check("7f Next.js disagrees with React Native lock", !valueAgreesWithLock("frontend", "Next.js", "React Native + Expo"));

// 8. "Design label still says" note — quoted label text, not a claim
const note = [{ kind: "UI", content: `- **Cloud Vault**: Backup status (Supabase — the design label still says AWS S3 + Firebase) with last backup timestamp.` }];
check("8a design-label note: backend has no Firebase", !vals(note, "backend").includes("Firebase"));
check("8b design-label note: hosting has no AWS", !vals(note, "hosting").includes("AWS"));
check("8c design-label note: backend has Supabase", vals(note, "backend").includes("Supabase"));
check("8d design-label note: no backend conflict", !hasConflict(note, "backend"));
check("8e design-label note: no hosting conflict", !hasConflict(note, "hosting"));
// 8f. Same names WITHOUT the note still flag (the original transcription)
const plain = [{ kind: "UI", content: `- **Cloud Vault**: Backup status (AWS S3 + Firebase) with last backup timestamp.` }];
check("8f bare transcription: backend still has Firebase", vals(plain, "backend").includes("Firebase"));
check("8g bare transcription: hosting still has AWS", vals(plain, "hosting").includes("AWS"));

console.log(fails === 0 ? "ALL PASS" : fails + " FAILURES");
process.exit(fails === 0 ? 0 : 1);
