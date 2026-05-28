import { Component, EventEmitter, Input, Output } from "@angular/core";
import { FormsModule } from "@angular/forms";

@Component({
  selector: "app-ai-section",
  standalone: true,
  imports: [FormsModule],
  styleUrl: "./ai-section.component.css",
  template: `
    <section class="panel">
      <p class="caption">COPILOT CLI</p>
      <h2>LOCAL SESSION CONTROL</h2>
      <p>Resume the workstation's Copilot CLI context and keep remote steering enabled for GitHub Mobile or browser access.</p>
      <div class="button-row">
        <button class="button-primary" type="button" (click)="newCopilot.emit()">NEW</button>
        <button class="button-primary" type="button" (click)="continueCopilot.emit()">CONTINUE</button>
        <button class="button-primary" type="button" (click)="resumeCopilot.emit()">RESUME</button>
      </div>
      <label class="prompt">
        <span>PROMPT</span>
        <textarea [ngModel]="prompt" (ngModelChange)="promptChange.emit($event)" name="prompt" rows="4" placeholder="Ask Copilot to continue the task..."></textarea>
      </label>
      <button class="button-primary" type="button" (click)="sendPrompt.emit()">SEND PROMPT</button>
    </section>
  `
})
export class AiSectionComponent {
  @Input() prompt = "";

  @Output() newCopilot = new EventEmitter<void>();
  @Output() continueCopilot = new EventEmitter<void>();
  @Output() resumeCopilot = new EventEmitter<void>();
  @Output() promptChange = new EventEmitter<string>();
  @Output() sendPrompt = new EventEmitter<void>();
}
