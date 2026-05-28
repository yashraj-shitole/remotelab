import * as path from "node:path";
import { open } from "node:fs/promises";
import * as vscode from "vscode";
import { ActiveEditor, FileContentSnapshot, FileMatch, WorkspaceSnapshot } from "@remotelab/shared";
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

  async readFile(filePath: string, maxBytes = 120_000): Promise<FileContentSnapshot> {
    const normalizedPath = this.ensureWithinWorkspace(filePath);
    const cappedMaxBytes = Math.min(1_000_000, Math.max(1_000, maxBytes));

    const handle = await open(normalizedPath, "r");
    try {
      const stats = await handle.stat();
      if (!stats.isFile()) {
        throw new Error("Path is not a file");
      }

      const bytesToRead = Math.min(stats.size, cappedMaxBytes);
      const buffer = Buffer.alloc(bytesToRead);
      const { bytesRead } = await handle.read(buffer, 0, bytesToRead, 0);
      const slice = buffer.subarray(0, bytesRead);
      const isBinary = this.isLikelyBinary(slice);
      const truncated = stats.size > cappedMaxBytes;

      return {
        path: normalizedPath,
        relativePath: this.toRelativePath(normalizedPath),
        content: isBinary ? "" : slice.toString("utf8"),
        byteLength: stats.size,
        truncated,
        isBinary
      };
    } finally {
      await handle.close();
    }
  }

  private ensureWithinWorkspace(filePath: string): string {
    const folders = vscode.workspace.workspaceFolders?.map((folder) => folder.uri.fsPath) ?? [];
    if (!folders.length) {
      throw new Error("No workspace is currently open");
    }

    const candidates: string[] = [];
    if (path.isAbsolute(filePath)) {
      candidates.push(path.resolve(filePath));
    } else {
      for (const folder of folders) {
        candidates.push(path.resolve(folder, filePath));
      }
    }

    const normalizedPath = candidates.find((candidate) => this.findWorkspaceRoot(candidate, folders));

    if (!normalizedPath) {
      throw new Error("File path is outside the active workspace");
    }

    return normalizedPath;
  }

  private toRelativePath(filePath: string): string {
    const folders = vscode.workspace.workspaceFolders?.map((folder) => folder.uri.fsPath) ?? [];
    const root = this.findWorkspaceRoot(filePath, folders);

    return root ? path.relative(path.resolve(root), path.resolve(filePath)) : filePath;
  }

  private findWorkspaceRoot(filePath: string, folders: string[]): string | undefined {
    return folders.find((folder) => this.isWithinFolder(filePath, folder));
  }

  private isWithinFolder(filePath: string, folderPath: string): boolean {
    const normalizedPath = path.resolve(filePath);
    const normalizedFolder = path.resolve(folderPath);

    if (process.platform === "win32") {
      const foldedPath = normalizedPath.toLowerCase();
      const foldedFolder = normalizedFolder.toLowerCase();
      return foldedPath === foldedFolder || foldedPath.startsWith(`${foldedFolder}${path.sep}`);
    }

    return normalizedPath === normalizedFolder || normalizedPath.startsWith(`${normalizedFolder}${path.sep}`);
  }

  private isLikelyBinary(buffer: Buffer): boolean {
    const sample = buffer.subarray(0, Math.min(buffer.length, 2048));
    for (const value of sample) {
      if (value === 0) {
        return true;
      }
    }

    return false;
  }
}
