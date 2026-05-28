import * as vscode from "vscode";
import { createEnvelope, TerminalOutputEvent } from "@remotelab/shared";
import QRCode from "qrcode";
import { getConfig, RemoteLabConfig } from "./config";
import { CloudRelayClient } from "./relay/CloudRelayClient";
import { CommandRouter } from "./services/CommandRouter";
import { CopilotCliService } from "./services/CopilotCliService";
import { DiagnosticsService } from "./services/DiagnosticsService";
import { GitService } from "./services/GitService";
import { TaskService } from "./services/TaskService";
import { TerminalService } from "./services/TerminalService";
import { TrackpadService } from "./services/TrackpadService";
import { VSCodeCommandService } from "./services/VSCodeCommandService";
import { WorkspaceService } from "./services/WorkspaceService";

let app: RemoteLabApp | undefined;

type PairingQrPayload = {
  v: 1;
  relayUrl: string;
  pairingCode: string;
  relaySecret?: string;
  issuedAt: string;
  expiresAt: string;
  autoConnect: boolean;
};

const pairingQrTtlMs = 10 * 60 * 1000;

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  app = new RemoteLabApp(context);
  context.subscriptions.push(app);
  app.registerCommands();

  if (getConfig().autoConnect) {
    app.connectRelay();
  }
}

export function deactivate(): void {
  app?.dispose();
}

class RemoteLabApp implements vscode.Disposable {
  private readonly output = vscode.window.createOutputChannel("RemoteLab");
  private readonly relay: CloudRelayClient;
  private readonly terminals: TerminalService;
  private readonly trackpad: TrackpadService;
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
    this.trackpad = new TrackpadService();

    this.router = new CommandRouter(
      (envelope) => this.relay.send(envelope),
      workspace,
      this.terminals,
      copilot,
      diagnostics,
      git,
      tasks,
      commands,
      this.trackpad
    );
  }

  registerCommands(): void {
    this.disposables.push(
      vscode.commands.registerCommand("remotelab.connectRelay", () => this.connectRelay()),
      vscode.commands.registerCommand("remotelab.disconnectRelay", () => this.disconnectRelay()),
      vscode.commands.registerCommand("remotelab.showPairingCode", () => this.showPairingCode()),
      vscode.commands.registerCommand("remotelab.showPairingQr", async () => this.showPairingQr()),
      vscode.commands.registerCommand("remotelab.createManagedTerminal", async () => {
        await this.terminals.createManagedTerminal({ name: "RemoteLab Terminal" });
        await this.router.pushSnapshot();
      }),
      vscode.commands.registerCommand("remotelab.continueCopilotCli", async () => {
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
    void vscode.window.showInformationMessage(`RemoteLab relay connecting. Pairing code: ${config.pairingCode}`);
  }

  disconnectRelay(): void {
    this.relay.disconnect();
    void vscode.window.showInformationMessage("RemoteLab relay disconnected.");
  }

  showPairingCode(): void {
    const config = getConfig();
    this.output.show(true);
    this.output.appendLine(`Pairing code: ${config.pairingCode}`);
    this.output.appendLine(`Relay URL: ${config.relayUrl}`);
    void vscode.window.showInformationMessage(`RemoteLab pairing code: ${config.pairingCode}`);
  }

  async showPairingQr(): Promise<void> {
    const config = getConfig();

    try {
      const { link, expiresAt } = this.createPairingLink(config);
      const qrCodeDataUrl = await QRCode.toDataURL(link, {
        errorCorrectionLevel: "M",
        margin: 1,
        width: 320
      });

      const panel = vscode.window.createWebviewPanel(
        "remotelab.pairingQr",
        "RemoteLab Pairing QR",
        vscode.ViewColumn.Active,
        {
          enableScripts: false,
          retainContextWhenHidden: false
        }
      );

      panel.webview.html = this.renderPairingQrHtml({
        qrCodeDataUrl,
        pairingCode: config.pairingCode,
        relayUrl: config.relayUrl,
        link,
        expiresAt
      });

      await vscode.env.clipboard.writeText(link);
      this.output.show(true);
      this.output.appendLine("Pairing QR generated and copied to clipboard.");
      this.output.appendLine(`Pairing code: ${config.pairingCode}`);
      this.output.appendLine(`Relay URL: ${config.relayUrl}`);
      void vscode.window.showInformationMessage("RemoteLab pairing link copied. Scan the QR with your phone camera.");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.output.appendLine(`Failed to generate pairing QR: ${message}`);
      void vscode.window.showErrorMessage(`RemoteLab could not generate a pairing QR code: ${message}`);
    }
  }

  dispose(): void {
    if (this.snapshotTimer) {
      clearTimeout(this.snapshotTimer);
    }
    this.relay.dispose();
    this.terminals.dispose();
    this.trackpad.dispose();
    this.output.dispose();
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }

  private sendTerminalOutput(event: TerminalOutputEvent): void {
    this.relay.send(createEnvelope("terminal.output", event, { source: "extension", target: "mobile" }));
  }

  private createPairingLink(config: RemoteLabConfig): { link: string; expiresAt: Date } {
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + pairingQrTtlMs);
    const payload: PairingQrPayload = {
      v: 1,
      relayUrl: config.relayUrl,
      pairingCode: config.pairingCode,
      issuedAt: issuedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      autoConnect: true
    };

    if (config.relaySecret) {
      payload.relaySecret = config.relaySecret;
    }

    const encodedPayload = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
    const link = new URL(config.mobilePairingUrl);
    const hashParams = new URLSearchParams(link.hash.startsWith("#") ? link.hash.slice(1) : link.hash);
    hashParams.set("pair", encodedPayload);
    link.hash = hashParams.toString();
    return { link: link.toString(), expiresAt };
  }

  private renderPairingQrHtml(params: {
    qrCodeDataUrl: string;
    pairingCode: string;
    relayUrl: string;
    link: string;
    expiresAt: Date;
  }): string {
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>RemoteLab Pairing QR</title>
    <style>
      :root {
        color-scheme: light dark;
      }

      body {
        margin: 0;
        font-family: Segoe UI, sans-serif;
        padding: 20px;
      }

      .panel {
        max-width: 520px;
        margin: 0 auto;
        display: grid;
        gap: 12px;
      }

      .code {
        margin: 0;
        padding: 6px 8px;
        border-radius: 8px;
        word-break: break-word;
        border: 1px solid color-mix(in oklab, CanvasText 16%, transparent);
      }

      img {
        width: min(320px, 100%);
        height: auto;
        background: white;
        border-radius: 12px;
      }

      .meta {
        margin: 0;
        opacity: 0.82;
      }
    </style>
  </head>
  <body>
    <main class="panel">
      <h1>Scan To Pair</h1>
      <p class="meta">Open your phone camera, scan this QR, and RemoteLab will import relay settings automatically.</p>
      <img src="${params.qrCodeDataUrl}" alt="RemoteLab pairing QR code">
      <p class="meta">Pairing code: ${escapeHtml(params.pairingCode)}</p>
      <p class="meta">Relay URL: ${escapeHtml(params.relayUrl)}</p>
      <p class="meta">Expires: ${escapeHtml(params.expiresAt.toLocaleString())}</p>
      <p class="code">${escapeHtml(params.link)}</p>
    </main>
  </body>
</html>`;
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

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
