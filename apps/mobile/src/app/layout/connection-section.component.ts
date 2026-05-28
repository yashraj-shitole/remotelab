import { Component, Input } from "@angular/core";

@Component({
  selector: "app-connection-section",
  standalone: true,
  styleUrl: "./connection-section.component.css",
  template: `
    <section class="connection">
      <p class="caption">RELAY STATUS</p>
      <h2>{{ statusLabel }}</h2>
      <p>{{ peerState }}</p>
      <p class="muted">{{ workspaceName }} / {{ diagnosticsTotal }} DIAGNOSTICS</p>
      <p class="pairing-hint">OPEN PAIR FROM THE TOP RIGHT TO EDIT RELAY SETTINGS.</p>
    </section>
  `
})
export class ConnectionSectionComponent {
  @Input() statusLabel = "DISCONNECTED";
  @Input() peerState = "Awaiting relay";
  @Input() workspaceName = "NO WORKSPACE";
  @Input() diagnosticsTotal = 0;
}
