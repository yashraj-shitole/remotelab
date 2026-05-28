import * as vscode from "vscode";
import { randomId } from "@remotelab/shared";

export interface RemoteLabConfig {
  relayUrl: string;
  relaySecret: string;
  pairingCode: string;
  mobilePairingUrl: string;
  deviceName: string;
  autoConnect: boolean;
  copilotCliPath: string;
  terminalShell: string;
  terminalShellArgs: string[];
  commandAllowlist: string[];
}

let generatedPairingCode: string | undefined;

export function getConfig(): RemoteLabConfig {
  const config = vscode.workspace.getConfiguration("remotelab");
  return {
    relayUrl: config.get("relayUrl", "wss://remotelab-relay.onrender.com/relay"),
    relaySecret: config.get("relaySecret", ""),
    pairingCode: config.get("pairingCode", "") || getGeneratedPairingCode(),
    mobilePairingUrl: config.get("mobilePairingUrl", "https://remotelab.live/home"),
    deviceName: config.get("deviceName", "VS Code Workstation"),
    autoConnect: config.get("autoConnect", false),
    copilotCliPath: config.get("copilotCliPath", "copilot"),
    terminalShell: config.get("terminalShell", ""),
    terminalShellArgs: config.get("terminalShellArgs", []),
    commandAllowlist: config.get("commandAllowlist", [])
  };
}

export function getGeneratedPairingCode(): string {
  if (!generatedPairingCode) {
    generatedPairingCode = randomId().replace(/[^a-z0-9]/gi, "").slice(0, 8).toUpperCase();
  }
  return generatedPairingCode;
}
