import { Component, ElementRef, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, ViewChild } from "@angular/core";
import { FormsModule } from "@angular/forms";
import loader from "@monaco-editor/loader";
import { ActiveEditor, DiagnosticSnapshot, FileContentSnapshot, FileMatch, GitStatusSnapshot, TaskSummary } from "@remotelab/shared";
import type { editor, IDisposable } from "monaco-editor";

type MonacoApi = typeof import("monaco-editor");

type OpenFileRequest = {
  path: string;
  line?: number;
  character?: number;
};

type SaveFileRequest = {
  path: string;
  content: string;
  line?: number;
  character?: number;
};

type ExplorerFolderNode = {
  key: string;
  name: string;
  depth: number;
  folders: Map<string, ExplorerFolderNode>;
  files: ExplorerFileNode[];
};

type ExplorerFileNode = {
  path: string;
  relativePath: string;
  name: string;
};

type ExplorerFolderRow = {
  kind: "folder";
  key: string;
  name: string;
  depth: number;
  expanded: boolean;
};

type ExplorerFileRow = {
  kind: "file";
  path: string;
  relativePath: string;
  name: string;
  depth: number;
  icon: string;
  active: boolean;
};

type ExplorerRow = ExplorerFolderRow | ExplorerFileRow;

const defaultGlobPattern = "**/*";

const extensionIcons: Record<string, string> = {
  ts: "TS",
  tsx: "TSX",
  js: "JS",
  jsx: "JSX",
  json: "{}",
  md: "MD",
  html: "HTML",
  css: "CSS",
  scss: "SCSS",
  yml: "YAML",
  yaml: "YAML",
  py: "PY",
  go: "GO",
  java: "JAVA",
  c: "C",
  cpp: "CPP",
  h: "H",
  hpp: "HPP",
  rs: "RS"
};

let monacoLoaderPromise: Promise<MonacoApi> | undefined;

