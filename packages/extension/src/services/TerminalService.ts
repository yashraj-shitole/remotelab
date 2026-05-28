import * as os from "node:os";
import * as path from "node:path";
import { spawn, ChildProcessWithoutNullStreams } from "node:child_process";
import { createRequire } from "node:module";
import * as vscode from "vscode";
import { TerminalBufferSnapshot, TerminalOutputEvent, TerminalSummary, TerminalKind, randomId } from "@remotelab/shared";
import { getConfig } from "../config";
import { toErrorMessage } from "../utils/errors";

type OutputSink = (event: TerminalOutputEvent) => void;

type PtyLike = {
  pid?: number;
  write(data: string): void;
  resize?(columns: number, rows: number): void;
  kill(): void;
};

type ManagedTerminal = {
  id: string;
  name: string;
  kind: TerminalKind;
  terminal: vscode.Terminal;
  writeEmitter: vscode.EventEmitter<string>;
  closeEmitter: vscode.EventEmitter<number | void>;
  process?: PtyLike;
  cwd?: string;
  sequence: number;
  columns: number;
  rows: number;
  pendingInput: string[];
};

type TerminalBuffer = {
  data: string;
  sequence: number;
  truncated: boolean;
};

const maxTerminalBufferLength = 160000;

export class TerminalService implements vscode.Disposable {
  private readonly disposables: vscode.Disposable[] = [];
  private readonly managed = new Map<string, ManagedTerminal>();
  private readonly terminalIds = new WeakMap<vscode.Terminal, string>();

  constructor(
    private readonly output: vscode.OutputChannel,
    private readonly sink: OutputSink
  ) {
    this.disposables.push(
      vscode.window.onDidCloseTerminal((terminal) => {
        const id = this.terminalIds.get(terminal);
        if (id && this.managed.has(id)) {
          this.managed.delete(id);
        }
      })
    );

    if ("onDidStartTerminalShellExecution" in vscode.window) {
      this.disposables.push(
        vscode.window.onDidStartTerminalShellExecution((event) => {
          void this.captureShellExecution(event);
        })
      );
    }
  }

  async list(): Promise<TerminalSummary[]> {
    const managedTerminalSet = new Set(Array.from(this.managed.values()).map((item) => item.terminal));
    const existing = await Promise.all(
      vscode.window.terminals
        .filter((terminal) => !managedTerminalSet.has(terminal))
        .map(async (terminal) => this.describeVSCodeTerminal(terminal))
    );

    const managed = Array.from(this.managed.values()).map((item) => this.describeManagedTerminal(item));
    return [...managed, ...existing];
  }

  async createManagedTerminal(options: { name?: string; cwd?: string; kind?: TerminalKind } = {}): Promise<TerminalSummary> {
    const id = `${options.kind === "copilot-cli" ? "copilot" : "managed"}:${randomId()}`;
    const name = options.name ?? "RemoteLab Terminal";
    const writeEmitter = new vscode.EventEmitter<string>();
    const closeEmitter = new vscode.EventEmitter<number | void>();
    const cwd = options.cwd ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? os.homedir();

    const managed: ManagedTerminal = {
      id,
      name,
      kind: options.kind ?? "managed",
      writeEmitter,
      closeEmitter,
      cwd,
      sequence: 0,
      columns: 80,
      rows: 24,
      pendingInput: [],
      terminal: undefined as unknown as vscode.Terminal
    };

    const pty: vscode.Pseudoterminal = {
      onDidWrite: writeEmitter.event,
      onDidClose: closeEmitter.event,
      open: (dimensions) => {
        managed.columns = dimensions?.columns ?? managed.columns;
        managed.rows = dimensions?.rows ?? managed.rows;
        managed.process = this.startProcess(managed, dimensions);
        if (managed.pendingInput.length > 0) {
          for (const chunk of managed.pendingInput) {
            managed.process.write(chunk);
          }
          managed.pendingInput = [];
        }
      },
      close: () => {
        managed.process?.kill();
        this.managed.delete(id);
      },
      handleInput: (data) => {
        managed.process?.write(data);
      },
      setDimensions: (dimensions) => {
        managed.columns = dimensions.columns;
        managed.rows = dimensions.rows;
        managed.process?.resize?.(dimensions.columns, dimensions.rows);
      }
    };

    managed.terminal = vscode.window.createTerminal({ name, pty, isTransient: false });
    this.managed.set(id, managed);
    this.terminalIds.set(managed.terminal, id);
    managed.terminal.show(false);
    return this.describeManagedTerminal(managed);
  }

  async input(terminalId: string, data: string): Promise<TerminalSummary | undefined> {
    const managed = this.managed.get(terminalId);
    if (managed) {
      if (managed.process) {
        managed.process.write(data);
      } else {
        managed.pendingInput.push(data);
      }
      return this.describeManagedTerminal(managed);
    }

    const terminal = this.findVSCodeTerminal(terminalId);
    if (terminal) {
      this.sendInputToVSCodeTerminal(terminal, data);
    }
    return terminal ? this.describeVSCodeTerminal(terminal) : undefined;
  }

