import * as vscode from "vscode";
import { TrackpadPointerState } from "@remotelab/shared";

const pixelsPerCharacter = 9;
const pixelsPerLine = 18;
const pixelsPerScrollLine = 16;
const maxMoveStep = 40;
const maxScrollStep = 80;

// VS Code does not expose native mouse injection, so trackpad gestures map to cursor and editor scroll commands.
export class TrackpadService implements vscode.Disposable {
  private carryX = 0;
  private carryY = 0;
  private scrollCarry = 0;

  private readonly pointerDecoration = vscode.window.createTextEditorDecorationType({
    before: {
      contentText: ">",
      color: new vscode.ThemeColor("editorCursor.foreground"),
      margin: "0 0 0 -0.9ch",
      fontWeight: "700"
    },
    rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
  });

  async move(deltaX: number, deltaY: number): Promise<TrackpadPointerState | undefined> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return undefined;
    }

    const horizontal = this.consumeMove(deltaX, "x");
    const vertical = this.consumeMove(deltaY, "y");
    if (horizontal === 0 && vertical === 0) {
      return this.pointerFromEditor(editor);
    }

    const current = editor.selection.active;
    const next = clampPosition(editor.document, current.line + vertical, current.character + horizontal);
    this.applyPointer(editor, next);
    return toPointerState(editor, next);
  }

  async click(button: "left" | "right"): Promise<{ button: "left" | "right"; pointer?: TrackpadPointerState }> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return { button };
    }

    const position = editor.selection.active;
    this.applyPointer(editor, position);

    if (button === "right") {
      await vscode.commands.executeCommand("editor.action.showContextMenu");
    }

    return {
      button,
      pointer: toPointerState(editor, position)
    };
  }

  async scroll(deltaY: number): Promise<{ lines: number; pointer?: TrackpadPointerState }> {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return { lines: 0 };
    }

    const lines = this.consumeScroll(deltaY);

    if (lines !== 0) {
      await vscode.commands.executeCommand("editorScroll", {
        to: lines > 0 ? "down" : "up",
        by: "line",
        value: Math.abs(lines),
        revealCursor: false
      });
    }

    return {
      lines,
      pointer: this.pointerFromEditor(editor)
    };
  }

  dispose(): void {
    this.pointerDecoration.dispose();
  }

  private pointerFromEditor(editor: vscode.TextEditor): TrackpadPointerState {
    this.applyPointer(editor, editor.selection.active);
    return toPointerState(editor, editor.selection.active);
  }

  private applyPointer(editor: vscode.TextEditor, position: vscode.Position): void {
    editor.selection = new vscode.Selection(position, position);
    editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenterIfOutsideViewport);

    const range = new vscode.Range(position, position);
    for (const candidate of vscode.window.visibleTextEditors) {
      candidate.setDecorations(this.pointerDecoration, candidate === editor ? [range] : []);
    }
  }

  private consumeMove(delta: number, axis: "x" | "y"): number {
    const unit = axis === "x" ? pixelsPerCharacter : pixelsPerLine;
    const carry = axis === "x" ? this.carryX : this.carryY;
    const split = splitToSteps(carry + safeNumber(delta), unit, maxMoveStep);

    if (axis === "x") {
      this.carryX = split.remainder;
    } else {
      this.carryY = split.remainder;
    }

    return split.steps;
  }

  private consumeScroll(deltaY: number): number {
    const split = splitToSteps(this.scrollCarry + safeNumber(deltaY), pixelsPerScrollLine, maxScrollStep);
    this.scrollCarry = split.remainder;
    return split.steps;
  }
}

function splitToSteps(total: number, unit: number, maxSteps: number): { steps: number; remainder: number } {
  if (Math.abs(total) < unit) {
    return { steps: 0, remainder: total };
  }

  const rawSteps = total > 0 ? Math.floor(total / unit) : Math.ceil(total / unit);
  const steps = clamp(rawSteps, -maxSteps, maxSteps);
  const remainder = rawSteps === steps ? total - steps * unit : 0;
  return { steps, remainder };
}

function clampPosition(document: vscode.TextDocument, line: number, character: number): vscode.Position {
  const safeLine = clamp(Math.round(line), 0, document.lineCount - 1);
  const lineLength = document.lineAt(safeLine).range.end.character;
  const safeCharacter = clamp(Math.round(character), 0, lineLength);
  return new vscode.Position(safeLine, safeCharacter);
}

function toPointerState(editor: vscode.TextEditor, position: vscode.Position): TrackpadPointerState {
  return {
    fileName: editor.document.uri.fsPath,
    line: position.line + 1,
    character: position.character + 1
  };
}

function safeNumber(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
