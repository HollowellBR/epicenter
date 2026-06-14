# Steno

Open-source, local-first voice transcription app. Monorepo with Tauri desktop app and Svelte UI.

Structure: `apps/steno/` (Tauri app), `packages/ui/` (shadcn-svelte components), `packages/config/` (shared config), `packages/constants/` (shared constants), `packages/svelte-utils/` (Svelte utilities).

Always use bun: Prefer `bun` over npm, yarn, pnpm, and node. Use `bun run`, `bun test`, `bun install`, and `bun x` (instead of npx).

Skills: Task-specific instructions live in `.claude/skills/`. Load on-demand based on the task.

Destructive actions need approval: Force pushes, hard resets (`--hard`), branch deletions.

Token-efficient execution: For expensive operations (tests, builds, commits), delegate to sub-agent with only the command. Instruct it to execute without re-analyzing.

Git worktrees: When in `.conductor/` directories, all file operations must use that worktree path, not the parent repo.
