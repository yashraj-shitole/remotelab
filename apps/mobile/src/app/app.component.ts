import { CommonModule } from "@angular/common";
import { Component, computed, inject, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { DiagnosticSnapshot, FileMatch, GitStatusSnapshot, TaskSummary, WorkspaceSnapshot } from "@companion/shared";
import { RelayClientService } from "./relay-client.service";
import { TerminalPaneComponent } from "./terminal-pane.component";

type Section = "ai" | "terminal" | "workspace";

@Component({
  selector: "app-root",
  standalone: true,
  imports: [CommonModule, FormsModule, TerminalPaneComponent],
  templateUrl: "./app.component.html",
  styleUrl: "./app.component.scss"
})
export class AppComponent {
  readonly relay = inject(RelayClientService);
  readonly section = signal<Section>("ai");
  readonly settings = signal(this.relay.loadSettings());
  readonly prompt = signal("");
  readonly terminalCommand = signal("");
  readonly filePattern = signal("**/*.{ts,tsx,js,json,md,scss,html}");

  readonly statusLabel = computed(() => this.relay.status().toUpperCase());
  readonly workspaceName = computed(() => this.relay.snapshot()?.workspaceName ?? "NO WORKSPACE");
  readonly diagnosticsTotal = computed(() => this.relay.diagnostics()?.total ?? 0);

  connect(): void {
    this.relay.connect(this.settings());
  }

  updateSetting(key: "relayUrl" | "pairingCode" | "relaySecret" | "deviceName", value: string): void {
    this.settings.update((settings) => ({ ...settings, [key]: value }));
  }

  setSection(section: Section): void {
    this.section.set(section);
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

  async refresh(): Promise<void> {
    const snapshot = await this.relay.command<WorkspaceSnapshot>("snapshot.get");
    this.relay.applySnapshot(snapshot);
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

  openFile(path: string): void {
    void this.relay.command("editor.openFile", { path });
  }

  executeCommand(commandId: string): void {
    void this.relay.command("vscode.command", { commandId });
  }
}
