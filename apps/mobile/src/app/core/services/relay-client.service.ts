import { Injectable, computed, signal } from "@angular/core";
import {
  CommandRequest,
  CommandResponse,
  createEnvelope,
  DiagnosticSnapshot,
  FileMatch,
  GitStatusSnapshot,
  RelayEnvelope,
  RemoteLabCommand,
  TaskSummary,
  TerminalBufferSnapshot,
  TerminalOutputEvent,
  TerminalSummary,
  WorkspaceSnapshot
} from "@remotelab/shared";

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
  timeout: number;
};

export interface ConnectionSettings {
  relayUrl: string;
  pairingCode: string;
  relaySecret?: string;
  deviceName: string;
}

const storedSettingsKey = "remotelab.connectionSettings";

@Injectable({ providedIn: "root" })
export class RelayClientService {
  readonly status = signal<"disconnected" | "connecting" | "connected">("disconnected");
  readonly lastError = signal<string>("");
  readonly peerState = signal<string>("Awaiting relay");
  readonly snapshot = signal<WorkspaceSnapshot | undefined>(undefined);
  readonly terminals = signal<TerminalSummary[]>([]);
  readonly activeTerminalId = signal<string>("");
  readonly terminalBuffers = signal<Record<string, string>>({});
  readonly git = signal<GitStatusSnapshot | undefined>(undefined);
  readonly diagnostics = signal<DiagnosticSnapshot | undefined>(undefined);
  readonly tasks = signal<TaskSummary[]>([]);
  readonly files = signal<FileMatch[]>([]);
  readonly activity = signal<string[]>([]);

  readonly activeTerminal = computed(() => this.terminals().find((terminal) => terminal.id === this.activeTerminalId()));
  readonly activeTerminalOutput = computed(() => this.terminalBuffers()[this.activeTerminalId()] ?? "");

  private socket?: WebSocket;
  private readonly pending = new Map<string, PendingRequest>();
  private reconnectTimer?: number;
  private reconnectAttempt = 0;
  private manuallyDisconnected = false;
  private lastSettings?: ConnectionSettings;

  loadSettings(): ConnectionSettings {
    const fallback: ConnectionSettings = {
      relayUrl: "wss://remotelab-relay.onrender.com/relay",
      pairingCode: "",
      relaySecret: "",
      deviceName: "Phone"
    };

    try {
      return { ...fallback, ...JSON.parse(localStorage.getItem(storedSettingsKey) ?? "{}") };
    } catch {
      return fallback;
    }
  }

  saveSettings(settings: ConnectionSettings): void {
    localStorage.setItem(storedSettingsKey, JSON.stringify(settings));
  }

  connect(settings: ConnectionSettings): void {
    this.closeSocket();
    this.saveSettings(settings);
    this.lastSettings = settings;
    this.manuallyDisconnected = false;
    this.status.set("connecting");
    this.lastError.set("");
    this.log(`Connecting to ${settings.relayUrl}`);

    const url = new URL(settings.relayUrl);
    url.searchParams.set("role", "mobile");
    url.searchParams.set("pairingCode", settings.pairingCode);
    url.searchParams.set("deviceName", settings.deviceName);
    if (settings.relaySecret) {
      url.searchParams.set("secret", settings.relaySecret);
    }

    const socket = new WebSocket(url);
    this.socket = socket;
    socket.addEventListener("open", () => {
      if (this.socket !== socket) {
        return;
      }
      this.status.set("connected");
      this.reconnectAttempt = 0;
      this.log("Relay connected");
      this.send(createEnvelope("client.hello", { role: "mobile", deviceName: settings.deviceName }, { source: "mobile", target: "all" }));
      void this.command("snapshot.get").then((snapshot) => this.applySnapshot(snapshot as WorkspaceSnapshot));
    });
    socket.addEventListener("message", (event) => this.handleMessage(event.data));
    socket.addEventListener("close", () => {
      if (this.socket !== socket) {
        return;
      }
      this.status.set("disconnected");
      this.peerState.set("Relay disconnected");
      this.rejectPending("Relay disconnected");
      this.log("Relay disconnected");
      if (!this.manuallyDisconnected) {
        this.scheduleReconnect();
      }
    });
    socket.addEventListener("error", () => {
      if (this.socket !== socket) {
        return;
      }
      this.lastError.set("Relay connection failed");
      this.status.set("disconnected");
      this.log("Relay connection error");
    });
  }

  disconnect(): void {
    this.manuallyDisconnected = true;
    this.clearReconnect();
    this.closeSocket();
    this.rejectPending("Relay disconnected");
    this.status.set("disconnected");
  }

