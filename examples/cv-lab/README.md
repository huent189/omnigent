# cv-lab

A cost-aware Omnigent orchestrator for computer-vision research, built around
three already-installed CLIs: `claude`, `gemini`, and `pi` (pointed at a local
model). One orchestrator, four workers, routed by their actual strengths
instead of by habit.

| Worker | Runs on | Use it for | Don't use it for |
|---|---|---|---|
| `explore` | local model via `pi` | well-defined coding tasks, codebase exploration | anything that won't fit its context window in one shot — chunk it first |
| `search` | Gemini CLI (real `gemini-cli`, via ACP) | web search, code edits you've specified in full detail | codebase exploration (slow at it) |
| `implement` | Claude Sonnet, medium effort | everyday planning + implementation | genuinely hard judgment calls |
| `reason` | Claude Opus, high effort | conclusions from data, synthesis across papers, new research directions | routine coding — `implement` handles that for less |

## One-time setup

```bash
LOCAL_LLM_MODEL=qwen2.5-coder:32b ./scripts/setup_cv_lab.sh
```

This wires your local model into `~/.omnigent/config.yaml` two ways: as a
gateway provider the `pi`-based `explore` worker can drive, and — separately —
as the judge Omnigent's smart-routing (`sys_advise_models`) consults for free,
if you want cv-lab's orchestrator to get a second opinion on worker choice
before it fans out. See `deploy/config/omnigent-config.cv-lab.yaml` for
exactly what gets merged in, and `omnigent-workflow` (the setup doc from this
project) §04 for how smart routing works.

Before running, fill in the two placeholder model ids if you skipped
`LOCAL_LLM_MODEL`:
- `agents/explore/config.yaml` → `executor.config.model`
- `agents/reason/config.yaml` / `agents/implement/config.yaml` →
  `executor.config.model` (run `omnigent models list --harness claude-sdk` to
  get the exact current Opus/Sonnet ids your subscription resolves)

## Running it

```bash
omnigent run cv-lab
# or, without the setup script's symlink:
omnigent run examples/cv-lab
```

Give it a goal like "figure out why the augmentation pipeline is producing
corrupt batches after last week's refactor" or "read these three papers and
tell me if our current augmentation approach is worth revisiting" — cv-lab
decomposes it, routes each piece per the table above, and reports back.
