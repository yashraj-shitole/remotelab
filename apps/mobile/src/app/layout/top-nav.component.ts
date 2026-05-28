import { Component, EventEmitter, Input, Output } from "@angular/core";

type ThemeMode = "dark" | "light";

@Component({
  selector: "app-top-nav",
  standalone: true,
  styleUrl: "./top-nav.component.css",
  template: `
    <header class="top-nav">
      <button class="nav-link" type="button" (click)="menuAction.emit()">HOME</button>
      <div class="wordmark">REMOTELAB</div>
      <div class="nav-actions">
        <button
          class="nav-link theme-toggle"
          type="button"
          [attr.aria-label]="theme === 'dark' ? 'Switch to white theme' : 'Switch to dark theme'"
          (click)="themeAction.emit($event)">
          {{ theme === "dark" ? "WHITE" : "DARK" }}
        </button>
        <span
          class="status-dot"
          [class.connected]="connected"
          [class.disconnected]="!connected"
          [attr.aria-label]="connected ? 'Relay connected' : 'Relay disconnected'"
          role="status">
        </span>
      </div>
    </header>
  `
})
export class TopNavComponent {
  @Input() connected = false;
  @Input() theme: ThemeMode = "dark";
  @Output() menuAction = new EventEmitter<void>();
  @Output() themeAction = new EventEmitter<MouseEvent>();
}
