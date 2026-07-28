import { Circle, Loader2, CheckCircle2 } from "lucide-react";
// ===== supabaseClient.js =====
import { createClient } from "@supabase/supabase-js";

// Cle publique (anon) : sans danger a exposer cote client, c'est fait pour ca.
// Toute la protection reelle des donnees vit dans les policies RLS cote base de donnees.
const SUPABASE_URL = "https://sltpkubsuxzpatzhrzco.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsdHBrdWJzdXh6cGF0emhyemNvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQzNTAxMjUsImV4cCI6MjA5OTkyNjEyNX0.EvWBmmuSuZC7hFqQVh1OIxi3evp0D45aNX9zfZVTMck";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// L'app fait se connecter les gens avec un numero de telephone, mais Supabase Auth
// (sans fournisseur SMS payant configure) fonctionne nativement en email + mot de passe.
// On fabrique donc une adresse "email" synthetique a partir du numero, jamais affichee
// ni utilisee pour envoyer de vrais emails.
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

export const PROOF_THRESHOLD = 120; // metres

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
  if (minutes == null) return "-";
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
  a_venir: { label: "A venir", color: C.clay },
  en_cours: { label: "En cours", color: C.orange },
  terminee: { label: "Terminee", color: C.forest },
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
      throw new Error("Ce numero est deja associe a un compte.");
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
    .select("id, name")
    .single();
  if (orgError) throw orgError;

  const { error: edError } = await supabase.from("educateurs").insert({
    id: userId,
    organization_id: org.id,
    name: chefName,
    phone: cleanPhone,
    role: "Fondateur",
  });
  if (edError) throw edError;

  return { orgId: org.id, userId };
}

export async function signIn(phone, password) {
  const email = emailForPhone(phone);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error("Numero ou mot de passe incorrect.");
  return data;
}

export async function signOut() {
  await supabase.auth.signOut();
}

export async function getCurrentSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

// Determine whether the logged-in user is a chef (has an organizations row) or an educateur.
// Utilise les fonctions RPC (is_chef / current_org_id) plutot qu'une lecture directe de
// organizations.chef_auth_id, dont la lecture est volontairement restreinte cote base de donnees.
export async function resolveIdentity(userId) {
  const { data: isChef, error: chefErr } = await supabase.rpc("is_chef");
  if (chefErr) throw chefErr;

  const { data: orgId, error: orgIdErr } = await supabase.rpc("current_org_id");
  if (orgIdErr) throw orgIdErr;
  if (!orgId) throw new Error("Compte introuvable.");

  const { data: org, error: orgErr } = await supabase.from("organizations").select("id, name").eq("id", orgId).single();
  if (orgErr) throw orgErr;

  const { data: selfEd, error: selfErr } = await supabase.from("educateurs").select("id, name").eq("id", userId).single();
  if (selfErr) throw selfErr;

  if (isChef) {
    return { type: "chef", accountId: org.id, selfEducatorId: selfEd.id, name: selfEd.name, orgName: org.name };
  }
  return { type: "educateur", accountId: org.id, educatorId: selfEd.id, name: selfEd.name, orgName: org.name };
}

// ---------- ORGANIZATION ----------

export async function fetchOrgName(orgId) {
  const { data, error } = await supabase.from("organizations").select("id, name").eq("id", orgId).single();
  if (error) throw error;
  return data;
}

// Full row (chef_phone, subscription...) - chef only, enforced server-side by the RPC itself.
export async function fetchMyOrgFull() {
  const { data, error } = await supabase.rpc("get_my_organization");
  if (error) throw error;
  return data;
}

export async function updateSubscription(orgId, patch) {
  const { error } = await supabase.from("organizations").update(patch).eq("id", orgId);
  if (error) throw error;
}

// ---------- EDUCATEURS ----------

export async function fetchEducateurs(orgId) {
  const { data, error } = await supabase
    .from("educateurs")
    .select("*")
    .eq("organization_id", orgId)
    .order("date_embauche", { ascending: true });
  if (error) throw error;
  return data;
}

export async function createEducateur({ name, phone, password }) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  const res = await fetch(EDGE_FUNCTION_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name, phone: phone.replace(/\s+/g, ""), password }),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Impossible de creer l'educateur.");
  return json;
}

// ---------- ABSENCES ----------

export async function fetchAbsences(orgId) {
  const { data, error } = await supabase.from("absences").select("*").eq("organization_id", orgId);
  if (error) throw error;
  return data;
}

export async function addAbsence({ orgId, educateurId, date, motif }) {
  const { error } = await supabase
    .from("absences")
    .insert({ organization_id: orgId, educateur_id: educateurId, absence_date: date, motif });
  if (error) throw error;
}

