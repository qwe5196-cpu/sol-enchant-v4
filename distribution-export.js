(() => {
  'use strict';

  const button = document.getElementById('downloadDistributionImageV2');
  const status = document.getElementById('distributionImageStatus');
  const tableBody = document.getElementById('distributionBody');

  const setStatus = (message, isError = false) => {
    if (!status) return;
    status.textContent = message;
    status.style.color = isError ? '#ff7b87' : '#d8b8ef';
  };

  const clean = (value) => String(value ?? '').replace(/\u00a0/g, ' ').trim();
  const numberFromText = (value) => {
    const parsed = Number(clean(value).replace(/,/g, '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  };
  const formatNumber = (value) => Math.floor(numberFromText(value)).toLocaleString('ko-KR');

  function roundRect(ctx, x, y, w, h, r, fill, stroke) {
    const radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke(); }
  }

  function centerText(ctx, text, x, y, width, font, color = '#fff') {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(text), x + width / 2, y);
  }

  function fitFont(ctx, text, maxWidth, startSize, minSize = 10) {
    let size = startSize;
    while (size > minSize) {
      ctx.font = `700 ${size}px Arial, "Noto Sans KR", sans-serif`;
      if (ctx.measureText(String(text)).width <= maxWidth) break;
      size -= 1;
    }
    return size;
  }

  function readVisibleDistributionRows() {
    if (!tableBody) return [];
    return [...tableBody.querySelectorAll('tr')].map((tr) => {
      const cells = [...tr.querySelectorAll('td')].map((td) => clean(td.textContent));
      if (cells.length < 9) return null;
      return {
        nickname: cells[0],
        boss: cells[1],
        guerrilla: cells[2],
        kill: cells[3],
        score: cells[4],
        rate: cells[5],
        target: cells[6].toUpperCase().includes('O') ? 'O' : 'X',
        expected: cells[7],
        confirmed: cells[8],
      };
    }).filter(Boolean);
  }

  function readSummary() {
    const get = (id, fallback = '-') => clean(document.getElementById(id)?.textContent) || fallback;
    return {
      totalSales: get('totalSales'),
      weeklyReserve: get('weeklyReserve'),
      distributionPool: get('distributionPool'),
      confirmedTotal: get('confirmedTotal'),
      eligibleCount: get('eligibleCount'),
      period: get('distributionPeriod'),
      day: get('distributionDay'),
    };
  }

  function drawPanel(ctx, rows, panelIndex, x, y, w, h) {
    roundRect(ctx, x, y, w, h, 14, '#07060b', '#8a6423');
    const startRank = panelIndex * 16 + 1;
    const endRank = Math.min(startRank + Math.max(rows.length - 1, 0), 64);
    roundRect(ctx, x + 14, y + 12, 145, 38, 8, '#29133c', '#714199');
    centerText(ctx, `${startRank} ~ ${endRank}위`, x + 14, y + 31, 145, '900 20px Arial, "Noto Sans KR", sans-serif', '#f2d9ff');

    const columns = [
      ['rank', '순위', .055], ['nickname', '닉네임', .19], ['boss', '보탐', .09],
      ['guerrilla', '게릴라', .09], ['kill', '킬점수', .08], ['score', '분배점수', .11],
      ['rate', '참여율', .10], ['target', '대상', .075], ['confirmed', '확정분배금', .21],
    ];
    const tableY = y + 60;
    const headerH = 38;
    const usableW = w - 16;
    ctx.fillStyle = '#21102f';
    ctx.fillRect(x + 1, tableY, w - 2, headerH);
    let cursorX = x + 8;
    columns.forEach(([, label, ratio]) => {
      const cw = usableW * ratio;
      centerText(ctx, label, cursorX, tableY + headerH / 2, cw, '800 15px Arial, "Noto Sans KR", sans-serif', '#e9baff');
      cursorX += cw;
    });

    const rowH = 31.5;
    rows.forEach((item, i) => {
      const rowY = tableY + headerH + i * rowH;
      if (i % 2 === 1) { ctx.fillStyle = 'rgba(255,255,255,.018)'; ctx.fillRect(x + 1, rowY, w - 2, rowH); }
      ctx.strokeStyle = '#221d28';
      ctx.beginPath(); ctx.moveTo(x + 1, rowY + rowH); ctx.lineTo(x + w - 1, rowY + rowH); ctx.stroke();
      const values = { rank: startRank + i, ...item };
      let valueX = x + 8;
      columns.forEach(([key, , ratio]) => {
        const cw = usableW * ratio;
        const value = String(values[key] ?? '');
        let color = '#fff';
        if (key === 'rank' || key === 'nickname') color = '#fff2a8';
        if (key === 'confirmed') color = '#ffe55f';
        if (key === 'target') color = item.target === 'O' ? '#66ef9a' : '#ff6f75';
        const size = fitFont(ctx, value, cw - 8, key === 'nickname' ? 15 : 14, 10);
        centerText(ctx, value, valueX, rowY + rowH / 2, cw, `800 ${size}px Arial, "Noto Sans KR", sans-serif`, color);
        valueX += cw;
      });
    });
  }

  async function generateDistributionImage() {
    if (!button) return;
    const original = button.textContent;
    button.disabled = true;
    button.textContent = '이미지 만드는 중...';
    setStatus('표 데이터를 확인하는 중...');

    try {
      const rows = readVisibleDistributionRows();
      if (!rows.length) throw new Error('분배 표 데이터가 없습니다. 표 로딩이 끝난 뒤 다시 눌러주세요.');
      const summary = readSummary();
      setStatus(`총 ${rows.length}명의 분배 내역을 이미지로 만드는 중...`);

      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      const canvas = document.createElement('canvas');
      canvas.width = 2400;
      canvas.height = 1600;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('브라우저에서 Canvas를 사용할 수 없습니다.');

      const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
      gradient.addColorStop(0, '#05030a'); gradient.addColorStop(1, '#0b0611');
      ctx.fillStyle = gradient; ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = '#b88a2b'; ctx.lineWidth = 3; ctx.strokeRect(10, 10, 2380, 1580);
      centerText(ctx, '신들린 길드 주간 점수 비례 분배 내역', 0, 62, 2400, '900 42px Arial, "Noto Sans KR", sans-serif', '#ffe178');
      ctx.fillStyle = '#7c5c19'; ctx.fillRect(450, 92, 1500, 2);

      const summaries = [
        ['이번 주 신규 판매금', summary.totalSales], ['운영비 30%', summary.weeklyReserve],
        ['분배금 70%', summary.distributionPool], ['확정분배금 합계', summary.confirmedTotal],
        ['분배 대상', summary.eligibleCount],
      ];
      const gap = 14, boxY = 108, boxW = (2400 - 80 - gap * 4) / 5;
      summaries.forEach(([label, value], i) => {
        const x = 40 + i * (boxW + gap);
        roundRect(ctx, x, boxY, boxW, 78, 12, '#120a1d', '#6b3b8b');
        centerText(ctx, label, x, boxY + 23, boxW, '700 17px Arial, "Noto Sans KR", sans-serif', '#d9b8ee');
        centerText(ctx, value, x, boxY + 54, boxW, '900 27px Arial, "Noto Sans KR", sans-serif', i === 3 ? '#ffe55f' : '#fff');
      });

      const panelGap = 18, panelX = 25, panelY = 210;
      const panelW = (2400 - panelX * 2 - panelGap) / 2, panelH = 630;
      const groups = [rows.slice(0,16), rows.slice(16,32), rows.slice(32,48), rows.slice(48,64)];
      groups.forEach((group, i) => drawPanel(ctx, group, i, panelX + (i % 2) * (panelW + panelGap), panelY + Math.floor(i / 2) * (panelH + panelGap), panelW, panelH));

      centerText(ctx, `정산 기간  ${summary.period}   |   분배일  ${summary.day}`, 0, 1505, 2400, '700 20px Arial, "Noto Sans KR", sans-serif', '#bda6c8');
      centerText(ctx, '신들린 길드원 여러분, 이번 주도 고생하셨습니다!', 0, 1547, 2400, '900 27px Arial, "Noto Sans KR", sans-serif', '#fff0b8');

      const blob = await new Promise((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error('PNG 변환 실패')), 'image/png'));
      const url = URL.createObjectURL(blob);
      const now = new Date();
      const stamp = `${now.getFullYear()}${String(now.getMonth()+1).padStart(2,'0')}${String(now.getDate()).padStart(2,'0')}`;
      const link = document.createElement('a');
      link.href = url; link.download = `신들린_주간분배내역_${stamp}.png`;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 3000);
      setStatus('PNG 다운로드 완료');
    } catch (error) {
      console.error('[분배 이미지 생성 오류]', error);
      setStatus(`오류: ${error.message || error}`, true);
      alert(`분배 이미지 생성 실패\n${error.message || error}`);
    } finally {
      button.disabled = false;
      button.textContent = original || '📷 분배 내역 이미지 생성';
    }
  }

  if (!button) {
    console.error('[분배 이미지] 버튼을 찾지 못했습니다.');
    return;
  }
  button.addEventListener('click', generateDistributionImage);
  window.generateDistributionImage = generateDistributionImage;
  setStatus('이미지 생성 준비 완료');
})();
