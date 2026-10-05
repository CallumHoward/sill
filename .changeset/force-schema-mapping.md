---
"@wcmj/sill": minor
---

Add `"force": true` for `schemas` mappings, so a policy check can apply a schema even when the file names its own (a `$schema` property, a `yaml-language-server` modeline, or a TOML `#:schema` directive). Forced mappings are checked first, as a group. `sill identify` reports `(config wins, forced)` and any inline reference it ignored.

Config entries in `schemas` now reject unknown keys and a non-boolean `force` at load time, so a typo such as `"forced": true` is an error instead of silently weakening the check. Configs that already carried extra keys in a `schemas` entry will need them removed.
