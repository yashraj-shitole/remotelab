import { Component, EventEmitter, Input, Output } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { DiagnosticSnapshot, FileContentSnapshot, FileMatch, GitStatusSnapshot, TaskSummary } from "@remotelab/shared";

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
            <button class="row row-button" type="button" (click)="openFile.emit(item.file)">
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
          <p class="caption">FILES</p>
          <div class="command-form">
            <input [ngModel]="filePattern" (ngModelChange)="filePatternChange.emit($event)" name="filePattern">
            <button class="button-primary" type="button" (click)="findFiles.emit()">FIND</button>
          </div>
          @for (file of files; track file.path) {
            <button class="row row-button" type="button" [class.active]="selectedFile?.path === file.path" (click)="viewFile.emit(file.path)">
              {{ file.relativePath }}
            </button>
          }

          <div class="file-preview">
            <div class="file-preview-header">
              <p class="caption">FILE CONTENT</p>
              @if (selectedFile) {
                <button class="text-link" type="button" (click)="openFile.emit(selectedFile.path)">OPEN IN EDITOR</button>
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
              <pre class="file-content">{{ selectedFile.content }}</pre>
            }
          </div>
        </div>
      </div>
    </section>
  `
})
export class WorkspaceSectionComponent {
  @Input() git: GitStatusSnapshot | undefined;
  @Input() diagnostics: DiagnosticSnapshot | undefined;
  @Input() tasks: TaskSummary[] = [];
  @Input() files: FileMatch[] = [];
  @Input() filePattern = "**/*.{ts,tsx,js,json,md,scss,html}";
  @Input() selectedFile: FileContentSnapshot | undefined;
  @Input() filePreviewLoading = false;

  @Output() executeCommand = new EventEmitter<string>();
  @Output() refreshGit = new EventEmitter<void>();
  @Output() refreshDiagnostics = new EventEmitter<void>();
  @Output() loadTasks = new EventEmitter<void>();
  @Output() runTask = new EventEmitter<string>();
  @Output() filePatternChange = new EventEmitter<string>();
  @Output() findFiles = new EventEmitter<void>();
  @Output() viewFile = new EventEmitter<string>();
  @Output() openFile = new EventEmitter<string>();
}
