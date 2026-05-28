import { Routes } from "@angular/router";

export const APP_ROUTES: Routes = [
  { path: "", pathMatch: "full", redirectTo: "home" },
  { path: "home", children: [] },
  { path: "ai", children: [] },
  { path: "terminal", children: [] },
  { path: "workspace", children: [] },
  { path: "trackpad", children: [] },
  { path: "**", redirectTo: "home" }
];
