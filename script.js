const DESIGN_WIDTH = 1920;
const DESIGN_HEIGHT = 1080;
const DATA_URL = '/api/guild';
const SPREADSHEET_ID = '1pT8L0Eq-x-My6UmcgjmHOZmk19WgiNXxLZ_n4Bq6MB8';
const SAVED_NICKNAME_KEY = 'solGuildNickname';

const SHEETS = {
  guild: '길드원👥',
  weekly: '주간통계📊',
  total: '전체통계🏆'
};

const $ = (id) => document.getElementById(id);

function resizeStage() {
  const stage = $('stage');
  const scale = Math.min(window.innerWidth / DESIGN_WIDTH, window.innerHeight / DESIGN_HEIGHT);
  stage.style.transform = `translateX(-50%) scale(${scale})`;
}
window.addEventListener('resize', resizeStage);
resizeStage();

function clean(value) {
  return String(value ?? '').replace(/\u00a0/g, ' ').trim();
}

function numberValue(value) {
  const parsed = Number(clean(value).replace(/,/g, '').replace(/%/g, '').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

function numberOnly(value) {
  if (value === '' || value === null || value === undefined || value === '-') return '';
  const n = numberValue(value);
  return Number.isInteger(n)
    ? n.toLocaleString('ko-KR')
    : n.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
}

function withUnit(value, unit) {
  const formatted = numberOnly(value);
  return formatted === '' ? '' : `${formatted}${unit}`;
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
      if (quoted && next === '"') { cell += '"'; i += 1; }
      else quoted = !quoted;
    } else if (ch === ',' && !quoted) {
      row.push(cell); cell = '';
    } else if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && next === '\n') i += 1;
      row.push(cell);
      if (row.some((value) => clean(value) !== '')) rows.push(row);
      row = []; cell = '';
    } else {
      cell += ch;
    }
  }
  row.push(cell);
  if (row.some((value) => clean(value) !== '')) rows.push(row);
  return rows;
}

