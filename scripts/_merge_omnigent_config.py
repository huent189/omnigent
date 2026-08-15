#!/usr/bin/env python3
"""Merge cv-lab's acp/providers/llm blocks into an existing ~/.omnigent/config.yaml.

Called by setup_cv_lab.sh. Not a general-purpose YAML merger: it only touches
the three top-level keys cv-lab needs (acp, providers, llm), leaves everything
else in the existing config untouched, and never overwrites a key that's
already set to something other than what cv-lab would write (it appends /
adds-if-missing instead, so a hand-tuned existing setup isn't clobbered).
"""

from __future__ import annotations

import sys

import yaml


def merge_acp_agents(existing: dict, additions: dict) -> None:
    new_agents = additions.get("acp", {}).get("agents", [])
    if not new_agents:
        return
    existing.setdefault("acp", {}).setdefault("agents", [])
    existing_names = {a.get("name") for a in existing["acp"]["agents"] if isinstance(a, dict)}
    for agent in new_agents:
        if agent.get("name") not in existing_names:
            existing["acp"]["agents"].append(agent)


def merge_providers(existing: dict, additions: dict) -> None:
    new_providers = additions.get("providers", {})
    if not new_providers:
        return
    existing.setdefault("providers", {})
    for name, cfg in new_providers.items():
        if name not in existing["providers"]:
            existing["providers"][name] = cfg
        else:
            print(
                f"  (skipping providers.{name} — already present in config.yaml, "
                "not overwriting)",
                file=sys.stderr,
            )


def merge_llm(existing: dict, additions: dict) -> None:
    new_llm = additions.get("llm")
    if not new_llm:
        return
    if "llm" in existing:
        print(
            "  (skipping llm: block — already present in config.yaml; merge "
            "deploy/config/omnigent-config.cv-lab.yaml's llm: block by hand "
            "if you want the local model as the routing judge)",
            file=sys.stderr,
        )
        return
    existing["llm"] = new_llm


def main() -> None:
    config_path, additions_path = sys.argv[1], sys.argv[2]

    with open(config_path, encoding="utf-8") as f:
        existing = yaml.safe_load(f) or {}

    with open(additions_path, encoding="utf-8") as f:
        additions = yaml.safe_load(f) or {}

    merge_acp_agents(existing, additions)
    merge_providers(existing, additions)
    merge_llm(existing, additions)

    with open(config_path, "w", encoding="utf-8") as f:
        yaml.safe_dump(existing, f, sort_keys=False, default_flow_style=False)


if __name__ == "__main__":
    main()
