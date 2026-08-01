const SPREADSHEET_ID = "1pT8L0Eq-x-My6UmcgjmHOZmk19WgiNXxLZ_n4Bq6MB8";

const SHEETS = {
  guild: "길드원👥",
  weekly: "주간통계📊",
  total: "전체통계🏆",
  distribution: "분배💎",
  kills: "킬통계"
};

function csvUrl(sheetName) {
  return `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
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
      if (quoted && next === '"') { cell += '"'; i += 1; }
      else quoted = !quoted;
    } else if (ch === "," && !quoted) {
      row.push(cell); cell = "";
    } else if ((ch === "\n" || ch === "\r") && !quoted) {
      if (ch === "\r" && next === "\n") i += 1;
      row.push(cell);
      if (row.some((value) => value !== "")) rows.push(row);
      row = []; cell = "";
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((value) => value !== "")) rows.push(row);
  return rows;
}

const clean = (value) => String(value ?? "").replace(/\u00a0/g, " ").trim();
function numberValue(value) {
  const parsed = Number(clean(value).replace(/,/g, "").replace(/%/g, "").replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}
function findHeaderIndex(rows, matcher = /닉네임|게임닉네임/) {
  return rows.findIndex((row) => row.some((value) => matcher.test(clean(value))));
}
async function fetchSheet(sheetName, optional = false) {
  const response = await fetch(csvUrl(sheetName), { headers: { "User-Agent": "SOL-Sindeullin-Website/1.0" } });
  if (!response.ok) {
    if (optional) return [];
    throw new Error(`${sheetName} 시트를 읽지 못했습니다. (${response.status})`);
  }
  return parseCsv(await response.text());
}

function readMembers(rows) {
  return rows.slice(2).map((row) => ({
    number: numberValue(row[0]),
    nickname: clean(row[1]),
    jobClass: clean(row[2]),
    status: clean(row[3])
  })).filter((m) => m.nickname && m.status !== "탈퇴")
    .sort((a, b) => a.number - b.number);
}

function readWeekly(rows) {
  const headerIndex = findHeaderIndex(rows);
  if (headerIndex < 0) return [];
  return rows.slice(headerIndex + 1).map((row) => ({
    nickname: clean(row[0]), boss: numberValue(row[1]), guerrilla: numberValue(row[2]),
    weeklyKill: numberValue(row[3]), weeklyScore: numberValue(row[4]),
    bossRate: clean(row[5]) || "0%", distributionTarget: clean(row[6]),
    recentDistribution: numberValue(row[7])
  })).filter((item) => item.nickname);
}

function readTotal(rows) {
  const headerIndex = findHeaderIndex(rows);
  if (headerIndex < 0) return [];
  return rows.slice(headerIndex + 1).map((row) => ({
    nickname: clean(row[0]), boss: numberValue(row[1]), guerrilla: numberValue(row[2]),
    totalKill: numberValue(row[3]), totalScore: numberValue(row[4]),
    bossRate: clean(row[5]) || "0%"
  })).filter((item) => item.nickname);
}

function readGenericTable(rows) {
  const headerIndex = findHeaderIndex(rows, /닉네임|게임닉네임|날짜|회차/);
  if (headerIndex < 0) return { headers: [], rows: [] };
  const headers = rows[headerIndex].map(clean);
  const dataRows = rows.slice(headerIndex + 1)
    .filter((row) => row.some((value) => clean(value)))
    .map((row) => headers.map((_, index) => clean(row[index])));
  return { headers, rows: dataRows };
}

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=300");
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  try {
    const [guildRows, weeklyRows, totalRows, distributionRows, killRows] = await Promise.all([
      fetchSheet(SHEETS.guild), fetchSheet(SHEETS.weekly), fetchSheet(SHEETS.total),
      fetchSheet(SHEETS.distribution, true), fetchSheet(SHEETS.kills, true)
    ]);

    const members = readMembers(guildRows);
    const activeNicknames = new Set(members.map((m) => m.nickname));
    const weekly = readWeekly(weeklyRows).filter((i) => activeNicknames.has(i.nickname));
    const total = readTotal(totalRows).filter((i) => activeNicknames.has(i.nickname));
    const weeklyMap = new Map(weekly.map((i) => [i.nickname, i]));
    const totalMap = new Map(total.map((i) => [i.nickname, i]));

    const memberDetails = members.map((member) => ({
      ...member,
      weeklyScore: weeklyMap.get(member.nickname)?.weeklyScore ?? 0,
      totalScore: totalMap.get(member.nickname)?.totalScore ?? 0,
      bossRate: weeklyMap.get(member.nickname)?.bossRate || totalMap.get(member.nickname)?.bossRate || "0%",
      weeklyKill: weeklyMap.get(member.nickname)?.weeklyKill ?? 0,
      totalKill: totalMap.get(member.nickname)?.totalKill ?? 0,
      recentDistribution: weeklyMap.get(member.nickname)?.recentDistribution ?? 0
    }));

    const mvp = [...memberDetails].sort((a, b) => b.totalScore - a.totalScore || a.nickname.localeCompare(b.nickname, "ko"))
      .slice(0, 3).map(({ nickname, totalScore }) => ({ nickname, totalScore }));

    return res.status(200).json({
      ok: true, updatedAt: new Date().toISOString(), memberCount: members.length,
      mvp, members: memberDetails, weekly, total,
      distribution: readGenericTable(distributionRows), kills: readGenericTable(killRows)
    });
  } catch (error) {
    return res.status(500).json({ ok: false, message: error instanceof Error ? error.message : "구글 시트 연결 중 오류가 발생했습니다." });
  }
};