function csvUrl(sheetName) {
  return `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
}

async function fetchSheet(sheetName) {
  const response = await fetch(csvUrl(sheetName), { cache: 'no-store' });
  if (!response.ok) throw new Error(`${sheetName} 시트를 읽지 못했습니다. (${response.status})`);
  return parseCsv(await response.text());
}

function findHeaderIndex(rows, matcher = /닉네임|게임닉네임/) {
  return rows.findIndex((row) => row.some((value) => matcher.test(clean(value))));
}

function readMembers(rows) {
  return rows.slice(2).map((row) => ({
    number: numberValue(row[0]),
    nickname: clean(row[1]),
    jobClass: clean(row[2]),
    status: clean(row[3])
  })).filter((member) => member.nickname && member.status !== '탈퇴')
    .sort((a, b) => a.number - b.number);
}

function readWeekly(rows) {
  const headerIndex = findHeaderIndex(rows);
  if (headerIndex < 0) return [];
  return rows.slice(headerIndex + 1).map((row) => ({
    nickname: clean(row[0]),
    weeklyKill: numberValue(row[3]),
    weeklyScore: numberValue(row[4]),
    bossRate: clean(row[5]) || '0%',
    recentDistribution: numberValue(row[7])
  })).filter((item) => item.nickname);
}

function readTotal(rows) {
  const headerIndex = findHeaderIndex(rows);
  if (headerIndex < 0) return [];
  return rows.slice(headerIndex + 1).map((row) => ({
    nickname: clean(row[0]),
    totalKill: numberValue(row[3]),
    totalScore: numberValue(row[4]),
    bossRate: clean(row[5]) || '0%'
  })).filter((item) => item.nickname);
}

function normalize(raw) {
  const members = Array.isArray(raw?.members) ? raw.members : [];
  const mvp = Array.isArray(raw?.mvp) && raw.mvp.length
    ? raw.mvp
    : [...members].sort((a, b) => Number(b.totalScore) - Number(a.totalScore)).slice(0, 3);

  return {
    memberCount: Number(raw?.memberCount) || members.length || 0,
    mvp,
    members
  };
}

async function loadDirectFromSheets() {
  const [guildRows, weeklyRows, totalRows] = await Promise.all([
    fetchSheet(SHEETS.guild),
    fetchSheet(SHEETS.weekly),
    fetchSheet(SHEETS.total)
  ]);

  const members = readMembers(guildRows);
  const weeklyMap = new Map(readWeekly(weeklyRows).map((item) => [item.nickname, item]));
  const totalMap = new Map(readTotal(totalRows).map((item) => [item.nickname, item]));

  const memberDetails = members.map((member) => ({
    ...member,
    weeklyScore: weeklyMap.get(member.nickname)?.weeklyScore ?? 0,
    totalScore: totalMap.get(member.nickname)?.totalScore ?? 0,
    bossRate: weeklyMap.get(member.nickname)?.bossRate || totalMap.get(member.nickname)?.bossRate || '0%',
    weeklyKill: weeklyMap.get(member.nickname)?.weeklyKill ?? 0,
    totalKill: totalMap.get(member.nickname)?.totalKill ?? 0,
    recentDistribution: weeklyMap.get(member.nickname)?.recentDistribution ?? 0
  }));

  const mvp = [...memberDetails]
    .sort((a, b) => b.totalScore - a.totalScore || a.nickname.localeCompare(b.nickname, 'ko'))
    .slice(0, 3)
    .map(({ nickname, totalScore }) => ({ nickname, totalScore }));

  return normalize({ memberCount: members.length, members: memberDetails, mvp });
}

function renderMvp(data) {
  for (let i = 0; i < 3; i += 1) {
    const row = data.mvp[i] || {};
    $(`mvp${i + 1}Name`).textContent = row.nickname || row.name || '-';
    $(`mvp${i + 1}Score`).textContent = numberOnly(row.totalScore) || '-';
  }
}

function clearProfile() {
  $('profileName').textContent = '';
  $('profileName').classList.remove('has-profile');
  $('weeklyScore').textContent = '';
  $('totalScore').textContent = '';
  $('bossRate').textContent = '';
  $('allKill').textContent = '';
  $('weekKill').textContent = '';
  $('latestPay').textContent = '';
}

function renderProfile(member) {
  if (!member) {
    clearProfile();
    return;
  }

  $('profileName').textContent = member.nickname || member.name || '';
  $('profileName').classList.add('has-profile');
  $('weeklyScore').textContent = withUnit(member.weeklyScore, '점');
  $('totalScore').textContent = withUnit(member.totalScore, '점');
  $('bossRate').textContent = withUnit(member.bossRate, '%');
  $('allKill').textContent = withUnit(member.totalKill ?? member.allKill, ' Kill');
  $('weekKill').textContent = withUnit(member.weeklyKill ?? member.weekKill, ' Kill');
  $('latestPay').textContent = numberOnly(member.recentDistribution ?? member.latestPay);
}

function normalizeNickname(value) {
  return clean(value).replace(/\s+/g, '').toLocaleLowerCase('ko-KR');
}

function findMember(data, query) {
  const key = normalizeNickname(query);
  if (!key) return null;

  return data.members.find((member) => normalizeNickname(member.nickname || member.name) === key)
    || data.members.find((member) => normalizeNickname(member.nickname || member.name).includes(key));
}

function saveNickname(nickname) {
  try { localStorage.setItem(SAVED_NICKNAME_KEY, nickname); } catch (_) {}
}

function readSavedNickname() {
  try { return localStorage.getItem(SAVED_NICKNAME_KEY) || ''; } catch (_) { return ''; }
}

function lookupAndRender(data, nickname, showAlert = true) {
  const member = findMember(data, nickname);
  if (!member) {
    if (showAlert) window.alert('해당 닉네임을 찾지 못했습니다.');
    return false;
  }

  renderProfile(member);
  saveNickname(member.nickname || nickname);
  return true;
}

function bindLookup(data) {
  $('profileTrigger').addEventListener('click', () => {
    const current = readSavedNickname();
    const nickname = window.prompt('조회할 닉네임을 입력해 주세요.', current);
    if (nickname === null) return;

    if (!lookupAndRender(data, nickname, true)) {
      clearProfile();
    }
  });
}

function bindRoutes() {
  const routes = {
    storage: 'storage.html',
    stats: 'stats.html',
    weekly: 'weekly.html',
    total: 'total.html',
    distribution: 'distribution.html',
    items: 'items.html'
  };

  document.querySelectorAll('[data-page]').forEach((el) => {
    el.addEventListener('click', () => {
      const target = routes[el.dataset.page];
      if (target) window.location.href = target;
    });
  });
}

async function loadData() {
  try {
    const response = await fetch(DATA_URL, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    if (!json?.ok || !Array.isArray(json.members) || json.members.length === 0) {
      throw new Error(json?.message || 'API 데이터가 비어 있습니다.');
    }
    return normalize(json);
  } catch (apiError) {
    console.warn('[SOL] API 연결 실패. 구글시트를 직접 읽습니다.', apiError);
    return loadDirectFromSheets();
  }
}

(async () => {
  bindRoutes();
  try {
    const data = await loadData();
    renderMvp(data);
    $('memberCount').textContent = numberOnly(data.memberCount) || '-';
    clearProfile();

    const savedNickname = readSavedNickname();
    if (savedNickname) lookupAndRender(data, savedNickname, false);

    bindLookup(data);
  } catch (error) {
    console.error('[SOL] 길드 데이터를 불러오지 못했습니다.', error);
    renderMvp({ mvp: [] });
    $('memberCount').textContent = '-';
    clearProfile();
    window.alert('구글시트 데이터를 불러오지 못했습니다. 시트 공개 설정을 확인해 주세요.');
  }
})();
