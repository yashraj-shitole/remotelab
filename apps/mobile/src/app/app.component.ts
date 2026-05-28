import { CommonModule } from "@angular/common";
import { takeUntilDestroyed } from "@angular/core/rxjs-interop";
import { Component, DestroyRef, ViewEncapsulation, computed, inject, signal } from "@angular/core";
import { NavigationEnd, Router } from "@angular/router";
import {
  DiagnosticSnapshot,
  FileContentSnapshot,
  FileMatch,
  GitStatusSnapshot,
  TaskSummary,
  TrackpadClickRequest,
  TrackpadMoveRequest,
  TrackpadScrollRequest
} from "@remotelab/shared";
import { filter } from "rxjs/operators";
import { AiSectionComponent } from "./features/ai/ai-section.component";
import { TerminalSectionComponent } from "./features/terminal/terminal-section.component";
import { TrackpadSectionComponent } from "./features/trackpad/trackpad-section.component";
import { WorkspaceSectionComponent } from "./features/workspace/workspace-section.component";
import { ActivityFeedComponent } from "./layout/activity-feed.component";
import { BottomPillNavComponent } from "./layout/bottom-pill-nav.component";
import { ConnectionSectionComponent } from "./layout/connection-section.component";
import { HeroSectionComponent } from "./layout/hero-section.component";
import { PairingPopupComponent } from "./layout/pairing-popup.component";
import { TopNavComponent } from "./layout/top-nav.component";
import { ConnectionSettings, RelayClientService } from "./core/services/relay-client.service";
import { AppSection } from "./core/types/app-section.type";

type PairingLinkPayload = {
  v?: number;
  relayUrl?: unknown;
  pairingCode?: unknown;
  relaySecret?: unknown;
  expiresAt?: unknown;
  autoConnect?: unknown;
};

const pairingParamNames = ["pair", "relayUrl", "pairingCode", "relaySecret", "autoConnect"];

@Component({
  selector: "app-root",
  standalone: true,
  imports: [
    CommonModule,
    TopNavComponent,
    PairingPopupComponent,
    HeroSectionComponent,
    ConnectionSectionComponent,
    AiSectionComponent,
    TerminalSectionComponent,
    TrackpadSectionComponent,
    WorkspaceSectionComponent,
    ActivityFeedComponent,
    BottomPillNavComponent
  ],
  templateUrl: "./app.component.html",
  styleUrls: ["./app.component.scss", "./common.css"],
  encapsulation: ViewEncapsulation.None
})
export class AppComponent {
  readonly relay = inject(RelayClientService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);
  readonly section = signal<AppSection>("home");
  readonly pairingPopupOpen = signal(false);
  readonly settings = signal(this.relay.loadSettings());
  readonly prompt = signal("");
  readonly terminalCommand = signal("");
  readonly filePattern = signal("**/*.{ts,tsx,js,json,md,scss,html}");
  readonly selectedFile = signal<FileContentSnapshot | undefined>(undefined);
  readonly filePreviewLoading = signal(false);

  private pendingTrackpadMove: TrackpadMoveRequest | undefined;
  private trackpadMoveInFlight = false;

  readonly statusLabel = computed(() => this.relay.status().toUpperCase());
  readonly workspaceName = computed(() => this.relay.snapshot()?.workspaceName ?? "NO WORKSPACE");
  readonly diagnosticsTotal = computed(() => this.relay.diagnostics()?.total ?? 0);

  constructor() {
    this.section.set(this.sectionFromUrl(this.router.url));
    this.router.events
      .pipe(
        filter((event): event is NavigationEnd => event instanceof NavigationEnd),
        takeUntilDestroyed(this.destroyRef)
      )
      .subscribe(() => this.section.set(this.sectionFromUrl(this.router.url)));

    this.applyPairingFromLocation();
  }

  connect(): void {
    this.relay.connect(this.settings());
  }

  openPairingPopup(): void {
    this.pairingPopupOpen.set(true);
  }

