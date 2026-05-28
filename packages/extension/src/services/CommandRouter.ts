import { createEnvelope, CommandRequest, CommandResponse, RelayEnvelope } from "@remotelab/shared";
import { TerminalService } from "./TerminalService";
import { CopilotCliService } from "./CopilotCliService";
import { DiagnosticsService } from "./DiagnosticsService";
import { GitService } from "./GitService";
import { TaskService } from "./TaskService";
import { WorkspaceService } from "./WorkspaceService";
import { VSCodeCommandService } from "./VSCodeCommandService";
import { TrackpadService } from "./TrackpadService";
import { toErrorMessage } from "../utils/errors";

type Sender = (envelope: RelayEnvelope) => void;

export class CommandRouter {
  constructor(
    private readonly send: Sender,
    private readonly workspace: WorkspaceService,
    private readonly terminals: TerminalService,
    private readonly copilot: CopilotCliService,
    private readonly diagnostics: DiagnosticsService,
    private readonly git: GitService,
    private readonly tasks: TaskService,
    private readonly commands: VSCodeCommandService,
    private readonly trackpad: TrackpadService
  ) {}

  async handle(envelope: RelayEnvelope): Promise<void> {
    if (envelope.type !== "command.request") {
      return;
    }

    const request = envelope.payload as CommandRequest | undefined;
    if (!request?.command) {
      this.reply(envelope, {
        ok: false,
        command: "snapshot.get",
        error: { code: "bad_request", message: "Missing command payload" }
      });
      return;
    }

    try {
      const data = await this.dispatch(request);
      this.reply(envelope, {
        ok: true,
        command: request.command,
        data
      });

      if (request.command !== "snapshot.get" && !request.command.startsWith("trackpad.")) {
        await this.pushSnapshot();
      }
    } catch (error) {
      this.reply(envelope, {
        ok: false,
        command: request.command,
        error: {
          code: "command_failed",
          message: toErrorMessage(error)
        }
      });
    }
  }

  async pushSnapshot(): Promise<void> {
    this.send(createEnvelope("state.snapshot", await this.workspace.snapshot(), { source: "extension", target: "mobile" }));
  }

  private async dispatch(request: CommandRequest): Promise<unknown> {
    const args = (request.args ?? {}) as Record<string, unknown>;

    switch (request.command) {
      case "snapshot.get":
        return this.workspace.snapshot();
      case "terminal.list":
        return this.terminals.list();
      case "terminal.create":
        return this.terminals.createManagedTerminal({
          name: typeof args.name === "string" ? args.name : undefined,
          cwd: typeof args.cwd === "string" ? args.cwd : undefined,
          kind: "managed"
        });
      case "terminal.input":
        return this.terminals.input(String(args.terminalId), String(args.data ?? ""));
      case "terminal.execute":
        return this.terminals.execute(String(args.terminalId), String(args.command ?? ""));
      case "terminal.show":
        return this.terminals.show(String(args.terminalId));
      case "terminal.kill":
        return this.terminals.kill(String(args.terminalId));
      case "terminal.buffer":
        return this.terminals.buffer(String(args.terminalId));
      case "terminal.clearBuffer":
        return this.terminals.clearBuffer(String(args.terminalId));
      case "terminal.resize":
        return this.terminals.resize(String(args.terminalId), asOptionalNumber(args.columns) ?? 80, asOptionalNumber(args.rows) ?? 24);
      case "copilot.new":
        return this.copilot.startNew(typeof args.cwd === "string" ? args.cwd : undefined);
      case "copilot.continue":
        return this.copilot.continueLatest(typeof args.cwd === "string" ? args.cwd : undefined);
      case "copilot.resume":
        return this.copilot.resume(typeof args.cwd === "string" ? args.cwd : undefined);
      case "copilot.prompt":
        return this.copilot.sendPrompt(String(args.terminalId), String(args.prompt ?? ""));
      case "vscode.command":
        return this.commands.execute(String(args.commandId), Array.isArray(args.args) ? args.args : []);
      case "editor.active":
        return this.workspace.activeEditor();
      case "editor.openFile":
        return this.workspace.openFile(String(args.path), asOptionalNumber(args.line), asOptionalNumber(args.character));
      case "workspace.findFiles":
        return this.workspace.findFiles(typeof args.pattern === "string" ? args.pattern : "**/*", asOptionalNumber(args.limit) ?? 80);
      case "workspace.readFile":
        if (typeof args.path !== "string" || !args.path) {
          throw new Error("workspace.readFile requires a file path");
        }
        return this.workspace.readFile(args.path, asOptionalNumber(args.maxBytes) ?? 120_000);
      case "workspace.writeFile":
        if (typeof args.path !== "string" || !args.path) {
          throw new Error("workspace.writeFile requires a file path");
        }
        if (typeof args.content !== "string") {
          throw new Error("workspace.writeFile requires string content");
        }
        return this.workspace.writeFile(args.path, args.content, asOptionalNumber(args.maxBytes) ?? 120_000);
      case "task.list":
        return this.tasks.list();
      case "task.run":
        return this.tasks.run(String(args.id));
      case "git.status":
        return this.git.status(typeof args.cwd === "string" ? args.cwd : undefined);
      case "diagnostics.list":
        return this.diagnostics.list(asOptionalNumber(args.limit) ?? 80);
      case "trackpad.move":
        return this.trackpad.move(asOptionalNumber(args.deltaX) ?? 0, asOptionalNumber(args.deltaY) ?? 0);
      case "trackpad.click":
        return this.trackpad.click(args.button === "right" ? "right" : "left");
      case "trackpad.scroll":
        return this.trackpad.scroll(asOptionalNumber(args.deltaY) ?? 0);
      default:
        throw new Error(`Unsupported command: ${request.command}`);
    }
  }

  private reply(requestEnvelope: RelayEnvelope, response: CommandResponse): void {
    this.send(createEnvelope("command.response", response, {
      source: "extension",
      target: "mobile",
      requestId: requestEnvelope.id
    }));
  }
}

function asOptionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}
