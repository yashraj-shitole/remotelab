import * as vscode from "vscode";
import { createEnvelope, TerminalOutputEvent } from "@companion/shared";
import { getConfig } from "./config";
import { CloudRelayClient } from "./relay/CloudRelayClient";
import { CommandRouter } from "./services/CommandRouter";
import { CopilotCliService } from "./services/CopilotCliService";
import { DiagnosticsService } from "./services/DiagnosticsService";
import { GitService } from "./services/GitService";
import { TaskService } from "./services/TaskService";
import { TerminalService } from "./services/TerminalService";
import { VSCodeCommandService } from "./services/VSCodeCommandService";
import { WorkspaceService } from "./services/WorkspaceService";

let app: CompanionApp | undefined;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  app = new CompanionApp(context);
  context.subscriptions.push(app);
  app.registerCommands();

  if (getConfig().autoConnect) {
    app.connectRelay();
  }
}

export function deactivate(): void {
  app?.dispose();
}

class CompanionApp implements vscode.Disposable {
  private readonly output = vscode.window.createOutputChannel("Mobile Companion");
  private readonly relay: CloudRelayClient;
  private readonly terminals: TerminalService;
  private readonly router: CommandRouter;
  private readonly disposables: vscode.Disposable[] = [];
  private snapshotTimer?: NodeJS.Timeout;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.relay = new CloudRelayClient(this.output, getConfig, async (envelope) => {
      await this.router.handle(envelope);
    });

    this.terminals = new TerminalService(this.output, (event) => this.sendTerminalOutput(event));
    const diagnostics = new DiagnosticsService();
    const git = new GitService();
    const workspace = new WorkspaceService(this.terminals, diagnostics, git);
    const copilot = new CopilotCliService(this.terminals);
    const tasks = new TaskService();
    const commands = new VSCodeCommandService();

    this.router = new CommandRouter(
      (envelope) => this.relay.send(envelope),
      workspace,
      this.terminals,
      copilot,
      diagnostics,
      git,
      tasks,
      commands
    );
  }

  registerCommands(): void {
    this.disposables.push(
      vscode.commands.registerCommand("companion.connectRelay", () => this.connectRelay()),
      vscode.commands.registerCommand("companion.disconnectRelay", () => this.disconnectRelay()),
      vscode.commands.registerCommand("companion.showPairingCode", () => this.showPairingCode()),
      vscode.commands.registerCommand("companion.createManagedTerminal", async () => {
        await this.terminals.createManagedTerminal({ name: "Companion Terminal" });
        await this.router.pushSnapshot();
      }),
      vscode.commands.registerCommand("companion.continueCopilotCli", async () => {
        const copilot = new CopilotCliService(this.terminals);
        await copilot.continueLatest();
        await this.router.pushSnapshot();
      })
    );

    this.disposables.push(
      vscode.window.onDidOpenTerminal(() => this.queueSnapshotPush()),
      vscode.window.onDidCloseTerminal(() => this.queueSnapshotPush()),
      vscode.window.onDidChangeActiveTextEditor(() => this.queueSnapshotPush()),
      vscode.window.onDidChangeTextEditorSelection(() => this.queueSnapshotPush()),
      vscode.languages.onDidChangeDiagnostics(() => this.queueSnapshotPush()),
      vscode.workspace.onDidSaveTextDocument(() => this.queueSnapshotPush())
    );

    this.context.subscriptions.push(...this.disposables);
  }

  connectRelay(): void {
    this.relay.connect();
    const config = getConfig();
    void vscode.window.showInformationMessage(`Companion relay connecting. Pairing code: ${config.pairingCode}`);
  }

  disconnectRelay(): void {
    this.relay.disconnect();
    void vscode.window.showInformationMessage("Companion relay disconnected.");
  }

  showPairingCode(): void {
    const config = getConfig();
    this.output.show(true);
    this.output.appendLine(`Pairing code: ${config.pairingCode}`);
    this.output.appendLine(`Relay URL: ${config.relayUrl}`);
    void vscode.window.showInformationMessage(`Companion pairing code: ${config.pairingCode}`);
  }

  dispose(): void {
    if (this.snapshotTimer) {
      clearTimeout(this.snapshotTimer);
    }
    this.relay.dispose();
    this.terminals.dispose();
    this.output.dispose();
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }

  private sendTerminalOutput(event: TerminalOutputEvent): void {
    this.relay.send(createEnvelope("terminal.output", event, { source: "extension", target: "mobile" }));
  }

  private queueSnapshotPush(): void {
    if (this.snapshotTimer) {
      clearTimeout(this.snapshotTimer);
    }

    this.snapshotTimer = setTimeout(() => {
      void this.router.pushSnapshot();
    }, 500);
  }
}
