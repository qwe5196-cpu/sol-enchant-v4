(() => {
  'use strict';

  const BUTTON_ID = 'downloadDistributionImage';
  const STATUS_ID = 'distributionImageStatus';

  function numberText(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim();
  }

  function setStatus(message, type = '') {
    const el = document.getElementById(STATUS_ID);
    if (!el) return;
    el.textContent = message;
    el.dataset.state = type;
  }

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

  function centerText(ctx, text, x, y, w, font, color = '#fff') {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(text), x + w / 2, y);
  }

  function fitText(ctx, text, maxWidth, start = 15, min = 9) {
    let size = start;
    while (size > min) {
      ctx.font = `800 ${size}px Arial, "Noto Sans KR", sans-serif`;
      if (ctx.measureText(String(text)).width <= maxWidth) break;
      size -= 1;
    }
    return size;
  }

  function readRows() {
    return [...document.querySelectorAll('#distributionBody tr')]
      .map((tr) => [...tr.querySelectorAll('td')].map((td) => numberText(td.textContent)))
      .filter((cells) => cells.length >= 9 && cells[0] && !cells[0].includes('불러오는 중') && !cells[0].includes('검색 결과'))
      .map((cells, index) => ({
        rank: index + 1,
        nickname: cells[0],
        boss: cells[1],
        guerrilla: cells[2],
        kill: cells[3],
        score: cells[4],
        rate: cells[5],
        target: cells[6],
        expected: cells[7],
        confirmed: cells[8],
      }));
  }

  function readMeta() {
    const get = (id) => numberText(document.getElementById(id)?.textContent || '-');
    return {
      totalSales: get('totalSales'),
      pool: get('distributionPool'),
      reserve: get('weeklyReserve'),
      confirmedTotal: get('confirmedTotal'),
      eligibleCount: get('eligibleCount'),
      period: get('distributionPeriod'),
      day: get('distributionDay'),
    };
  }

  function canvasToBlob(canvas) {
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('PNG 변환에 실패했습니다.')), 'image/png');
    });
  }

  async function exportDistributionImage() {
    const button = document.getElementById(BUTTON_ID);
    const oldText = button?.textContent || '';

    try {
      if (button) {
        button.disabled = true;
        button.textContent = '이미지 생성 중...';
      }
      setStatus('분배 데이터를 확인하고 있습니다...', 'working');

      const rows = readRows();
      if (!rows.length) {
        throw new Error('분배 표가 아직 불러와지지 않았습니다. 잠시 후 다시 눌러주세요.');
      }
      const meta = readMeta();

      setStatus(`총 ${rows.length}명의 분배 내역을 이미지로 만드는 중...`, 'working');

      const canvas = document.createElement('canvas');
      canvas.width = 2400;
      canvas.height = 1600;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('브라우저에서 캔버스를 만들 수 없습니다.');

      const bg = ctx.createLinearGradient(0, 0, 0, canvas.height);
      bg.addColorStop(0, '#05030a');
      bg.addColorStop(1, '#0b0611');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.strokeStyle = '#b88a2b';
      ctx.lineWidth = 3;
      ctx.strokeRect(10, 10, canvas.width - 20, canvas.height - 20);

      centerText(ctx, '신들린 길드 주간 점수 비례 분배 내역', 0, 62, canvas.width, '900 42px Arial, "Noto Sans KR", sans-serif', '#ffe178');
      ctx.fillStyle = '#7c5c19';
      ctx.fillRect(450, 92, 1500, 2);

      const summary = [
        ['이번 주 신규 판매금', meta.totalSales],
        ['운영비 30%', meta.reserve],
        ['분배금 70%', meta.pool],
        ['확정분배금 합계', meta.confirmedTotal],
        ['분배 대상', meta.eligibleCount],
      ];
      const gap = 14;
      const cardW = (canvas.width - 80 - gap * 4) / 5;
      summary.forEach((item, i) => {
        const x = 40 + i * (cardW + gap);
        roundRect(ctx, x, 108, cardW, 78, 12, '#120a1d', '#6b3b8b');
        centerText(ctx, item[0], x, 131, cardW, '700 17px Arial, "Noto Sans KR", sans-serif', '#d9b8ee');
        centerText(ctx, item[1], x, 162, cardW, '900 27px Arial, "Noto Sans KR", sans-serif', i === 3 ? '#ffe55f' : '#fff');
      });

      const panelGap = 18;
      const panelX = 25;
      const panelY = 210;
      const panelW = (canvas.width - panelX * 2 - panelGap) / 2;
      const panelH = 630;
      const columns = [
        ['rank', '순위', .055], ['nickname', '닉네임', .19], ['boss', '보탐', .09],
        ['guerrilla', '게릴라', .09], ['kill', '킬점수', .08], ['score', '분배점수', .11],
        ['rate', '참여율', .10], ['target', '대상', .075], ['confirmed', '확정분배금', .21],
      ];

      [0, 1, 2, 3].forEach((groupIndex) => {
        const group = rows.slice(groupIndex * 16, groupIndex * 16 + 16);
        const col = groupIndex % 2;
        const rowIndex = Math.floor(groupIndex / 2);
        const x = panelX + col * (panelW + panelGap);
        const y = panelY + rowIndex * (panelH + panelGap);
        roundRect(ctx, x, y, panelW, panelH, 14, '#07060b', '#8a6423');

        const startRank = groupIndex * 16 + 1;
        const endRank = Math.min(startRank + 15, rows.length);
        roundRect(ctx, x + 14, y + 12, 140, 38, 8, '#29133c', '#714199');
        centerText(ctx, group.length ? `${startRank} ~ ${endRank}위` : '-', x + 14, y + 31, 140, '900 20px Arial, "Noto Sans KR", sans-serif', '#f2d9ff');

        const tableY = y + 60;
        const headerH = 38;
        ctx.fillStyle = '#21102f';
        ctx.fillRect(x + 1, tableY, panelW - 2, headerH);
        const usableW = panelW - 16;
        let cx = x + 8;
        columns.forEach(([, label, ratio]) => {
          const cw = usableW * ratio;
          centerText(ctx, label, cx, tableY + headerH / 2, cw, '800 15px Arial, "Noto Sans KR", sans-serif', '#e9baff');
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
          ctx.beginPath();
          ctx.moveTo(x + 1, ry + rowH);
          ctx.lineTo(x + panelW - 1, ry + rowH);
          ctx.stroke();

          let vx = x + 8;
          columns.forEach(([key, , ratio]) => {
            const cw = usableW * ratio;
            const value = key === 'rank' ? startRank + localIndex : item[key];
            let color = '#fff';
            if (key === 'rank' || key === 'nickname') color = '#fff2a8';
            if (key === 'confirmed') color = '#ffe55f';
            if (key === 'target') color = String(item.target).includes('O') ? '#66ef9a' : '#ff6f75';
            const size = fitText(ctx, value, cw - 8, key === 'nickname' ? 15 : 14, 9);
            centerText(ctx, value, vx, ry + rowH / 2, cw, `800 ${size}px Arial, "Noto Sans KR", sans-serif`, color);
            vx += cw;
          });
        });
      });

      centerText(ctx, `정산 기간  ${meta.period}   |   분배일  ${meta.day}`, 0, 1505, canvas.width, '700 20px Arial, "Noto Sans KR", sans-serif', '#bda6c8');
      centerText(ctx, '신들린 길드원 여러분, 이번 주도 고생하셨습니다!', 0, 1547, canvas.width, '900 27px Arial, "Noto Sans KR", sans-serif', '#fff0b8');

      const blob = await canvasToBlob(canvas);
      const url = URL.createObjectURL(blob);
      const now = new Date();
      const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
      const link = document.createElement('a');
      link.href = url;
      link.download = `신들린_주간분배내역_${stamp}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 3000);

      setStatus('PNG 다운로드가 완료되었습니다.', 'success');
    } catch (error) {
      console.error('[분배 이미지 생성]', error);
      setStatus(`오류: ${error.message || error}`, 'error');
      alert(`이미지 생성 실패\n${error.message || error}`);
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = oldText || '📷 분배 내역 이미지 생성';
      }
    }
  }

  function bind() {
    const button = document.getElementById(BUTTON_ID);
    if (!button) {
      console.error('[분배 이미지 생성] 버튼을 찾지 못했습니다.');
      return;
    }
    button.onclick = exportDistributionImage;
    window.exportDistributionImage = exportDistributionImage;
    setStatus('이미지 생성 기능 준비 완료', 'ready');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bind, { once: true });
  } else {
    bind();
  }
})();