  async execute(terminalId: string, command: string): Promise<TerminalSummary | undefined> {
    const managed = this.managed.get(terminalId);
    if (managed) {
      const payload = `${command}\r`;
      if (managed.process) {
        managed.process.write(payload);
      } else {
        managed.pendingInput.push(payload);
      }
      return this.describeManagedTerminal(managed);
    }

    const terminal = this.findVSCodeTerminal(terminalId);
    terminal?.sendText(command, true);
    return terminal ? this.describeVSCodeTerminal(terminal) : undefined;
  }

  async show(terminalId: string): Promise<TerminalSummary | undefined> {
    const managed = this.managed.get(terminalId);
    if (managed) {
      managed.terminal.show(false);
      return this.describeManagedTerminal(managed);
    }

    const terminal = this.findVSCodeTerminal(terminalId);
    terminal?.show(false);
    return terminal ? this.describeVSCodeTerminal(terminal) : undefined;
  }

  async kill(terminalId: string): Promise<boolean> {
    const managed = this.managed.get(terminalId);
    if (managed) {
      managed.terminal.dispose();
      managed.process?.kill();
      this.managed.delete(terminalId);
      return true;
    }

    const terminal = this.findVSCodeTerminal(terminalId);
    terminal?.dispose();
    return Boolean(terminal);
  }

  buffer(terminalId: string): TerminalBufferSnapshot {
    const buffer = this.buffers.get(terminalId);
    return {
      terminalId,
      data: buffer?.data ?? "",
      sequence: buffer?.sequence ?? 0,
      truncated: buffer?.truncated ?? false
    };
  }

  clearBuffer(terminalId: string): TerminalBufferSnapshot {
    this.buffers.set(terminalId, { data: "", sequence: 0, truncated: false });
    return this.buffer(terminalId);
  }

  async resize(terminalId: string, columns: number, rows: number): Promise<TerminalSummary | undefined> {
    const managed = this.managed.get(terminalId);
    if (!managed) {
      const terminal = this.findVSCodeTerminal(terminalId);
      return terminal ? this.describeVSCodeTerminal(terminal) : undefined;
    }

    managed.columns = clampDimension(columns, 20, 240);
    managed.rows = clampDimension(rows, 6, 120);
    managed.process?.resize?.(managed.columns, managed.rows);
    return this.describeManagedTerminal(managed);
  }

  dispose(): void {
    for (const item of this.managed.values()) {
      item.process?.kill();
      item.writeEmitter.dispose();
      item.closeEmitter.dispose();
    }
    this.managed.clear();
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }

  private startProcess(managed: ManagedTerminal, dimensions?: vscode.TerminalDimensions): PtyLike {
    const config = getConfig();
    const shell = config.terminalShell || getDefaultShell();
    const shellArgs = config.terminalShellArgs.length ? config.terminalShellArgs : getDefaultShellArgs(shell);
    const nodePty = loadNodePty(this.output);

    this.emit(managed, `Starting ${shell} ${shellArgs.join(" ")}\r\n`, "system");

    if (nodePty) {
      const ptyProcess = nodePty.spawn(shell, shellArgs, {
        name: "xterm-256color",
        cols: dimensions?.columns ?? 80,
        rows: dimensions?.rows ?? 24,
        cwd: managed.cwd,
        env: process.env
      });
      ptyProcess.onData((data: string) => this.emit(managed, data, "stdout"));
      return {
        pid: ptyProcess.pid,
        write: (data: string) => ptyProcess.write(normalizeInputForPty(data)),
        resize: (columns: number, rows: number) => ptyProcess.resize(columns, rows),
        kill: () => ptyProcess.kill()
      };
    }

    const child = spawn(shell, shellArgs, {
      cwd: managed.cwd,
      env: process.env,
      shell: false
    }) as ChildProcessWithoutNullStreams;

    child.stdout.on("data", (chunk) => this.emit(managed, chunk.toString(), "stdout"));
    child.stderr.on("data", (chunk) => this.emit(managed, chunk.toString(), "stderr"));
    child.on("exit", (code) => {
      this.emit(managed, `\r\nProcess exited with code ${code ?? "unknown"}.\r\n`, "system");
      managed.closeEmitter.fire(code ?? undefined);
    });

    return {
      pid: child.pid,
      write: (data: string) => child.stdin.write(normalizeInputForPipe(data)),
      kill: () => child.kill()
    };
  }

  private emit(managed: ManagedTerminal, data: string, stream: TerminalOutputEvent["stream"]): void {
    managed.sequence += 1;
    managed.writeEmitter.fire(data);
    this.publish({
      terminalId: managed.id,
      data,
      stream,
      sequence: managed.sequence
    });
  }

