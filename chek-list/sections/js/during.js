function initDuringSection() {
  const container = document.getElementById("duringContainer");
  if (!container) return;

  if (container.dataset.initialized === "true") return;
  container.dataset.initialized = "true";

  const SECTION_NAME = "during";
  const storageKey = `during_state_${getCurrentShiftDate()}`;
  let saveTimer = null;

  loadDuring();

  async function loadDuring() {
    let data = {
      sections: [
        {
          title: "ЛЮДИ",
          items: [
            "Обеспечить внешний вид сотрудников в соответствии со стандартами I’M",
            "Контролировать в течение смены баланс сотрудников по участкам и их расстановку",
            "Поддерживать мотивацию сотрудников на смене",
            "Контролировать своевременный выход и уход со смены персонала",
            "Запланировать перерывы сотрудников",
            "Обеспечить чистоту помещения «Комната для курьеров»"
          ]
        },
        {
          title: "ПРОДУКТЫ",
          items: [
            "Контролировать качество продуктов на каждом этапе",
            "Обеспечить правильную ротацию",
            "Анализировать списание",
            "Контролировать чек-лист по безопасности пищи"
          ]
        },
        {
          title: "ОБОРУДОВАНИЕ",
          items: [
            "Контролировать исправность оборудования",
            "Поддерживать чистоту оборудования",
            "Проконтролировать выполнение процедур ПТО"
          ]
        },
        {
          title: "УПРАВЛЕНИЕ СМЕНОЙ",
          items: [
            "Ежечасно оценивать результаты",
            "Демонстрировать модель поведения",
            "Своевременно открывать точки инициативы",
            "Анализировать результаты смены"
          ]
        }
      ]
    };

    try {
      const res = await fetch("sections/data/during.json");
      const text = await res.text();

      if (text.trim()) {
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed.sections)) {
          data = parsed;
        }
      }
    } catch (error) {
      console.warn("during.json оқылмады:", error);
    }

    container.innerHTML = `
      <div class="during-title">В ТЕЧЕНИЕ СМЕНЫ</div>

      <div class="select-all-row">
        <label class="select-all-box">
          <input type="checkbox" id="selectAllMorning">
          Выбрать всех (утро)
        </label>

        <label class="select-all-box">
          <input type="checkbox" id="selectAllEvening">
          Выбрать всех (вечер)
        </label>
      </div>

      ${data.sections.map(renderSection).join("")}

      <div class="todo-block">
        <div class="todo-title">List TO DO</div>
        <textarea class="todo-area" id="duringTodo"></textarea>
      </div>
    `;

    await restoreFromSupabase();
    restoreState();
    attachCheckboxLogic();
  }

  function renderSection(section) {
    return `
      <div class="during-section">
        <div class="section-title">${section.title}</div>
        ${section.items.map(renderItem).join("")}
      </div>
    `;
  }

  function renderItem(text) {
    const id = makeId(text);

    return `
      <div class="during-row" data-id="${id}">
        <label>
          <input class="morning-check" type="checkbox">
          Да
        </label>

        <label>
          <input class="evening-check" type="checkbox">
          Да
        </label>

        <div class="row-text">${text}</div>
      </div>
    `;
  }

  function attachCheckboxLogic() {
    container.querySelectorAll("input").forEach((checkbox) => {
      checkbox.addEventListener("change", saveState);
    });

    const selectAllMorning = container.querySelector("#selectAllMorning");
    const selectAllEvening = container.querySelector("#selectAllEvening");

    selectAllMorning?.addEventListener("change", () => {
      container.querySelectorAll(".morning-check").forEach(cb => cb.checked = selectAllMorning.checked);
      saveState();
    });

    selectAllEvening?.addEventListener("change", () => {
      container.querySelectorAll(".evening-check").forEach(cb => cb.checked = selectAllEvening.checked);
      saveState();
    });

    container.querySelector("#duringTodo")?.addEventListener("input", saveState);
  }

  function saveState() {
    const state = {
      rows: {},
      todo: container.querySelector("#duringTodo")?.value || ""
    };

    container.querySelectorAll(".during-row").forEach((row) => {
      const id = row.dataset.id;

      state.rows[id] = {
        morning: row.querySelector(".morning-check")?.checked || false,
        evening: row.querySelector(".evening-check")?.checked || false
      };
    });

    localStorage.setItem(storageKey, JSON.stringify(state));

    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveToSupabase, 400);
  }

  function restoreState() {
    const saved = localStorage.getItem(storageKey);
    if (!saved) return;

    let state = {};
    try {
      state = JSON.parse(saved);
    } catch {
      return;
    }

    container.querySelectorAll(".during-row").forEach((row) => {
      const id = row.dataset.id;
      const savedRow = state.rows?.[id];

      if (!savedRow) return;

      row.querySelector(".morning-check").checked = !!savedRow.morning;
      row.querySelector(".evening-check").checked = !!savedRow.evening;
    });

    container.querySelector("#duringTodo").value = state.todo || "";
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

  function makeId(text) {
    return text.toLowerCase().replaceAll(" ", "_").replace(/[^\wа-яё]/gi, "").slice(0, 60);
  }

  function getCurrentShiftDate() {
    return document.getElementById("shiftDate")?.value || new Date().toISOString().split("T")[0];
  }
}