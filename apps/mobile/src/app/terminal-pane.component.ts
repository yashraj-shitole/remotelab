import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild } from "@angular/core";
import { Terminal } from "@xterm/xterm";

@Component({
  selector: "app-terminal-pane",
  standalone: true,
  template: `<div #host class="terminal-host" aria-label="Terminal output"></div>`,
  styles: [`
    :host {
      display: block;
      min-height: 320px;
      border-top: 1px solid var(--color-hairline);
      border-bottom: 1px solid var(--color-hairline);
      background: var(--color-canvas);
    }

    .terminal-host {
      min-height: 320px;
      padding: 16px 0;
    }
  `]
})
export class TerminalPaneComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() terminalId = "";
  @Input() output = "";
  @Output() inputData = new EventEmitter<string>();
  @Output() dimensionsChange = new EventEmitter<{ columns: number; rows: number }>();
  @ViewChild("host", { static: true }) private host?: ElementRef<HTMLDivElement>;

  private terminal?: Terminal;
  private written = "";
  private currentTerminalId = "";
  private resizeObserver?: ResizeObserver;
  private lastDimensions = "";

  ngAfterViewInit(): void {
    this.terminal = new Terminal({
      cursorBlink: true,
      convertEol: true,
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
    this.terminal.open(this.host!.nativeElement);
    this.terminal.onData((data) => this.inputData.emit(data));
    this.resizeObserver = new ResizeObserver(() => this.emitDimensions());
    this.resizeObserver.observe(this.host!.nativeElement);
    this.emitDimensions();
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
    this.terminal?.dispose();
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

  private emitDimensions(): void {
    const element = this.host?.nativeElement;
    if (!element) {
      return;
    }

    const columns = Math.max(20, Math.floor(element.clientWidth / 7.2));
    const rows = Math.max(8, Math.floor(element.clientHeight / 16.2));
    const key = `${columns}x${rows}`;
    if (key === this.lastDimensions) {
      return;
    }

    this.lastDimensions = key;
    this.dimensionsChange.emit({ columns, rows });
  }
}
