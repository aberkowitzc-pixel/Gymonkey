---
name: insecure-defaults
description: "Audit a file, directory, or whole repo for insecure default configuration: fallback secrets, default credentials, fail-open switches, weak crypto, permissive access (CORS *, public ACLs), and debug leakage. Sweep each category with its seed patterns, then refute each candidate by tracing it to the security decision it reaches before reporting it. Use when asked for an insecure-defaults or configuration security audit."
allowed-tools: Read Grep Glob Bash
---

# Insecure defaults audit

Adapted from Trail of Bits `plugins/insecure-defaults` (CC-BY-SA 4.0). The upstream plugin
runs through a `Workflow` tool (`workflows/audit.js`); this skill runs the same pipeline by hand.
See [README.md](README.md) for the full design.

1. **Check the corpus.** `references/` must contain the six `<id>.md` + `<id>.json` pairs:
   `fallback-secrets`, `default-credentials`, `fail-open-security`, `weak-crypto`,
   `permissive-access`, `debug-features`. If not, stop and say so.
2. **Recon.** Classify the scope, profile the stack and deploy manifests (vercel.json, Dockerfile,
   CI, env docs), and list the project's own config wrappers that can return a default.
3. **Discover** (one sweep per category). Load that category's `.json` seeds (POSIX ERE) and `.md`
   rules; grep with seeds *and* stack-derived patterns. Collect candidates, do not judge yet.
   Report seeds vs. derived patterns separately; an empty derived list is a coverage gap.
4. **Dedup** on `category:file:line`.
5. **Verify** each candidate starting from `refuted: true`; stop at the first step that kills it:
   1. Is the file reachable in production?
   2. Is the insecure value the one that runs? (Configurable → does it fail-secure? Unconditional → cannot refute here.)
   3. Is the value actually insecure?
   4. Does it reach a security decision? Cite the sink.
   5. (Configurable only) Does deployment always supply the var? Only lowers severity.
   An incomplete trace = refuted.
6. **Report** findings with severity, sink, remediation, plus the refuted list and coverage.
   "No candidates" is not proof of absence.
