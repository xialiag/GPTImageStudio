/* ==========================================================================
   GPTImage Studio — 图生图批处理模块
   独立模块，暴露 window.BatchMode = { init, isActive, getFiles, processNext, getResult, run }
   在"参考图"区域下方注入"批处理模式"开关与多图选择 UI。
   生成时逐张调用 app.js 的 generateImageEdit(prompt)，显示进度 1/N，
   每张原图旁展示生成结果，可逐个保存 / 全部保存。
   复用 app.css CSS 变量，纯 vanilla JS，触摸友好。
   ========================================================================== */
(function () {
  'use strict';

  // ===== 内部状态 =====
  const BM = {
    active: false,
    files: [],          // [{id,name,b64,thumb}]
    results: {},        // id -> [images]（app.js 返回的数组）
    running: false,
    index: 0,           // processNext 游标
    input: null,        // 隐藏的多选 file input
    _uid: 0,
  };

  let built = false;

  // ===== 工具 =====
  function $id(id) { return document.getElementById(id); }

  function fileToB64(file, cb) {
    const reader = new FileReader();
    reader.onload = ev => cb(ev.target.result);
    reader.readAsDataURL(file);
  }

  function addFiles(fileList) {
    const arr = Array.prototype.slice.call(fileList);
    arr.forEach(f => {
      if (!f.type.startsWith('image/')) return;
      fileToB64(f, dataUrl => {
        BM.files.push({ id: 'bm_' + (++BM._uid), name: f.name, b64: dataUrl.split(',')[1], thumb: dataUrl });
        renderGrid();
      });
    });
  }

  function removeFile(id) {
    BM.files = BM.files.filter(f => f.id !== id);
    delete BM.results[id];
    renderGrid();
    renderFooter();
    vibrate();
  }

  // ===== 注入 UI =====
  const BM_CSS = [
'.bm-sec{display:flex;flex-direction:column;gap:10px;}',
'.bm-head{display:flex;align-items:center;justify-content:space-between;gap:10px;}',
'.bm-head .label{margin:0;}',
'.bm-switch{position:relative;width:46px;height:26px;flex:0 0 auto;}',
'.bm-switch input{opacity:0;width:0;height:0;}',
'.bm-switch .track{position:absolute;inset:0;border-radius:var(--radius-pill);background:var(--bg-input);',
'  border:1px solid var(--border);transition:background var(--dur) var(--ease),border-color var(--dur) var(--ease);}',
'.bm-switch .track::after{content:"";position:absolute;top:2px;left:2px;width:20px;height:20px;border-radius:50%;',
'  background:var(--fg-dim);transition:transform var(--dur) var(--ease),background var(--dur) var(--ease);}',
'.bm-switch input:checked + .track{background:var(--accent);border-color:var(--accent);}',
'.bm-switch input:checked + .track::after{transform:translateX(20px);background:#fff;}',
'.bm-body{display:flex;flex-direction:column;gap:10px;}',
'.bm-upload{border:2px dashed var(--border-light);border-radius:var(--radius);padding:18px;',
'  display:flex;flex-direction:column;align-items:center;gap:8px;color:var(--fg-dim);font-size:var(--fs-sm);',
'  transition:border-color var(--dur) var(--ease),color var(--dur) var(--ease);}',
'.bm-upload:active{border-color:var(--accent);color:var(--accent);}',
'.bm-upload svg{width:28px;height:28px;opacity:.6;}',
'.bm-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;}',
'.bm-cell{position:relative;border:1px solid var(--border);border-radius:var(--radius);overflow:hidden;background:var(--bg-card);}',
'.bm-cell .bm-orig{position:relative;}',
'.bm-cell .bm-orig img{width:100%;height:96px;object-fit:cover;display:block;background:var(--bg-input);}',
'.bm-cell .bm-del{position:absolute;top:4px;right:4px;width:24px;height:24px;border-radius:50%;background:rgba(0,0,0,.55);',
'  color:#fff;font-size:13px;line-height:24px;text-align:center;z-index:2;}',
'.bm-cell .bm-name{font-size:var(--fs-xs);color:var(--fg-dim);padding:4px 6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}',
'.bm-cell .bm-result{margin-top:0;border-top:1px solid var(--border);}',
'.bm-cell .bm-result img{width:100%;height:96px;object-fit:cover;display:block;background:var(--bg-input);}',
'.bm-cell .bm-empty{height:96px;display:flex;align-items:center;justify-content:center;color:var(--fg-muted);',
'  font-size:var(--fs-xs);border-top:1px solid var(--border);}',
'.bm-cell .bm-res-actions{display:flex;gap:6px;padding:6px;}',
'.bm-cell .bm-save1{flex:1;padding:6px 0;border-radius:var(--radius-sm);font-size:var(--fs-xs);font-weight:600;',
'  background:var(--accent-soft);color:var(--accent);}',
'.bm-cell .bm-copy{flex:1;padding:6px 0;border-radius:var(--radius-sm);font-size:var(--fs-xs);font-weight:600;',
'  color:var(--fg-dim);background:var(--bg-hover);}',
'.bm-progress{display:flex;flex-direction:column;gap:6px;}',
'.bm-progress-bar{height:6px;border-radius:var(--radius-pill);background:var(--bg-input);overflow:hidden;}',
'.bm-progress-bar > i{display:block;height:100%;width:0;background:var(--accent);transition:width var(--dur) var(--ease);}',
'.bm-progress-txt{font-size:var(--fs-xs);color:var(--fg-dim);text-align:center;}',
'.bm-footer{display:flex;align-items:center;gap:10px;margin-top:2px;}',
'.bm-footer .bm-info{flex:1;font-size:var(--fs-xs);color:var(--fg-dim);}',
'.bm-saveall{padding:8px 16px;border-radius:var(--radius);font-size:var(--fs-sm);font-weight:600;color:#fff;',
'  background:var(--accent);transition:background var(--dur) var(--ease);}',
'.bm-saveall:disabled{opacity:.4;}',
'.bm-empty-hint{font-size:var(--fs-xs);color:var(--fg-muted);text-align:center;padding:6px 0;}',
''
  ].join('\n');

  function injectStyle() {
    const st = document.createElement('style');
    st.textContent = BM_CSS;
    document.head.appendChild(st);
  }

  function buildUI() {
    if (built) return;
    built = true;
    injectStyle();

    const refArea = $id('refImageArea');
    if (!refArea) return;
    const refSection = refArea.closest('.section');
    if (!refSection) return;

    const sec = document.createElement('div');
    sec.className = 'section bm-sec';
    sec.innerHTML = [
'      <div class="bm-head">',
'        <label class="label" style="margin:0">批处理模式</label>',
'        <label class="bm-switch">',
'          <input type="checkbox" id="bmToggle">',
'          <span class="track"></span>',
'        </label>',
'      </div>',
'      <div class="bm-body hidden" id="bmBody">',
'        <div class="bm-upload" id="bmUpload">',
'          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>',
'          <span>点击添加图片（可多选）</span>',
'        </div>',
'        <div class="bm-grid" id="bmGrid"></div>',
'        <div class="bm-progress hidden" id="bmProgress">',
'          <div class="bm-progress-bar"><i id="bmProgressBar"></i></div>',
'          <div class="bm-progress-txt" id="bmProgressTxt"></div>',
'        </div>',
'        <div class="bm-footer hidden" id="bmFooter">',
'          <span class="bm-info" id="bmInfo"></span>',
'          <button class="bm-saveall" id="bmSaveAll" disabled>全部保存</button>',
'        </div>',
'      </div>'
    ].join('');

    refSection.parentNode.insertBefore(sec, refSection.nextSibling);

    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.style.display = 'none';
    document.body.appendChild(input);
    BM.input = input;

    $id('bmToggle').addEventListener('change', onToggle);
    $id('bmUpload').addEventListener('click', () => BM.input.click());
    input.addEventListener('change', e => { addFiles(e.target.files); input.value = ''; });
    $id('bmSaveAll').addEventListener('click', saveAll);
  }

  // ===== 开关 =====
  function onToggle() {
    BM.active = $id('bmToggle').checked;
    const refArea = $id('refImageArea');
    const refSection = refArea ? refArea.closest('.section') : null;
    if (refSection) refSection.style.display = BM.active ? 'none' : '';
    $id('bmBody').classList.toggle('hidden', !BM.active);
    if (!BM.active) {
      BM.files = [];
      BM.results = {};
      BM.running = false;
      BM.index = 0;
      renderGrid();
      renderFooter();
    }
    vibrate();
  }

  // ===== 渲染 =====
  function renderGrid() {
    const grid = $id('bmGrid');
    if (!grid) return;
    grid.innerHTML = '';
    if (!BM.files.length) {
      grid.innerHTML = '<div class="bm-empty-hint">尚未添加图片</div>';
      return;
    }
    BM.files.forEach(f => {
      const res = BM.results[f.id];
      const cell = document.createElement('div');
      cell.className = 'bm-cell';
      cell.dataset.id = f.id;
      let resultHtml;
      if (res && res.length) {
        const src = res[0].b64 ? 'data:image/png;base64,' + res[0].b64 : res[0].url;
        resultHtml = [
'          <div class="bm-result">',
'            <img src="' + src + '" alt="结果">',
'            <div class="bm-res-actions">',
'              <button class="bm-save1" data-id="' + f.id + '" data-src="' + src + '">保存</button>',
'              <button class="bm-copy" data-id="' + f.id + '" data-src="' + src + '">复制</button>',
'            </div>',
'          </div>'
        ].join('');
      } else {
        resultHtml = '<div class="bm-empty">等待生成</div>';
      }
      cell.innerHTML = [
'        <div class="bm-orig">',
'          <img src="' + f.thumb + '" alt="' + escapeHtml(f.name) + '">',
'          <button class="bm-del" data-id="' + f.id + '" title="删除">✕</button>',
'        </div>',
'        <div class="bm-name">' + escapeHtml(f.name) + '</div>',
        resultHtml
      ].join('');
      grid.appendChild(cell);
    });

    grid.querySelectorAll('.bm-del').forEach(b => b.addEventListener('click', () => removeFile(b.dataset.id)));
    grid.querySelectorAll('.bm-save1').forEach(b => b.addEventListener('click', () => saveOne(b.dataset.src)));
    grid.querySelectorAll('.bm-copy').forEach(b => b.addEventListener('click', () => copyResult(b.dataset.src)));
  }

  function renderFooter() {
    const footer = $id('bmFooter');
    if (!footer) return;
    const done = BM.files.filter(f => BM.results[f.id] && BM.results[f.id].length).length;
    const has = done > 0;
    footer.classList.toggle('hidden', !has);
    $id('bmInfo').textContent = '已生成 ' + done + ' / ' + BM.files.length + ' 张';
    $id('bmSaveAll').disabled = !has;
  }

  function renderProgress(done, total) {
    const wrap = $id('bmProgress');
    if (wrap) {
      wrap.classList.remove('hidden');
      $id('bmProgressBar').style.width = (total ? (done / total) * 100 : 0) + '%';
      $id('bmProgressTxt').textContent = '处理中 ' + done + ' / ' + total;
    }
  }

  function hideProgress() {
    const wrap = $id('bmProgress');
    if (wrap) wrap.classList.add('hidden');
  }

  // ===== 保存 =====
  function saveOne(src) {
    if (typeof saveResultImage === 'function') {
      saveResultImage(src, 'batch_' + Date.now());
    } else if (typeof showToast === 'function') {
      showToast('保存失败：saveResultImage 未定义', 'error');
    }
  }

  function saveAll() {
    BM.files.forEach(f => {
      const res = BM.results[f.id];
      if (res && res.length) {
        const src = res[0].b64 ? 'data:image/png;base64,' + res[0].b64 : res[0].url;
        saveOne(src);
      }
    });
  }

  function copyResult(src) {
    fetch(src)
      .then(r => r.blob())
      .then(blob => navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]))
      .then(() => showToast('已复制到剪贴板'))
      .catch(() => showToast('复制失败', 'error'));
  }

  // ===== 生成 =====
  // 逐张处理（供主 app 驱动）
  async function processNext(prompt) {
    if (BM.running || BM.index >= BM.files.length) return null;
    const f = BM.files[BM.index];
    BM.running = true;
    try {
      const prevB64 = window.state ? state.refImageB64 : null;
      const prevName = window.state ? state.refImageName : null;
      if (window.state) { state.refImageB64 = f.b64; state.refImageName = f.name; }
      const imgs = await generateImageEdit(prompt);
      if (window.state) { state.refImageB64 = prevB64; state.refImageName = prevName; }
      BM.results[f.id] = imgs;
      renderGrid();
      renderFooter();
      return imgs;
    } finally {
      BM.running = false;
      BM.index++;
      renderProgress(Math.min(BM.index, BM.files.length), BM.files.length);
      if (BM.index >= BM.files.length) hideProgress();
    }
  }

  // 一键跑完全部（主 app 在 isActive() 时可调用）
  async function run(prompt) {
    if (!BM.files.length) { showToast('请先添加图片', 'error'); return; }
    if (BM.running) return;
    BM.index = 0;
    BM.results = {};
    renderGrid();
    renderProgress(0, BM.files.length);
    let failed = 0;
    while (BM.index < BM.files.length) {
      const f = BM.files[BM.index];
      try {
        const prevB64 = window.state ? state.refImageB64 : null;
        const prevName = window.state ? state.refImageName : null;
        if (window.state) { state.refImageB64 = f.b64; state.refImageName = f.name; }
        const imgs = await generateImageEdit(prompt);
        if (window.state) { state.refImageB64 = prevB64; state.refImageName = prevName; }
        BM.results[f.id] = imgs;
        renderGrid();
        renderFooter();
      } catch (e) {
        failed++;
        showToast(f.name + ' 失败: ' + e.message, 'error');
      }
      BM.index++;
      renderProgress(Math.min(BM.index, BM.files.length), BM.files.length);
    }
    hideProgress();
    showToast('批处理完成 · ' + (BM.files.length - failed) + '/' + BM.files.length + ' 成功');
  }

  // ===== 工具 =====
  function vibrate() {
    if (navigator.vibrate) navigator.vibrate(30);
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function showToast(msg, type) {
    if (typeof window.showToast === 'function') window.showToast(msg, type);
    else console.log('[BatchMode]', msg);
  }

  // ===== 导出接口 =====
  window.BatchMode = {
    init() {
      buildUI();
    },
    isActive() {
      return BM.active;
    },
    getFiles() {
      return BM.files.slice();
    },
    processNext: processNext,
    getResult(id) {
      return BM.results[id] || null;
    },
    run: run,
  };
})();
