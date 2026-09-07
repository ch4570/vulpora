# Synthetic execution incidents

These fixtures were authored for this repository from the generic failure
patterns in issue #23. They contain no incident logs, original code, organization
identifiers, or customer data. Counts and IDs are illustrative.

The evaluation target is the harness receipt validator, not an agent asset.
Keep these JSON fixtures outside `cases/`: agent behavioral YAML requires a real
manifest asset, while harness regressions execute locally without a model.

Each fixture declares one invalid observation and expected failure signals.
Tests reconstruct a complete baseline receipt, apply the incident, and verify
the exact rejection. The paired healthy baseline protects against blanket
rejection. These tests establish the receipt contract; they do not authenticate
an external runner or prove that an arbitrary adapter reports every event.
