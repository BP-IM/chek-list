function initHourlySection() {
  const db = window.supabaseClient;

  const planDateInput = document.getElementById("planDate");
  const loadBtn = document.getElementById("loadBtn");
  const saveBtn = document.getElementById("saveBtn");
  const planningContainer = document.getElementById("planningContainer");
  const hourlyStatus = document.getElementById("hourlyStatus");

  if (!planDateInput || !loadBtn || !saveBtn || !planningContainer || !hourlyStatus) return;
  if (planningContainer.dataset.initialized === "true") return;

  planningContainer.dataset.initialized = "true";

  let hourlyConfig = null;

  const SECTION_NAME = "hourly";
  const TOTALS_SECTION_NAME = "hourly_totals";
  let saveTimer = null;

  planDateInput.value = getCurrentShiftDate();

  loadBtn.addEventListener("click", loadPlanning);
  saveBtn.addEventListener("click", () => {
    saveHourlyToLocalStorage();
    alert("Факт сақталды");
  });

  start();

  async function start() {
    setStatus("Загрузка структуры...");
    hourlyConfig = await loadHourlyConfig();

    if (!hourlyConfig) {
      planningContainer.innerHTML = `<div class="error-box">Не удалось загрузить hourly.json</div>`;
      setStatus("Ошибка загрузки структуры", true);
      return;
    }

    await loadPlanning();
  }

  async function loadHourlyConfig() {
    try {
      const response = await fetch("./sections/data/hourly.json");
      if (!response.ok) throw new Error("hourly.json not found");
      return await response.json();
    } catch (error) {
      console.error("Config load error:", error);
      return null;
    }
  }

  async function loadPlanning() {
    const selectedDate = planDateInput.value;

    if (!selectedDate) {
      setStatus("Сначала выбери дату", true);
      return;
    }

    setStatus("Загрузка данных...");
    planningContainer.innerHTML = `<div class="loading-box">Загрузка...</div>`;

    const { data, error } = await db
      .from("plan_data")
      .select("plan_hour, gc, too")
      .eq("plan_date", selectedDate)
      .order("plan_hour", { ascending: true });

    if (error) {
      console.error("plan_data error:", error);
      planningContainer.innerHTML = `<div class="error-box">Ошибка загрузки данных из базы</div>`;
      setStatus("Ошибка загрузки данных", true);
      return;
    }

    const planMap = {};
    (data || []).forEach((item) => {
      planMap[item.plan_hour] = item;
    });

    planningContainer.innerHTML = hourlyConfig.shifts
      .map((shift) => renderShiftBlock(shift, planMap))
      .join("");

    await restoreHourlyFromSupabase(selectedDate);
    restoreHourlyFromLocalStorage(selectedDate);

    attachRealtimeCalculations();
    attachAutoSave();
    setStatus("Данные загружены");
  }

  function renderShiftBlock(shift, planMap) {
    let totalGcPlan = 0;
    let totalCPlan = 0;
    let totalDtPlan = 0;
    let totalKioskPlan = 0;
    let totalDeliveryPlan = 0;
    let totalSandwichesPlan = 0;
    let totalSalesPlan = 0;

    const percents = getGoalPercents();

    const rowsHtml = shift.hours.map((hour) => {
      const row = planMap[hour] || { gc: 0, too: 0 };
      const gcPlan = Number(row.gc || 0);
      const salesPlan = Number(row.too || 0);
      const sandwichesPlan = Math.round(gcPlan * 1.3);

      const distributed = distributeGcByPercents(gcPlan, percents);

      totalGcPlan += gcPlan;
      totalCPlan += distributed.c;
      totalDtPlan += distributed.dt;
      totalKioskPlan += distributed.kiosk;
      totalDeliveryPlan += distributed.delivery;
      totalSandwichesPlan += sandwichesPlan;
      totalSalesPlan += salesPlan;

      return `
        <tr data-hour="${hour}">
          <td class="time-col">${formatHour(hour)}</td>

          <td class="plan-col"><span class="cell-readonly">${gcPlan}</span></td>
          <td class="fact-col"><span class="cell-readonly gc-fact-value">0</span></td>

          <td class="plan-col"><span class="cell-readonly">${distributed.c}</span></td>
          <td class="fact-col">
            <input class="cell-input c-fact-input" type="number" min="0" value="">
          </td>

          <td class="plan-col"><span class="cell-readonly">${distributed.dt}</span></td>
          <td class="fact-col">
            <input class="cell-input dt-fact-input" type="number" min="0" value="">
          </td>

          <td class="plan-col"><span class="cell-readonly">${distributed.kiosk}</span></td>
          <td class="fact-col">
            <input class="cell-input kiosk-fact-input" type="number" min="0" value="">
          </td>

          <td class="plan-col"><span class="cell-readonly">${distributed.delivery}</span></td>
          <td class="fact-col">
            <input class="cell-input delivery-fact-input" type="number" min="0" value="">
          </td>

          <td class="plan-col"><span class="cell-readonly">${sandwichesPlan}</span></td>
          <td class="fact-col">
            <input class="cell-input sandwich-fact-input" type="number" min="0" value="">
          </td>

          <td class="plan-col"><span class="cell-readonly">${salesPlan}</span></td>
          <td class="fact-col">
            <input class="cell-input sales-fact-input" type="number" min="0" value="">
          </td>

          <td class="lilac-col avg-value"></td>

          <td class="peach-col">
            <input class="cell-input gcpch-input" type="number" step="0.01" value="">
          </td>

          <td class="fact-col">
            <input class="cell-input oepe-input" type="number" step="0.01" value="">
          </td>
        </tr>
      `;
    }).join("");

    const prioritiesHtml = shift.showPriorities
      ? `
        <div class="status-title">Статус за ${shift.key === "morning" ? "утро" : "вечер"} по приоритетам:</div>
        <div class="priorities">
          <textarea placeholder="Приоритет 1"></textarea>
          <textarea placeholder="Приоритет 2"></textarea>
          <textarea placeholder="Приоритет 3"></textarea>
        </div>
      `
      : "";

    return `
      <section class="shift-block" data-shift="${shift.key}">
        <div class="shift-title">${shift.title}</div>

        <div class="table-wrap">
          <table class="plan-table">
            <thead>
              <tr>
                <th class="super-head" rowspan="2">Время</th>
                <th class="super-head" colspan="10">GC</th>
                <th class="super-head" colspan="2">Кол-во сандвичей</th>
                <th class="super-head" colspan="2">Sales (ежечасно)</th>
                <th class="super-head avg-head" rowspan="2">Av. Check</th>
                <th class="super-head gcpch-head" rowspan="2">GCPCH с ТТ</th>
                <th class="super-head oepe-head" rowspan="2">OEPE</th>
              </tr>
              <tr>
                <th colspan="2">Общее<br>План/факт</th>
                <th colspan="2">C<br>План/факт</th>
                <th colspan="2">Drive<br>План/факт</th>
                <th colspan="2">Киоски<br>План/факт</th>
                <th colspan="2">Delivery<br>План/факт</th>
                <th>План</th>
                <th>Факт</th>
                <th>План</th>
                <th>Факт</th>
              </tr>
            </thead>

            <tbody>
              ${rowsHtml}

              <tr class="green-total">
                <td>ИТОГ</td>

                <td>${totalGcPlan}</td>
                <td class="total-gc-fact"></td>

                <td>${totalCPlan}</td>
                <td class="total-c-fact">0</td>

                <td>${totalDtPlan}</td>
                <td class="total-dt-fact">0</td>

                <td>${totalKioskPlan}</td>
                <td class="total-kiosk-fact">0</td>

                <td>${totalDeliveryPlan}</td>
                <td class="total-delivery-fact">0</td>

                <td>${totalSandwichesPlan}</td>
                <td class="total-sandwich-fact">0</td>

                <td>${totalSalesPlan}</td>
                <td class="total-sales-fact">0</td>

                <td class="total-avg-value">0</td>

                <td>
                  <input class="cell-input total-gcpch-input" type="number" step="0.01" value="">
                </td>

                <td class="total-oepe-value">0</td>
              </tr>
            </tbody>
          </table>
        </div>

        ${prioritiesHtml}
      </section>
    `;
  }

  function attachRealtimeCalculations() {
    const shiftBlocks = planningContainer.querySelectorAll(".shift-block");

    shiftBlocks.forEach((block) => {
      const rows = block.querySelectorAll("tbody tr[data-hour]");

      function recalcShift() {
        let totalGcFact = 0;
        let totalSalesFact = 0;
        let totalCFact = 0;
        let totalDtFact = 0;
        let totalKioskFact = 0;
        let totalDeliveryFact = 0;
        let totalSandwichFact = 0;
        let lastOepe = "";

        rows.forEach((row) => {
          const cFact = Number(row.querySelector(".c-fact-input")?.value || 0);
          const dtFact = Number(row.querySelector(".dt-fact-input")?.value || 0);
          const kioskFact = Number(row.querySelector(".kiosk-fact-input")?.value || 0);
          const deliveryFact = Number(row.querySelector(".delivery-fact-input")?.value || 0);
          const sandwichFact = Number(row.querySelector(".sandwich-fact-input")?.value || 0);
          const salesFact = Number(row.querySelector(".sales-fact-input")?.value || 0);
          const oepeValue = row.querySelector(".oepe-input")?.value || "";

          if (oepeValue !== "") {
            lastOepe = oepeValue;
          }

          const gcFact = cFact + dtFact + kioskFact + deliveryFact;

          totalCFact += cFact;
          totalDtFact += dtFact;
          totalKioskFact += kioskFact;
          totalDeliveryFact += deliveryFact;
          totalSandwichFact += sandwichFact;
          totalSalesFact += salesFact;
          totalGcFact += gcFact;

          setText(row, ".gc-fact-value", gcFact);

          const avgValue = gcFact > 0 ? Math.round(salesFact / gcFact) : 0;
          setText(row, ".avg-value", avgValue);
        });

        const totalAvg = totalGcFact > 0 ? Math.round(totalSalesFact / totalGcFact) : 0;

        setText(block, ".total-gc-fact", totalGcFact);
        setText(block, ".total-c-fact", totalCFact);
        setText(block, ".total-dt-fact", totalDtFact);
        setText(block, ".total-kiosk-fact", totalKioskFact);
        setText(block, ".total-delivery-fact", totalDeliveryFact);
        setText(block, ".total-sandwich-fact", totalSandwichFact);
        setText(block, ".total-sales-fact", totalSalesFact);
        setText(block, ".total-avg-value", totalAvg);
        setText(block, ".total-oepe-value", lastOepe || "0");
      }

      rows.forEach((row) => {
        row.querySelectorAll("input").forEach((input) => {
          input.addEventListener("input", recalcShift);
        });
      });

      recalcShift();
    });
  }

  function attachAutoSave() {
    planningContainer.querySelectorAll("input").forEach((input) => {
      input.addEventListener("input", saveHourlyToLocalStorage);
    });
  }

  function saveHourlyToLocalStorage() {
    const selectedDate = planDateInput.value;
    if (!selectedDate) return;

    const payload = [];

    planningContainer.querySelectorAll("tr[data-hour]").forEach((row) => {
      const cFact = Number(row.querySelector(".c-fact-input")?.value || 0);
      const dtFact = Number(row.querySelector(".dt-fact-input")?.value || 0);
      const kioskFact = Number(row.querySelector(".kiosk-fact-input")?.value || 0);
      const deliveryFact = Number(row.querySelector(".delivery-fact-input")?.value || 0);

      payload.push({
        hour: Number(row.dataset.hour),
        gc_fact: cFact + dtFact + kioskFact + deliveryFact,
        c_fact: cFact,
        dt_fact: dtFact,
        kiosk_fact: kioskFact,
        delivery_fact: deliveryFact,
        sandwich_fact: Number(row.querySelector(".sandwich-fact-input")?.value || 0),
        sales_fact: Number(row.querySelector(".sales-fact-input")?.value || 0),
        gcpch: row.querySelector(".gcpch-input")?.value || "",
        oepe: row.querySelector(".oepe-input")?.value || ""
      });
    });

    const shiftTotals = {};
    planningContainer.querySelectorAll(".shift-block").forEach((block) => {
      const shift = block.dataset.shift;
      shiftTotals[shift] = {
        gcpch_total: block.querySelector(".total-gcpch-input")?.value || "",
        oepe_total: block.querySelector(".total-oepe-value")?.textContent || ""
      };
    });

    localStorage.setItem(`hourly_fact_${selectedDate}`, JSON.stringify(payload));
    localStorage.setItem(`hourly_shift_totals_${selectedDate}`, JSON.stringify(shiftTotals));

    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveHourlyToSupabase(selectedDate, payload, shiftTotals);
    }, 500);
  }

  function restoreHourlyFromLocalStorage(date) {
    const saved = localStorage.getItem(`hourly_fact_${date}`);
    const savedTotals = localStorage.getItem(`hourly_shift_totals_${date}`);

    if (saved) {
      let rows = [];
      try {
        rows = JSON.parse(saved);
      } catch {
        rows = [];
      }

      const map = {};
      rows.forEach((item) => {
        map[item.hour] = item;
      });

      planningContainer.querySelectorAll("tr[data-hour]").forEach((row) => {
        const hour = Number(row.dataset.hour);
        const savedRow = map[hour];
        if (!savedRow) return;

        setInputValue(row, ".c-fact-input", savedRow.c_fact);
        setInputValue(row, ".dt-fact-input", savedRow.dt_fact);
        setInputValue(row, ".kiosk-fact-input", savedRow.kiosk_fact);
        setInputValue(row, ".delivery-fact-input", savedRow.delivery_fact);
        setInputValue(row, ".sandwich-fact-input", savedRow.sandwich_fact);
        setInputValue(row, ".sales-fact-input", savedRow.sales_fact);
        setInputValue(row, ".gcpch-input", savedRow.gcpch);
        setInputValue(row, ".oepe-input", savedRow.oepe);
      });
    }

    if (savedTotals) {
      let totals = {};
      try {
        totals = JSON.parse(savedTotals);
      } catch {
        totals = {};
      }

      planningContainer.querySelectorAll(".shift-block").forEach((block) => {
        const shift = block.dataset.shift;
        const total = totals[shift];
        if (!total) return;

        setInputValue(block, ".total-gcpch-input", total.gcpch_total);
        setText(block, ".total-oepe-value", total.oepe_total || "0");
      });
    }
  }

  async function saveHourlyToSupabase(date, payload, shiftTotals) {
    if (!window.supabaseClient) return;

    const { error } = await window.supabaseClient
      .from("checklist_daily")
      .upsert(
        {
          shift_date: date,
          section: SECTION_NAME,
          data: payload,
          updated_at: new Date().toISOString()
        },
        { onConflict: "shift_date,section" }
      );

    if (error) {
      console.error("hourly save error:", error);
    }

    const { error: totalsError } = await window.supabaseClient
      .from("checklist_daily")
      .upsert(
        {
          shift_date: date,
          section: TOTALS_SECTION_NAME,
          data: shiftTotals,
          updated_at: new Date().toISOString()
        },
        { onConflict: "shift_date,section" }
      );

    if (totalsError) {
      console.error("hourly totals save error:", totalsError);
    }
  }

  async function restoreHourlyFromSupabase(date) {
    if (!window.supabaseClient) return;

    const { data, error } = await window.supabaseClient
      .from("checklist_daily")
      .select("section, data")
      .eq("shift_date", date)
      .in("section", [SECTION_NAME, TOTALS_SECTION_NAME]);

    if (error) {
      console.error("hourly load error:", error);
      return;
    }

    (data || []).forEach((row) => {
      if (row.section === SECTION_NAME) {
        localStorage.setItem(`hourly_fact_${date}`, JSON.stringify(row.data));
      }

      if (row.section === TOTALS_SECTION_NAME) {
        localStorage.setItem(`hourly_shift_totals_${date}`, JSON.stringify(row.data));
      }
    });
  }

  function getGoalPercents() {
    const date = getCurrentShiftDate();
    const saved = localStorage.getItem(`goals_manual_${date}`);

    let manual = {};
    try {
      manual = saved ? JSON.parse(saved) : {};
    } catch {
      manual = {};
    }

    return {
      c: parsePercent(manual.goal_c_percent),
      dt: parsePercent(manual.goal_dt_percent),
      kiosk: parsePercent(manual.goal_kiosk_percent),
      delivery: parsePercent(manual.goal_dlv_percent)
    };
  }

  function parsePercent(value) {
    if (!value) return 0;
    return Number(String(value).replace("%", "").replace(",", ".").trim()) || 0;
  }

  function distributeGcByPercents(totalGc, percents) {
    const safeTotal = Math.max(0, Number(totalGc || 0));

    const channels = [
      { key: "c", percent: Number(percents.c || 0) },
      { key: "dt", percent: Number(percents.dt || 0) },
      { key: "kiosk", percent: Number(percents.kiosk || 0) },
      { key: "delivery", percent: Number(percents.delivery || 0) }
    ];

    const percentSum = channels.reduce((sum, item) => sum + item.percent, 0);

    if (safeTotal <= 0 || percentSum <= 0) {
      return { c: 0, dt: 0, kiosk: 0, delivery: 0 };
    }

    const calculated = channels.map((item) => {
      const raw = safeTotal * item.percent / percentSum;
      const base = Math.floor(raw);

      return {
        key: item.key,
        value: base,
        remainder: raw - base
      };
    });

    let used = calculated.reduce((sum, item) => sum + item.value, 0);
    let left = safeTotal - used;

    calculated.sort((a, b) => b.remainder - a.remainder);

    for (let i = 0; i < calculated.length && left > 0; i++) {
      calculated[i].value += 1;
      left--;
    }

    const result = { c: 0, dt: 0, kiosk: 0, delivery: 0 };

    calculated.forEach((item) => {
      result[item.key] = item.value;
    });

    return result;
  }

  function setInputValue(row, selector, value) {
    const el = row.querySelector(selector);
    if (!el) return;

    if (value === 0 || value === "0") {
      el.value = "";
    } else {
      el.value = value ?? "";
    }
  }

  function setText(root, selector, value) {
    const el = root.querySelector(selector);
    if (el) el.textContent = value;
  }

  function formatHour(hour) {
    const start = String(hour).padStart(2, "0");
    const end = String((hour + 1) % 24).padStart(2, "0");
    return `${start}-${end}`;
  }

  function getTodayLocalDate() {
    const now = new Date();
    const tzOffset = now.getTimezoneOffset() * 60000;
    return new Date(now - tzOffset).toISOString().split("T")[0];
  }

  function getCurrentShiftDate() {
    const globalShiftDate = document.getElementById("shiftDate")?.value;
    return globalShiftDate || getTodayLocalDate();
  }

  function setStatus(message, isError = false) {
    hourlyStatus.textContent = message;
    hourlyStatus.style.color = isError ? "#c62828" : "#555";
  }
}