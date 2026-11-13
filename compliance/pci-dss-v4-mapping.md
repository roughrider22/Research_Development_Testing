# PCI-DSS v4.0 Technical Mapping: GoldMine Performance (HARDENED)

This document maps specific PCI-DSS requirements to actual code and system artifacts.

## Req 3.1: Data Retention
**Question 1.1:** Where is the lead data stored?
**Response:** Data is stored in client-side 'localStorage' using a user-specific key (`goldmine-state-[userId]`).
**Artifact:** `apps/goldmine-demo/src/services.ts:13-14, 163`

**Question 1.5:** How does the 48-hour purge logic behave if the server is offline?
**Response:** The purge logic is client-side. It executes upon every page load/backend instantiation.
**Artifact:** `apps/goldmine-demo/src/services.ts:79-105`

## Req 3.4: At-Rest Protection
**Question 10:** Is data encrypted at rest?
**Response:** No. Data is Base64-obfuscated before storage to provide minimal client-side obfuscation, but Base64 encoding does not meet PCI-DSS v4.0 Req 3.4 encryption standards. True cryptographic encryption requires WebCrypto AES-GCM or server-side ciphers.
**Artifact:** `apps/goldmine-demo/src/services.ts:31-33`

## Req 7.1: Restrict Access
**Question 21:** Does every user have a unique identity?
**Response:** Partial (Demo Scope). The client partitions data by User ID (`goldmine-state-[userId]`) using `login(id)` and `sessionStorage['gm_active_user']`. However, because this is an in-browser demo without a credential authority or backend gate, client-side session switching lacks cryptographic authentication.
**Artifact:** `apps/goldmine-demo/src/services.ts:60-76`

## Req 10.1: Audit Trail
**Question 31:** Is there a human-readable log of actions?
**Response:** No / Partial (Demo Scope). Every modification triggers a client-side console.info audit log entry naming the acting user. However, console logging in the browser is volatile, not tamper-resistant, client-side only, and lacks centralized collection. Furthermore, userId is set via unauthenticated login(). This does not satisfy PCI-DSS v4.0 Req 10.1 audit trail requirements.
**Artifact:** `apps/goldmine-demo/src/services.ts:165-168`
