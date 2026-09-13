# Contract package

These JSON Schemas are the machine-readable seeds for independent implementation teams:

- `disruption-facts.schema.json`: model/extractor output after normalization.
- `action-manifest.schema.json`: the complete ordered side effects shown for approval.
- `approval-grant.schema.json`: the exact, time-bounded capability required to execute.
- `execution-receipt.schema.json`: provider-neutral attempt/result evidence used by UI and bench.

The normative semantics, ports, state transitions, canonical hashing, retries, and versioning rules are in [Module contracts](../docs/07-module-contracts.md). Schemas alone are not permission to execute; deterministic policy validation and a matching approval grant remain mandatory.

## Change rule

Any contract change must update its schema version, positive and negative examples, fake and real adapter conformance tests, and affected benchmark fixtures together. Breaking semantic or canonicalization changes require a major version and a decision-log entry.

