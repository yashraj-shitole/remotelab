const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");

const appUrl = process.env.REMOTELAB_SMOKE_URL ?? "http://127.0.0.1:4200/";
const relayUrl = process.env.REMOTELAB_SMOKE_RELAY_URL ?? "ws://127.0.0.1:8787/relay";
const screenshotPath = process.env.REMOTELAB_SMOKE_SCREENSHOT ?? ".logs/remotelab-smoke.png";

async function main() {
  fs.mkdirSync(path.dirname(screenshotPath), { recursive: true });

  const browser = await chromium.launch({
    executablePath: findBrowser(),
    headless: true
  });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
  const issues = [];

  page.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      issues.push(`${message.type()}: ${message.text()}`);
    }
  });
  page.on("pageerror", (error) => issues.push(`pageerror: ${error.message}`));

  await page.goto(appUrl, { waitUntil: "networkidle", timeout: 30000 });
  await page.locator('input[name="relayUrl"]').fill(relayUrl);
  await page.locator('input[name="pairingCode"]').fill("SMOKE");
  await page.locator('button[type="submit"]').click();
  await page.getByRole("heading", { name: "CONNECTED" }).waitFor({ state: "visible", timeout: 10000 });

  await page.getByRole("button", { name: "TERMINALS" }).click();
  await page.getByRole("heading", { name: "LIVE CONTROL" }).waitFor({ state: "visible", timeout: 5000 });

  await page.getByRole("button", { name: "WORKSPACE" }).click();
  await page.getByRole("heading", { name: "EDITOR COMMAND" }).waitFor({ state: "visible", timeout: 5000 });

  await page.screenshot({ path: screenshotPath, fullPage: true });
  const result = {
    title: await page.title(),
    wordmarkVisible: await page.getByText("REMOTELAB").isVisible(),
    heroVisible: await page.getByText("AI CODING FROM ANYWHERE").isVisible(),
    connectedVisible: await page.getByRole("heading", { name: "CONNECTED" }).isVisible(),
    workspacePanelVisible: await page.getByRole("heading", { name: "EDITOR COMMAND" }).isVisible(),
    issues,
    screenshotPath
  };

  await browser.close();

  if (issues.length > 0) {
    console.error(JSON.stringify(result, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify(result, null, 2));
}

function findBrowser() {
  const explicit = process.env.REMOTELAB_BROWSER_PATH;
  if (explicit) {
    return explicit;
  }

  const candidates = [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
  ];

  return candidates.find((candidate) => fs.existsSync(candidate));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
