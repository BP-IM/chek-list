(function () {
  const PREP_JSON_PATH = "sections/data/prep.json";
  const SECTION_NAME = "prep";

  let prepState = {
    checks: {},
    texts: {},
    expiry: {}
  };

  let saveTimer = null;

  function getShiftDate() {
    const date = document.getElementById("shiftDate")?.value;
    if (date) return date;

    const now = new Date();
    const offset = now.getTimezoneOffset() * 60000;
    return new Date(now - offset).toISOString().split("T")[0];
  }

  function getLocalKey() {
    return `checklist_prep_state_${getShiftDate()}`;
  }

  async function loadPrepState() {
    const localSaved = localStorage.getItem(getLocalKey());

    if (localSaved) {
      try {
        prepState = JSON.parse(localSaved);
      } catch {
        prepState = { checks: {}, texts: {}, expiry: {} };
      }
    }

    if (!window.supabaseClient) return;

    const { data, error } = await window.supabaseClient
      .from("checklist_daily")
      .select("data")
      .eq("shift_date", getShiftDate())
      .eq("section", SECTION_NAME)
      .maybeSingle();

    if (error) {
      console.error("prep load error:", error);
      return;
    }

    if (data?.data) {
      prepState = data.data;
      localStorage.setItem(getLocalKey(), JSON.stringify(prepState));
    }
  }

  function savePrepState() {
    localStorage.setItem(getLocalKey(), JSON.stringify(prepState));

    clearTimeout(saveTimer);
    saveTimer = setTimeout(savePrepStateToSupabase, 400);
  }

  async function savePrepStateToSupabase() {
    if (!window.supabaseClient) return;

    const { error } = await window.supabaseClient
      .from("checklist_daily")
      .upsert(
        {
          shift_date: getShiftDate(),
          section: SECTION_NAME,
          data: prepState,
          updated_at: new Date().toISOString()
        },
        {
          onConflict: "shift_date,section"
        }
      );

    if (error) {
      console.error("prep save error:", error);
    }
  }

  function createExpiryCell(itemId, period, hasProduct) {
    if (!hasProduct) {
      return `<div class="expiry-empty">—</div>`;
    }

    return `
      <div class="expiry-box">
        <input type="time" data-expiry-key="${itemId}_${period}_hour" />
        <input type="date" data-expiry-key="${itemId}_${period}_date" />
      </div>
    `;
  }

  function createRow(item) {
    const hasProduct = item.product && item.product !== "-";

    return `
      <tr data-row>
        <td>
          <input type="checkbox" data-check-key="${item.id}_morning" />
        </td>
        <td>
          <input type="checkbox" data-check-key="${item.id}_evening" />
        </td>
        <td>${item.task}</td>
        <td>
          <input type="text" data-text-key="${item.id}_comment" placeholder="Комментарий" />
        </td>
        <td>${item.product || "-"}</td>
        <td>
          ${createExpiryCell(item.id, "morning", hasProduct)}
        </td>
        <td>
          ${createExpiryCell(item.id, "evening", hasProduct)}
        </td>
      </tr>
    `;
  }

  function renderPrepTable(data) {
    const tbody = document.getElementById("prepTableBody");
    if (!tbody) return;

    let html = "";

    data.sections.forEach((section) => {
      html += `
        <tr class="group-row">
          <td colspan="7">${section.title}</td>
        </tr>
      `;

      section.items.forEach((item) => {
        html += createRow(item);
      });
    });

    tbody.innerHTML = html;
  }

  function updateRowStyle(row) {
    if (!row) return;

    const checkboxes = row.querySelectorAll("[data-check-key]");
    const allChecked = checkboxes.length > 0 && [...checkboxes].every((cb) => cb.checked);

    row.classList.toggle("checked-row", allChecked);
  }

  function updateAllRowStyles() {
    document.querySelectorAll("tr[data-row]").forEach((row) => {
      updateRowStyle(row);
    });
  }

  function restorePrepState() {
    document.querySelectorAll("[data-check-key]").forEach((el) => {
      el.checked = !!prepState.checks[el.dataset.checkKey];
    });

    document.querySelectorAll("[data-text-key]").forEach((el) => {
      el.value = prepState.texts[el.dataset.textKey] || "";
    });

    document.querySelectorAll("[data-expiry-key]").forEach((el) => {
      el.value = prepState.expiry[el.dataset.expiryKey] || "";
    });

    updateAllRowStyles();
    updateSelectAllStates();
  }

  function updateSelectAllStates() {
    const morningSelectAll = document.getElementById("prepSelectAllMorning");
    const eveningSelectAll = document.getElementById("prepSelectAllEvening");

    const morningChecks = [...document.querySelectorAll('[data-check-key$="_morning"]')];
    const eveningChecks = [...document.querySelectorAll('[data-check-key$="_evening"]')];

    if (morningSelectAll) {
      morningSelectAll.checked =
        morningChecks.length > 0 && morningChecks.every((checkbox) => checkbox.checked);
    }

    if (eveningSelectAll) {
      eveningSelectAll.checked =
        eveningChecks.length > 0 && eveningChecks.every((checkbox) => checkbox.checked);
    }
  }

  function bindPrepEvents() {
    document.querySelectorAll("[data-check-key]").forEach((el) => {
      el.addEventListener("change", () => {
        prepState.checks[el.dataset.checkKey] = el.checked;
        updateRowStyle(el.closest("tr"));
        updateSelectAllStates();
        savePrepState();
      });
    });

    document.querySelectorAll("[data-text-key]").forEach((el) => {
      el.addEventListener("input", () => {
        prepState.texts[el.dataset.textKey] = el.value;
        savePrepState();
      });
    });

    document.querySelectorAll("[data-expiry-key]").forEach((el) => {
      el.addEventListener("input", () => {
        prepState.expiry[el.dataset.expiryKey] = el.value;
        savePrepState();
      });
    });

    const morningSelectAll = document.getElementById("prepSelectAllMorning");
    const eveningSelectAll = document.getElementById("prepSelectAllEvening");

    if (morningSelectAll) {
      morningSelectAll.addEventListener("change", () => {
        document.querySelectorAll('[data-check-key$="_morning"]').forEach((checkbox) => {
          checkbox.checked = morningSelectAll.checked;
          prepState.checks[checkbox.dataset.checkKey] = checkbox.checked;
          updateRowStyle(checkbox.closest("tr"));
        });

        updateSelectAllStates();
        savePrepState();
      });
    }

    if (eveningSelectAll) {
      eveningSelectAll.addEventListener("change", () => {
        document.querySelectorAll('[data-check-key$="_evening"]').forEach((checkbox) => {
          checkbox.checked = eveningSelectAll.checked;
          prepState.checks[checkbox.dataset.checkKey] = checkbox.checked;
          updateRowStyle(checkbox.closest("tr"));
        });

        updateSelectAllStates();
        savePrepState();
      });
    }
  }

  async function initPrep() {
    try {
      const response = await fetch(PREP_JSON_PATH);
      if (!response.ok) {
        throw new Error("prep.json not found");
      }

      const data = await response.json();

      await loadPrepState();
      renderPrepTable(data);
      restorePrepState();
      bindPrepEvents();
    } catch (error) {
      const tbody = document.getElementById("prepTableBody");
      if (tbody) {
        tbody.innerHTML = `
          <tr>
            <td colspan="7">Ошибка загрузки данных prep.json</td>
          </tr>
        `;
      }
      console.error(error);
    }
  }

  initPrep();
})();