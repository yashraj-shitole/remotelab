import { Component, EventEmitter, Input, Output } from "@angular/core";
import { TrackpadClickRequest, TrackpadMoveRequest, TrackpadScrollRequest } from "@remotelab/shared";

@Component({
  selector: "app-trackpad-section",
  standalone: true,
  styleUrl: "./trackpad-section.component.css",
  template: `
    <section class="panel">
      <p class="caption">TRACKPAD</p>
      <h2>POINTER DRIVE</h2>
      <p class="intro">Swipe to steer the VS Code editor cursor, tap for left click, use secondary click for context menu, and drag the side rail to scroll.</p>

      <div class="status-row">
        <p class="mono">LINK / {{ connected ? 'CONNECTED' : 'DISCONNECTED' }}</p>
        <p class="mono">INPUT / TOUCH CONTROL</p>
      </div>

      <div class="trackpad-deck">
        <div
          class="trackpad-surface"
          role="application"
          aria-label="Trackpad movement surface"
          (touchstart)="handleTrackpadStart($event)"
          (touchmove)="handleTrackpadMove($event)"
          (touchend)="handleTrackpadEnd($event)"
          (touchcancel)="handleTrackpadEnd($event)">
          <div class="trackpad-grid"></div>
          <div class="pointer-preview" [style.left.%]="pointerX" [style.top.%]="pointerY"></div>
          <p class="surface-label">MOVE</p>
          <small>TAP = LEFT CLICK</small>
        </div>

        <div
          class="scroll-strip"
          role="application"
          aria-label="Trackpad scroll strip"
          (touchstart)="handleScrollStart($event)"
          (touchmove)="handleScrollMove($event)"
          (touchend)="handleScrollEnd($event)"
          (touchcancel)="handleScrollEnd($event)">
          <div class="scroll-track"></div>
          <div class="scroll-thumb" [style.top.%]="scrollThumbY"></div>
          <p>SCROLL</p>
        </div>
      </div>

      <div class="button-row compact">
        <button class="button-primary" type="button" [disabled]="!connected" (click)="leftClick.emit('left')">LEFT CLICK</button>
        <button class="button-primary" type="button" [disabled]="!connected" (click)="rightClick.emit('right')">RIGHT CLICK</button>
      </div>
    </section>
  `
})
export class TrackpadSectionComponent {
  @Input() connected = false;

  @Output() move = new EventEmitter<TrackpadMoveRequest>();
  @Output() scroll = new EventEmitter<TrackpadScrollRequest>();
  @Output() leftClick = new EventEmitter<TrackpadClickRequest["button"]>();
  @Output() rightClick = new EventEmitter<TrackpadClickRequest["button"]>();

  pointerX = 50;
  pointerY = 50;
  scrollThumbY = 50;

  private trackpadTouchId: number | undefined;
  private trackpadBounds: DOMRect | undefined;
  private trackpadLastX = 0;
  private trackpadLastY = 0;
  private tapDistance = 0;
  private tapStartedAt = 0;

  private scrollTouchId: number | undefined;
  private scrollLastY = 0;
  private scrollBounds: DOMRect | undefined;

  handleTrackpadStart(event: TouchEvent): void {
    const touch = event.changedTouches.item(0);
    if (!touch) {
      return;
    }

    this.trackpadTouchId = touch.identifier;
    this.trackpadLastX = touch.clientX;
    this.trackpadLastY = touch.clientY;
    this.trackpadBounds = this.boundsFromEvent(event);
    this.tapDistance = 0;
    this.tapStartedAt = Date.now();

    this.nudgePointer(0, 0);
    event.preventDefault();
  }

  handleTrackpadMove(event: TouchEvent): void {
    if (this.trackpadTouchId === undefined || !this.trackpadBounds) {
      return;
    }

    const touch = findTouch(event.touches, this.trackpadTouchId);
    if (!touch) {
      return;
    }

    const deltaX = touch.clientX - this.trackpadLastX;
    const deltaY = touch.clientY - this.trackpadLastY;

    this.trackpadLastX = touch.clientX;
    this.trackpadLastY = touch.clientY;
    this.tapDistance += Math.abs(deltaX) + Math.abs(deltaY);

    if (deltaX !== 0 || deltaY !== 0) {
      this.nudgePointer(deltaX, deltaY);
      this.move.emit({ deltaX, deltaY });
    }

    event.preventDefault();
  }

  handleTrackpadEnd(event: TouchEvent): void {
    if (this.trackpadTouchId === undefined) {
      return;
    }

    const finishedTouch = findTouch(event.changedTouches, this.trackpadTouchId);
    if (!finishedTouch) {
      return;
    }

    const elapsed = Date.now() - this.tapStartedAt;
    if (elapsed < 240 && this.tapDistance < 12) {
      this.leftClick.emit("left");
    }

    this.trackpadTouchId = undefined;
    this.trackpadBounds = undefined;
    event.preventDefault();
  }

  handleScrollStart(event: TouchEvent): void {
    const touch = event.changedTouches.item(0);
    if (!touch) {
      return;
    }

    this.scrollTouchId = touch.identifier;
    this.scrollLastY = touch.clientY;
    this.scrollBounds = this.boundsFromEvent(event);
    event.preventDefault();
  }

  handleScrollMove(event: TouchEvent): void {
    if (this.scrollTouchId === undefined || !this.scrollBounds) {
      return;
    }

    const touch = findTouch(event.touches, this.scrollTouchId);
    if (!touch) {
      return;
    }

    const deltaY = touch.clientY - this.scrollLastY;
    this.scrollLastY = touch.clientY;

    if (deltaY !== 0) {
      const trackDelta = (deltaY / Math.max(this.scrollBounds.height, 1)) * 100;
      this.scrollThumbY = clamp(this.scrollThumbY + trackDelta, 5, 95);
      this.scroll.emit({ deltaY });
    }

    event.preventDefault();
  }

  handleScrollEnd(event: TouchEvent): void {
    if (this.scrollTouchId === undefined) {
      return;
    }

    const finishedTouch = findTouch(event.changedTouches, this.scrollTouchId);
    if (!finishedTouch) {
      return;
    }

    this.scrollTouchId = undefined;
    this.scrollBounds = undefined;
    this.scrollThumbY = 50;
    event.preventDefault();
  }

  private nudgePointer(deltaX: number, deltaY: number): void {
    if (!this.trackpadBounds) {
      return;
    }

    const xStep = (deltaX / Math.max(this.trackpadBounds.width, 1)) * 100;
    const yStep = (deltaY / Math.max(this.trackpadBounds.height, 1)) * 100;
    this.pointerX = clamp(this.pointerX + xStep, 4, 96);
    this.pointerY = clamp(this.pointerY + yStep, 6, 94);
  }

  private boundsFromEvent(event: TouchEvent): DOMRect | undefined {
    const element = event.currentTarget;
    return element instanceof HTMLElement ? element.getBoundingClientRect() : undefined;
  }
}

function findTouch(list: TouchList, identifier: number): Touch | undefined {
  for (let index = 0; index < list.length; index += 1) {
    const candidate = list.item(index);
    if (candidate?.identifier === identifier) {
      return candidate;
    }
  }

  return undefined;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
