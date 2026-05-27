import * as path from "node:path";
import * as vscode from "vscode";
import { ActiveEditor, FileMatch, WorkspaceSnapshot } from "@companion/shared";
import { DiagnosticsService } from "./DiagnosticsService";
import { GitService } from "./GitService";
import { TerminalService } from "./TerminalService";

export class WorkspaceService {
  constructor(
    private readonly terminals: TerminalService,
    private readonly diagnostics: DiagnosticsService,
    private readonly git: GitService
  ) {}

  async snapshot(): Promise<WorkspaceSnapshot> {
    return {
      workspaceName: vscode.workspace.name ?? "Untitled Workspace",
      folders: vscode.workspace.workspaceFolders?.map((folder) => folder.uri.fsPath) ?? [],
      activeEditor: this.activeEditor(),
      terminals: await this.terminals.list(),
      diagnostics: this.diagnostics.list(20),
      git: await this.git.status().catch(() => ({ entries: [] }))
    };
  }

  activeEditor(): ActiveEditor | undefined {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      return undefined;
    }

    return {
      fileName: editor.document.uri.fsPath,
      languageId: editor.document.languageId,
      isDirty: editor.document.isDirty,
      line: editor.selection.active.line + 1,
      character: editor.selection.active.character + 1
    };
  }

  async openFile(filePath: string, line?: number, character?: number): Promise<ActiveEditor | undefined> {
    const uri = vscode.Uri.file(filePath);
    const document = await vscode.workspace.openTextDocument(uri);
    const editor = await vscode.window.showTextDocument(document);

    if (line && line > 0) {
      const position = new vscode.Position(line - 1, Math.max(0, (character ?? 1) - 1));
      editor.selection = new vscode.Selection(position, position);
      editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
    }

    return this.activeEditor();
  }

  async findFiles(pattern = "**/*", limit = 80): Promise<FileMatch[]> {
    const exclude = "**/{node_modules,.git,dist,out,.angular}/**";
    const uris = await vscode.workspace.findFiles(pattern, exclude, limit);
    const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;

    return uris.map((uri) => ({
      path: uri.fsPath,
      relativePath: root ? path.relative(root, uri.fsPath) : uri.fsPath
    }));
  }
}