@Component({
  selector: "app-workspace-section",
  standalone: true,
  imports: [FormsModule],
  styleUrl: "./workspace-section.component.css",
  template: `
    <section class="panel">
      <p class="caption">WORKSPACE</p>
      <h2>EDITOR COMMAND</h2>
      <div class="button-row">
        <button class="button-primary" type="button" (click)="onSaveAction()">SAVE</button>
        <button class="button-primary" type="button" (click)="executeCommand.emit('workbench.action.quickOpen')">QUICK OPEN</button>
        <button class="button-primary" type="button" (click)="executeCommand.emit('workbench.action.problems.focus')">PROBLEMS</button>
      </div>

      <div class="data-band">
        <div>
          <p class="caption">GIT</p>
          <button class="text-link" type="button" (click)="refreshGit.emit()">REFRESH GIT</button>
          <p class="mono">{{ git?.branchLine || 'NO BRANCH DATA' }}</p>
          @for (entry of git?.entries ?? []; track entry) {
            <p class="row">{{ entry }}</p>
          }
        </div>

        <div>
          <p class="caption">DIAGNOSTICS</p>
          <button class="text-link" type="button" (click)="refreshDiagnostics.emit()">REFRESH DIAGNOSTICS</button>
          @for (item of diagnostics?.items ?? []; track item.file + item.line + item.message) {
            <button class="row row-button" type="button" (click)="openFileAt(item.file, item.line, item.character)">
              {{ item.severity }} / {{ item.file }}:{{ item.line }} {{ item.message }}
            </button>
          }
        </div>
      </div>

      <div class="data-band">
        <div>
          <p class="caption">TASKS</p>
          <button class="text-link" type="button" (click)="loadTasks.emit()">LOAD TASKS</button>
          @for (task of tasks; track task.id) {
            <button class="row row-button" type="button" (click)="runTask.emit(task.id)">
              {{ task.source }} / {{ task.name }}
            </button>
          }
        </div>

        <div>
          <p class="caption">EXPLORER</p>
          <div class="command-form">
            <input
              [ngModel]="filePattern"
              (ngModelChange)="filePatternChange.emit($event)"
              name="filePattern"
              placeholder="**/*">
            <button class="button-primary" type="button" (click)="findFiles.emit()">REFRESH</button>
          </div>

          <div class="command-form quick-search-form">
            <input
              [ngModel]="quickSearch"
              (ngModelChange)="onQuickSearchChange($event)"
              (keydown.enter)="openFirstSearchResult()"
              name="quickSearch"
              placeholder="Quick search by name or path">
            <button class="button-primary" type="button" [disabled]="!quickSearch.trim()" (click)="clearQuickSearch()">CLEAR</button>
          </div>

          <p class="row tree-meta">{{ filteredFileCount }} / {{ files.length }} FILES</p>

          @if (!files.length) {
            <p class="row">LOAD FILES TO SEE THE TREE.</p>
          } @else if (!treeRows.length) {
            <p class="row">NO FILES MATCH THE QUICK SEARCH.</p>
          } @else {
            <div class="file-tree" role="tree" aria-label="Workspace file tree">
              @for (row of treeRows; track trackTreeRow($index, row)) {
                @if (row.kind === "folder") {
                  <button
                    class="tree-row row-button folder-row"
                    type="button"
                    role="treeitem"
                    [style.padding-left.px]="row.depth * 16 + 8"
                    [attr.aria-expanded]="row.expanded"
                    (click)="toggleFolder(row.key)">
                    <span class="tree-chevron">{{ row.expanded ? "v" : ">" }}</span>
                    <span class="tree-icon folder-icon">DIR</span>
                    <span class="tree-label">{{ row.name }}</span>
                  </button>
                } @else {
                  <button
                    class="tree-row row-button file-row"
                    type="button"
                    role="treeitem"
                    [class.active]="row.active"
                    [style.padding-left.px]="row.depth * 16 + 8"
                    (click)="selectFileFromTree(row.path)">
                    <span class="tree-chevron spacer">&gt;</span>
                    <span class="tree-icon file-icon">{{ row.icon }}</span>
                    <span class="tree-label">{{ row.name }}</span>
                  </button>
                }
              }
            </div>
          }

          <div class="file-preview">
            <div class="file-preview-header">
              <p class="caption">FILE EDITOR</p>

              @if (selectedFile && !selectedFile.isBinary) {
                <div class="preview-actions">
                  <button class="text-link" type="button" (click)="openPreviewInEditor()">OPEN WITH CURSOR</button>
                  <button class="text-link" type="button" [disabled]="fileSaveLoading || !editorDirty" (click)="saveRemoteFile()">
                    {{ fileSaveLoading ? "SAVING..." : "SAVE REMOTE" }}
                  </button>
                </div>
              } @else if (selectedFile) {
                <button class="text-link" type="button" (click)="openPreviewInEditor()">OPEN IN EDITOR</button>
              }
            </div>

            @if (!selectedFile) {
              @if (filePreviewLoading) {
                <p class="row">LOADING FILE...</p>
              } @else {
                <p class="row">SELECT A FILE TO PREVIEW.</p>
              }
            } @else if (selectedFile.isBinary) {
              <p class="row">BINARY FILE PREVIEW IS NOT AVAILABLE.</p>
            } @else if (monacoLoadError) {
              <p class="row">{{ monacoLoadError }}</p>
            } @else {
              <p class="mono">
                {{ selectedFile.relativePath }} / {{ selectedFile.byteLength }} BYTES
                @if (selectedFile.truncated) {
                  <span> / TRUNCATED</span>
                }
              </p>
              <p class="row">
                CURSOR {{ previewCursorLine }}:{{ previewCursorCharacter }}
                @if (editorDirty) {
                  <span> / UNSAVED</span>
                }
              </p>
              <div class="file-content" role="region" aria-label="Monaco file editor">
                <div #monacoHost class="monaco-host"></div>
              </div>

              @if (filePreviewLoading) {
                <p class="row loading-indicator">LOADING FILE...</p>
              }
            }
          </div>
        </div>
      </div>
    </section>
  `
})
export class WorkspaceSectionComponent implements OnChanges, OnDestroy {
  @Input() git: GitStatusSnapshot | undefined;
  @Input() diagnostics: DiagnosticSnapshot | undefined;
  @Input() tasks: TaskSummary[] = [];
  @Input() files: FileMatch[] = [];
  @Input() filePattern = defaultGlobPattern;
  @Input() selectedFile: FileContentSnapshot | undefined;
  @Input() filePreviewLoading = false;
  @Input() fileSaveLoading = false;
  @Input() activeEditor: ActiveEditor | undefined;

  @ViewChild("monacoHost")
  set monacoHostRef(host: ElementRef<HTMLDivElement> | undefined) {
    this.monacoHost = host;
    if (!host) {
      return;
    }

    if (this.monacoEditor && this.monacoEditor.getDomNode() !== host.nativeElement) {
      this.disposeMonacoEditor();
    }

    void this.ensureMonacoEditor();
  }

