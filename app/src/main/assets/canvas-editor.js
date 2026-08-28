/* ==========================================================================
   GPTImage Studio — Canvas 画板编辑器
   独立模块，暴露 window.CanvasEditor = { open(imageSrc, onSave), close() }
   自建 DOM + 内联样式（复用 app.css 的 CSS 变量），不依赖外部库。
   工具：画笔(蒙版)/橡皮/矩形/箭头/自由画笔/文字 + 旋转/翻转/裁剪。
   单指绘制，双指缩放平移。
   ========================================================================== */
(function () {
  'use strict';

  // ===== 常量 =====
  const RED = 'rgba(255,80,90,1)';
  const MASK_RED = 'rgba(255,0,0,0.35)';

  // ===== 内部状态 =====
  let S = null; // open 时初始化

  function freshState() {
    return {
      image: null,          // 源 Image
      base: null,           // offscreen canvas：变换后的基础图
      mask: null,           // offscreen canvas：画笔/橡皮蒙版（红色叠加）
      view: { scale: 1, tx: 0, ty: 0 },
      tool: 'brush',        // brush|eraser|rect|arrow|free|text
      brushSize: 24,
      annotColor: RED,       // 标注颜色(默认红)
      annotations: [],      // [{type,x0,y0,x1,y1,text,points,color}]
      drawing: null,        // 进行中的形状（rect/arrow 预览，image 坐标）
      freePts: null,        // 进行中的自由画笔点集（image 坐标）
      crop: null,           // 裁剪选区（image 坐标）{x0,y0,x1,y1}
      cropActive: false,
      transformOpen: false,
      showMask: true,        // 是否叠加蒙版红色层(可隐藏)
      cursor: null,          // 笔刷圆圈游标(image 坐标)
      textDialogOpen: false,
      textAnchor: null,
      pan: null,
      undoStack: [],
      redoStack: [],
      pointers: new Map(),
      pinch: null,
      onSave: null,
    };
  }

  // ===== DOM =====
  let els = null;
  let styleInjected = false;

  const CSS = [
'#ce-overlay{position:fixed;inset:0;z-index:9999;display:none;flex-direction:column;',
'  background:rgba(14,10,26,.93);backdrop-filter:blur(3px);color:var(--fg);',
'  font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,sans-serif;',
'  -webkit-tap-highlight-color:transparent;}',
'#ce-top{display:flex;align-items:center;gap:4px;height:46px;padding:0 8px;padding-top:var(--safe-top);',
'  background:var(--bg-surface);border-bottom:1px solid var(--border);flex:0 0 auto;}',
'#ce-title{flex:1;font-size:var(--fs-md);font-weight:600;color:var(--fg-bright);text-align:center;}',
'.ce-btn{min-width:34px;height:34px;padding:0 10px;border-radius:var(--radius-sm);display:flex;align-items:center;',
'  justify-content:center;color:var(--fg-dim);transition:background var(--dur) var(--ease),color var(--dur) var(--ease);}',
'.ce-btn svg{width:20px;height:20px;}',
'.ce-btn:active{background:var(--bg-active);}',
'.ce-btn.ce-primary{background:var(--accent);color:#fff;}',
'.ce-btn.ce-primary:active{background:var(--accent-hover);}',
'.ce-btn.ce-close{color:var(--error);}',
'.ce-btn:disabled{opacity:.35;pointer-events:none;}',
'#ce-stage{flex:1 1 auto;position:relative;overflow:hidden;touch-action:none;background:var(--bg-input);}',
'#ce-canvas{position:absolute;inset:0;width:100%;height:100%;touch-action:none;}',
'#ce-crop-mask{position:absolute;inset:0;pointer-events:none;box-shadow:0 0 0 9999px rgba(0,0,0,.55);display:none;}',
'#ce-crop-rect{position:absolute;border:2px dashed var(--accent);pointer-events:none;display:none;}',
'#ce-context{flex:0 0 auto;background:var(--bg-surface);border-top:1px solid var(--border);overflow:hidden;',
'  transition:max-height var(--dur) var(--ease);max-height:0;}',
'#ce-context.open{max-height:120px;}',
'#ce-context.hidden{display:none;}',
'#ce-context-inner{padding:10px 14px;display:flex;flex-direction:column;gap:8px;}',
'.ce-ctl-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap;}',
'.ce-ctl-row .ce-lbl{font-size:var(--fs-xs);color:var(--fg-dim);flex:0 0 auto;}',
'.ce-color{width:24px;height:24px;border-radius:50%;border:2px solid transparent;cursor:pointer;flex:0 0 auto;transition:transform var(--dur) var(--ease);}',
'.ce-color.on{border-color:var(--fg-bright);transform:scale(1.15);}',
'.ce-color:active{transform:scale(.9);}',
'#ce-brushRange{flex:1 1 auto;min-width:100px;accent-color:var(--accent);height:30px;}',
'#ce-brushVal{font-size:var(--fs-xs);color:var(--fg-dim);flex:0 0 auto;width:34px;text-align:right;}',
'.ce-chip{padding:7px 14px;border-radius:var(--radius-pill);font-size:var(--fs-sm);font-weight:500;',
'  color:var(--fg-dim);background:var(--bg-hover);border:1px solid var(--border);transition:all var(--dur) var(--ease);}',
'.ce-chip:active{background:var(--bg-active);}',
'.ce-chip.on{background:var(--accent-soft);color:var(--accent);border-color:var(--accent);}',
'.ce-chip.ce-danger{color:var(--warn);border-color:var(--warn);}',
'#ce-bottom{flex:0 0 auto;display:flex;align-items:center;gap:2px;padding:8px 8px calc(10px + var(--safe-bottom));',
'  background:var(--bg-surface);border-top:1px solid var(--border);overflow-x:auto;scrollbar-width:none;}',
'#ce-bottom::-webkit-scrollbar{display:none;}',
'.ce-tool{flex:0 0 auto;width:44px;height:44px;border-radius:var(--radius);display:flex;align-items:center;',
'  justify-content:center;color:var(--fg-dim);transition:all var(--dur) var(--ease);}',
'.ce-tool svg{width:22px;height:22px;}',
'.ce-tool.on{background:var(--accent);color:#fff;}',
'.ce-tool-save{background:var(--accent);color:#fff;}',
'.ce-tool-save:active{background:var(--accent-hover);}',
'.ce-tool:active{opacity:.7;}',
'.ce-sep{flex:0 0 auto;width:1px;height:28px;background:var(--border);margin:0 4px;}',
'#ce-text-dialog{position:absolute;left:0;right:0;bottom:90px;margin:0 16px;background:var(--bg-card);',
'  border:1px solid var(--border);border-radius:var(--radius-lg);padding:14px;box-shadow:var(--shadow);display:none;}',
'#ce-text-dialog textarea{width:100%;min-height:64px;background:var(--bg-input);border:1px solid var(--border-light);',
'  color:var(--fg);border-radius:var(--radius);padding:8px;font-family:inherit;font-size:var(--fs-md);resize:none;}',
'#ce-text-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:10px;}',
'.ce-dialog-btn{padding:8px 16px;border-radius:var(--radius);font-size:var(--fs-sm);font-weight:600;}',
'.ce-dialog-btn.cancel{color:var(--fg-dim);}',
'.ce-dialog-btn.ok{background:var(--accent);color:#fff;}',
'.ce-hint{font-size:var(--fs-xs);color:var(--fg-dim);}',
''
  ].join('\n');

  function ensureDOM() {
    if (els) return;
    if (!styleInjected) {
      const st = document.createElement('style');
      st.textContent = CSS;
      document.head.appendChild(st);
      styleInjected = true;
    }
    const ov = document.createElement('div');
    ov.id = 'ce-overlay';
    ov.innerHTML = [
'      <div id="ce-top">',
'        <button class="ce-btn ce-close" id="ce-closeBtn" title="关闭">',
'          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12"/></svg>',
'        </button>',
'        <div id="ce-title">画板编辑器</div>',
'        <button class="ce-btn" id="ce-undoBtn" title="撤销" disabled>',
'          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14L4 9l5-5"/><path d="M4 9h10a6 6 0 0 1 0 12h-3"/></svg>',
'        </button>',
'        <button class="ce-btn" id="ce-redoBtn" title="重做" disabled>',
'          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 14l5-5-5-5"/><path d="M20 9H10a6 6 0 0 0 0 12h3"/></svg>',
'        </button>',
'        <button class="ce-btn ce-primary" id="ce-saveBtn" title="保存">',
'          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>',
'        </button>',
'      </div>',
'      <div id="ce-stage">',
'        <canvas id="ce-canvas"></canvas>',
'        <div id="ce-crop-mask"></div>',
'        <div id="ce-crop-rect"></div>',
'        <div id="ce-text-dialog">',
'          <textarea id="ce-text-input" placeholder="输入文字，然后点确定"></textarea>',
'          <div id="ce-text-actions">',
'            <button class="ce-dialog-btn cancel" id="ce-text-cancel">取消</button>',
'            <button class="ce-dialog-btn ok" id="ce-text-ok">确定</button>',
'          </div>',
'        </div>',
'      </div>',
'      <div id="ce-context"><div id="ce-context-inner"></div></div>',
'      <div id="ce-bottom"></div>'
    ].join('');
    document.body.appendChild(ov);

    els = {
      overlay: ov,
      canvas: ov.querySelector('#ce-canvas'),
      stage: ov.querySelector('#ce-stage'),
      title: ov.querySelector('#ce-title'),
      context: ov.querySelector('#ce-context'),
      contextInner: ov.querySelector('#ce-context-inner'),
      bottom: ov.querySelector('#ce-bottom'),
      cropMask: ov.querySelector('#ce-crop-mask'),
      cropRect: ov.querySelector('#ce-crop-rect'),
      textDialog: ov.querySelector('#ce-text-dialog'),
      textInput: ov.querySelector('#ce-text-input'),
      undoBtn: ov.querySelector('#ce-undoBtn'),
      redoBtn: ov.querySelector('#ce-redoBtn'),
    };

    ov.querySelector('#ce-closeBtn').addEventListener('click', close);
    ov.querySelector('#ce-saveBtn').addEventListener('click', save);
    ov.querySelector('#ce-undoBtn').addEventListener('click', undo);
    ov.querySelector('#ce-redoBtn').addEventListener('click', redo);
    ov.querySelector('#ce-text-cancel').addEventListener('click', closeTextDialog);
    ov.querySelector('#ce-text-ok').addEventListener('click', commitText);

    buildBottomBar();
    bindPointerEvents();
  }

  // ===== 底部工具条 =====
  const TOOLS = [
    { id: 'brush',  label: '画笔',  icon: '<path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/>' },
    { id: 'eraser', label: '橡皮',  icon: '<path d="M9 3l8 8-5 5-8-8 5-5z"/><path d="M21 21H10L5 16"/>' },
    { id: 'rect',   label: '矩形',  icon: '<rect x="4" y="4" width="16" height="16" rx="2"/>' },
    { id: 'arrow',  label: '箭头',  icon: '<path d="M5 19L19 5"/><path d="M9 5h10v10"/>' },
    { id: 'free',   label: '自由',  icon: '<path d="M4 20c4-6 8-10 16-12"/><path d="M4 20c4-6 8-10 16-12"/>' },
    { id: 'text',   label: '文字',  icon: '<path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/>' },
  ];

  function buildBottomBar() {
    els.bottom.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;align-items:center;gap:2px;margin:0 auto;';
    TOOLS.forEach(t => {
      const b = document.createElement('button');
      b.className = 'ce-tool' + (t.id === 'brush' ? ' on' : '');
      b.dataset.tool = t.id;
      b.title = t.label;
      b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + t.icon + '</svg>';
      b.addEventListener('click', () => selectTool(t.id));
      wrap.appendChild(b);
    });
    const sep = document.createElement('div');
    sep.className = 'ce-sep';
    wrap.appendChild(sep);
    const tf = document.createElement('button');
    tf.className = 'ce-tool';
    tf.id = 'ce-transformBtn';
    tf.title = '变换 / 裁剪';
    tf.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M6 2v14a2 2 0 0 0 2 2h14"/><path d="M18 22V8a2 2 0 0 0-2-2H2"/></svg>';
    tf.addEventListener('click', toggleTransform);
    wrap.appendChild(tf);
    els.bottom.appendChild(wrap);
  }

  // ===== 工具选择 =====
  function selectTool(tool) {
    if (S.textDialogOpen) closeTextDialog();
    S.cropActive = false;
    hideCropUI();
    setTransformOpen(false);
    S.tool = tool;
    els.bottom.querySelectorAll('.ce-tool[data-tool]').forEach(b =>
      b.classList.toggle('on', b.dataset.tool === tool));
    els.title.textContent = (TOOLS.find(t => t.id === tool) || {}).label || '画板编辑器';
    renderContext();
    render();
  }

  function setTransformOpen(open) {
    S.transformOpen = open;
    els.bottom.querySelector('#ce-transformBtn').classList.toggle('on', open);
    renderContext();
  }

  function toggleTransform() {
    S.cropActive = false;
    hideCropUI();
    setTransformOpen(!S.transformOpen);
    render();
  }

  function renderContext() {
    const inner = els.contextInner;
    inner.innerHTML = '';
    els.context.classList.remove('hidden');
    if (S.transformOpen) {
      const row = document.createElement('div');
      row.className = 'ce-ctl-row';
      const mk = (label, fn, cls) => {
        const b = document.createElement('button');
        b.className = 'ce-chip' + (cls ? ' ' + cls : '');
        b.textContent = label;
        b.addEventListener('click', fn);
        row.appendChild(b);
        return b;
      };
      mk('旋转90°', () => { snapshot(); rotateImage(1); });
      mk('水平翻转', () => { snapshot(); flipImage('h'); });
      mk('垂直翻转', () => { snapshot(); flipImage('v'); });
      if (S.cropActive) {
        mk('确认裁剪', confirmCrop, 'ce-danger');
        mk('取消', () => { S.cropActive = false; hideCropUI(); renderContext(); render(); });
      } else {
        mk('裁剪', () => { S.cropActive = true; renderContext(); render(); });
      }
      mk('完成', () => { setTransformOpen(false); render(); });
      inner.appendChild(row);
      const hint = document.createElement('div');
      hint.className = 'ce-hint';
      hint.textContent = S.cropActive ? '在画布上拖动选择裁剪区域，然后点"确认裁剪"' : '双指可缩放/平移；单指可平移视图';
      inner.appendChild(hint);
      els.context.classList.add('open');
      return;
    }
    if (S.tool === 'rect' || S.tool === 'arrow' || S.tool === 'free' || S.tool === 'text') {
      // 标注颜色选择
      const row = document.createElement('div');
      row.className = 'ce-ctl-row';
      const lbl = document.createElement('span');
      lbl.className = 'ce-lbl';
      lbl.textContent = '颜色';
      row.appendChild(lbl);
      const colors = [RED, '#FFC107', '#4CAF50', '#2196F3', '#E040FB', '#FF7043'];
      colors.forEach(c => {
        const sw = document.createElement('button');
        sw.className = 'ce-color';
        sw.style.background = c;
        if (S.annotColor === c) sw.classList.add('on');
        sw.addEventListener('click', () => { S.annotColor = c; renderContext(); render(); });
        row.appendChild(sw);
      });
      inner.appendChild(row);
      const delRow = document.createElement('div');
      delRow.className = 'ce-ctl-row';
      const delBtn = document.createElement('button');
      delBtn.className = 'ce-chip';
      delBtn.textContent = '删除上一个标注';
      delBtn.addEventListener('click', deleteLastAnnotation);
      delRow.appendChild(delBtn);
      if (S.annotations.length === 0) delBtn.style.opacity = '0.5';
      inner.appendChild(delRow);
      const hint = document.createElement('div');
      hint.className = 'ce-hint';
      hint.textContent = (S.tool === 'text' ? '点击画布放置文字' : '拖动绘制标注');
      inner.appendChild(hint);
      els.context.classList.add('open');
      return;
    }
    if (S.tool === 'brush' || S.tool === 'eraser') {
      const row = document.createElement('div');
      row.className = 'ce-ctl-row';
      const lbl = document.createElement('span');
      lbl.className = 'ce-lbl';
      lbl.textContent = '笔刷大小';
      const range = document.createElement('input');
      range.type = 'range';
      range.id = 'ce-brushRange';
      range.min = '4';
      range.max = '80';
      range.value = S.brushSize;
      const val = document.createElement('span');
      val.id = 'ce-brushVal';
      val.textContent = S.brushSize;
      range.addEventListener('input', () => {
        S.brushSize = parseInt(range.value, 10);
        val.textContent = S.brushSize;
      });
      row.appendChild(lbl);
      row.appendChild(range);
      row.appendChild(val);
      inner.appendChild(row);
      const btnRow = document.createElement('div');
      btnRow.className = 'ce-ctl-row';
      const clearBtn = document.createElement('button');
      clearBtn.className = 'ce-chip';
      clearBtn.textContent = '清除蒙版';
      clearBtn.addEventListener('click', clearMask);
      const maskBtn = document.createElement('button');
      maskBtn.className = 'ce-chip';
      maskBtn.id = 'ce-maskToggle';
      maskBtn.textContent = S.showMask ? '隐藏蒙版' : '显示蒙版';
      maskBtn.addEventListener('click', toggleMask);
      btnRow.appendChild(clearBtn);
      btnRow.appendChild(maskBtn);
      inner.appendChild(btnRow);
      const hint = document.createElement('div');
      hint.className = 'ce-hint';
      hint.textContent = S.tool === 'brush' ? '红色半透明区域为蒙版（编辑区域）' : '擦除蒙版区域';
      inner.appendChild(hint);
      els.context.classList.add('open');
      return;
    }
    els.context.classList.add('hidden');
  }

  // 清除蒙版(可撤销)
  function clearMask() {
    if (!S.mask) return;
    snapshot();
    const mctx = S.mask.getContext('2d');
    mctx.clearRect(0, 0, S.mask.width, S.mask.height);
    render();
  }

  // 显示/隐藏蒙版红色叠加层(避免红色遮挡看不清底图)
  function toggleMask() {
    S.showMask = !S.showMask;
    const b = document.getElementById('ce-maskToggle');
    if (b) b.textContent = S.showMask ? '隐藏蒙版' : '显示蒙版';
    render();
  }

  // ===== 撤销/重做 =====
  // 快照含基础图(旋转/翻转/裁剪会改 base)+蒙版+标注 → 所有操作可撤销
  function captureBase() {
    // 存 base 为 dataURL(省内存) + 宽高
    return { url: S.base.toDataURL('image/png'), w: S.base.width, h: S.base.height };
  }

  function snapshot() {
    S.undoStack.push({
      base: captureBase(),
      mask: S.mask.getContext('2d').getImageData(0, 0, S.mask.width, S.mask.height),
      annotations: cloneAnn(S.annotations),
    });
    if (S.undoStack.length > 30) S.undoStack.shift();
    S.redoStack = [];
    updateHistoryBtns();
  }

  function deleteLastAnnotation() {
    if (!S.annotations.length) return;
    snapshot();  // 删除前保存, 可撤销
    S.annotations.pop();
    renderContext();
    render();
  }

  function cloneAnn(arr) {
    return arr.map(a => {
      const c = Object.assign({}, a);
      if (a.points) c.points = a.points.map(p => ({ x: p.x, y: p.y }));
      return c;
    });
  }

  function restoreBase(snap) {
    if (!snap.base) return;
    const img = new Image();
    img.onload = () => {
      if (!S) return;
      const b = document.createElement('canvas');
      b.width = img.naturalWidth || snap.base.w;
      b.height = img.naturalHeight || snap.base.h;
      b.getContext('2d').drawImage(img, 0, 0);
      S.base = b;
      S.mask = makeMaskCanvas();
      render();
    };
    img.src = snap.base.url;
  }

  function restore(snap) {
    const mctx = S.mask.getContext('2d');
    mctx.clearRect(0, 0, S.mask.width, S.mask.height);
    mctx.putImageData(snap.mask, 0, 0);
    S.annotations = cloneAnn(snap.annotations);
  }

  function currentSnap() {
    return { base: captureBase(), mask: S.mask.getContext('2d').getImageData(0, 0, S.mask.width, S.mask.height), annotations: cloneAnn(S.annotations) };
  }

  function undo() {
    if (!S.undoStack.length) return;
    S.redoStack.push(currentSnap());
    const snap = S.undoStack.pop();
    restore(snap);
    restoreBase(snap);
    updateHistoryBtns();
  }

  function redo() {
    if (!S.redoStack.length) return;
    S.undoStack.push(currentSnap());
    const snap = S.redoStack.pop();
    restore(snap);
    restoreBase(snap);
    updateHistoryBtns();
  }

  function updateHistoryBtns() {
    els.undoBtn.disabled = !S.undoStack.length;
    els.redoBtn.disabled = !S.redoStack.length;
  }

  // ===== 手势 / 指针 =====
  function screenToImage(p) {
    return { x: (p.x - S.view.tx) / S.view.scale, y: (p.y - S.view.ty) / S.view.scale };
  }

  function bindPointerEvents() {
    const stage = els.stage;
    stage.addEventListener('pointerdown', onDown);
    stage.addEventListener('pointermove', onMove);
    stage.addEventListener('pointerup', onUp);
    stage.addEventListener('pointercancel', onUp);
    stage.addEventListener('touchstart', e => e.preventDefault(), { passive: false });
    // 双击: fit 与 100% 切换
    stage.addEventListener('dblclick', () => {
      if (S.view.scale > 1.05) {
        fitView();
      } else {
        S.view = { scale: 1, tx: 0, ty: 0 };
        render();
      }
    });
  }

  function onDown(e) {
    if (S.textDialogOpen) return;
    if (!S.image) return;
    e.preventDefault();
    els.stage.setPointerCapture(e.pointerId);
    S.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (S.pointers.size === 2) {
      cancelStroke();
      const pts = Array.from(S.pointers.values());
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      S.pinch = { d: d || 1, mid: mid, scale0: S.view.scale, tx0: S.view.tx, ty0: S.view.ty };
      return;
    }
    if (S.pointers.size === 1) {
      startStroke(e.clientX, e.clientY);
    }
  }

  function onMove(e) {
    if (!S.pointers.has(e.pointerId)) return;
    e.preventDefault();
    S.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (S.pointers.size === 2 && S.pinch) {
      const pts = Array.from(S.pointers.values());
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      let ns = S.pinch.scale0 * (d / S.pinch.d);
      ns = Math.min(Math.max(ns, 0.2), 20);
      const imgPt = { x: (S.pinch.mid.x - S.pinch.tx0) / S.pinch.scale0, y: (S.pinch.mid.y - S.pinch.ty0) / S.pinch.scale0 };
      S.view.scale = ns;
      S.view.tx = mid.x - imgPt.x * ns;
      S.view.ty = mid.y - imgPt.y * ns;
      clampView();
      render();
      return;
    }

    if (S.pointers.size === 1) {
      moveStroke(e.clientX, e.clientY);
    }
  }

  function onUp(e) {
    if (!S.pointers.has(e.pointerId)) return;
    S.pointers.delete(e.pointerId);
    if (S.pinch && S.pointers.size < 2) S.pinch = null;
    if (S.pointers.size === 0) {
      endStroke();
    } else {
      render();
    }
  }

  // ===== 绘制动作 =====
  function startStroke(x, y) {
    if (S.cropActive) {
      const p = screenToImage({ x: x, y: y });
      S.crop = { x0: p.x, y0: p.y, x1: p.x, y1: p.y };
      updateCropUI();
      return;
    }
    if (S.transformOpen) {
      S.pan = { sx: x, sy: y, tx0: S.view.tx, ty0: S.view.ty };
      return;
    }
    const p = screenToImage({ x: x, y: y });
    if (S.tool === 'text') {
      S.textAnchor = { x: p.x, y: p.y };
      openTextDialog();
      return;
    }
    // 绘制前保存状态(供撤销恢复到起点)
    snapshot();
    if (S.tool === 'brush' || S.tool === 'eraser') {
      const ctx = S.mask.getContext('2d');
      ctx.globalCompositeOperation = S.tool === 'eraser' ? 'destination-out' : 'source-over';
      ctx.strokeStyle = S.tool === 'eraser' ? 'rgba(0,0,0,1)' : MASK_RED;
      ctx.lineWidth = S.brushSize;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + 0.01, p.y + 0.01);
      ctx.stroke();
      S.freePts = [p];
      S.cursor = p;
      return;
    }
    if (S.tool === 'free') {
      S.freePts = [p];
      return;
    }
    if (S.tool === 'rect' || S.tool === 'arrow') {
      S.drawing = { type: S.tool, x0: p.x, y0: p.y, x1: p.x, y1: p.y };
    }
  }

  function moveStroke(x, y) {
    if (S.cropActive && S.crop) {
      const p = screenToImage({ x: x, y: y });
      S.crop.x1 = p.x;
      S.crop.y1 = p.y;
      updateCropUI();
      return;
    }
    if (S.pan) {
      S.view.tx = S.pan.tx0 + (x - S.pan.sx);
      S.view.ty = S.pan.ty0 + (y - S.pan.sy);
      clampView();
      render();
      return;
    }
    const p = screenToImage({ x: x, y: y });
    if ((S.tool === 'brush' || S.tool === 'eraser') && S.freePts) {
      const ctx = S.mask.getContext('2d');
      const last = S.freePts[S.freePts.length - 1];
      ctx.globalCompositeOperation = S.tool === 'eraser' ? 'destination-out' : 'source-over';
      ctx.strokeStyle = S.tool === 'eraser' ? 'rgba(0,0,0,1)' : MASK_RED;
      ctx.lineWidth = S.brushSize;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      S.freePts.push(p);
      S.cursor = p;
      render();
      return;
    }
    if (S.tool === 'free' && S.freePts) {
      S.freePts.push(p);
      render();
      return;
    }
    if (S.drawing && (S.tool === 'rect' || S.tool === 'arrow')) {
      S.drawing.x1 = p.x;
      S.drawing.y1 = p.y;
      render();
    }
  }

  function endStroke() {
    if (S.pan) { S.pan = null; return; }
    if (S.cropActive) { return; }
    S.cursor = null;
    const pts = S.freePts;
    S.freePts = null;
    if (pts && pts.length > 1) {
      if (S.tool === 'free') {
        S.annotations.push({ type: 'free', points: pts, color: S.annotColor });
      }
      render();
      return;
    }
    if (S.drawing) {
      const d = S.drawing;
      S.drawing = null;
      const dx = Math.abs(d.x1 - d.x0), dy = Math.abs(d.y1 - d.y0);
      if (dx > 2 || dy > 2) {
        S.annotations.push({ type: d.type, x0: d.x0, y0: d.y0, x1: d.x1, y1: d.y1, color: S.annotColor });
      }
      render();
    }
  }

  function cancelStroke() {
    S.freePts = null;
    S.drawing = null;
    S.pan = null;
  }

  // ===== 裁剪 =====
  function updateCropUI() {
    if (!S.crop) { hideCropUI(); return; }
    const c = S.crop;
    const r = {
      x: Math.min(c.x0, c.x1), y: Math.min(c.y0, c.y1),
      w: Math.abs(c.x1 - c.x0), h: Math.abs(c.y1 - c.y0),
    };
    els.cropRect.style.display = 'block';
    els.cropMask.style.display = 'block';
    positionCropOverlay(r);
  }

  function positionCropOverlay(r) {
    const sx = S.view.scale, tx = S.view.tx, ty = S.view.ty;
    els.cropRect.style.left = (r.x * sx + tx) + 'px';
    els.cropRect.style.top = (r.y * sx + ty) + 'px';
    els.cropRect.style.width = (r.w * sx) + 'px';
    els.cropRect.style.height = (r.h * sx) + 'px';
  }

  function hideCropUI() {
    S.crop = null;
    els.cropRect.style.display = 'none';
    els.cropMask.style.display = 'none';
  }

  function confirmCrop() {
    if (!S.crop) return;
    const c = S.crop;
    const r = {
      x: Math.round(Math.min(c.x0, c.x1)), y: Math.round(Math.min(c.y0, c.y1)),
      w: Math.round(Math.abs(c.x1 - c.x0)), h: Math.round(Math.abs(c.y1 - c.y0)),
    };
    if (r.w < 4 || r.h < 4) { hideCropUI(); render(); return; }
    r.w = Math.min(r.w, S.base.width - r.x);
    r.h = Math.min(r.h, S.base.height - r.y);
    if (r.w <= 0 || r.h <= 0) { hideCropUI(); render(); return; }
    snapshot();
    const nb = document.createElement('canvas');
    nb.width = r.w;
    nb.height = r.h;
    nb.getContext('2d').drawImage(S.base, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h);
    S.base = nb;
    const offX = r.x, offY = r.y;
    S.annotations = S.annotations
      .map(a => mapAnnotation(a, p => ({ x: p.x - offX, y: p.y - offY })))
      .filter(a => a);
    S.mask = makeMaskCanvas();
    S.cropActive = false;
    hideCropUI();
    fitView();
    render();
  }

  // ===== 图像变换 =====
  function rotateImage(times) {
    const src = S.base;
    const W = src.width, H = src.height;
    const nb = document.createElement('canvas');
    nb.width = H;
    nb.height = W;
    const ctx = nb.getContext('2d');
    ctx.translate(H, 0);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(src, 0, 0);
    S.base = nb;
    S.annotations = S.annotations
      .map(a => mapAnnotation(a, p => ({ x: H - 1 - p.y, y: p.x })))
      .filter(a => a);
    S.mask = makeMaskCanvas();
    fitView();
    render();
  }

  function flipImage(axis) {
    const src = S.base;
    const W = src.width, H = src.height;
    const nb = document.createElement('canvas');
    nb.width = W;
    nb.height = H;
    const ctx = nb.getContext('2d');
    if (axis === 'h') {
      ctx.translate(W, 0);
      ctx.scale(-1, 1);
    } else {
      ctx.translate(0, H);
      ctx.scale(1, -1);
    }
    ctx.drawImage(src, 0, 0);
    S.base = nb;
    S.annotations = S.annotations
      .map(a => mapAnnotation(a, p => axis === 'h' ? { x: W - 1 - p.x, y: p.y } : { x: p.x, y: H - 1 - p.y }))
      .filter(a => a);
    S.mask = makeMaskCanvas();
    fitView();
    render();
  }

  function mapAnnotation(a, map) {
    const W = S.base.width, H = S.base.height;
    const inB = p => p.x >= -1 && p.y >= -1 && p.x <= W && p.y <= H;
    if (a.type === 'text') {
      const np = map({ x: a.x, y: a.y });
      if (!inB(np)) return null;
      return Object.assign({}, a, { x: np.x, y: np.y });
    }
    if (a.type === 'free') {
      const pts = a.points.map(map);
      if (!pts.some(inB)) return null;
      return Object.assign({}, a, { points: pts });
    }
    const p0 = map({ x: a.x0, y: a.y0 });
    const p1 = map({ x: a.x1, y: a.y1 });
    if (!inB(p0) && !inB(p1)) return null;
    return Object.assign({}, a, { x0: p0.x, y0: p0.y, x1: p1.x, y1: p1.y });
  }

  // ===== 文字 =====
  function openTextDialog() {
    if (S.tool !== 'text') return;
    S.textDialogOpen = true;
    els.textInput.value = '';
    els.textDialog.style.display = 'block';
    els.textInput.focus();
  }

  function closeTextDialog() {
    S.textDialogOpen = false;
    els.textDialog.style.display = 'none';
  }

  function commitText() {
    const text = els.textInput.value.trim();
    closeTextDialog();
    if (text && S.textAnchor) {
      snapshot();
      S.annotations.push({ type: 'text', x: S.textAnchor.x, y: S.textAnchor.y, text: text, color: S.annotColor });
      render();
    }
    S.textAnchor = null;
  }

  // ===== 视图 =====
  function fitView() {
    const cw = els.canvas.clientWidth || els.stage.clientWidth;
    const ch = els.canvas.clientHeight || els.stage.clientHeight;
    const iw = S.base.width, ih = S.base.height;
    const scale = Math.min(cw / iw, ch / ih, 1);
    S.view = { scale: scale, tx: (cw - iw * scale) / 2, ty: (ch - ih * scale) / 2 };
  }

  function clampView() {
    const cw = els.canvas.clientWidth, ch = els.canvas.clientHeight;
    const iw = S.base.width * S.view.scale, ih = S.base.height * S.view.scale;
    const minX = Math.min(0, cw - iw), minY = Math.min(0, ch - ih);
    if (iw > cw) {
      S.view.tx = Math.min(Math.max(S.view.tx, minX), 0);
    } else {
      S.view.tx = (cw - iw) / 2;
    }
    if (ih > ch) {
      S.view.ty = Math.min(Math.max(S.view.ty, minY), 0);
    } else {
      S.view.ty = (ch - ih) / 2;
    }
  }

  // ===== 渲染 =====
  function render() {
    if (!S || !S.image) return;
    const dpr = window.devicePixelRatio || 1;
    const ctx = els.canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, els.canvas.width, els.canvas.height);
    ctx.setTransform(S.view.scale * dpr, 0, 0, S.view.scale * dpr, S.view.tx * dpr, S.view.ty * dpr);
    ctx.drawImage(S.base, 0, 0);
    if (S.showMask) ctx.drawImage(S.mask, 0, 0);
    drawAnnotations(ctx);
    if (S.drawing) {
      strokeStyle(ctx);
      if (S.drawing.type === 'rect') {
        ctx.strokeRect(Math.min(S.drawing.x0, S.drawing.x1), Math.min(S.drawing.y0, S.drawing.y1),
          Math.abs(S.drawing.x1 - S.drawing.x0), Math.abs(S.drawing.y1 - S.drawing.y0));
      } else {
        drawArrow(ctx, S.drawing.x0, S.drawing.y0, S.drawing.x1, S.drawing.y1);
      }
    }
    if (S.freePts && S.tool === 'free') {
      strokeStyle(ctx);
      drawPoly(ctx, S.freePts);
    }
    if (S.cursor && (S.tool === 'brush' || S.tool === 'eraser')) {
      ctx.beginPath();
      ctx.arc(S.cursor.x, S.cursor.y, S.brushSize / 2, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = Math.max(1, 1.5 / S.view.scale);
      ctx.stroke();
    }
    if (S.cropActive && S.crop) updateCropUI();
  }

  function strokeStyle(ctx) {
    ctx.strokeStyle = RED;
    ctx.lineWidth = Math.max(3, S.brushSize * 0.5);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.globalAlpha = 1;
  }

  function drawPoly(ctx, pts) {
    if (!pts || pts.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
  }

  function drawArrow(ctx, x0, y0, x1, y1) {
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
    const ang = Math.atan2(y1 - y0, x1 - x0);
    const head = Math.max(10, S.brushSize * 0.7);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - head * Math.cos(ang - Math.PI / 6), y1 - head * Math.sin(ang - Math.PI / 6));
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - head * Math.cos(ang + Math.PI / 6), y1 - head * Math.sin(ang + Math.PI / 6));
    ctx.stroke();
  }

  function drawAnnotations(ctx) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (let i = 0; i < S.annotations.length; i++) {
      const a = S.annotations[i];
      const col = a.color || S.annotColor || RED;
      ctx.strokeStyle = col;
      ctx.fillStyle = col;
      if (a.type === 'rect') {
        ctx.lineWidth = Math.max(3, S.brushSize * 0.5);
        ctx.strokeRect(Math.min(a.x0, a.x1), Math.min(a.y0, a.y1), Math.abs(a.x1 - a.x0), Math.abs(a.y1 - a.y0));
      } else if (a.type === 'arrow') {
        ctx.lineWidth = Math.max(3, S.brushSize * 0.5);
        drawArrow(ctx, a.x0, a.y0, a.x1, a.y1);
      } else if (a.type === 'free') {
        ctx.lineWidth = Math.max(3, S.brushSize * 0.5);
        drawPoly(ctx, a.points);
      } else if (a.type === 'text') {
        ctx.font = '600 ' + Math.max(16, S.brushSize) + 'px sans-serif';
        ctx.fillText(a.text, a.x, a.y);
      }
    }
  }

  function makeMaskCanvas() {
    const m = document.createElement('canvas');
    m.width = S.base.width;
    m.height = S.base.height;
    return m;
  }

  // ===== 尺寸同步 =====
  function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    const cw = els.stage.clientWidth, ch = els.stage.clientHeight;
    els.canvas.width = cw * dpr;
    els.canvas.height = ch * dpr;
  }

  // ===== 导出 =====
  function exportDataURL() {
    const out = document.createElement('canvas');
    out.width = S.base.width;
    out.height = S.base.height;
    const ctx = out.getContext('2d');
    ctx.drawImage(S.base, 0, 0);
    drawAnnotations(ctx);
    return out.toDataURL('image/png');
  }

  // 导出蒙版: 红色画笔区域 → 白色蒙版(OpenAI 语义: 白=编辑区域)
  function exportMaskB64() {
    if (!S.mask) return null;
    const m = document.createElement('canvas');
    m.width = S.mask.width;
    m.height = S.mask.height;
    const mctx = m.getContext('2d');
    mctx.drawImage(S.mask, 0, 0);
    const imgData = mctx.getImageData(0, 0, m.width, m.height);
    const px = imgData.data;
    let baseImageFound = false;
    for (let i = 0; i < px.length; i += 4) {
      const alpha = px[i + 3];
      // mask 上红色半透明(画笔) → 白色蒙版; 橡皮已用 destination-out 清除
      if (alpha > 10) { px[i] = 255; px[i + 1] = 255; px[i + 2] = 255; px[i + 3] = 255; baseImageFound = true; }
      else { px[i] = 0; px[i + 1] = 0; px[i + 2] = 0; px[i + 3] = 0; }
    }
    mctx.putImageData(imgData, 0, 0);
    if (!baseImageFound) return null;
    return m.toDataURL('image/png');
  }

  // ===== 保存 / 关闭 =====
  function save() {
    if (!S || !S.image) return;
    const b64 = exportDataURL();
    const maskB64 = exportMaskB64();
    const cb = S.onSave;
    close();
    if (typeof cb === 'function') {
      try { cb(b64, maskB64); } catch (err) { console.error('CanvasEditor onSave error', err); }
    }
  }

  function close() {
    if (!els) return;
    els.overlay.style.display = 'none';
    if (S && S.textDialogOpen) closeTextDialog();
    hideCropUI();
    S = null;
  }

  // ===== 打开 =====
  function open(imageSrc, onSave) {
    ensureDOM();
    const img = new Image();
    img.onload = () => {
      S = freshState();
      S.onSave = onSave || null;
      const base = document.createElement('canvas');
      base.width = img.naturalWidth;
      base.height = img.naturalHeight;
      base.getContext('2d').drawImage(img, 0, 0);
      S.base = base;
      S.image = img;
      S.mask = makeMaskCanvas();
      els.overlay.style.display = 'flex';
      resizeCanvas();
      fitView();
      updateHistoryBtns();
      els.title.textContent = '画板编辑器';
      els.bottom.querySelectorAll('.ce-tool[data-tool]').forEach(b => b.classList.toggle('on', b.dataset.tool === 'brush'));
      renderContext();
      render();
    };
    img.onerror = () => {
      if (typeof showToast === 'function') showToast('图片加载失败', 'error');
    };
    img.src = imageSrc;
  }

  // ===== 导出接口 =====
  window.CanvasEditor = {
    open: open,
    close: close,
  };
})();
