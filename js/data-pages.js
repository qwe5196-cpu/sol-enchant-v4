const API_URL = "/api/guild";
const page = document.body.dataset.page;
const body = document.getElementById("dataTableBody");
const head = document.getElementById("dataTableHead");
const search = document.getElementById("dataSearch");
let rowsForSearch = [];

const esc = (value) => String(value ?? "").replace(/[&<>'"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","'":"&#39;",'"':"&quot;"}[c]));
const fmt = (value) => typeof value === "number" ? value.toLocaleString("ko-KR") : esc(value);

function render(headers, rows) {
  head.innerHTML = `<tr>${headers.map((h) => `<th>${esc(h)}</th>`).join("")}</tr>`;
  rowsForSearch = rows.map((r) => r.map((v) => String(v ?? "")));
  draw(rowsForSearch);
}
function draw(rows) {
  if (!rows.length) { body.innerHTML = `<tr><td colspan="20">표시할 데이터가 없습니다.</td></tr>`; return; }
  body.innerHTML = rows.map((row) => `<tr>${row.map((v) => `<td>${fmt(v)}</td>`).join("")}</tr>`).join("");
}

async function load() {
  try {
    const response = await fetch(API_URL, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.message || "데이터를 불러오지 못했습니다.");

    if (page === "weekly") {
      render(["닉네임","보탐","게릴라","킬점수","분배점수","보스 참여율","분배대상","예상분배금"],
        data.weekly.map((i) => [i.nickname,i.boss,i.guerrilla,i.weeklyKill,i.weeklyScore,i.bossRate,i.distributionTarget,i.recentDistribution]));
    } else if (page === "total") {
      render(["닉네임","보탐","게릴라","킬점수","활동점수","보스 참여율"],
        data.total.map((i) => [i.nickname,i.boss,i.guerrilla,i.totalKill,i.totalScore,i.bossRate]));
    } else if (page === "distribution") {
      render(data.distribution.headers, data.distribution.rows);
    } else if (page === "kills") {
      render(data.kills.headers, data.kills.rows);
    }
  } catch (error) {
    body.innerHTML = `<tr><td colspan="20">${esc(error.message)}</td></tr>`;
  }
}

search?.addEventListener("input", () => {
  const key = search.value.trim().toLowerCase();
  draw(!key ? rowsForSearch : rowsForSearch.filter((row) => row.join(" ").toLowerCase().includes(key)));
});
load();
