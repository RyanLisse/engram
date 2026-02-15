set shell := ["bash", "-euo", "pipefail", "-c"]

source_dir := "plugins/claude-code/hooks"
default_claude_dest := ".claude"
default_openclaw_dest := "plugins/openclaw"

help:
  @echo "Hook install tasks"
  @echo "  just hooks-install-claude [dest]"
  @echo "  just hooks-install-openclaw [dest]"
  @echo "  just hooks-install-both [claude_dest] [openclaw_dest]"
  @echo ""
  @echo "Defaults:"
  @echo "  claude dest   = {{default_claude_dest}}"
  @echo "  openclaw dest = {{default_openclaw_dest}}"

hooks-install-claude dest=default_claude_dest:
  mkdir -p "{{dest}}/hooks/scripts"
  cp "{{source_dir}}/hooks.json" "{{dest}}/hooks/hooks.json"
  cp "{{source_dir}}/scripts/"*.sh "{{dest}}/hooks/scripts/"
  chmod +x "{{dest}}/hooks/scripts/"*.sh
  @echo "Installed Claude hooks to {{dest}}/hooks"

hooks-install-openclaw dest=default_openclaw_dest:
  mkdir -p "{{dest}}/hooks/scripts"
  cp "{{source_dir}}/hooks.json" "{{dest}}/hooks/hooks.json"
  cp "{{source_dir}}/scripts/"*.sh "{{dest}}/hooks/scripts/"
  chmod +x "{{dest}}/hooks/scripts/"*.sh
  @echo "Installed OpenClaw hooks to {{dest}}/hooks"
  @echo "Note: Verify your OpenClaw runtime loads this hooks path."

hooks-install-both claude_dest=default_claude_dest openclaw_dest=default_openclaw_dest:
  just hooks-install-claude "{{claude_dest}}"
  just hooks-install-openclaw "{{openclaw_dest}}"
