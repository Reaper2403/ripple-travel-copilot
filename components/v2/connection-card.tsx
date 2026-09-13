import { connectionLabel, isConnectionCurrent, providerLabels } from "./copy";
import { ProviderMark } from "./provider-mark";
import type { ConnectionSummary, Provider } from "./types";

export function ConnectionCard({ provider, connection, bullets }: { provider: Provider; connection: ConnectionSummary; bullets: string[] }) {
  const verified = isConnectionCurrent(connection);
  return (
    <div className={`v2-connection-card ${verified ? "is-verified" : ""}`}>
      <div className="v2-connection-head">
        <ProviderMark provider={provider} />
        <div className="v2-connection-title">
          <strong>{providerLabels[provider]}</strong>
          <span>{connection.verification_mode === "fixture" ? "Safe sample data" : connection.masked_identity ?? connection.display_name ?? connection.destination_label ?? "Not checked yet"}</span>
        </div>
        {verified ? <span className={`v2-status-pill ${connection.verification_mode === "fixture" ? "is-demo" : "is-connected"}`}><i aria-hidden="true">✓</i>{connectionLabel(connection.verification_mode)}</span> : null}
      </div>
      {verified ? (
        <div className="v2-capability-summary">
          {connection.destination_label ? <p><span>Using</span><strong>{connection.destination_label}</strong></p> : null}
          <ul>{connection.capabilities.map((capability) => <li key={capability.key}>✓ {capability.label}</li>)}</ul>
          {connection.verification_mode === "fixture" ? <p className="v2-demo-note">Uses a safe demo workspace; no external account was connected.</p> : null}
        </div>
      ) : (
        <ul className="v2-permission-list">{bullets.map((bullet) => <li key={bullet}><span>✓</span>{bullet}</li>)}</ul>
      )}
    </div>
  );
}