// ---------- CLIENTS ----------

export async function fetchClients(orgId) {
  // Vue qui masque le telephone du client si l'appelant n'est pas le chef (voir policies RLS).
  const { data, error } = await supabase.from("clients_for_educateur").select("*").eq("organization_id", orgId);
  if (error) throw error;
  return data;
}

export async function addClient({ orgId, educateurId, form }) {
  const { data, error } = await supabase
    .from("clients")
    .insert({
      organization_id: orgId,
      educateur_id: educateurId,
      owner_name: form.ownerName,
      owner_phone: form.phone.replace(/\s+/g, ""),
      dog_name: form.dogName,
      dog_breed: form.breed || null,
      dog_age: form.age || null,
      address_text: form.address,
      address_lat: form.coord?.lat ?? null,
      address_lng: form.coord?.lng ?? null,
      address_is_real: !!form.real,
      visit_days: form.visitDays || [],
    })
    .select("id")
    .single();
  if (error) throw error;
  return data;
}

export async function updateClientVisitDays(clientId, visitDays) {
  const { error } = await supabase.from("clients").update({ visit_days: visitDays }).eq("id", clientId);
  if (error) throw error;
}

export async function closeContract(clientId) {
  const today = new Date().toISOString().slice(0, 10);
  const { error } = await supabase
    .from("clients")
    .update({ contract_status: "clos", contract_date_fin: today })
    .eq("id", clientId);
  if (error) throw error;
}

// ---------- SESSIONS ----------

export async function fetchSessionsByDateRange(orgId, fromDate, toDate) {
  const { data, error } = await supabase
    .from("sessions")
    .select("*")
    .eq("organization_id", orgId)
    .gte("session_date", fromDate)
    .lte("session_date", toDate);
  if (error) throw error;
  return data;
}

export async function ensureTodaySessionForClient({ orgId, client, todayKeyFr }) {
  const today = new Date().toISOString().slice(0, 10);
  const { data: existing } = await supabase
    .from("sessions")
    .select("id")
    .eq("client_id", client.id)
    .eq("session_date", today)
    .maybeSingle();
  if (existing) return existing.id;
  if (!client.visit_days?.includes(todayKeyFr)) return null;

  const { data, error } = await supabase
    .from("sessions")
    .insert({
      organization_id: orgId,
      client_id: client.id,
      educateur_id: client.educateur_id,
      session_date: today,
      status: "a_venir",
    })
    .select()
    .single();
  if (error) throw error;
  return data.id;
}

export async function pointSession(sessionId, type, point) {
  const patch =
    type === "checkin"
      ? {
          status: "en_cours",
          check_in_time: new Date().toISOString(),
          check_in_lat: point.lat,
          check_in_lng: point.lng,
          check_in_accuracy: point.accuracy ?? null,
          check_in_is_real: !!point.real,
        }
      : {
          check_out_time: new Date().toISOString(),
          check_out_lat: point.lat,
          check_out_lng: point.lng,
          check_out_accuracy: point.accuracy ?? null,
          check_out_is_real: !!point.real,
        };
  const { error } = await supabase.from("sessions").update(patch).eq("id", sessionId);
  if (error) throw error;
}

export async function updateSessionNotes(sessionId, notes) {
  const { error } = await supabase.from("sessions").update({ notes }).eq("id", sessionId);
  if (error) throw error;
}

export async function markReportSent(sessionId, reportStatus) {
  const { error } = await supabase
    .from("sessions")
    .update({ status: "terminee", report_status: reportStatus })
    .eq("id", sessionId);
  if (error) throw error;
}

// ---------- EXERCISES ----------

export async function fetchExercisesForClients(clientIds) {
  if (!clientIds.length) return [];
  const { data, error } = await supabase.from("exercises").select("*").in("client_id", clientIds);
  if (error) throw error;
  return data;
}

export async function addExercise({ orgId, clientId, label }) {
  const { data, error } = await supabase
    .from("exercises")
    .insert({ organization_id: orgId, client_id: clientId, label, status: "non_acquis" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateExerciseStatus(exerciseId, status) {
  const today = new Date().toISOString().slice(0, 10);
  const { error } = await supabase
    .from("exercises")
    .update({ status, date_acquis: status === "acquis" ? today : null })
    .eq("id", exerciseId);
  if (error) throw error;
}

export async function deleteExercise(exerciseId) {
  const { error } = await supabase.from("exercises").delete().eq("id", exerciseId);
  if (error) throw error;
}
