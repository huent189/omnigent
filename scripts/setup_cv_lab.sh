#!/usr/bin/env bash
# Sets up the cv-lab agent pack (examples/cv-lab) on a new Ubuntu machine.
#
# Assumes you already have `claude`, `gemini`, and `pi` CLIs installed and
# logged in — this script does not install or authenticate any of them, it
# only wires Omnigent up to use them. Safe to re-run: it never overwrites an
# existing ~/.omnigent/config.yaml, it merges into it (or prints what to add
# by hand if the merge tool isn't available).
#
# Usage:
#   ./scripts/setup_cv_lab.sh
#   LOCAL_LLM_BASE_URL=http://localhost:11434/v1 \
#   LOCAL_LLM_MODEL=qwen2.5-coder:32b \
#     ./scripts/setup_cv_lab.sh

set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OMNIGENT_HOME="${OMNIGENT_CONFIG_HOME:-$HOME/.omnigent}"
CONFIG_FILE="$OMNIGENT_HOME/config.yaml"
AGENTS_DIR="$OMNIGENT_HOME/agents"
ADDITIONS_FILE="$REPO_DIR/deploy/config/omnigent-config.cv-lab.yaml"

LOCAL_LLM_BASE_URL="${LOCAL_LLM_BASE_URL:-http://localhost:11434/v1}"
LOCAL_LLM_MODEL="${LOCAL_LLM_MODEL:-}"

echo "== cv-lab setup =="

# ── 1. Roster preflight — same idea as polly's own preflight: tell the user
# what's missing rather than failing silently later. ────────────────────────
missing=()
for bin in claude gemini pi omnigent; do
  if ! command -v "$bin" >/dev/null 2>&1; then
    missing+=("$bin")
  fi
done

if printf '%s\n' "${missing[@]}" | grep -qx omnigent; then
  echo "-- omnigent not found; installing via install_oss.sh --"
  curl -fsSL https://raw.githubusercontent.com/omnigent-ai/omnigent/main/scripts/install_oss.sh | sh
  missing=("${missing[@]/omnigent}")
fi

for bin in "${missing[@]}"; do
  [ -z "$bin" ] && continue
  echo "WARNING: '$bin' not found on PATH — install/log in to it before running cv-lab, or the corresponding worker will fail its boot preflight." >&2
done

if [ -z "$LOCAL_LLM_MODEL" ]; then
  echo "WARNING: LOCAL_LLM_MODEL not set — the 'explore' worker and the routing-judge block will be written with a placeholder you must edit by hand." >&2
fi

mkdir -p "$OMNIGENT_HOME" "$AGENTS_DIR"

# ── 2. Merge (or hand off) the acp / providers / llm blocks. ───────────────
if [ ! -f "$CONFIG_FILE" ]; then
  echo "-- no existing config.yaml; writing a fresh one from the cv-lab template --"
  cp "$ADDITIONS_FILE" "$CONFIG_FILE"
  MERGED=1
elif command -v python3 >/dev/null 2>&1 && python3 -c "import yaml" >/dev/null 2>&1; then
  echo "-- existing config.yaml found; merging cv-lab blocks with PyYAML --"
  python3 "$REPO_DIR/scripts/_merge_omnigent_config.py" "$CONFIG_FILE" "$ADDITIONS_FILE"
  MERGED=1
else
  echo "-- existing config.yaml found, and PyYAML isn't available to merge safely --"
  echo "   Add the blocks from $ADDITIONS_FILE into $CONFIG_FILE by hand."
  MERGED=0
fi

if [ "${MERGED:-0}" = "1" ] && [ -n "$LOCAL_LLM_MODEL" ]; then
  # Fill in the placeholders now that we know the real model id.
  sed -i \
    -e "s#REPLACE_WITH_YOUR_LOCAL_MODEL_ID#${LOCAL_LLM_MODEL}#g" \
    -e "s#http://localhost:11434/v1#${LOCAL_LLM_BASE_URL}#g" \
    "$CONFIG_FILE"
fi

# ── 3. Make the pack runnable by name from anywhere. ────────────────────────
ln -sfn "$REPO_DIR/examples/cv-lab" "$AGENTS_DIR/cv-lab"

# ── 3b. Turn on the Usage web page by default. ──────────────────────────────
# usage_page is a real but off-by-default release flag (designs/FEATURE_FLAGS.md,
# omnigent/server/feature_flags.py) — resolved once from OMNIGENT_FEATURES at
# server boot, so it has to be set in the environment before `omnigent server`
# starts, not toggled in code. Appended idempotently to your shell profile
# rather than exported here, since `export` in this script's own subshell
# would not survive past this script exiting.
SHELL_PROFILE="${OMNIGENT_SHELL_PROFILE:-$HOME/.bashrc}"
FEATURES_LINE='export OMNIGENT_FEATURES="usage_page${OMNIGENT_FEATURES:+,$OMNIGENT_FEATURES}"'
if [ -f "$SHELL_PROFILE" ] && grep -qF 'OMNIGENT_FEATURES' "$SHELL_PROFILE"; then
  echo "-- $SHELL_PROFILE already sets OMNIGENT_FEATURES; leaving it alone --"
  echo "   Add 'usage_page' to its existing value by hand if the Usage page still isn't showing."
else
  {
    echo ''
    echo '# Added by omnigent scripts/setup_cv_lab.sh — shows the Usage web page by default.'
    echo "$FEATURES_LINE"
  } >>"$SHELL_PROFILE"
  echo "-- appended OMNIGENT_FEATURES=usage_page to $SHELL_PROFILE --"
fi

# ── 4. Fill the same placeholders into the checked-in agent YAMLs, IN A
# LOCAL COPY under ~/.omnigent — never edit the repo's own examples/ files in
# place, since those are meant to stay generic/shareable. ──────────────────
if [ -n "$LOCAL_LLM_MODEL" ]; then
  rm -f "$AGENTS_DIR/cv-lab"  # drop the symlink, replace with a real editable copy
  cp -r "$REPO_DIR/examples/cv-lab" "$AGENTS_DIR/cv-lab"
  sed -i "s#local/REPLACE_WITH_YOUR_LOCAL_MODEL_ID#local/${LOCAL_LLM_MODEL}#g" \
    "$AGENTS_DIR/cv-lab/agents/explore/config.yaml"
fi

echo
echo "== done =="
echo "Run it with:  omnigent run cv-lab"
echo "(or directly: omnigent run \"$AGENTS_DIR/cv-lab\")"
echo "Usage web page: open a NEW shell (or 'source $SHELL_PROFILE') before"
echo "'omnigent server' so it picks up OMNIGENT_FEATURES=usage_page."
if [ -z "$LOCAL_LLM_MODEL" ]; then
  echo
  echo "Still TODO by hand (LOCAL_LLM_MODEL wasn't set):"
  echo "  - $AGENTS_DIR/cv-lab/agents/explore/config.yaml -> executor.config.model"
  echo "  - $CONFIG_FILE -> providers.local / llm.model"
fi
for bin in "${missing[@]}"; do
  [ -z "$bin" ] && continue
  echo "Still TODO: install/authenticate '$bin' — its cv-lab worker will fail preflight until it's on PATH."
done
