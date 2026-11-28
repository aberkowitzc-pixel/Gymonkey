# Skills de seguridad (Trail of Bits)

Copiados de https://github.com/trailofbits/skills (commit `149d7b21f406`, licencia CC-BY-SA 4.0, ver `LICENSE`).

| Skill | Origen | Uso |
|---|---|---|
| `insecure-defaults` | `plugins/insecure-defaults` | Secretos por defecto, fail-open, CORS/ACL permisivos, debug. El original es un comando con `Workflow`; aquí `SKILL.md` es una adaptación para ejecutarlo a mano. |
| `sharp-edges` | `plugins/sharp-edges/skills/sharp-edges` | APIs y configuraciones propensas a error. |
| `supply-chain-risk-auditor` | `plugins/supply-chain-risk-auditor/skills/...` | Riesgo de dependencias (necesita acceso a api.osv.dev y api.github.com). |
| `semgrep` | `plugins/static-analysis/skills/semgrep` | Escaneo estático (necesita `semgrep` y acceso a semgrep.dev o a github.com). |
| `fp-check` | `plugins/fp-check/skills/fp-check` | Verificación de falsos positivos. |