  closePairingPopup(): void {
    this.pairingPopupOpen.set(false);
  }

  connectFromPairingPopup(): void {
    this.connect();
    this.closePairingPopup();
  }

  updateSetting(key: "relayUrl" | "pairingCode" | "relaySecret" | "deviceName", value: string): void {
    this.settings.update((settings) => ({ ...settings, [key]: value }));
  }

  setSection(section: AppSection): void {
    if (section === this.section()) {
      return;
    }
    void this.router.navigate([section]);
  }

  async continueCopilot(): Promise<void> {
    const terminal = await this.relay.command<{ id: string }>("copilot.continue");
    this.relay.selectTerminal(terminal.id);
  }

  async resumeCopilot(): Promise<void> {
    const terminal = await this.relay.command<{ id: string }>("copilot.resume");
    this.relay.selectTerminal(terminal.id);
  }

  async newCopilot(): Promise<void> {
    const terminal = await this.relay.command<{ id: string }>("copilot.new");
    this.relay.selectTerminal(terminal.id);
  }

  sendPrompt(): void {
    const text = this.prompt().trim();
    const terminalId = this.relay.activeTerminalId();
    if (!text || !terminalId) {
      return;
    }
    void this.relay.command("copilot.prompt", { terminalId, prompt: text });
    this.prompt.set("");
  }

  async createTerminal(): Promise<void> {
    const terminal = await this.relay.command<{ id: string }>("terminal.create", { name: "Phone Terminal" });
    this.relay.selectTerminal(terminal.id);
  }

  selectTerminal(id: string): void {
    this.relay.selectTerminal(id);
  }

  showTerminal(): void {
    const terminalId = this.relay.activeTerminalId();
    if (!terminalId) {
      return;
    }
    void this.relay.command("terminal.show", { terminalId });
  }

  clearTerminal(): void {
    this.relay.clearTerminalBuffer();
  }

  killTerminal(): void {
    const terminalId = this.relay.activeTerminalId();
    if (!terminalId) {
      return;
    }
    void this.relay.command("terminal.kill", { terminalId });
  }

  resizeTerminal(dimensions: { columns: number; rows: number }): void {
    this.relay.resizeTerminal(this.relay.activeTerminalId(), dimensions.columns, dimensions.rows);
  }

  runTerminalCommand(): void {
    const command = this.terminalCommand().trim();
    const terminalId = this.relay.activeTerminalId();
    if (!command || !terminalId) {
      return;
    }
    void this.relay.command("terminal.execute", { terminalId, command });
    this.terminalCommand.set("");
  }

  async loadTasks(): Promise<void> {
    const tasks = await this.relay.command<TaskSummary[]>("task.list");
    this.relay.tasks.set(tasks);
  }

  runTask(id: string): void {
    void this.relay.command("task.run", { id });
  }

  refreshGit(): void {
    void this.relay.command<GitStatusSnapshot>("git.status").then((status) => this.relay.git.set(status));
  }

  refreshDiagnostics(): void {
    void this.relay.command<DiagnosticSnapshot>("diagnostics.list").then((diagnostics) => this.relay.diagnostics.set(diagnostics));
  }

  findFiles(): void {
    void this.relay.command<FileMatch[]>("workspace.findFiles", { pattern: this.filePattern(), limit: 60 }).then((files) => this.relay.files.set(files));
  }

  async viewFile(path: string): Promise<void> {
    this.filePreviewLoading.set(true);
    try {
      const response = await this.relay.command<unknown>("workspace.readFile", { path, maxBytes: 120_000 });
      const file = this.normalizeFileSnapshot(response, path);
      this.selectedFile.set(file);
      this.relay.lastError.set("");
    } catch (error) {
      this.selectedFile.set(undefined);
      this.relay.lastError.set(error instanceof Error ? error.message : "Failed to load file preview");
    } finally {
      this.filePreviewLoading.set(false);
    }
  }

  openFile(path: string): void {
    void this.relay.command("editor.openFile", { path });
  }

