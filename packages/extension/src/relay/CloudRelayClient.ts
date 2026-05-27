import WebSocket from "ws";
import * as vscode from "vscode";
import { createEnvelope, RelayEnvelope } from "@companion/shared";
import { CompanionConfig } from "../config";
import { toErrorMessage } from "../utils/errors";

type EnvelopeHandler = (envelope: RelayEnvelope) => void | Promise<void>;

export class CloudRelayClient implements vscode.Disposable {
  private socket?: WebSocket;
  private reconnectTimer?: NodeJS.Timeout;
  private manuallyClosed = false;
  private config: CompanionConfig;

  constructor(
    private readonly output: vscode.OutputChannel,
    private readonly getConfig: () => CompanionConfig,
    private readonly onEnvelope: EnvelopeHandler
  ) {
    this.config = getConfig();
  }

  connect(): void {
    this.manuallyClosed = false;
    this.config = this.getConfig();
    this.clearReconnect();
    this.socket?.close();

    const url = new URL(this.config.relayUrl);
    url.searchParams.set("role", "extension");
    url.searchParams.set("pairingCode", this.config.pairingCode);
    url.searchParams.set("deviceName", this.config.deviceName);

    if (this.config.relaySecret) {
      url.searchParams.set("secret", this.config.relaySecret);
    }

    this.output.appendLine(`Connecting companion relay: ${redactUrl(url)}`);
    this.socket = new WebSocket(url);

    this.socket.on("open", () => {
      this.output.appendLine("Companion relay connected.");
      this.send(createEnvelope("client.hello", { role: "extension", deviceName: this.config.deviceName }, { source: "extension", target: "all" }));
    });

    this.socket.on("message", async (data) => {
      try {
        const envelope = JSON.parse(data.toString()) as RelayEnvelope;
        await this.onEnvelope(envelope);
      } catch (error) {
        this.output.appendLine(`Relay message error: ${toErrorMessage(error)}`);
      }
    });

    this.socket.on("close", (code, reason) => {
      this.output.appendLine(`Companion relay closed: ${code} ${reason.toString()}`);
      if (!this.manuallyClosed) {
        this.scheduleReconnect();
      }
    });

    this.socket.on("error", (error) => {
      this.output.appendLine(`Companion relay error: ${toErrorMessage(error)}`);
    });
  }

  disconnect(): void {
    this.manuallyClosed = true;
    this.clearReconnect();
    this.socket?.close();
    this.socket = undefined;
  }

  send(envelope: RelayEnvelope): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(envelope));
    }
  }

  dispose(): void {
    this.disconnect();
  }

  private scheduleReconnect(): void {
    this.clearReconnect();
    this.reconnectTimer = setTimeout(() => this.connect(), 3000);
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }
}

function redactUrl(url: URL): string {
  const clone = new URL(url);
  if (clone.searchParams.has("secret")) {
    clone.searchParams.set("secret", "redacted");
  }
  return clone.toString();
}
