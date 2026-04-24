function initResultsSection() {
  const container = document.getElementById("resultsContainer");
  if (!container) return;

  if (container.dataset.initialized === "true") return;
  container.dataset.initialized = "true";

  const SECTION_NAME = "results";
  const storageKey = `results_state_${getCurrentShiftDate()}`;
  let saveTimer = null;

  loadResults();

  async function loadResults() {
    let data = {
      afterShift: [
        "Обсудить выполнение целей и приоритетов с командой\\BrainStorm*",
        "Передать смену (утренний инсайд - вечернему, вечерний инсайд - ночному менеджеру)",
        "Заполнить отчет по неточно собранным заказам на Delivery",
        "Проверить расписание на следующую смену и день",
        "Собрать, проверить, подписать бланки",
        "Проверить заполнение ЕКЛБП"
      ],
      redItems: [
        "Заполнить отчет по неточно собранным заказам на Delivery",
        "Проверить заполнение ЕКЛБП"
      ]
    };

    try {
      const res = await fetch("sections/data/results.json");
      const text = await res.text();
      if (text.trim()) data = JSON.parse(text);
    } catch {}

    container.innerHTML = `
      <div class="results-wrap">
        <div class="results-small-title">ПОСЛЕ СМЕНЫ</div>

        <div class="select-all-row">
          <label><input type="checkbox" id="selectAllMorningResults"> Утро</label>
          <label><input type="checkbox" id="selectAllEveningResults"> Вечер</label>
        </div>

        <div class="results-checklist">
          ${data.afterShift.map(t => renderChecklistRow(t, data.redItems)).join("")}
        </div>

        <div class="results-main-title">ИТОГИ ДНЯ</div>

        ${renderPriority(1)}
        ${renderPriority(2)}
        ${renderPriority(3)}
      </div>
    `;

    await restoreFromSupabase();
    restoreState();
    attachLogic();
    updateSelectAllState();
  }

  function renderChecklistRow(text, redItems) {
    const isRed = redItems.includes(text);

    return `
      <div class="results-row" data-id="${makeId(text)}">
        <label><input class="morning-check" type="checkbox"> Да</label>
        <label><input class="evening-check" type="checkbox"> Да</label>
        <div class="${isRed ? "red-text" : ""}">${text}</div>
      </div>
    `;
  }

  function renderPriority(num) {
    return `
      <div>
        <div>Приоритет ${num}</div>
        <textarea data-priority="${num}"></textarea>
      </div>
    `;
  }

  function attachLogic() {
    container.querySelectorAll("input, textarea").forEach(el => {
      el.addEventListener("change", saveState);
      el.addEventListener("input", saveState);
    });

    container.querySelector("#selectAllMorningResults")?.addEventListener("change", e => {
      container.querySelectorAll(".morning-check").forEach(cb => cb.checked = e.target.checked);
      saveState();
    });

    container.querySelector("#selectAllEveningResults")?.addEventListener("change", e => {
      container.querySelectorAll(".evening-check").forEach(cb => cb.checked = e.target.checked);
      saveState();
    });
  }

  function saveState() {
    const state = {
      rows: {},
      priorities: {}
    };

    container.querySelectorAll(".results-row").forEach(row => {
      const id = row.dataset.id;
      state.rows[id] = {
        morning: row.querySelector(".morning-check").checked,
        evening: row.querySelector(".evening-check").checked
      };
    });

    container.querySelectorAll("textarea").forEach(t => {
      state.priorities[t.dataset.priority] = t.value;
    });

    localStorage.setItem(storageKey, JSON.stringify(state));

    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveToSupabase, 400);
  }

  function restoreState() {
    const saved = localStorage.getItem(storageKey);
    if (!saved) return;

    const state = JSON.parse(saved);

    container.querySelectorAll(".results-row").forEach(row => {
      const id = row.dataset.id;
      const r = state.rows[id];
      if (!r) return;

      row.querySelector(".morning-check").checked = r.morning;
      row.querySelector(".evening-check").checked = r.evening;
    });

    container.querySelectorAll("textarea").forEach(t => {
      t.value = state.priorities[t.dataset.priority] || "";
    });
  }

  async function saveToSupabase() {
    if (!window.supabaseClient) return;

    const data = JSON.parse(localStorage.getItem(storageKey) || "{}");

    await window.supabaseClient.from("checklist_daily").upsert({
      shift_date: getCurrentShiftDate(),
      section: SECTION_NAME,
      data
    }, { onConflict: "shift_date,section" });
  }

  async function restoreFromSupabase() {
    if (!window.supabaseClient) return;

    const { data } = await window.supabaseClient
      .from("checklist_daily")
      .select("data")
      .eq("shift_date", getCurrentShiftDate())
      .eq("section", SECTION_NAME)
      .maybeSingle();

    if (data?.data) {
      localStorage.setItem(storageKey, JSON.stringify(data.data));
    }
  }

  function updateSelectAllState() {
    const morning = [...container.querySelectorAll(".morning-check")];
    const evening = [...container.querySelectorAll(".evening-check")];

    const mAll = container.querySelector("#selectAllMorningResults");
    const eAll = container.querySelector("#selectAllEveningResults");

    if (mAll) mAll.checked = morning.every(cb => cb.checked);
    if (eAll) eAll.checked = evening.every(cb => cb.checked);
  }

  function makeId(text) {
    return text.toLowerCase().replaceAll(" ", "_").replace(/[^\wа-яё]/gi, "").slice(0, 80);
  }

  function getCurrentShiftDate() {
    return document.getElementById("shiftDate")?.value || new Date().toISOString().split("T")[0];
  }
}