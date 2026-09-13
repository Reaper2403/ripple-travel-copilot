"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { onboardingApi } from "./client";
import { backStepFor, isConnectionCurrent, setupMeta, setupOrder, stepPath } from "./copy";
import { ConnectionCard } from "./connection-card";
import { OnboardingShell } from "./onboarding-shell";
import type { CalendarOption, OnboardingProfile, Provider, SetupStep } from "./types";

const screenToStep: Record<string, Exclude<SetupStep, "workspace">> = { welcome: "account", email: "gmail", calendar: "calendar", knowledge: "notion", complete: "complete" };

function isAhead(requested: SetupStep, canonical: SetupStep): boolean {
  const requestedIndex = setupOrder.indexOf(requested);
  const canonicalIndex = setupOrder.indexOf(canonical);
  return requestedIndex >= 0 && canonicalIndex >= 0 && requestedIndex > canonicalIndex;
}

function PrimaryButton({ busy, children, busyLabel, disabled, onClick }: { busy: boolean; children: React.ReactNode; busyLabel: string; disabled?: boolean; onClick(): void }) {
  return <button className="v2-primary-button" type="button" disabled={busy || disabled} onClick={onClick}>{busy ? <><span className="v2-button-spinner" aria-hidden="true" />{busyLabel}</> : <>{children}<span aria-hidden="true">→</span></>}</button>;
}

export function OnboardingScreen({ screen }: { screen: keyof typeof screenToStep }) {
  const router = useRouter();
  const step = screenToStep[screen];
  const [profile, setProfile] = useState<OnboardingProfile | null>(null);
  const [options, setOptions] = useState<CalendarOption[]>([]);
  const [selectedCalendar, setSelectedCalendar] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    let active = true;
    onboardingApi.get().then((next) => {
      if (!active) return;
      if (next.completed) { router.replace("/workspace"); return; }
      if (isAhead(step, next.current_step)) { router.replace(stepPath(next.current_step)); return; }
      setProfile(next);
    }).catch((reason: Error) => setError(reason.message)).finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [router, step]);

  useEffect(() => { if (!loading) headingRef.current?.focus(); }, [loading, screen]);

  const calendarConnection = profile?.connections.calendar;
  useEffect(() => {
    if (step !== "calendar" || !profile || (calendarConnection && isConnectionCurrent(calendarConnection)) || options.length) return;
    onboardingApi.calendarOptions().then(({ options: items }) => {
      setOptions(items);
      const selected = items.find((item) => item.selection_token === profile.selected_calendar_token) ?? items.find((item) => item.primary && item.writable) ?? items.find((item) => item.writable);
      setSelectedCalendar(selected?.selection_token ?? "");
    }).catch((reason: Error) => setError(reason.message));
  }, [step, profile, calendarConnection?.status, options.length]);

  const verified = useMemo(() => step === "gmail" || step === "calendar" || step === "notion" ? Boolean(profile?.connections[step] && isConnectionCurrent(profile.connections[step])) : false, [profile, step]);

  async function act(action: () => Promise<OnboardingProfile>, destination?: string) {
    setBusy(true); setError("");
    try {
      const next = await action();
      setProfile(next);
      if (destination) router.push(destination);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Ripple couldn’t complete that request.");
      requestAnimationFrame(() => document.querySelector<HTMLElement>("[role=alert]")?.focus());
    } finally { setBusy(false); }
  }

  if (loading) return <SetupLoading step={step} />;
  if (!profile) return <SetupFailure step={step} error={error} retry={() => location.reload()} />;

  const meta = setupMeta[step];
  const backStep = backStepFor(step);
  return (
    <OnboardingShell step={step} backStep={backStep} onExit={step === "account" ? undefined : () => router.push("/welcome")}>
      <article className={`v2-setup-card ${step === "complete" ? "is-handoff" : ""}`}>
        <p className="v2-eyebrow">{meta.eyebrow}</p>
        <h1 ref={headingRef} tabIndex={-1}>{meta.title}</h1>
        <p className="v2-lead">{meta.body}</p>
        {profile.connections.gmail.verification_mode === "fixture" ? <div className="v2-demo-banner">Demo workspace · Sample connections and schedule data</div> : null}
        {error ? <div className="v2-inline-alert" role="alert" tabIndex={-1}><strong>That connection needs attention.</strong><span>{error} Nothing else in your setup changed.</span></div> : null}
        {step === "account" ? <AccountStep profile={profile} busy={busy} onContinue={() => profile.current_step === "account" ? void act(() => onboardingApi.account(profile.account?.display_name ?? "Executive"), "/setup/email") : router.push(stepPath(profile.current_step))} /> : null}
        {step === "gmail" ? <ProviderStep provider="gmail" profile={profile} verified={verified} busy={busy} onVerify={() => act(onboardingApi.verifyGmail)} next="/setup/calendar" /> : null}
        {step === "calendar" ? <CalendarStep profile={profile} options={options} selected={selectedCalendar} onSelected={setSelectedCalendar} busy={busy} verified={verified} onVerify={() => act(() => onboardingApi.selectCalendar(selectedCalendar))} /> : null}
        {step === "notion" ? <ProviderStep provider="notion" profile={profile} verified={verified} busy={busy} onVerify={() => act(onboardingApi.verifyNotion)} next="/setup/complete" /> : null}
        {step === "complete" ? <Handoff profile={profile} busy={busy} onComplete={(prompt, intent) => {
          const destination = prompt ? `/workspace?prompt=${encodeURIComponent(prompt)}&intent=${intent}` : "/workspace";
          void act(onboardingApi.complete, destination);
        }} /> : null}
        {backStep ? <div className="v2-card-back"><Link href={stepPath(backStep)}>← Back</Link></div> : null}
      </article>
    </OnboardingShell>
  );
}

