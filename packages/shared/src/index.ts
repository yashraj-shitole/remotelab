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

export type RemoteLabCommand =
  | "snapshot.get"
  | "terminal.list"
  | "terminal.create"
  | "terminal.input"
  | "terminal.execute"
  | "terminal.show"
  | "terminal.kill"
  | "terminal.buffer"
  | "terminal.clearBuffer"
  | "terminal.resize"
  | "copilot.new"
  | "copilot.continue"
  | "copilot.resume"
  | "copilot.prompt"
  | "vscode.command"
  | "editor.active"
  | "editor.openFile"
  | "workspace.findFiles"
  | "workspace.readFile"
  | "task.list"
  | "task.run"
  | "git.status"
  | "diagnostics.list"
  | "trackpad.move"
  | "trackpad.click"
  | "trackpad.scroll";

export interface CommandRequest<TArgs = Record<string, unknown>> {
  command: RemoteLabCommand;
  args?: TArgs;
}

export interface CommandResponse<TData = unknown> {
  ok: boolean;
  command: RemoteLabCommand;
  data?: TData;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface TrackpadMoveRequest {
  deltaX: number;
  deltaY: number;
}

export interface TrackpadClickRequest {
  button: "left" | "right";
}

export interface TrackpadScrollRequest {
  deltaY: number;
}

export interface TrackpadPointerState {
  fileName?: string;
  line: number;
  character: number;
}

export type TerminalKind = "vscode" | "managed" | "copilot-cli";

export interface TerminalSummary {
  id: string;
  name: string;
  kind: TerminalKind;
  canReadOutput: boolean;
  canSendInput: boolean;
  isActive?: boolean;
  shellIntegration?: boolean;
  cwd?: string;
  pid?: number;
}

export interface TerminalOutputEvent {
  terminalId: string;
  data: string;
  stream: "stdout" | "stderr" | "system";
  sequence: number;
}

export interface TerminalBufferSnapshot {
  terminalId: string;
  data: string;
  sequence: number;
  truncated: boolean;
}

export interface TerminalResizeRequest {
  terminalId: string;
  columns: number;
  rows: number;
}

export interface WorkspaceSnapshot {
  workspaceName: string;
  folders: string[];
  activeEditor?: ActiveEditor;
  terminals: TerminalSummary[];
  diagnostics: DiagnosticSnapshot;
  git?: GitStatusSnapshot;
}

export interface ActiveEditor {
  fileName: string;
  languageId: string;
  isDirty: boolean;
  line: number;
  character: number;
}

export interface FileMatch {
  path: string;
  relativePath: string;
}

export interface FileContentSnapshot {
  path: string;
  relativePath: string;
  content: string;
  byteLength: number;
  truncated: boolean;
  isBinary: boolean;
}

export interface GitStatusSnapshot {
  cwd?: string;
  branchLine?: string;
  entries: string[];
}

export interface DiagnosticSnapshot {
  total: number;
  errors: number;
  warnings: number;
  infos: number;
  hints: number;
  items: DiagnosticItem[];
}

export interface DiagnosticItem {
  file: string;
  message: string;
  severity: "error" | "warning" | "info" | "hint";
  line: number;
  character: number;
  source?: string;
}

export interface TaskSummary {
  id: string;
  name: string;
  source: string;
  type?: string;
}

export interface RelayPeerState {
  role: PeerRole;
  connected: boolean;
  peerCount: number;
  deviceName?: string;
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

export function randomId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
