const SPREADSHEET_ID = '1pT8L0Eq-x-My6UmcgjmHOZmk19WgiNXxLZ_n4Bq6MB8';
const WEEKLY_SHEETS = ['주간통계📊', '주간통계'];
const SALES_SHEETS = ['아이템분배🎁', '아이템분배'];
const SETTINGS_SHEETS = ['설정⚙️', '설정'];

const body = document.getElementById('distributionBody');
const search = document.getElementById('distributionSearch');
const sortSelect = document.getElementById('distributionSort');
const imageButton = document.getElementById('downloadDistributionImage');
let distributionRows = [];
let distributionMeta = null;

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


function fitCanvasText(ctx, text, maxWidth, baseSize, minSize=10) {
  let size = baseSize;
  ctx.font = `700 ${size}px Arial, "Noto Sans KR", sans-serif`;
  while (size > minSize && ctx.measureText(text).width > maxWidth) {
    size -= 1;
    ctx.font = `700 ${size}px Arial, "Noto Sans KR", sans-serif`;
  }
  return size;
}

function drawRoundedRect(ctx, x, y, width, height, radius, fill, stroke) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
  if (fill) { ctx.fillStyle = fill; ctx.fill(); }
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke(); }
}

function drawCenteredText(ctx, text, x, y, width, font, color='#ffffff') {
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(text), x + width / 2, y);
}

