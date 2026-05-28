import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { ActiveEditor, DiagnosticSnapshot, FileContentSnapshot, FileMatch, GitStatusSnapshot, TaskSummary } from "@remotelab/shared";

type OpenFileRequest = {
  path: string;
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

type PreviewLine = {
  number: number;
  text: string;
};

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
        <button class="button-primary" type="button" (click)="executeCommand.emit('workbench.action.files.save')">SAVE</button>
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
              <p class="caption">FILE CONTENT</p>
              @if (selectedFile) {
                <button class="text-link" type="button" (click)="openPreviewInEditor()">OPEN WITH CURSOR</button>
              }
            </div>

            @if (filePreviewLoading) {
              <p class="row">LOADING FILE...</p>
            } @else if (!selectedFile) {
              <p class="row">SELECT A FILE TO PREVIEW.</p>
            } @else if (selectedFile.isBinary) {
              <p class="row">BINARY FILE PREVIEW IS NOT AVAILABLE.</p>
            } @else {
              <p class="mono">
                {{ selectedFile.relativePath }} / {{ selectedFile.byteLength }} BYTES
                @if (selectedFile.truncated) {
                  <span> / TRUNCATED</span>
                }
              </p>
              <p class="row">CURSOR {{ previewCursorLine }}:{{ previewCursorCharacter }}</p>
              <div class="file-content" role="listbox" aria-label="File preview lines">
                @for (line of previewLines; track line.number) {
                  <button
                    class="file-line"
                    type="button"
                    [class.cursor-active]="line.number === previewCursorLine"
                    (click)="onPreviewLineClick(line.number, $event)">
                    <span class="line-number">{{ line.number }}</span>
                    <span class="line-text">
                      @if (line.number === previewCursorLine) {
                        <span>{{ cursorPrefix(line) }}</span>
                        <span class="cursor-marker" aria-hidden="true"></span>
                        <span>{{ cursorSuffix(line) }}</span>
                      } @else {
                        {{ line.text || " " }}
                      }
                    </span>
                  </button>
                }
              </div>
            }
          </div>
        </div>
      </div>
    </section>
  `
})
export class WorkspaceSectionComponent implements OnChanges {
  @Input() git: GitStatusSnapshot | undefined;
  @Input() diagnostics: DiagnosticSnapshot | undefined;
  @Input() tasks: TaskSummary[] = [];
  @Input() files: FileMatch[] = [];
  @Input() filePattern = defaultGlobPattern;
  @Input() selectedFile: FileContentSnapshot | undefined;
  @Input() filePreviewLoading = false;
  @Input() activeEditor: ActiveEditor | undefined;

  quickSearch = "";
  filteredFileCount = 0;
  treeRows: ExplorerRow[] = [];
  previewLines: PreviewLine[] = [];
  previewCursorLine = 1;
  previewCursorCharacter = 1;

  private filteredFiles: FileMatch[] = [];
  private readonly collapsedFolders = new Set<string>();

  @Output() executeCommand = new EventEmitter<string>();
  @Output() refreshGit = new EventEmitter<void>();
  @Output() refreshDiagnostics = new EventEmitter<void>();
  @Output() loadTasks = new EventEmitter<void>();
  @Output() runTask = new EventEmitter<string>();
  @Output() filePatternChange = new EventEmitter<string>();
  @Output() findFiles = new EventEmitter<void>();
  @Output() viewFile = new EventEmitter<string>();
  @Output() openFile = new EventEmitter<OpenFileRequest>();

  ngOnChanges(changes: SimpleChanges): void {
    if (changes["files"] || changes["selectedFile"]) {
      this.rebuildExplorerRows();
    }

    if (changes["selectedFile"]) {
      this.refreshPreviewLines();
      this.resetPreviewCursorFromContext();
      return;
    }

    if (changes["activeEditor"]) {
      this.syncPreviewCursorFromActiveEditor();
    }
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

  setPreviewCursor(line: number, character: number): void {
    const lineCount = this.previewLines.length || 1;
    const safeLine = clamp(Math.round(line), 1, lineCount);
    const lineText = this.previewLines[safeLine - 1]?.text ?? "";
    const maxCharacter = Math.max(1, lineText.length + 1);
    this.previewCursorLine = safeLine;
    this.previewCursorCharacter = clamp(Math.round(character), 1, maxCharacter);
  }

  onPreviewLineClick(line: number, event: MouseEvent): void {
    const character = this.characterFromPreviewClick(line, event);
    this.setPreviewCursor(line, character);

    if (!this.selectedFile) {
      return;
    }

    this.openFile.emit({
      path: this.selectedFile.path,
      line: this.previewCursorLine,
      character: this.previewCursorCharacter
    });
  }

  trackTreeRow(_index: number, row: ExplorerRow): string {
    return row.kind === "folder" ? `folder:${row.key}` : `file:${row.path}`;
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

  private refreshPreviewLines(): void {
    if (!this.selectedFile || this.selectedFile.isBinary) {
      this.previewLines = [];
      return;
    }

    const lines = this.selectedFile.content.split(/\r?\n/);
    this.previewLines = lines.map((text, index) => ({
      number: index + 1,
      text
    }));
  }

  private resetPreviewCursorFromContext(): void {
    if (!this.selectedFile) {
      this.previewCursorLine = 1;
      this.previewCursorCharacter = 1;
      return;
    }

    if (this.activeEditor && this.isPathEqual(this.selectedFile.path, this.activeEditor.fileName)) {
      this.setPreviewCursor(this.activeEditor.line, this.activeEditor.character);
      return;
    }

    this.setPreviewCursor(1, 1);
  }

  private syncPreviewCursorFromActiveEditor(): void {
    if (!this.selectedFile || !this.activeEditor) {
      return;
    }

    if (!this.isPathEqual(this.selectedFile.path, this.activeEditor.fileName)) {
      return;
    }

    this.setPreviewCursor(this.activeEditor.line, this.activeEditor.character);
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

  cursorPrefix(line: PreviewLine): string {
    const index = this.cursorIndexForLine(line);
    return line.text.slice(0, index);
  }

  cursorSuffix(line: PreviewLine): string {
    const index = this.cursorIndexForLine(line);
    const suffix = line.text.slice(index);
    return suffix || " ";
  }

  private cursorIndexForLine(line: PreviewLine): number {
    return clamp(this.previewCursorCharacter - 1, 0, line.text.length);
  }

  private characterFromPreviewClick(line: number, event: MouseEvent): number {
    const lineEntry = this.previewLines.find((entry) => entry.number === line);
    const textLength = lineEntry?.text.length ?? 0;
    if (textLength === 0) {
      return 1;
    }

    const target = event.target instanceof HTMLElement ? event.target : undefined;
    const lineTextElement = target?.closest(".line-text") as HTMLElement | null;
    if (!lineTextElement) {
      return 1;
    }

    const rect = lineTextElement.getBoundingClientRect();
    if (!rect.width) {
      return 1;
    }

    const style = window.getComputedStyle(lineTextElement);
    const paddingLeft = Number.parseFloat(style.paddingLeft) || 0;
    const paddingRight = Number.parseFloat(style.paddingRight) || 0;
    const contentWidth = Math.max(1, rect.width - paddingLeft - paddingRight);
    const cursorX = clamp(event.clientX - rect.left - paddingLeft, 0, contentWidth);
    const charWidth = contentWidth / Math.max(1, textLength);
    const character = Math.floor(cursorX / Math.max(charWidth, 1)) + 1;
    return clamp(character, 1, textLength + 1);
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

function clamp(value: number, minimum: number, maximum: number): number {
  if (value < minimum) {
    return minimum;
  }

  if (value > maximum) {
    return maximum;
  }

  return value;
}
