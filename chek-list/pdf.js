function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function ensurePDFCSS(sectionName) {
  const id = `pdf-css-${sectionName}`;
  if (document.getElementById(id)) return;

  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = `sections/css/${sectionName}.css`;
  document.head.appendChild(link);
}

function removePDFButtons(root) {
  root.querySelectorAll("button").forEach(btn => btn.remove());
  root.querySelectorAll(".tab-btn, .pdf-btn").forEach(el => el.remove());
  root.querySelectorAll(".loading").forEach(el => el.remove());
}

function findSafeCutY(canvas, targetY, searchRange = 180) {
  const ctx = canvas.getContext("2d");
  const width = canvas.width;

  let bestY = targetY;
  let bestScore = -1;

  const start = Math.max(80, targetY - searchRange);
  const end = Math.min(canvas.height - 80, targetY + searchRange);

  for (let y = start; y <= end; y += 2) {
    const data = ctx.getImageData(0, y, width, 1).data;
    let score = 0;

    for (let x = 0; x < width; x += 10) {
      const i = x * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];

      if (
        (r > 220 && g > 220 && b > 220) ||
        (r > 180 && g > 210 && b > 190)
      ) {
        score++;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestY = y;
    }
  }

  return bestY;
}

function addCanvasToPDFSmart(pdf, canvas, pageWidth, pageHeight) {
  const imgHeight = (canvas.height * pageWidth) / canvas.width;

  if (imgHeight <= pageHeight) {
    const imgData = canvas.toDataURL("image/png");
    pdf.addImage(imgData, "PNG", 0, 0, pageWidth, imgHeight);
    return;
  }

  let sourceY = 0;
  const pagePixelHeight = Math.floor((pageHeight * canvas.width) / pageWidth);

  while (sourceY < canvas.height - 20) {
    let sliceHeight = pagePixelHeight;

    if (sourceY + sliceHeight < canvas.height) {
      const safeCutY = findSafeCutY(canvas, sourceY + sliceHeight, 200);
      sliceHeight = safeCutY - sourceY;
    } else {
      sliceHeight = canvas.height - sourceY;
    }

    if (sliceHeight < 300) {
      sliceHeight = Math.min(pagePixelHeight, canvas.height - sourceY);
    }

    const pageCanvas = document.createElement("canvas");
    pageCanvas.width = canvas.width;
    pageCanvas.height = sliceHeight;

    const pageCtx = pageCanvas.getContext("2d");
    pageCtx.drawImage(
      canvas,
      0,
      sourceY,
      canvas.width,
      sliceHeight,
      0,
      0,
      canvas.width,
      sliceHeight
    );

    const pageImgData = pageCanvas.toDataURL("image/png");
    const pageImgHeight = (sliceHeight * pageWidth) / canvas.width;

    pdf.addImage(pageImgData, "PNG", 0, 0, pageWidth, pageImgHeight);

    sourceY += sliceHeight;

    if (sourceY < canvas.height - 20) {
        pdf.addPage();
    }
  }
}

window.exportPDF = async function () {
  const { jsPDF } = window.jspdf;

  const oldSection = pageState.currentSection || "prep";

  const sections = [
    { key: "prep", title: "Подготовка к смене" },
    { key: "goals", title: "Цели и приоритеты" },
    { key: "hourly", title: "Почасовое планирование" },
    { key: "during", title: "В течение смены" },
    { key: "results", title: "Итоги смены" }
  ];

  sections.forEach(item => ensurePDFCSS(item.key));
  await wait(700);

  const pdfWrapper = document.createElement("div");
  pdfWrapper.id = "pdfExportArea";
  pdfWrapper.style.position = "absolute";
  pdfWrapper.style.left = "-9999px";
  pdfWrapper.style.top = "0";
  pdfWrapper.style.width = "1100px";
  pdfWrapper.style.background = "#ffffff";
  pdfWrapper.style.padding = "24px";
  pdfWrapper.style.boxSizing = "border-box";

  document.body.appendChild(pdfWrapper);

  for (const item of sections) {
    await loadSection(item.key);
    await wait(1000);

    const sectionBlock = document.createElement("div");
    sectionBlock.className = `pdf-section pdf-section-${item.key}`;
    sectionBlock.style.marginTop = "28px";

   

    const clonedContent = document.getElementById("content").cloneNode(true);
    clonedContent.removeAttribute("id");
    removePDFButtons(clonedContent);
    // ❌ описание (длинный текст сверху)
    clonedContent.querySelectorAll("p").forEach(el => {
    if (el.textContent.includes("Проверка перед началом смены")) {
        el.remove();
    }
    });

    // ❌ "Выбрать все" блок
    clonedContent.querySelectorAll("label, .checkbox-group, .select-all").forEach(el => {
    if (el.textContent.includes("Выбрать все")) {
        el.remove();
    }
    });
    
    // ✅ тек PREP-та ғана заголовок қалсын
    if (item.key !== "prep") {
    clonedContent.querySelectorAll("h1, h2, h3").forEach(el => el.remove());
    }

    if (item.key === "prep") {
    const headerClone = document.querySelector(".top-header").cloneNode(true);
    removePDFButtons(headerClone);
    sectionBlock.appendChild(headerClone);}

    // ❌ барлық артық верхний тексттерді алып тастау
    clonedContent.querySelectorAll("h1, h2, h3").forEach(el => el.remove());

    // ❌ дата / статус / верхние подписи сияқты элементтер
    clonedContent.querySelectorAll(
    ".date-box, .date-input, .loaded-text, .status-text, .section-header, .section-title, .page-title"
    ).forEach(el => el.remove());

    // ❌ текст бойынша "Данные загружены" алып тастау
    clonedContent.querySelectorAll("*").forEach(el => {
    const txt = el.textContent?.trim();
    if (txt === "Данные загружены") {
        el.remove();
    }
    });

    // ✅ тек нақты контент қалады
    sectionBlock.appendChild(clonedContent);
    pdfWrapper.appendChild(sectionBlock);
   }

  await wait(500);

  const pdf = new jsPDF("p", "mm", "a4");

  const pageWidth = 210;
  const pageHeight = 297;

  const blocks = pdfWrapper.querySelectorAll(".pdf-section");

  let firstPage = true;

  for (const block of blocks) {
    const canvas = await html2canvas(block, {
      scale: 2,
      useCORS: true,
      backgroundColor: "#ffffff",
      scrollX: 0,
      scrollY: 0
    });

    if (!firstPage) {
    pdf.addPage();
    }

    firstPage = false;

    addCanvasToPDFSmart(pdf, canvas, pageWidth, pageHeight);

   
  }

  document.body.removeChild(pdfWrapper);

  await loadSection(oldSection);

  const date = shiftDateInput.value || "no-date";
  pdf.save(`checklist-${date}.pdf`);
};