  async command<TData = unknown>(command: RemoteLabCommand, args: Record<string, unknown> = {}): Promise<TData> {
    if (this.socket?.readyState !== WebSocket.OPEN) {
      throw new Error("Relay is not connected");
    }

    const envelope = createEnvelope<CommandRequest>("command.request", { command, args }, { source: "mobile", target: "extension" });
    const promise = new Promise<TData>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        this.pending.delete(envelope.id);
        reject(new Error(`Command timed out: ${command}`));
        this.lastError.set(`Command timed out: ${command}`);
      }, 30000);

      this.pending.set(envelope.id, {
        resolve: (value) => resolve(value as TData),
        reject,
        timeout
      });
    });

    this.send(envelope);
    this.log(`Sent ${command}`);
    return promise;
  }

  commandNoWait(command: RemoteLabCommand, args: Record<string, unknown> = {}): void {
    if (this.socket?.readyState !== WebSocket.OPEN) {
      return;
    }

    this.send(createEnvelope<CommandRequest>("command.request", { command, args }, { source: "mobile", target: "extension" }));
  }

  selectTerminal(id: string): void {
    this.activeTerminalId.set(id);
    void this.loadTerminalBuffer(id);
  }

  appendTerminalInput(data: string): void {
    const terminalId = this.activeTerminalId();
    if (!terminalId) {
      return;
    }
    void this.command("terminal.input", { terminalId, data });
  }

  async loadTerminalBuffer(terminalId = this.activeTerminalId()): Promise<void> {
    if (!terminalId || this.socket?.readyState !== WebSocket.OPEN) {
      return;
    }

    const buffer = await this.command<TerminalBufferSnapshot>("terminal.buffer", { terminalId });
    this.terminalBuffers.update((buffers) => ({
      ...buffers,
      [terminalId]: buffer.data
    }));
  }

  clearTerminalBuffer(terminalId = this.activeTerminalId()): void {
    if (!terminalId) {
      return;
    }

    void this.command<TerminalBufferSnapshot>("terminal.clearBuffer", { terminalId }).then((buffer) => {
      this.terminalBuffers.update((buffers) => ({
        ...buffers,
        [terminalId]: buffer.data
      }));
    });
  }

  resizeTerminal(terminalId: string, columns: number, rows: number): void {
    if (!terminalId || this.socket?.readyState !== WebSocket.OPEN) {
      return;
    }

    void this.command("terminal.resize", { terminalId, columns, rows }).catch(() => undefined);
  }

  private send(envelope: RelayEnvelope): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(envelope));
    }
  }

  private handleMessage(data: string): void {
    const envelope = JSON.parse(data) as RelayEnvelope;

    if (envelope.type === "command.response") {
      this.handleCommandResponse(envelope);
      return;
    }

    if (envelope.type === "state.snapshot") {
      this.applySnapshot(envelope.payload as WorkspaceSnapshot);
      return;
    }

    if (envelope.type === "terminal.output") {
      this.appendOutput(envelope.payload as TerminalOutputEvent);
      return;
    }

    if (envelope.type === "relay.peerState") {
      const peers = (envelope.payload as { peers?: Array<{ role: string; deviceName: string }> })?.peers ?? [];
      this.peerState.set(peers.map((peer) => `${peer.deviceName} ${peer.role}`).join(" / ") || "Relay paired");
    }
  }

  private handleCommandResponse(envelope: RelayEnvelope): void {
    const response = envelope.payload as CommandResponse;
    const requestId = envelope.requestId;
    if (!requestId) {
      return;
    }

    const pending = this.pending.get(requestId);
    if (!pending) {
      return;
    }

    this.pending.delete(requestId);
    window.clearTimeout(pending.timeout);
    if (response.ok) {
      pending.resolve(response.data);
    } else {
      pending.reject(new Error(response.error?.message ?? "Command failed"));
      this.lastError.set(response.error?.message ?? "Command failed");
    }
  }

  applySnapshot(snapshot: WorkspaceSnapshot): void {
    this.snapshot.set(snapshot);
    this.terminals.set(snapshot.terminals);
    this.git.set(snapshot.git);
    this.diagnostics.set(snapshot.diagnostics);

    if (!this.activeTerminalId() && snapshot.terminals.length) {
      this.activeTerminalId.set(snapshot.terminals[0].id);
      void this.loadTerminalBuffer(snapshot.terminals[0].id);
    } else if (this.activeTerminalId() && !snapshot.terminals.some((terminal) => terminal.id === this.activeTerminalId())) {
      this.activeTerminalId.set(snapshot.terminals[0]?.id ?? "");
    }
  }

  private appendOutput(event: TerminalOutputEvent): void {
    this.terminalBuffers.update((buffers) => ({
      ...buffers,
      [event.terminalId]: `${buffers[event.terminalId] ?? ""}${event.data}`.slice(-120000)
    }));
  }

  private scheduleReconnect(): void {
    if (!this.lastSettings) {
      return;
    }

    this.clearReconnect();
    this.reconnectAttempt += 1;
    const delay = Math.min(15000, 1000 * 2 ** Math.min(this.reconnectAttempt, 4));
    this.peerState.set(`Reconnecting in ${Math.round(delay / 1000)}s`);
    this.reconnectTimer = window.setTimeout(() => {
      if (this.lastSettings && !this.manuallyDisconnected) {
        this.connect(this.lastSettings);
      }
    }, delay);
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }

  private closeSocket(): void {
    this.socket?.close();
    this.socket = undefined;
  }

  private rejectPending(message: string): void {
    for (const pending of this.pending.values()) {
      window.clearTimeout(pending.timeout);
      pending.reject(new Error(message));
    }
    this.pending.clear();
  }

  private log(message: string): void {
    const stamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    this.activity.update((items) => [`${stamp} / ${message}`, ...items].slice(0, 24));
  }
}