  executeCommand(commandId: string): void {
    void this.relay.command("vscode.command", { commandId });
  }

  sendTrackpadMove(delta: TrackpadMoveRequest): void {
    if (!this.isRelayConnected()) {
      return;
    }

    const pending = this.pendingTrackpadMove;
    if (pending) {
      pending.deltaX += delta.deltaX;
      pending.deltaY += delta.deltaY;
    } else {
      this.pendingTrackpadMove = { deltaX: delta.deltaX, deltaY: delta.deltaY };
    }

    if (!this.trackpadMoveInFlight) {
      void this.flushTrackpadMoveQueue();
    }
  }

  sendTrackpadScroll(payload: TrackpadScrollRequest): void {
    if (!this.isRelayConnected()) {
      return;
    }

    void this.relay.command("trackpad.scroll", { deltaY: payload.deltaY });
  }

  sendTrackpadClick(button: TrackpadClickRequest["button"]): void {
    if (!this.isRelayConnected()) {
      return;
    }

    void this.relay.command("trackpad.click", { button });
  }

  private normalizeFileSnapshot(value: unknown, fallbackPath: string): FileContentSnapshot {
    if (!value || typeof value !== "object") {
      throw new Error("File preview is unavailable: invalid response from extension. Reload the extension and reconnect.");
    }

    const candidate = value as Partial<FileContentSnapshot> & { text?: unknown };
    const resolvedPath = typeof candidate.path === "string" && candidate.path ? candidate.path : fallbackPath;
    const content = typeof candidate.content === "string" ? candidate.content : typeof candidate.text === "string" ? candidate.text : "";

    return {
      path: resolvedPath,
      relativePath: typeof candidate.relativePath === "string" && candidate.relativePath ? candidate.relativePath : resolvedPath,
      content,
      byteLength: typeof candidate.byteLength === "number" && Number.isFinite(candidate.byteLength) ? candidate.byteLength : content.length,
      truncated: Boolean(candidate.truncated),
      isBinary: Boolean(candidate.isBinary)
    };
  }

  private applyPairingFromLocation(): void {
    if (typeof window === "undefined") {
      return;
    }

    const current = new URL(window.location.href);
    const hashParams = new URLSearchParams(current.hash.startsWith("#") ? current.hash.slice(1) : current.hash);
    const encodedPayload = hashParams.get("pair") ?? current.searchParams.get("pair");

    let importedSettings: Pick<ConnectionSettings, "relayUrl" | "pairingCode" | "relaySecret"> | undefined;
    let shouldAutoConnect = true;

    if (encodedPayload) {
      const payload = this.decodePairingPayload(encodedPayload);
      if (!payload) {
        this.relay.lastError.set("Pairing QR is invalid. Generate a new pairing QR from VS Code.");
        this.clearPairingParamsFromLocation(current);
        return;
      }

      if (typeof payload.expiresAt === "string") {
        const expiresAt = Date.parse(payload.expiresAt);
        if (!Number.isNaN(expiresAt) && expiresAt < Date.now()) {
          this.relay.lastError.set("Pairing QR has expired. Generate a new pairing QR from VS Code.");
          this.clearPairingParamsFromLocation(current);
          return;
        }
      }

      importedSettings = this.normalizeImportedSettings(payload);
      if (!importedSettings) {
        this.relay.lastError.set("Pairing QR is missing relay settings.");
        this.clearPairingParamsFromLocation(current);
        return;
      }

      if (typeof payload.autoConnect === "boolean") {
        shouldAutoConnect = payload.autoConnect;
      }
    } else {
      const relayUrl = current.searchParams.get("relayUrl") ?? hashParams.get("relayUrl");
      const pairingCode = current.searchParams.get("pairingCode") ?? hashParams.get("pairingCode");
      const relaySecret = current.searchParams.get("relaySecret") ?? hashParams.get("relaySecret");

      if (!relayUrl || !pairingCode) {
        return;
      }

      importedSettings = this.normalizeImportedSettings({ relayUrl, pairingCode, relaySecret });
      if (!importedSettings) {
        this.relay.lastError.set("Pairing link is invalid.");
        this.clearPairingParamsFromLocation(current);
        return;
      }
    }

    const nextSettings: ConnectionSettings = {
      ...this.settings(),
      ...importedSettings
    };

    this.settings.set(nextSettings);
    this.relay.saveSettings(nextSettings);
    this.relay.lastError.set("");
    this.clearPairingParamsFromLocation(current);

    if (shouldAutoConnect) {
      this.relay.connect(nextSettings);
    }
  }

