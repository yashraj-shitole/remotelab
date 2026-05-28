import { Component, EventEmitter, Output } from "@angular/core";

@Component({
  selector: "app-hero-section",
  standalone: true,
  styleUrl: "./hero-section.component.css",
  template: `
    <section class="hero">
      <p class="caption">VS CODE CONTROL SURFACE</p>
      <h1>AI CODING FROM ANYWHERE</h1>
      <p class="lead">Continue Copilot CLI sessions, steer terminals, inspect git, and move through the editor while the workstation keeps the engine running.</p>
      <div class="hero-actions">
        <button class="button-primary" type="button" (click)="continueCopilot.emit()">CONTINUE CLI</button>
        <button class="button-primary" type="button" (click)="createTerminal.emit()">NEW TERMINAL</button>
      </div>
    </section>
  `
})
export class HeroSectionComponent {
  @Output() continueCopilot = new EventEmitter<void>();
  @Output() createTerminal = new EventEmitter<void>();
}