function createDistributionImage() {
  if (!distributionRows.length || !distributionMeta) {
    alert('분배 데이터를 먼저 불러와주세요.');
    return;
  }

  const originalButtonText = imageButton ? imageButton.textContent : '';
  if (imageButton) {
    imageButton.disabled = true;
    imageButton.textContent = '이미지 생성 중...';
  }

  try {

  const rows = [...distributionRows].sort((a,b)=>
    b.confirmed-a.confirmed || b.score-a.score || a.nickname.localeCompare(b.nickname,'ko')
  );

  const canvas = document.createElement('canvas');
  canvas.width = 2400;
  canvas.height = 1600;
  const ctx = canvas.getContext('2d');

  const bg = ctx.createLinearGradient(0, 0, 0, canvas.height);
  bg.addColorStop(0, '#05030a');
  bg.addColorStop(1, '#0b0611');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.strokeStyle = '#b88a2b';
  ctx.lineWidth = 3;
  ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);

  drawCenteredText(ctx, '📊  신들린 길드 주간 점수 비례 분배 내역', 0, 62, canvas.width, '900 42px Arial, "Noto Sans KR", sans-serif', '#ffe178');
  ctx.fillStyle = '#7c5c19';
  ctx.fillRect(450, 92, 1500, 2);

  const summaryY = 108;
  const summaryItems = [
    ['이번 주 신규 판매금', formatNumber(distributionMeta.totalSales)],
    ['운영비 30%', formatNumber(distributionMeta.weeklyReserve)],
    ['분배금 70%', formatNumber(distributionMeta.pool)],
    ['확정분배금 합계', formatNumber(distributionMeta.confirmedTotal)],
    ['분배 대상', `${distributionMeta.eligibleCount}명`],
  ];
  const summaryGap = 14;
  const summaryW = (canvas.width - 80 - summaryGap * 4) / 5;
  summaryItems.forEach((item, i) => {
    const x = 40 + i * (summaryW + summaryGap);
    drawRoundedRect(ctx, x, summaryY, summaryW, 78, 12, '#120a1d', '#6b3b8b');
    drawCenteredText(ctx, item[0], x, summaryY + 23, summaryW, '700 17px Arial, "Noto Sans KR", sans-serif', '#d9b8ee');
    drawCenteredText(ctx, item[1], x, summaryY + 54, summaryW, '900 27px Arial, "Noto Sans KR", sans-serif', i === 3 ? '#ffe55f' : '#ffffff');
  });

  const panelGap = 18;
  const panelX = 25;
  const panelY = 210;
  const panelW = (canvas.width - panelX * 2 - panelGap) / 2;
  const panelH = 630;
  const columns = [
    {key:'rank', label:'순위', ratio:.055},
    {key:'nickname', label:'닉네임', ratio:.19},
    {key:'boss', label:'보탐', ratio:.09},
    {key:'guerrilla', label:'게릴라', ratio:.09},
    {key:'kill', label:'킬점수', ratio:.08},
    {key:'score', label:'분배점수', ratio:.11},
    {key:'rate', label:'참여율', ratio:.10},
    {key:'target', label:'대상', ratio:.075},
    {key:'confirmed', label:'확정분배금', ratio:.21},
  ];

  const groups = [rows.slice(0,16), rows.slice(16,32), rows.slice(32,48), rows.slice(48,64)];
  groups.forEach((group, groupIndex) => {
    const col = groupIndex % 2;
    const row = Math.floor(groupIndex / 2);
    const x = panelX + col * (panelW + panelGap);
    const y = panelY + row * (panelH + panelGap);
    drawRoundedRect(ctx, x, y, panelW, panelH, 14, '#07060b', '#8a6423');

    const startRank = groupIndex * 16 + 1;
    const endRank = Math.min(startRank + 15, rows.length);
    drawRoundedRect(ctx, x + 14, y + 12, 130, 38, 8, '#29133c', '#714199');
    drawCenteredText(ctx, `${startRank} ~ ${endRank}위`, x + 14, y + 31, 130, '900 20px Arial, "Noto Sans KR", sans-serif', '#f2d9ff');

    const tableY = y + 60;
    const headerH = 38;
    ctx.fillStyle = '#21102f';
    ctx.fillRect(x + 1, tableY, panelW - 2, headerH);

    let cx = x + 8;
    const usableW = panelW - 16;
    columns.forEach(c => {
      const cw = usableW * c.ratio;
      drawCenteredText(ctx, c.label, cx, tableY + headerH / 2, cw, '800 15px Arial, "Noto Sans KR", sans-serif', '#e9baff');
      cx += cw;
    });

    const rowH = 31.5;
    group.forEach((item, localIndex) => {
      const ry = tableY + headerH + localIndex * rowH;
      if (localIndex % 2 === 1) {
        ctx.fillStyle = 'rgba(255,255,255,.018)';
        ctx.fillRect(x + 1, ry, panelW - 2, rowH);
      }
      ctx.strokeStyle = '#221d28';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x + 1, ry + rowH); ctx.lineTo(x + panelW - 1, ry + rowH); ctx.stroke();

      const values = {
        rank: startRank + localIndex,
        nickname: item.nickname,
        boss: formatNumber(item.boss),
        guerrilla: formatNumber(item.guerrilla),
        kill: formatNumber(item.kill),
        score: formatNumber(item.score),
        rate: formatRate(item.rate),
        target: item.target === 'O' ? 'O' : 'X',
        confirmed: formatNumber(item.confirmed),
      };

      let vx = x + 8;
      columns.forEach(c => {
        const cw = usableW * c.ratio;
        let color = '#ffffff';
        if (c.key === 'rank' || c.key === 'nickname') color = '#fff2a8';
        if (c.key === 'confirmed') color = '#ffe55f';
        if (c.key === 'target') color = item.target === 'O' ? '#66ef9a' : '#ff6f75';
        const value = String(values[c.key]);
        const base = c.key === 'nickname' ? 15 : 14;
        const size = fitCanvasText(ctx, value, cw - 8, base, 10);
        drawCenteredText(ctx, value, vx, ry + rowH / 2, cw, `800 ${size}px Arial, "Noto Sans KR", sans-serif`, color);
        vx += cw;
      });
    });
  });

  const footerY = 1505;
  drawCenteredText(ctx, `정산 기간  ${distributionMeta.periodText}   |   분배일  ${distributionMeta.distributionDay}`, 0, footerY, canvas.width, '700 20px Arial, "Noto Sans KR", sans-serif', '#bda6c8');
  drawCenteredText(ctx, '신들린 길드원 여러분, 이번 주도 고생하셨습니다!', 0, footerY + 42, canvas.width, '900 27px Arial, "Noto Sans KR", sans-serif', '#fff0b8');

  const link = document.createElement('a');
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
  link.download = `신들린_주간분배내역_${stamp}.png`;
  link.href = canvas.toDataURL('image/png');
  document.body.appendChild(link);
  link.click();
  link.remove();
  } catch (error) {
    console.error('분배 이미지 생성 오류:', error);
    alert(`이미지 생성 실패: ${error.message || error}`);
  } finally {
    if (imageButton) {
      imageButton.disabled = false;
      imageButton.textContent = originalButtonText || '📷 분배 내역 이미지 생성';
    }
  }
}

// 전역에서도 호출 가능하게 등록(캐시된 onclick 안전장치)
window.createDistributionImage = createDistributionImage;

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
    distributionMeta = {
      totalSales,
      weeklyReserve,
      pool,
      confirmedTotal,
      eligibleCount: eligible.length,
      periodText,
      distributionDay: settings.distributionDay
    };
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
search.addEventListener('input', applyFilters);
sortSelect.addEventListener('change', applyFilters);
load();