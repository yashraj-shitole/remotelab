import { Component, Input } from "@angular/core";

@Component({
  selector: "app-activity-feed",
  standalone: true,
  styleUrl: "./activity-feed.component.css",
  template: `
    <section class="activity">
      <p class="caption">ACTIVITY</p>
      @for (item of activity; track item) {
        <p class="row">{{ item }}</p>
      }
    </section>
  `
})
export class ActivityFeedComponent {
  @Input() activity: string[] = [];
}
