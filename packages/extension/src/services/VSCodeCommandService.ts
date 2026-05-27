import * as vscode from "vscode";
import { getConfig } from "../config";

export class VSCodeCommandService {
  async execute(commandId: string, args: unknown[] = []): Promise<{ commandId: string; allowed: boolean }> {
    const allowlist = getConfig().commandAllowlist;
    const allowed = allowlist.includes("*") || allowlist.includes(commandId);

    if (!allowed) {
      throw new Error(`Command is not allowlisted: ${commandId}`);
    }

    await vscode.commands.executeCommand(commandId, ...args);
    return { commandId, allowed };
  }
}
