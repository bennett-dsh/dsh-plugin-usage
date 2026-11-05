<p align="center">
  <img src="https://github.com/user-attachments/assets/a29b952a-ae96-4185-b2e3-c7e7306054b1" alt="Usage dashboard: KPI cards, daily trend, yearly heatmap and per-model breakdown" width="100%">
</p>

<p align="center">
  <img src="https://img.shields.io/github/v/release/bennett-dsh/dsh-plugin-usage?style=flat&amp;label=release&amp;color=08C" alt="GitHub release">
  <img src="https://img.shields.io/badge/plugin-Token%20statistics-47848F?style=flat" alt="Token statistics plugin">
  <img src="https://img.shields.io/badge/DSH%20Web%20GUI-Windows%20%7C%20macOS%20%7C%20Linux-4493F8?style=flat" alt="Windows | macOS | Linux">
  <img src="https://img.shields.io/badge/license-MIT-2EA44F?style=flat" alt="MIT License">
  <a href="https://github.com/bennett-dsh/dsh-plugin-usage/actions/workflows/ci.yml"><img src="https://github.com/bennett-dsh/dsh-plugin-usage/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
</p>

<p align="center"><sub><a href="README.md">简体中文</a> · English</sub></p>

<h3 align="center">Token usage, call counts and reference cost by day or custom range — attributed per model</h3>

<p align="center"><a href="#install"><ins><code>dsh plugin --profile web add dsh-plugin-usage</code></ins></a></p>

`dsh-plugin-usage` is a **Token usage statistics plugin** for [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness). It folds the usage events already persisted in DSH session logs, prices them per model and per billed instant, renders a dashboard as a settings section, and keeps a "today's reference cost" pill beside the composer. It records nothing itself and changes no system source.

- **Today / last 7 days / last 30 days / all / custom range** (no span limit), bucketed by hour or day
- **Per-model breakdown**: requests, input/output, cache, cost, share; model filters apply instantly
- **Reference cost**: bundled opencode Zen + DeepSeek price lists, peak/off-peak billing per timestamp, ¥ / $ switch
- **Price matching**: a deterministic five-rung ladder; unmatched models can be pointed at a reference model or given hand-typed rates in the dialog
- **Yearly heatmap**, daily/hourly trend charts; light and dark follow the DSH theme variables
- **Composer cost pill**: "Today ¥x.xx" beside the composer (hidden when today has no calls); currency follows the setting
- **Plugin detail star nudge**: one line at the bottom of the plugin manager's detail page

> **Languages**: the UI copy and plugin metadata follow the DSH language, with **8 official languages** built in (zh / en / ja / de / es / fr / pt / ru). ja / de / es / fr / pt / ru are machine translations (lightly reviewed) — corrections are welcome in an issue; Chinese and English are maintained by the author. This README ships in [简体中文](README.md) and English.

## Install

