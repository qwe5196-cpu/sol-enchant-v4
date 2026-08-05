const API_URL = '/api/guild';
const SPREADSHEET_ID = '1pT8L0Eq-x-My6UmcgjmHOZmk19WgiNXxLZ_n4Bq6MB8';
const WEEKLY_SHEET = '주간통계📊';

const body = document.getElementById('dataTableBody');
const count = document.getElementById('weeklyCount');
const search = document.getElementById('dataSearch');
const sortSelect = document.getElementById('weeklySort');
const targetSelect = document.getElementById('targetFilter');

let weeklyRows = [];

function clean(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim();
}

function toNumber(value) {
  const parsed = Number(clean(value).replace(/,/g, '').replace(/%/g, '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
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
    } else if (ch === ',' && !quoted) {
      row.push(cell);
      cell = '';
    } else if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && next === '\n') i += 1;
      row.push(cell);
      if (row.some((value) => clean(value))) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }

  row.push(cell);
  if (row.some((value) => clean(value))) rows.push(row);
  return rows;
}

function normalizeWeekly(items) {
  return (Array.isArray(items) ? items : [])
    .map((item) => ({
      nickname: clean(item.nickname),
      boss: toNumber(item.boss),
      guerrilla: toNumber(item.guerrilla),
      weeklyKill: toNumber(item.weeklyKill),
      weeklyScore: toNumber(item.weeklyScore),
      bossRate: toNumber(item.bossRate),
      distributionTarget: clean(item.distributionTarget).toUpperCase(),
      recentDistribution: toNumber(item.recentDistribution)
    }))
    .filter((item) => item.nickname);
}

function readWeeklyFromCsv(rows) {
  const headerIndex = rows.findIndex((row) => row.some((value) => /닉네임|게임닉네임/.test(clean(value))));
  if (headerIndex < 0) return [];

  return normalizeWeekly(rows.slice(headerIndex + 1).map((row) => ({
    nickname: row[0],
    boss: row[1],
    guerrilla: row[2],
    weeklyKill: row[3],
    weeklyScore: row[4],
    bossRate: row[5],
    distributionTarget: row[6],
    recentDistribution: row[7]
  })));
}

async function loadFromApi() {
  const response = await fetch(API_URL, { cache: 'no-store' });
  const type = response.headers.get('content-type') || '';
  if (!type.includes('application/json')) throw new Error('로컬 환경에서는 API를 사용할 수 없습니다.');

  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.message || '주간 통계를 불러오지 못했습니다.');
  return normalizeWeekly(data.weekly);
}

async function loadDirectlyFromGoogleSheet() {
  const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(WEEKLY_SHEET)}`;
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`구글시트를 불러오지 못했습니다. (${response.status})`);
  return readWeeklyFromCsv(parseCsv(await response.text()));
}

function formatNumber(value) {
  return toNumber(value).toLocaleString('ko-KR');
}

function formatRate(value) {
  const number = toNumber(value);
  return `${Number.isInteger(number) ? number : number.toFixed(1)}%`;
}

function render(rows) {
  count.textContent = rows.length.toLocaleString('ko-KR');

  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="8">검색 결과가 없습니다.</td></tr>';
    return;
  }

  body.innerHTML = rows.map((item) => {
    const target = item.distributionTarget === 'O' ? 'O' : 'X';
    const targetClass = target === 'O' ? 'target-ok' : 'target-no';
    return `<tr>
      <td>${item.nickname}</td>
      <td>${formatNumber(item.boss)}</td>
      <td>${formatNumber(item.guerrilla)}</td>
      <td>${formatNumber(item.weeklyKill)}</td>
      <td class="weekly-score">${formatNumber(item.weeklyScore)}</td>
      <td>${formatRate(item.bossRate)}</td>
      <td><span class="target-badge ${targetClass}">${target}</span></td>
      <td>${formatNumber(item.recentDistribution)}</td>
    </tr>`;
  }).join('');
}

function applyFilters() {
  const keyword = clean(search.value).toLocaleLowerCase('ko-KR');
  const target = targetSelect.value;
  const sort = sortSelect.value;

  let rows = weeklyRows.filter((item) => {
    const matchesSearch = !keyword || item.nickname.toLocaleLowerCase('ko-KR').includes(keyword);
    const matchesTarget = target === '전체' || item.distributionTarget === target;
    return matchesSearch && matchesTarget;
  });

  rows = [...rows].sort((a, b) => {
    if (sort === 'score') return b.weeklyScore - a.weeklyScore || b.bossRate - a.bossRate || a.nickname.localeCompare(b.nickname, 'ko');
    if (sort === 'rate') return b.bossRate - a.bossRate || b.weeklyScore - a.weeklyScore || a.nickname.localeCompare(b.nickname, 'ko');
    if (sort === 'kill') return b.weeklyKill - a.weeklyKill || b.weeklyScore - a.weeklyScore || a.nickname.localeCompare(b.nickname, 'ko');
    return a.nickname.localeCompare(b.nickname, 'ko');
  });

  render(rows);
}

async function loadWeekly() {
  body.innerHTML = '<tr><td colspan="8">주간 통계를 불러오는 중...</td></tr>';

  try {
    try {
      weeklyRows = await loadFromApi();
    } catch (apiError) {
      console.info('[주간통계] 로컬 실행으로 판단해 구글시트에서 직접 불러옵니다.', apiError);
      weeklyRows = await loadDirectlyFromGoogleSheet();
    }
    applyFilters();
  } catch (error) {
    count.textContent = '-';
    body.innerHTML = `<tr><td colspan="8">${clean(error.message) || '주간 통계를 불러오지 못했습니다.'}</td></tr>`;
  }
}

search.addEventListener('input', applyFilters);
sortSelect.addEventListener('change', applyFilters);
targetSelect.addEventListener('change', applyFilters);
loadWeekly();