function AccountStep({ profile, busy, onContinue }: { profile: OnboardingProfile; busy: boolean; onContinue(): void }) {
  const progressed = profile.current_step !== "account";
  return <>
    <div className="v2-promise-list"><div><span>01</span><p><strong>Understand the change</strong> from connected travel notices.</p></div><div><span>02</span><p><strong>See the schedule impact</strong> before deciding what to do.</p></div><div><span>03</span><p><strong>Approve exact actions</strong> before Ripple changes anything.</p></div></div>
    <PrimaryButton busy={busy} busyLabel="Preparing your workspace…" onClick={onContinue}>{progressed ? "Resume setup" : "Start setup"}</PrimaryButton>
    <p className="v2-trust-copy">This prepares one private operator workspace. You’ll check each connection next.</p>
  </>;
}

const providerBullets: Record<"gmail" | "notion", string[]> = {
  gmail: ["Find likely travel-change messages", "Show the exact evidence used", "Send only updates you explicitly approve"],
  notion: ["Keep the situation and decision together", "Track actions with owners and deadlines", "Update only Ripple-owned content"],
};

function ProviderStep({ provider, profile, verified, busy, onVerify, next }: { provider: "gmail" | "notion"; profile: OnboardingProfile; verified: boolean; busy: boolean; onVerify(): void; next: string }) {
  const connection = profile.connections[provider];
  const button = provider === "gmail" ? "Check Gmail connection" : "Check Notion workspace";
  const busyCopy = provider === "gmail" ? "Checking your connection…" : "Confirming your workspace…";
  return <>
    <ConnectionCard provider={provider} connection={connection} bullets={providerBullets[provider]} />
    {provider === "gmail" ? <p className="v2-trust-note"><span>◇</span>Ripple never sends from your account without showing you the recipients and full message first.</p> : <p className="v2-trust-note"><span>◇</span>Ripple can only use the workspace and page shared with its connection.</p>}
    {verified ? <Link className="v2-primary-link" href={next}>{provider === "gmail" ? "Continue to Calendar" : "Continue to finish"}<span>→</span></Link> : <PrimaryButton busy={busy} busyLabel={busyCopy} onClick={onVerify}>{connection.status === "needs_attention" ? "Try again" : button}</PrimaryButton>}
  </>;
}

