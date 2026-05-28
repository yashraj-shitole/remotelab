import { Component, EventEmitter, Input, Output } from "@angular/core";
import { AppSection } from "../core/types/app-section.type";

@Component({
  selector: "app-bottom-pill-nav",
  standalone: true,
  styleUrl: "./bottom-pill-nav.component.css",
  template: `
    <nav class="bottom-pill-nav" aria-label="RemoteLab sections">
      @for (item of items; track item.section) {
        <button
          class="pill-item"
          type="button"
          [class.active]="section === item.section"
          [attr.aria-current]="section === item.section ? 'page' : null"
          (click)="sectionChange.emit(item.section)">
          <span>{{ item.label }}</span>
          <small>{{ item.hint }}</small>
        </button>
      }
    </nav>
  `
})
export class BottomPillNavComponent {
  @Input() section: AppSection = "ai";
  @Output() sectionChange = new EventEmitter<AppSection>();

  readonly items: ReadonlyArray<{ section: AppSection; label: string; hint: string }> = [
    { section: "ai", label: "AI", hint: "Copilot" },
    { section: "terminal", label: "TERMINAL", hint: "Live shell" },
    { section: "workspace", label: "WORKSPACE", hint: "Files + tasks" }
  ];
}
