import { ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import * as vscode from "vscode";
import { TrackpadPointerState } from "@remotelab/shared";

const pointerSpeed = 1.45;
const maxMovePixelsPerEvent = 160;
const scrollPixelsPerStep = 16;
const maxScrollStepsPerEvent = 12;
const mouseWheelDelta = 120;

const trackpadWorkerScript = [
  "$ErrorActionPreference = 'Stop'",
  "Add-Type -AssemblyName System.Windows.Forms | Out-Null",
  "if (-not ('RemoteLabNativeMouse' -as [type])) {",
  "  Add-Type -TypeDefinition @'",
  "using System;",
  "using System.Runtime.InteropServices;",
  "public static class RemoteLabNativeMouse {",
  "  [DllImport(\"user32.dll\", SetLastError=true)]",
  "  public static extern void mouse_event(uint dwFlags, uint dx, uint dy, int dwData, UIntPtr dwExtraInfo);",
  "}",
  "'@ | Out-Null",
  "}",
  "while (($line = [Console]::In.ReadLine()) -ne $null) {",
  "  if ([string]::IsNullOrWhiteSpace($line)) { continue }",
  "  $parts = $line.Split(' ')",
  "  switch ($parts[0]) {",
  "    'MOVE' {",
  "      if ($parts.Length -ge 3) {",
  "        $dx = [int]$parts[1]",
  "        $dy = [int]$parts[2]",
  "        $position = [System.Windows.Forms.Cursor]::Position",
  "        [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point([int]($position.X + $dx), [int]($position.Y + $dy))",
  "      }",
  "    }",
  "    'LCLICK' {",
  "      [RemoteLabNativeMouse]::mouse_event(0x0002, 0, 0, 0, [UIntPtr]::Zero)",
  "      [RemoteLabNativeMouse]::mouse_event(0x0004, 0, 0, 0, [UIntPtr]::Zero)",
  "    }",
  "    'RCLICK' {",
  "      [RemoteLabNativeMouse]::mouse_event(0x0008, 0, 0, 0, [UIntPtr]::Zero)",
  "      [RemoteLabNativeMouse]::mouse_event(0x0010, 0, 0, 0, [UIntPtr]::Zero)",
  "    }",
  "    'WHEEL' {",
  "      if ($parts.Length -ge 2) {",
  "        $amount = [int]$parts[1]",
  "        [RemoteLabNativeMouse]::mouse_event(0x0800, 0, 0, $amount, [UIntPtr]::Zero)",
  "      }",
  "    }",
  "  }",
  "}"
].join("\n");

export class TrackpadService implements vscode.Disposable {
  private moveCarryX = 0;
  private moveCarryY = 0;
  private scrollCarry = 0;
  private worker: ChildProcessWithoutNullStreams | undefined;
  private disposed = false;
  private workerFailureWarningShown = false;
  private unsupportedWarningShown = false;

  async move(deltaX: number, deltaY: number): Promise<TrackpadPointerState | undefined> {
    if (!isWindows()) {
      this.warnUnsupportedPlatform();
      return undefined;
    }

    const moveX = this.consumeMove(deltaX, "x");
    const moveY = this.consumeMove(deltaY, "y");
    if (moveX === 0 && moveY === 0) {
      return undefined;
    }

    this.sendWorkerCommand(`MOVE ${moveX} ${moveY}`);

    return undefined;
  }

  async click(button: "left" | "right"): Promise<{ button: "left" | "right"; pointer?: TrackpadPointerState }> {
    if (!isWindows()) {
      this.warnUnsupportedPlatform();
      return { button };
    }

    this.sendWorkerCommand(button === "left" ? "LCLICK" : "RCLICK");

    return { button };
  }

  async scroll(deltaY: number): Promise<{ lines: number; pointer?: TrackpadPointerState }> {
    if (!isWindows()) {
      this.warnUnsupportedPlatform();
      return { lines: 0 };
    }

    const lines = this.consumeScroll(deltaY);
    if (lines === 0) {
      return { lines: 0 };
    }

    // Positive touch delta is treated as scrolling down.
    const wheelAmount = -lines * mouseWheelDelta;
    this.sendWorkerCommand(`WHEEL ${wheelAmount}`);

    return { lines };
  }

  dispose(): void {
    this.disposed = true;
    if (this.worker) {
      try {
        this.worker.stdin.end();
      } catch {
        // Ignore stream closing failures during shutdown.
      }
      this.worker.kill();
      this.worker = undefined;
    }
  }

  private consumeMove(delta: number, axis: "x" | "y"): number {
    const carry = axis === "x" ? this.moveCarryX : this.moveCarryY;
    const scaled = clamp((safeNumber(delta) * pointerSpeed) + carry, -maxMovePixelsPerEvent, maxMovePixelsPerEvent);
    const whole = scaled > 0 ? Math.floor(scaled) : Math.ceil(scaled);
    const remainder = scaled - whole;

    if (axis === "x") {
      this.moveCarryX = remainder;
    } else {
      this.moveCarryY = remainder;
    }

    return whole;
  }

  private consumeScroll(deltaY: number): number {
    const total = this.scrollCarry + safeNumber(deltaY);
    if (Math.abs(total) < scrollPixelsPerStep) {
      this.scrollCarry = total;
      return 0;
    }

    const rawLines = total > 0 ? Math.floor(total / scrollPixelsPerStep) : Math.ceil(total / scrollPixelsPerStep);
    const lines = clamp(rawLines, -maxScrollStepsPerEvent, maxScrollStepsPerEvent);
    this.scrollCarry = rawLines === lines ? total - (lines * scrollPixelsPerStep) : 0;
    return lines;
  }

  private sendWorkerCommand(command: string): void {
    if (this.disposed) {
      return;
    }

    this.writeWorkerCommand(command).catch(() => {
      this.resetWorker();
      this.writeWorkerCommand(command).catch((error) => {
        this.showWorkerFailure(error);
      });
    });
  }

  private async writeWorkerCommand(command: string): Promise<void> {
    const worker = this.ensureWorker();

    await new Promise<void>((resolve, reject) => {
      if (!worker.stdin.writable) {
        reject(new Error("Trackpad worker stdin is not writable"));
        return;
      }

      worker.stdin.write(`${command}\n`, (error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  private ensureWorker(): ChildProcessWithoutNullStreams {
    if (this.worker && !this.worker.killed && this.worker.stdin.writable) {
      return this.worker;
    }

    const worker = spawn(
      getPowerShellPath(),
      ["-NoLogo", "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encodePowerShell(trackpadWorkerScript)],
      {
        windowsHide: true,
        stdio: ["pipe", "pipe", "pipe"]
      }
    );

    worker.on("error", (error) => this.showWorkerFailure(error));
    worker.on("exit", (code) => {
      if (this.worker === worker) {
        this.worker = undefined;
      }

      if (!this.disposed && code && code !== 0) {
        this.showWorkerFailure(new Error(`Trackpad worker exited with code ${code}`));
      }
    });

    worker.stderr.on("data", (chunk) => {
      const message = chunk.toString().trim();
      if (message) {
        this.showWorkerFailure(new Error(message));
      }
    });

    this.worker = worker;
    return worker;
  }

  private resetWorker(): void {
    if (!this.worker) {
      return;
    }

    try {
      this.worker.stdin.end();
    } catch {
      // Ignore stream close issues while resetting worker.
    }

    this.worker.kill();
    this.worker = undefined;
  }

  private showWorkerFailure(error: unknown): void {
    if (this.workerFailureWarningShown || this.disposed) {
      return;
    }

    this.workerFailureWarningShown = true;
    const message = error instanceof Error ? error.message : "Unknown worker error";
    void vscode.window.showWarningMessage(`RemoteLab trackpad worker failed: ${message}`);
  }

  private warnUnsupportedPlatform(): void {
    if (this.unsupportedWarningShown) {
      return;
    }

    this.unsupportedWarningShown = true;
    void vscode.window.showWarningMessage("RemoteLab trackpad pointer control currently supports Windows only.");
  }
}

function encodePowerShell(script: string): string {
  return Buffer.from(script, "utf16le").toString("base64");
}

function isWindows(): boolean {
  return process.platform === "win32";
}

function getPowerShellPath(): string {
  const systemRoot = process.env.SystemRoot || process.env.WINDIR;
  return systemRoot
    ? `${systemRoot}\\System32\\WindowsPowerShell\\v1.0\\powershell.exe`
    : "powershell.exe";
}

function safeNumber(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
