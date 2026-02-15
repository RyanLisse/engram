SHELL := /bin/bash
.SHELLFLAGS := -euo pipefail -c

CLAUDE_DEST ?= .claude
OPENCLAW_PLUGIN_DIR ?= plugins/openclaw
OPENCLAW_HOOK_NAME ?= openclaw-plugin
OPENCLAW_HOOKS_HOME ?= $(HOME)/.openclaw/hooks
FORCE ?= 0
CLAUDE_HOOK_SOURCE := plugins/claude-code/hooks

.PHONY: help hooks-install-claude hooks-install-openclaw hooks-install-both harness-check harness-validate harness-install-pre-commit

help:
	@echo "Targets:"
	@echo "  make hooks-install-claude [CLAUDE_DEST=/path/to/.claude]"
	@echo "  make hooks-install-openclaw [OPENCLAW_PLUGIN_DIR=plugins/openclaw] [FORCE=1]"
	@echo "  make hooks-install-both [CLAUDE_DEST=...] [OPENCLAW_PLUGIN_DIR=...]"
	@echo "  make harness-validate       - Run golden principles validation"
	@echo "  make harness-install-pre-commit - Install pre-commit hook for validation"

hooks-install-claude:
	mkdir -p "$(CLAUDE_DEST)/hooks/scripts"
	cp "$(CLAUDE_HOOK_SOURCE)/hooks.json" "$(CLAUDE_DEST)/hooks/hooks.json"
	cp "$(CLAUDE_HOOK_SOURCE)/scripts/"*.sh "$(CLAUDE_DEST)/hooks/scripts/"
	chmod +x "$(CLAUDE_DEST)/hooks/scripts/"*.sh
	@echo "Installed Claude hooks at $(CLAUDE_DEST)/hooks"

hooks-install-openclaw:
	@if ! command -v openclaw >/dev/null 2>&1; then \
		echo "openclaw CLI not found in PATH"; \
		exit 1; \
	fi
	@if [[ "$(FORCE)" == "1" ]] && [[ -d "$(OPENCLAW_HOOKS_HOME)/$(OPENCLAW_HOOK_NAME)" ]]; then \
		rm -rf "$(OPENCLAW_HOOKS_HOME)/$(OPENCLAW_HOOK_NAME)"; \
	fi
	openclaw hooks install "$(OPENCLAW_PLUGIN_DIR)"
	@echo "Installed OpenClaw hook packs from $(OPENCLAW_PLUGIN_DIR)"

hooks-install-both: hooks-install-claude hooks-install-openclaw
	@echo "Installed both Claude and OpenClaw hooks"

harness-check:
	@test -f AGENTS.md
	@test -f docs/GOLDEN-PRINCIPLES.md
	@tmpdir="$$(mktemp -d)"; \
		make hooks-install-claude CLAUDE_DEST="$$tmpdir/.claude"; \
		test -f "$$tmpdir/.claude/hooks/hooks.json"; \
		test -x "$$tmpdir/.claude/hooks/scripts/session-start.sh"; \
		rm -rf "$$tmpdir"
	@echo "Harness checks passed"

harness-validate:
	npx tsx scripts/validate-golden-principles.ts

harness-install-pre-commit:
	@echo '#!/bin/bash' > .git/hooks/pre-commit
	@echo 'npx tsx scripts/validate-golden-principles.ts' >> .git/hooks/pre-commit
	@echo 'exit $$?' >> .git/hooks/pre-commit
	@chmod +x .git/hooks/pre-commit
	@echo "Pre-commit hook installed at .git/hooks/pre-commit"
