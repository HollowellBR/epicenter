# Contributing to Steno

Welcome! We're excited you're interested in contributing to Steno. This guide will help you get up and running quickly.

## Prerequisites

- **Bun**: We use Bun as our JavaScript runtime and package manager
  - Install from [bun.sh](https://bun.sh) if you don't have it
  - The repo requires Bun 1.2.19 or newer (automatically enforced)

## Getting Started

Steno is a monorepo containing the main transcription app and shared packages. The main application is located in `apps/steno`.

### Quick Setup

1. **Fork and clone the repository**

   Fork the repository and clone your fork:

   ```bash
   git clone https://github.com/<your-username>/steno.git
   cd steno
   ```

   > New to open source? Check out [How to Contribute to Open Source](https://egghead.io/courses/how-to-contribute-to-an-open-source-project-on-github) (free video series).

2. **Install dependencies**

   ```bash
   bun install
   ```

   > **Note**: If you see a version warning, run `bun upgrade` to update to the required version. The repository uses Bun 1.2.19 to ensure consistency across all contributors.

   > **Note**: Desktop app development requires external tools not installed by the command above. Install these manually.
   > (For example: [Rust](https://www.rust-lang.org/tools/install) and [CMake](https://cmake.org/download/))

3. **Navigate to the Steno app**

   ```bash
   cd apps/steno
   ```

4. **Start development**

   ```bash
   # Run both web and desktop mode
   bun dev

   # Or run just the web version
   bun dev:web
   ```

That's it! You're ready to start contributing.

## Project Structure

This is a monorepo with the following structure:

```
steno/
├── apps/
│   └── steno/          # Main transcription app
├── packages/
│   ├── config/         # Shared configuration
│   ├── constants/      # Shared constants
│   ├── svelte-utils/   # Svelte utilities
│   ├── ui/             # Shared UI components
│   └── ...
└── ...
```

### Where to Contribute

Currently, **Steno** (`apps/steno`) is the most mature application and the best place to start contributing. Check the [Steno README](apps/steno/README.md) for specific details about that application.

## Development Workflow

1. **Create a branch** for your feature or fix

   ```bash
   git checkout -b feat/your-feature-name
   ```

2. **Make your changes** following our coding standards (see below)

3. **Test your changes** thoroughly

   ```bash
   # Run tests if available
   bun test
   ```

4. **Commit using conventional commits**

   ```bash
   git commit -m "feat(steno): add new feature"
   ```

5. **Push and create a pull request**

   ```bash
   git push origin feat/your-feature-name
   ```

   Create a PR to merge your fork's branch into the main branch.
   GitHub usually shows a "Compare & pull request" banner for recent pushes.

<details>
<summary>Tips for new contributors</summary>

**Keeping your fork updated**

Before starting new work, sync with the main repo:

```bash
git fetch upstream
git checkout main
git merge upstream/main
```

> Note: Add the upstream remote to sync with the main repo:
>
> ```bash
> git remote add upstream https://github.com/<upstream-org>/steno.git
> ```

**If your PR has conflicts**

Rebase your branch on the latest main:

```bash
git fetch upstream
git rebase upstream/main
```

</details>

## Coding Standards

### TypeScript

- Use `type` instead of `interface`
- Prefer absolute imports over relative imports
- Use object method shorthand syntax when appropriate

### Svelte

- We use Svelte 5 with the latest runes syntax
- Follow shadcn-svelte patterns for UI components
- Use Tailwind CSS for styling

### Commits

We follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat`: New features
- `fix`: Bug fixes
- `docs`: Documentation changes
- `refactor`: Code refactoring
- `test`: Test additions or changes
- `chore`: Maintenance tasks

Examples:

- `feat(steno): add model selection for OpenAI providers`
- `fix(sound): resolve audio import paths`
- `docs: update contribution guidelines`

## Troubleshooting

### Version Mismatch Warning

If you see a warning about Bun version mismatch:

```bash
# Update to the latest Bun version
bun upgrade

# Or install the specific version mentioned in the warning
curl -fsSL https://bun.sh/install | bash -s "bun-v1.2.19"
```

### Installation Issues

- Make sure you're in the repository root when running `bun install`
- Clear the cache if you encounter issues: `bun pm cache rm`
- On Windows, you may need to run your terminal as Administrator

## Getting Help

- **Discord**: Join our community to get started contributing
- **Issues**: Check existing issues or create a new one
- **Documentation**: Each app has its own README with specific details

## Philosophy

We believe in:

- **Local-first**: Your data stays on your machine
- **Open source**: Everything is transparent and auditable
- **User ownership**: You own your data and choose your models
- **Simplicity**: Every change should be as simple as possible

## What We're Looking For

- Bug fixes and improvements to existing features
- Performance optimizations
- Documentation improvements
- New features that align with our local-first philosophy
- UI/UX enhancements

## Questions?

Feel free to:

- Open an issue for discussion
- Join our Discord and DM me directly to get started

Thank you for contributing to Steno! We're building something special together.
