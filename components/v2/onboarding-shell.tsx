"use client";

import Link from "next/link";
import { setupMeta, setupOrder, stepPath } from "./copy";
import type { SetupStep } from "./types";

export function OnboardingShell({ step, children, backStep, onExit }: { step: Exclude<SetupStep, "workspace">; children: React.ReactNode; backStep?: SetupStep; onExit?: () => void }) {
  const current = setupOrder.indexOf(step);
  return (
    <main className="v2-onboarding-shell">
      <header className="v2-onboarding-header">
        <Link className="v2-wordmark" href="/welcome" aria-label="Ripple home"><span>R</span>Ripple</Link>
        {onExit ? <button className="v2-text-button" type="button" onClick={onExit}>Save and exit</button> : null}
      </header>
      <div className="v2-onboarding-layout">
        <aside className="v2-onboarding-story" aria-hidden="true">
          <span className="v2-story-symbol">✦</span>
          <p>Thoughtful by default</p>
          <h2>Set up the places Ripple needs to understand your week.</h2>
          <ul>
            <li>Reads only the context needed</li>
            <li>Shows its reasoning and proposed actions</li>
            <li>Waits for your confirmation before changes</li>
          </ul>
        </aside>
        <section className="v2-onboarding-main">
          <div className="v2-progress-head">
            <div><span>Step {current + 1} of {setupOrder.length}</span><strong>{setupMeta[step].short}</strong></div>
            <ol className="v2-stepper" aria-label="Setup progress">
              {setupOrder.map((item, index) => <li key={item} className={index < current ? "is-done" : index === current ? "is-current" : ""} aria-current={index === current ? "step" : undefined}><span className="sr-only">{setupMeta[item as Exclude<SetupStep, "workspace">].short}</span></li>)}
            </ol>
          </div>
          {children}
          {backStep ? <Link className="v2-mobile-back" href={stepPath(backStep)}>← Back</Link> : null}
        </section>
      </div>
    </main>
  );
}
