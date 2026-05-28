import { Component, EventEmitter, Input, Output } from "@angular/core";
import { AppSection } from "../core/types/app-section.type";

type LandingFeature = {
  tag: string;
  title: string;
  description: string;
  route: AppSection;
  actionLabel: string;
};

type WorkflowStep = {
  title: string;
  detail: string;
};

@Component({
  selector: "app-landing-page",
  standalone: true,
  styleUrl: "./landing-page.component.css",
  template: `
    <section class="landing">
      <div class="orb orb-one" aria-hidden="true"></div>
      <div class="orb orb-two" aria-hidden="true"></div>
      <div class="grid-overlay" aria-hidden="true"></div>

      <div class="hero-layout">
        <div class="hero-copy">
          <p class="caption">MOBILE COMMAND DECK</p>
          <h1>CONTROL YOUR CODING RIG FROM ANYWHERE.</h1>
          <p class="lead">
            RemoteLab turns your phone into an AI-assisted cockpit for VS Code so you can continue Copilot sessions,
            drive terminals, and handle workspace ops without touching your desktop.
          </p>

          <div class="hero-actions">
            <button class="button-primary solid" type="button" (click)="openPairing.emit()">PAIR DEVICE</button>
            <button class="button-primary ghost" type="button" (click)="continueCopilot.emit()">CONTINUE COPILOT</button>
            <button class="button-primary ghost" type="button" (click)="createTerminal.emit()">NEW TERMINAL</button>
          </div>

          <div class="status-strip">
            <article class="status-chip">
              <p class="mono">RELAY</p>
              <strong>{{ statusLabel }}</strong>
              <p>{{ peerState }}</p>
            </article>
            <article class="status-chip">
              <p class="mono">WORKSPACE</p>
              <strong>{{ workspaceName }}</strong>
              <p>Live project context on demand.</p>
            </article>
            <article class="status-chip">
              <p class="mono">DIAGNOSTICS</p>
              <strong>{{ diagnosticsTotal }}</strong>
              <p>Issues visible before they become blockers.</p>
            </article>
          </div>
        </div>

        <aside class="hero-panel" aria-label="Live session preview">
          <p class="mono panel-kicker">LIVE SESSION PREVIEW</p>
          <div class="terminal-preview">
            <p><span>$</span> copilot continue</p>
            <p><span>$</span> npm run remotelab:watch-extension</p>
            <p><span>$</span> git status --short</p>
            <p><span>&gt;</span> 3 files changed, 0 untracked</p>
            <p><span>&gt;</span> relay heartbeat stable (36ms)</p>
          </div>
          <button class="panel-link" type="button" (click)="openSection.emit('terminal')">OPEN LIVE TERMINAL</button>
        </aside>
      </div>
    </section>

    <section class="feature-grid" aria-label="RemoteLab capabilities">
      <p class="caption">WHY TEAMS PICK REMOTELAB</p>
      <div class="cards">
        @for (feature of features; track feature.title) {
          <article class="feature-card">
            <p class="mono">{{ feature.tag }}</p>
            <h2>{{ feature.title }}</h2>
            <p>{{ feature.description }}</p>
            <button class="text-link" type="button" (click)="openSection.emit(feature.route)">{{ feature.actionLabel }}</button>
          </article>
        }
      </div>
    </section>

    <section class="workflow" aria-label="How RemoteLab works">
      <p class="caption">FAST ONBOARDING</p>
      <div class="steps">
        @for (step of workflow; track step.title; let index = $index) {
          <article class="step-card">
            <p class="mono">0{{ index + 1 }}</p>
            <h2>{{ step.title }}</h2>
            <p>{{ step.detail }}</p>
          </article>
        }
      </div>
    </section>

    <section class="cta" aria-label="Call to action">
      <div class="cta-layout">
        <div>
          <p class="caption">READY TO PILOT YOUR WORKSPACE?</p>
          <h2>PAIR ONCE. SHIP FROM ANYWHERE.</h2>
        </div>
        <div class="cta-actions">
          <button class="button-primary solid" type="button" (click)="openPairing.emit()">PAIR NOW</button>
          <button class="button-primary ghost" type="button" (click)="openSection.emit('ai')">OPEN AI CONSOLE</button>
        </div>
      </div>
    </section>
  `
})
export class LandingPageComponent {
  @Input() statusLabel = "DISCONNECTED";
  @Input() peerState = "Awaiting relay";
  @Input() workspaceName = "NO WORKSPACE";
  @Input() diagnosticsTotal = 0;

  @Output() openPairing = new EventEmitter<void>();
  @Output() continueCopilot = new EventEmitter<void>();
  @Output() createTerminal = new EventEmitter<void>();
  @Output() openSection = new EventEmitter<AppSection>();

  readonly features: ReadonlyArray<LandingFeature> = [
    {
      tag: "AI OPS",
      title: "Continue Copilot Context",
      description: "Jump back into running Copilot CLI sessions with context intact, then push prompts from your phone.",
      route: "ai",
      actionLabel: "Open AI section"
    },
    {
      tag: "TERMINAL",
      title: "Command-Line Control",
      description: "Spawn terminals, execute commands, sync buffers, and recover output without restarting your desktop workspace.",
      route: "terminal",
      actionLabel: "Open terminal section"
    },
    {
      tag: "WORKSPACE",
      title: "Git + File Visibility",
      description: "Search files, inspect diagnostics, run tasks, and open editors remotely while preserving desktop focus.",
      route: "workspace",
      actionLabel: "Open workspace section"
    }
  ];

  readonly workflow: ReadonlyArray<WorkflowStep> = [
    {
      title: "Pair your relay",
      detail: "Use one secure code to link your phone with the VS Code extension and establish an encrypted session."
    },
    {
      title: "Pick your control lane",
      detail: "Move between AI, terminal, workspace, and trackpad flows depending on what the moment demands."
    },
    {
      title: "Ship without desk friction",
      detail: "Keep momentum during commutes, meetings, or outages while your workstation remains the execution engine."
    }
  ];
}