  quickSearch = "";
  filteredFileCount = 0;
  treeRows: ExplorerRow[] = [];
  previewCursorLine = 1;
  previewCursorCharacter = 1;
  editorDirty = false;
  monacoLoadError = "";

  private filteredFiles: FileMatch[] = [];
  private readonly collapsedFolders = new Set<string>();

  private monacoHost: ElementRef<HTMLDivElement> | undefined;
  private monacoApi: MonacoApi | undefined;
  private monacoEditor: editor.IStandaloneCodeEditor | undefined;
  private monacoModel: editor.ITextModel | undefined;
  private readonly monacoDisposables: IDisposable[] = [];
  private applyingRemoteEditorState = false;

  @Output() executeCommand = new EventEmitter<string>();
  @Output() refreshGit = new EventEmitter<void>();
  @Output() refreshDiagnostics = new EventEmitter<void>();
  @Output() loadTasks = new EventEmitter<void>();
  @Output() runTask = new EventEmitter<string>();
  @Output() filePatternChange = new EventEmitter<string>();
  @Output() findFiles = new EventEmitter<void>();
  @Output() viewFile = new EventEmitter<string>();
  @Output() openFile = new EventEmitter<OpenFileRequest>();
  @Output() saveFile = new EventEmitter<SaveFileRequest>();

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["files"] || changes["selectedFile"]) {
      this.rebuildExplorerRows();
    }

    if (changes["selectedFile"]) {
      this.resetPreviewCursorFromContext();
      void this.syncMonacoFromSelectedFile();
    }

    if (changes["activeEditor"]) {
      this.syncPreviewCursorFromActiveEditor();
    }
  }

  ngOnDestroy(): void {
    this.disposeMonacoEditor();
    this.monacoModel?.dispose();
  }

  onQuickSearchChange(value: string): void {
    this.quickSearch = value;
    this.rebuildExplorerRows();
  }

  clearQuickSearch(): void {
    if (!this.quickSearch.trim()) {
      return;
    }

    this.quickSearch = "";
    this.rebuildExplorerRows();
  }

  openFirstSearchResult(): void {
    const first = this.filteredFiles[0];
    if (!first) {
      return;
    }

    this.selectFileFromTree(first.path);
  }

  toggleFolder(folderKey: string): void {
    if (this.collapsedFolders.has(folderKey)) {
      this.collapsedFolders.delete(folderKey);
    } else {
      this.collapsedFolders.add(folderKey);
    }

    this.rebuildExplorerRows();
  }

  selectFileFromTree(path: string): void {
    this.viewFile.emit(path);
  }

  openFileAt(path: string, line?: number, character?: number): void {
    this.openFile.emit({ path, line, character });
  }

  openPreviewInEditor(): void {
    if (!this.selectedFile) {
      return;
    }

    this.openFile.emit({
      path: this.selectedFile.path,
      line: this.previewCursorLine,
      character: this.previewCursorCharacter
    });
  }

  onSaveAction(): void {
    if (this.selectedFile && !this.selectedFile.isBinary && this.editorDirty) {
      this.saveRemoteFile();
      return;
    }

    this.executeCommand.emit("workbench.action.files.save");
  }

  saveRemoteFile(): void {
    if (!this.selectedFile || !this.monacoEditor || this.selectedFile.isBinary || this.fileSaveLoading || !this.editorDirty) {
      return;
    }

    this.saveFile.emit({
      path: this.selectedFile.path,
      content: this.monacoEditor.getValue(),
      line: this.previewCursorLine,
      character: this.previewCursorCharacter
    });
  }

  trackTreeRow(_index: number, row: ExplorerRow): string {
    return row.kind === "folder" ? `folder:${row.key}` : `file:${row.path}`;
  }

  private async ensureMonacoEditor(): Promise<void> {
    if (this.monacoEditor || !this.monacoHost) {
      return;
    }

    try {
      this.monacoApi = await loadMonacoEditor();
      if (!this.monacoModel) {
        this.monacoModel = this.monacoApi.editor.createModel("", "plaintext");
      }
      this.monacoEditor = this.monacoApi.editor.create(this.monacoHost.nativeElement, {
        model: this.monacoModel,
        language: "plaintext",
        readOnly: true,
        automaticLayout: true,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        fontSize: 13,
        lineNumbersMinChars: 3,
        wordWrap: "off",
        renderWhitespace: "selection",
        tabSize: 2,
        insertSpaces: true,
        theme: "vs-dark"
      });

      const editor = this.monacoEditor;

      editor.addCommand(this.monacoApi.KeyMod.CtrlCmd | this.monacoApi.KeyCode.KeyS, () => {
        this.onSaveAction();
        return null;
      });

      this.monacoDisposables.push(
        editor.onDidChangeModelContent(() => {
          if (this.applyingRemoteEditorState || !this.selectedFile || this.selectedFile.isBinary) {
            return;
          }

          this.editorDirty = editor.getValue() !== this.selectedFile.content;
        })
      );

      this.monacoDisposables.push(
        editor.onDidChangeCursorPosition((event: editor.ICursorPositionChangedEvent) => {
          this.setPreviewCursor(event.position.lineNumber, event.position.column);
        })
      );

      this.monacoLoadError = "";
      await this.syncMonacoFromSelectedFile();
      editor.layout();
    } catch {
      this.monacoLoadError = "Monaco editor failed to load. Check network access and reload the page.";
    }
  }

  private disposeMonacoEditor(): void {
    for (const disposable of this.monacoDisposables) {
      disposable.dispose();
    }
    this.monacoDisposables.length = 0;
    this.monacoEditor?.dispose();
    this.monacoEditor = undefined;
  }

  private async syncMonacoFromSelectedFile(): Promise<void> {
    if (!this.selectedFile || this.selectedFile.isBinary) {
      this.editorDirty = false;
      return;
    }

    if (!this.monacoEditor) {
      await this.ensureMonacoEditor();
    }

    if (!this.monacoApi || !this.monacoEditor || !this.monacoModel) {
      return;
    }

    this.monacoApi.editor.setModelLanguage(this.monacoModel, this.monacoLanguageForPath(this.selectedFile.relativePath || this.selectedFile.path));
    this.setMonacoContent(this.selectedFile.content);
    this.monacoEditor.updateOptions({ readOnly: false });
    this.editorDirty = false;
    this.applyCursorToMonaco();
  }

  private setMonacoContent(content: string): void {
    if (!this.monacoModel) {
      return;
    }

    if (this.monacoModel.getValue() === content) {
      return;
    }

    this.applyingRemoteEditorState = true;
    this.monacoModel.setValue(content);
    this.applyingRemoteEditorState = false;
  }

  private setPreviewCursor(line: number, character: number): void {
    const lineCount = this.monacoModel?.getLineCount() ?? 1;
    const safeLine = clamp(Math.round(line), 1, lineCount);
    const maxCharacter = this.monacoModel?.getLineMaxColumn(safeLine) ?? 1;
    this.previewCursorLine = safeLine;
    this.previewCursorCharacter = clamp(Math.round(character), 1, maxCharacter);
  }

  private applyCursorToMonaco(): void {
    if (!this.monacoEditor || !this.monacoModel) {
      return;
    }

    const safeLine = clamp(this.previewCursorLine, 1, this.monacoModel.getLineCount());
    const safeCharacter = clamp(this.previewCursorCharacter, 1, this.monacoModel.getLineMaxColumn(safeLine));
    const position = this.monacoEditor.getPosition();

    if (!position || position.lineNumber !== safeLine || position.column !== safeCharacter) {
      this.monacoEditor.setPosition({ lineNumber: safeLine, column: safeCharacter });
    }
    this.monacoEditor.revealPositionInCenterIfOutsideViewport({ lineNumber: safeLine, column: safeCharacter });
  }

  private rebuildExplorerRows(): void {
    const query = this.quickSearch.trim().toLowerCase();
    const sortedFiles = [...this.files].sort((left, right) => this.compareFilePaths(left.relativePath, right.relativePath));
    this.filteredFiles = query
      ? sortedFiles.filter((file) => this.normalizeRelativePath(file.relativePath).toLowerCase().includes(query))
      : sortedFiles;
    this.filteredFileCount = this.filteredFiles.length;
    this.treeRows = this.buildTreeRows(this.filteredFiles, query.length > 0);
  }

  private buildTreeRows(files: FileMatch[], forceExpand: boolean): ExplorerRow[] {
    const root: ExplorerFolderNode = {
      key: "",
      name: "",
      depth: -1,
      folders: new Map<string, ExplorerFolderNode>(),
      files: []
    };

    for (const file of files) {
      const relativePath = this.normalizeRelativePath(file.relativePath || file.path);
      const segments = relativePath.split("/").filter(Boolean);

      if (!segments.length) {
        continue;
      }

      let folder = root;
      for (let index = 0; index < segments.length - 1; index += 1) {
        const segment = segments[index];
        const key = folder.key ? `${folder.key}/${segment}` : segment;
        let next = folder.folders.get(segment);

        if (!next) {
          next = {
            key,
            name: segment,
            depth: folder.depth + 1,
            folders: new Map<string, ExplorerFolderNode>(),
            files: []
          };
          folder.folders.set(segment, next);
        }

        folder = next;
      }

      const name = segments[segments.length - 1];
      folder.files.push({
        path: file.path,
        relativePath,
        name
      });
    }

    const rows: ExplorerRow[] = [];
    this.flattenFolderRows(rows, root, forceExpand);
    return rows;
  }

  private flattenFolderRows(rows: ExplorerRow[], folder: ExplorerFolderNode, forceExpand: boolean): void {
    const folders = Array.from(folder.folders.values()).sort((left, right) => this.compareFilePaths(left.name, right.name));
    for (const child of folders) {
      const expanded = forceExpand || !this.collapsedFolders.has(child.key);
      rows.push({
        kind: "folder",
        key: child.key,
        name: child.name,
        depth: child.depth,
        expanded
      });

      if (expanded) {
        this.flattenFolderRows(rows, child, forceExpand);
      }
    }

    const files = [...folder.files].sort((left, right) => this.compareFilePaths(left.name, right.name));
    for (const file of files) {
      rows.push({
        kind: "file",
        path: file.path,
        relativePath: file.relativePath,
        name: file.name,
        depth: folder.depth + 1,
        icon: this.iconForFile(file.name),
        active: this.isPathEqual(this.selectedFile?.path, file.path)
      });
    }
  }

  private resetPreviewCursorFromContext(): void {
    if (!this.selectedFile) {
      this.previewCursorLine = 1;
      this.previewCursorCharacter = 1;
      return;
    }

    if (this.activeEditor && this.isPathEqual(this.selectedFile.path, this.activeEditor.fileName)) {
      this.setPreviewCursor(this.activeEditor.line, this.activeEditor.character);
      this.applyCursorToMonaco();
      return;
    }

    this.setPreviewCursor(1, 1);
    this.applyCursorToMonaco();
  }

  private syncPreviewCursorFromActiveEditor(): void {
    if (!this.selectedFile || !this.activeEditor) {
      return;
    }

    if (!this.isPathEqual(this.selectedFile.path, this.activeEditor.fileName)) {
      return;
    }

    this.setPreviewCursor(this.activeEditor.line, this.activeEditor.character);
    this.applyCursorToMonaco();
  }

  private normalizeRelativePath(pathValue: string): string {
    return pathValue.replace(/\\/g, "/").replace(/^\.\/+/, "");
  }

  private compareFilePaths(left: string, right: string): number {
    return left.localeCompare(right, undefined, { sensitivity: "base", numeric: true });
  }

  private iconForFile(fileName: string): string {
    const extension = fileName.includes(".") ? fileName.split(".").pop()?.toLowerCase() : "";
    return extension && extensionIcons[extension] ? extensionIcons[extension] : "FILE";
  }

  private monacoLanguageForPath(filePath: string): string {
    const extension = filePath.includes(".") ? filePath.split(".").pop()?.toLowerCase() : "";
    switch (extension) {
      case "ts":
      case "tsx":
        return "typescript";
      case "js":
      case "jsx":
        return "javascript";
      case "json":
        return "json";
      case "md":
        return "markdown";
      case "html":
        return "html";
      case "css":
      case "scss":
        return "css";
      case "yml":
      case "yaml":
        return "yaml";
      case "py":
        return "python";
      case "go":
        return "go";
      case "java":
        return "java";
      case "rs":
        return "rust";
      case "c":
      case "h":
        return "c";
      case "cpp":
      case "hpp":
        return "cpp";
      default:
        return "plaintext";
    }
  }

  private isPathEqual(left: string | undefined, right: string | undefined): boolean {
    if (!left || !right) {
      return false;
    }

    return this.normalizePathForCompare(left) === this.normalizePathForCompare(right);
  }

  private normalizePathForCompare(value: string): string {
    const normalized = value.replace(/\\/g, "/");
    return /^[a-zA-Z]:\//.test(normalized) ? normalized.toLowerCase() : normalized;
  }
}

async function loadMonacoEditor(): Promise<MonacoApi> {
  if (!monacoLoaderPromise) {
    monacoLoaderPromise = loader.init() as Promise<MonacoApi>;
  }

  return monacoLoaderPromise;
}

function clamp(value: number, minimum: number, maximum: number): number {
  if (value < minimum) {
    return minimum;
  }

  if (value > maximum) {
    return maximum;
  }

  return value;
}