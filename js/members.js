const API_URL = "/api/guild";
const SPREADSHEET_ID = "1pT8L0Eq-x-My6UmcgjmHOZmk19WgiNXxLZ_n4Bq6MB8";
const GUILD_SHEET = "길드원👥";

let allMembers = [];
let selectedJob = "전체";

const tableBody = document.getElementById("memberTableBody");
const count = document.getElementById("membersPageCount");
const search = document.getElementById("memberSearch");
const filterButtons = [...document.querySelectorAll(".member-filter")];

function safeText(value) {
  return String(value ?? "").trim();
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];

    if (ch === '"') {
      if (quoted && next === '"') {
        cell += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (ch === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && next === "\n") i += 1;
      row.push(cell);
      if (row.some((value) => safeText(value))) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += ch;
    }
  }

  row.push(cell);
  if (row.some((value) => safeText(value))) rows.push(row);
  return rows;
}

function readMembersFromRows(rows) {
  return rows
    .slice(2)
    .map((row, index) => ({
      number: Number(String(row[0] ?? "").replace(/[^0-9.-]/g, "")) || index + 1,
      nickname: safeText(row[1]),
      jobClass: safeText(row[2]),
      status: safeText(row[3])
    }))
    .filter((member) => member.nickname && !safeText(member.status).replace(/\s+/g, "").includes("탈퇴"))
    .sort((a, b) => a.number - b.number || a.nickname.localeCompare(b.nickname, "ko"));
}

async function loadFromApi() {
  const response = await fetch(API_URL, { cache: "no-store" });
  const contentType = response.headers.get("content-type") || "";

  if (!contentType.includes("application/json")) {
    throw new Error("로컬 환경에서는 API를 사용할 수 없습니다.");
  }

  const data = await response.json();

  if (!response.ok || !data.ok) {
    throw new Error(data.message || "데이터를 불러오지 못했습니다.");
  }

  return Array.isArray(data.members) ? data.members : [];
}

async function loadDirectlyFromGoogleSheet() {
  const url =
    `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq` +
    `?tqx=out:csv&sheet=${encodeURIComponent(GUILD_SHEET)}`;

  const response = await fetch(url, { cache: "no-store" });

  if (!response.ok) {
    throw new Error(`구글시트를 불러오지 못했습니다. (${response.status})`);
  }

  return readMembersFromRows(parseCsv(await response.text()));
}

function renderMembers(members) {
  tableBody.innerHTML = "";

  if (!members.length) {
    tableBody.innerHTML = '<tr><td colspan="3">검색 결과가 없습니다.</td></tr>';
    return;
  }

  members.forEach((member, index) => {
    const row = document.createElement("tr");

    const numberCell = document.createElement("td");
    const nicknameCell = document.createElement("td");
    const jobCell = document.createElement("td");

    numberCell.textContent = member.number || index + 1;
    nicknameCell.textContent = safeText(member.nickname);
    jobCell.textContent = safeText(member.jobClass || member.job) || "-";

    row.append(numberCell, nicknameCell, jobCell);
    tableBody.appendChild(row);
  });
}

function applyFilters() {
  const keyword = safeText(search.value).toLocaleLowerCase("ko-KR");

  const filtered = allMembers.filter((member) => {
    const nickname = safeText(member.nickname).toLocaleLowerCase("ko-KR");
    const jobClass = safeText(member.jobClass || member.job);

    const matchesSearch = !keyword || nickname.includes(keyword);
    const matchesJob = selectedJob === "전체" || jobClass === selectedJob;

    return matchesSearch && matchesJob;
  });

  renderMembers(filtered);
}

async function loadMembers() {
  tableBody.innerHTML = '<tr><td colspan="3">길드원 정보를 불러오는 중...</td></tr>';

  try {
    try {
      allMembers = await loadFromApi();
    } catch (apiError) {
      console.info("[길드원] 로컬 실행으로 판단해 구글시트에서 직접 불러옵니다.", apiError);
      allMembers = await loadDirectlyFromGoogleSheet();
    }

    allMembers = allMembers
      .filter((member) => safeText(member.nickname))
      .filter((member) => !safeText(member.status).replace(/\s+/g, "").includes("탈퇴"))
      .sort((a, b) => {
        const numberA = Number(a.number) || Number.MAX_SAFE_INTEGER;
        const numberB = Number(b.number) || Number.MAX_SAFE_INTEGER;
        return numberA - numberB || safeText(a.nickname).localeCompare(safeText(b.nickname), "ko");
      });

    count.textContent = allMembers.length.toLocaleString("ko-KR");
    applyFilters();
  } catch (error) {
    count.textContent = "-";
    tableBody.innerHTML =
      `<tr><td colspan="3">${safeText(error.message) || "길드원 정보를 불러오지 못했습니다."}</td></tr>`;
  }
}

search.addEventListener("input", applyFilters);

filterButtons.forEach((button) => {
  button.addEventListener("click", () => {
    selectedJob = button.dataset.job || "전체";
    filterButtons.forEach((item) => item.classList.toggle("active", item === button));
    applyFilters();
  });
});

loadMembers();
