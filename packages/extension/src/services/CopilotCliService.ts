import * as vscode from "vscode";
import { TerminalSummary } from "@companion/shared";
import { getConfig } from "../config";
import { TerminalService } from "./TerminalService";

export class CopilotCliService {
  constructor(private readonly terminals: TerminalService) {}

  async startNew(cwd?: string): Promise<TerminalSummary> {
    const terminal = await this.terminals.createManagedTerminal({
      name: "Copilot CLI",
      kind: "copilot-cli",
      cwd: cwd ?? getWorkspaceRoot()
    });
    await this.terminals.execute(terminal.id, `${getConfig().copilotCliPath} --remote`);
    return terminal;
  }

  async continueLatest(cwd?: string): Promise<TerminalSummary> {
    const terminal = await this.terminals.createManagedTerminal({
      name: "Copilot CLI Continue",
      kind: "copilot-cli",
      cwd: cwd ?? getWorkspaceRoot()
    });
    await this.terminals.execute(terminal.id, `${getConfig().copilotCliPath} --continue --remote`);
    return terminal;
  }

  async resume(cwd?: string): Promise<TerminalSummary> {
    const terminal = await this.terminals.createManagedTerminal({
      name: "Copilot CLI Resume",
      kind: "copilot-cli",
      cwd: cwd ?? getWorkspaceRoot()
    });
    await this.terminals.execute(terminal.id, `${getConfig().copilotCliPath} --resume --remote`);
    return terminal;
  }

  async sendPrompt(terminalId: string, prompt: string): Promise<TerminalSummary | undefined> {
    return this.terminals.input(terminalId, `${prompt}\r`);
  }
}

function getWorkspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}
