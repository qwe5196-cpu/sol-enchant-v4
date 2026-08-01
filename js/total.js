const API_URL = '/api/guild';
const SPREADSHEET_ID = '1pT8L0Eq-x-My6UmcgjmHOZmk19WgiNXxLZ_n4Bq6MB8';
const TOTAL_SHEET = '전체통계🏆';

const body = document.getElementById('totalTableBody');
const count = document.getElementById('totalCount');
const search = document.getElementById('totalSearch');
const sortSelect = document.getElementById('totalSort');

let totalRows = [];

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

function normalizeTotal(items) {
  return (Array.isArray(items) ? items : [])
    .map((item) => ({
      nickname: clean(item.nickname),
      boss: toNumber(item.boss),
      guerrilla: toNumber(item.guerrilla),
      totalKill: toNumber(item.totalKill),
      totalScore: toNumber(item.totalScore),
      bossRate: toNumber(item.bossRate)
    }))
    .filter((item) => item.nickname);
}

function readTotalFromCsv(rows) {
  const headerIndex = rows.findIndex((row) => row.some((value) => /닉네임|게임닉네임/.test(clean(value))));
  if (headerIndex < 0) return [];

  return normalizeTotal(rows.slice(headerIndex + 1).map((row) => ({
    nickname: row[0],
    boss: row[1],
    guerrilla: row[2],
    totalKill: row[3],
    totalScore: row[4],
    bossRate: row[5]
  })));
}

async function loadFromApi() {
  const response = await fetch(API_URL, { cache: 'no-store' });
  const type = response.headers.get('content-type') || '';
  if (!type.includes('application/json')) throw new Error('로컬 환경에서는 API를 사용할 수 없습니다.');

  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.message || '전체 통계를 불러오지 못했습니다.');
  return normalizeTotal(data.total);
}

async function loadDirectlyFromGoogleSheet() {
  const url = `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(TOTAL_SHEET)}`;
  const response = await fetch(url, { cache: 'no-store' });
  if (!response.ok) throw new Error(`구글시트를 불러오지 못했습니다. (${response.status})`);
  return readTotalFromCsv(parseCsv(await response.text()));
}

function formatNumber(value) {
  return toNumber(value).toLocaleString('ko-KR');
}

function formatRate(value) {
  const number = toNumber(value);
  return `${Number.isInteger(number) ? number : number.toFixed(1)}%`;
}

function rankingClass(rank) {
  if (rank === 1) return 'rank-first';
  if (rank === 2) return 'rank-second';
  if (rank === 3) return 'rank-third';
  return '';
}

function render(rows) {
  count.textContent = rows.length.toLocaleString('ko-KR');

  if (!rows.length) {
    body.innerHTML = '<tr><td colspan="7">검색 결과가 없습니다.</td></tr>';
    return;
  }

  body.innerHTML = rows.map((item, index) => {
    const rank = index + 1;
    return `<tr>
      <td><span class="rank-badge ${rankingClass(rank)}">${rank}</span></td>
      <td>${item.nickname}</td>
      <td>${formatNumber(item.boss)}</td>
      <td>${formatNumber(item.guerrilla)}</td>
      <td>${formatNumber(item.totalKill)}</td>
      <td class="total-score">${formatNumber(item.totalScore)}</td>
      <td>${formatRate(item.bossRate)}</td>
    </tr>`;
  }).join('');
}

function applyFilters() {
  const keyword = clean(search.value).toLocaleLowerCase('ko-KR');
  const sort = sortSelect.value;

  let rows = totalRows.filter((item) => !keyword || item.nickname.toLocaleLowerCase('ko-KR').includes(keyword));

  rows = [...rows].sort((a, b) => {
    if (sort === 'score') return b.totalScore - a.totalScore || b.bossRate - a.bossRate || a.nickname.localeCompare(b.nickname, 'ko');
    if (sort === 'rate') return b.bossRate - a.bossRate || b.totalScore - a.totalScore || a.nickname.localeCompare(b.nickname, 'ko');
    if (sort === 'kill') return b.totalKill - a.totalKill || b.totalScore - a.totalScore || a.nickname.localeCompare(b.nickname, 'ko');
    return a.nickname.localeCompare(b.nickname, 'ko');
  });

  render(rows);
}

async function loadTotal() {
  body.innerHTML = '<tr><td colspan="7">전체 통계를 불러오는 중...</td></tr>';

  try {
    try {
      totalRows = await loadFromApi();
    } catch (apiError) {
      console.info('[전체통계] 로컬 실행으로 판단해 구글시트에서 직접 불러옵니다.', apiError);
      totalRows = await loadDirectlyFromGoogleSheet();
    }
    applyFilters();
  } catch (error) {
    count.textContent = '-';
    body.innerHTML = `<tr><td colspan="7">${clean(error.message) || '전체 통계를 불러오지 못했습니다.'}</td></tr>`;
  }
}

search.addEventListener('input', applyFilters);
sortSelect.addEventListener('change', applyFilters);
loadTotal();
