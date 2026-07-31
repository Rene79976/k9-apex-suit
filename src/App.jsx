import React, { useEffect, useState } from "react";
import {
  MapPin, Clock, CheckCircle2, Circle, Loader2, Send, ChevronLeft,
  Calendar, X, Plus, ShieldCheck, Trash2, Users, UserCog, Briefcase,
  LogOut, Lock, Phone, AlertTriangle,
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer } from "recharts";
import { supabase } from "./backend";
import * as api from "./backend";
import {
  C, STATUS_META, SESSION_STATUS_META, DAYS, PROOF_THRESHOLD,
  distanceMeters, formatDuration, monthsSince, daysBetween, computeObjectif,
  shortDateLabel, weekdayLabel, todayISO, cycleStatus,
} from "./backend";

const FR_DAY_KEYS = ["dim", "lun", "mar", "mer", "jeu", "ven", "sam"]; // JS getDay(): 0=dimanche

function rangeDates(days) {
  const out = [];
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export default function App() {
  const [booting, setBooting] = useState(true);
  const [identity, setIdentity] = useState(null); // { type, accountId, selfEducatorId?, educatorId?, name, orgName }
  const [authError, setAuthError] = useState("");

  const [role, setRole] = useState("educateur");
  const [loadingData, setLoadingData] = useState(false);
  const [dataError, setDataError] = useState("");

  const [educateurs, setEducateurs] = useState([]);
  const [clients, setClients] = useState([]);
  const [sessions, setSessions] = useState([]); // 31 derniers jours
  const [exercises, setExercises] = useState([]);
  const [absences, setAbsences] = useState([]);

  const [selectedEducatorId, setSelectedEducatorId] = useState(null);
  const [selectedClientId, setSelectedClientId] = useState(null);
  const [locating, setLocating] = useState(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [stampVisible, setStampVisible] = useState(false);
  const [addClientOpen, setAddClientOpen] = useState(false);
  const [addEducatorOpen, setAddEducatorOpen] = useState(false);
  const [closeContractOpen, setCloseContractOpen] = useState(false);
  const [addAbsenceOpen, setAddAbsenceOpen] = useState(false);
  const [subscriptionOpen, setSubscriptionOpen] = useState(false);
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [orgFull, setOrgFull] = useState(null);

  const isChef = role === "chef";
  const myEducatorId = identity?.type === "chef" ? identity.selfEducatorId : identity?.educatorId;
  const viewingEducatorId = isChef ? selectedEducatorId : myEducatorId;
  const today = todayISO();

  // ---------- Bootstrap session ----------
  useEffect(() => {
    let mounted = true;
    (async () => {
      const session = await api.getCurrentSession();
      if (session) await loadIdentity(session.user.id);
      if (mounted) setBooting(false);
    })();
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setIdentity(null);
      }
    });
    return () => { mounted = false; sub.subscription.unsubscribe(); };
  }, []);

  async function loadIdentity(userId) {
    const idn = await api.resolveIdentity(userId);
    setIdentity(idn);
    setRole(idn.type === "chef" ? "chef" : "educateur");
  }

  async function loadOrgData(orgId) {
    setLoadingData(true);
    setDataError("");
    try {
      const [educateursData, clientsData] = await Promise.all([
        api.fetchEducateurs(orgId),
        api.fetchClients(orgId),
      ]);
      const todayKeyFr = FR_DAY_KEYS[new Date().getDay()];
      const active = clientsData.filter((c) => c.contract_status !== "clos");
      await Promise.all(active.map((c) => api.ensureTodaySessionForClient({ orgId, client: c, todayKeyFr })));

      const dates = rangeDates(31);
      const [sessionsData, exercisesData, absencesData] = await Promise.all([
        api.fetchSessionsByDateRange(orgId, dates[dates.length - 1], dates[0]),
        api.fetchExercisesForClients(clientsData.map((c) => c.id)),
        api.fetchAbsences(orgId),
      ]);

      setEducateurs(educateursData);
      setClients(clientsData);
      setSessions(sessionsData);
      setExercises(exercisesData);
      setAbsences(absencesData);
    } catch (e) {
      setDataError(e.message || String(e));
    } finally {
      setLoadingData(false);
    }
  }

  useEffect(() => {
    if (identity?.accountId) loadOrgData(identity.accountId);
  }, [identity?.accountId]);

  // ---------- Auth actions ----------
  async function handleLogin(phone, password) {
    setAuthError("");
    try {
      const data = await api.signIn(phone, password);
      await loadIdentity(data.user.id);
      return true;
    } catch (e) {
      setAuthError(e.message || String(e));
      return false;
    }
  }

  async function handleSignup(form) {
    try {
      const { userId } = await api.signUpChef(form);
      await loadIdentity(userId);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message || String(e) };
    }
  }

  async function handleLogout() {
    await api.signOut();
    setIdentity(null);
    setRole("educateur");
    setSelectedEducatorId(null);
    setSelectedClientId(null);
    setEducateurs([]); setClients([]); setSessions([]); setExercises([]); setAbsences([]);
  }

  // ---------- Derived ----------
  const selectedClient = clients.find((c) => c.id === selectedClientId) || null;
  const selectedSession = selectedClient
    ? sessions.find((s) => s.client_id === selectedClient.id && s.session_date === today) || null
    : null;
  const selectedExercises = selectedClient ? exercises.filter((e) => e.client_id === selectedClient.id) : [];

  const refreshOrgId = identity?.accountId;

  // ---------- Mutations ----------
  async function addClient(form) {
    try {
      await api.addClient({ orgId: refreshOrgId, educateurId: form.educatorId, form });
      await loadOrgData(refreshOrgId);
      setAddClientOpen(false);
    } catch (e) {
      alert(e.message || String(e));
    }
  }

  async function addEducator(form) {
    try {
      await api.createEducateur(form);
      await loadOrgData(refreshOrgId);
      setAddEducatorOpen(false);
    } catch (e) {
      alert(e.message || String(e));
    }
  }

  async function addAbsence(form) {
    try {
      await api.addAbsence({ orgId: refreshOrgId, educateurId: selectedEducatorId, date: form.date, motif: form.motif });
      await loadOrgData(refreshOrgId);
      setAddAbsenceOpen(false);
    } catch (e) {
      alert(e.message || String(e));
    }
  }

  async function toggleVisitDay(dayKey) {
    if (!selectedClient) return;
    const next = selectedClient.visit_days.includes(dayKey)
      ? selectedClient.visit_days.filter((d) => d !== dayKey)
      : [...selectedClient.visit_days, dayKey];
    await api.updateClientVisitDays(selectedClient.id, next);
    setClients((prev) => prev.map((c) => (c.id === selectedClient.id ? { ...c, visit_days: next } : c)));
  }

  async function toggleExercise(exId) {
    const ex = exercises.find((e) => e.id === exId);
    const newStatus = cycleStatus(ex.status);
    await api.updateExerciseStatus(exId, newStatus);
    const dateAcquis = newStatus === "acquis" ? today : null;
    setExercises((prev) => prev.map((e) => (e.id === exId ? { ...e, status: newStatus, date_acquis: dateAcquis } : e)));
  }

  async function handleAddExercise(label) {
    if (!label.trim() || !selectedClient) return;
    const created = await api.addExercise({ orgId: refreshOrgId, clientId: selectedClient.id, label: label.trim() });
    setExercises((prev) => [...prev, created]);
  }

  async function handleDeleteExercise(exId) {
    await api.deleteExercise(exId);
    setExercises((prev) => prev.filter((e) => e.id !== exId));
  }

  async function handlePoint(type) {
    if (!selectedSession) return;
    setLocating(type);
    const finish = (point) => {
      api.pointSession(selectedSession.id, type, point).then(() => loadOrgData(refreshOrgId));
      setLocating(null);
    };
    if (!navigator.geolocation) {
      finish({ lat: selectedClient.address_lat + (Math.random() - 0.5) * 0.001, lng: selectedClient.address_lng + (Math.random() - 0.5) * 0.001, real: false });
      return;
    }
    const timeout = setTimeout(() => {
      finish({ lat: selectedClient.address_lat + (Math.random() - 0.5) * 0.001, lng: selectedClient.address_lng + (Math.random() - 0.5) * 0.001, real: false });
    }, 3000);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timeout);
        finish({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy, real: true });
      },
      () => {
        clearTimeout(timeout);
        finish({ lat: selectedClient.address_lat + (Math.random() - 0.5) * 0.001, lng: selectedClient.address_lng + (Math.random() - 0.5) * 0.001, real: false });
      },
      { timeout: 3000 }
    );
  }

  async function handleNotesChange(notes) {
    if (!selectedSession) return;
    await api.updateSessionNotes(selectedSession.id, notes);
    setSessions((prev) => prev.map((s) => (s.id === selectedSession.id ? { ...s, notes } : s)));
  }

  function generateReport() {
    setStampVisible(false);
    setReportOpen(true);
    setTimeout(() => setStampVisible(true), 300);
  }

  async function sendReport() {
    if (!selectedSession) return;
    const status = isChef ? "envoye" : "pret_envoi";
    if (isChef) {
      const acquis = selectedExercises.filter((e) => e.status === "acquis").length;
      const total = selectedExercises.length;
      const dureeMin = selectedSession.check_in_time && selectedSession.check_out_time
        ? Math.round((new Date(selectedSession.check_out_time) - new Date(selectedSession.check_in_time)) / 60000)
        : null;
      const distIn = distanceMeters(
        selectedSession.check_in_lat != null ? { lat: selectedSession.check_in_lat, lng: selectedSession.check_in_lng } : null,
        { lat: selectedClient.address_lat, lng: selectedClient.address_lng }
      );
      const text =
        `Rapport de séance — K9 Apex Suit\n` +
        `Chien : ${selectedClient.dog_name}\n` +
        `Date : ${new Date().toLocaleDateString("fr-FR")}\n` +
        `Temps de dressage : ${formatDuration(dureeMin)}\n` +
        (distIn != null ? `Présence géolocalisée à ${distIn} m de l'adresse enregistrée\n` : "") +
        `Exercices acquis : ${acquis}/${total}\n` +
        (selectedSession.notes ? `Notes : ${selectedSession.notes}\n` : "") +
        `Séance validée et géolocalisée.`;
      window.open(`https://wa.me/${selectedClient.owner_phone}?text=${encodeURIComponent(text)}`, "_blank");
    }
    await api.markReportSent(selectedSession.id, status);
    await loadOrgData(refreshOrgId);
    setReportOpen(false);
  }

  async function handleCloseContract() {
    if (!selectedClient) return;
    await api.closeContract(selectedClient.id);
    await loadOrgData(refreshOrgId);
    setCloseContractOpen(false);
  }

  // ---------- Subscription ----------
  async function openSubscription() {
    setSubscriptionOpen(true);
    try {
      const full = await api.fetchMyOrgFull();
      setOrgFull(full);
    } catch (e) {
      setOrgFull(null);
    }
  }

  async function confirmPayment() {
    const todayStr = todayISO();
    const next = new Date();
    next.setMonth(next.getMonth() + 1);
    await api.updateSubscription(refreshOrgId, {
      subscription_status: "actif",
      last_payment_date: todayStr,
      next_billing_date: next.toISOString().slice(0, 10),
    });
    const full = await api.fetchMyOrgFull();
    setOrgFull(full);
    setPayModalOpen(false);
  }

  async function setDemoStatus(status) {
    await api.updateSubscription(refreshOrgId, { subscription_status: status });
    const full = await api.fetchMyOrgFull();
    setOrgFull(full);
  }

  // ---------- Render guards ----------
  if (booting) {
    return <FullScreenMessage text="Chargement…" />;
  }
  if (!identity) {
    return <LoginScreen onLogin={handleLogin} onSignup={handleSignup} externalError={authError} />;
  }

  const subscriptionStatus = orgFull?.subscription_status;
  const contractLocked = isChef && subscriptionStatus === "suspendu";

  return (
    <div style={{ background: C.paper, minHeight: "100vh", fontFamily: "'IBM Plex Sans', sans-serif", color: C.ink }} className="w-full flex justify-center">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');
        .disp { font-family: 'Oswald', sans-serif; letter-spacing: 0.02em; }
        .mono { font-family: 'IBM Plex Mono', monospace; }
        @keyframes stampIn { 0% { transform: scale(2) rotate(-8deg); opacity: 0; } 60% { transform: scale(0.92) rotate(-8deg); opacity: 1; } 100% { transform: scale(1) rotate(-8deg); opacity: 1; } }
        .stamp-anim { animation: stampIn 0.5s ease-out; }
      `}</style>

      <div className="w-full max-w-md min-h-screen" style={{ background: C.paper }}>
        <div style={{ background: C.forest }} className="px-5 pt-6 pb-5 relative overflow-hidden">
          <div style={{ background: C.forestLight, opacity: 0.5 }} className="absolute -right-8 -top-10 w-40 h-40 rounded-full" />
          <div className="flex items-center gap-2 relative">
            <PawPrintIcon />
            <span className="mono text-[10px] tracking-widest" style={{ color: C.clay }}>K9 APEX SUIT</span>
          </div>
          <h1 className="disp text-2xl font-bold text-white leading-none mt-2 relative text-center">{identity.orgName}</h1>

          <div className="flex items-end justify-between mt-3 relative">
            <div>
              <div className="disp text-sm leading-none" style={{ color: C.clay }}>
                {selectedClient
                  ? selectedClient.dog_name
                  : isChef && !selectedEducatorId
                  ? "Mon équipe"
                  : isChef
                  ? educateurs.find((e) => e.id === selectedEducatorId)?.name
                  : "Agenda du jour"}
              </div>
              <div className="mono text-xs mt-1" style={{ color: C.clay }}>
                {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long" })}
                {"  ·  "}
                {isChef ? "Chef d'équipe" : `Éducateur : ${identity.name}`}
              </div>
            </div>
            {selectedClient ? (
              <button onClick={() => setSelectedClientId(null)} className="flex items-center gap-1 text-xs mono px-2 py-1 rounded" style={{ color: C.paper, border: `1px solid ${C.clay}` }}>
                <ChevronLeft size={14} /> Retour
              </button>
            ) : isChef && selectedEducatorId ? (
              <button onClick={() => setSelectedEducatorId(null)} className="flex items-center gap-1 text-xs mono px-2 py-1 rounded" style={{ color: C.paper, border: `1px solid ${C.clay}` }}>
                <ChevronLeft size={14} /> Équipe
              </button>
            ) : (
              <button onClick={handleLogout} className="flex items-center gap-1 text-xs mono px-2 py-1 rounded" style={{ color: C.paper, border: `1px solid ${C.clay}` }}>
                <LogOut size={14} /> Quitter
              </button>
            )}
          </div>

          {!selectedClient && identity.type === "chef" && (
            <div className="flex gap-1.5 mt-4 relative">
              <button
                onClick={() => { setRole("educateur"); setSelectedEducatorId(null); }}
                className="flex-1 flex items-center justify-center gap-1 text-xs py-1.5 rounded-full disp"
                style={{ background: role === "educateur" ? C.orange : "transparent", color: role === "educateur" ? "#fff" : C.clay, border: `1px solid ${C.clay}` }}
              >
                <UserCog size={13} /> Vue éducateur
              </button>
              <button
                onClick={() => { setRole("chef"); setSelectedEducatorId(null); }}
                className="flex-1 flex items-center justify-center gap-1 text-xs py-1.5 rounded-full disp"
                style={{ background: role === "chef" ? C.orange : "transparent", color: role === "chef" ? "#fff" : C.clay, border: `1px solid ${C.clay}` }}
              >
                <Briefcase size={13} /> Chef d'équipe
              </button>
            </div>
          )}
          {!selectedClient && isChef && (
            <button
              onClick={openSubscription}
              className="w-full flex items-center justify-between mt-2 px-3 py-2 rounded-lg relative"
              style={{
                background: subscriptionStatus === "actif" ? "rgba(91,123,79,0.25)" : subscriptionStatus === "suspendu" ? "rgba(181,71,58,0.3)" : "rgba(201,138,44,0.25)",
                border: `1px solid ${subscriptionStatus === "actif" ? C.moss : subscriptionStatus === "suspendu" ? C.red : C.amber}`,
              }}
            >
              <span className="text-xs disp" style={{ color: "#fff" }}>
                {subscriptionStatus === "essai" && `Essai · ${orgFull ? Math.max(0, Math.ceil((new Date(orgFull.trial_end_date) - new Date()) / 86400000)) : "…"} j restants`}
                {subscriptionStatus === "actif" && "Abonnement actif"}
                {subscriptionStatus === "impaye" && "Paiement en attente"}
                {subscriptionStatus === "suspendu" && "Abonnement suspendu"}
                {!subscriptionStatus && "Abonnement"}
              </span>
              <span className="text-[11px] mono" style={{ color: C.clay }}>
                {orgFull ? (educateurs.length * orgFull.price_per_educateur).toLocaleString("fr-FR") : "…"} F/mois
              </span>
            </button>
          )}
        </div>

        {dataError && <div className="p-4 text-sm" style={{ color: C.red }}>{dataError}</div>}
        {loadingData && !dataError && <div className="p-4 text-sm" style={{ color: C.inkSoft }}>Chargement des données…</div>}

        {!loadingData && (
          contractLocked ? (
            <SuspendedScreen isChef={isChef} montantMensuel={orgFull ? educateurs.length * orgFull.price_per_educateur : 0} onOpenSubscription={openSubscription} />
          ) : selectedClient ? (
            <ClientDetail
              client={selectedClient}
              session={selectedSession}
              exercises={selectedExercises}
              isChef={isChef}
              locating={locating}
              onPoint={handlePoint}
              onToggleExercise={toggleExercise}
              onAddExercise={handleAddExercise}
              onDeleteExercise={handleDeleteExercise}
              onToggleVisitDay={toggleVisitDay}
              onNotesChange={handleNotesChange}
              onGenerateReport={generateReport}
              onRequestCloseContract={() => setCloseContractOpen(true)}
            />
          ) : isChef && !selectedEducatorId ? (
            <TeamOverview
              educateurs={educateurs}
              clients={clients}
              sessions={sessions}
              absences={absences}
              onSelectEducator={setSelectedEducatorId}
              onAddEducator={() => setAddEducatorOpen(true)}
              onAddClient={() => setAddClientOpen(true)}
            />
          ) : (
            <>
              {isChef && selectedEducatorId && (
                <div className="px-4 pt-4">
                  <EducatorStatsCard
                    educateur={educateurs.find((e) => e.id === selectedEducatorId)}
                    clients={clients.filter((c) => c.educateur_id === selectedEducatorId)}
                    sessions={sessions.filter((s) => s.educateur_id === selectedEducatorId)}
                    exercises={exercises}
                    absences={absences.filter((a) => a.educateur_id === selectedEducatorId)}
                    onAddAbsence={() => setAddAbsenceOpen(true)}
                  />
                </div>
              )}
              <Agenda
                clients={clients.filter((c) => c.educateur_id === viewingEducatorId)}
                sessions={sessions.filter((s) => s.educateur_id === viewingEducatorId && s.session_date === today)}
                exercises={exercises}
                onSelect={setSelectedClientId}
                isEducatorView={!isChef}
              />
            </>
            )
        )}
      </div>

      {reportOpen && selectedSession && selectedClient && (
        <ReportModal
          client={selectedClient}
          session={selectedSession}
          exercises={selectedExercises}
          isChef={isChef}
          stampVisible={stampVisible}
          onClose={() => setReportOpen(false)}
          onSend={sendReport}
        />
      )}
      {addClientOpen && <AddClientModal educateurs={educateurs} onClose={() => setAddClientOpen(false)} onSave={addClient} />}
      {addEducatorOpen && <AddEducatorModal onClose={() => setAddEducatorOpen(false)} onSave={addEducator} />}
      {closeContractOpen && <CloseContractModal onClose={() => setCloseContractOpen(false)} onConfirm={handleCloseContract} />}
      {addAbsenceOpen && <AddAbsenceModal onClose={() => setAddAbsenceOpen(false)} onSave={addAbsence} />}
      {subscriptionOpen && (
        <SubscriptionScreen
          org={orgFull}
          educateursCount={educateurs.length}
          onClose={() => setSubscriptionOpen(false)}
          onPay={() => setPayModalOpen(true)}
          onSetDemoStatus={setDemoStatus}
        />
      )}
      {payModalOpen && (
        <PaymentModal
          montantMensuel={orgFull ? educateurs.length * orgFull.price_per_educateur : 0}
          onClose={() => setPayModalOpen(false)}
          onConfirm={confirmPayment}
        />
      )}
    </div>
  );
}

function FullScreenMessage({ text }) {
  return (
    <div style={{ background: C.forest, minHeight: "100vh", color: "#fff" }} className="w-full flex items-center justify-center">
      <div className="disp text-sm tracking-widest">{text}</div>
    </div>
  );
}

function PawPrintIcon() {
  return <span style={{ color: C.orange, fontSize: 16 }}>🐾</span>;
}

// =================== LOGIN ===================

function LoginScreen({ onLogin, onSignup, externalError }) {
  const [mode, setMode] = useState("login");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [chefName, setChefName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const switchMode = (m) => { setMode(m); setError(""); };

  const submitLogin = async () => {
    if (!phone.trim() || !password.trim()) { setError("Renseignez votre numéro et votre mot de passe."); return; }
    setBusy(true);
    const ok = await onLogin(phone, password);
    setBusy(false);
    if (!ok) setError(externalError || "Numéro ou mot de passe incorrect.");
  };

  const submitSignup = async () => {
    if (!chefName.trim() || !orgName.trim() || !phone.trim() || !password.trim()) {
      setError("Renseignez le nom de votre organisation, votre nom, votre numéro et un mot de passe.");
      return;
    }
    if (password.length < 4) { setError("Le mot de passe doit faire au moins 4 caractères."); return; }
    if (password !== confirmPassword) { setError("Les deux mots de passe ne correspondent pas."); return; }
    setBusy(true);
    const result = await onSignup({ chefName: chefName.trim(), orgName: orgName.trim(), phone, password });
    setBusy(false);
    if (!result.ok) setError(result.error);
  };

  return (
    <div
      style={{ background: C.forest, minHeight: "100dvh" }}
      className="w-full flex flex-col justify-center items-center px-5 py-10 overflow-y-auto"
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@500;600;700&family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap');
        .disp { font-family: 'Oswald', sans-serif; letter-spacing: 0.02em; }
      `}</style>
      <div className="w-full max-w-sm my-auto">
        <div className="text-center mb-6">
          <div style={{ fontSize: 30 }}>🐾</div>
          <div className="disp text-xl tracking-widest mt-2" style={{ color: "#fff" }}>K9 APEX SUIT</div>
          <div className="text-xs mt-1 px-4" style={{ color: C.clay }}>Gestion des équipes d'éducateurs canins</div>
        </div>

        <div className="flex gap-1.5 mb-4">
          <button onClick={() => switchMode("login")} className="flex-1 text-sm py-2.5 rounded-full disp" style={{ background: mode === "login" ? C.orange : "transparent", color: mode === "login" ? "#fff" : C.clay, border: `1px solid ${C.clay}` }}>Se connecter</button>
          <button onClick={() => switchMode("signup")} className="flex-1 text-sm py-2.5 rounded-full disp" style={{ background: mode === "signup" ? C.orange : "transparent", color: mode === "signup" ? "#fff" : C.clay, border: `1px solid ${C.clay}` }}>Créer mon compte</button>
        </div>

        <div className="rounded-lg p-5" style={{ background: C.card, border: `1px solid ${C.line}` }}>
          {mode === "signup" && (
            <>
              <Field label="Nom de votre organisation" value={orgName} onChange={setOrgName} placeholder="Ex: Dressage Canin Cocody" autoComplete="organization" />
              <Field label="Votre nom (chef d'équipe)" value={chefName} onChange={setChefName} placeholder="Ex: Konan Yves" autoComplete="name" />
            </>
          )}
          <Field label="Numéro de téléphone" value={phone} onChange={setPhone} placeholder="22507000000" type="tel" inputMode="tel" autoComplete="tel" />
          <Field label="Mot de passe" value={password} onChange={setPassword} type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} />
          {mode === "signup" && (
            <Field label="Confirmer le mot de passe" value={confirmPassword} onChange={setConfirmPassword} type="password" autoComplete="new-password" />
          )}

          {error && <div className="text-sm mt-2" style={{ color: C.red }}>{error}</div>}

          {mode === "login" ? (
            <button disabled={busy} onClick={submitLogin} className="w-full mt-4 py-3.5 rounded-lg flex items-center justify-center gap-2 disp text-sm tracking-wide active:opacity-80" style={{ background: C.orange, color: "#fff" }}>
              <Lock size={16} /> {busy ? "CONNEXION…" : "SE CONNECTER"}
            </button>
          ) : (
            <>
              <div className="text-[11px] mt-3" style={{ color: C.inkSoft }}>
                Vous créez le compte du chef d'équipe. Vous pourrez ensuite ajouter vos éducateurs depuis "Mon équipe".
              </div>
              <button disabled={busy} onClick={submitSignup} className="w-full mt-3 py-3.5 rounded-lg flex items-center justify-center gap-2 disp text-sm tracking-wide active:opacity-80" style={{ background: C.forest, color: "#fff" }}>
                <Users size={16} /> {busy ? "CRÉATION…" : "CRÉER MON COMPTE ET MON ÉQUIPE"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, placeholder, type = "text", inputMode, autoComplete }) {
  return (
    <div className="mb-3">
      <div className="text-[11px] mb-1" style={{ color: C.inkSoft }}>{label}</div>
      <input
        type={type}
        inputMode={inputMode}
        autoComplete={autoComplete}
        value={value}
        onChange={(ev) => onChange(ev.target.value)}
        placeholder={placeholder}
        className="w-full text-base px-3 py-3 rounded outline-none"
        style={{ background: C.paperDark, border: `1px solid ${C.line}`, fontSize: 16 }}
      />
    </div>
  );
}

// =================== TEAM OVERVIEW ===================

function TeamOverview({ educateurs, clients, sessions, absences, onSelectEducator, onAddEducator, onAddClient }) {
  return (
    <div className="px-4 py-4 space-y-3">
      <div className="flex gap-2">
        <button onClick={onAddClient} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-lg disp text-sm tracking-wide" style={{ background: C.orange, color: "#fff" }}>
          <Plus size={16} /> NOUVEAU CLIENT
        </button>
        <button onClick={onAddEducator} className="flex-1 flex items-center justify-center gap-2 py-3 rounded-lg disp text-sm tracking-wide" style={{ background: C.forest, color: "#fff" }}>
          <Users size={16} /> ÉDUCATEUR
        </button>
      </div>
      <div className="text-[11px] px-1" style={{ color: C.inkSoft }}>
        Vous seul gérez les informations des clients et leur assignation aux éducateurs.
      </div>

      {educateurs.map((ed) => {
        const mine = sessions.filter((s) => s.educateur_id === ed.id && s.session_date === todayISO());
        const terminees = mine.filter((s) => s.status === "terminee").length;
        const enCours = mine.filter((s) => s.status === "en_cours").length;
        return (
          <div key={ed.id} className="rounded-lg p-4" style={{ background: C.card, border: `1px solid ${C.line}` }}>
            <button onClick={() => onSelectEducator(ed.id)} className="w-full text-left flex gap-3 items-center">
              <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0 disp" style={{ background: C.forest, color: "#fff" }}>
                {ed.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="disp text-base">{ed.name}</span>
                  <span className="text-[11px] px-2 py-0.5 rounded-full shrink-0" style={{ background: C.paperDark, color: C.inkSoft }}>{ed.role}</span>
                </div>
                <div className="text-xs mono mt-1" style={{ color: C.inkSoft }}>
                  {mine.length} séance{mine.length !== 1 ? "s" : ""} aujourd'hui
                  {mine.length > 0 && ` · ${terminees} terminée${terminees !== 1 ? "s" : ""} · ${enCours} en cours`}
                </div>
              </div>
            </button>
            <EducatorWeekHistory
              clients={clients.filter((c) => c.educateur_id === ed.id)}
              sessions={sessions.filter((s) => s.educateur_id === ed.id)}
              absences={absences.filter((a) => a.educateur_id === ed.id)}
            />
          </div>
        );
      })}
    </div>
  );
}

function EducatorWeekHistory({ clients, sessions, absences }) {
  const todayStr = todayISO();
  const clientById = Object.fromEntries(clients.map((c) => [c.id, c]));

  const windowDates = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    windowDates.push(d.toISOString().slice(0, 10));
  }

  const byDate = {};
  windowDates.forEach((d) => { byDate[d] = { sessions: [], absence: null }; });
  sessions.forEach((s) => {
    if (byDate[s.session_date] && s.status !== "a_venir") {
      byDate[s.session_date].sessions.push(s);
    }
  });
  absences.forEach((a) => { if (byDate[a.absence_date]) byDate[a.absence_date].absence = a; });

  const days = windowDates
    .map((date) => ({ date, ...byDate[date] }))
    .filter((d) => d.sessions.length > 0 || d.absence)
    .sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${C.line}` }}>
      <div className="text-[11px] mb-1.5" style={{ color: C.inkSoft }}>Séances des 7 derniers jours</div>
      {days.length === 0 ? (
        <div className="text-xs" style={{ color: C.inkSoft }}>Aucune séance sur cette période.</div>
      ) : (
        <div className="space-y-1">
          {days.map((day) => {
            const missed = !!day.absence;
            const worked = day.sessions.length > 0;
            const color = missed ? C.red : worked ? C.moss : C.inkSoft;
            return (
              <div key={day.date} className="flex items-start gap-2 text-[11px] px-2 py-1 rounded" style={{ background: missed ? "rgba(181,71,58,0.10)" : worked ? "rgba(91,123,79,0.10)" : "transparent" }}>
                <span className="mono shrink-0 font-medium" style={{ color, minWidth: 82 }}>{shortDateLabel(day.date, todayStr)}</span>
                {missed ? (
                  <span style={{ color: C.red }}>Absent · {day.absence.motif}</span>
                ) : (
                  <span style={{ color: C.moss }}>
                    {day.sessions.map((s, i) => (
                      <span key={s.id}>
                        {clientById[s.client_id]?.dog_name || "?"}
                        {SESSION_STATUS_META[s.status] ? ` (${SESSION_STATUS_META[s.status].label.toLowerCase()})` : ""}
                        {i < day.sessions.length - 1 ? " · " : ""}
                      </span>
                    ))}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// =================== EDUCATOR STATS ===================

function StatBox({ label, value, highlight }) {
  return (
    <div className="rounded p-2.5" style={{ background: C.paperDark }}>
      <div className="text-[10px]" style={{ color: C.inkSoft }}>{label}</div>
      <div className="disp text-lg mt-0.5" style={{ color: highlight ? C.red : C.forest }}>{value}</div>
    </div>
  );
}

function EducatorStatsCard({ educateur, clients, sessions, exercises, absences, onAddAbsence }) {
  const [period, setPeriod] = useState("jour");
  if (!educateur) return null;
  const todayStr = todayISO();
  const ancienneteMois = monthsSince(educateur.date_embauche);

  const doneToday = sessions.filter((s) => s.session_date === todayStr && s.status !== "a_venir");
  const durMinutes = (s) => (s.check_in_time && s.check_out_time ? Math.round((new Date(s.check_out_time) - new Date(s.check_in_time)) / 60000) : 0);

  function statsForRange(days) {
    const from = new Date(); from.setDate(from.getDate() - (days - 1));
    const fromStr = from.toISOString().slice(0, 10);
    const inRange = sessions.filter((s) => s.session_date >= fromStr && s.status !== "a_venir");
    const totalMin = inRange.reduce((sum, s) => sum + durMinutes(s), 0);
    const absCount = absences.filter((a) => a.absence_date >= fromStr).length;
    const tauxAbsenteisme = days > 0 ? Math.round((absCount / days) * 100) : 0;
    return { seances: inRange.length, dureeMinutes: totalMin, tauxAbsenteisme };
  }

  const periodData = period === "jour"
    ? { seances: doneToday.length, dureeMinutes: doneToday.reduce((s, x) => s + durMinutes(x), 0), tauxAbsenteisme: null }
    : period === "semaine" ? statsForRange(7) : statsForRange(30);

  const dureeMoyenne = periodData.seances > 0 ? Math.round(periodData.dureeMinutes / periodData.seances) : 0;

  const withObjectifs = clients.filter((c) => c.contract_status !== "clos").map((c) => ({
    client: c,
    objectif: computeObjectif(exercises.filter((e) => e.client_id === c.id)),
  }));
  const eligibles = withObjectifs.filter((o) => o.objectif.total > 0);
  const atteints = eligibles.filter((o) => o.objectif.atteint).length;

  const sortedAbsences = absences.slice().sort((a, b) => b.absence_date.localeCompare(a.absence_date));

  return (
    <div className="rounded-lg p-4 mb-3" style={{ background: C.card, border: `1px solid ${C.line}` }}>
      <div className="flex items-center justify-between mb-3">
        <div className="disp text-xs tracking-widest" style={{ color: C.forest }}>TRAVAIL EFFECTUÉ</div>
        <div className="flex gap-1">
          {[["jour", "Jour"], ["semaine", "Semaine"], ["mois", "Mois"]].map(([key, label]) => (
            <button key={key} onClick={() => setPeriod(key)} className="text-[11px] px-2.5 py-1 rounded-full disp" style={{ background: period === key ? C.forest : C.paperDark, color: period === key ? "#fff" : C.inkSoft }}>{label}</button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <StatBox label="Séances réalisées" value={periodData.seances} />
        <StatBox label="Temps de dressage total" value={formatDuration(periodData.dureeMinutes)} />
        <StatBox label="Durée moy. / séance" value={periodData.seances > 0 ? `${dureeMoyenne} min` : "—"} />
        <StatBox label="Taux d'absentéisme" value={periodData.tauxAbsenteisme != null ? `${periodData.tauxAbsenteisme}%` : "—"} highlight={periodData.tauxAbsenteisme != null && periodData.tauxAbsenteisme >= 10} />
      </div>

      <div className="h-px my-3" style={{ background: C.line }} />
      <div className="grid grid-cols-2 gap-2">
        <StatBox label="Ancienneté" value={`${ancienneteMois} mois`} />
        <StatBox label="Objectifs atteints" value={eligibles.length > 0 ? `${atteints}/${eligibles.length}` : "—"} highlight={eligibles.length > 0 && atteints < eligibles.length} />
      </div>

      <div className="h-px my-3" style={{ background: C.line }} />
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px]" style={{ color: C.inkSoft }}>Jours d'absence</div>
        <button onClick={onAddAbsence} className="text-[11px] flex items-center gap-1 disp" style={{ color: C.orange }}><Plus size={12} /> Déclarer</button>
      </div>
      {sortedAbsences.length === 0 ? (
        <div className="text-xs" style={{ color: C.inkSoft }}>Aucune absence enregistrée.</div>
      ) : (
        <div className="space-y-1.5">
          {sortedAbsences.map((a) => (
            <div key={a.id} className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded" style={{ background: C.paperDark }}>
              <span className="mono" style={{ color: C.ink }}>{a.absence_date} <span style={{ color: C.inkSoft }}>· {weekdayLabel(a.absence_date)}</span></span>
              <span className="text-[11px]" style={{ color: C.inkSoft }}>{a.motif}</span>
            </div>
          ))}
        </div>
      )}

      {withObjectifs.length > 0 && (
        <>
          <div className="h-px my-3" style={{ background: C.line }} />
          <div className="text-[11px] mb-2" style={{ color: C.inkSoft }}>Objectif de dressage par client</div>
          <div className="space-y-2">
            {withObjectifs.map(({ client: c, objectif }) => (
              <div key={c.id} className="rounded p-2.5" style={{ background: C.paperDark }}>
                <div className="flex items-center justify-between gap-2 mb-1">
                  <span className="text-xs font-medium">{c.dog_name} · {c.owner_name}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0" style={{ background: objectif.atteint ? C.moss : objectif.total === 0 ? C.line : C.amber, color: objectif.atteint || objectif.total !== 0 ? "#fff" : C.inkSoft }}>
                    {objectif.total === 0 ? "Pas d'exercice" : objectif.atteint ? "Objectif atteint" : "En cours"}
                  </span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: C.line }}>
                  <div className="h-full rounded-full" style={{ width: `${objectif.pct}%`, background: objectif.atteint ? C.moss : C.orange }} />
                </div>
                <div className="text-[10px] mt-1 mono" style={{ color: C.inkSoft }}>{objectif.acquis}/{objectif.total} exercices acquis</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// =================== AGENDA ===================

function Agenda({ clients, sessions, exercises, onSelect, isEducatorView }) {
  const active = clients.filter((c) => c.contract_status !== "clos");
  const closed = clients.filter((c) => c.contract_status === "clos");
  const sessionByClient = Object.fromEntries(sessions.map((s) => [s.client_id, s]));

  return (
    <div className="px-4 py-4 space-y-3">
      {isEducatorView && (
        <div className="text-[11px] px-3 py-2 rounded-lg flex items-start gap-1.5" style={{ background: C.paperDark, color: C.inkSoft }}>
          <Briefcase size={13} className="mt-0.5 shrink-0" />
          Les clients sont ajoutés et assignés par votre chef d'équipe.
        </div>
      )}
      {active.filter((c) => sessionByClient[c.id]).length === 0 && (
        <div className="text-sm text-center py-6" style={{ color: C.inkSoft }}>Aucune séance assignée aujourd'hui.</div>
      )}
      {active.filter((c) => sessionByClient[c.id]).map((c) => {
        const s = sessionByClient[c.id];
        const meta = SESSION_STATUS_META[s.status];
        const objectif = computeObjectif(exercises.filter((e) => e.client_id === c.id));
        return (
          <button key={c.id} onClick={() => onSelect(c.id)} className="w-full text-left rounded-lg p-4 flex gap-3 items-start" style={{ background: C.card, border: `1px solid ${C.line}` }}>
            <div className="mono text-xs px-2 py-1 rounded shrink-0 mt-0.5" style={{ background: C.paperDark, color: C.ink }}>{s.scheduled_time?.slice(0, 5) || "--:--"}</div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="disp text-lg">{c.dog_name}</span>
                <span className="text-[11px] px-2 py-0.5 rounded-full font-medium" style={{ background: meta.color, color: "#fff" }}>{meta.label}</span>
              </div>
              <div className="text-sm mt-0.5" style={{ color: C.inkSoft }}>{c.dog_breed} · {c.owner_name}</div>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs mono" style={{ color: C.moss }}>{objectif.acquis}/{objectif.total} exercices acquis</span>
                {objectif.total > 0 && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: objectif.atteint ? C.moss : C.paperDark, color: objectif.atteint ? "#fff" : C.inkSoft }}>
                    {objectif.atteint ? "Objectif atteint" : `${objectif.pct}%`}
                  </span>
                )}
              </div>
            </div>
          </button>
        );
      })}

      {closed.length > 0 && (
        <>
          <div className="text-[11px] uppercase tracking-widest pt-2" style={{ color: C.inkSoft }}>Contrats de dressage clôturés</div>
          {closed.map((c) => (
            <button key={c.id} onClick={() => onSelect(c.id)} className="w-full text-left rounded-lg p-3 flex items-center gap-3 opacity-70" style={{ background: C.card, border: `1px solid ${C.line}` }}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="disp text-sm">{c.dog_name} · {c.owner_name}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: C.paperDark, color: C.inkSoft }}>Clôturé {c.contract_date_fin}</span>
                </div>
              </div>
            </button>
          ))}
        </>
      )}
    </div>
  );
}

// =================== CLIENT DETAIL (ex SessionDetail) ===================

function ClientDetail({ client, session, exercises, isChef, locating, onPoint, onToggleExercise, onAddExercise, onDeleteExercise, onToggleVisitDay, onNotesChange, onGenerateReport, onRequestCloseContract }) {
  const [newExercise, setNewExercise] = useState("");
  const [notesDraft, setNotesDraft] = useState(session?.notes || "");
  const contractClosed = client.contract_status === "clos";
  const canGenerateReport = session?.check_in_time && session?.check_out_time && !contractClosed;
  const visitDays = client.visit_days || [];
  const objectifNow = computeObjectif(exercises);

  useEffect(() => { setNotesDraft(session?.notes || ""); }, [session?.id]);

  if (!session && !contractClosed) {
    return (
      <div className="px-4 py-6 text-center text-sm" style={{ color: C.inkSoft }}>
        Ce client n'a pas de séance programmée aujourd'hui (jour non prévu dans ses jours d'intervention habituels).
      </div>
    );
  }

  return (
    <div className="px-4 py-4 space-y-4 pb-10">
      {contractClosed && (
        <div className="rounded-lg p-3 flex items-start gap-2" style={{ background: C.paperDark, border: `1px solid ${C.line}` }}>
          <ShieldCheck size={16} style={{ color: C.inkSoft }} className="mt-0.5 shrink-0" />
          <div className="text-xs" style={{ color: C.inkSoft }}>Contrat de dressage clôturé le {client.contract_date_fin}. Cette fiche est conservée en lecture seule.</div>
        </div>
      )}

      <div className="rounded-lg p-4" style={{ background: C.card, border: `1px solid ${C.line}` }}>
        {session && <div className="flex items-center gap-1 text-xs mono mb-2" style={{ color: C.inkSoft }}><Calendar size={12} /> Rendez-vous {session.scheduled_time?.slice(0, 5) || ""}</div>}
        <div className="text-sm" style={{ color: C.inkSoft }}>{client.dog_breed} · {client.dog_age}</div>
        <div className="disp text-lg mt-1">{client.owner_name}</div>
        <div className="flex items-center gap-1 text-xs mt-2" style={{ color: C.inkSoft }}><MapPin size={12} /> {client.address_text}</div>
        {isChef && client.owner_phone && (
          <div className="flex items-center gap-1 text-xs mt-1" style={{ color: C.inkSoft }}><Phone size={12} /> {client.owner_phone}</div>
        )}
        {!isChef && (
          <div className="text-[11px] mt-2 flex items-start gap-1" style={{ color: C.inkSoft }}>
            <Briefcase size={12} className="mt-0.5 shrink-0" /> Le téléphone du client est géré par votre chef d'équipe.
          </div>
        )}

        <div className="h-px my-3" style={{ background: C.line }} />
        <div className="text-[11px] mb-1.5" style={{ color: C.inkSoft }}>{isChef ? "Jours de passage habituels chez ce client" : "Vos jours d'intervention chez ce client"}</div>
        <div className="flex gap-1.5 flex-wrap">
          {DAYS.map((d) => {
            const active = visitDays.includes(d.key);
            return (
              <button key={d.key} disabled={contractClosed} onClick={() => onToggleVisitDay(d.key)} className="w-8 h-8 rounded-full text-xs font-medium disp" style={{ background: active ? C.forest : C.paperDark, color: active ? "#fff" : C.inkSoft, border: `1px solid ${active ? C.forest : C.line}`, opacity: contractClosed ? 0.6 : 1 }}>{d.label}</button>
            );
          })}
        </div>

        {!contractClosed && (
          <>
            <div className="h-px my-3" style={{ background: C.line }} />
            <button onClick={onRequestCloseContract} className="w-full text-xs py-2 rounded-lg" style={{ color: C.red, border: `1px solid ${C.red}`, background: "transparent" }}>Clôturer le contrat de dressage</button>
          </>
        )}
      </div>

      {session && (
        <div className="rounded-lg p-4" style={{ background: C.card, border: `1px solid ${C.line}` }}>
          <div className="disp text-sm tracking-wide mb-3" style={{ color: C.forest }}>POINTAGE GÉOLOCALISÉ</div>
          <PointRow label="Arrivée" timestamp={session.check_in_time} reference={{ lat: client.address_lat, lng: client.address_lng }} point={session.check_in_lat != null ? { lat: session.check_in_lat, lng: session.check_in_lng, real: session.check_in_is_real } : null} loading={locating === "checkin"} disabled={!!session.check_in_time || contractClosed} onClick={() => onPoint("checkin")} />
          <div className="h-2" />
          <PointRow label="Départ" timestamp={session.check_out_time} reference={{ lat: client.address_lat, lng: client.address_lng }} point={session.check_out_lat != null ? { lat: session.check_out_lat, lng: session.check_out_lng, real: session.check_out_is_real } : null} loading={locating === "checkout"} disabled={!session.check_in_time || !!session.check_out_time || contractClosed} onClick={() => onPoint("checkout")} />
          {session.check_in_time && session.check_out_time && (
            <div className="mt-3 text-center text-xs mono px-2 py-1.5 rounded" style={{ background: C.paperDark, color: C.forest }}>
              Temps de dressage : {formatDuration(Math.round((new Date(session.check_out_time) - new Date(session.check_in_time)) / 60000))}
            </div>
          )}
        </div>
      )}

      <div className="rounded-lg p-4" style={{ background: C.card, border: `1px solid ${C.line}` }}>
        <div className="flex items-center justify-between mb-1">
          <div className="disp text-sm tracking-wide" style={{ color: C.forest }}>SUIVI DES EXERCICES</div>
          {exercises.length > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: objectifNow.atteint ? C.moss : C.paperDark, color: objectifNow.atteint ? "#fff" : C.inkSoft }}>
              {objectifNow.atteint ? "Objectif atteint" : `${objectifNow.pct}% de l'objectif`}
            </span>
          )}
        </div>
        <div className="space-y-2">
          {exercises.length === 0 && (
            <div className="text-xs" style={{ color: C.inkSoft }}>Aucun exercice pour l'instant — ajoutez-en ci-dessous.</div>
          )}
          {exercises.map((e) => {
            const meta = STATUS_META[e.status];
            const Icon = meta.icon;
            return (
              <div key={e.id} className="w-full flex items-center gap-2 px-3 py-2 rounded" style={{ background: C.paperDark }}>
                <button disabled={contractClosed} onClick={() => onToggleExercise(e.id)} className="flex-1 flex items-center justify-between text-left">
                  <span className="text-sm">{e.label}</span>
                  <span className="flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full" style={{ color: "#fff", background: meta.color }}><Icon size={12} /> {meta.label}</span>
                </button>
                {!contractClosed && isChef && (
                  <button onClick={() => onDeleteExercise(e.id)} className="shrink-0 p-1" style={{ color: C.red }} title="Supprimer l'exercice"><Trash2 size={14} /></button>
                )}
              </div>
            );
          })}
        </div>
        {!contractClosed && (
          <div className="flex gap-2 mt-3">
            <input value={newExercise} onChange={(ev) => setNewExercise(ev.target.value)} onKeyDown={(ev) => { if (ev.key === "Enter") { onAddExercise(newExercise); setNewExercise(""); } }} placeholder="Nouvel exercice" className="flex-1 text-sm px-2 py-1.5 rounded outline-none" style={{ background: C.paperDark, border: `1px solid ${C.line}` }} />
            <button onClick={() => { onAddExercise(newExercise); setNewExercise(""); }} className="px-3 rounded flex items-center gap-1 text-xs disp" style={{ background: C.orange, color: "#fff" }}><Plus size={14} /> Ajouter</button>
          </div>
        )}
        <div className="text-[11px] mt-2" style={{ color: C.inkSoft }}>Touchez un exercice existant pour faire évoluer son statut.</div>
      </div>

      {exercises.length > 0 && <ProgressionCard exercises={exercises} />}

      {session && (
        <div className="rounded-lg p-4" style={{ background: C.card, border: `1px solid ${C.line}` }}>
          <div className="disp text-sm tracking-wide mb-2" style={{ color: C.forest }}>NOTES DE TERRAIN</div>
          <textarea
            value={notesDraft}
            disabled={contractClosed}
            onChange={(ev) => setNotesDraft(ev.target.value)}
            onBlur={() => onNotesChange(notesDraft)}
            placeholder="Observations, recommandations pour le propriétaire..."
            rows={3}
            className="w-full text-sm p-2 rounded outline-none resize-none"
            style={{ background: C.paperDark, border: `1px solid ${C.line}` }}
          />
        </div>
      )}

      {session && (
        <button
          disabled={!canGenerateReport}
          onClick={onGenerateReport}
          className="w-full py-3 rounded-lg flex items-center justify-center gap-2 disp text-sm tracking-wide"
          style={{ background: canGenerateReport ? C.forest : C.line, color: canGenerateReport ? "#fff" : C.inkSoft }}
        >
          <Send size={16} /> GÉNÉRER LE RAPPORT DE SÉANCE
        </button>
      )}

      {session?.report_status && (
        <div className="text-center text-xs mono" style={{ color: C.moss }}>
          Rapport {session.report_status === "confirme" ? "confirmé par le propriétaire" : session.report_status === "envoye" ? "envoyé, en attente de confirmation" : "transmis au chef d'équipe, en attente d'envoi"}
        </div>
      )}
    </div>
  );
}

