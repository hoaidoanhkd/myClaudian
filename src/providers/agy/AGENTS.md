# Antigravity (AGY) Provider

`src/providers/agy/` adapts Google's Antigravity CLI (`agy`) — a router over Gemini, Claude, and open-weight models — through a **stateless, one-shot subprocess invocation** per turn. There is no JSON-RPC, ACP, or persistent-process protocol here, unlike the other ACP-backed providers.

## Dependency Boundary

- `ManagedStdioProcess` spawn args, stdout/stderr text, and CLI flags remain provider-local until normalized into core execution events.
- Do not reuse AGY's prompt-flattening approach (concatenating history/context/system text into a single `-p` argument) as a pattern for other providers; it exists here only because the `agy` CLI has no structured turn/session API to target.

## Ownership

| Area | Owns |
| --- | --- |
| `execution/AgyExecutionSession.ts` | Per-turn subprocess spawn, prompt-text assembly (system instructions + active note + history + user text), stdout streaming, stderr-fallback capture |
| `execution/AgyExecutionBackend.ts` | Thin `ProviderExecutionSession` factory; passes through any `resumeSeed.providerSessionId` without using it |
| `history/AgyConversationHistoryService.ts` | Stub implementation only — no native transcript hydration, no fork materialization |
| `commands/AgyCommandCatalog.ts` | `RuntimeCommandCatalog` wiring for the `/` command dropdown |
| `app/AgyWorkspaceServices.ts` | Workspace service bundle (command catalog, settings tab renderer, `'none'` tab-warmup policy) |
| `env/AgySettingsReconciler.ts` | Environment-hash fingerprinting and `agy/<rawId>` model-selection normalization on settings load |
| `models.ts` | Discovered-model normalization, `agy/<rawId>` id encode/decode, reasoning-effort and context-window resolution |
| `settings.ts` | Persisted `AgyProviderSettings` read/write, `cliPathsByHost`, visible/discovered model list reconciliation |
| `ui/AgyChatUIConfig.ts` | Model/reasoning/permission-mode options exposed to the shared chat toolbar |
| `ui/AgySettingsTab.ts` | Settings-tab rendering (enablement, CLI path, model picker, skills, commands, native MCP pointer, environment) |
| `ui/ObsidianAgyExtensionUiRenderer.ts` | Trivial `Notice`-based UI bridge; no extension protocol behind it |

## Execution Model

- `AgyExecutionSession.execute()` spawns a brand-new `ManagedStdioProcess` running `agy -p <prompt> --model <model> --effort <level>` for every turn. There is no persistent process and no interactive stdin exchange after spawn — the entire turn's input is flattened into the `-p` argument text before the process starts.
- Multi-turn continuity is simulated client-side: `buildContextFromHistory()` renders prior turns into the prompt text on every call. AGY itself never sees a session id.
- Live output is `text_delta` chunks from stdout only. If the process closes without ever emitting stdout, the stderr snapshot (`proc.getStderrSnapshot()`) is surfaced as the visible text instead — this is the intended fallback (see `b236b60`), not a bug.
- Keep all prompt-text assembly (system instructions, active-note context, history rendering, user text) inside `execute()`. Do not split it across other files; there is no separate prompt-builder module for this provider.

## Known Gaps

This provider is early-stage. The following mismatches are real and should not be assumed away when touching this code:

- **Capability flags overstate implementation.** `AGY_PROVIDER_CAPABILITIES` declares `supportsNativeHistory`, `supportsRewind`, `supportsFork`, and `supportsTurnSteer` as `true`, but `AgyConversationHistoryService` hydrates nothing, never reports a pending fork, and `buildForkProviderState()` always returns `{}`. `AgyExecutionSession` accepts a `providerSessionId` in its constructor and echoes it in `getSnapshot()`, but never uses it to resume the CLI. Verify actual behavior in `execution/` and `history/` before relying on these flags; prefer correcting the flags (or filing the gap) over building new features on the assumption they are implemented.
- **Permission mode is not wired to execution.** `agyChatUIConfig` exposes a Safe/YOLO/Plan toggle (`AGY_PERMISSION_MODE_TOGGLE`), but `AgyExecutionSession.execute()` never reads `request.configuration.permissionMode` (or any equivalent) and never passes a corresponding flag to the CLI. The toggle currently has no execution-time effect.
- **Command catalog is never populated.** `AgyCommandCatalog` extends `RuntimeCommandCatalog`, whose entries come only from `setCommandSnapshot()`. No code in `src/providers/agy/` calls it, so the AGY `/` command dropdown will always list zero runtime commands until a discovery path is added (compare to Codex/Grok/OpenCode/Pi, which each run a metadata probe or read live session commands).
- **Two independent, disagreeing default-model paths.** `agyChatUIConfig.getDefaultModel()` derives the default from the first visible model in settings. `AgyExecutionSession.execute()` has its own hardcoded literal fallback (`'gemini-3.6-flash'`) used only when `request.configuration.model` is falsy. These can diverge if the settings-derived default is ever a different model.
- **Two independent, disagreeing default-reasoning-effort paths.** `AgyExecutionSession.execute()` falls back to `'high'` when `request.configuration.reasoning` is empty; `resolveAgyDefaultReasoningEffort()` (used by the UI) falls back to `'medium'` via `resolvePreferredReasoningDefault()`. Reconcile before changing either.
- **CLI path fallback is a hardcoded personal path.** When no `cliPath`/`cliPathsByHost` entry is set, `AgyExecutionSession.execute()` falls back to the literal string `/Users/apple/.local/bin/agy` instead of the bare `agy` command. This contradicts the settings-tab copy ("Leave empty to use `agy` from PATH.") and will fail on any machine that isn't that specific developer's. Treat this as a bug to fix, not a documented behavior, if touched.

## Models and Settings

- Model selections are `agy/<rawId>` in Claudian (`encodeAgyModelId`/`decodeAgyModelId`), mirroring the `<provider>/<rawId>` convention used by other providers.
- `DEFAULT_AGY_MODELS` in `models.ts` is a static fallback catalog (Gemini 3.x, Claude Sonnet/Opus 4.6, GPT-OSS 120B) — there is no live model-discovery subprocess for AGY (unlike Grok's `PiModelDiscoveryService`-style probes). `settings.ts` normalizes any persisted `discoveredModels` against this static list; it does not query the CLI.
- Reasoning uses `reasoningControl: 'effort'`; available efforts come from `STANDARD_REASONING_VALUES` and are passed to the CLI as `--effort <value>`.
- Native MCP configuration is CLI-managed (`agy mcp`), not Claudian-managed — `AgySettingsTab` only links out to it, matching the Codex/Grok pattern of not owning provider-native MCP config.

## Gotchas

- `AgyWorkspaceServices.prepareSettings()` and `dispose()` are both empty no-ops; there is no workspace-level setup or teardown to preserve when refactoring.
- `agyTabWarmupPolicy.resolveMode()` always returns `'none'` — AGY tabs never warm up a background process, consistent with there being no persistent process to warm.
- `ObsidianAgyExtensionUiRenderer` only shows a `Notice`; there is no extension-UI request/response protocol behind it to preserve.
- `taskResultInterpreter` is `NOOP_TASK_RESULT_INTERPRETER` — AGY has no async-agent task system to interpret results for.

## Invariants

- Every `execute()` call must remain a self-contained subprocess invocation. Do not introduce partial state that assumes a previous `execute()` call's process is still alive.
- Text visible to the user must come from either stdout `text_delta` chunks or, only when stdout produced nothing, the stderr snapshot — never both for the same turn.
