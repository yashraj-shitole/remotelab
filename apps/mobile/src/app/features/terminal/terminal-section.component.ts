import { Component, EventEmitter, Input, Output } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { TerminalSummary } from "@remotelab/shared";
import { TerminalPaneComponent } from "../../shared/terminal-pane.component";

@Component({
  selector: "app-terminal-section",
  standalone: true,
  imports: [FormsModule, TerminalPaneComponent],
  styleUrl: "./terminal-section.component.css",
  template: `
    <section class="panel">
      <div class="panel-heading">
        <div>
          <p class="caption">TERMINALS</p>
          <h2>LIVE CONTROL</h2>
        </div>
        <button class="button-icon" type="button" (click)="createTerminal.emit()">+</button>
      </div>

      <div class="button-row compact">
        <button class="button-primary" type="button" (click)="showTerminal.emit()">SHOW</button>
        <button class="button-primary" type="button" (click)="syncTerminal.emit()">SYNC</button>
        <button class="button-primary" type="button" (click)="clearTerminal.emit()">CLEAR</button>
        <button class="button-primary danger" type="button" (click)="killTerminal.emit()">KILL</button>
      </div>

      <div class="terminal-list">
        @for (terminal of terminals; track terminal.id) {
          <button type="button" [class.active]="activeTerminalId === terminal.id" (click)="selectTerminal.emit(terminal.id)">
            <span>{{ terminal.name }}</span>
            <small>{{ terminal.kind }} / {{ terminal.canReadOutput ? 'READ' : 'INPUT ONLY' }}</small>
          </button>
        }
      </div>

      <app-terminal-pane
        [terminalId]="activeTerminalId"
        [output]="activeTerminalOutput"
        (inputData)="terminalInput.emit($event)"
        (dimensionsChange)="dimensionsChange.emit($event)">
      </app-terminal-pane>

      <form class="command-form" (ngSubmit)="runTerminalCommand.emit()">
        <input [ngModel]="terminalCommand" (ngModelChange)="terminalCommandChange.emit($event)" name="terminalCommand" placeholder="npm test">
        <button class="button-primary" type="submit">RUN</button>
      </form>
    </section>
  `
})
export class TerminalSectionComponent {
  @Input() terminals: TerminalSummary[] = [];
  @Input() activeTerminalId = "";
  @Input() activeTerminalOutput = "";
  @Input() terminalCommand = "";

  @Output() createTerminal = new EventEmitter<void>();
  @Output() showTerminal = new EventEmitter<void>();
  @Output() syncTerminal = new EventEmitter<void>();
  @Output() clearTerminal = new EventEmitter<void>();
  @Output() killTerminal = new EventEmitter<void>();
  @Output() selectTerminal = new EventEmitter<string>();
  @Output() terminalInput = new EventEmitter<string>();
  @Output() dimensionsChange = new EventEmitter<{ columns: number; rows: number }>();
  @Output() terminalCommandChange = new EventEmitter<string>();
  @Output() runTerminalCommand = new EventEmitter<void>();
}
