import { Circle, Loader2, CheckCircle2 } from "lucide-react";
// ===== supabaseClient.js =====
import { createClient } from "@supabase/supabase-js";

// Clé publique (anon) : sans danger à exposer côté client, c'est fait pour ça.
// Toute la protection réelle des données vit dans les policies RLS côté base de données.
const SUPABASE_URL = "https://sltpkubsuxzpatzhrzco.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsdHBrdWJzdXh6cGF0emhyemNvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQzNTAxMjUsImV4cCI6MjA5OTkyNjEyNX0.EvWBmmuSuZC7hFqQVh1OIxi3evp0D45aNX9zfZVTMck";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// L'app fait se connecter les gens avec un numéro de téléphone, mais Supabase Auth
// (sans fournisseur SMS payant configuré) fonctionne nativement en email + mot de passe.
// On fabrique donc une adresse "email" synthétique à partir du numéro, jamais affichée
// ni utilisée pour envoyer de vrais emails.
export function emailForPhone(phone) {
  const clean = String(phone).replace(/\s+/g, "");
  return `${clean}@k9apexsuit.internal`;
}

export const EDGE_FUNCTION_URL =
  "https://sltpkubsuxzpatzhrzco.supabase.co/functions/v1/create-educateur";

// ===== helpers.js =====

export const C = {
  paper: "#EFE9DC",
  paperDark: "#E2D9C3",
  card: "#F7F4EA",
  ink: "#221F1A",
  inkSoft: "#5C574C",
  forest: "#1F3A2E",
  forestLight: "#2E5641",
  orange: "#E8632C",
  clay: "#C9A26A",
  moss: "#5B7B4F",
  amber: "#C98A2C",
  red: "#B5473A",
  line: "#D8CDB0",
};

export const PROOF_THRESHOLD = 120; // mètres

export function distanceMeters(a, b) {
  if (!a || !b) return null;
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

export function sessionDurationMinutes(session) {
  if (!session.checkin_time || !session.checkout_time) return null;
  const toMin = (t) => {
    const [h, m] = t.split(":").map(Number);
    return h * 60 + m;
  };
  return toMin(session.checkout_time) - toMin(session.checkin_time);
}

export function formatDuration(minutes) {
  if (minutes == null) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h > 0 ? `${h}h${m > 0 ? ` ${String(m).padStart(2, "0")}` : ""}` : `${m} min`;
}

export function monthsSince(dateStr) {
  if (!dateStr) return 0;
  const start = new Date(dateStr);
  const now = new Date();
  return Math.max(0, (now.getFullYear() - start.getFullYear()) * 12 + (now.getMonth() - start.getMonth()));
}

export function daysBetween(a, b) {
  if (!a || !b) return 0;
  const d1 = new Date(a + "T00:00:00");
  const d2 = new Date(b + "T00:00:00");
  return Math.max(0, Math.round((d2 - d1) / 86400000));
}

export function computeObjectif(exercises) {
  const total = exercises.length;
  const acquis = exercises.filter((e) => e.status === "acquis").length;
  const pct = total > 0 ? Math.round((acquis / total) * 100) : 0;
  const atteint = total > 0 && acquis === total;
  return { total, acquis, pct, atteint };
}

export function shortDateLabel(dateStr, todayStr) {
  const d = new Date(dateStr + "T00:00:00");
  const wd = d.toLocaleDateString("fr-FR", { weekday: "short" });
  const dm = d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
  const label = `${wd.charAt(0).toUpperCase()}${wd.slice(1)} ${dm}`;
  return dateStr === todayStr ? `${label} (aujourd'hui)` : label;
}

export function weekdayLabel(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  const label = d.toLocaleDateString("fr-FR", { weekday: "long" });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export const STATUS_META = {
  non_acquis: { label: "Non acquis", color: C.red, icon: Circle },
  en_cours: { label: "En cours", color: C.amber, icon: Loader2 },
  acquis: { label: "Acquis", color: C.moss, icon: CheckCircle2 },
};

export const SESSION_STATUS_META = {
  a_venir: { label: "À venir", color: C.clay },
  en_cours: { label: "En cours", color: C.orange },
  terminee: { label: "Terminée", color: C.forest },
};

export const DAYS = [
  { key: "lun", label: "L" },
  { key: "mar", label: "Ma" },
  { key: "mer", label: "Me" },
  { key: "jeu", label: "J" },
  { key: "ven", label: "V" },
  { key: "sam", label: "S" },
  { key: "dim", label: "D" },
];

export function cycleStatus(s) {
  if (s === "non_acquis") return "en_cours";
  if (s === "en_cours") return "acquis";
  return "non_acquis";
}

// ===== api.js =====

// ---------- AUTH ----------

export async function signUpChef({ orgName, chefName, phone, password }) {
  const cleanPhone = String(phone).replace(/\s+/g, "");
  const email = emailForPhone(cleanPhone);

  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({ email, password });
  if (signUpError) {
    if (signUpError.message?.toLowerCase().includes("already registered")) {
      throw new Error("Ce numéro est déjà associé à un compte.");
    }
    throw signUpError;
  }
  if (!signUpData.session) {
    // Confirm email est probablement encore active cote Supabase Auth.
    throw new Error(
      "Le compte est cree mais la connexion automatique a echoue : desactivez Confirm email dans Supabase (Authentication > Providers > Email), puis reconnectez-vous."
    );
  }

  const userId = signUpData.user.id;

  const { data: org, error: orgError } = await supabase
    .from("organizations")
    .insert({ name: orgName, chef_name: chefName, chef_auth_id: userId, chef_phone: cleanPhone })
