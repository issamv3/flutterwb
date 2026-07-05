const repoInput = document.getElementById("repoUrl");
const buildBtn = document.getElementById("buildBtn");
const statusText = document.getElementById("statusText");
const progressFill = document.getElementById("progressFill");
const downloadArea = document.getElementById("downloadArea");
const logOutput = document.getElementById("logOutput");
const stepsGrid = document.getElementById("stepsGrid");

const STEP_ORDER = ["cloning", "preparing", "fetching", "building"];
const PROGRESS_MAP = {
  queued: 5,
  cloning: 20,
  preparing: 40,
  fetching: 60,
  building: 85,
  success: 100,
  failed: 100,
};

let pollTimer = null;

function setSteps(status) {
  const currentIndex = STEP_ORDER.indexOf(status);
  document.querySelectorAll(".step-box").forEach((box) => {
    const step = box.getAttribute("data-step");
    const stepIndex = STEP_ORDER.indexOf(step);
    box.classList.remove("active", "done");
    if (status === "success" || (currentIndex > -1 && stepIndex < currentIndex)) {
      box.classList.add("done");
    } else if (stepIndex === currentIndex) {
      box.classList.add("active");
    }
  });
}

function resetUI() {
  downloadArea.innerHTML = "";
  logOutput.textContent = "Waiting for a build to start...";
  progressFill.style.width = "0%";
  statusText.textContent = "Idle";
  document.querySelectorAll(".step-box").forEach((box) => box.classList.remove("active", "done"));
}

async function startBuild() {
  const repoUrl = repoInput.value.trim();
  if (!repoUrl) {
    alert("Please enter a Git repository URL");
    return;
  }

  buildBtn.disabled = true;
  resetUI();
  statusText.textContent = "Starting...";

  try {
    const res = await fetch("/api/build", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repoUrl }),
    });

    const data = await res.json();

    if (!res.ok) {
      statusText.textContent = "Error";
      downloadArea.innerHTML = `<p class="error-text">${data.error}</p>`;
      buildBtn.disabled = false;
      return;
    }

    pollStatus(data.jobId);
  } catch (err) {
    statusText.textContent = "Error";
    downloadArea.innerHTML = `<p class="error-text">${err.message}</p>`;
    buildBtn.disabled = false;
  }
}

function pollStatus(jobId) {
  if (pollTimer) clearInterval(pollTimer);

  pollTimer = setInterval(async () => {
    try {
      const res = await fetch(`/api/status/${jobId}`);
      const data = await res.json();

      statusText.textContent = data.stage || data.status;
      progressFill.style.width = `${PROGRESS_MAP[data.status] || 0}%`;
      logOutput.textContent = data.log || "";
      logOutput.scrollTop = logOutput.scrollHeight;
      setSteps(data.status);

      if (data.status === "success") {
        clearInterval(pollTimer);
        buildBtn.disabled = false;
        downloadArea.innerHTML = `<a class="download-btn" href="/api/download/${jobId}">Download APK</a>`;
      }

      if (data.status === "failed") {
        clearInterval(pollTimer);
        buildBtn.disabled = false;
        downloadArea.innerHTML = `<p class="error-text">${data.error || "Build failed"}</p>`;
      }
    } catch (err) {
      clearInterval(pollTimer);
      buildBtn.disabled = false;
      statusText.textContent = "Error";
      downloadArea.innerHTML = `<p class="error-text">${err.message}</p>`;
    }
  }, 1500);
}

buildBtn.addEventListener("click", startBuild);