function ProgressionCard({ exercises }) {
  const today = todayISO();
  const acquired = exercises.filter((e) => e.date_acquis).sort((a, b) => a.date_acquis.localeCompare(b.date_acquis));
  const chartData = [];
  let count = 0;
  acquired.forEach((e) => {
    count += 1;
    chartData.push({ label: new Date(e.date_acquis + "T00:00:00").toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }), acquis: count });
  });

  return (
    <div className="rounded-lg p-4" style={{ background: C.card, border: `1px solid ${C.line}` }}>
      <div className="disp text-sm tracking-wide mb-1" style={{ color: C.forest }}>PROGRESSION DU CHIEN</div>
      <div className="text-[11px] mb-2" style={{ color: C.inkSoft }}>Exercices acquis dans le temps</div>
      {chartData.length < 2 ? (
        <div className="text-xs" style={{ color: C.inkSoft }}>Pas encore assez de données pour tracer une courbe.</div>
      ) : (
        <div style={{ width: "100%", height: 140 }}>
          <ResponsiveContainer>
            <LineChart data={chartData} margin={{ top: 6, right: 8, left: -22, bottom: 0 }}>
              <CartesianGrid stroke={C.line} strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fontSize: 10, fill: C.inkSoft }} axisLine={{ stroke: C.line }} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: C.inkSoft }} axisLine={{ stroke: C.line }} tickLine={false} />
              <Tooltip contentStyle={{ background: C.card, border: `1px solid ${C.line}`, fontSize: 11 }} labelStyle={{ color: C.ink }} />
              <Line type="monotone" dataKey="acquis" stroke={C.moss} strokeWidth={2} dot={{ r: 3, fill: C.moss }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
      <div className="h-px my-3" style={{ background: C.line }} />
      <div className="text-[11px] mb-2" style={{ color: C.inkSoft }}>Temps mis pour acquérir chaque exercice</div>
      <div className="space-y-1.5">
        {exercises.map((e) => {
          let detail;
          if (e.date_acquis) detail = `Acquis en ${daysBetween(e.date_ajout, e.date_acquis)} j`;
          else if (e.status === "en_cours") detail = `En cours depuis ${daysBetween(e.date_ajout, today)} j`;
          else detail = "Pas encore commencé";
          return (
            <div key={e.id} className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded" style={{ background: C.paperDark }}>
              <span>{e.label}</span>
              <span className="mono" style={{ color: e.date_acquis ? C.moss : C.inkSoft }}>{detail}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PointRow({ label, timestamp, reference, point, loading, disabled, onClick }) {
  const dist = point && reference ? distanceMeters(point, reference) : null;
  const valid = dist != null && dist <= PROOF_THRESHOLD;
  return (
    <div className="rounded p-3" style={{ background: C.paperDark }}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">{label}</span>
        {timestamp ? (
          <span className="mono text-xs" style={{ color: C.inkSoft }}>{new Date(timestamp).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}</span>
        ) : (
          <button disabled={disabled || loading} onClick={onClick} className="text-xs px-3 py-1.5 rounded-full flex items-center gap-1 disp" style={{ background: disabled ? C.line : C.orange, color: disabled ? C.inkSoft : "#fff" }}>
            {loading ? <Loader2 size={12} className="animate-spin" /> : <MapPin size={12} />} {loading ? "Localisation…" : "Pointer"}
          </button>
        )}
      </div>
      {timestamp && dist != null && (
        <div className="mt-2 text-[11px] flex items-center gap-1" style={{ color: valid ? C.moss : C.red }}>
          {valid ? <CheckCircle2 size={12} /> : <AlertTriangle size={12} />}
          {valid ? `Preuve validée · ${dist} m de l'adresse enregistrée` : `Écart de position · ${dist} m`}
          {!point.real && " (position simulée, démo)"}
        </div>
      )}
    </div>
  );
}

// =================== MODALS ===================

function AddClientModal({ educateurs, onClose, onSave }) {
  const [form, setForm] = useState({ ownerName: "", phone: "", address: "", dogName: "", breed: "", age: "", visitDays: [], educatorId: "" });
  const [locating, setLocating] = useState(false);
  const set = (k) => (ev) => setForm((f) => ({ ...f, [k]: ev.target.value }));
  const toggleDay = (key) => setForm((f) => ({ ...f, visitDays: f.visitDays.includes(key) ? f.visitDays.filter((d) => d !== key) : [...f.visitDays, key] }));
  const canSave = form.ownerName.trim() && form.phone.trim() && form.address.trim() && form.dogName.trim() && form.educatorId;

  const geocode = () => {
    setLocating(true);
    if (!navigator.geolocation) {
      setForm((f) => ({ ...f, coord: { lat: 5.34 + Math.random() * 0.05, lng: -4.0 + Math.random() * 0.05 }, real: false }));
      setLocating(false);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => { setForm((f) => ({ ...f, coord: { lat: pos.coords.latitude, lng: pos.coords.longitude }, real: true })); setLocating(false); },
      () => { setForm((f) => ({ ...f, coord: { lat: 5.34 + Math.random() * 0.05, lng: -4.0 + Math.random() * 0.05 }, real: false })); setLocating(false); },
      { timeout: 3000 }
    );
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center px-4 overflow-y-auto py-8" style={{ background: "rgba(34,31,26,0.55)" }}>
      <div className="w-full max-w-sm rounded-lg p-5 relative" style={{ background: C.card, border: `1px solid ${C.line}` }}>
        <button onClick={onClose} className="absolute top-3 right-3" style={{ color: C.inkSoft }}><X size={18} /></button>
        <div className="disp text-sm tracking-widest mb-3" style={{ color: C.forest }}>NOUVEAU CLIENT</div>
        <div className="space-y-2">
          <Field label="Nom du propriétaire" value={form.ownerName} onChange={(v) => setForm((f) => ({ ...f, ownerName: v }))} />
          <Field label="Téléphone (WhatsApp)" value={form.phone} onChange={(v) => setForm((f) => ({ ...f, phone: v }))} placeholder="2250700000000" />
          <Field label="Adresse" value={form.address} onChange={(v) => setForm((f) => ({ ...f, address: v }))} />
          <button onClick={geocode} className="text-xs px-3 py-1.5 rounded-full disp" style={{ background: C.paperDark, color: C.inkSoft, border: `1px solid ${C.line}` }}>
            {locating ? "Localisation…" : form.coord ? "Position enregistrée ✓" : "Capturer la position GPS"}
          </button>
          <Field label="Nom du chien" value={form.dogName} onChange={(v) => setForm((f) => ({ ...f, dogName: v }))} />
          <Field label="Race" value={form.breed} onChange={(v) => setForm((f) => ({ ...f, breed: v }))} />
          <Field label="Âge" value={form.age} onChange={(v) => setForm((f) => ({ ...f, age: v }))} />
        </div>

        <div className="mt-2">
          <div className="text-[11px] mb-1.5" style={{ color: C.inkSoft }}>Jours de passage habituels</div>
          <div className="flex gap-1.5 flex-wrap">
            {DAYS.map((d) => {
              const active = form.visitDays.includes(d.key);
              return <button key={d.key} onClick={() => toggleDay(d.key)} className="w-8 h-8 rounded-full text-xs font-medium disp" style={{ background: active ? C.forest : C.paperDark, color: active ? "#fff" : C.inkSoft, border: `1px solid ${active ? C.forest : C.line}` }}>{d.label}</button>;
            })}
          </div>
        </div>

        <div className="mt-3">
          <div className="text-[11px] mb-1.5" style={{ color: C.inkSoft }}>Assigner à l'éducateur</div>
          <div className="flex gap-1.5 flex-wrap">
            {educateurs.map((ed) => {
              const active = form.educatorId === ed.id;
              return <button key={ed.id} onClick={() => setForm((f) => ({ ...f, educatorId: ed.id }))} className="text-xs px-3 py-1.5 rounded-full" style={{ background: active ? C.forest : C.paperDark, color: active ? "#fff" : C.inkSoft, border: `1px solid ${active ? C.forest : C.line}` }}>{ed.name}</button>;
            })}
          </div>
        </div>

        <button disabled={!canSave} onClick={() => onSave(form)} className="w-full mt-4 py-3 rounded-lg flex items-center justify-center gap-2 disp text-sm tracking-wide" style={{ background: canSave ? C.forest : C.line, color: canSave ? "#fff" : C.inkSoft }}>
          <Plus size={16} /> AJOUTER LE CLIENT
        </button>
      </div>
    </div>
  );
}

function AddEducatorModal({ onClose, onSave }) {
  const [form, setForm] = useState({ name: "", phone: "", password: "" });
  const [saving, setSaving] = useState(false);
  const canSave = form.name.trim() && form.phone.trim() && form.password.trim();

  const submit = async () => {
    setSaving(true);
    await onSave(form);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center px-4" style={{ background: "rgba(34,31,26,0.55)" }}>
      <div className="w-full max-w-sm rounded-lg p-5 relative" style={{ background: C.card, border: `1px solid ${C.line}` }}>
        <button onClick={onClose} className="absolute top-3 right-3" style={{ color: C.inkSoft }}><X size={18} /></button>
        <div className="disp text-sm tracking-widest mb-3" style={{ color: C.forest }}>NOUVEL ÉDUCATEUR</div>
        <Field label="Nom de l'éducateur" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} />
        <Field label="Téléphone (WhatsApp)" value={form.phone} onChange={(v) => setForm((f) => ({ ...f, phone: v }))} placeholder="2250700000000" />
        <Field label="Mot de passe temporaire" value={form.password} onChange={(v) => setForm((f) => ({ ...f, password: v }))} placeholder="Ex: 1234" />
        <div className="text-[11px] mt-1" style={{ color: C.inkSoft }}>
          L'éducateur se connectera avec son numéro de téléphone et ce mot de passe.
        </div>
        <button disabled={!canSave || saving} onClick={submit} className="w-full mt-4 py-3 rounded-lg flex items-center justify-center gap-2 disp text-sm tracking-wide" style={{ background: canSave ? C.forest : C.line, color: canSave ? "#fff" : C.inkSoft }}>
          <Users size={16} /> {saving ? "CRÉATION…" : "AJOUTER À L'ÉQUIPE"}
        </button>
      </div>
    </div>
  );
}

function AddAbsenceModal({ onClose, onSave }) {
  const [form, setForm] = useState({ date: todayISO(), motif: "Maladie" });
  const motifs = ["Maladie", "Rendez-vous personnel", "Congé", "Absence non justifiée", "Autre"];
  return (
    <div className="fixed inset-0 flex items-center justify-center px-4" style={{ background: "rgba(34,31,26,0.55)" }}>
      <div className="w-full max-w-sm rounded-lg p-5 relative" style={{ background: C.card, border: `1px solid ${C.line}` }}>
        <button onClick={onClose} className="absolute top-3 right-3" style={{ color: C.inkSoft }}><X size={18} /></button>
        <div className="disp text-sm tracking-widest mb-3" style={{ color: C.forest }}>DÉCLARER UNE ABSENCE</div>
        <div className="text-[11px] mb-1" style={{ color: C.inkSoft }}>Date</div>
        <input type="date" value={form.date} onChange={(ev) => setForm((f) => ({ ...f, date: ev.target.value }))} className="w-full text-sm px-2 py-1.5 rounded outline-none mb-3" style={{ background: C.paperDark, border: `1px solid ${C.line}` }} />
        <div className="text-[11px] mb-1" style={{ color: C.inkSoft }}>Motif</div>
        <div className="flex gap-1.5 flex-wrap">
          {motifs.map((m) => {
            const active = form.motif === m;
            return <button key={m} onClick={() => setForm((f) => ({ ...f, motif: m }))} className="text-xs px-3 py-1.5 rounded-full" style={{ background: active ? C.forest : C.paperDark, color: active ? "#fff" : C.inkSoft, border: `1px solid ${active ? C.forest : C.line}` }}>{m}</button>;
          })}
        </div>
        <button onClick={() => onSave(form)} className="w-full mt-4 py-3 rounded-lg flex items-center justify-center gap-2 disp text-sm tracking-wide" style={{ background: C.forest, color: "#fff" }}><Calendar size={16} /> ENREGISTRER L'ABSENCE</button>
      </div>
    </div>
  );
}

function CloseContractModal({ onClose, onConfirm }) {
  return (
    <div className="fixed inset-0 flex items-center justify-center px-4" style={{ background: "rgba(34,31,26,0.55)" }}>
      <div className="w-full max-w-sm rounded-lg p-5 relative" style={{ background: C.card, border: `1px solid ${C.line}` }}>
        <button onClick={onClose} className="absolute top-3 right-3" style={{ color: C.inkSoft }}><X size={18} /></button>
        <div className="disp text-sm tracking-widest mb-2" style={{ color: C.red }}>CLÔTURER LE CONTRAT DE DRESSAGE</div>
        <div className="text-sm" style={{ color: C.inkSoft }}>Le programme de dressage sera marqué comme terminé pour ce client.</div>
        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-lg text-sm disp" style={{ background: C.paperDark, color: C.ink }}>Annuler</button>
          <button onClick={onConfirm} className="flex-1 py-2.5 rounded-lg text-sm disp" style={{ background: C.red, color: "#fff" }}>Confirmer</button>
        </div>
      </div>
    </div>
  );
}

function ReportModal({ client, session, exercises, isChef, stampVisible, onClose, onSend }) {
  const acquis = exercises.filter((e) => e.status === "acquis").length;
  const total = exercises.length;
  const dureeMin = session.check_in_time && session.check_out_time ? Math.round((new Date(session.check_out_time) - new Date(session.check_in_time)) / 60000) : null;
  const distIn = session.check_in_lat != null ? distanceMeters({ lat: session.check_in_lat, lng: session.check_in_lng }, { lat: client.address_lat, lng: client.address_lng }) : null;

  return (
    <div className="fixed inset-0 flex items-center justify-center px-4" style={{ background: "rgba(34,31,26,0.55)" }}>
      <div className="w-full max-w-sm rounded-lg p-5 relative" style={{ background: C.card, border: `1px solid ${C.line}` }}>
        <button onClick={onClose} className="absolute top-3 right-3" style={{ color: C.inkSoft }}><X size={18} /></button>
        <div className="disp text-sm tracking-widest mb-1" style={{ color: C.forest }}>RAPPORT DE SÉANCE</div>
        <div className="text-lg disp">{client.dog_name} — {client.owner_name}</div>
        <div className="mono text-xs mt-2" style={{ color: C.inkSoft }}>
          Arrivée {new Date(session.check_in_time).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} · Départ {new Date(session.check_out_time).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })} · {formatDuration(dureeMin)}
        </div>
        {distIn != null && <div className="text-xs mono mt-1" style={{ color: C.moss }}>Présence géolocalisée à {distIn} m de l'adresse enregistrée</div>}
        <div className="text-sm mt-3">Exercices acquis : <b>{acquis}/{total}</b></div>
        {session.notes && <div className="text-sm mt-2" style={{ color: C.inkSoft }}>{session.notes}</div>}

        <div className="flex justify-center my-4 relative h-20">
          {stampVisible && (
            <div className="stamp-anim absolute flex items-center justify-center rounded-full" style={{ width: 92, height: 92, border: `3px solid ${C.orange}`, color: C.orange, transform: "rotate(-8deg)" }}>
              <div className="text-center disp text-[10px] leading-tight tracking-wider">SÉANCE<br />VALIDÉE<br />GÉOLOCALISÉE</div>
            </div>
          )}
        </div>

        {isChef ? (
          <button onClick={onSend} className="w-full py-3 rounded-lg flex items-center justify-center gap-2 disp text-sm tracking-wide" style={{ background: C.forest, color: "#fff" }}><Send size={16} /> ENVOYER AU PROPRIÉTAIRE (WHATSAPP)</button>
        ) : (
          <>
            <div className="text-[11px] text-center mb-2" style={{ color: C.inkSoft }}>Vous n'avez pas les coordonnées du client — le rapport sera transmis par votre chef d'équipe.</div>
            <button onClick={onSend} className="w-full py-3 rounded-lg flex items-center justify-center gap-2 disp text-sm tracking-wide" style={{ background: C.forest, color: "#fff" }}><Send size={16} /> TRANSMETTRE AU CHEF D'ÉQUIPE</button>
          </>
        )}
      </div>
    </div>
  );
}

function SuspendedScreen({ isChef, montantMensuel, onOpenSubscription }) {
  return (
    <div className="px-6 py-14 text-center space-y-3">
      <AlertTriangle size={32} style={{ color: C.red, margin: "0 auto" }} />
      <div className="disp text-lg" style={{ color: C.forest }}>Abonnement suspendu</div>
      {isChef ? (
        <>
          <div className="text-sm" style={{ color: C.inkSoft }}>L'accès à l'équipe et aux séances est bloqué. Réglez {montantMensuel.toLocaleString("fr-FR")} F CFA pour réactiver votre compte.</div>
          <button onClick={onOpenSubscription} className="mt-2 px-5 py-2.5 rounded-lg disp text-sm tracking-wide" style={{ background: C.forest, color: "#fff" }}>Voir mon abonnement</button>
        </>
      ) : (
        <div className="text-sm" style={{ color: C.inkSoft }}>L'abonnement de votre chef d'équipe est suspendu. Vos séances seront de nouveau accessibles dès que le paiement sera régularisé.</div>
      )}
    </div>
  );
}

function SubscriptionScreen({ org, educateursCount, onClose, onPay, onSetDemoStatus }) {
  if (!org) {
    return (
      <div className="fixed inset-0 flex items-center justify-center px-4" style={{ background: "rgba(34,31,26,0.55)" }}>
        <div className="w-full max-w-sm rounded-lg p-5 relative text-center text-sm" style={{ background: C.card, border: `1px solid ${C.line}`, color: C.inkSoft }}>
          Chargement de l'abonnement…
          <button onClick={onClose} className="absolute top-3 right-3" style={{ color: C.inkSoft }}><X size={18} /></button>
        </div>
      </div>
    );
  }
  const statusMeta = {
    essai: { label: `Essai · ${Math.max(0, Math.ceil((new Date(org.trial_end_date) - new Date()) / 86400000))} jours restants`, color: C.amber },
    actif: { label: "Actif", color: C.moss },
    impaye: { label: "Paiement en attente", color: C.amber },
    suspendu: { label: "Suspendu", color: C.red },
  }[org.subscription_status];
  const montantMensuel = educateursCount * org.price_per_educateur;

  return (
    <div className="fixed inset-0 flex items-center justify-center px-4" style={{ background: "rgba(34,31,26,0.55)" }}>
      <div className="w-full max-w-sm rounded-lg p-5 relative max-h-[85vh] overflow-y-auto" style={{ background: C.card, border: `1px solid ${C.line}` }}>
        <button onClick={onClose} className="absolute top-3 right-3" style={{ color: C.inkSoft }}><X size={18} /></button>
        <div className="disp text-sm tracking-widest mb-3" style={{ color: C.forest }}>MON ABONNEMENT</div>
        <div className="flex items-center justify-between rounded-lg p-3 mb-3" style={{ background: C.paperDark }}>
          <span className="text-sm disp">{statusMeta.label}</span>
          <span className="w-2.5 h-2.5 rounded-full" style={{ background: statusMeta.color }} />
        </div>
        <div className="text-[11px] mb-1" style={{ color: C.inkSoft }}>Formule</div>
        <div className="text-sm mb-3">Prix par éducateur actif</div>
        <div className="grid grid-cols-2 gap-2 mb-3">
          <StatBox label="Éducateurs actifs" value={educateursCount} />
          <StatBox label="Prix / éducateur" value={`${org.price_per_educateur.toLocaleString("fr-FR")} F`} />
        </div>
        <div className="rounded-lg p-3 mb-4 flex items-center justify-between" style={{ background: C.forest }}>
          <span className="text-xs disp" style={{ color: C.clay }}>MONTANT MENSUEL</span>
          <span className="disp text-lg" style={{ color: "#fff" }}>{montantMensuel.toLocaleString("fr-FR")} F CFA</span>
        </div>
        {org.last_payment_date && (
          <div className="text-[11px] mb-3" style={{ color: C.inkSoft }}>
            Dernier paiement : {org.last_payment_date}{org.next_billing_date && ` · Prochain prélèvement : ${org.next_billing_date}`}
          </div>
        )}
        <button onClick={onPay} className="w-full py-3 rounded-lg flex items-center justify-center gap-2 disp text-sm tracking-wide" style={{ background: C.orange, color: "#fff" }}><Send size={16} /> PAYER VIA MOBILE MONEY</button>
        <div className="h-px my-4" style={{ background: C.line }} />
        <div className="text-[10px] mb-1.5" style={{ color: C.inkSoft }}>Démo — simuler un statut</div>
        <div className="flex gap-1.5 flex-wrap">
          {[["essai", "Essai"], ["actif", "Actif"], ["impaye", "Impayé"], ["suspendu", "Suspendu"]].map(([key, label]) => (
            <button key={key} onClick={() => onSetDemoStatus(key)} className="text-[11px] px-2.5 py-1 rounded-full" style={{ background: org.subscription_status === key ? C.forest : C.paperDark, color: org.subscription_status === key ? "#fff" : C.inkSoft }}>{label}</button>
          ))}
        </div>
      </div>
    </div>
  );
}

function PaymentModal({ montantMensuel, onClose, onConfirm }) {
  const [operator, setOperator] = useState("orange");
  const [phone, setPhone] = useState("");
  const [processing, setProcessing] = useState(false);
  const operators = [{ key: "orange", label: "Orange Money" }, { key: "mtn", label: "MTN Money" }, { key: "wave", label: "Wave" }];

  const pay = () => {
    setProcessing(true);
    setTimeout(() => { setProcessing(false); onConfirm(); }, 1200);
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center px-4" style={{ background: "rgba(34,31,26,0.55)" }}>
      <div className="w-full max-w-sm rounded-lg p-5 relative" style={{ background: C.card, border: `1px solid ${C.line}` }}>
        <button onClick={onClose} className="absolute top-3 right-3" style={{ color: C.inkSoft }}><X size={18} /></button>
        <div className="disp text-sm tracking-widest mb-3" style={{ color: C.forest }}>PAIEMENT MOBILE MONEY</div>
        <div className="disp text-2xl mb-3">{montantMensuel.toLocaleString("fr-FR")} F CFA</div>
        <div className="text-[11px] mb-1.5" style={{ color: C.inkSoft }}>Opérateur</div>
        <div className="flex gap-1.5 mb-3">
          {operators.map((o) => (
            <button key={o.key} onClick={() => setOperator(o.key)} className="flex-1 text-xs py-2 rounded-lg" style={{ background: operator === o.key ? C.forest : C.paperDark, color: operator === o.key ? "#fff" : C.inkSoft, border: `1px solid ${operator === o.key ? C.forest : C.line}` }}>{o.label}</button>
          ))}
        </div>
        <div className="text-[11px] mb-1" style={{ color: C.inkSoft }}>Numéro Mobile Money</div>
        <input value={phone} onChange={(ev) => setPhone(ev.target.value)} placeholder="07 00 00 00 00" className="w-full text-sm px-2 py-2 rounded outline-none mb-4" style={{ background: C.paperDark, border: `1px solid ${C.line}` }} />
        <button disabled={!phone.trim() || processing} onClick={pay} className="w-full py-3 rounded-lg flex items-center justify-center gap-2 disp text-sm tracking-wide" style={{ background: phone.trim() ? C.orange : C.line, color: phone.trim() ? "#fff" : C.inkSoft }}>
          {processing ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} {processing ? "TRAITEMENT EN COURS..." : "CONFIRMER LE PAIEMENT"}
        </button>
      </div>
    </div>
  );
}
