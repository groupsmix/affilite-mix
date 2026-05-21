# G-53: Project-level Makefile.
# Thin dispatch into the scripts/ directory; most day-to-day work still
# goes through npm scripts defined in package.json.

.PHONY: help panic

help:
	@echo "Targets:"
	@echo "  make panic            Break-glass: rotate secrets, flush KV, rollback, purge cache."
	@echo "                        Runs in DRY-RUN mode by default. Set CONFIRM=i-understand to execute."
	@echo "                        See docs/pre-launch.md and docs/secrets-rotation-runbook.md."

# Break-glass recovery. Safe to run anytime — defaults to dry-run.
# Example (real):
#   CONFIRM=i-understand WORKER_NAME=affilite-mix CLOUDFLARE_ZONE_ID=xxx make panic
panic:
	@./scripts/panic.sh
