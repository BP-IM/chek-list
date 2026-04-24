const tabButtons = document.querySelectorAll(".tab-btn");
const content = document.getElementById("content");

const managerMorningInput = document.getElementById("managerMorning");
const managerEveningInput = document.getElementById("managerEvening");
const managerNightInput = document.getElementById("managerNight");
const shiftDateInput = document.getElementById("shiftDate");

const STORAGE_KEY = "checklist_index_state";

let pageState = {
  managerMorning: "Майра",
  managerEvening: "Маржан",
  managerNight: "Диана",
  shiftDate: "",
  currentSection: "prep"
};

// ==========================
// 💾 SAVE STATE
// ==========================
function saveState() {
  pageState.managerMorning = managerMorningInput.value;
  pageState.managerEvening = managerEveningInput.value;
  pageState.managerNight = managerNightInput.value;
  pageState.shiftDate = shiftDateInput.value;

  localStorage.setItem(STORAGE_KEY, JSON.stringify(pageState));

  syncAllToSupabase(); // 🔥 авто sync
}

// ==========================
// 📥 LOAD STATE
// ==========================
function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);

  if (saved) {
    pageState = JSON.parse(saved);
  }

  managerMorningInput.value = pageState.managerMorning || "Майра";
  managerEveningInput.value = pageState.managerEvening || "Маржан";
  managerNightInput.value = pageState.managerNight || "Диана";
  shiftDateInput.value = pageState.shiftDate || "";
}

// ==========================
// 🧹 CLEAN OLD SCRIPTS
// ==========================
function clearSectionAssets() {
  document.querySelectorAll("[data-dynamic-section-css]").forEach((el) => el.remove());
  document.querySelectorAll("[data-dynamic-section-js]").forEach((el) => el.remove());
}

// ==========================
// 🎨 CSS LOAD
// ==========================
function loadSectionCSS(sectionName) {
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = `sections/css/${sectionName}.css`;
  link.setAttribute("data-dynamic-section-css", sectionName);
  document.head.appendChild(link);
}

// ==========================
// 📜 JS LOAD
// ==========================
function loadSectionJS(sectionName) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `sections/js/${sectionName}.js`;
    script.setAttribute("data-dynamic-section-js", sectionName);

    script.onload = () => {
      if (sectionName === "prep" && typeof initPrepSection === "function") initPrepSection();
      if (sectionName === "hourly" && typeof initHourlySection === "function") initHourlySection();
      if (sectionName === "goals" && typeof initGoalsSection === "function") initGoalsSection();
      if (sectionName === "during" && typeof initDuringSection === "function") initDuringSection();
      if (sectionName === "results" && typeof initResultsSection === "function") initResultsSection();

      resolve();
    };

    script.onerror = () => reject(new Error(`Ошибка загрузки JS: ${sectionName}`));

    document.body.appendChild(script);
  });
}

// ==========================
// 🔘 ACTIVE TAB
// ==========================
function setActiveButton(sectionName) {
  tabButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.section === sectionName);
  });
}

// ==========================
// 📄 LOAD SECTION
// ==========================
async function loadSection(sectionName) {
  content.innerHTML = '<div class="loading">Загрузка...</div>';

  try {
    const response = await fetch(`sections/${sectionName}.html`);
    const html = await response.text();

    clearSectionAssets();
    content.innerHTML = html;

    loadSectionCSS(sectionName);
    await loadSectionJS(sectionName);

    pageState.currentSection = sectionName;
    setActiveButton(sectionName);
    saveState();
  } catch (error) {
    console.error(error);
    content.innerHTML = `<h2>Ошибка загрузки ${sectionName}</h2>`;
  }
}

// ==========================
// 🔘 TAB EVENTS
// ==========================
tabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    loadSection(button.dataset.section);
  });
});

// ==========================
// INPUT EVENTS
// ==========================
managerMorningInput.addEventListener("input", saveState);
managerEveningInput.addEventListener("input", saveState);
managerNightInput.addEventListener("input", saveState);
shiftDateInput.addEventListener("input", async () => {
  saveState();
  await restoreAllFromSupabase(); // 🔥 дата өзгерсе — қайта жүктеу
  loadSection(pageState.currentSection);
});

// ==========================
// INIT
// ==========================
loadState();
restoreAllFromSupabase();
loadSection(pageState.currentSection || "prep");

// ==========================
// 🔥 SUPABASE SYNC
// ==========================
async function syncAllToSupabase() {
  const shiftDate = shiftDateInput.value;
  if (!shiftDate || !window.supabaseClient) return;

  const map = {
    hourly: `hourly_fact_${shiftDate}`,
    hourly_totals: `hourly_shift_totals_${shiftDate}`,
    goals: `goals_manual_${shiftDate}`,
    goals_snapshot: `goals_snapshot_${shiftDate}`,
    during: `during_state_${shiftDate}`,
    results: `results_state_${shiftDate}`,
    index: STORAGE_KEY
  };

  for (const [section, key] of Object.entries(map)) {
    const raw = localStorage.getItem(key);
    if (!raw) continue;

    let data;
    try { data = JSON.parse(raw); } catch { data = raw; }

    await window.supabaseClient.from("checklist_daily").upsert({
      shift_date: shiftDate,
      section,
      data
    }, { onConflict: "shift_date,section" });
  }
}

// ==========================
// 📥 RESTORE
// ==========================
async function restoreAllFromSupabase() {
  const shiftDate = shiftDateInput.value;
  if (!shiftDate || !window.supabaseClient) return;

  const { data } = await window.supabaseClient
    .from("checklist_daily")
    .select("*")
    .eq("shift_date", shiftDate);

  if (!data) return;

  const map = {
    hourly: `hourly_fact_${shiftDate}`,
    hourly_totals: `hourly_shift_totals_${shiftDate}`,
    goals: `goals_manual_${shiftDate}`,
    goals_snapshot: `goals_snapshot_${shiftDate}`,
    during: `during_state_${shiftDate}`,
    results: `results_state_${shiftDate}`,
    index: STORAGE_KEY
  };

  data.forEach((row) => {
    const key = map[row.section];
    if (key) {
      localStorage.setItem(key, JSON.stringify(row.data));
    }
  });
}


