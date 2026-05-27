import * as vscode from "vscode";
import { DiagnosticItem, DiagnosticSnapshot } from "@remotelab/shared";

export class DiagnosticsService {
  list(limit = 80): DiagnosticSnapshot {
    const items: DiagnosticItem[] = [];
    let errors = 0;
    let warnings = 0;
    let infos = 0;
    let hints = 0;

    for (const [uri, diagnostics] of vscode.languages.getDiagnostics()) {
      for (const diagnostic of diagnostics) {
        const severity = toSeverity(diagnostic.severity);
        if (severity === "error") errors += 1;
        if (severity === "warning") warnings += 1;
        if (severity === "info") infos += 1;
        if (severity === "hint") hints += 1;

        if (items.length < limit) {
          items.push({
            file: uri.fsPath,
            message: diagnostic.message,
            severity,
            line: diagnostic.range.start.line + 1,
            character: diagnostic.range.start.character + 1,
            source: diagnostic.source
          });
        }
      }
    }

    return {
      total: errors + warnings + infos + hints,
      errors,
      warnings,
      infos,
      hints,
      items
    };
  }
}

function toSeverity(severity: vscode.DiagnosticSeverity): DiagnosticItem["severity"] {
  switch (severity) {
    case vscode.DiagnosticSeverity.Error:
      return "error";
    case vscode.DiagnosticSeverity.Warning:
      return "warning";
    case vscode.DiagnosticSeverity.Information:
      return "info";
    case vscode.DiagnosticSeverity.Hint:
      return "hint";
  }
}
