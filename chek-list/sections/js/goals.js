function initGoalsSection() {
  const goalsContainer = document.getElementById("goalsContainer");
  if (!goalsContainer) return;

  if (goalsContainer.dataset.initialized === "true") return;
  goalsContainer.dataset.initialized = "true";

  const SECTION_NAME = "goals";
  let saveTimer = null;

  const GOALS_MANUAL_FIELDS = [
    "rating_im",
    "rating_12",
    "dt_percent",
    "kiosk_percent",
    "dlv_percent",
    "c_percent",
    "oepe_sec",
    "wrong_orders",
    "gcpch",
    "waste_state"
  ];

  const AUTO_RESULT_FIELDS = [
    "result_sales",
    "result_gc",
    "result_avg_check",
    "result_dt_percent",
    "result_kiosk_percent",
    "result_dlv_percent",
    "result_c_percent"
  ];

  const metrics = [
    { key: "sales", label: "SALES", type: "text", autoGoal: true, autoResult: true },
    { key: "gc", label: "GC", type: "text", autoGoal: true, autoResult: true },
    { key: "avg_check", label: "Av.check", type: "text", autoGoal: true, autoResult: true },
    { key: "rating_im", label: "Рейтинг в I’M Voice", type: "text" },
    { key: "rating_12", label: "1&2 рейтинг", type: "text" },
    { key: "dt_percent", label: "% DT", type: "text", autoResult: true },
    { key: "kiosk_percent", label: "% КИОСКОВ", type: "text", autoResult: true },
    { key: "dlv_percent", label: "% DLV", type: "text", autoResult: true },
    { key: "c_percent", label: "% C", type: "text", autoResult: true },
    { key: "oepe_sec", label: "OEPE (сек)", type: "text" },
    { key: "wrong_orders", label: "Количество неточно собранных заказов DLV", type: "textarea" },
    { key: "gcpch", label: "GCPCH", type: "text" },
    { key: "waste_state", label: "Waste\\State (три проблемных продукта)", type: "textarea" }
  ];

  goalsContainer.innerHTML = `
    <div class="goals-wrap">
      <div class="goals-main-title">ЦЕЛИ НА ТЕКУЩИЙ ДЕНЬ</div>

      <div class="goals-subtitle">
        ЦЕЛИ НА ДЕНЬ
        <span>(учитывайте приоритеты ресторана, план действий RACE\\Обед):</span>
      </div>

      <div class="goals-table-wrap">
        <table class="goals-table">
          <thead>
            <tr>
              <th class="metric-col"></th>
              <th class="prev-col">Результат за предыдущий день</th>
              <th class="goal-col">Цели на текущий день</th>
              <th class="result-col">Результат за текущий день</th>
              <th class="percent-col">%</th>
              <th class="comment-col comment-head">
                Выполнение цели:
                <small>(в случае невыполнения цели описываем причины)</small>
              </th>
            </tr>
          </thead>
          <tbody>
            ${metrics.map(renderMetricRow).join("")}
          </tbody>
        </table>
      </div>

      <div class="goals-day-title">ЦЕЛИ НА ДЕНЬ</div>

      <div class="priority-block">
        <div class="priority-head">Приоритет 1</div>
        <div class="priority-body">
          <textarea class="priority-textarea" data-priority="1"></textarea>
        </div>
      </div>

      <div class="priority-block">
        <div class="priority-head">Приоритет 2</div>
        <div class="priority-body">
          <textarea class="priority-textarea" data-priority="2"></textarea>
        </div>
      </div>

      <div class="priority-block">
        <div class="priority-head">Приоритет 3</div>
        <div class="priority-body">
          <textarea class="priority-textarea" data-priority="3"></textarea>
        </div>
      </div>
    </div>
  `;

  attachPercentFormatting();

  const selectedDate = getCurrentShiftDate();
  loadAll();

  goalsContainer.querySelectorAll("input, textarea").forEach((el) => {
    if (el.dataset.autofill === "true") return;
    if (el.dataset.readonly === "true") return;

    el.addEventListener("input", () => {
      saveManualState();
    });
  });

  async function loadAll() {
    await fillTodayGoalsFromPlanData(selectedDate);
    fillPreviousDayFromSnapshot(selectedDate);

    await restoreManualState(selectedDate);

    fillTodayResultsFromHourly(selectedDate);

    saveSnapshotOnly();
  }

  async function fillTodayGoalsFromPlanData(date) {
    const { data, error } = await window.supabaseClient
      .from("plan_data")
      .select("gc, too")
      .eq("plan_date", date);

    if (error) {
      console.error("plan_data error in goals:", error);
      return;
    }

    let totalGc = 0;
    let totalSales = 0;

    (data || []).forEach((row) => {
      totalGc += Number(row.gc || 0);
      totalSales += Number(row.too || 0);
    });

    const avgCheck = totalGc > 0 ? Math.round(totalSales / totalGc) : 0;

    setFieldValue("goal_sales", formatNumber(totalSales), true);
    setFieldValue("goal_gc", formatNumber(totalGc), true);
    setFieldValue("goal_avg_check", formatNumber(avgCheck), true);
  }

  function fillTodayResultsFromHourly(date) {
    const saved = localStorage.getItem(`hourly_fact_${date}`);
    if (!saved) return;

    let rows = [];
    try {
      rows = JSON.parse(saved);
    } catch {
      return;
    }

    let totalSales = 0;
    let totalGc = 0;
    let totalDt = 0;
    let totalKiosk = 0;
    let totalDelivery = 0;
    let totalC = 0;

    rows.forEach((row) => {
      totalSales += Number(row.sales_fact || 0);
      totalGc += Number(row.gc_fact || 0);
      totalDt += Number(row.dt_fact || 0);
      totalKiosk += Number(row.kiosk_fact || 0);
      totalDelivery += Number(row.delivery_fact || 0);
      totalC += Number(row.c_fact || 0);
    });

    const avgCheck = totalGc > 0 ? Math.round(totalSales / totalGc) : 0;
    const dtPercent = totalGc > 0 ? Math.round((totalDt / totalGc) * 100) : 0;
    const kioskPercent = totalGc > 0 ? Math.round((totalKiosk / totalGc) * 100) : 0;
    const dlvPercent = totalGc > 0 ? Math.round((totalDelivery / totalGc) * 100) : 0;
    const cPercent = totalGc > 0 ? Math.round((totalC / totalGc) * 100) : 0;

    setFieldValue("result_sales", formatNumber(totalSales), true);
    setFieldValue("result_gc", formatNumber(totalGc), true);
    setFieldValue("result_avg_check", formatNumber(avgCheck), true);
    setFieldValue("result_dt_percent", dtPercent + "%", true);
    setFieldValue("result_kiosk_percent", kioskPercent + "%", true);
    setFieldValue("result_dlv_percent", dlvPercent + "%", true);
    setFieldValue("result_c_percent", cPercent + "%", true);
  }

  function fillPreviousDayFromSnapshot(date) {
    const prevDate = getPrevDate(date);
    const prevSnapshot = localStorage.getItem(`goals_snapshot_${prevDate}`);
    if (!prevSnapshot) return;

    let data = {};
    try {
      data = JSON.parse(prevSnapshot);
    } catch {
      return;
    }

    Object.entries(data).forEach(([key, value]) => {
      setFieldValue(`prev_${key}`, value, true);
    });
  }

  function saveManualState() {
    const date = getCurrentShiftDate();
    const manual = buildManualState();

    localStorage.setItem(`goals_manual_${date}`, JSON.stringify(manual));
    localStorage.setItem(`goals_snapshot_${date}`, JSON.stringify(buildTodaySnapshot()));

    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveGoalsToSupabase(date, manual);
    }, 400);
  }

  async function restoreManualState(date) {
    let manual = null;

    const localSaved = localStorage.getItem(`goals_manual_${date}`);
    if (localSaved) {
      try {
        manual = JSON.parse(localSaved);
      } catch {
        manual = null;
      }
    }

    if (window.supabaseClient) {
      const { data, error } = await window.supabaseClient
        .from("checklist_daily")
        .select("data")
        .eq("shift_date", date)
        .eq("section", SECTION_NAME)
        .maybeSingle();

      if (error) {
        console.error("goals load error:", error);
      }

      if (data?.data) {
        manual = data.data;
        localStorage.setItem(`goals_manual_${date}`, JSON.stringify(manual));
      }
    }

    if (!manual) {
      localStorage.setItem(`goals_snapshot_${date}`, JSON.stringify(buildTodaySnapshot()));
      return;
    }

    Object.entries(manual).forEach(([key, value]) => {
      if (AUTO_RESULT_FIELDS.includes(key)) return;

      if (key.startsWith("goal_") || key.startsWith("result_") || key.startsWith("comment_")) {
        setFieldValue(key, value, false);
      }
    });

    if (manual.priority_1 !== undefined) {
      goalsContainer.querySelector('[data-priority="1"]').value = manual.priority_1 || "";
    }

    if (manual.priority_2 !== undefined) {
      goalsContainer.querySelector('[data-priority="2"]').value = manual.priority_2 || "";
    }

    if (manual.priority_3 !== undefined) {
      goalsContainer.querySelector('[data-priority="3"]').value = manual.priority_3 || "";
    }

    localStorage.setItem(`goals_snapshot_${date}`, JSON.stringify(buildTodaySnapshot()));
  }

  async function saveGoalsToSupabase(date, manual) {
    if (!window.supabaseClient) return;

    const { error } = await window.supabaseClient
      .from("checklist_daily")
      .upsert(
        {
          shift_date: date,
          section: SECTION_NAME,
          data: manual,
          updated_at: new Date().toISOString()
        },
        {
          onConflict: "shift_date,section"
        }
      );

    if (error) {
      console.error("goals save error:", error);
    }
  }

  function buildManualState() {
    const manual = {};

    GOALS_MANUAL_FIELDS.forEach((key) => {
      manual[`goal_${key}`] = getFieldValue(`goal_${key}`);
      manual[`result_${key}`] = getFieldValue(`result_${key}`);
      manual[`comment_${key}`] = getFieldValue(`comment_${key}`);
    });

    manual.priority_1 = goalsContainer.querySelector('[data-priority="1"]')?.value || "";
    manual.priority_2 = goalsContainer.querySelector('[data-priority="2"]')?.value || "";
    manual.priority_3 = goalsContainer.querySelector('[data-priority="3"]')?.value || "";

    return manual;
  }

  function saveSnapshotOnly() {
    const date = getCurrentShiftDate();
    localStorage.setItem(`goals_snapshot_${date}`, JSON.stringify(buildTodaySnapshot()));
  }

  function buildTodaySnapshot() {
    const snapshot = {};

    metrics.forEach((metric) => {
      snapshot[metric.key] = getFieldValue(`result_${metric.key}`);
    });

    return snapshot;
  }

  function renderMetricRow(metric) {
    const prevCell = metric.type === "textarea"
      ? `<textarea class="goals-textarea" data-field="prev_${metric.key}" data-readonly="true"></textarea>`
      : `<input class="goals-input" data-field="prev_${metric.key}" data-readonly="true" />`;

    const goalCell = metric.type === "textarea"
      ? `<textarea class="goals-textarea" data-field="goal_${metric.key}" ${metric.autoGoal ? 'data-readonly="true"' : ""}></textarea>`
      : `<input class="goals-input" data-field="goal_${metric.key}" ${metric.autoGoal ? 'data-readonly="true"' : ""} />`;

    const resultCell = metric.type === "textarea"
      ? `<textarea class="goals-textarea" data-field="result_${metric.key}" ${metric.autoResult ? 'data-readonly="true"' : ""}></textarea>`
      : `<input class="goals-input" data-field="result_${metric.key}" ${metric.autoResult ? 'data-readonly="true"' : ""} />`;

    const commentCell = metric.type === "textarea"
      ? `<textarea class="goals-textarea" data-field="comment_${metric.key}"></textarea>`
      : `<input class="goals-input" data-field="comment_${metric.key}" />`;

    return `
      <tr>
        <td class="metric-col">${metric.label}</td>
        <td>${prevCell}</td>
        <td>${goalCell}</td>
        <td>${resultCell}</td>
        <td>
          <input class="goals-input percent-input" data-field="percent_${metric.key}" readonly />
        </td>
        <td>${commentCell}</td>
      </tr>
    `;
  }

  function attachPercentFormatting() {
    const percentFields = [
      "goal_dt_percent",
      "goal_kiosk_percent",
      "goal_dlv_percent",
      "goal_c_percent"
    ];

    percentFields.forEach((field) => {
      const input = goalsContainer.querySelector(`[data-field="${field}"]`);
      if (!input) return;

      input.addEventListener("input", () => {
        let value = input.value
          .replace("%", "")
          .replace(",", ".")
          .replace(/[^0-9.]/g, "")
          .trim();

        input.value = value ? value + "%" : "";
      });
    });
  }

  function setFieldValue(fieldName, value, readonly) {
    const el = goalsContainer.querySelector(`[data-field="${fieldName}"]`);
    if (!el) return;

    el.value = value ?? "";

    if (readonly) {
      el.setAttribute("readonly", "readonly");
      el.dataset.autofill = "true";
    }
  }

  function getFieldValue(fieldName) {
    const el = goalsContainer.querySelector(`[data-field="${fieldName}"]`);
    return el ? el.value : "";
  }

  function getPrevDate(dateStr) {
    const d = new Date(dateStr);
    d.setDate(d.getDate() - 1);
    return d.toISOString().split("T")[0];
  }

  function getCurrentShiftDate() {
    const globalShiftDate = document.getElementById("shiftDate")?.value;
    if (globalShiftDate) return globalShiftDate;

    const now = new Date();
    const tzOffset = now.getTimezoneOffset() * 60000;
    return new Date(now - tzOffset).toISOString().split("T")[0];
  }

  function formatNumber(value) {
    return Number(value || 0).toLocaleString("ru-RU");
  }
}