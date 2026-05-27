import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as vscode from "vscode";
import { GitStatusSnapshot } from "@remotelab/shared";

const execFileAsync = promisify(execFile);

export class GitService {
  async status(cwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath): Promise<GitStatusSnapshot> {
    if (!cwd) {
      return { entries: [] };
    }

    const { stdout } = await execFileAsync("git", ["status", "--short", "--branch"], { cwd });
    const lines = stdout.split(/\r?\n/).filter(Boolean);
    const branchLine = lines[0]?.startsWith("##") ? lines.shift() : undefined;
    return {
      cwd,
      branchLine,
      entries: lines
    };
  }
}
