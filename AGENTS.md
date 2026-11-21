# GAHONSH social autopilot

Daily social posting from one Google Apps Script, plus a GitHub Action that
renders the same post to `docs/` as a public preview page.

## Commands

```
npm run check     # parse every .gs file
npm test          # mock suite, Google services stubbed (node only, no deps)
node build-bundle.js   # regenerate GAHONSH_AUTOPILOT.gs from the .gs sources
node render-today.js   # render today's post into docs/
```

`GAHONSH_AUTOPILOT.gs` is generated. Edit the `.gs` sources and rebuild; never
edit the bundle by hand. The build is idempotent.

## Facts that break this project

- Linux runners are case-sensitive. The sources are lowercase (`code.gs`,
  `media.gs`); any script that lists them must match exactly.
- API versions expire and fail without warning. Meta retires a Graph version
  about two years after release (v20.0 ended 2026-09-24), LinkedIn retires each
  marketing version after a year. Both are Script Properties
  (`META_GRAPH_VERSION`, `LINKEDIN_VERSION`) so a sunset needs no code change.
- Meta and LinkedIn long-lived tokens last about 60 days. `tokenHealth()` probes
  them with one GET each.
- Apps Script allows 6 minutes per execution. YouTube upload runs last so a cut
  run only loses YouTube.
- Script Properties cap at 500 KB. `pruneStateKeys_()` keeps 30 days of markers.
- `BloggerApp` does not exist in Apps Script. The blogger scope comes from
  `appsscript.json`, not from code.
- A pasted-bundle deployment needs re-authorization whenever a new scope appears,
  otherwise the trigger fails with no log row.

## Conventions

- Every channel is failure isolated: one bad key must never stop the others.
- Every channel is idempotent per day (`done_<date>_<channel>` markers).
- Errors must be actionable: say which key, service or scope is missing.