The plugin is published on npm as `dsh-plugin-usage` (see [registry.npmjs.org](https://www.npmjs.com/package/dsh-plugin-usage)).

- **DSH Desktop**: sidebar → Plugins → Add plugin, then enter `dsh-plugin-usage`
- **Web / CLI profile**: `dsh plugin --profile <name> add dsh-plugin-usage`, then restart
- **From GitHub** (equivalent; pin a tag or commit):

  ```sh
  dsh plugin --profile web add github:bennett-dsh/dsh-plugin-usage#v0.6.0
  ```

- **Local directory / tarball** (development or offline):

  ```sh
  dsh plugin --profile web add ./dsh-plugin-usage
  dsh plugin --profile web add ./dsh-plugin-usage-0.6.0.tgz
  ```

Upgrade the same way (the desktop plugin page offers Update; the CLI has `update`). Uninstall: `dsh plugin --profile <name> remove dsh-plugin-usage`.

> The `desktop` profile is owned by the Electron app and cannot be driven with `dsh plugin --profile desktop`; use the plugin page instead.
> For artifact verification and restart rules see [MAINTAINING.md](MAINTAINING.md#安装与升级的硬规矩).

## Configuration

There are only three fields, stored in the current profile's Cordis patch through `settings.update('usage', …)`. All are `.volatile()`: a runtime write applies immediately and survives a restart, while editing the profile patch by hand needs a restart.

| Field | Meaning |
| --- | --- |
| `currency` | Default display currency (fixed rate: 1 USD = 7 CNY) |
| `prices` | Custom reference prices: model id → input/output/cache-read/cache-write per million tokens, in USD |
| `matchMap` | Confirmed model matches: model id → reference model id (written when you press Apply in the price dialog) |

`prices` is **empty by default** and exists only for ids the reference table cannot answer (an odd relay id, a private id). A row for an id the table already carries overrides the reference price — exactly the problem the hand-copied default table had before 0.4.0 (one cache price was 13.3× the official list; seven rows named retired models). The default table therefore ships no rows.

Prices resolve through the following ladder, and **no rung scores similarity**:

1. Custom (`prices`; keys may be `provider/model` or a bare model id)
2. A match confirmed in the dashboard dialog (`matchMap`)
3. Exact literal hit (case, `provider/model` prefix, `_`/`.`/`-` separators and the router's `auto-` prefix are normalized before comparing)
4. Aliases (where retired names such as `deepseek-chat`, `deepseek-reasoner` and `deepseek-v4-flash` point)
5. Variant suffixes (`-free` / `-exp` / `-fast` / `-latest` / a four-digit date such as `-1017`): only when the base model exists in the table; billed at the base row and reported as fuzzy

**Exact beats inferred**: a row the table really publishes is a fact and no inference may override it. Rung 5 is a **closed rename rule, not similarity**: the suffix list is fixed and the base model must exist.

Reference candidates are grouped by source: **DeepSeek official** and **opencode Zen**. The picker also offers a **Custom** option at the top: type three rates (input / output / cache read, in the dialog's display currency, per million tokens); they are written to `prices` and both tiers bill at the same rate.

DeepSeek's two models bill by peak/off-peak: **Beijing time, Monday to Friday (excluding Chinese public holidays), 09:00–12:00 and 14:00–18:00 are peak; all other times, including weekends and public holidays all day, are off-peak.**

> The ¥ / $ switch on the reference-cost card only affects the current browser (`localStorage`); it does not rewrite `currency`. This kernel does not auto-generate a configuration page for this plugin: use the dashboard's Price matching dialog for `prices` / `matchMap`; to change the default `currency` or hand-write `prices`, edit the `config` of the `usage` row in the profile's `cordis.patch.yml` (see [Configuration](docs/guide/configuration.md)).
> Editing a plugin title/description in `locale/*.json` needs an **app restart** (the host reads it at startup); editing the client UI dictionary only needs a page refresh. See [Configuration](docs/guide/configuration.md).

## Data source and accounting

The composer pill and the settings page share the same `usage/query` channel and the same scope (today 00:00 → now, priced per record's `provider/model`). It does not read the official `tokenUsage` projection: that projection only carries a per-session total and no model attribution, so pricing from it would merge different unit prices into one number. The scope is "today", not "this session" — the host renders `conversation.composer.dock` without props, so a dock entry cannot know the session id.

The plugin folds usage events already persisted in DSH session logs; it does not keep a log of its own:

- Reads go through the official interfaces: live sessions are driven by `session/event` **push** (each committed event is folded once); persisted sessions go through `sessionPersistence.open/read` and are skipped when `revision` is unchanged; a 30 s persisted scan doubles as the repair path
- Folded results are cached on disk (`~/.dsh/cache/dsh-plugin-usage/fold/<session>.json`; `DSH_HOME` moves the root): one file per session, a hit requires the session's `revision` to match, and the signature carries `FOLD_CACHE_VERSION` plus the holiday calendar's `capturedAt`
- Billing matches the official `tokenUsage` projection: the same `(turn, step)` replaces in place; retries after `llm/retry-started` accumulate; `assistant/attempt` stream usage is included
- Forked sessions skip the inherited prefix by `inheritedEventCount`, so the parent is never billed twice
- Cost = Σ(token bucket × its rate) / 1e6; DeepSeek's buckets are split by the instant's tier while folding, and switching currency does not rewrite them
- The price table is denominated in **USD per million tokens**; `¥` display converts at the fixed 7:1 rate
- The price table and holiday calendar are generated by `scripts/gen-prices.mjs` (`npm run prices`); CI runs it weekly and opens a PR only when the upstream data changed
- Public holidays come from [NateScarlet/holiday-cn](https://github.com/NateScarlet/holiday-cn); the year span follows the usage data's date range plus one year forward

## Compatibility

- DSH `>=0.2.1-rc.3 <0.3.0` (`engines.dsh`; verified against `0.2.2-rc.1` with both native contract gates and 250 unit tests), Node ≥ 22
- The settings nav icon uses the official `settings.section.icon` (0.2.2-rc.1): the registration id must equal the section id (`token-stats`); earlier kernels lack the slot and fall back to the official gear, with everything else unchanged
- The plugin-detail star nudge uses the official `plugins.detail.section` (0.2.2-rc.1); earlier kernels simply omit that line
- The composer cost pill needs the 0.2.1 `conversation.composer.dock`: 0.2.0 has no such slot; a failed injection logs a warning and leaves the settings page untouched
- Earlier hosts keep the `Session.events` / `readFrom` fallback path

## Documentation

The public documentation library lives in [docs/](docs/README.md): design trade-offs, assembly contracts, configuration, troubleshooting, compatibility and project experience. The maintainer handbook is [MAINTAINING.md](MAINTAINING.md); private material (roadmap, decisions, research) lives in `docs-private/` (only its entry README is tracked).

- [Design](docs/design.md) · [Architecture](docs/reference/architecture.md) · [Native alignment](docs/reference/native-alignment.md)
- [Configuration](docs/guide/configuration.md) · [Troubleshooting](docs/guide/troubleshooting.md) · [Testing](docs/testing.md)
- [Changelog](CHANGELOG.md) · [Contributing](CONTRIBUTING.md) · [Security](SECURITY.md)

## Development

```sh
npm install
npm run build          # tsc -> lib/, then emit lib/client/index.js
npm test               # pretest builds, then unit tests + the documentation link gate
npm run verify:typert  # validate the typert contribution with the official loader (SKIPPED without the asar)
npm run verify:remote  # run the native channel with the real cordis + typert registry (same SKIPPED rule)
npm run check:docs     # only the public docs' relative-link and anchor check
```

`npm test` has five layers, and each one catches a different class of problem:

| Layer | Covers | Failure looks like |
| --- | --- | --- |
| `tests/*.test.js` | Pure functions and host behaviour (fold / pricing / rpc / typert / i18n …) | An assertion |
| `tests/*.test.cjs` | **Built artifacts**: the pricing dialog and the plugin detail entry with a real bundle + fake host, 75 checks | `CHECK(S) FAILED` with names |
| `tests/fold-parity.test.js` | Reconciliation of our event fold against the official `tokenUsage` projection | The four counts differ |
| `npm run verify:remote` | Real cordis + real typert registry: face registration, receiver service, and the "one-shot probe during activation fails" regression | `CHECK(S) FAILED` |
| `node tools/check-docs.mjs` | Relative links and anchors in the public docs | The broken links are listed |

The parity fixture is **recorded, not handwritten**: `scripts/fold-parity-fixture.mjs` extracts the official `@deepseek-ai/dsh-token-meter` `usage-projection.js` from the local asar, runs it verbatim and writes the result to `tests/fixtures/token-usage-parity.json`. Re-run it after a DSH upgrade; never edit the numbers by hand.

CI runs install → build → test → bundle-id contract → tarball content checks; pushing a `v*` tag verifies the version, builds and tests, and creates a GitHub Release.

```text
src/host/     host: scan / fold / fold-cache / query / state / aggregate / prices / pricing / peak / holidays / settings / rpc / typert
src/client/   the settings dashboard + the plugin-detail star nudge (plain JS, inline stylesheet)
scripts/      build entry + price/holiday generators + the fold-parity recorder + two native contract checks
docs/         public documentation library (navigation / design / reference / guide / experience / testing)
docs-private/ private documentation library (only its entry README is tracked)
tests/        unit tests, built-artifact gates, fold parity, i18n and documentation-link gates
```

Client → host channel: prefer the native typert Remote (`src/host/typert.js` registers the face; the client mounts it with `remote.$mount`), and fall back to `connection.fetch` `/api/usage/*` when it is unavailable. Both stay available; the dashboard response's `channel` field says which one answered.

### Install and upgrade hard rules

Install with the official plugin manager (`plugin_manager install_bundle` + a `file:` tarball). pnpm has an awkward decision chain for a **same version, same path** `file:` dependency (measured 2026-10-31, pnpm 11.7/11.28):

| Attempt | Result |
| --- | --- |
| Same version, replaced tarball content, then `install_bundle` | `ambiguous-install`: only cleanup, nothing installed |
| `pnpm install --force` | `Already up to date` (or still the old content) — it fetches by the **lockfile integrity**, not the file |
| Delete `node_modules/<pkg>` then `pnpm install` | Still `Already up to date`; the directory is **not** restored |

There is **no** reliable same-version replacement. The only stable path is: **bump the version → `install_bundle` → restart**.

> ⚠️ **Never overwrite `node_modules/<pkg>` while DSH is running.** Measured 2026-10-31 02:00: about 0.8 s after a tarball was laid into a running profile, the host exited with `0xC0000005`. Quit DSH before touching files, or use the manager + restart.
>
> With a development junction / `link:` install, `npm run build` rewrites `lib/` while the running host is reading it; avoid building during long tasks. Client changes need a page refresh; host changes need a restart.

Only bump the version when a release is warranted, and always **verify the artifact** (read `package.json`'s version, `grep` for a marker added in this change) rather than trusting the manager's `applied`.

> For development you can also load from source with `--patch`: `dsh web --patch cordis.yml` (paths in `cordis.yml`).

## License

[MIT](./LICENSE)
