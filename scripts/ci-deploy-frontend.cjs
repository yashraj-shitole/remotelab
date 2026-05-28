#!/usr/bin/env node

const { spawn } = require("node:child_process");
const path = require("node:path");

function normalizeEnvForWindows(baseEnv) {
  if (process.platform !== "win32") {
    return { ...baseEnv };
  }

  const env = { ...baseEnv };
  const systemRoot = env.SystemRoot || env.SYSTEMROOT || "C:\\Windows";
  const system32 = path.join(systemRoot, "System32");

  const pathValue = env.Path || env.PATH || "";
  const parts = pathValue.split(";").filter(Boolean);
  if (!parts.some((entry) => entry.toLowerCase() === system32.toLowerCase())) {
    parts.unshift(system32);
  }

  const normalizedPath = parts.join(";");
  const cmdPath = path.join(system32, "cmd.exe");

  // Some tools read Path, others read PATH, and cross-spawn may read comspec.
  env.Path = normalizedPath;
  env.PATH = normalizedPath;
  env.ComSpec = cmdPath;
  env.COMSPEC = cmdPath;
  env.comspec = cmdPath;

  return env;
}

function run(command, args, env, options = {}) {
  const { captureOutput = false } = options;

  return new Promise((resolve, reject) => {
    const spawnOptions = {
      env,
      shell: false,
      stdio: captureOutput ? ["inherit", "pipe", "pipe"] : "inherit",
    };

    const child = spawn(command, args, spawnOptions);
    let output = "";

    if (captureOutput) {
      child.stdout.on("data", (chunk) => {
        const text = String(chunk);
        output += text;
        process.stdout.write(chunk);
      });
      child.stderr.on("data", (chunk) => {
        const text = String(chunk);
        output += text;
        process.stderr.write(chunk);
      });
    }

    child.on("error", (error) => {
      reject({ error, output, command, args });
    });

    child.on("close", (code) => {
      if (code === 0) {
        resolve({ output });
      } else {
        reject({ code, output, command, args });
      }
    });
  });
}

function commandLabel(command, args) {
  return [command, ...args].join(" ");
}

function formatCommandError(result) {
  const label = commandLabel(result.command, result.args || []);

  if (result.error) {
    return `${label} failed: ${result.error.message}`;
  }

  return `${label} exited with code ${result.code}`;
}

function getErrorMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }

  if (error && typeof error === "object") {
    if (error.command) {
      return formatCommandError(error);
    }

    if (error.error instanceof Error) {
      return error.error.message;
    }

    if (typeof error.message === "string" && error.message) {
      return error.message;
    }
  }

  return String(error);
}

function runVercel(args, env, options = {}) {
  if (process.platform !== "win32") {
    return run("npx", ["vercel", ...args], env, options);
  }

  const cmd = env.comspec || env.ComSpec || env.COMSPEC || "cmd.exe";
  const command = ["npx", "vercel", ...args].join(" ");
  return run(cmd, ["/d", "/s", "/c", command], env, options);
}

async function main() {
  const env = normalizeEnvForWindows(process.env);

  await runVercel(["pull", "--yes", "--environment=production"], env);

  let buildFailed;

  try {
    await runVercel(["build", "--prod"], env, { captureOutput: true });
  } catch (errorResult) {
    buildFailed = errorResult;
  }

  if (!buildFailed) {
    await runVercel(["deploy", "--prebuilt", "--prod"], env);
    return;
  }

  const buildFailureText = [buildFailed.output || "", buildFailed.error?.message || ""].join("\n");

  const isWindowsCmdResolutionIssue =
    process.platform === "win32" &&
    /spawn cmd\.exe ENOENT/i.test(buildFailureText);

  if (isWindowsCmdResolutionIssue) {
    console.warn(
      "Local prebuild failed due to Windows cmd.exe resolution in Vercel CLI; retrying with remote Vercel build."
    );
    await runVercel(["deploy", "--prod"], env);
    return;
  }

  throw new Error(formatCommandError(buildFailed));
}

main().catch((error) => {
  console.error(getErrorMessage(error));
  process.exit(1);
});
