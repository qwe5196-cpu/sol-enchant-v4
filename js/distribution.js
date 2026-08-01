const SPREADSHEET_ID = '1pT8L0Eq-x-My6UmcgjmHOZmk19WgiNXxLZ_n4Bq6MB8';
const WEEKLY_SHEETS = ['주간통계📊', '주간통계'];
const SALES_SHEETS = ['아이템분배🎁', '아이템분배'];
const SETTINGS_SHEETS = ['설정⚙️', '설정'];

const body = document.getElementById('distributionBody');
const search = document.getElementById('distributionSearch');
const sortSelect = document.getElementById('distributionSort');
let distributionRows = [];

function clean(value) { return String(value ?? '').replace(/\u00a0/g, ' ').trim(); }
function toNumber(value) { const n = Number(clean(value).replace(/,/g,'').replace(/%/g,'').replace(/[^0-9.-]/g,'')); return Number.isFinite(n) ? n : 0; }
function formatNumber(value) { return Math.floor(toNumber(value)).toLocaleString('ko-KR'); }
function formatRate(value) { const n=toNumber(value); return `${Number.isInteger(n)?n:n.toFixed(1)}%`; }
function escapeHtml(value) { return clean(value).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function parseCsv(text) {
  const rows=[]; let row=[], cell='', quoted=false;
  for(let i=0;i<text.length;i++){ const ch=text[i], next=text[i+1];
    if(ch==='"'){ if(quoted&&next==='"'){cell+='"';i++;}else quoted=!quoted; }
    else if(ch===','&&!quoted){row.push(cell);cell='';}
    else if((ch==='\n'||ch==='\r')&&!quoted){if(ch==='\r'&&next==='\n')i++;row.push(cell);if(row.some(v=>clean(v)))rows.push(row);row=[];cell='';}
    else cell+=ch;
  }
  row.push(cell); if(row.some(v=>clean(v)))rows.push(row); return rows;
}

async function fetchSheet(candidates) {
  let lastError;
  for (const sheet of candidates) {
    try {
      const url=`https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheet)}`;
      const response=await fetch(url,{cache:'no-store'});
      if(!response.ok) throw new Error(`${sheet}: ${response.status}`);
      const text=await response.text();
      if(/google\.visualization\.Query\.setResponse|<!doctype html/i.test(text)) throw new Error(`${sheet}: CSV 응답 아님`);
      const rows=parseCsv(text);
      if(!rows.length) throw new Error(`${sheet}: 빈 시트`);
      return rows;
    } catch(error){lastError=error;}
  }
  throw lastError || new Error('시트를 불러오지 못했습니다.');
}

function findHeader(rows, terms) { return rows.findIndex(row=>row.some(value=>terms.some(term=>clean(value).replace(/\s+/g,'').includes(term)))); }

function normalizeKey(value) {
  return clean(value).replace(/\s+/g,'').replace(/[：:]/g,'');
}

function readSettings(rows) {
  const settings = {};
  rows.forEach(row => {
    const key = normalizeKey(row[0]);
    if (!key || key === '항목') return;
    settings[key] = clean(row[1]);
  });

  const currentGuildDiamonds = toNumber(settings['현재길드다이아']);
  const previousGuildFund = toNumber(settings['이전길드자금']);
  const reserveRate = toNumber(settings['길드적립률'] || 30);
  const feeRate = toNumber(settings['거래수수료'] || 7);
  const distributionDay = clean(settings['분배일'] || '수요일 04:00~05:00');
  const operatingCost = toNumber(settings['운영비'] || 0);

  if (currentGuildDiamonds <= 0) {
    throw new Error('설정⚙️ 시트의 현재 길드 다이아를 확인해 주세요.');
  }

  return {
    currentGuildDiamonds,
    previousGuildFund,
    reserveRate,
    feeRate,
    distributionDay,
    operatingCost
  };
}

function readWeekly(rows) {
  const header=findHeader(rows,['닉네임','게임닉네임']);
  if(header<0) return [];
  return rows.slice(header+1).map(row=>({
    nickname:clean(row[0]), boss:toNumber(row[1]), guerrilla:toNumber(row[2]), kill:toNumber(row[3]), score:toNumber(row[4]), rate:toNumber(row[5]), target:clean(row[6]).toUpperCase()
  })).filter(item=>item.nickname);
}

function parseDate(value) {
  const text=clean(value).replace(/\./g,'-').replace(/\//g,'-');
  const match=text.match(/(20\d{2})-(\d{1,2})-(\d{1,2})/);
  if(match) return new Date(Number(match[1]),Number(match[2])-1,Number(match[3]));
  const short=text.match(/(\d{1,2})-(\d{1,2})/);
  if(short){const now=new Date();return new Date(now.getFullYear(),Number(short[1])-1,Number(short[2]));}
  return null;
}

function readSales(rows) {
  const header=findHeader(rows,['판매일']);
  if(header<0) return [];
  const headers=rows[header].map(v=>clean(v).replace(/\s+/g,''));
  const dateIndex=headers.findIndex(v=>v.includes('판매일'));
  const amountIndex=headers.findIndex(v=>v.includes('판매금액'));
  if(dateIndex<0||amountIndex<0) return [];
  return rows.slice(header+1).map(row=>({date:parseDate(row[dateIndex]),amount:toNumber(row[amountIndex])})).filter(item=>item.amount>0);
}

function largestRemainder(total, members) {
  const sum=members.reduce((acc,m)=>acc+m.score,0); if(total<=0||sum<=0)return new Map();
  const raw=members.map(m=>{const exact=total*m.score/sum;const base=Math.floor(exact);return {m,base,fraction:exact-base};});
  let remainder=total-raw.reduce((acc,x)=>acc+x.base,0);
  raw.sort((a,b)=>b.fraction-a.fraction||b.m.score-a.m.score||a.m.nickname.localeCompare(b.m.nickname,'ko'));
  const result=new Map(); raw.forEach((x,i)=>result.set(x.m.nickname,x.base+(i<remainder?1:0))); return result;
}

function render(rows) {
  if(!rows.length){body.innerHTML='<tr><td colspan="9">검색 결과가 없습니다.</td></tr>';return;}
  body.innerHTML=rows.map(item=>`<tr>
    <td>${escapeHtml(item.nickname)}</td><td>${formatNumber(item.boss)}</td><td>${formatNumber(item.guerrilla)}</td><td>${formatNumber(item.kill)}</td>
    <td class="weekly-score">${formatNumber(item.score)}</td><td>${formatRate(item.rate)}</td>
    <td><span class="target-badge ${item.target==='O'?'target-ok':'target-no'}">${item.target==='O'?'O':'X'}</span></td>
    <td>${formatNumber(item.expected)}</td><td class="confirmed-pay">${formatNumber(item.confirmed)}</td></tr>`).join('');
}

function applyFilters(){
  const keyword=clean(search.value).toLocaleLowerCase('ko-KR'); const sort=sortSelect.value;
  let rows=distributionRows.filter(x=>!keyword||x.nickname.toLocaleLowerCase('ko-KR').includes(keyword));
  rows=[...rows].sort((a,b)=>sort==='score'?b.score-a.score||a.nickname.localeCompare(b.nickname,'ko'):sort==='name'?a.nickname.localeCompare(b.nickname,'ko'):b.confirmed-a.confirmed||b.score-a.score||a.nickname.localeCompare(b.nickname,'ko'));
  render(rows);
}

async function load(){
  try{
    const [weeklyRaw,salesRaw,settingsRaw]=await Promise.all([fetchSheet(WEEKLY_SHEETS),fetchSheet(SALES_SHEETS),fetchSheet(SETTINGS_SHEETS)]);
    const weekly=readWeekly(weeklyRaw); const sales=readSales(salesRaw); const settings=readSettings(settingsRaw);
    const dated=sales.filter(x=>x.date instanceof Date&&!Number.isNaN(x.date.valueOf()));
    let periodSales=sales, periodText='판매 기록 전체';
    if(dated.length){
      const latest=new Date(Math.max(...dated.map(x=>x.date.valueOf()))); const start=new Date(latest); start.setDate(start.getDate()-6); start.setHours(0,0,0,0);
      const end=new Date(latest); end.setHours(23,59,59,999); periodSales=sales.filter(x=>x.date&&x.date>=start&&x.date<=end);
      const f=d=>`${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`; periodText=`${f(start)} ~ ${f(end)}`;
    }
    // 설정⚙️ 시트 값을 기준으로 자동 계산
    const grossNewSales=Math.max(0, Math.floor(settings.currentGuildDiamonds-settings.previousGuildFund));
    const totalSales=Math.max(0, grossNewSales-Math.floor(settings.operatingCost));
    const weeklyReserve=Math.floor(totalSales*(settings.reserveRate/100));
    const pool=Math.max(0,totalSales-weeklyReserve);
    const nextGuildFund=settings.previousGuildFund+weeklyReserve;
    const eligible=weekly.filter(x=>x.target==='O'&&x.score>0); const payments=largestRemainder(pool,eligible);
    distributionRows=weekly.map(x=>{const expected=x.target==='O'?(payments.get(x.nickname)||0):0;return {...x,expected,confirmed:Math.floor(expected*(1-settings.feeRate/100))};});
    const expectedTotal=distributionRows.reduce((a,x)=>a+x.expected,0); const confirmedTotal=distributionRows.reduce((a,x)=>a+x.confirmed,0);
    document.getElementById('totalSales').textContent=formatNumber(totalSales);
    document.getElementById('guildDiamonds').textContent=formatNumber(settings.currentGuildDiamonds);
    document.getElementById('previousGuildFund').textContent=formatNumber(settings.previousGuildFund);
    document.getElementById('weeklyReserve').textContent=formatNumber(weeklyReserve);
    document.getElementById('nextGuildFund').textContent=formatNumber(nextGuildFund);
    document.getElementById('distributionPool').textContent=formatNumber(pool);
    document.getElementById('eligibleCount').textContent=`${eligible.length.toLocaleString('ko-KR')}명`;
    document.getElementById('distributionPeriod').textContent=periodText;
    const distributionDayEl=document.getElementById('distributionDay');
    if(distributionDayEl) distributionDayEl.textContent=settings.distributionDay;
    document.getElementById('expectedTotal').textContent=formatNumber(expectedTotal);
    document.getElementById('confirmedTotal').textContent=formatNumber(confirmedTotal);
    applyFilters();
  }catch(error){body.innerHTML=`<tr><td colspan="9">${escapeHtml(error.message||'분배 정보를 불러오지 못했습니다.')}</td></tr>`;}
}
search.addEventListener('input',applyFilters); sortSelect.addEventListener('change',applyFilters); load();