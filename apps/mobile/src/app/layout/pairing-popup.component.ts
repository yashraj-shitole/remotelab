import { Component, EventEmitter, Input, Output } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { ConnectionSettings } from "../core/services/relay-client.service";

type ConnectionSettingKey = "relayUrl" | "pairingCode" | "relaySecret" | "deviceName";

@Component({
  selector: "app-pairing-popup",
  standalone: true,
  imports: [FormsModule],
  styleUrl: "./pairing-popup.component.css",
  template: `
    <div class="pairing-overlay" role="dialog" aria-modal="true" aria-labelledby="pairing-title" (click)="close.emit()">
      <section class="pairing-modal" (click)="stopOverlayClose($event)">
        <div class="pairing-header">
          <p class="caption">PAIRING</p>
          <button class="button-icon close-button" type="button" aria-label="Close pairing popup" (click)="close.emit()">X</button>
        </div>

        <h2 id="pairing-title">CONNECT RELAY</h2>
        <p class="qr-hint">TIP: RUN REMOTELAB: SHOW PAIRING QR IN VS CODE, THEN SCAN IT WITH THIS PHONE.</p>

        <form class="connection-form" (ngSubmit)="connectAction.emit()">
          <label>
            <span>RELAY URL</span>
            <input [ngModel]="settings.relayUrl" (ngModelChange)="emitSettingChange('relayUrl', $event)" name="relayUrl" autocomplete="url">
          </label>

          <label>
            <span>PAIRING CODE</span>
            <input [ngModel]="settings.pairingCode" (ngModelChange)="emitSettingChange('pairingCode', $event)" name="pairingCode" autocomplete="one-time-code">
          </label>

          <label>
            <span>RELAY SECRET</span>
            <input [ngModel]="settings.relaySecret" (ngModelChange)="emitSettingChange('relaySecret', $event)" name="relaySecret" type="password">
          </label>

          <label>
            <span>DEVICE</span>
            <input [ngModel]="settings.deviceName" (ngModelChange)="emitSettingChange('deviceName', $event)" name="deviceName">
          </label>

          <button class="button-primary" type="submit">CONNECT</button>
        </form>
      </section>
    </div>
  `
})
export class PairingPopupComponent {
  @Input() settings: ConnectionSettings = {
    relayUrl: "wss://remotelab-relay.onrender.com/relay",
    pairingCode: "",
    relaySecret: "",
    deviceName: "Phone"
  };

  @Output() close = new EventEmitter<void>();
  @Output() connectAction = new EventEmitter<void>();
  @Output() settingChange = new EventEmitter<{ key: ConnectionSettingKey; value: string }>();

  emitSettingChange(key: ConnectionSettingKey, value: string): void {
    this.settingChange.emit({ key, value });
  }

  stopOverlayClose(event: MouseEvent): void {
    event.stopPropagation();
  }
}
