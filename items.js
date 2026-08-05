const SPREADSHEET_ID = "1pT8L0Eq-x-My6UmcgjmHOZmk19WgiNXxLZ_n4Bq6MB8";
const ITEM_SHEETS = ["아이템분배🎁", "아이템분배"];

let allSales = [];
let latestBuyerRows = new Set();

const tableBody = document.getElementById("itemTableBody");
const searchInput = document.getElementById("itemSearch");
const sortSelect = document.getElementById("itemSort");
const countEl = document.getElementById("itemSaleCount");

function clean(value) {
  return String(value ?? "").trim();
}

function toNumber(value) {
  const number = Number(clean(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(number) ? number : 0;
}

function formatNumber(value) {
  return Math.floor(toNumber(value)).toLocaleString("ko-KR");
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];

    if (char === '"') {
      if (quoted && next === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => clean(value))) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell);
  if (row.some((value) => clean(value))) rows.push(row);
  return rows;
}

function parseDateValue(value) {
  const text = clean(value);
  if (!text) return 0;

  const normalized = text
    .replace(/[.년]/g, "-")
    .replace(/[월]/g, "-")
    .replace(/[일]/g, "")
    .replace(/\//g, "-")
    .replace(/\s+/g, " ")
    .trim();

  const parsed = Date.parse(normalized);
  if (Number.isFinite(parsed)) return parsed;

  const match = normalized.match(/(\d{1,2})-(\d{1,2})/);
  if (match) {
    const now = new Date();
    return new Date(now.getFullYear(), Number(match[1]) - 1, Number(match[2])).getTime();
  }
  return 0;
}

function rowsToSales(rows) {
  return rows
    .slice(3)
    .map((row, index) => {
      const padded = [...row, ...Array(Math.max(0, 9 - row.length)).fill("")];
      return {
        rowKey: index,
        number: toNumber(padded[0]) || index + 1,
        saleDate: clean(padded[1]),
        dateValue: parseDateValue(padded[1]),
        itemName: clean(padded[2]),
        grade: clean(padded[3]),
        type: clean(padded[4]),
        job: clean(padded[5]),
        buyer: clean(padded[6]),
        amount: toNumber(padded[7]),
        warehouseNumber: clean(padded[8])
      };
    })
    .filter((sale) => sale.itemName && sale.buyer);
}

async function loadSheet(sheetName) {
  const url =
    `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq` +
    `?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`${sheetName} 시트를 불러오지 못했습니다.`);
  return rowsToSales(parseCsv(await response.text()));
}

async function loadSales() {
  let lastError;
  for (const sheetName of ITEM_SHEETS) {
    try {
      const sales = await loadSheet(sheetName);
      if (sales.length || sheetName === ITEM_SHEETS.at(-1)) return sales;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error("아이템 분배 시트를 찾지 못했습니다.");
}

function calculateLatestBuyerRows(sales) {
  latestBuyerRows = new Set();
  const seen = new Set();

  [...sales]
    .sort((a, b) => b.dateValue - a.dateValue || b.number - a.number)
    .forEach((sale) => {
      const buyerKey = sale.buyer.replace(/\s+/g, "").toLocaleLowerCase("ko-KR");
      if (!seen.has(buyerKey)) {
        seen.add(buyerKey);
        latestBuyerRows.add(sale.rowKey);
      }
    });
}

function getFilteredSales() {
  const keyword = clean(searchInput.value).toLocaleLowerCase("ko-KR");
  const filtered = allSales.filter((sale) => {
    if (!keyword) return true;
    return (
      sale.itemName.toLocaleLowerCase("ko-KR").includes(keyword) ||
      sale.buyer.toLocaleLowerCase("ko-KR").includes(keyword) ||
      sale.job.toLocaleLowerCase("ko-KR").includes(keyword)
    );
  });

  const mode = sortSelect.value;
  filtered.sort((a, b) => {
    if (mode === "price") return b.amount - a.amount || b.dateValue - a.dateValue;
    if (mode === "buyer") return a.buyer.localeCompare(b.buyer, "ko") || b.dateValue - a.dateValue;
    return b.dateValue - a.dateValue || b.number - a.number;
  });
  return filtered;
}

function makeCell(value, className = "") {
  const cell = document.createElement("td");
  cell.textContent = value;
  if (className) cell.className = className;
  return cell;
}

function render() {
  const sales = getFilteredSales();
  tableBody.innerHTML = "";

  if (!sales.length) {
    tableBody.innerHTML = '<tr><td colspan="9">검색 결과가 없습니다.</td></tr>';
    return;
  }

  sales.forEach((sale) => {
    const row = document.createElement("tr");
    row.append(
      makeCell(sale.number),
      makeCell(sale.saleDate || "-"),
      makeCell(sale.itemName, "item-name-cell"),
      makeCell(sale.grade || "-"),
      makeCell(sale.type || "-"),
      makeCell(sale.job || "-"),
      makeCell(sale.buyer, "buyer-cell"),
      makeCell(`${formatNumber(sale.amount)} 다이아`, "item-price-cell")
    );

    const historyCell = document.createElement("td");
    if (latestBuyerRows.has(sale.rowKey)) {
      const badge = document.createElement("span");
      badge.className = "recent-purchase-badge";
      badge.textContent = "최근 구매";
      historyCell.appendChild(badge);
    } else {
      historyCell.textContent = "-";
    }
    row.appendChild(historyCell);
    tableBody.appendChild(row);
  });
}

async function init() {
  try {
    allSales = await loadSales();
    calculateLatestBuyerRows(allSales);
    countEl.textContent = allSales.length.toLocaleString("ko-KR");
    render();
  } catch (error) {
    countEl.textContent = "-";
    tableBody.innerHTML = `<tr><td colspan="9">${clean(error.message) || "기록을 불러오지 못했습니다."}</td></tr>`;
  }
}

searchInput.addEventListener("input", render);
sortSelect.addEventListener("change", render);
init();
