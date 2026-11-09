# PCI-DSS v4.0 Technical Mapping: GoldMine Performance

This document maps specific PCI-DSS requirements actual code system artifacts.

## Req 3.1: Data Retention
**Question 1.1:** Where is the lead data stored?
**Response:** Data is stored in client-side 'localStorage' using the key 'goldmine-demo-state-v2'.
**Artifact:** `apps/goldmine-demo/src/services.ts:13`

**Question 1.5:** How does the 48-hour purge logic behave if the server is offline?
**Response:** The purge logic is client-side. It executes upon every page load/backend instantiation regardless of server connectivity.
**Artifact:** `apps/goldmine-demo/src/services.ts:39-42`

## Req 7.1: Restrict Access
**Question 21:** Does every agent have a unique identification ID?
**Response:** Yes. All repository operations are attributed to unique Git identities (e.g., 'Claude <claude@local>').
**Artifact:** Palace WAL (Board Log) and Git Author history.
