import { spawn } from "node:child_process";

const chromeAppName = process.env.CHROME_APP_NAME || "Google Chrome";
const defaultPath = process.env.DEV_OPEN_PATH || "/workspace";

let opened = false;

const next = spawn("next", ["dev"], {
  env: process.env,
  shell: process.platform === "win32",
  stdio: ["inherit", "pipe", "pipe"],
});

const openInChrome = (baseUrl) => {
  if (opened) {
    return;
  }

  opened = true;
  const url = new URL(defaultPath, baseUrl).toString();

  const opener =
    process.platform === "darwin"
      ? spawn("open", ["-a", chromeAppName, url], { stdio: "ignore" })
      : process.platform === "win32"
        ? spawn("cmd", ["/c", "start", "chrome", url], { stdio: "ignore", shell: true })
        : spawn("google-chrome", [url], { stdio: "ignore" });

  opener.on("error", () => {
    console.warn(`Could not open Chrome automatically. Open ${url} manually.`);
  });

  opener.unref();
};

const watchForLocalUrl = (chunk) => {
  const output = chunk.toString();
  process.stdout.write(output);

  const match = output.match(/https?:\/\/localhost:\d+/);
  if (match) {
    openInChrome(match[0]);
  }
};

next.stdout.on("data", watchForLocalUrl);
next.stderr.on("data", (chunk) => process.stderr.write(chunk));

next.on("error", (error) => {
  console.error(error);
  process.exit(1);
});

next.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }

  process.exit(code ?? 0);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    next.kill(signal);
  });
}
