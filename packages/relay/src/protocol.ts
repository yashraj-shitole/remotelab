export const PROTOCOL_VERSION = "0.1.0";

export type PeerRole = "extension" | "mobile";
export type RelayTarget = PeerRole | "all";

export interface RelayEnvelope<TPayload = unknown> {
  id: string;
  type: string;
  sentAt: string;
  protocolVersion?: string;
  source?: PeerRole;
  target?: RelayTarget;
  requestId?: string;
  payload?: TPayload;
}

export function createEnvelope<TPayload>(
  type: string,
  payload?: TPayload,
  options: Omit<Partial<RelayEnvelope<TPayload>>, "payload"> = {}
): RelayEnvelope<TPayload> {
  return {
    id: randomId(),
    type,
    sentAt: new Date().toISOString(),
    protocolVersion: PROTOCOL_VERSION,
    payload,
    ...options
  };
}

function randomId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
