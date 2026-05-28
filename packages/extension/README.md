# RemoteLab for VS Code

RemoteLab turns VS Code into a workstation you can control from your phone.
It connects your editor to the RemoteLab cloud relay and mirrors useful workspace state to the mobile app.

## Features

- Connect and disconnect VS Code from the RemoteLab cloud relay.
- Pair your phone with a one-scan QR flow.
- Show pairing code and relay URL for manual pairing.
- Create managed terminals with live output streaming for the phone UI.
- Continue your latest GitHub Copilot CLI session from a managed terminal.
- Allow controlled remote execution of selected VS Code commands.

## Commands

Use the Command Palette and run:

- RemoteLab: Connect Cloud Relay
- RemoteLab: Disconnect Cloud Relay
- RemoteLab: Show Pairing Code
- RemoteLab: Show Pairing QR
- RemoteLab: Create Managed Terminal
- RemoteLab: Continue Copilot CLI Session

## Quick Start

1. Install the extension.
2. Run RemoteLab: Show Pairing QR.
3. Scan the QR code using your phone camera.
4. Open the link and connect from the mobile app.

If you prefer manual pairing:

1. Run RemoteLab: Show Pairing Code.
2. Enter the pairing code and relay URL in the mobile app.

## Settings

RemoteLab contributes the following settings:

- remotelab.relayUrl
  Cloud relay WebSocket URL.
  Default: wss://remotelab-relay.onrender.com/relay

- remotelab.relaySecret
  Optional relay admission secret.

- remotelab.pairingCode
  Pairing code shared with the mobile app. If empty, a temporary code is generated per session.

- remotelab.mobilePairingUrl
  URL opened by pairing QR scans.
  Default: https://remotelab.live/home

- remotelab.deviceName
  Workstation name shown in mobile UI.

- remotelab.autoConnect
  Connect to relay automatically on VS Code startup.

- remotelab.copilotCliPath
  Command used to launch GitHub Copilot CLI.
  Default: copilot

- remotelab.terminalShell
  Shell used for managed terminals. Empty means platform default.

- remotelab.terminalShellArgs
  Arguments passed to the managed terminal shell.

- remotelab.commandAllowlist
  VS Code command IDs that mobile can invoke. Use * only on trusted personal setups.

## Security Notes

- Treat pairing codes and relay secrets like credentials.
- A paired mobile device can request local actions allowed by your settings.
- Keep command allowlist narrow for safer operation.

## Limitations

- VS Code does not expose complete terminal scrollback history to extensions.
- For reliable live output in the phone UI, use RemoteLab managed terminals.

## Links

- Mobile app: https://remotelab.live/home