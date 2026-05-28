import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild } from "@angular/core";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";

@Component({
  selector: "app-terminal-pane",
  standalone: true,
  styleUrl: "./terminal-pane.component.css",
  template: `<div #host class="terminal-host" aria-label="Terminal output"></div>`,
})
export class TerminalPaneComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() terminalId = "";
  @Input() output = "";
  @Output() inputData = new EventEmitter<string>();
  @Output() dimensionsChange = new EventEmitter<{ columns: number; rows: number }>();
  @ViewChild("host", { static: true }) private host?: ElementRef<HTMLDivElement>;

  private terminal?: Terminal;
  private fitAddon?: FitAddon;
  private written = "";
  private currentTerminalId = "";
  private resizeObserver?: ResizeObserver;
  private lastDimensions = "";
  private fitFrame?: number;

  ngAfterViewInit(): void {
    this.terminal = new Terminal({
      cursorBlink: true,
      // Keep raw terminal line behavior for full-screen TUIs (e.g., Copilot CLI).
      convertEol: false,
      fontFamily: 'var(--font-mono)',
      fontSize: 12,
      lineHeight: 1.35,
      theme: {
        background: "#000000",
        foreground: "#ffffff",
        cursor: "#ffffff",
        selectionBackground: "#3a3a3a",
        black: "#000000",
        brightBlack: "#666666",
        white: "#cccccc",
        brightWhite: "#ffffff"
      }
    });
    this.fitAddon = new FitAddon();
    this.terminal.loadAddon(this.fitAddon);
    this.terminal.open(this.host!.nativeElement);
    this.terminal.onData((data) => this.inputData.emit(data));
    this.resizeObserver = new ResizeObserver(() => this.fitAndEmitDimensions());
    this.resizeObserver.observe(this.host!.nativeElement);

    this.fitAndEmitDimensions();
    this.fitFrame = window.requestAnimationFrame(() => this.fitAndEmitDimensions());

    const fonts = (document as Document & { fonts?: FontFaceSet }).fonts;
    if (fonts) {
      void fonts.ready.then(() => this.fitAndEmitDimensions());
    }

    this.sync();
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["terminalId"] && this.currentTerminalId !== this.terminalId) {
      this.currentTerminalId = this.terminalId;
      this.written = "";
      this.terminal?.reset();
    }
    this.sync();
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    if (this.fitFrame !== undefined) {
      window.cancelAnimationFrame(this.fitFrame);
    }
    this.terminal?.dispose();
    this.terminal = undefined;
    this.fitAddon = undefined;
  }

  private sync(): void {
    if (!this.terminal) {
      return;
    }

    if (!this.output.startsWith(this.written)) {
      this.terminal.reset();
      this.written = "";
    }

    const delta = this.output.slice(this.written.length);
    if (delta) {
      this.terminal.write(delta);
      this.written = this.output;
    }
  }

  private fitAndEmitDimensions(): void {
    if (!this.terminal || !this.fitAddon) {
      return;
    }

    try {
      this.fitAddon.fit();
    } catch {
      return;
    }

    const columns = this.terminal.cols;
    const rows = this.terminal.rows;
    if (columns <= 0 || rows <= 0) {
      return;
    }

    const key = `${columns}x${rows}`;
    if (key === this.lastDimensions) {
      return;
    }

    this.lastDimensions = key;
    this.dimensionsChange.emit({ columns, rows });
  }
}