  private decodePairingPayload(encodedPayload: string): PairingLinkPayload | undefined {
    const decodedText = this.decodeBase64Url(encodedPayload);
    if (!decodedText) {
      return undefined;
    }

    try {
      const payload = JSON.parse(decodedText) as PairingLinkPayload;
      if (payload.v !== undefined && payload.v !== 1) {
        return undefined;
      }
      return payload;
    } catch {
      return undefined;
    }
  }

  private decodeBase64Url(value: string): string | undefined {
    try {
      const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
      const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
      const binary = window.atob(padded);
      const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    } catch {
      return undefined;
    }
  }

  private normalizeImportedSettings(payload: {
    relayUrl?: unknown;
    pairingCode?: unknown;
    relaySecret?: unknown;
  }): Pick<ConnectionSettings, "relayUrl" | "pairingCode" | "relaySecret"> | undefined {
    if (typeof payload.relayUrl !== "string" || typeof payload.pairingCode !== "string") {
      return undefined;
    }

    const relayUrl = payload.relayUrl.trim();
    const pairingCode = payload.pairingCode.trim();
    if (!relayUrl || !pairingCode) {
      return undefined;
    }

    let normalizedRelayUrl: string;
    try {
      const parsedRelayUrl = new URL(relayUrl);
      if (parsedRelayUrl.protocol !== "ws:" && parsedRelayUrl.protocol !== "wss:") {
        return undefined;
      }
      normalizedRelayUrl = parsedRelayUrl.toString();
    } catch {
      return undefined;
    }

    const relaySecret = typeof payload.relaySecret === "string" ? payload.relaySecret.trim() : "";
    return {
      relayUrl: normalizedRelayUrl,
      pairingCode,
      relaySecret
    };
  }

  private clearPairingParamsFromLocation(current: URL): void {
    const searchParams = new URLSearchParams(current.search);
    const hashParams = new URLSearchParams(current.hash.startsWith("#") ? current.hash.slice(1) : current.hash);

    for (const name of pairingParamNames) {
      searchParams.delete(name);
      hashParams.delete(name);
    }

    const nextSearch = searchParams.toString();
    const nextHash = hashParams.toString();
    const nextUrl = `${current.pathname}${nextSearch ? `?${nextSearch}` : ""}${nextHash ? `#${nextHash}` : ""}`;
    window.history.replaceState(window.history.state, "", nextUrl);
  }

  private sectionFromUrl(url: string): AppSection {
    const segment = url.split("?")[0].split("#")[0].replace(/^\/+/, "").split("/")[0];
    if (segment === "home" || segment === "terminal" || segment === "workspace" || segment === "ai" || segment === "trackpad") {
      return segment;
    }
    return "home";
  }

  private async flushTrackpadMoveQueue(): Promise<void> {
    this.trackpadMoveInFlight = true;

    while (this.pendingTrackpadMove && this.isRelayConnected()) {
      const delta = this.pendingTrackpadMove;
      this.pendingTrackpadMove = undefined;

      try {
        await this.relay.command("trackpad.move", { deltaX: delta.deltaX, deltaY: delta.deltaY });
      } catch {
        break;
      }
    }

    this.trackpadMoveInFlight = false;
  }

  private isRelayConnected(): boolean {
    return this.relay.status() === "connected";
  }
}
