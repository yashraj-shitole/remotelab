import { Component, EventEmitter, Input, Output } from "@angular/core";

@Component({
  selector: "app-top-nav",
  standalone: true,
  styleUrl: "./top-nav.component.css",
  template: `
    <header class="top-nav">
      <button class="nav-link" type="button" (click)="menuAction.emit()">HOME</button>
      <div class="wordmark">REMOTELAB</div>
      <div class="nav-actions">
        <button class="nav-link" type="button" (click)="pairAction.emit()">PAIR</button>
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
  @Output() menuAction = new EventEmitter<void>();
  @Output() pairAction = new EventEmitter<void>();
}