  private async captureShellExecution(event: vscode.TerminalShellExecutionStartEvent): Promise<void> {
    const terminalId = this.getOrCreateVSCodeTerminalId(event.terminal);
    const commandLine = typeof event.execution.commandLine === "string"
      ? event.execution.commandLine
      : event.execution.commandLine.value;
    let sequence = 0;

    this.publish({
      terminalId,
      data: `\r\n[VS Code shell integration] ${commandLine}\r\n`,
      stream: "system",
      sequence: ++sequence
    });

    try {
      const stream = event.execution.read();
      for await (const chunk of stream) {
        this.publish({
          terminalId,
          data: chunk,
          stream: "stdout",
          sequence: ++sequence
        });
      }
    } catch (error) {
      this.publish({
        terminalId,
        data: `\r\nUnable to read terminal output: ${toErrorMessage(error)}\r\n`,
        stream: "system",
        sequence: ++sequence
      });
    }
  }

  private async describeVSCodeTerminal(terminal: vscode.Terminal): Promise<TerminalSummary> {
    const id = this.getOrCreateVSCodeTerminalId(terminal);
    const pid = await Promise.resolve(terminal.processId).catch(() => undefined);
    return {
      id,
      name: terminal.name,
      kind: "vscode",
      canReadOutput: Boolean(terminal.shellIntegration),
      canSendInput: true,
      shellIntegration: Boolean(terminal.shellIntegration),
      pid
    };
  }

  private describeManagedTerminal(item: ManagedTerminal): TerminalSummary {
    return {
      id: item.id,
      name: item.name,
      kind: item.kind,
      canReadOutput: true,
      canSendInput: true,
      shellIntegration: true,
      cwd: item.cwd,
      pid: item.process?.pid
    };
  }

  private findVSCodeTerminal(terminalId: string): vscode.Terminal | undefined {
    return vscode.window.terminals.find((terminal) => this.getOrCreateVSCodeTerminalId(terminal) === terminalId);
  }

  private getOrCreateVSCodeTerminalId(terminal: vscode.Terminal): string {
    let id = this.terminalIds.get(terminal);
    if (!id) {
      id = `vscode:${randomId()}`;
      this.terminalIds.set(terminal, id);
    }
    return id;
  }

  private readonly buffers = new Map<string, TerminalBuffer>();

  private sendInputToVSCodeTerminal(terminal: vscode.Terminal, data: string): void {
    const normalized = data.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    const endsWithNewline = normalized.endsWith("\n");
    const chunks = normalized.split("\n");

    for (let index = 0; index < chunks.length; index += 1) {
      const chunk = chunks[index];
      const isLast = index === chunks.length - 1;

      if (!isLast) {
        terminal.sendText(chunk, true);
        continue;
      }

      if (chunk.length > 0 || !endsWithNewline) {
        terminal.sendText(chunk, false);
      }
    }
  }

  private publish(event: TerminalOutputEvent): void {
    const current = this.buffers.get(event.terminalId) ?? { data: "", sequence: 0, truncated: false };
    const nextData = `${current.data}${event.data}`;
    const truncated = current.truncated || nextData.length > maxTerminalBufferLength;
    this.buffers.set(event.terminalId, {
      data: nextData.slice(-maxTerminalBufferLength),
      sequence: Math.max(current.sequence, event.sequence),
      truncated
    });
    this.sink(event);
  }
}

function getDefaultShell(): string {
  if (process.platform === "win32") {
    const systemRoot = process.env.SystemRoot || process.env.WINDIR;
    if (systemRoot) {
      return path.join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
    }
    return "powershell.exe";
  }

  return process.env.SHELL || "/bin/bash";
}

function getDefaultShellArgs(shell: string): string[] {
  const base = path.basename(shell).toLowerCase();
  if (base.includes("powershell") || base === "pwsh.exe" || base === "pwsh") {
    return ["-NoLogo"];
  }
  return [];
}

function loadNodePty(output: vscode.OutputChannel): { spawn: (...args: unknown[]) => any } | undefined {
  try {
    const requireFn = createRequire(__filename);
    return requireFn("@homebridge/node-pty-prebuilt-multiarch") as { spawn: (...args: unknown[]) => any };
  } catch (error) {
    output.appendLine(`node-pty unavailable, falling back to pipe-backed terminals: ${toErrorMessage(error)}`);
    return undefined;
  }
}

function clampDimension(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.max(min, Math.min(max, Math.round(value)));
}

function normalizeInputForPipe(data: string): string {
  if (process.platform !== "win32") {
    // Pipe-backed shells generally expect LF for command submission.
    return data.replace(/\r(?!\n)/g, "\n");
  }

  // Windows console shells are most reliable with CRLF command submission.
  return data
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\n/g, "\r\n");
}

function normalizeInputForPty(data: string): string {
  if (process.platform !== "win32") {
    return data;
  }

  // Some mobile keyboards emit LF for Enter; Windows PTYs expect CR.
  return data
    .replace(/\r\n/g, "\r")
    .replace(/\n/g, "\r");
}