function CalendarStep({ profile, options, selected, onSelected, busy, verified, onVerify }: { profile: OnboardingProfile; options: CalendarOption[]; selected: string; onSelected(value: string): void; busy: boolean; verified: boolean; onVerify(): void }) {
  const connection = profile.connections.calendar;
  return <>
    {verified ? <ConnectionCard provider="calendar" connection={connection} bullets={[]} /> : <fieldset className="v2-calendar-picker"><legend>Choose the calendar Ripple should understand</legend>{options.length ? options.map((option) => <label key={option.selection_token} className={!option.writable ? "is-disabled" : ""}><input type="radio" name="calendar" value={option.selection_token} checked={selected === option.selection_token} disabled={!option.writable || busy} onChange={() => onSelected(option.selection_token)} /><span className="v2-radio" /><span><strong>{option.display_name}</strong><small>{option.primary ? "Primary calendar" : option.writable ? "Available calendar" : "Read only"}</small></span></label>) : <div className="v2-options-loading" role="status"><span>Checking available calendars…</span><i /><i /><i /></div>}</fieldset>}
    <p className="v2-trust-note"><span>◇</span>Existing meetings are never moved or cancelled automatically.</p>
    {verified ? <Link className="v2-primary-link" href="/setup/knowledge">Continue to Notion<span>→</span></Link> : <PrimaryButton busy={busy} busyLabel="Checking your calendar…" disabled={!selected} onClick={onVerify}>Use this calendar</PrimaryButton>}
  </>;
}

function Handoff({ profile, busy, onComplete }: { profile: OnboardingProfile; busy: boolean; onComplete(prompt?: string, intent?: string): void }) {
  const allVerified = Object.values(profile.connections).every((connection) => isConnectionCurrent(connection));
  return <>
    <div className="v2-ready-connections" aria-label="Connection summary">{Object.values(profile.connections).map((connection) => <ConnectionCard key={connection.provider} provider={connection.provider} connection={connection} bullets={[]} />)}</div>
    {!allVerified ? <div className="v2-inline-alert" role="alert"><strong>One connection needs attention.</strong><span>Return to the incomplete step before entering your workspace.</span></div> : null}
    <div className="v2-handoff-prompts">
      <button type="button" disabled={busy || !allVerified} onClick={() => onComplete("Prepare my week and show me the pressure points.", "prepare_week")}><strong>Prepare my week</strong><span>Find tight transitions and missing preparation time.</span><i>→</i></button>
      <button type="button" disabled={busy || !allVerified} onClick={() => onComplete("Review recent travel changes against my schedule.", "review_changes")}><strong>Review recent changes</strong><span>Check travel notices against upcoming commitments.</span><i>→</i></button>
      <button type="button" disabled={busy || !allVerified} onClick={() => onComplete("Show me how approval works.", "approval_demo")}><strong>Show how approval works</strong><span>See the safety boundary without changing anything.</span><i>→</i></button>
    </div>
    <PrimaryButton busy={busy} busyLabel="Preparing your workspace…" disabled={!allVerified} onClick={() => onComplete()}>Open my workspace</PrimaryButton>
    <p className="v2-trust-copy">Asking and exploring never changes your schedule. Ripple will show a separate confirmation before any action.</p>
  </>;
}

function SetupLoading({ step }: { step: Exclude<SetupStep, "workspace"> }) {
  return <OnboardingShell step={step}><div className="v2-setup-card" role="status"><div className="v2-skeleton v2-skeleton-short" /><div className="v2-skeleton v2-skeleton-title" /><div className="v2-skeleton" /><span className="sr-only">Loading your setup…</span></div></OnboardingShell>;
}

function SetupFailure({ step, error, retry }: { step: Exclude<SetupStep, "workspace">; error: string; retry(): void }) {
  return <OnboardingShell step={step}><div className="v2-setup-card"><p className="v2-eyebrow">Setup paused</p><h1>We couldn’t load your workspace.</h1><p className="v2-lead">{error || "Your connections were not changed."}</p><button className="v2-primary-button" onClick={retry}>Try again <span>→</span></button></div></OnboardingShell>;
}
