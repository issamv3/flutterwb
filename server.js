const express = require("express");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { spawn } = require("child_process");

const app = express();
const PORT = process.env.PORT || 7860;

const BUILDS_DIR = path.join(__dirname, "builds");
if (!fs.existsSync(BUILDS_DIR)) fs.mkdirSync(BUILDS_DIR, { recursive: true });

const jobs = new Map();

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function appendLog(job, line) {
  job.log += line;
  if (job.log.length > 200000) {
    job.log = job.log.slice(job.log.length - 200000);
  }
}

function runCommand(job, command, args, cwd) {
  return new Promise((resolve, reject) => {
    appendLog(job, `\n$ ${command} ${args.join(" ")}\n`);
    const child = spawn(command, args, { cwd });

    child.stdout.on("data", (data) => appendLog(job, data.toString()));
    child.stderr.on("data", (data) => appendLog(job, data.toString()));

    child.on("error", (err) => reject(err));
    child.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

async function buildApk(job) {
  const jobDir = path.join(BUILDS_DIR, job.id);
  const repoDir = path.join(jobDir, "repo");

  try {
    fs.mkdirSync(jobDir, { recursive: true });

    job.status = "cloning";
    job.stage = "Cloning repository";
    await runCommand(job, "git", ["clone", "--depth", "1", job.repoUrl, repoDir], jobDir);

    job.status = "preparing";
    job.stage = "Creating Flutter platform files";
    await runCommand(job, "flutter", ["create", "."], repoDir);

    job.status = "fetching";
    job.stage = "Fetching dependencies";
    await runCommand(job, "flutter", ["pub", "get"], repoDir);

    job.status = "building";
    job.stage = "Building APK";
    await runCommand(
      job,
      "flutter",
      ["build", "apk", "--release", "--target-platform", "android-arm", "--split-per-abi"],
      repoDir
    );

    const apkDir = path.join(
  repoDir,
  "build",
  "app",
  "outputs",
  "flutter-apk"
);

const expectedApkNames = [
  "app-release.apk",
  "app-release-universal.apk",
  "app-armeabi-v7a-release.apk",
  "app-arm64-v8a-release.apk",
  "app-x86_64-release.apk",
  "app-x86-release.apk",
];

const candidates = expectedApkNames
  .map((name) => path.join(apkDir, name))
  .filter((file) => fs.existsSync(file))
  .map((file) => ({
    file,
    mtimeMs: fs.statSync(file).mtimeMs,
  }));

if (candidates.length === 0) {
  throw new Error("Build finished but APK was not found");
}

candidates.sort((a, b) => b.mtimeMs - a.mtimeMs);

const apkPath = candidates[0].file;

if (!apkPath) {
  throw new Error(
    `Build finished but APK was not found in ${apkDir}. Expected one of: ${expectedApkNames.join(", ")}`
  );
}

    job.apkPath = apkPath;
    job.status = "success";
    job.stage = "Build complete";
  } catch (err) {
    job.status = "failed";
    job.stage = "Build failed";
    job.error = err.message;
    appendLog(job, `\nERROR: ${err.message}\n`);
  }
}

app.post("/api/build", (req, res) => {
  const { repoUrl } = req.body;

  if (!repoUrl || typeof repoUrl !== "string" || !repoUrl.trim()) {
    return res.status(400).json({ error: "A valid Git repository URL is required" });
  }

  const id = crypto.randomUUID();
  const job = {
    id,
    repoUrl: repoUrl.trim(),
    status: "queued",
    stage: "Queued",
    log: "",
    apkPath: null,
    error: null,
    createdAt: Date.now(),
  };

  jobs.set(id, job);
  buildApk(job);

  res.json({ jobId: id });
});

app.get("/api/status/:jobId", (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: "Job not found" });

  res.json({
    id: job.id,
    status: job.status,
    stage: job.stage,
    log: job.log,
    error: job.error,
    ready: job.status === "success",
  });
});

app.get("/api/download/:jobId", (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: "Job not found" });
  if (job.status !== "success" || !job.apkPath) {
    return res.status(400).json({ error: "APK is not ready yet" });
  }

  res.download(job.apkPath, "app-release.apk");
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Flutter APK Builder running on port ${PORT}`);
});
