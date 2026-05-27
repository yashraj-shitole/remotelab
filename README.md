# VS Code Mobile Copilot Companion

A mobile-first companion surface for controlling AI coding work while VS Code stays open on the workstation.

The system is split into four workspaces:

- `packages/extension`: VS Code extension that owns local execution, terminals, workspace state, git, diagnostics, tasks, and Copilot CLI sessions.
- `packages/relay`: cloud relay server that routes WebSocket messages between the phone and VS Code.
- `apps/mobile`: Angular mobile web app using the austere Bugatti-inspired design system requested for the product surface.
- `packages/shared`: shared protocol contracts.

## Current Terminal Contract

VS Code can list and send input to existing terminals, but it does not expose full historical terminal scrollback to extensions. This project supports existing VS Code terminals for discovery, focus, and input, and streams output from shell-integration executions when VS Code exposes it.

For reliable live output on the phone, create a managed terminal from the companion. Managed terminals are backed by the extension and mirrored to the mobile app.

## Copilot CLI Contract

The extension starts or resumes local Copilot CLI sessions inside managed terminals. The first supported flows are:

- Continue latest local session with `copilot --continue --remote`.
- Resume a session picker with `copilot --resume --remote`.
- Start a new remote-enabled CLI session with `copilot --remote`.

These flags are based on the current GitHub Copilot CLI command reference.

## Development

Install dependencies:

```powershell
npm install
```

Build everything:

```powershell
npm run build
```

Run the relay locally for development:

```powershell
npm run dev:relay
```

Run the Angular mobile app:

```powershell
npm run dev:mobile
```

Build/watch the VS Code extension:

```powershell
npm run dev:extension
```

## Security Notes

Cloud relay mode is powerful. Treat the pairing code and relay secret like credentials. The relay does not execute commands, but a paired phone can ask the extension to run allowed local actions. VS Code command execution is allowlisted by default; set `companion.commandAllowlist` to add more commands or `*` only for trusted personal use.
