/* ==========================================================================
   GPTImage Studio — 核心逻辑
   ========================================================================== */

// ===== 状态 =====
const state = {
  // 多 API 配置 (profiles)
  profiles: [],
  activeProfile: 0,
  // 便捷访问（指向当前 profile）
  get baseUrl() { return this.profiles[this.activeProfile]?.baseUrl || 'https://api.openai.com'; },
  get apiKey() { return this.profiles[this.activeProfile]?.apiKey || ''; },
  get model() { return this.profiles[this.activeProfile]?.model || 'gpt-image-1'; },
  get apiMode() { return this.profiles[this.activeProfile]?.apiMode || 'responses'; },
  set baseUrl(v) { if (this.profiles[this.activeProfile]) this.profiles[this.activeProfile].baseUrl = v; },
  set apiKey(v) { if (this.profiles[this.activeProfile]) this.profiles[this.activeProfile].apiKey = v; },
  set model(v) { if (this.profiles[this.activeProfile]) this.profiles[this.activeProfile].model = v; },
  set apiMode(v) { if (this.profiles[this.activeProfile]) this.profiles[this.activeProfile].apiMode = v; },
  // LLM (焚决生成) 独立配置 — 永远不复用图像生成的 API
  get llmBaseUrl() { return this.profiles[this.activeProfile]?.llmBaseUrl || 'https://api.deepseek.com'; },
  get llmApiKey() { return this.profiles[this.activeProfile]?.llmApiKey || ''; },
  get llmModel() { return this.profiles[this.activeProfile]?.llmModel || 'deepseek-chat'; },
  // 视觉模型 (图片反推提示词) — 独立配置，不复用 LLM
  get visionBaseUrl() { return this.profiles[this.activeProfile]?.visionBaseUrl || 'https://api.deepseek.com'; },
  get visionApiKey() { return this.profiles[this.activeProfile]?.visionApiKey || ''; },
  get visionModel() { return this.profiles[this.activeProfile]?.visionModel || ''; },
  set llmBaseUrl(v) { if (this.profiles[this.activeProfile]) this.profiles[this.activeProfile].llmBaseUrl = v; },
  set llmApiKey(v) { if (this.profiles[this.activeProfile]) this.profiles[this.activeProfile].llmApiKey = v; },
  set llmModel(v) { if (this.profiles[this.activeProfile]) this.profiles[this.activeProfile].llmModel = v; },
  set visionBaseUrl(v) { if (this.profiles[this.activeProfile]) this.profiles[this.activeProfile].visionBaseUrl = v; },
  set visionApiKey(v) { if (this.profiles[this.activeProfile]) this.profiles[this.activeProfile].visionApiKey = v; },
  set visionModel(v) { if (this.profiles[this.activeProfile]) this.profiles[this.activeProfile].visionModel = v; },
  // AI 生成焚决预设提示词 (可编辑)
  aiPresetPrompt: '',
  // AI 优化提示词预设 (可编辑)
  aiOptimizePrompt: '',
  // 图片反推预设提示词 (可编辑)
  reversePresetPrompt: '',
  // 反推预设模式: detail(细节版) | simple(简洁版)
  reversePresetMode: 'detail',
  // 本次临时反推要求(仅一次生效, 不持久化, 反推后自动清空)
  tempReversePrompt: '',
  tempPosePrompt: '',
  // 完善提示词选中的生成图(src 数组)
  refineSelected: [],
  // 上一次反推提示词(用于迭代完善, 不改预设)
  lastReversePrompt: '',
  // 上次反推用的参考图标识(只有参考图不变才迭代)
  lastReverseRef: '',
  // 收藏焚决 ids
  favPrompts: [],
  // 收藏的历史图片 (timestamp 数组)
  favHistory: [],
  // 收藏的历史提示词 (提示词字符串数组)
  favPromptHistory: [],
  // 焚决管理模式 (当前是否为多选管理态)
  manageMode: false,
  // 历史对比基准图 (A)
  historyCompareA: null,
  // 图像模型列表 (动态从 API 拉取)
  imageModels: [],
  // 视频模型列表 (动态从 API 拉取, 按 taskType 分流)
  videoModels: [],
  // 模型元数据 (id -> {model_type, supported_endpoint_types, tags}, 供分类/driver 识别)
  modelMeta: {},
  // 生成任务类型: image | video
  taskType: 'image',
  // 视频生成参数
  video: { duration: 5, ratio: '16:9', fps: '' },
  // LLM 模型列表 (动态从 API 拉取)
  llmModels: [],
  // 多选选中的焚决 ids
  selectedIds: [],
  // 生成参数（全局共享）
  size: '1024x1024',
  quality: 'medium',
  format: 'png',
  n: 1,
  seed: '',
  negativePrompt: '',
  style: '',
  background: 'auto',
  moderation: 'auto',
  inputFidelity: 'auto',
  outputCompression: '',
  userIdentifier: '',
  refImageB64: null,
  refImageName: null,
  // 多参考图数组 [{b64,name}]
  references: [],
  maskB64: null,
  editMode: false,
  generating: false,
  currentRequestId: null,
  theme: 'dark',
  previewItem: null,

  promptHistory: [],
  presets: [],
  customSizes: [],
  historyFilter: '',
  historyModeFilter: 'all',
  promptCat: 'all',
  customPrompts: [],
  // 预设焚决 (从 NativeBridge 的 fenjue.json 加载, 不硬编码在 JS)
  presetPrompts: [],
  // 焚决库视图: preset(预设库) | mine(我的库)
  promptLibView: 'mine',
  // 输出目录（Android 相册保存由系统决定，此项仅记录/透传）
  outputDir: '',
  // 参数策略: standard(OpenAI标准) | relay(兼容中转扩展)
  requestPolicy: 'standard',
  // 当前激活 workspace id
  activeWorkspaceId: 'w0',
  // 工作区标签列表
  workspaces: [{ id: 'w0', name: '默认' }],
};

// ===== 初始化 =====
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  loadHistory();
  updateApiStatus();
  initPromptListener();
  initTheme();
  initCharCount();
  initHistorySearch();
  initPromptHistory();
  initPresets();

  initPrompts();
  // 加载图像模型 (无 key 时显示提示)
  loadImageModels();
  // 批处理模式 (BatchMode 自建 UI 并插入参考图区下方)
  if (typeof BatchMode !== 'undefined') {
    BatchMode.init();
  }
  // 分辨率宽高输入 (blur 时应用)
  var sw = document.getElementById('sizeW');
  var sh = document.getElementById('sizeH');
  if (sw) sw.addEventListener('blur', setSizeFromInput);
  if (sh) sh.addEventListener('blur', setSizeFromInput);
});

// ===== 原生桥接 =====
window._nativeBridge = {
  pendingRequests: {},

  invoke(method, ...args) {
    return new Promise((resolve, reject) => {
      const requestId = 'req_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
      this.pendingRequests[requestId] = { resolve, reject };

      if (method === 'httpRequest' || method === 'httpStream') {
        const [url, httpMethod, headers, body] = args;
        NativeBridge.httpRequest(requestId, url, httpMethod,
          typeof headers === 'string' ? headers : JSON.stringify(headers),
          typeof body === 'string' ? body : JSON.stringify(body || {}));
      } else if (method === 'saveImage') {
        NativeBridge.saveImage(args[0], args[1]);
        resolve();
      } else if (method === 'saveImageFromUrl') {
        NativeBridge.saveImageFromUrl(args[0], args[1]);
        resolve();
      } else if (method === 'vibrate') {
        NativeBridge.vibrate(args[0] || 50);
        resolve();
      } else {
        resolve();
      }
    });
  },

  onResult(requestId, data) {
    const req = this.pendingRequests[requestId];
    if (req) { req.resolve(data); delete this.pendingRequests[requestId]; }
  },

  onError(requestId, message) {
    const req = this.pendingRequests[requestId];
    if (req) { req.reject(new Error(message)); delete this.pendingRequests[requestId]; }
  },

  onStreamStart(requestId) {
    const req = this.pendingRequests[requestId];
    if (req && req.onChunk) req.onChunk(''); // signal start
  },

  onStreamChunk(requestId, chunk) {
    const req = this.pendingRequests[requestId];
    if (req && req.onChunk) req.onChunk(chunk);
  },

  onStreamEnd(requestId) {
    const req = this.pendingRequests[requestId];
    if (req && req.onDone) req.onDone();
  },

  openPicker() {
    // Triggered by native; handled by browser file input fallback
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => handleFileSelect(e);
    input.click();
  },

  onImageSaved(msg) { showToast(msg); },
  onImageError(msg) { showToast(msg, 'error'); },
};

// ===== 检测是否有原生桥 =====
function hasNativeBridge() {
  return typeof NativeBridge !== 'undefined';
}
// ===== 通用异步桥调用 (大 payload 桥方法用异步版, 避免同步桥阻塞 JS 主线程) =====
function bridgeInvoke(method, ...args) {
  return new Promise((resolve, reject) => {
    if (!hasNativeBridge() || typeof NativeBridge[method] !== 'function') {
      reject(new Error('no async bridge: ' + method));
      return;
    }
    const requestId = 'br_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    window._nativeBridge.pendingRequests[requestId] = {
      resolve: (data) => resolve(data && data.result),
      reject,
    };
    NativeBridge[method](requestId, ...args);
  });
}
// ===== 读图缓存: path -> dataURL (避免历史/参考图历史每次切页全量重读大图) =====
const _fileImageCache = {};
function cachedReadFile(path) {
  if (!path) return Promise.resolve('');
  if (_fileImageCache[path]) return Promise.resolve(_fileImageCache[path]);
  return bridgeInvoke('readSavedFileAsync', path).then(function(read) {
    if (read) _fileImageCache[path] = read;
    return read;
  }).catch(function() { return ''; });
}
function invalidateFileCache(path) {
  if (path) delete _fileImageCache[path];
}

// ===== 浏览器环境 HTTP 请求 =====
async function browserFetch(url, method, headers, body) {
  const resp = await fetch(url, {
    method,
    headers,
    body: method === 'POST' ? body : undefined,
  });
  const text = await resp.text();
  return { status: resp.status, headers: Object.fromEntries(resp.headers), body: text };
}

async function browserStream(url, method, headers, body, onChunk, onDone) {
  const resp = await fetch(url, {
    method,
    headers,
    body: method === 'POST' ? body : undefined,
  });
  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    onChunk(decoder.decode(value, { stream: true }));
  }
  onDone();
}

// ===== 统一 HTTP 层 =====
// 智能拼接 API URL：兼容 OpenAI(带 /v1) 与 DeepSeek(不带 /v1，且兼容 /v1)
// 行为：baseUrl 已含 /v1 则不重复；否则统一补 /v1（DeepSeek 等兼容 OpenAI 的中转均接受 /v1）
function apiUrl(baseUrl, path) {
  const base = (baseUrl || '').replace(/\/+$/, '');
  let p = path.startsWith('/') ? path : '/' + path;
  const baseHasVer = /\/v\d+$/i.test(base) || /\/v\d+\//.test(base);
  // 若 path 已带版本段(/v1/...)，则直接用(避免重复)；若 base 含版本段也直接用
  if (baseHasVer || /^\/v\d+\//.test(p)) return base + p;
  return base + '/v1' + p;
}

async function apiRequest(url, method, headers, body) {
  console.log('[API] ' + method + ' ' + url);
  if (hasNativeBridge()) {
    const requestId = 'req_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    if (state.generating) state.currentRequestId = requestId;
    return new Promise((resolve, reject) => {
      window._nativeBridge.pendingRequests[requestId] = { resolve, reject };
      NativeBridge.httpRequest(requestId, url, method,
        JSON.stringify(headers), JSON.stringify(body || {}));
      // 超时兜底: 原生回调丢失/挂起时 120s 强制失败, 避免 Promise 永不 settle
      setTimeout(function() {
        if (window._nativeBridge.pendingRequests[requestId]) {
          delete window._nativeBridge.pendingRequests[requestId];
          reject(new Error('请求超时（120s）'));
        }
      }, 120000);
    }).then(function(resp) {
      console.log('[API] < ' + resp.status + ' ' + String(resp.body).slice(0, 500));
      if (resp.status >= 400) console.log('[API-ERR] ' + String(resp.body).slice(0, 2000));
      return resp;
    });
  }
  return browserFetch(url, method, headers, body).then(function(resp) {
    console.log('[API] < ' + resp.status);
    if (resp.status >= 400) console.log('[API-ERR] body: ' + String(resp.body).slice(0, 2000));
    return resp;
  });
}

// multipart 请求(edits 图生图, WebView fetch CORS 限制, 走原生)
async function apiRequestMultipart(url, method, headers, fields, files) {
  if (hasNativeBridge() && NativeBridge.httpRequestMultipart) {
    const requestId = 'req_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    if (state.generating) state.currentRequestId = requestId;
    const payload = JSON.stringify({ fields: fields || {}, files: files || [] });
    return new Promise((resolve, reject) => {
      window._nativeBridge.pendingRequests[requestId] = { resolve, reject };
      NativeBridge.httpRequestMultipart(requestId, url, method, JSON.stringify(headers), payload);
      // 超时兜底: 原生回调丢失/挂起时 120s 强制失败, 避免 Promise 永不 settle
      setTimeout(function() {
        if (window._nativeBridge.pendingRequests[requestId]) {
          delete window._nativeBridge.pendingRequests[requestId];
          reject(new Error('请求超时（120s）'));
        }
      }, 120000);
    });
  }
  // fallback: 浏览器 multipart(可能有 CORS,但尽力)
  const formData = new FormData();
  Object.keys(fields || {}).forEach(k => formData.append(k, fields[k]));
  (files || []).forEach(f => {
    const blob = b64ToBlob(f.b64, f.mime || 'image/png');
    formData.append(f.name, blob, f.filename || f.name + '.png');
  });
  return fetch(url, { method, headers, body: formData }).then(async r => ({ status: r.status, body: await r.text() }));
}

// ===== 提示词监听 =====
function initPromptListener() {
  const el = document.getElementById('promptInput');
  if (!el) return;
  el.addEventListener('input', () => {
    document.getElementById('charCount').textContent = el.value.length;
  });
}

// ===== 主题 =====
function initTheme() {
  const saved = localStorage.getItem('gpt_theme') || 'dark';
  state.theme = saved;
  applyTheme();
}

function applyTheme() {
  document.documentElement.setAttribute('data-theme', state.theme);
  const toggle = document.getElementById('darkModeToggle');
  if (toggle) toggle.checked = state.theme === 'dark';
}

function toggleTheme() {
  const toggle = document.getElementById('darkModeToggle');
  state.theme = toggle.checked ? 'dark' : 'light';
  localStorage.setItem('gpt_theme', state.theme);
  applyTheme();
}

// ===== Profile 管理（多 API 配置）=====
function loadProfiles() {
  const saved = localStorage.getItem('gpt_profiles');
  if (saved) { try { state.profiles = JSON.parse(saved); } catch { state.profiles = []; } }
  state.activeProfile = parseInt(localStorage.getItem('gpt_activeProfile') || '0');
  // Migration from old single-config
  if (state.profiles.length === 0) {
    const oldUrl = localStorage.getItem('gpt_baseUrl');
    const oldKey = localStorage.getItem('gpt_apiKey');
    const oldModel = localStorage.getItem('gpt_model');
    state.profiles.push({
      name: '默认',
      baseUrl: oldUrl || 'https://api.openai.com',
      apiKey: oldKey || '',
      model: oldModel || 'gpt-image-1',
      apiMode: 'responses',
    });
    saveProfiles();
  }
  if (state.activeProfile >= state.profiles.length) state.activeProfile = 0;
}

function saveProfiles() {
  localStorage.setItem('gpt_profiles', JSON.stringify(state.profiles));
  localStorage.setItem('gpt_activeProfile', String(state.activeProfile));
}

function setApiMode(mode) {
  state.apiMode = mode;
  saveProfiles();
  showToast(mode === 'responses' ? '已切换为 Responses API' : '已切换为 Images API');
}

// ===== 自定义下拉 =====
function toggleCustomSelect(btn) {
  const wrap = btn.closest('.cs-select');
  document.querySelectorAll('.cs-select.open').forEach(el => {
    if (el !== wrap) el.classList.remove('open');
  });
  wrap.classList.toggle('open');
}

function pickCustomSelect(opt, type) {
  const wrap = opt.closest('.cs-select');
  wrap.querySelectorAll('.cs-option').forEach(o => o.classList.remove('active'));
  opt.classList.add('active');
  const label = wrap.querySelector('.cs-label');
  const value = opt.dataset.value;
  label.textContent = opt.textContent.trim();
  wrap.classList.remove('open');
  if (type === 'model') {
    jsLog('I', 'Model', '选择模型: ' + value + ', activeProfile=' + state.activeProfile);
    state.model = value;
    localStorage.setItem('gpt_model', value);
    saveProfiles();
    jsLog('I', 'Model', '设置后 state.model=' + state.model);
  } else if (type === 'apiMode') {
    setApiMode(value);
  }
}

// 点击外部关闭下拉
document.addEventListener('click', (e) => {
  if (!e.target.closest('.cs-select')) {
    document.querySelectorAll('.cs-select.open').forEach(el => el.classList.remove('open'));
  }
  if (!e.target.closest('.llm-menu') && !e.target.closest('[onclick="toggleLlmModelMenu(this)"]')) {
    closeLlmModelMenu();
  }
  if (!e.target.closest('.llm-menu') && !e.target.closest('[onclick="toggleVisionModelMenu(this)"]')) {
    closeVisionModelMenu();
  }
});

// 同步自定义下拉显示 (加载设置时调用)
function syncCustomSelect(id, type, value) {
  const wrap = document.getElementById(id);
  if (!wrap) return;
  const label = wrap.querySelector('.cs-label');
  const options = wrap.querySelectorAll('.cs-option');
  options.forEach(o => {
    const active = o.dataset.value === value;
    o.classList.toggle('active', active);
    if (active && label) label.textContent = o.textContent.trim();
  });
  const trigger = wrap.querySelector('.cs-trigger');
  if (trigger) trigger.dataset.value = value;
}

// ===== 模型动态加载 (不硬编码) =====
// 从 API 拉取模型列表，渲染到指定下拉菜单
// 模型类型识别: 优先用中转元数据(model_type/tags), 缺省用 id 关键词
function isVideoModelMeta(m) {
  const hay = ((m.id || '') + '|' + (m.tags || '')).toLowerCase();
  return /视频|t2v|i2v|seedance|veo|kling|cogvideo|hailuo|wan2|viu|vidu|grok-imagine-video|happyhorse|pixverse|sora|video|首尾帧|参考生视频|图生视频|文生视频/.test(hay);
}
function isImageModelMeta(m) {
  const hay = ((m.id || '') + '|' + (m.tags || '')).toLowerCase();
  if (m.model_type === '图像') return true;
  return /image|img|gpt-image|dall-e|flux|seedream|imagen|nano-banana|t2i|i2i|wanx|wan2.*-image|cogview|sdxl|kolors|hunyuan-image|qwen-image|绘画|photo/.test(hay);
}
// 分类: image | video | other
function classifyModelMeta(m) {
  const mt = m.model_type || '';
  const hay = ((m.id || '') + '|' + (m.tags || '')).toLowerCase();
  if (mt === '对话' || mt === '检索') return 'other';
  if (mt === '图像') return 'image';
  if (mt === '音视频') {
    // 音频/实时语音优先排除, 其余(含视频特征)归视频
    if (/tts|speech|audio|transcribe|suno|music|音效|音频|实时|对话|realtime|voice/.test(hay)) return 'other';
    if (isVideoModelMeta(m)) return 'video';
    return 'video';
  }
  if (isVideoModelMeta(m)) return 'video';
  if (isImageModelMeta(m)) return 'image';
  return 'other';
}
// 端点协议 → 驱动名 (决定 请求端点/body/轮询 方式)
function driverOf(m) {
  const s = ((m && m.supported_endpoint_types) || []).join(',');
  if (/OpenAI video format/.test(s)) return 'openai_video';
  if (/doubao/i.test(s)) return 'doubao_video';
  if (/hailuo/i.test(s)) return 'hailuo_video';
  if (/wan/i.test(s)) return 'wan_video';
  if (/vidu/i.test(s)) return 'vidu_video';
  if (/happyhorse/i.test(s)) return 'happyhorse_video';
  if (/kling|lip-sync|motion|digital|omni-video/i.test(s)) return 'kling_video';
  if (/grok|官方格式/.test(s)) return 'grok_video';
  if (/pix/i.test(s)) return 'pix_video';
  if (/image-generation|dall-e-3|images-generations/i.test(s)) return 'openai_images';
  if (/image-edit|OpenAI image edit/i.test(s)) return 'openai_image_edit';
  if (/gemini/i.test(s)) return 'gemini_image';
  if (/MJ/i.test(s)) return 'mj_async';
  if (/aigc-image|omni-image|openai-绘图/i.test(s)) return 'openai_images';
  return 'unknown';
}

// 从 API 拉取模型列表: 保留元数据, 分类后填充 imageModels/videoModels/modelMeta
async function fetchModels(baseUrl, apiKey) {
  if (!apiKey) return [];
  try {
    const resp = await apiRequest(apiUrl(baseUrl, '/models'), 'GET', {
      'Authorization': 'Bearer ' + apiKey,
    });
    const data = JSON.parse(resp.body);
    if (resp.status === 200 && Array.isArray(data.data)) {
      const metas = data.data.map(m => ({
        id: m.id, model_type: m.model_type || '',
        supported_endpoint_types: m.supported_endpoint_types || [],
        tags: m.tags || '',
      })).filter(m => m.id);
      const img = [], vid = [];
      metas.forEach(m => {
        const t = classifyModelMeta(m);
        state.modelMeta[m.id] = m;
        if (t === 'image') img.push(m.id);
        else if (t === 'video') vid.push(m.id);
      });
      state.imageModels = img;
      state.videoModels = vid;
      return metas;
    }
    return [];
  } catch { return []; }
}

// 渲染图像模型下拉
function renderImageModelMenu() {
  const menu = document.getElementById('csModelMenu');
  if (!menu) return;
  const wrap = document.getElementById('csModel');
  const label = wrap.querySelector('.cs-label');
  const models = state.taskType === 'video' ? state.videoModels : state.imageModels;
  if (models.length === 0) {
    menu.innerHTML = '<button class="cs-option" disabled style="color:var(--fg-dim)">暂未加载到模型，请检查 API 配置</button>';
    return;
  }
  menu.innerHTML = '';
  models.forEach(id => {
    const active = id === state.model;
    const btn = document.createElement('button');
    btn.className = 'cs-option' + (active ? ' active' : '');
    btn.dataset.value = id;
    btn.textContent = id;
    btn.onclick = () => pickCustomSelect(btn, 'model');
    menu.appendChild(btn);
  });
  if (!models.includes(state.model)) {
    // 当前选择的模型不在列表时，强制用第一个
    if (label) label.textContent = models[0];
  }
}

// 加载图像模型 (图像 API)
async function loadImageModels() {
  const key = (state.baseUrl || '') + '|' + (state.apiKey || '');
  // 配置未变且已加载 → 不重复网络请求, 只渲染(避免切 tab 每次都拉 /v1/models 造成延迟)
  if (key === state._modelsKey && state.imageModels && (state.imageModels.length || state.videoModels.length)) {
    renderImageModelMenu();
    syncCustomSelect('csModel', 'model', state.model);
    return;
  }
  state._modelsKey = key;
  await fetchModels(state.baseUrl, state.apiKey);
  renderImageModelMenu();
  syncCustomSelect('csModel', 'model', state.model);
}

// 渲染 LLM 模型菜单
function renderLlmModelMenu(loading) {
  const menu = document.getElementById('llmModelMenu');
  if (!menu) return;
  menu.innerHTML = '';
  const models = state.llmModels;
  // 手动输入永远在最前
  const manual = document.createElement('button');
  manual.textContent = '✎ 手动输入模型...';
  manual.onclick = () => { editLlmField('model'); closeLlmModelMenu(); };
  menu.appendChild(manual);
  if (loading) {
    const tip = document.createElement('button');
    tip.disabled = true;
    tip.style.color = 'var(--fg-dim)';
    tip.textContent = '正在探测模型...';
    menu.appendChild(tip);
    return;
  }
  if (models.length === 0) {
    const tip = document.createElement('button');
    tip.disabled = true;
    tip.style.color = 'var(--fg-dim)';
    tip.textContent = '未探测到模型（可手动输入）';
    menu.appendChild(tip);
    return;
  }
  models.forEach(id => {
    const btn = document.createElement('button');
    btn.className = (id === state.llmModel ? 'active' : '');
    btn.textContent = id;
    btn.onclick = () => { setLlmConfig('model', id); closeLlmModelMenu(); };
    menu.appendChild(btn);
  });
}

// 切换 LLM 模型菜单
async function toggleLlmModelMenu(btn) {
  const menu = document.getElementById('llmModelMenu');
  if (!menu) return;
  if (menu.classList.contains('open')) { closeLlmModelMenu(); return; }
  closeLlmModelMenu();
  // 立即弹菜单(显示探测中 + 手动输入)
  renderLlmModelMenu(true);
  menu.classList.add('open');
  // 后台异步探测, 完成后重新渲染插入列表
  if (state.llmModels.length === 0) {
    await loadLlmModels();
    if (menu.classList.contains('open')) renderLlmModelMenu(false);
  }
}

function closeLlmModelMenu() {
  const menu = document.getElementById('llmModelMenu');
  if (menu) menu.classList.remove('open');
}

// 加载 LLM 模型 (LLM API)
async function loadLlmModels() {
  state.llmModels = await fetchModels(state.llmBaseUrl, state.llmApiKey);
}

// ===== 视觉模型下拉 (自动探测) =====
async function loadVisionModels() {
  state.visionModels = await fetchModels(state.visionBaseUrl, state.visionApiKey);
}

function renderVisionModelMenu(loading) {
  const menu = document.getElementById('visionModelMenu');
  if (!menu) return;
  menu.innerHTML = '';
  const models = state.visionModels || [];
  // 手动输入永远在最前
  const manual = document.createElement('button');
  manual.textContent = '✎ 手动输入模型...';
  manual.onclick = function() { editVisionField('model'); closeVisionModelMenu(); };
  menu.appendChild(manual);
  if (loading) {
    const tip = document.createElement('button');
    tip.disabled = true;
    tip.style.color = 'var(--fg-dim)';
    tip.textContent = '正在探测模型...';
    menu.appendChild(tip);
    return;
  }
  if (models.length === 0) {
    const tip = document.createElement('button');
    tip.disabled = true;
    tip.style.color = 'var(--fg-dim)';
    tip.textContent = '未探测到模型（可手动输入）';
    menu.appendChild(tip);
    return;
  }
  models.forEach(id => {
    const btn = document.createElement('button');
    btn.className = (id === state.visionModel ? 'active' : '');
    btn.textContent = id;
    btn.onclick = function() { setVisionField('model', id); closeVisionModelMenu(); };
    menu.appendChild(btn);
  });
}

async function toggleVisionModelMenu(btn) {
  const menu = document.getElementById('visionModelMenu');
  if (!menu) return;
  if (menu.classList.contains('open')) { closeVisionModelMenu(); return; }
  closeVisionModelMenu();
  // 立即弹菜单并渲染(含"探测中"提示 + 手动输入)
  renderVisionModelMenu(true);
  menu.classList.add('open');
  // 有 key 且未探测过 → 后台异步探测, 完成后重新渲染插入列表
  if (state.visionApiKey && (state.visionModels || []).length === 0) {
    await loadVisionModels();
    if (menu.classList.contains('open')) renderVisionModelMenu(false);
  }
}

// 设置视觉字段(统一) — 复用 editVisionField 内部逻辑
function setVisionField(field, value) {
  if (field === 'baseUrl') state.visionBaseUrl = value;
  else if (field === 'apiKey') state.visionApiKey = value;
  else state.visionModel = value;
  saveProfiles();
  renderLlmConfig();
}

function closeVisionModelMenu() {
  const menu = document.getElementById('visionModelMenu');
  if (menu) menu.classList.remove('open');
}

function switchProfile(idx) {
  state.activeProfile = idx;
  saveProfiles();
  loadSettings();
  renderProfileList();
  updateApiStatus();
  showToast('已切换: ' + state.profiles[idx].name);
  loadImageModels();
}

function addProfile() {
  showInputDialog('配置名称', '配置 ' + (state.profiles.length + 1), '输入配置名称', (name) => {
    if (!name) return;
    state.profiles.push({ name: name, baseUrl: 'https://api.openai.com', apiKey: '', model: 'gpt-image-1', apiMode: 'responses' });
    state.activeProfile = state.profiles.length - 1;
    saveProfiles();
    loadSettings();
    renderProfileList();
    showToast('配置已添加');
  });
}

function deleteProfile(idx) {
  if (state.profiles.length <= 1) { showToast('至少保留一个配置', 'error'); return; }
  showConfirmDialog('删除配置', '确定删除配置 "' + state.profiles[idx].name + '"？此操作不可撤销。', () => {
    state.profiles.splice(idx, 1);
    if (state.activeProfile >= state.profiles.length) state.activeProfile = state.profiles.length - 1;
    saveProfiles();
    loadSettings();
    renderProfileList();
    updateApiStatus();
  });
}

function renameProfile(idx) {
  showInputDialog('重命名配置', state.profiles[idx].name, '输入新名称', (name) => {
    if (!name) return;
    state.profiles[idx].name = name;
    saveProfiles();
    renderProfileList();
  });
}

function renderProfileList() {
  const c = document.getElementById('profileList');
  if (!c) return;
  c.innerHTML = '';
  state.profiles.forEach(function(p, i) {
    const div = document.createElement('div');
    div.className = 'profile-item' + (i === state.activeProfile ? ' active' : '');
    div.innerHTML = '<span class="profile-name" onclick="switchProfile(' + i + ')">' + escapeHtml(p.name) + '</span>'
      + '<span class="profile-url">' + escapeHtml(p.baseUrl) + '</span>'
      + '<div class="profile-actions">'
      + '<button class="icon-btn-sm" onclick="renameProfile(' + i + ')" title="重命名"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>'
      + '<button class="icon-btn-sm" onclick="deleteProfile(' + i + ')" title="删除" style="color:var(--error)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>'
      + '</div>';
    c.appendChild(div);
  });
}

// ===== 设置 =====
function loadSettings() {
  loadProfiles();
  state.size = localStorage.getItem('gpt_size') || '1024x1024';
  state.quality = localStorage.getItem('gpt_quality') || 'medium';
  state.format = localStorage.getItem('gpt_format') || 'png';
  state.n = parseInt(localStorage.getItem('gpt_n') || '1');
  state.seed = localStorage.getItem('gpt_seed') || '';
  state.negativePrompt = localStorage.getItem('gpt_negPrompt') || '';
  state.style = localStorage.getItem('gpt_style') || '';

  state.customSizes = JSON.parse(localStorage.getItem('gpt_customSizes') || '[]');
  state.presets = JSON.parse(localStorage.getItem('gpt_presets') || '[]');
  state.promptHistory = JSON.parse(localStorage.getItem('gpt_promptHistory') || '[]');
  state.aiPresetPrompt = localStorage.getItem('gpt_aiPresetPrompt') || '';
  state.aiOptimizePrompt = localStorage.getItem('gpt_aiOptimizePrompt') || '';
  state.reversePresetPrompt = localStorage.getItem('gpt_reversePresetPrompt') || '';
  state.reversePresetMode = localStorage.getItem('gpt_reversePresetMode') || 'detail';
  state.posePresetPrompt = localStorage.getItem('gpt_posePresetPrompt') || '';
  syncReversePresetBtns();
  try { state.favPrompts = JSON.parse(localStorage.getItem('gpt_favPrompts') || '[]'); } catch { state.favPrompts = []; }
  try { state.favHistory = JSON.parse(localStorage.getItem('gpt_favHistory') || '[]'); } catch { state.favHistory = []; }
  try { state.favPromptHistory = JSON.parse(localStorage.getItem('gpt_favPromptHistory') || '[]'); } catch { state.favPromptHistory = []; }

  var baseUrlEl = document.getElementById('baseUrlInput');
  var apiKeyEl = document.getElementById('apiKeyInput');
  var seedEl = document.getElementById('seedInput');
  var negEl = document.getElementById('negPromptInput');
  if (baseUrlEl) baseUrlEl.value = state.baseUrl;
  if (apiKeyEl) apiKeyEl.value = state.apiKey;
  if (seedEl) seedEl.value = state.seed;
  if (negEl) negEl.value = state.negativePrompt;
  // 高级参数
  state.background = localStorage.getItem('gpt_background') || 'auto';
  state.moderation = localStorage.getItem('gpt_moderation') || 'auto';
  state.inputFidelity = localStorage.getItem('gpt_inputFidelity') || 'auto';
  state.outputCompression = localStorage.getItem('gpt_outputCompression') || '';
  state.userIdentifier = localStorage.getItem('gpt_userIdentifier') || '';
  var compEl = document.getElementById('compressionInput');
  var uidEl = document.getElementById('userIdentifierInput');
  if (compEl) compEl.value = state.outputCompression;
  if (uidEl) uidEl.value = state.userIdentifier;
  syncCustomSelect('csModel', 'model', state.model);
  syncCustomSelect('csApiMode', 'apiMode', state.apiMode);
  // 输出目录 (从 NativeBridge prefs 读)
  state.outputDir = getOutputDir();
  var outEl = document.getElementById('outputDirInput');
  if (outEl) outEl.value = state.outputDir;
  // 参数策略
  state.requestPolicy = localStorage.getItem('gpt_requestPolicy') || 'standard';
  document.querySelectorAll('.req-policy-btn').forEach(function(b) {
    b.classList.toggle('active', b.dataset.val === state.requestPolicy);
  });

  document.querySelectorAll('.size-btn').forEach(function(btn) {
    btn.classList.toggle('active', btn.dataset.size === state.size);
  });
  syncSizeInput(state.size);
  document.querySelectorAll('#qualityGroup .pill').forEach(function(p) {
    p.classList.toggle('active', p.dataset.val === state.quality);
  });
  document.querySelectorAll('#formatGroup .pill').forEach(function(p) {
    p.classList.toggle('active', p.dataset.val === state.format);
  });
  document.querySelectorAll('#nGroup .pill').forEach(function(p) {
    p.classList.toggle('active', p.dataset.val === String(state.n));
  });
  document.querySelectorAll('#styleGroup .pill').forEach(function(p) {
    p.classList.toggle('active', p.dataset.val === state.style);
  });
  document.querySelectorAll('#bgGroup .pill').forEach(function(p) {
    p.classList.toggle('active', p.dataset.val === state.background);
  });
  document.querySelectorAll('#modGroup .pill').forEach(function(p) {
    p.classList.toggle('active', p.dataset.val === state.moderation);
  });
  document.querySelectorAll('#fidGroup .pill').forEach(function(p) {
    p.classList.toggle('active', p.dataset.val === state.inputFidelity);
  });

  // 工作区
  try {
    var ws = JSON.parse(localStorage.getItem('gpt_workspaces') || 'null');
    if (ws && ws.length) state.workspaces = ws;
  } catch { /* 忽略 */ }
  state.activeWorkspaceId = localStorage.getItem('gpt_activeWorkspace') || 'w0';
  if (!state.workspaces.some(function(w) { return w.id === state.activeWorkspaceId; })) {
    state.activeWorkspaceId = state.workspaces[0].id;
  }

  renderCustomSizes();
  renderPresets();
  renderPromptHistory();
  renderProfileList();
  renderLlmConfig();
  renderAiPreset();
  renderWsBar();
  // 调式服务器开关状态 + 访问地址
  var dbg = document.getElementById('debugServerToggle');
  if (dbg && hasNativeBridge() && NativeBridge.isDebugServerRunning) {
    dbg.checked = !!NativeBridge.isDebugServerRunning();
  }
  var surl = document.getElementById('debugServerUrl');
  if (surl && hasNativeBridge() && NativeBridge.getDebugServerUrl) {
    surl.textContent = NativeBridge.getDebugServerUrl();
  }
  checkPermStatus();
}

// 返回 app(从系统设置回来)时刷新权限状态
document.addEventListener('visibilitychange', function() {
  if (document.visibilityState === 'visible') checkPermStatus();
});

function saveSettings() {
  var baseUrlEl = document.getElementById('baseUrlInput');
  var apiKeyEl = document.getElementById('apiKeyInput');
  if (baseUrlEl) state.baseUrl = baseUrlEl.value.replace(/\/+$/, '');
  if (apiKeyEl) state.apiKey = apiKeyEl.value.trim();
  // model 由自定义下拉控制,无需从 select 读
  state.seed = document.getElementById('seedInput') ? document.getElementById('seedInput').value : '';
  state.negativePrompt = document.getElementById('negPromptInput') ? document.getElementById('negPromptInput').value : '';

  saveProfiles();
  localStorage.setItem('gpt_size', state.size);
  localStorage.setItem('gpt_quality', state.quality);
  localStorage.setItem('gpt_format', state.format);
  localStorage.setItem('gpt_n', String(state.n));
  localStorage.setItem('gpt_seed', state.seed);
  localStorage.setItem('gpt_negPrompt', state.negativePrompt);
  localStorage.setItem('gpt_style', state.style);
  updateApiStatus();
}

// Save settings on blur
document.addEventListener('focusout', function(e) {
  if (['baseUrlInput', 'apiKeyInput', 'seedInput', 'negPromptInput'].indexOf(e.target.id) !== -1) {
    saveSettings();
  }
  if (e.target.id === 'outputDirInput') {
    setOutputDir(e.target.value.trim());
  }
  if (e.target.id === 'compressionInput') {
    setOutputCompression(e.target.value.trim());
  }
  if (e.target.id === 'userIdentifierInput') {
    setUserIdentifier(e.target.value.trim());
  }
});

// ===== API 状态 =====
function updateApiStatus() {
  const dot = document.querySelector('.api-dot');
  const text = document.querySelector('.api-text');
  const btn = document.querySelector('.btn-generate');
  if (state.apiKey) {
    dot.classList.add('ok');
    text.textContent = `已配置 · ${state.baseUrl.replace(/^https?:\/\//, '').split('/')[0]}`;
    if (btn) btn.disabled = false;
  } else {
    dot.classList.remove('ok');
    text.textContent = '未配置 API Key';
    if (btn) btn.disabled = true;
  }
}

// ===== API Key 可见性 =====
function toggleKeyVisibility() {
  const input = document.getElementById('apiKeyInput');
  const eye = document.querySelector('.icon-eye');
  const eyeOff = document.querySelector('.icon-eye-off');
  if (input.type === 'password') {
    input.type = 'text';
    eye.classList.add('hidden');
    eyeOff.classList.remove('hidden');
  } else {
    input.type = 'password';
    eye.classList.remove('hidden');
    eyeOff.classList.add('hidden');
  }
}

// ===== 连接测试 =====
async function testConnection() {
  const btn = document.getElementById('testBtn');
  const result = document.getElementById('testResult');
  btn.disabled = true;
  btn.textContent = '测试中...';
  result.classList.add('hidden');

  saveSettings();

  try {
    const resp = await apiRequest(apiUrl(state.baseUrl, '/models'), 'GET', {
      'Authorization': `Bearer ${state.apiKey}`,
    });
    const data = JSON.parse(resp.body);
    if (resp.status === 200 && data.data) {
      result.textContent = '连接成功 · ' + data.data.length + ' 个模型可用';
      result.className = 'test-result ok';
      loadImageModels();
    } else {
      result.textContent = '失败: ' + (data.error?.message || '返回异常');
      result.className = 'test-result fail';
    }
  } catch (e) {
    result.textContent = '失败: ' + e.message;
    result.className = 'test-result fail';
  }
  result.classList.remove('hidden');
  btn.disabled = false;
  btn.textContent = '测试连接';
}

// ===== Tab 切换 =====
function switchTab(page) {
  document.querySelectorAll('.tab-page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  const target = document.getElementById('page-' + page);
  const btn = document.querySelector(`.nav-btn[data-page="${page}"]`);
  if (target) target.classList.add('active');
  if (btn) btn.classList.add('active');
  // 参考图历史页归属"历史"tab(底部高亮 history)
  if (page === 'refhistory') {
    const hb = document.querySelector('.nav-btn[data-page="history"]');
    if (hb) hb.classList.add('active');
  }
  // 切 tab 立即响应(切 active class), 重活(渲染历史/焚决/模型)延后一帧, 避免同步阻塞造成切换延迟
  setTimeout(function() {
    try {
      if (page === 'history') loadHistory();
      if (page === 'refhistory') renderRefHistory();
      if (page === 'prompts') renderPrompts();
      if (page === 'generate') loadImageModels();
    } catch (e) { console.error('switchTab render error', e); }
  }, 0);
}

// ===== 参数面板 =====
function toggleParams() {
  const grid = document.getElementById('imageParams');
  const header = document.querySelector('.param-header');
  if (grid) grid.classList.toggle('open');
  if (header) header.classList.toggle('open', !!grid && grid.classList.contains('open'));
  header.classList.toggle('open');
}

function setSize(btn) {
  document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  state.size = btn.dataset.size;
  localStorage.setItem('gpt_size', state.size);
  syncSizeInput(btn.dataset.size);
}

// 从宽/高输入框应用分辨率
function setSizeFromInput() {
  const w = document.getElementById('sizeW');
  const h = document.getElementById('sizeH');
  const width = parseInt(w && w.value);
  const height = parseInt(h && h.value);
  if (isNaN(width) || isNaN(height) || width < 128 || height < 128) { showToast('请输入有效分辨率 (≥128)', 'error'); return; }
  state.size = width + 'x' + height;
  localStorage.setItem('gpt_size', state.size);
  document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
  showToast('分辨率: ' + width + '×' + height);
}

// 同步宽高输入框显示 (传入 size 或读当前)
function syncSizeInput(size) {
  const s = size || state.size;
  const m = String(s).toLowerCase().split('x');
  const w = document.getElementById('sizeW');
  const h = document.getElementById('sizeH');
  if (w && m[0]) w.value = m[0];
  if (h && m[1]) h.value = m[1];
}

function setQuality(btn) {
  document.querySelectorAll('#qualityGroup .pill').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  state.quality = btn.dataset.val;
  localStorage.setItem('gpt_quality', state.quality);
}

function setFormat(btn) {
  document.querySelectorAll('#formatGroup .pill').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  state.format = btn.dataset.val;
  localStorage.setItem('gpt_format', state.format);
}

function setN(btn) {
  document.querySelectorAll('#nGroup .pill').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  state.n = parseInt(btn.dataset.val);
  localStorage.setItem('gpt_n', String(state.n));
}

// style 仅对 DALL·E 3 有效; gpt-image 系列不支持(传了会被中转拒绝 unknown_parameter)
function setStyle(btn) {
  if (state.model && !/dall/i.test(state.model)) {
    showToast('当前模型不支持 style(仅 DALL·E 3 有效)', 'warn');
    return;
  }
  document.querySelectorAll('#styleGroup .pill').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  state.style = btn.dataset.val;
  localStorage.setItem('gpt_style', state.style);
}

// ===== 高级参数 =====
function setBg(btn) {
  document.querySelectorAll('#bgGroup .pill').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  state.background = btn.dataset.val;
  localStorage.setItem('gpt_background', state.background);
}

function setModeration(btn) {
  document.querySelectorAll('#modGroup .pill').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  state.moderation = btn.dataset.val;
  localStorage.setItem('gpt_moderation', state.moderation);
}

function setFidelity(btn) {
  document.querySelectorAll('#fidGroup .pill').forEach(p => p.classList.remove('active'));
  btn.classList.add('active');
  state.inputFidelity = btn.dataset.val;
  localStorage.setItem('gpt_inputFidelity', state.inputFidelity);
}

function setOutputCompression(val) {
  state.outputCompression = val;
  localStorage.setItem('gpt_outputCompression', val);
}

function setUserIdentifier(val) {
  state.userIdentifier = val;
  localStorage.setItem('gpt_userIdentifier', val);
}

// ===== 自定义尺寸 =====
function addCustomSize() {
  showInputDialog('自定义分辨率', '1024x1024', '输入宽x高，如 1024x1024 或 1024x1536', (val) => {
    if (!val) return;
    const parts = val.toLowerCase().split('x');
    if (parts.length !== 2) { showToast('格式应为 宽x高', 'error'); return; }
    const width = parseInt(parts[0]), height = parseInt(parts[1]);
    if (isNaN(width) || isNaN(height) || width < 128 || height < 128) { showToast('尺寸无效 (需≥128)', 'error'); return; }
    const ratio = simplifyRatio(width, height);
    // 已存在则不重复添加
    const exists = state.customSizes.some(s => s.w === width && s.h === height);
    if (!exists) {
      state.customSizes.push({ w: width, h: height, ratio: ratio });
      localStorage.setItem('gpt_customSizes', JSON.stringify(state.customSizes));
    }
    renderCustomSizes();
    setCustomSize(width, height);
    showToast('已应用分辨率 ' + width + '×' + height);
  });
}

function removeCustomSize(idx) {
  state.customSizes.splice(idx, 1);
  localStorage.setItem('gpt_customSizes', JSON.stringify(state.customSizes));
  renderCustomSizes();
}

function setCustomSize(w, h) {
  state.size = w + 'x' + h;
  localStorage.setItem('gpt_size', state.size);
  document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
  showToast('尺寸: ' + w + '×' + h);
}

function renderCustomSizes() {
  const container = document.getElementById('customSizes');
  if (!container) return;
  container.innerHTML = '';
  state.customSizes.forEach((s, i) => {
    const btn = document.createElement('button');
    btn.className = 'size-btn' + (state.size === (s.w + 'x' + s.h) ? ' active' : '');
    btn.textContent = s.ratio;
    btn.title = s.w + '×' + s.h;
    btn.onclick = function() { setCustomSize(s.w, s.h); };
    const del = document.createElement('span');
    del.className = 'custom-size-del';
    del.textContent = '×';
    del.onclick = function(e) { e.stopPropagation(); removeCustomSize(i); };
    btn.appendChild(del);
    container.appendChild(btn);
  });
}

function simplifyRatio(w, h) {
  const g = gcd(w, h);
  return (w / g) + ':' + (h / g);
}

function gcd(a, b) { return b ? gcd(b, a % b) : a; }

// ===== AI 优化提示词 (使用焚决生成的独立 LLM 配置) =====
async function optimizePrompt() {
  const el = document.getElementById('promptInput');
  const prompt = el.value.trim();
  if (!prompt) { showToast('请输入提示词', 'error'); return; }
  const cfg = getLlmConfig();
  if (!cfg.apiKey) { showToast('请先配置焚决生成的 LLM API Key', 'error'); return; }
  showToast('正在优化提示词...');
  try {
    const url = apiUrl(cfg.baseUrl, '/chat/completions');
    const resp = await apiRequest(url, 'POST', {
      'Authorization': 'Bearer ' + cfg.apiKey,
      'Content-Type': 'application/json',
    }, {
      model: cfg.model,
      messages: [
        { role: 'system', content: state.aiOptimizePrompt || AI_OPTIMIZE_DEFAULT },
        { role: 'user', content: prompt },
      ],
      max_tokens: 500,
    });
    const data = JSON.parse(resp.body);
    if (resp.status === 200 && data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) {
      const optimized = data.choices[0].message.content.trim();
      el.value = optimized;
      document.getElementById('charCount').textContent = optimized.length;
      showToast('提示词已优化');
    } else {
      showToast('优化失败: ' + (data.error?.message || '未知错误'), 'error');
    }
  } catch (e) {
    showToast('优化失败: ' + e.message, 'error');
  }
}

// ===== 提示词历史 =====
function initPromptHistory() { renderPromptHistory(); }

function savePromptHistory(prompt) {
  if (!prompt || prompt.length < 5) return;
  state.promptHistory = state.promptHistory.filter(p => p !== prompt);
  state.promptHistory.unshift(prompt);
  if (state.promptHistory.length > 50) state.promptHistory.length = 50;
  localStorage.setItem('gpt_promptHistory', JSON.stringify(state.promptHistory));
  renderPromptHistory();
}

function renderPromptHistory() {
  const container = document.getElementById('promptHistoryList');
  if (!container) return;
  container.innerHTML = '';
  state.promptHistory.slice(0, 10).forEach(p => {
    const isFav = state.favPromptHistory.includes(p);
    const div = document.createElement('div');
    div.className = 'prompt-history-item' + (isFav ? ' faved' : '');
    const favIcon = isFav
      ? '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
    div.innerHTML = '<span class="phi-text">' + escapeHtml(p.length > 40 ? p.slice(0, 40) + '...' : p) + '</span>'
      + '<span class="phi-fav ' + (isFav ? 'faved' : '') + '" data-p="' + escapeHtml(p) + '">' + favIcon + '</span>';
    div.title = p;
    div.onclick = function(e) {
      if (e.target.closest('.phi-fav')) return;
      document.getElementById('promptInput').value = p;
      document.getElementById('charCount').textContent = p.length;
    };
    div.querySelector('.phi-fav').onclick = function(e) {
      e.stopPropagation();
      toggleFavPromptHistory(p);
    };
    container.appendChild(div);
  });
}

// 收藏 / 取消收藏提示词历史
function toggleFavPromptHistory(p) {
  const idx = state.favPromptHistory.indexOf(p);
  if (idx >= 0) {
    state.favPromptHistory.splice(idx, 1);
    showToast('已取消收藏提示词');
  } else {
    state.favPromptHistory.push(p);
    showToast('已收藏提示词，可供 AI 参考');
  }
  localStorage.setItem('gpt_favPromptHistory', JSON.stringify(state.favPromptHistory));
  renderPromptHistory();
}

function clearPromptHistory() {
  state.promptHistory = [];
  localStorage.removeItem('gpt_promptHistory');
  renderPromptHistory();
  showToast('提示词历史已清空');
}

// ===== 参数预设 =====
function initPresets() { renderPresets(); }

function saveCurrentAsPreset() {
  showInputDialog('保存预设', '我的预设', '输入预设名称', (name) => {
    if (!name) return;
    const preset = { name: name, size: state.size, quality: state.quality, format: state.format,
      n: state.n, model: state.model, style: state.style, seed: state.seed, negativePrompt: state.negativePrompt };
    state.presets.push(preset);
    localStorage.setItem('gpt_presets', JSON.stringify(state.presets));
    renderPresets();
    showToast('预设已保存');
  });
}

function applyPreset(idx) {
  const p = state.presets[idx];
  if (!p) return;
  state.size = p.size; state.quality = p.quality; state.format = p.format;
  state.n = p.n; state.model = p.model; state.style = p.style || '';
  state.seed = p.seed || ''; state.negativePrompt = p.negativePrompt || '';
  localStorage.setItem('gpt_size', state.size);
  localStorage.setItem('gpt_quality', state.quality);
  localStorage.setItem('gpt_format', state.format);
  localStorage.setItem('gpt_n', String(state.n));
  localStorage.setItem('gpt_model', state.model);
  localStorage.setItem('gpt_style', state.style);
  localStorage.setItem('gpt_seed', state.seed);
  localStorage.setItem('gpt_negPrompt', state.negativePrompt);
  loadSettings();
  showToast('已应用预设: ' + p.name);
}

function deletePreset(idx) {
  state.presets.splice(idx, 1);
  localStorage.setItem('gpt_presets', JSON.stringify(state.presets));
  renderPresets();
}

function renderPresets() {
  const container = document.getElementById('presetList');
  if (!container) return;
  container.innerHTML = '';
  if (state.presets.length === 0) {
    container.innerHTML = '<span style="color:var(--fg-dim);font-size:12px">暂无预设，点击上方按钮保存当前参数</span>';
    return;
  }
  state.presets.forEach((p, i) => {
    const div = document.createElement('div');
    div.className = 'preset-item';
    div.innerHTML = '<span class="preset-name" onclick="applyPreset(' + i + ')">' + escapeHtml(p.name) + '</span>'
      + '<span class="preset-info">' + p.size + ' · ' + p.quality + ' · ' + p.model + '</span>'
      + '<button class="btn-sm" onclick="deletePreset(' + i + ')" style="color:var(--error)">删除</button>';
    container.appendChild(div);
  });
}

// ===== 输出目录 (对齐 BBDownAndroid, 经 NativeBridge 存 prefs save_dir) =====
function setOutputDir(val) {
  state.outputDir = val || '';
  if (hasNativeBridge() && NativeBridge.setSaveDir) {
    NativeBridge.setSaveDir(state.outputDir);
  }
}

function getOutputDir() {
  if (hasNativeBridge() && NativeBridge.getSaveDir) {
    return NativeBridge.getSaveDir() || '';
  }
  return state.outputDir;
}

// ===== 所有文件访问授权 (对齐 BBDownAndroid) =====
function requestAllFilesAccess() {
  if (hasNativeBridge() && NativeBridge.requestAllFilesAccess) {
    NativeBridge.requestAllFilesAccess();
    showToast('请在系统设置中开启「所有文件访问」权限');
  } else {
    showToast('此设备无需授权', 'error');
  }
}

function hasAllFilesAccess() {
  if (hasNativeBridge() && NativeBridge.hasAllFilesAccess) {
    return !!NativeBridge.hasAllFilesAccess();
  }
  return true;
}

// 权限状态检测(BBDown 风格: 动态显示)
function checkPermStatus() {
  var el = document.getElementById('permStatusText');
  if (!el) return;
  var ok = hasAllFilesAccess();
  if (ok) {
    el.textContent = '已授予所有文件访问';
    el.className = 'perm-status ok';
  } else {
    el.textContent = '未授予（保存到公共目录需授权）';
    el.className = 'perm-status no';
  }
}

// ===== 调试服务器 =====
function toggleDebugServer() {
  var toggle = document.getElementById('debugServerToggle');
  var on = toggle && toggle.checked;
  if (hasNativeBridge() && NativeBridge.setDebugServer) {
    NativeBridge.setDebugServer(on);
  }
  showToast(on ? '调试服务器已开启' : '调试服务器已关闭');
}

// ===== 日志页面 =====
function openLogPage() {
  switchTab('logs');
  loadDebugLogs();
}

function loadDebugLogs() {
  var pre = document.getElementById('debugLogView');
  if (!pre) return;
  if (hasNativeBridge() && NativeBridge.getDebugLogs) {
    try {
      var logs = NativeBridge.getDebugLogs() || '';
      pre.textContent = logs || '(无日志)';
      pre.scrollTop = pre.scrollHeight;
      return;
    } catch (e) {}
  }
  pre.textContent = '(日志不可用)';
}

function clearDebugLogs() {
  if (hasNativeBridge() && NativeBridge.clearDebugLogs) {
    try { NativeBridge.clearDebugLogs(); } catch (e) {}
  }
  loadDebugLogs();
  showToast('日志已清空');
}

// ===== 参数策略 =====
function setRequestPolicy(val) {
  state.requestPolicy = val;
  localStorage.setItem('gpt_requestPolicy', val);
  document.querySelectorAll('.req-policy-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.val === val);
  });
  showToast(val === 'relay' ? '已切换为兼容中转扩展' : '已切换为 OpenAI 标准');
}

// ===== 历史搜索/筛选 =====
function setHistoryMode(mode) {
  state.historyModeFilter = mode;
  document.querySelectorAll('.history-filter-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.mode === mode);
  });
  loadHistory();
}

// ===== 历史导入/导出 =====
function exportHistory() {
  const history = getHistory();
  const blob = new Blob([JSON.stringify(history, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'GPTImage_history_' + Date.now() + '.json';
  a.click();
  URL.revokeObjectURL(url);
  showToast('历史已导出');
}

function importHistory() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!Array.isArray(data)) throw new Error('格式错误');
        const existing = getHistory();
        const seen = new Set();
        const deduped = [];
        data.concat(existing).forEach(h => {
          if (seen.has(h.timestamp)) return;
          seen.add(h.timestamp);
          deduped.push(h);
        });
        localStorage.setItem('gpt_history', JSON.stringify(deduped.slice(0, 500)));
        loadHistory();
        showToast('已导入 ' + data.length + ' 条记录');
      } catch (err) {
        showToast('导入失败: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
  };
  input.click();
}

// ===== 提示词操作 =====
function clearPrompt() {
  const el = document.getElementById('promptInput');
  el.value = '';
  document.getElementById('charCount').textContent = '0';
}

// ===== 参考图 (多图 + 剪贴板) =====
function pickImage() {
  if (hasNativeBridge()) {
    NativeBridge.openImagePicker();
  } else {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.multiple = true;
    input.onchange = (e) => handleFileSelect(e);
    input.click();
  }
}

function handleFileSelect(e) {
  const files = Array.from(e.target.files || []);
  if (!files.length) { state._lastFile = null; return; }
  files.forEach(f => {
    const reader = new FileReader();
    reader.onload = (ev) => {
      const b64 = ev.target.result.split(',')[1];
      addRefImage(b64, f.name, f.type);
    };
    reader.readAsDataURL(f);
  });
  e.target.value = '';
}

// 添加一张参考图 (b64 不带前缀)
function addRefImage(b64, name, mime) {
  if (!b64) return;
  state.references.push({ b64, name: name || ('ref_' + state.references.length + '.png'), mime: mime || 'image/png' });
  state.refImageB64 = state.references[0].b64;
  state.refImageName = state.references[0].name;
  renderRefList();
  // 落盘参考图到私有目录 + 记录到参考图历史(供历史页管理/对比原图用)
  if (hasNativeBridge() && NativeBridge.saveToPrivateDir) {
    try {
      const refName = 'ref_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6) + '.png';
      const saved = NativeBridge.saveToPrivateDir(b64, refName);
      if (saved) {
        let rh = [];
        try { rh = JSON.parse(localStorage.getItem('gpt_refHistory') || '[]'); } catch (e) {}
        // 同张参考图(按内容指纹)去重: 重复则更新 time 移到最前, 不重复落盘/记录
        const hash = simpleHash(b64);
        const dup = rh.findIndex(function(x) { return x.hash === hash; });
        if (dup >= 0) {
          // 删除旧文件
          if (rh[dup].savedPath && NativeBridge.deleteSavedFile) { try { NativeBridge.deleteSavedFile(rh[dup].savedPath); } catch (e) {} }
          rh.splice(dup, 1);
        }
        rh.unshift({ savedPath: saved, name: name || '参考图', mime: mime || 'image/png', ts: Date.now(), hash: hash });
        localStorage.setItem('gpt_refHistory', JSON.stringify(rh));
      }
    } catch (e) {}
  }
}

// 简单内容指纹(参考图去重)
function simpleHash(str) {
  var h = 5381;
  for (var i = 0; i < str.length; i++) { h = ((h << 5) + h + str.charCodeAt(i)) | 0; }
  return String(h);
}

// 移除某张参考图
function removeRefImage(idx) {
  if (typeof idx === 'number') {
    state.references.splice(idx, 1);
  } else {
    state.references = [];
  }
  state.refImageB64 = state.references.length ? state.references[0].b64 : null;
  state.refImageName = state.references.length ? state.references[0].name : null;
  renderRefList();
}

// 渲染参考图网格
function renderRefList() {
  const list = document.getElementById('refList');
  const area = document.querySelector('.ref-image-area');
  if (!list) return;
  list.innerHTML = '';
  state.references.forEach((r, i) => {
    const div = document.createElement('div');
    div.className = 'ref-item';
    div.innerHTML = '<img src="data:image/png;base64,' + r.b64 + '" alt="参考图">'
      + '<button class="ref-remove" onclick="removeRefImage(' + i + ')">✕</button>';
    list.appendChild(div);
  });
  area.style.borderStyle = state.references.length ? 'solid' : 'dashed';
}

// 剪切板粘贴图片作参考图 (Ctrl+V / 长按粘贴)
function pasteRefFromClipboard(e) {
  const items = (e.clipboardData || e.srcElement?.clipboardData || window.clipboardData)?.items;
  if (!items) return;
  for (const item of items) {
    if (item.type && item.type.startsWith('image/')) {
      const blob = item.getAsFile();
      if (!blob) continue;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const b64 = ev.target.result.split(',')[1];
        addRefImage(b64, 'pasted.png', blob.type);
        showToast('已粘贴剪贴板图片作参考图');
      };
      reader.readAsDataURL(blob);
      break;
    }
  }
}

// ===== 图片反推提示词 (视觉模型) — 独立选图, 结合当前提示词反推完整提示词 =====
function reversePromptFromRef() {
  if (!state.visionModel) { showToast('请先在设置中配置视觉模型', 'error'); return; }
  if (!state.visionApiKey) { showToast('请先配置视觉模型 API Key', 'error'); return; }
  showToast('请选择一张图片');
  pickSingleImage(function(img) { reversePromptFromImage(img); });
}

async function reversePromptFromImage(img) {
  if (!img || !img.b64) { showToast('未选择图片', 'error'); return; }
  const promptInput = document.getElementById('promptInput');
  const cur = promptInput ? promptInput.value.trim() : '';
  jsLog('I', 'Vision', '反推提示词开始, model=' + state.visionModel + ', img_len=' + img.b64.length + ', prompt_len=' + cur.length);
  showToast('正在反推提示词...');
  // 迭代完善: 只有"同一张图"且"没生成"再次点反推时, 才带上上次反推提示词让 LLM 完善它(不改预设)
  const lastPrompt = state.lastReversePrompt;
  const isIterate = !!lastPrompt && state.lastReverseRef === img.b64;
  try {
    const url = apiUrl(state.visionBaseUrl, '/chat/completions');
    const messages = [
      // 本次临时反推要求优先(仅一次), 否则用持久化默认
      { role: 'system', content: state.tempReversePrompt || getReverseDefault() },
    ];
    if (isIterate) {
      messages.push({ role: 'assistant', content: lastPrompt });
      messages.push({ role: 'user', content: [
        { type: 'text', text: '这是我上一次反推的提示词，请对照这张图片完善它（在原有基础上补充/修正，不要推翻重写，用中文输出，只输出完善后的提示词）。' },
        { type: 'image_url', image_url: { url: 'data:' + (img.mime || 'image/png') + ';base64,' + img.b64, detail: 'auto' } },
      ] });
    } else {
      const baseText = cur ? ('这是我当前生图提示词：\n' + cur + '\n\n') : '';
      messages.push({ role: 'user', content: [
        { type: 'text', text: baseText + '请结合这张图片反推一份可用于 AI 生图的完整中文提示词（覆盖人物外貌/服饰/瞳色/发色/发饰/表情/姿态/光线/背景/环境氛围/画面风格等细节，能判断的都写进去）。只输出提示词本身，不要任何解释。' },
        { type: 'image_url', image_url: { url: 'data:' + (img.mime || 'image/png') + ';base64,' + img.b64, detail: 'auto' } },
      ] });
    }
    const resp = await apiRequest(url, 'POST', {
      'Authorization': 'Bearer ' + state.visionApiKey,
      'Content-Type': 'application/json',
    }, {
      model: state.visionModel,
      messages: messages,
      // DeepSeek 推理模型: 禁用 thinking 让最终答案直接输出到 content
      thinking: { type: 'disabled' },
      max_tokens: 1200,
    });
    jsLog('I', 'Vision', '反推响应 status=' + resp.status);
    const data = JSON.parse(resp.body);
    if (resp.status !== 200) {
      jsLog('E', 'Vision', '反推HTTP错误 ' + resp.status + ': ' + String(resp.body).slice(0, 600));
      throw new Error(data.error?.message || ('HTTP ' + resp.status));
    }
    // 兼容 content 为字符串或数组(OpenAI/DeepSeek 风格)
    let content = '';
    const msg = data.choices && data.choices[0] && data.choices[0].message;
    if (msg) {
      if (typeof msg.content === 'string') content = msg.content;
      else if (Array.isArray(msg.content)) {
        content = msg.content.map(function(b) { return b.text || b.content || ''; }).join('');
      }
      // DeepSeek 推理模型把最终输出放 reasoning_content
      if (!content && msg.reasoning_content) content = msg.reasoning_content;
    }
    if (!content && data.output_text) content = data.output_text;
    if (!content && data.message && typeof data.message === 'string') content = data.message;
    if (!content && data.result && typeof data.result === 'string') content = data.result;
    if (!content && data.output) {
      content = JSON.stringify(data.output).replace(/[\[\]{}\"]/g, '');
    }
    // 仍为空则记录响应到日志便于排查
    if (!content) {
      jsLog('E', 'Vision', '反推无内容, resp=' + String(resp.body).slice(0, 800));
      throw new Error('视觉模型未返回结果');
    }
    jsLog('I', 'Vision', '反推成功, 长度=' + content.length);
    const finalPrompt = content.trim();
    // 记录为"上一次反推提示词"供下次迭代完善
    state.lastReversePrompt = finalPrompt;
    state.lastReverseRef = img.b64;
    promptInput.value = finalPrompt;
    document.getElementById('charCount').textContent = finalPrompt.length;
    showToast(isIterate ? '已基于上次完善反推提示词' : '反推完成，已填入提示词');
    // 本次临时反推要求用完即清, 下次恢复默认
    state.tempReversePrompt = '';
  } catch (e) {
    jsLog('E', 'Vision', '反推失败: ' + e.message);
    showToast('反推失败: ' + e.message, 'error');
  }
}

// 切换生成图是否选中用于完善
function toggleRefineSelect(btn) {
  const src = btn.dataset.src;
  const idx = state.refineSelected.indexOf(src);
  let on;
  if (idx >= 0) { state.refineSelected.splice(idx, 1); on = false; }
  else { state.refineSelected.push(src); on = true; }
  btn.classList.toggle('on', on);
  const item = btn.closest('.result-item');
  if (item) item.classList.toggle('refine-selected', on);
  updateRefineCount();
}

// ===== 填充人物特征: 根据参考图, 补/填充人物特征进现有提示词 =====
async function fillFeaturesFromRef() {
  if (!state.references.length) { showToast('请先上传参考图', 'error'); return; }
  if (!state.visionModel) { showToast('请先在设置中配置视觉模型', 'error'); return; }
  if (!state.visionApiKey) { showToast('请先配置视觉模型 API Key', 'error'); return; }
  const promptInput = document.getElementById('promptInput');
  const curPrompt = promptInput ? promptInput.value.trim() : '';
  if (!curPrompt) { showToast('请先填入提示词（预设/复制）', 'error'); return; }
  showToast('正在填充人物特征...');
  try {
    // 多张参考图全部分析，综合提取人物特征
    const contentParts = [
      { type: 'text', text: '我的提示词：\n' + curPrompt },
    ];
    state.references.forEach(function(r, i) {
      contentParts.push({ type: 'image_url', image_url: { url: 'data:' + (r.mime || 'image/png') + ';base64,' + r.b64, detail: 'auto' } });
    });
    contentParts.push({ type: 'text', text: '以上是 ' + state.references.length + ' 张参考图（可能含不同角度/全身/细节）。请综合全部参考图提取准确的人物特征（外貌/瞳色/发色/发饰/服饰/表情/姿态等），把人物部分整体替换原提示词中的相关描写并融合为一条完整新提示词；非人物部分（风格/光线/背景/氛围/画面构成）保留原提示词。禁止在末尾追加补充。' });
    jsLog('I', 'Vision', '填充: refs=' + state.references.length + ', prompt_len=' + curPrompt.length);
    const url = apiUrl(state.visionBaseUrl, '/chat/completions');
    const resp = await apiRequest(url, 'POST', {
      'Authorization': 'Bearer ' + state.visionApiKey,
      'Content-Type': 'application/json',
    }, {
      model: state.visionModel,
      messages: [
        { role: 'system', content: '你是人物特征填充专家。用户给若干张参考图（可能多张，含不同角度/全身/细节）和一段提示词，你综合所有参考图提取人物特征（外貌/瞳色/发色/发饰/服饰/表情/姿态等），把这些特征整体融入并重写原提示词，输出一条全新的完整提示词。关键要求：① 原提示词中描写人物的部分（容貌、发型、服饰、体态等）一律以参考图提取的准确特征整体替换，不是简单在末尾追加一句；② 非人物部分（风格、光线、背景、氛围、画面构成、镜头/画质等）原样保留；③ 最终输出是融合后的一条完整提示词（覆盖原提示词全部要点加参考图人物特征），自成一句/一段，不要出现「原提示词+补充」的拼接痕迹。必须用中文输出，只输出融合后的完整提示词，不要任何解释、标题、编号或格式标记。' },
        { role: 'user', content: contentParts },
      ],
      thinking: { type: 'disabled' },
      max_tokens: 1200,
    });
    const data = JSON.parse(resp.body);
    if (resp.status !== 200) { jsLog('E', 'Vision', '填充失败 ' + resp.status + ': ' + String(resp.body).slice(0, 500)); throw new Error(data.error?.message || ('HTTP ' + resp.status)); }
    let content = '';
    const msg = data.choices && data.choices[0] && data.choices[0].message;
    if (msg) {
      if (typeof msg.content === 'string') content = msg.content;
      else if (Array.isArray(msg.content)) content = msg.content.map(function(b) { return b.text || b.content || ''; }).join('');
      if (!content && msg.reasoning_content) content = msg.reasoning_content;
    }
    if (!content) throw new Error('视觉模型未返回结果');
    const filled = content.trim();
    promptInput.value = filled;
    document.getElementById('charCount').textContent = filled.length;
    showToast('人物特征已填充进提示词');
  } catch (e) {
    jsLog('E', 'Vision', '填充失败: ' + e.message);
    showToast('填充失败: ' + e.message, 'error');
  }
}

// ===== 姿态反推: 选一张图片(不加入参考图), 结合当前提示词反推人物姿态/动作/表情/神情 =====
function reversePoseFromRef() {
  if (!state.visionModel) { showToast('请先在设置中配置视觉模型', 'error'); return; }
  if (!state.visionApiKey) { showToast('请先配置视觉模型 API Key', 'error'); return; }
  showToast('请选择一张人物图片');
  pickSingleImage(function(img) { reversePoseFromImage(img); });
}

// 选择单张图片(不加入参考图, 供姿态反推独立使用)
function pickSingleImage(onPicked) {
  if (!onPicked) return;
  try {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = (e) => {
      const f = (e.target.files || [])[0];
      if (!f) { onPicked(null); return; }
      const reader = new FileReader();
      reader.onload = (ev) => {
        const b64 = ev.target.result.split(',')[1];
        onPicked({ b64: b64, mime: f.type || 'image/png', name: f.name || 'pose.png' });
      };
      reader.readAsDataURL(f);
    };
    input.click();
  } catch (e) {
    jsLog('E', 'Vision', 'pickSingleImage failed: ' + e.message);
    onPicked(null);
  }
}

async function reversePoseFromImage(img) {
  if (!img || !img.b64) { showToast('未选择图片', 'error'); return; }
  const promptInput = document.getElementById('promptInput');
  const cur = promptInput ? promptInput.value.trim() : '';
  jsLog('I', 'Vision', '姿态反推开始, model=' + state.visionModel + ', img_len=' + img.b64.length + ', prompt_len=' + cur.length);
  showToast('正在反推人物姿态...');
  try {
    const url = apiUrl(state.visionBaseUrl, '/chat/completions');
    const messages = [
      // 本次临时姿态反推要求优先(仅一次)
      { role: 'system', content: state.tempPosePrompt || getPoseDefault() },
      { role: 'user', content: [
        { type: 'text', text: '这是当前生图提示词：\n' + (cur || '(空)') + '\n\n请结合这张图与当前提示词，反推图中人物的姿态/动作/表情/神情，输出一段可直接用于 AI 生图的中文姿态描述，用于复制人物动作。只输出姿态描述本身，不要任何解释。' },
        { type: 'image_url', image_url: { url: 'data:' + (img.mime || 'image/png') + ';base64,' + img.b64, detail: 'auto' } },
      ] },
    ];
    const resp = await apiRequest(url, 'POST', {
      'Authorization': 'Bearer ' + state.visionApiKey,
      'Content-Type': 'application/json',
    }, {
      model: state.visionModel,
      messages: messages,
      thinking: { type: 'disabled' },
      max_tokens: 800,
    });
    jsLog('I', 'Vision', '姿态反推响应 status=' + resp.status);
    const data = JSON.parse(resp.body);
    if (resp.status !== 200) {
      jsLog('E', 'Vision', '姿态反推HTTP错误 ' + resp.status + ': ' + String(resp.body).slice(0, 600));
      throw new Error(data.error?.message || ('HTTP ' + resp.status));
    }
    let content = '';
    const msg = data.choices && data.choices[0] && data.choices[0].message;
    if (msg) {
      if (typeof msg.content === 'string') content = msg.content;
      else if (Array.isArray(msg.content)) content = msg.content.map(function(b) { return b.text || b.content || ''; }).join('');
      if (!content && msg.reasoning_content) content = msg.reasoning_content;
    }
    if (!content && data.output_text) content = data.output_text;
    if (!content && data.message && typeof data.message === 'string') content = data.message;
    if (!content && data.result && typeof data.result === 'string') content = data.result;
    if (!content && data.output) content = JSON.stringify(data.output).replace(/[\[\]{}\"]/g, '');
    if (!content) {
      jsLog('E', 'Vision', '姿态反推无内容, resp=' + String(resp.body).slice(0, 800));
      throw new Error('视觉模型未返回结果');
    }
    const finalPose = content.trim();
    jsLog('I', 'Vision', '姿态反推成功, 长度=' + finalPose.length);
    // 填入提示词输入框: 保留原提示词, 换行追加姿态描述(便于复制动作)
    const merged = cur ? (cur + '\n' + finalPose) : finalPose;
    promptInput.value = merged;
    document.getElementById('charCount').textContent = merged.length;
    showToast('姿态反推完成，已加入提示词');
    // 本次临时姿态反推要求用完即清
    state.tempPosePrompt = '';
  } catch (e) {
    jsLog('E', 'Vision', '姿态反推失败: ' + e.message);
    showToast('姿态反推失败: ' + e.message, 'error');
  }
}

// ===== 完善反推提示词: 用当前生成图 + 参考原图 给反推 LLM 对比差异, 输出完善后提示词 =====
async function refinePromptWithImage(btn) {
  // 校验视觉模型配置
  if (!state.visionModel) { showToast('请先在设置中配置视觉模型', 'error'); return; }
  if (!state.visionApiKey) { showToast('请先配置视觉模型 API Key', 'error'); return; }

  jsLog('I', 'Vision', '完善入口: btn=' + (typeof btn) + ', hasRef=' + state.references.length + ', previewItem=' + (state.previewItem ? state.previewItem.isEdit : 'none'));

  // 兼容按钮(this)/src 字符串/数组(多张生成图)
  let genSrcs = [];
  if (Array.isArray(btn)) genSrcs = btn;
  else if (typeof btn === 'string') genSrcs = [btn];
  else if (btn && btn.dataset.src) genSrcs = [btn.dataset.src];
  if (!genSrcs.length) { showToast('请先选择要使用的生成图', 'error'); return; }
  // 参考原图: 优先当前 references, 其次历史项记录的 refSavedPath(即使参考图已删)
  let refUrl = null;
  if (state.references.length && state.references[0] && state.references[0].b64) {
    const r = state.references[0];
    refUrl = 'data:' + (r.mime || 'image/png') + ';base64,' + r.b64;
  } else if (state.previewItem && state.previewItem.refSavedPath && hasNativeBridge() && NativeBridge.readSavedFile) {
    try { refUrl = NativeBridge.readSavedFile(state.previewItem.refSavedPath); } catch (e) {}
  }
  // 兜底: 用最近上传的参考图(参考图历史)
  if (!refUrl) {
    try {
      const rh = JSON.parse(localStorage.getItem('gpt_refHistory') || '[]');
      if (rh.length && rh[0].savedPath && hasNativeBridge() && NativeBridge.readSavedFile) {
        refUrl = NativeBridge.readSavedFile(rh[0].savedPath) || null;
      }
    } catch (e) {}
  }
  if (!refUrl) { showToast('请先上传参考原图', 'error'); return; }

  showToast('正在对比完善提示词...');
  try {
    const imgContent = [];
    // 先标注角色, 再放对应图, 确保 LLM 能区分原图/生成图
    imgContent.push({ type: 'text', text: '【参考原图】(第 1 张)：' });
    imgContent.push({ type: 'image_url', image_url: { url: refUrl, detail: 'auto' } });
    genSrcs.forEach(function(s, i) {
      imgContent.push({ type: 'text', text: '【用提示词生成的图 #' + (i + 1) + '】：' });
      imgContent.push({ type: 'image_url', image_url: { url: s, detail: 'auto' } });
    });
    var origPromptEl = document.getElementById('promptInput');
    var origPrompt = origPromptEl ? origPromptEl.value.trim() : '';
    // 提示词框为空时, 兜底用历史项/生成图对应的提示词(避免 LLM 拿不到"需完善的提示词")
    if (!origPrompt && state.previewItem && state.previewItem.prompt) {
      origPrompt = state.previewItem.prompt;
    } else if (!origPrompt && typeof btn === 'string') {
      const hist = getHistory().find(function(h) { return h.savedPath && h.prompt; });
      if (hist) origPrompt = hist.prompt;
    }
    imgContent.push({ type: 'text', text: '上方第一张是参考原图，后面是原提示词生成的图(可能多张)。原提示词：\n' + (origPrompt || '(无原提示词)') + '\n请对比参考原图与各生成图的差异，基于原提示词修改完善成更接近参考原图的提示词（在原有基础上补充/修正，不要推翻重写）。必须用中文输出。只输出完善后的提示词，不要解释。' });

    // 诊断日志: 确认完善请求实际发了什么
    jsLog('I', 'Vision', '完善请求: genSrcs=' + genSrcs.length + ', refUrl=' + (refUrl ? refUrl.length : 0) + ', origPrompt_len=' + origPrompt.length + ', origPrompt=' + origPrompt.slice(0, 80) + ', imgParts=' + imgContent.filter(function(c) { return c.type === 'image_url'; }).length);

    const url = apiUrl(state.visionBaseUrl, '/chat/completions');
    const resp = await apiRequest(url, 'POST', {
      'Authorization': 'Bearer ' + state.visionApiKey,
      'Content-Type': 'application/json',
    }, {
      model: state.visionModel,
      messages: [
        { role: 'system', content: '你是图像反推与对比专家。用户给你参考原图和用某提示词生成的图(可能多张)，你对比两者差异，输出一条**更贴近参考原图**的生图提示词。必须用中文输出。只输出提示词本身，不要任何解释、标题、编号或格式标记。' },
        { role: 'user', content: imgContent },
      ],
      thinking: { type: 'disabled' },
      max_tokens: 1200,
    });
    const data = JSON.parse(resp.body);
    if (resp.status !== 200) throw new Error(data.error?.message || ('HTTP ' + resp.status));
    let content = '';
    const msg = data.choices && data.choices[0] && data.choices[0].message;
    if (msg) {
      if (typeof msg.content === 'string') content = msg.content;
      else if (Array.isArray(msg.content)) content = msg.content.map(function(b) { return b.text || b.content || ''; }).join('');
      if (!content && msg.reasoning_content) content = msg.reasoning_content;
    }
    if (!content) throw new Error('视觉模型未返回结果');
    const finalPrompt = content.trim();
    const promptInput = document.getElementById('promptInput');
    promptInput.value = finalPrompt;
    document.getElementById('charCount').textContent = finalPrompt.length;
    showToast('提示词已完善');
  } catch (e) {
    jsLog('E', 'Vision', '完善失败: ' + e.message);
    showToast('完善失败: ' + e.message, 'error');
  }
}

// 预览图(历史图)对比原图完善 — 由 refinePromptWithImage 判断是否能拿到原图
async function refinePreviewWithImage() {
  const img = document.getElementById('previewImage');
  const src = img && img.src;
  if (!src) { showToast('无图片可完善', 'error'); return; }
  jsLog('I', 'Vision', '完善(预览): src=' + (src ? src.length : 0) + ', previewItem.isEdit=' + (state.previewItem ? state.previewItem.isEdit : 'none') + ', hasRef=' + state.references.length);
  closePreview();
  await refinePromptWithImage(src);
}

// 预览图(历史图) vs 参考原图 分屏对比查看 — 由 openRefCompare 判断是否能拿到原图
function openRefComparePreview() {
  const img = document.getElementById('previewImage');
  const src = img && img.src;
  if (!src) { showToast('无图片可对比', 'error'); return; }
  closePreview();
  openRefCompare(src);
}

// ===== 生成: 分阶段进度反馈 + 心跳守护(防"生成中无响应"体感) =====
async function generate() {
  if (state.generating) return;
  if (!state.apiKey) { showToast('请先配置 API Key', 'error'); return; }

  const prompt = document.getElementById('promptInput').value.trim();
  if (!prompt) { showToast('请输入提示词', 'error'); document.getElementById('promptInput').focus(); return; }

  // 批处理模式: 多张参考图逐张生成
  if (typeof BatchMode !== 'undefined' && BatchMode.isActive()) {
    await generateBatch(prompt);
    return;
  }

  state.lastGeneratePrompt = prompt;
  state.generating = true;
  const btn = document.getElementById('generateBtn');
  const status = document.getElementById('genStatus');
  const statusText = document.getElementById('genStatusText');
  const resultArea = document.getElementById('resultArea');

  btn.disabled = true;
  btn.querySelector('span').textContent = '生成中...';
  status.classList.remove('hidden');
  statusText.textContent = '正在连接 API...';
  updateTaskStatus('正在连接 API...', 'running');
  resultArea.classList.add('hidden');
  const lastTick = { t: Date.now(), step: 0 };
  // 心跳守护: 每 12s 刷新一次进度文字, 证明 JS 线程仍活跃(网络慢时避免"无响应"体感)
  const heartbeat = setInterval(function() {
    if (!state.generating) { clearInterval(heartbeat); return; }
    const elapsed = Math.round((Date.now() - lastTick.t) / 1000);
    lastTick.step = (lastTick.step + 1) % 4;
    const tips = ['正在连接 API...', '已连接到模型, 正在提交任务...', '模型生成中, 请稍候...', '正在等待模型响应...'];
    updateStatus(tips[lastTick.step] + ' (已等 ' + elapsed + 's)');
  }, 12000);

  try {
    const isEdit = state.references.length > 0;
    const result = [];
    // 流式展示: 完成一张立即追加到结果区(不用等全部)
    const onImage = (img) => { result.push(img); appendResultImage(img, isEdit); };
    if (state.taskType === 'video') {
      updateStatus('正在生成视频...');
      const v = await generateVideo(prompt);
      if (v) { result.push(v); appendResultImage(v, false); }
    } else if (isEdit) {
      updateStatus('正在上传参考图(s)...');
      await generateImageEdit(prompt, onImage);
    } else {
      updateStatus('正在生成图片...');
      await generateImage(prompt, onImage);
    }
    clearInterval(heartbeat);
    resultArea.classList.remove('hidden');
    updateTaskStatus('生成完成，共 ' + result.length + (state.taskType === 'video' ? ' 段视频' : ' 张'), 'done');
    showToast(`生成完成 · ${result.length} ${state.taskType === 'video' ? '段视频' : '张图片'}`);
    // 生成后刷新历史页(数据已落盘, 切回历史即见新图, 读图走缓存)
    loadHistory();
  } catch (e) {
    if (e.message?.includes('cancel')) {
      showToast('已取消', 'warn');
      updateTaskStatus('已取消', 'idle');
    } else {
      showToast('生成失败: ' + e.message, 'error');
      console.error('Generate error:', e);
      updateTaskStatus('生成失败: ' + e.message, 'error');
    }
  } finally {
    clearInterval(heartbeat);
    state.generating = false;
    btn.disabled = false;
    btn.querySelector('span').textContent = '开始生成';
    status.classList.add('hidden');
  }
}

// ===== 批处理生成 =====
async function generateBatch(prompt) {
  if (typeof BatchMode === 'undefined') return;
  const files = BatchMode.getFiles();
  if (files.length === 0) { showToast('请先选择参考图', 'error'); return; }

  state.lastGeneratePrompt = prompt;
  state.generating = true;
  const btn = document.getElementById('generateBtn');
  const status = document.getElementById('genStatus');
  const statusText = document.getElementById('genStatusText');
  const resultArea = document.getElementById('resultArea');
  btn.disabled = true;
  btn.querySelector('span').textContent = '生成中...';
  status.classList.remove('hidden');
  resultArea.classList.add('hidden');
  updateTaskStatus('批处理生成中...', 'running');

  const results = [];
  for (let i = 0; i < files.length; i++) {
    if (!state.generating) break;
    statusText.textContent = `处理中 ${i + 1}/${files.length}...`;
    updateTaskStatus(`处理中 ${i + 1}/${files.length}...`, 'running');
    state.refImageB64 = files[i].b64;
    state.refImageName = files[i].name;
    try {
      const imgs = await generateImageEdit(prompt);
      results.push(...imgs);
    } catch (e) {
      showToast(files[i].name + ' 失败: ' + e.message, 'error');
    }
  }

  if (results.length > 0) displayResults(results);
  updateTaskStatus('批处理完成，共 ' + results.length + ' 张', 'done');
  // 批处理完成后刷新历史页
  loadHistory();
  state.generating = false;
  btn.disabled = false;
  btn.querySelector('span').textContent = '开始生成';
  status.classList.add('hidden');
  state.refImageB64 = null;
  state.refImageName = null;
  state.maskB64 = null;
}

// ===== 视频生成 (异步任务基元) =====
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
// 视频端点(相对 baseUrl): 默认 OpenAI 风格 /videos (POST 建任务, GET /videos/{id} 轮询)
function videoEndpoint() {
  return state.videoEndpoint || '/videos';
}
function normalizeVideoDriver(driver) {
  // 未知驱动 → 用通用 OpenAI 视频格式 (最兼容中转的 OpenAI 风格)
  return driver || 'openai_video';
}
function cap(s) { return s[0].toUpperCase() + s.slice(1); }

// 从响应中提取视频结果(url): 兼容多种字段路径 (data[]/output[]/video.url/uri/file_id...)
function resolveVideoResult(data) {
  const pick = (o) => {
    if (!o || typeof o !== 'object') return null;
    if (typeof o.url === 'string') return { url: o.url };
    if (typeof o.output === 'string') return { url: o.output };
    if (typeof o.video_url === 'string') return { url: o.video_url };
    if (typeof o.uri === 'string') return { url: o.uri };
    if (o.video && typeof o.video === 'object') return pick(o.video);
    return null;
  };
  const r = pick(data);
  if (r) return r;
  for (const key of ['data', 'output', 'results', 'videos']) {
    const arr = data[key];
    if (Array.isArray(arr)) {
      for (const item of arr) { const x = pick(item); if (x) return x; }
    }
  }
  return null;
}

// 提交异步任务 → 返回创建响应
async function submitVideoTask(body) {
  const url = apiUrl(state.baseUrl, videoEndpoint());
  const resp = await apiRequest(url, 'POST', apiJsonHeaders(), body);
  const data = JSON.parse(resp.body);
  if (resp.status >= 400) throw new Error(data.error?.message || `HTTP ${resp.status}`);
  return data;
}

// 轮询任务直到完成
async function pollVideoTask(pollUrl, id, timeoutMs) {
  const timeout = timeoutMs || 300000; // 默认 5 分钟
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const resp = await apiRequest(apiUrl(state.baseUrl, pollUrl), 'GET', apiJsonHeaders());
    const data = JSON.parse(resp.body);
    if (resp.status >= 400) throw new Error(data.error?.message || `HTTP ${resp.status}`);
    const status = (data.status || data.state || '').toLowerCase();
    const res = resolveVideoResult(data);
    if (res) return { ...data, ...res };
    if (status === 'completed' || status === 'succeeded' || status === 'success' || status === 'done') {
      return data;
    }
    if (status === 'failed' || status === 'error' || status === 'cancelled') {
      throw new Error(data.message || data.error?.message || '视频生成失败: ' + status);
    }
    await sleep(5000);
  }
  throw new Error('视频生成超时(5分钟), 请稍后重试或查看任务');
}

// 组装视频生成 body (按 driver)
function buildVideoBody(prompt, driver) {
  const ratio = state.video.ratio || '16:9';
  const duration = parseInt(state.video.duration) || 5;
  const i2v = state.references.length > 0 && state.references[0] && state.references[0].b64;
  const body = { model: state.model, prompt };
  if (i2v) body.input_image = 'data:' + (state.references[0].mime || 'image/png') + ';base64,' + state.references[0].b64;
  if (driver === 'openai_video') {
    body.size = ratio === '1:1' ? 'mid' : (ratio === '9:16' ? 'portrait' : (ratio === '16:9' ? 'landscape' : ratio));
    body.seconds = duration;
  } else {
    body.aspect_ratio = ratio;
    body.duration = duration;
    body.size = ratio;
  }
  if (state.requestPolicy === 'relay') {
    if (state.seed) body.seed = parseInt(state.seed);
    if (state.negativePrompt) body.negative_prompt = state.negativePrompt;
  }
  return body;
}

// 视频生成主流程 (异步任务)
async function generateVideo(prompt) {
  const meta = state.modelMeta[state.model] || {};
  const driver = normalizeVideoDriver(driverOf(meta));
  jsLog('I', 'Video', '生成视频: model=' + state.model + ', driver=' + driver + ', duration=' + state.video.duration + ', ratio=' + state.video.ratio + ', i2v=' + (state.references.length > 0) + ', baseUrl=' + state.baseUrl);
  const body = buildVideoBody(prompt, driver);
  const submit = await submitVideoTask(body);
  const r = resolveVideoResult(submit);
  if (r) return { ...r, kind: 'video', mime: 'video/mp4', duration: state.video.duration, prompt: prompt, model: state.model };
  const id = submit.id || submit.task_id || submit.request_id || submit.vid || '';
  if (!id) throw new Error('视频任务未返回任务 ID: ' + JSON.stringify(submit).slice(0, 200));
  const pollUrl = videoEndpoint().replace(/\/$/, '') + '/' + id;
  const done = await pollVideoTask(pollUrl, id);
  const res = resolveVideoResult(done);
  if (!res || !res.url) throw new Error('未能从任务结果解析视频地址: ' + JSON.stringify(done).slice(0, 200));
  return { ...res, kind: 'video', mime: 'video/mp4', duration: state.video.duration, prompt: prompt, model: state.model };
}

// ===== 任务类型切换 (图像 / 视频) =====
function setTaskType(type) {
  state.taskType = type === 'video' ? 'video' : 'image';
  document.querySelectorAll('#taskTypeGroup .pill').forEach(function(p) {
    p.classList.toggle('active', p.dataset.task === state.taskType);
  });
  renderImageModelMenu();
  const list = state.taskType === 'video' ? state.videoModels : state.imageModels;
  if (list.length && !list.includes(state.model)) state.model = list[0];
  syncCustomSelect('csModel', 'model', state.model);
  const imgP = document.getElementById('imageParams');
  const vidP = document.getElementById('videoParams');
  if (imgP) imgP.classList.toggle('open', state.taskType !== 'video');
  if (vidP) vidP.classList.toggle('open', state.taskType === 'video');
  // 界面区分: 生成按钮文案 + 提示词占位随任务类型切换
  const genSpan = document.querySelector('#generateBtn span');
  if (genSpan) genSpan.textContent = state.taskType === 'video' ? '生成视频' : '开始生成';
  const pInput = document.getElementById('promptInput');
  if (pInput) pInput.placeholder = state.taskType === 'video'
      ? '描述你想生成的视频\n例如: 一只橘猫在窗台上看日落, 镜头缓慢拉近, 微风拂过'
      : '描述你想生成的图片\n例如: 一只橘猫坐在窗台上，窗外是城市夜景，赛博朋克风格';
}

// 视频参数 setter (index.html pill/按钮)
function setVideoParam(key, val) {
  state.video[key] = val;
  const el = document.getElementById('video' + cap(key) + 'Val');
  if (el) el.textContent = val;
  document.querySelectorAll('#videoParamsGroup_' + key + ' .pill').forEach(function(p) {
    p.classList.toggle('active', p.dataset.val === val);
  });
}

// ===== 文生图 (generate) =====
async function generateImage(prompt, onImage) {
  // 记录实际使用的模型与 API 形态
  jsLog('I', 'Model', '生成: model=' + state.model + ', apiMode=' + state.apiMode + ', requestPolicy=' + state.requestPolicy + ', format=' + state.format + ', baseUrl=' + state.baseUrl);
  // 按 profile 配置的 apiMode 选端点, 与模型名解耦
  if (state.apiMode === 'images') {
    return generateImageViaImagesAPI(prompt, null, onImage);
  }
  // 默认 responses
  return generateImageViaResponsesAPI(prompt, null, onImage);
}

// Responses API 文生图
async function generateImageViaResponsesAPI(prompt, onImage) {
  const url = apiUrl(state.baseUrl, '/responses');
  // Responses API 的 image_generation tool 不支持 n>1(多数中转忽略 n, 只返回 1 张);
  // 要 n 张 → 并发发 n 次请求, 每次 n=1, 再合并结果
  const count = Math.max(1, parseInt(state.n) || 1);
  if (count === 1) {
    const body = buildResponsesImageBody(prompt, null);
    const resp = await apiRequest(url, 'POST', apiJsonHeaders(), body);
    const imgs = await parseResponsesImageResponse(resp, prompt, false);
    imgs.forEach(im => onImage && onImage(im));
    return imgs;
  }
  const jobs = [];
  for (let i = 0; i < count; i++) {
    const body = buildResponsesImageBody(prompt, null);
    jobs.push(apiRequest(url, 'POST', apiJsonHeaders(), body));
  }
  const resps = await Promise.all(jobs);
  const all = [];
  // 每张完成即回调 onImage(先落盘历史, 后逐张展示)
  resps.forEach(resp => { parseResponsesImageResponseRaw(resp, prompt).forEach(im => { all.push(im); onImage && onImage(im); }); });
  if (all.length === 0) throw new Error('未获取到生成的图片');
  await saveImagesHistory(all, prompt, false);
  return all;
}

// 构造 Responses API 文生图 body(单张)
function buildResponsesImageBody(prompt, extra) {
  const body = {
    model: state.model,
    input: [{ type: 'input_text', text: prompt }],
    tools: [{ type: 'image_generation', size: state.size, n: 1 }],
  };
  if (state.quality && state.quality !== 'auto') body.tools[0].quality = state.quality;
  applyAdvancedParams(body.tools[0]);
  if (state.requestPolicy === 'relay') {
    if (state.seed) body.tools[0].seed = parseInt(state.seed);
    if (state.negativePrompt) body.tools[0].negative_prompt = state.negativePrompt;
    if (shouldSendStyle()) body.tools[0].style = state.style;
  }
  if (extra) Object.assign(body, extra);
  return body;
}

// Images API 文生图
async function generateImageViaImagesAPI(prompt, onImage) {
  const url = apiUrl(state.baseUrl, '/images/generations');
  const body = {
    model: state.model,
    prompt,
    size: state.size,
    n: state.n,
    // images/generations 的 response_format 只接受 b64_json/url, 图片格式用 output_format
    response_format: 'b64_json',
  };
  if (state.format && state.format !== 'png') body.output_format = state.format;
  // Auto 质量: 不传 quality, 交给上游; 否则按选择传
  if (state.quality && state.quality !== 'auto') body.quality = state.quality;
  if (state.requestPolicy === 'relay') {
    if (state.seed) body.seed = parseInt(state.seed);
    if (state.negativePrompt) body.negative_prompt = state.negativePrompt;
    if (shouldSendStyle()) body.style = state.style;
  }
  applyAdvancedParams(body);

  // 多数中转不理会 images.generations 的 n, 只返回 1 张; 补偿: 不满 n 张再补发单张直到凑齐
  const resp = await apiRequest(url, 'POST', apiJsonHeaders(), body);
  let images = parseImagesResponseRaw(resp, prompt);
  images.forEach(im => onImage && onImage(im));
  const want = Math.max(1, parseInt(state.n) || 1);
  if (images.length < want) {
    for (let i = images.length; i < want; i++) {
      const one = { ...body, n: 1 };
      const r2 = await apiRequest(url, 'POST', apiJsonHeaders(), one);
      const more = parseImagesResponseRaw(r2, prompt);
      more.forEach(im => onImage && onImage(im));
      if (more.length) images = images.concat(more);
      else break;
    }
  }
  if (images.length === 0) throw new Error('未获取到生成的图片');
  await saveImagesHistory(images, prompt, false);
  return images;
}

// ===== 图生图 / 编辑 (edit) =====
async function generateImageEdit(prompt, onImage) {
  // 编辑必须提供源图
  if (!state.refImageB64) throw new Error('请先选择参考图');
  // DALL·E 3 不支持图生图
  if (state.model === 'dall-e-3') throw new Error('DALL·E 3 不支持图生图/编辑，请切换模型为 gpt-image-1');

  if (state.apiMode === 'images') {
    return generateEditViaImagesAPI(prompt, onImage);
  }
  // 默认 responses
  return generateEditViaResponsesAPI(prompt, onImage);
}

// Responses API 编辑: 源图转 data URL 走 input_image
async function generateEditViaResponsesAPI(prompt, onImage) {
  const url = apiUrl(state.baseUrl, '/responses');
  // Responses API 的 image_generation tool 不支持 n>1; 要 n 张 → 并发 n 次, 每次 n=1
  const count = Math.max(1, parseInt(state.n) || 1);
  if (count === 1) {
    const body = buildResponsesEditBody(prompt);
    const resp = await apiRequest(url, 'POST', apiJsonHeaders(), body);
    const imgs = await parseResponsesImageResponse(resp, prompt, true);
    imgs.forEach(im => onImage && onImage(im));
    return imgs;
  }
  const jobs = [];
  for (let i = 0; i < count; i++) {
    jobs.push(apiRequest(url, 'POST', apiJsonHeaders(), buildResponsesEditBody(prompt)));
  }
  const resps = await Promise.all(jobs);
  const all = [];
  resps.forEach(resp => { parseResponsesImageResponseRaw(resp, prompt).forEach(im => { all.push(im); onImage && onImage(im); }); });
  if (all.length === 0) throw new Error('未获取到生成的图片');
  await saveImagesHistory(all, prompt, true);
  return all;
}

// 构造 Responses API 编辑 body(单张)
function buildResponsesEditBody(prompt) {
  const body = {
    model: state.model,
    input: [{ type: 'input_text', text: prompt }],
    tools: [{ type: 'image_generation', size: state.size, n: 1 }],
  };
  if (state.quality && state.quality !== 'auto') body.tools[0].quality = state.quality;
  if (state.refImageB64) {
    const refs = state.references.length ? state.references : [{ b64: state.refImageB64, name: state.refImageName || 'reference.png' }];
    body.input = [];
    refs.forEach(r => {
      body.input.push({ type: 'input_image', image_url: 'data:image/png;base64,' + r.b64 });
    });
    body.input.push({ type: 'input_text', text: prompt });
  }
  if (state.maskB64) body.tools[0].mask = `data:image/png;base64,${state.maskB64}`;
  applyAdvancedParams(body.tools[0]);
  if (state.requestPolicy === 'relay') {
    if (state.seed) body.tools[0].seed = parseInt(state.seed);
    if (state.negativePrompt) body.tools[0].negative_prompt = state.negativePrompt;
    if (shouldSendStyle()) body.tools[0].style = state.style;
  }
  return body;
}

// Images API 编辑: multipart /v1/images/edits + mask
async function generateEditViaImagesAPI(prompt, onImage) {
  const url = apiUrl(state.baseUrl, '/images/edits');
  const refs = state.references.length ? state.references : [{ b64: state.refImageB64, name: state.refImageName || 'reference.png' }];

  // edits 走原生 multipart(WebView fetch 有 CORS, 原生绕开; 中转要 multipart)
  jsLog('I', 'Edit', 'edits 走 multipart(原生), model=' + state.model + ', refs=' + refs.length);
  const fields = { model: state.model, prompt: prompt, size: state.size, n: String(state.n) };
  const files = refs.map(function(r, ri) {
    return { name: 'image', filename: (r.name || ('reference_' + ri)) + '.' + ((r.mime || 'image/png') === 'image/jpeg' ? 'jpg' : 'png'), b64: r.b64, mime: r.mime || 'image/png' };
  });
  if (state.maskB64) files.push({ name: 'mask', filename: 'mask.png', b64: state.maskB64, mime: 'image/png' });
  // 与文生图 Images API 对齐的完整参数集(仅非默认值才传, 避免中转对空字段报错)
  if (state.format && state.format !== 'png') fields.output_format = state.format;
  if (state.quality && state.quality !== 'auto') fields.quality = state.quality;
  if (state.background && state.background !== 'auto') fields.background = state.background;
  if (state.moderation && state.moderation !== 'auto') fields.moderation = state.moderation;
  if (state.inputFidelity && state.inputFidelity !== 'auto') fields.input_fidelity = state.inputFidelity;
  if (state.outputCompression && state.outputCompression !== '') fields.output_compression = String(parseInt(state.outputCompression));
  if (state.userIdentifier && state.userIdentifier.trim()) fields.user = state.userIdentifier.trim();
  if (state.requestPolicy === 'relay') {
    if (state.seed) fields.seed = String(parseInt(state.seed));
    if (state.negativePrompt) fields.negative_prompt = state.negativePrompt;
    if (shouldSendStyle()) fields.style = state.style;
  }
  // 中转可能忽略 edits 的 n 只返回 1 张; 补偿: 不满 n 张再补发单张直到凑齐
  const headers = { 'Authorization': 'Bearer ' + state.apiKey };
  const resp = await apiRequestMultipart(url, 'POST', headers, fields, files);
  let images = parseImagesResponseRaw(resp, prompt);
  images.forEach(im => onImage && onImage(im));
  const want = Math.max(1, parseInt(state.n) || 1);
  if (images.length < want) {
    for (let i = images.length; i < want; i++) {
      const oneFields = { ...fields, n: '1' };
      const r2 = await apiRequestMultipart(url, 'POST', headers, oneFields, files);
      const more = parseImagesResponseRaw(r2, prompt);
      more.forEach(im => onImage && onImage(im));
      if (more.length) images = images.concat(more);
      else break;
    }
  }
  if (images.length === 0) throw new Error('未获取到生成的图片');
  await saveImagesHistory(images, prompt, true);
  return images;
}

// ===== 公共工具 =====
function apiJsonHeaders() {
  return { 'Authorization': `Bearer ${state.apiKey}`, 'Content-Type': 'application/json' };
}
// 给参数对象附加高级字段(仅非默认值才传, 避免中转报错)
function applyAdvancedParams(body) {
  if (state.background && state.background !== 'auto') body.background = state.background;
  if (state.moderation && state.moderation !== 'auto') body.moderation = state.moderation;
  if (state.inputFidelity && state.inputFidelity !== 'auto') body.input_fidelity = state.inputFidelity;
  if (state.outputCompression && state.outputCompression !== '') body.output_compression = parseInt(state.outputCompression);
  if (state.userIdentifier && state.userIdentifier.trim()) body.user = state.userIdentifier.trim();
}

// 给 body 附加高级参数字段(非默认值才传, 避免中转报错)
// style 参数只对 DALL·E 3 有效; gpt-image 系列不支持, 传了会被中转拒绝(unknown_parameter)
function shouldSendStyle() {
  return !!(state.style && state.model && /dall/i.test(state.model));
}

// 解析 Responses API 响应
async function parseResponsesImageResponse(resp, prompt, isEdit) {
  const images = parseResponsesImageResponseRaw(resp, prompt);
  await saveImagesHistory(images, prompt, isEdit);
  return images;
}

// 纯解析 Responses API 响应(不保存历史)
function parseResponsesImageResponseRaw(resp, prompt) {
  const data = JSON.parse(resp.body);
  if (resp.status !== 200) throw new Error(data.error?.message || `HTTP ${resp.status}`);
  const images = [];
  if (data.output) {
    for (const item of data.output) {
      if (item.type !== 'image_generation_call' || !item.result) continue;
      // item.result 可能是字符串(单张 b64/url) 或 数组(n 张, 每项可能是字符串或 {b64_json,url})
      const vals = Array.isArray(item.result) ? item.result : [item.result];
      for (const v of vals) {
        if (!v) continue;
        if (typeof v === 'string') {
          images.push({ b64: v, url: null, revised_prompt: item.revised_prompt || prompt });
        } else {
          // 对象: { b64_json|url }
          images.push({ b64: v.b64_json || null, url: v.url || null, revised_prompt: item.revised_prompt || prompt });
        }
      }
    }
  }
  if (images.length === 0) throw new Error('未获取到生成的图片');
  return images;
}

// 解析 Images API 响应
async function parseImagesResponse(resp, prompt, isEdit) {
  const images = parseImagesResponseRaw(resp, prompt);
  await saveImagesHistory(images, prompt, isEdit);
  return images;
}

// 纯解析 Images API 响应(不保存历史)
function parseImagesResponseRaw(resp, prompt) {
  const data = JSON.parse(resp.body);
  if (resp.status !== 200) throw new Error(data.error?.message || `HTTP ${resp.status}`);
  const images = [];
  if (data.data) {
    data.data.forEach(item => {
      // 一项可能是单张(b64_json/url) 或 多张数组(部分中转把 n 张折叠进一项)
      const b64s = Array.isArray(item.b64_json) ? item.b64_json : [item.b64_json];
      const urls = Array.isArray(item.url) ? item.url : [item.url];
      // 取该项能贡献的最大张数: 优先 b64, 否则 url
      const max = Math.max(b64s.length, urls.length);
      for (let i = 0; i < max; i++) {
        images.push({ b64: b64s[i] || null, url: urls[i] || null, revised_prompt: item.revised_prompt || prompt });
      }
    });
  }
  if (images.length === 0) throw new Error('未获取到生成的图片');
  return images;
}

// 统一保存生成历史 (异步落盘, 不阻塞 UI)
async function saveImagesHistory(images, prompt, isEdit) {
  for (const img of (images || [])) {
    await saveToHistory({
      prompt, revisedPrompt: img.revised_prompt, b64: img.b64, url: img.url,
      kind: img.kind || 'image', duration: img.duration,
      size: state.size, quality: state.quality, model: state.model,
      format: state.format, seed: state.seed, style: state.style,
      timestamp: Date.now(), isEdit: !!isEdit,
    });
  }
}

// b64 → Blob
function b64ToBlob(b64, type) {
  const byteString = atob(b64);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);
  for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
  return new Blob([ab], { type: type || 'image/png' });
}

function updateStatus(text) {
  document.getElementById('genStatusText').textContent = text;
  updateTaskStatus(text, 'running');
}

// 历史页当前任务状态
function updateTaskStatus(text, type) {
  const card = document.getElementById('taskStatusCard');
  const badge = document.getElementById('taskStatusBadge');
  const body = document.getElementById('taskStatusBody');
  if (!card) return;
  if (type === 'idle') {
    badge.textContent = '空闲'; badge.className = 'task-status-badge idle';
    body.textContent = '暂无进行中的任务'; return;
  }
  if (type === 'error') {
    badge.textContent = '失败'; badge.className = 'task-status-badge error';
    body.textContent = text || '生成失败'; return;
  }
  if (type === 'done') {
    badge.textContent = '完成'; badge.className = 'task-status-badge done';
    body.textContent = text || '生成完成'; return;
  }
  badge.textContent = '进行中'; badge.className = 'task-status-badge running';
  body.textContent = text || '正在处理...';
}


function cancelGeneration() {
  state.generating = false;
  if (hasNativeBridge() && state.currentRequestId) {
    NativeBridge.cancelRequest(state.currentRequestId);
    // JS 侧立即 reject 挂起的请求, 让 generate() 的 await 抛错走 catch/finally, 恢复 UI
    const req = window._nativeBridge.pendingRequests[state.currentRequestId];
    if (req) {
      delete window._nativeBridge.pendingRequests[state.currentRequestId];
      req.reject(new Error('cancel: 用户取消'));
    }
  }
  const btn = document.getElementById('generateBtn');
  btn.disabled = false;
  btn.querySelector('span').textContent = '开始生成';
  document.getElementById('genStatus').classList.add('hidden');
  state.currentRequestId = null;
  clearTaskStatus();
}

// ===== 自动落盘(应用私有目录, 免权限; 生成即存) — 异步桥, 避免大 base64 同步解码阻塞 JS 主线程 =====
function autoSaveImage(img) {
  if (!img || !img.b64) return Promise.resolve();
  if (!hasNativeBridge() || !NativeBridge.saveToPrivateDirAsync) return Promise.resolve();
  const ext = state.format === 'jpeg' ? 'jpg' : state.format;
  const name = 'GPTImage_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6) + '.' + ext;
  return bridgeInvoke('saveToPrivateDirAsync', img.b64, name).then(path => {
    if (path) img.savedPath = path;
  }).catch(() => {});
}

// ===== 结果展示 =====
function resultItemHTML(img, isEdit) {
  const isVideo = img.kind === 'video';
  const src = isVideo ? img.url : (img.b64 ? `data:image/${state.format};base64,${img.b64}` : img.url);
  const isSel = state.refineSelected.indexOf(src) >= 0;
  const refForImg = img.refSavedPath || state.lastEditRefSavedPath || '';
  const mediaEl = isVideo
    ? `<video src="${src}" controls playsinline preload="metadata"></video>`
    : `<img src="${src}" alt="生成结果" loading="lazy">`;
  const imgOnlyActions = isVideo ? '' : `
        <button class="btn-sm" onclick="copyImageToClipboard(this)" data-src="${src}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <rect x="9" y="9" width="13" height="13" rx="2"/>
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
          </svg>
          复制
        </button>
        <button class="btn-sm" onclick="openEditor(this)" data-src="${src}" data-prompt="${(state.lastGeneratePrompt || '').replace(/"/g, '&quot;')}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
          编辑
        </button>`;
  return `
      ${mediaEl}
      ${isEdit ? `<button class="refine-check ${isSel ? 'on' : ''}" onclick="toggleRefineSelect(this)" data-src="${src}" title="勾选用于「完善提示词」">✓</button>` : ''}
      <div class="result-actions">
        <button class="btn-sm btn-accent" onclick="saveResultImage(this)" data-src="${src}" data-target="gallery" data-ref="${refForImg}" data-kind="${isVideo ? 'video' : 'image'}" title="保存到相册">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="7 10 12 15 17 10"/>
            <line x1="12" y1="15" x2="12" y2="3"/>
          </svg>
        </button>
        <button class="btn-sm" onclick="saveResultImage(this)" data-src="${src}" data-target="dir" data-kind="${isVideo ? 'video' : 'image'}" title="保存到指定目录">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
          目录
        </button>
        ${imgOnlyActions}
        ${isEdit ? `<button class="btn-sm" onclick="refinePromptWithImage(this)" data-src="${src}" title="用此图与原图对比，完善反推提示词">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="13" height="13"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/></svg>
          完善提示词
        </button>
        <button class="btn-sm" onclick="openRefCompare(this)" data-src="${src}" data-ref="${refForImg}" title="生成图与原图分屏对比查看">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="13" height="13"><path d="M12 3v18"/><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
          原图对比
        </button>` : ''}
      </div>`;
}

// 向结果区追加一张(流式: 完成一张显示一张)
function appendResultImage(img, isEdit) {
  const grid = document.getElementById('resultGrid');
  const area = document.getElementById('resultArea');
  if (!grid) return;
  const src = img.b64 ? `data:image/${state.format};base64,${img.b64}` : img.url;
  const isSel = state.refineSelected.indexOf(src) >= 0;
  const div = document.createElement('div');
  div.className = 'result-item' + (isSel ? ' refine-selected' : '');
  div.innerHTML = resultItemHTML(img, isEdit);
  grid.appendChild(div);
  // 图生图结果区加 tool bar(勾选完善/原图对比)
  if (isEdit) ensureResultToolbar();
  if (area) area.classList.remove('hidden');
}

// 确保结果区操作栏存在(仅图生图)
function ensureResultToolbar() {
  const area = document.getElementById('resultArea');
  if (!area || area.querySelector('.result-toolbar')) return;
  const bar = document.createElement('div');
  bar.className = 'result-toolbar';
  bar.innerHTML = `
      <button class="btn-sm btn-accent" onclick="refinePromptWithImage(state.refineSelected)" style="flex:1">用选中图完善提示词 (<span id="refineCount">0</span>)</button>
      <button class="btn-sm" onclick="openRefCompareAll()" style="flex:1">原图对比</button>`;
  area.appendChild(bar);
  updateRefineCount();
}

function displayResults(images, isEdit) {
  isEdit = !!isEdit;
  const grid = document.getElementById('resultGrid');
  const area = document.getElementById('resultArea');
  grid.innerHTML = '';

  images.forEach(img => {
    const src = img.b64 ? `data:image/${state.format};base64,${img.b64}` : img.url;
    const isSel = state.refineSelected.indexOf(src) >= 0;
    // 记录本张生成图用的参考原图(生成时落盘路径), 供"原图对比"精确匹配
    const refForImg = img.refSavedPath || state.lastEditRefSavedPath || '';
    const div = document.createElement('div');
    div.className = 'result-item' + (isSel ? ' refine-selected' : '');
    div.innerHTML = resultItemHTML(img, isEdit);

    grid.appendChild(div);
  });

  // 结果区操作栏: 用勾选的图完善提示词(支持多选) + 原图对比 (仅图生图)
  area.querySelectorAll('.result-toolbar').forEach(function(t) { t.remove(); });
  if (isEdit) {
    const bar = document.createElement('div');
    bar.className = 'result-toolbar';
    bar.innerHTML = `
      <button class="btn-sm btn-accent" onclick="refinePromptWithImage(state.refineSelected)" style="flex:1">用选中图完善提示词 (<span id="refineCount">0</span>)</button>
      <button class="btn-sm" onclick="openRefCompareAll()" style="flex:1">原图对比</button>`;
    area.appendChild(bar);
    updateRefineCount();
  }

  area.classList.remove('hidden');
  area.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  showToast(`生成完成 · ${images.length} ${state.taskType === 'video' ? '段视频' : '张图片'}`);
}

// 更新已勾选完善的数量
function updateRefineCount() {
  const c = document.getElementById('refineCount');
  if (c) c.textContent = state.refineSelected.length;
}

// 结果区多张图 与 原图 分屏对比(用第一张生成图)
function openRefCompareAll() {
  const s = state.refineSelected[0];
  if (!s) { const first = document.querySelector('.result-item img'); if (first) openRefCompare(first.src); else showToast('暂无生成图', 'error'); return; }
  openRefCompare(s);
}

// ===== 画板编辑入口 =====
function openEditor(btnOrSrc, prompt) {
  if (typeof CanvasEditor === 'undefined' || !CanvasEditor.open) {
    showToast('画板模块未加载', 'error');
    return;
  }
  const src = typeof btnOrSrc === 'string' ? btnOrSrc : btnOrSrc.dataset.src;
  if (!src) { showToast('图片数据缺失', 'error'); return; }
  // 该图对应的提示词(结果区 data-prompt / 预览传入 / 上次生成 prompt)
  const editPrompt = (typeof prompt === 'string' ? prompt : '')
    || ((btnOrSrc && btnOrSrc.dataset && btnOrSrc.dataset.prompt) || '')
    || state.lastGeneratePrompt || '';
  CanvasEditor.open(src, (b64, maskB64) => {
    applyEditedImageToGenerate(b64, maskB64, editPrompt);
  });
}

// 画板编辑结果 → 覆盖参考图 + 覆盖提示词, 回生成页
function applyEditedImageToGenerate(rawB64, maskB64, prompt) {
  const raw = rawB64.split(',')[1] || rawB64;
  state.refImageB64 = raw;
  state.refImageName = 'edited.png';
  // 蒙版(若有)存起来, 生成时传给模型做局部编辑
  state.maskB64 = maskB64 ? (maskB64.split(',')[1] || maskB64) : null;
  // 覆盖参考图: 清空后只保留编辑后的图
  state.references = [];
  addRefImage(raw, 'edited.png');
  // 覆盖提示词
  if (typeof prompt === 'string' && prompt) {
    const promptInput = document.getElementById('promptInput');
    if (promptInput) promptInput.value = prompt;
    const charCount = document.getElementById('charCount');
    if (charCount) charCount.textContent = prompt.length;
  }
  switchTab('generate');
  showToast(maskB64 ? '画板编辑已保存（含蒙版），点击生成进行局部编辑'
                    : '画板编辑已保存，已设为参考图，点击生成进行图生图');
}

// ===== 保存图片 =====
// 权限感知保存: 有权限存指定目录, 无权限存相册(公共可见)
function saveWithPermission(b64, name, src, isUrl) {
  if (hasAllFilesAccess()) {
    // 有权限 → 存指定目录
    if (isUrl) {
      const ok = NativeBridge.saveUrlToDir(src, name, state.outputDir);
      showToast(ok ? '已保存到目录' : '保存到目录失败', ok ? 'ok' : 'error');
    } else {
      const ok = NativeBridge.saveToDir(b64, name, state.outputDir);
      showToast(ok ? '已保存到目录' : '保存到目录失败', ok ? 'ok' : 'error');
    }
  } else {
    // 无权限 → 存相册(MediaStore, 免权限, 系统相册可见)
    if (isUrl) {
      const ok = NativeBridge.saveImageFromUrl(src, name);
      showToast(ok ? '已保存到相册' : '保存到相册失败', ok ? 'ok' : 'error');
    } else {
      const ok = NativeBridge.saveImage(b64, name);
      showToast(ok ? '已保存到相册' : '保存到相册失败', ok ? 'ok' : 'error');
    }
  }
}

// btnOrSrc: 按钮(this) 或 src 字符串; target: 'gallery'(相册) | 'dir'(指定目录)
async function saveResultImage(btnOrSrc, ts) {
  const src = typeof btnOrSrc === 'string' ? btnOrSrc : (btnOrSrc && btnOrSrc.dataset && btnOrSrc.dataset.src);
  const target = (btnOrSrc && btnOrSrc.dataset && btnOrSrc.dataset.target) || 'gallery';
  // 记录媒体类型(图片/视频), 决定保存方式与扩展名
  const kind = (btnOrSrc && btnOrSrc.dataset && btnOrSrc.dataset.kind) || 'image';
  // 规范化时间戳(只留数字), 防止传入含扩展名的字符串导致 .xxx.png.png
  if (typeof ts === 'string' && !/^\d+$/.test(ts)) {
    const m = ts.match(/\d+/);
    ts = m ? m[0] : Date.now();
  }
  ts = ts || Date.now();
  if (!src) return;
  if (src.startsWith('data:')) {
    const b64 = src.split(',')[1];
    const ext = state.format === 'jpeg' ? 'jpg' : state.format;
    const name = `GPTImage_${ts}.${ext}`;
    if (hasNativeBridge()) {
      if (target === 'dir') {
        saveWithPermission(b64, name, src, false);
      } else {
        const ok = NativeBridge.saveImage(b64, name);
        showToast(ok ? '已保存到相册' : '保存到相册失败', ok ? 'ok' : 'error');
      }
    } else {
      const a = document.createElement('a'); a.href = src; a.download = name; a.click();
      showToast('已下载');
    }
  } else if (src.startsWith('http')) {
    const name = kind === 'video' ? `GPTImage_${ts}.mp4` : `GPTImage_${ts}.png`;
    if (hasNativeBridge()) {
      if (target === 'dir') {
        saveWithPermission('', name, src, true);
      } else if (kind === 'video') {
        const ok = NativeBridge.saveVideoFromUrl(src, name);
        showToast(ok ? '已保存到相册' : '保存到相册失败', ok ? 'ok' : 'error');
      } else {
        const ok = NativeBridge.saveImageFromUrl(src, name);
        showToast(ok ? '已保存到相册' : '保存到相册失败', ok ? 'ok' : 'error');
      }
    } else {
      const a = document.createElement('a'); a.href = src; a.download = name; a.target = '_blank'; a.click();
      showToast('已下载');
    }
  }
}

async function copyImageToClipboard(btn) {
  try {
    const src = btn.dataset.src;
    const resp = await fetch(src);
    const blob = await resp.blob();
    await navigator.clipboard.write([
      new ClipboardItem({ [blob.type]: blob })
    ]);
    showToast('已复制到剪贴板');
  } catch {
    showToast('复制失败', 'error');
  }
}

// ===== 历史管理 =====
function getHistory() {
  try {
    return JSON.parse(localStorage.getItem('gpt_history') || '[]');
  } catch {
    return [];
  }
}

async function saveToHistory(item) {
  // 生成即自动落盘到应用私有目录(免权限, 一直保留; 用户删历史才删) — 异步, 不阻塞 UI
  await autoSaveImage(item);
  // 编辑(图生图)时记录用到的参考原图, 供历史页"对比原图"用(即使参考图之后被删)
  if (item.isEdit && state.references.length && hasNativeBridge() && NativeBridge.saveToPrivateDirAsync) {
    try {
      const ref = state.references[0];
      const refName = 'ref_' + Date.now() + '.' + (ref.mime === 'image/jpeg' ? 'jpg' : 'png');
      const refPath = await bridgeInvoke('saveToPrivateDirAsync', ref.b64, refName).catch(() => '');
      if (refPath) { item.refSavedPath = refPath; state.lastEditRefSavedPath = refPath; }
    } catch (e) {}
  }
  // 落盘成功 → 把 base64 填入读图缓存(生成后切历史页立即显示, 无需重读文件)
  if (item.savedPath && item.b64) {
    _fileImageCache[item.savedPath] = 'data:image/' + (item.format || 'png') + ';base64,' + item.b64;
  }
  // 图生图参考原图同样填缓存(供"原图对比"快速显示)
  if (item.refSavedPath && state.references.length && state.references[0]) {
    const ref = state.references[0];
    _fileImageCache[item.refSavedPath] = 'data:' + (ref.mime || 'image/png') + ';base64,' + ref.b64;
  }
  const history = getHistory();
  // 已有落盘文件则不存大 base64(只存路径), 避免 localStorage 超配额
  if (item.savedPath) { delete item.b64; }
  history.unshift(item);
  if (history.length > 120) history.length = 120;
  try { localStorage.setItem('gpt_history', JSON.stringify(history)); } catch (e) { jsLog('E', 'History', '保存历史失败: ' + e.message); }
}

function loadHistory() {
  const history = getHistory();
  const grid = document.getElementById('historyGrid');
  const empty = document.getElementById('historyEmpty');
  const count = document.getElementById('historyCount');

  // 搜索 + 模式筛选 (修复: 之前设置了 state 但未生效)
  let filtered = history;
  if (state.historyFilter) {
    const q = state.historyFilter.toLowerCase();
    filtered = filtered.filter(h => (h.prompt || '').toLowerCase().includes(q));
  }
  if (state.historyModeFilter === 'gen') filtered = filtered.filter(h => !h.isEdit);
  else if (state.historyModeFilter === 'edit') filtered = filtered.filter(h => h.isEdit);

  count.textContent = `${filtered.length} 张图片`;

  if (filtered.length === 0) {
    grid.innerHTML = history.length === 0 ? '' : '<div class="history-empty" style="display:flex;flex-direction:column;align-items:center;gap:12px;padding:60px 20px;color:var(--fg-muted);font-size:var(--fs-sm)"><span>没有匹配的历史记录</span></div>';
    empty.classList.remove('hidden');
    return;
  }

  empty.classList.add('hidden');
  grid.innerHTML = '';

  filtered.forEach((item, idx) => {
    const isVideo = item.kind === 'video';
    let src = item.b64 ? `data:image/${item.format || 'png'};base64,${item.b64}` : item.url;
    // 有落盘路径但无 base64(省内存): 从磁盘读(参考 Image Studio, 历史不存大图)
    let pendingRead = false;
    if (!src && item.savedPath && hasNativeBridge() && NativeBridge.readSavedFileAsync) {
      pendingRead = true;
    }
    if (!src && !pendingRead) return;

    const favKey = item.timestamp;
    const isFav = state.favHistory.includes(favKey);
    const favIcon = isFav
      ? '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';

    const div = document.createElement('div');
    div.className = 'history-item' + (isFav ? ' faved' : '');
    div.setAttribute('data-ts', item.timestamp);
    div.innerHTML = `
      ${isVideo ? '<video src="' + src + '" controls playsinline preload="metadata"></video>' : '<img src="' + src + '" alt="" loading="lazy">'}
      <span class="hi-badge ${item.isEdit ? 'edit' : (isVideo ? 'video' : 'gen')}">${isVideo ? '视频' : (item.isEdit ? '图生图' : '文生图')}</span>
      <div class="hi-prompt">${escapeHtml(item.prompt)}</div>
      <button class="hi-fav ${isFav ? 'faved' : ''}" onclick="event.stopPropagation();toggleFavHistory(${favKey})" title="收藏">${favIcon}</button>
      <button class="hi-reuse" onclick="event.stopPropagation();reuseHistoryItem(${item.timestamp})" title="填入提示词/参考图/参数到生成页">填入</button>
      <button class="hi-del" onclick="event.stopPropagation();confirmDeleteHistory(${item.timestamp})">✕</button>`;
    div.onclick = (e) => {
      // 用当前 img 的实际 src(异步读图完成后的), 避免闭包捕获到初始空值导致预览空白
      const im = div.querySelector('img');
      const curSrc = im ? im.src : src;
      if (e.shiftKey) { openHistoryCompare(item, curSrc); return; }
      openPreview(item, curSrc);
    };
    grid.appendChild(div);
    // 落盘历史图(无 b64 缺省内存): 缓存读文件填充(首次读后缓存, 避免每次切页全量重读)
    if (pendingRead) {
      cachedReadFile(item.savedPath).then(read => {
        if (!read || !div.isConnected) return;
        const im = div.querySelector('img');
        if (im) im.src = read;
      });
    }
  });
  renderRefHistory();
}

// ===== 参考图历史 (用户管理, 不自动删) =====
function renderRefHistory() {
  const grid = document.getElementById('refHistoryGrid');
  const count = document.getElementById('refHistoryCount');
  if (!grid) return;
  let rh = [];
  try { rh = JSON.parse(localStorage.getItem('gpt_refHistory') || '[]'); } catch (e) {}
  if (count) count.textContent = rh.length + ' 张';
  grid.innerHTML = '';
  // 限 20 张 + 异步读大文件(参考图常为大幅图, 同步读会卡 UI)
  rh.slice(0, 20).forEach((item, i) => {
    const div = document.createElement('div');
    div.className = 'ref-history-item';
    div.innerHTML = '<div class="ref-history-placeholder">加载中…</div>'
      + '<span class="hi-del" onclick="deleteRefHistoryItem(' + i + ')">✕</span>';
    grid.appendChild(div);
    if (hasNativeBridge() && NativeBridge.readSavedFileAsync) {
      cachedReadFile(item.savedPath).then(src => {
        if (!div.isConnected) return;
        div.innerHTML = (src ? '<img src="' + src + '" alt="参考图">' : '<div class="ref-history-placeholder">无图</div>')
          + '<span class="hi-del" onclick="deleteRefHistoryItem(' + i + ')">✕</span>';
      });
    } else {
      const src = (hasNativeBridge() && NativeBridge.readSavedFile) ? NativeBridge.readSavedFile(item.savedPath) : '';
      div.innerHTML = (src ? '<img src="' + src + '" alt="参考图">' : '<div class="ref-history-placeholder">无图</div>')
        + '<span class="hi-del" onclick="deleteRefHistoryItem(' + i + ')">✕</span>';
    }
  });
}

function deleteRefHistoryItem(i) {
  let rh = [];
  try { rh = JSON.parse(localStorage.getItem('gpt_refHistory') || '[]'); } catch (e) {}
  const item = rh[i];
  if (item && item.savedPath && hasNativeBridge() && NativeBridge.deleteSavedFile) {
    try { NativeBridge.deleteSavedFile(item.savedPath); } catch (e) {}
  }
  rh.splice(i, 1);
  localStorage.setItem('gpt_refHistory', JSON.stringify(rh));
  renderRefHistory();
  showToast('参考图已删除');
}

function clearRefHistory() {
  showConfirmDialog('清空参考图历史', '确定清空全部参考图历史？此操作不可撤销。', () => {
    let rh = [];
    try { rh = JSON.parse(localStorage.getItem('gpt_refHistory') || '[]'); } catch (e) {}
    rh.forEach(function(item) {
      if (item.savedPath && hasNativeBridge() && NativeBridge.deleteSavedFile) {
        try { NativeBridge.deleteSavedFile(item.savedPath); } catch (e) {}
      }
    });
    localStorage.removeItem('gpt_refHistory');
    renderRefHistory();
    showToast('参考图历史已清空');
  });
}

// 确认后删除历史项（防误点）
function confirmDeleteHistory(ts) {
  showConfirmDialog('删除历史', '确定删除这条历史记录？此操作不可撤销。', () => {
    deleteHistoryByTs(ts);
  });
}

// 按 timestamp 删除历史项 (避免筛选后索引错位)
function deleteHistoryByTs(ts) {
  const history = getHistory();
  const idx = history.findIndex(h => h.timestamp === ts);
  if (idx < 0) return;
  // 删除前先清理落盘文件(应用私有目录)
  const item = history[idx];
  if (item && item.savedPath && hasNativeBridge() && NativeBridge.deleteSavedFile) {
    try { NativeBridge.deleteSavedFile(item.savedPath); } catch (e) {}
  }
  history.splice(idx, 1);
  localStorage.setItem('gpt_history', JSON.stringify(history));
  animateRemoveHistory(ts);
  vibrate(30);
}

// 删除历史项动画（淡出 + FLIP 平滑重排）
function animateRemoveHistory(ts) {
  const grid = document.getElementById('historyGrid');
  if (!grid) return;
  const el = grid.querySelector('.history-item[data-ts="' + ts + '"]');
  if (!el) return;
  // FLIP: 记录其它项当前位置
  const others = Array.prototype.slice.call(grid.querySelectorAll('.history-item')).filter(function(x) { return x !== el; });
  const firstPos = {};
  others.forEach(function(x) { firstPos[x.getAttribute('data-ts')] = x.getBoundingClientRect().top; });
  // 删除项淡出
  el.style.transition = 'opacity .25s ease, transform .25s ease';
  el.style.opacity = '0';
  el.style.transform = 'scale(.85)';
  // 淡出后移除 + FLIP 补间
  setTimeout(function() {
    const removedTop = el.getBoundingClientRect().top;
    el.remove();
    grid.querySelectorAll('.history-item').forEach(function(x) {
      const oldTop = firstPos[x.getAttribute('data-ts')];
      if (oldTop === undefined) return;
      const newTop = x.getBoundingClientRect().top;
      const delta = oldTop - newTop;
      if (Math.abs(delta) < 2) return;
      x.style.transition = 'none';
      x.style.transform = 'translateY(' + delta + 'px)';
      // 强制回流再过渡到原位
      x.getBoundingClientRect();
      x.style.transition = 'transform .25s ease';
      x.style.transform = '';
      setTimeout(function() { x.style.transition = ''; }, 260);
    });
  }, 250);
}

function deleteHistoryItem(idx) {
  const history = getHistory();
  history.splice(idx, 1);
  localStorage.setItem('gpt_history', JSON.stringify(history));
  loadHistory();
  vibrate(30);
}

// 收藏 / 取消收藏历史图片
function toggleFavHistory(ts) {
  const idx = state.favHistory.indexOf(ts);
  if (idx >= 0) {
    state.favHistory.splice(idx, 1);
    showToast('已取消收藏历史');
  } else {
    state.favHistory.push(ts);
    showToast('已收藏历史，可供 AI 参考');
  }
  localStorage.setItem('gpt_favHistory', JSON.stringify(state.favHistory));
  loadHistory();
}

// ===== 复用历史项 → 回填生成页(提示词+参数+参考图) =====
async function reuseHistoryItem(ts) {
  const history = getHistory();
  const item = history.find(h => h.timestamp === ts);
  if (!item) { showToast('未找到该历史记录', 'error'); return; }
  // 提示词
  const promptInput = document.getElementById('promptInput');
  if (promptInput) promptInput.value = item.prompt || '';
  const charCount = document.getElementById('charCount');
  if (charCount) charCount.textContent = (item.prompt || '').length;
  // 参数
  if (item.size) state.size = item.size;
  if (item.quality) state.quality = item.quality;
  if (item.format) state.format = item.format;
  if (item.n) state.n = item.n;
  if (item.model) state.model = item.model;
  state.seed = item.seed || '';
  state.negativePrompt = item.negativePrompt || '';
  state.style = item.style || '';
  // 参考图(图生图时记录 refSavedPath)
  const newRefs = [];
  if (item.refSavedPath) {
    const dataUrl = await cachedReadFile(item.refSavedPath);
    if (dataUrl) {
      const b64 = dataUrl.split(',')[1] || dataUrl;
      newRefs.push({ b64: b64, name: 'ref.png', mime: 'image/png' });
    }
  }
  state.references = newRefs;
  state.refImageB64 = state.references.length ? state.references[0].b64 : null;
  state.refImageName = state.references.length ? state.references[0].name : null;
  renderRefList();
  syncParamControls();
  switchTab('generate');
  showToast('已复用该记录到生成页');
}

function clearHistory() {
  showConfirmDialog('清空历史', '确定清空所有历史记录？此操作不可撤销。', () => {
    localStorage.removeItem('gpt_history');
    loadHistory();
    showToast('历史已清空');
  });
}

// ===== 历史左右分屏对比 =====
function openHistoryCompare(item, src) {
  // 无基准 A 时，设当前图为 A（高亮提示下一张作 B）
  if (!state.historyCompareA) {
    state.historyCompareA = { item, src };
    showToast('已选 A，Shift+点击另一张图对比');
    return;
  }
  // 有基准 A → 当前图为 B，打开对比
  const a = state.historyCompareA;
  state.historyCompareA = null;
  const imgA = document.getElementById('compareImgA');
  const imgB = document.getElementById('compareImgB');
  imgA.src = a.src;
  imgB.src = src;
  const prompt = document.getElementById('comparePrompt');
  prompt.textContent = 'A: ' + (a.item.revisedPrompt || a.item.prompt) + '\nB: ' + (item.revisedPrompt || item.prompt);
  document.getElementById('compareModal').classList.remove('hidden');
  initCompareDrag();
}

// ===== 生成图 vs 参考原图 分屏对比查看 =====
function openRefCompare(btnOrSrc) {
  const genSrc = typeof btnOrSrc === 'string' ? btnOrSrc : (btnOrSrc && btnOrSrc.dataset.src);
  if (!genSrc) { showToast('无图片可对比', 'error'); return; }
  // 参考原图: 优先用"本张生成图对应的参考图"(生成时记录的路径)
  let refUrl = null;
  const btnRef = (typeof btnOrSrc !== 'string') && btnOrSrc.dataset.ref;
  if (btnRef && hasNativeBridge() && NativeBridge.readSavedFile) {
    try { refUrl = NativeBridge.readSavedFile(btnRef); } catch (e) {}
  }
  if (!refUrl && state.references.length && state.references[0] && state.references[0].b64) {
    const r = state.references[0];
    refUrl = 'data:' + (r.mime || 'image/png') + ';base64,' + r.b64;
  } else if (!refUrl && state.previewItem && state.previewItem.refSavedPath && hasNativeBridge() && NativeBridge.readSavedFile) {
    try { refUrl = NativeBridge.readSavedFile(state.previewItem.refSavedPath); } catch (e) {}
  }
  // 兜底: 用最近上传的参考图(参考图历史)
  if (!refUrl) {
    try {
      const rh = JSON.parse(localStorage.getItem('gpt_refHistory') || '[]');
      if (rh.length && rh[0].savedPath && hasNativeBridge() && NativeBridge.readSavedFile) {
        refUrl = NativeBridge.readSavedFile(rh[0].savedPath) || null;
      }
    } catch (e) {}
  }
  if (!refUrl) { showToast('请先上传参考原图', 'error'); return; }
  const imgA = document.getElementById('compareImgA');
  const imgB = document.getElementById('compareImgB');
  imgA.src = refUrl;   // A = 参考原图
  imgB.src = genSrc;   // B = 生成图
  const prompt = document.getElementById('comparePrompt');
  prompt.textContent = '拖动分割线对比：线左边为参考原图，线右边为生成图';
  document.getElementById('compareModal').classList.remove('hidden');
  initCompareDrag();
}

function closeHistoryCompare(e) {
  if (e && e.target !== document.getElementById('compareModal')) return;
  document.getElementById('compareModal').classList.add('hidden');
  state.historyCompareA = null;
}

// 对比分割条拖拽
function initCompareDrag() {
  const stage = document.getElementById('compareStage');
  const divider = document.getElementById('compareDivider');
  const overlay = document.getElementById('compareImgB');
  if (!stage || !divider || !overlay) return;
  let dragging = false;
  const move = (clientX) => {
    const rect = stage.getBoundingClientRect();
    let pct = ((clientX - rect.left) / rect.width) * 100;
    pct = Math.max(3, Math.min(97, pct));
    overlay.style.clipPath = 'inset(0 0 0 ' + pct + '%)';
    divider.style.left = pct + '%';
  };
  divider.onpointerdown = (e) => {
    dragging = true;
    e.preventDefault();
    try { divider.setPointerCapture(e.pointerId); } catch (err) {}
  };
  divider.onpointermove = (e) => { if (dragging) move(e.clientX); };
  divider.onpointerup = (e) => { dragging = false; try { divider.releasePointerCapture(e.pointerId); } catch (err) {} };
  divider.onpointercancel = () => { dragging = false; };
  // 重置为初始(分割线中间)
  overlay.style.clipPath = 'inset(0 0 0 50%)';
  divider.style.left = '50%';
}

// ===== 预览 =====
async function openPreview(item, src) {
  state.previewItem = item;
  const img = document.getElementById('previewImage');
  const vid = document.getElementById('previewVideo');
  // 兜底: 未带 src(异步读图未完成)时从落盘路径读, 保证预览能显示
  if (!src && item && item.savedPath && hasNativeBridge() && NativeBridge.readSavedFileAsync) {
    src = await cachedReadFile(item.savedPath);
  }
  const isVideo = !!item && item.kind === 'video';
  if (vid) { vid.src = src || ''; vid.classList.toggle('hidden', !isVideo); }
  if (img) { img.src = src || ''; img.classList.toggle('hidden', isVideo); }
  // 文生图无参考原图 → 隐藏 完善/对比 按钮
  const isEdit = !!item.isEdit;
  const rp = document.getElementById('refinePreviewBtn');
  const rc = document.getElementById('refComparePreviewBtn');
  if (rp) rp.classList.toggle('hidden', !isEdit);
  if (rc) rc.classList.toggle('hidden', !isEdit);
  document.getElementById('previewModal').classList.remove('hidden');
  vibrate(20);
}

function closePreview(e) {
  if (e && e.target !== document.getElementById('previewModal')) return;
  document.getElementById('previewModal').classList.add('hidden');
  state.previewItem = null;
}

function copyPromptFromPreview() {
  if (!state.previewItem) return;
  const text = state.previewItem.revisedPrompt || state.previewItem.prompt;
  copyText(text).then(function(ok) {
    showToast(ok ? '提示词已复制' : '复制失败', ok ? 'ok' : 'error');
  });
}

function savePreviewImage() {
  if (!state.previewItem) return;
  const item = state.previewItem;
  let src = item.b64 ? `data:image/${item.format || 'png'};base64,${item.b64}` : item.url;
  if (!src && item.savedPath && hasNativeBridge() && NativeBridge.readSavedFile) {
    try { src = NativeBridge.readSavedFile(item.savedPath); } catch (e) {}
  }
  if (src) {
    if (item.kind === 'video') {
      // 视频预览保存: 直接下载 url(相册)
      const vname = 'GPTImage_' + (item.timestamp || Date.now()) + '.mp4';
      if (hasNativeBridge() && NativeBridge.saveVideoFromUrl) {
        const ok = NativeBridge.saveVideoFromUrl(src, vname);
        showToast(ok ? '已保存到相册' : '保存到相册失败', ok ? 'ok' : 'error');
      } else {
        const a = document.createElement('a'); a.href = src; a.download = vname; a.target = '_blank'; a.click();
        showToast('已下载');
      }
    } else {
      // 只传时间戳(纯数字), 扩展名由 saveResultImage 统一生成, 避免 .xxx.png.png
      saveResultImage(src, item.timestamp);
    }
  }
}

// 从预览进入画布编辑
function openPreviewEditor() {
  const img = document.getElementById('previewImage');
  const src = img && img.src;
  if (!src) { showToast('无图片可编辑', 'error'); return; }
  const item = state.previewItem;
  closePreview();
  openEditor(src, item ? (item.prompt || '') : '');
}

// ===== 通用对话框（替代原生 prompt/confirm）=====
let _dialogCb = null;

function showInputDialog(title, defaultValue, placeholder, onOk, multiline) {
  const mask = document.getElementById('dialog');
  const input = document.getElementById('dialogInput');
  const textarea = document.getElementById('dialogTextarea');
  document.getElementById('dialogTitle').textContent = title;
  mask.dataset.mode = 'input';
  if (multiline) {
    input.classList.add('hidden');
    textarea.classList.remove('hidden');
    textarea.value = defaultValue || '';
    textarea.placeholder = placeholder || '请输入';
  } else {
    textarea.classList.add('hidden');
    input.classList.remove('hidden');
    input.value = defaultValue || '';
    input.placeholder = placeholder || '请输入';
  }
  _dialogCb = { type: 'input', onOk, multiline };
  mask.classList.remove('hidden');
  setTimeout(() => {
    const el = multiline ? textarea : input;
    el.focus(); el.select();
  }, 50);
}

function showConfirmDialog(title, msg, onOk) {
  const mask = document.getElementById('dialog');
  document.getElementById('dialogConfirmTitle').textContent = title;
  document.getElementById('dialogMsg').textContent = msg;
  mask.dataset.mode = 'confirm';
  _dialogCb = { type: 'confirm', onOk };
  mask.classList.remove('hidden');
}
// 选项对话框: 弹出一组选项让用户选(用于"编辑反推要求"选择类型等)
function showOptionDialog(title, options, onSelect) {
  const mask = document.getElementById('dialog');
  document.getElementById('selectTitle').textContent = title;
  const box = document.getElementById('selectOptions');
  box.innerHTML = '';
  (options || []).forEach(function(opt) {
    const b = document.createElement('button');
    b.className = 'select-option';
    b.innerHTML = '<span class="select-option-label">' + escapeHtml(opt.label) + '</span>' +
      (opt.hint ? '<span class="select-option-hint">' + escapeHtml(opt.hint) + '</span>' : '');
    b.onclick = function() {
      const val = opt.val;
      dialogCancel();
      onSelect && onSelect(val);
    };
    box.appendChild(b);
  });
  mask.dataset.mode = 'select';
  _dialogCb = { type: 'select' };
  mask.classList.remove('hidden');
}

function dialogOk() {
  if (!_dialogCb) return;
  const cb = _dialogCb;
  _dialogCb = null;
  closeDialog();
  if (cb.type === 'form') {
    const topic = document.getElementById('dfTopic').value.trim();
    const cat = document.getElementById('dfCat').value;
    const countStr = document.getElementById('dfCount').value;
    const n = parseInt(countStr);
    if (!n || n < 1 || n > 20) { showToast('数量需为 1-20', 'error'); return; }
    doAiGenerate(topic || '元气可爱甜美少女', cat, n);
    return;
  }
  if (cb.type === 'edit') {
    // 编辑焚决单窗口: 名称 + 内容
    const name = document.getElementById('efName').value.trim();
    const prompt = document.getElementById('efPrompt').value.trim();
    if (!prompt) { showToast('内容不能为空', 'error'); return; }
    if (name) cb.p.name = name;
    cb.p.prompt = prompt;
    localStorage.setItem('gpt_customPrompts', JSON.stringify(state.customPrompts));
    renderPrompts();
    showToast('焚决已更新');
    return;
  }
  if (cb.type === 'input') {
    const el = cb.multiline ? document.getElementById('dialogTextarea') : document.getElementById('dialogInput');
    cb.onOk(el.value);
  } else {
    cb.onOk();
  }
}

function dialogCancel() {
  _dialogCb = null;
  closeDialog();
}

function closeDialog() {
  document.getElementById('dialog').classList.add('hidden');
}

// ===== 工具函数 =====
// JS 日志: 双通道 (DebugServer Logger + logcat console)，确保任何环境可见
function jsLog(level, tag, msg) {
  if (level === 'E') console.error('[' + tag + ']', msg);
  else if (level === 'W') console.warn('[' + tag + ']', msg);
  else console.log('[' + tag + ']', msg);
  if (hasNativeBridge() && NativeBridge.log) {
    try { NativeBridge.log(level, tag, String(msg)); } catch (e) {}
  }
}

function showToast(msg, type = 'ok') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast ' + type;
  el.classList.remove('hidden');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.add('hidden'), 2500);
}

function vibrate(ms = 50) {
  if (hasNativeBridge()) {
    NativeBridge.vibrate(ms);
  } else if (navigator.vibrate) {
    navigator.vibrate(ms);
  }
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ===== 键盘快捷键 =====
document.addEventListener('keydown', (e) => {
  // Enter to generate (Cmd/Ctrl + Enter)
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault();
    generate();
  }
  // Escape to close preview / dialog / compare
  if (e.key === 'Escape') {
    const dlg = document.getElementById('dialog');
    const cmp = document.getElementById('compareModal');
    if (dlg && !dlg.classList.contains('hidden')) {
      dialogCancel();
    } else if (cmp && !cmp.classList.contains('hidden')) {
      closeHistoryCompare();
    } else {
      closePreview();
    }
  }
});

// ===== 提示词字符计数 =====
function initCharCount() {
  const el = document.getElementById('promptInput');
  if (!el) return;
  if (!document.getElementById('charCount')) return;
  el.addEventListener('input', () => {
    document.getElementById('charCount').textContent = el.value.length;
  });
}

// ===== 历史搜索 =====
function initHistorySearch() {
  const searchEl = document.getElementById('historySearch');
  if (!searchEl) return;
  searchEl.addEventListener('input', (e) => {
    state.historyFilter = e.target.value;
    loadHistory();
  });
}

// ===== 剪贴板粘贴参考图 (Ctrl+V) =====
document.addEventListener('paste', (e) => {
  // 粘贴图片时作为参考图（且焦点不在文本输入框，避免误触发）
  const active = document.activeElement;
  const inInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable);
  if (inInput) return;
  pasteRefFromClipboard(e);
});

// ===== 工作区 (Workspace) =====
function workspaceSnapshot() {
  const promptInput = document.getElementById('promptInput');
  return {
    prompt: promptInput ? promptInput.value : '',
    size: state.size,
    quality: state.quality,
    format: state.format,
    n: state.n,
    seed: state.seed,
    negativePrompt: state.negativePrompt,
    style: state.style,
    references: state.references.slice(),
  };
}

function workspaceApply(snap) {
  const promptInput = document.getElementById('promptInput');
  const charCount = document.getElementById('charCount');
  if (promptInput) promptInput.value = snap.prompt || '';
  if (charCount) charCount.textContent = (snap.prompt || '').length;
  state.size = snap.size || state.size;
  state.quality = snap.quality || state.quality;
  state.format = snap.format || state.format;
  state.n = snap.n || state.n;
  state.seed = snap.seed || '';
  state.negativePrompt = snap.negativePrompt || '';
  state.style = snap.style || '';
  state.references = (snap.references || []).slice();
  state.refImageB64 = state.references.length ? state.references[0].b64 : null;
  state.refImageName = state.references.length ? state.references[0].name : null;
  renderRefList();
  syncParamControls();
}

// 同步参数控件(尺寸/质量/格式/张数/风格/种子/负面词)
function syncParamControls() {
  document.querySelectorAll('.size-btn').forEach(function(b) { b.classList.toggle('active', b.dataset.size === state.size); });
  document.querySelectorAll('#qualityGroup .pill').forEach(function(p) { p.classList.toggle('active', p.dataset.val === state.quality); });
  document.querySelectorAll('#formatGroup .pill').forEach(function(p) { p.classList.toggle('active', p.dataset.val === state.format); });
  document.querySelectorAll('#nGroup .pill').forEach(function(p) { p.classList.toggle('active', p.dataset.val === String(state.n)); });
  document.querySelectorAll('#styleGroup .pill').forEach(function(p) { p.classList.toggle('active', p.dataset.val === state.style); });
  var seedEl = document.getElementById('seedInput');
  var negEl = document.getElementById('negPromptInput');
  if (seedEl) seedEl.value = state.seed;
  if (negEl) negEl.value = state.negativePrompt;
}

// 渲染工作区标签栏
function renderWsBar() {
  const list = document.getElementById('wsList');
  if (!list) return;
  // 单工作区时隐藏工作区栏，节省竖向空间
  const bar = document.getElementById('wsBar');
  if (bar) bar.style.display = state.workspaces.length > 1 ? 'flex' : 'none';
  list.innerHTML = '';
  state.workspaces.forEach(function(w, i) {
    const tab = document.createElement('button');
    tab.className = 'ws-tab' + (w.id === state.activeWorkspaceId ? ' active' : '');
    tab.innerHTML = '<span>' + escapeHtml(w.name) + '</span>'
      + (state.workspaces.length > 1 ? '<span class="ws-close" title="关闭">✕</span>' : '');
    tab.onclick = function(e) {
      if (e.target.classList.contains('ws-close')) { closeWorkspace(w.id); return; }
      switchWorkspace(w.id);
    };
    list.appendChild(tab);
  });
}

// 切换工作区
function switchWorkspace(id) {
  if (id === state.activeWorkspaceId) return;
  // 保存当前到旧工作区
  const cur = state.workspaces.find(function(w) { return w.id === state.activeWorkspaceId; });
  if (cur) cur.snapshot = workspaceSnapshot();
  // 切换到新工作区
  state.activeWorkspaceId = id;
  const next = state.workspaces.find(function(w) { return w.id === id; });
  if (next) workspaceApply(next.snapshot || {});
  localStorage.setItem('gpt_workspaces', JSON.stringify(state.workspaces));
  localStorage.setItem('gpt_activeWorkspace', id);
  renderWsBar();
}

// 新建工作区
function addWorkspace() {
  // 保存当前
  const cur = state.workspaces.find(function(w) { return w.id === state.activeWorkspaceId; });
  if (cur) cur.snapshot = workspaceSnapshot();
  const id = 'w' + Date.now();
  state.workspaces.push({ id: id, name: '工作区 ' + state.workspaces.length, snapshot: null });
  state.activeWorkspaceId = id;
  workspaceApply({
    prompt: '', size: '1024x1024', quality: 'medium', format: 'png', n: 1,
    seed: '', negativePrompt: '', style: '', references: [],
  });
  localStorage.setItem('gpt_workspaces', JSON.stringify(state.workspaces));
  localStorage.setItem('gpt_activeWorkspace', id);
  renderWsBar();
  showToast('已新建工作区');
}

// 关闭工作区
function closeWorkspace(id) {
  if (state.workspaces.length <= 1) { showToast('至少保留一个工作区', 'error'); return; }
  const idx = state.workspaces.findIndex(function(w) { return w.id === id; });
  if (idx < 0) return;
  state.workspaces.splice(idx, 1);
  if (state.activeWorkspaceId === id) {
    state.activeWorkspaceId = state.workspaces[Math.max(0, idx - 1)].id;
    const next = state.workspaces.find(function(w) { return w.id === state.activeWorkspaceId; });
    if (next) workspaceApply(next.snapshot || {});
  }
  localStorage.setItem('gpt_workspaces', JSON.stringify(state.workspaces));
  localStorage.setItem('gpt_activeWorkspace', state.activeWorkspaceId);
  renderWsBar();
}

// ===== 焚决库 (AI 生图提示词) =====
const PROMPT_CATEGORIES = [
  { key: 'all', label: '全部' },
  { key: 'reality', label: '现实' },
  { key: 'anime', label: '二次元' },
  { key: 'illustration', label: '插画' },
  { key: 'landscape', label: '风景' },
  { key: 'sci-fi', label: '科幻' },
  { key: 'portrait', label: '人物' },
  { key: 'photo', label: '摄影' },
  { key: 'design', label: '设计' },
  { key: 'convert', label: '图生图转换' },
];

function getAllPresets() {
  return state.presetPrompts;
}

// 从 NativeBridge 加载预设焚决数据 (fenjue.json, 不硬编码)
function loadPresetPrompts() {
  try {
    if (typeof NativeBridge !== 'undefined' && NativeBridge.loadFenjuePresets) {
      const raw = NativeBridge.loadFenjuePresets();
      const data = JSON.parse(raw || '[]');
      state.presetPrompts = Array.isArray(data) ? data : [];
    } else {
      state.presetPrompts = [];
    }
  } catch (e) {
    state.presetPrompts = [];
    console.error('loadFenjuePresets error', e);
  }
}

function initPrompts() {
  loadPresetPrompts();
  try {
    state.customPrompts = JSON.parse(localStorage.getItem('gpt_customPrompts') || '[]');
  } catch { state.customPrompts = []; }
  state.promptCat = localStorage.getItem('gpt_promptCat') || 'all';
  state.promptLibView = localStorage.getItem('gpt_promptLibView') || 'preset';
  renderAiPreset();
  renderPrompts();
}

function getAllPrompts() {
  // 用户库（含用户获取的预设副本 + 自建焚决）
  return state.customPrompts;
}

function getPromptCatLabel(key) {
  const c = PROMPT_CATEGORIES.find(c => c.key === key);
  return c ? c.label : key;
}

// 渲染分类筛选
function renderCategories() {
  const c = document.getElementById('promptCats');
  if (!c) return;
  c.innerHTML = '';
  PROMPT_CATEGORIES.forEach(cat => {
    const btn = document.createElement('button');
    btn.className = 'prompt-cat' + (state.promptCat === cat.key ? ' active' : '');
    btn.textContent = cat.label;
    btn.onclick = () => setPromptCat(cat.key);
    c.appendChild(btn);
  });
}

function setPromptCat(key) {
  state.promptCat = key;
  localStorage.setItem('gpt_promptCat', key);
  renderCategories();
  renderPrompts();
}

// 渲染焚决列表 (预设库 / 我的库)
function renderPrompts() {
  renderCategories();
  const list = document.getElementById('promptList');
  const total = document.getElementById('promptTotal');
  if (!list) return;

  const view = state.promptLibView;
  const all = view === 'preset' ? getAllPresets() : getAllPrompts();
  const filtered = state.promptCat === 'all' ? all : all.filter(p => p.category === state.promptCat);
  total.textContent = filtered.length + (view === 'preset' ? ' 条预设' : ' 条焚决');

  // 预设库/我的库 切换
  renderLibSwitch();

  if (filtered.length === 0) {
    list.innerHTML = '<div class="prompt-empty"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round"><path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8z"/></svg><span>该分类暂无焚决</span></div>';
    renderManageBar();
    return;
  }

  list.innerHTML = '';
  filtered.forEach(p => {
    const div = document.createElement('div');
    const isFav = state.favPrompts.includes(p.id);
    const isSel = state.selectedIds.includes(p.id);
    const isPreset = view === 'preset';
    div.className = 'prompt-item' + (view === 'mine' && state.manageMode ? ' manage' : '') + (isSel ? ' selected' : '') + (isFav ? ' faved' : '');
    const catLabel = getPromptCatLabel(p.category);
    const tags = (p.tags || []).map(t => '<span class="prompt-tag">' + escapeHtml(t) + '</span>').join('');
    const favIcon = isFav
      ? '<svg viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>';
    const checkIcon = isSel
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/></svg>';
    // 预设库: 获取按钮; 我的库: 管理勾选 + 删除(非内置) + 收藏
    const actions = isPreset
      ? '<button class="btn-sm btn-accent prompt-get" onclick="acquirePrompt(\'' + p.id + '\')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="13" height="13"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>添加</button>'
      : '';
    div.innerHTML = `
      <div class="prompt-item-header">
        ${view === 'mine' && state.manageMode ? '<button class="prompt-check" onclick="toggleSelectPrompt(\'' + p.id + '\')">' + checkIcon + '</button>' : ''}
        <span class="prompt-item-name">${escapeHtml(p.name)}</span>
        <span class="prompt-cat-badge">${escapeHtml(catLabel)}</span>
        <div class="prompt-item-actions">
          ${actions}
          ${!isPreset ? '<button class="icon-btn-sm ' + (isFav ? 'faved' : '') + '" onclick="toggleFavPrompt(\'' + p.id + '\')" title="收藏">' + favIcon + '</button>' : ''}
          <button class="icon-btn-sm" onclick="copyPrompt('${p.id}')" title="复制提示词">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          </button>
          ${view === 'mine' ? '<button class="icon-btn-sm" onclick="editPrompt(\'' + p.id + '\')" title="编辑焚决"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button>' : ''}
          ${view === 'mine' && !p.builtin ? '<button class="icon-btn-sm" onclick="deletePrompt(\'' + p.id + '\')" title="删除" style="color:var(--error)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>' : ''}
        </div>
      </div>
      <div class="prompt-item-text">${escapeHtml(p.prompt)}</div>
      <div class="prompt-item-footer">
        <div class="prompt-tags">${tags}</div>
        <button class="prompt-use" onclick="usePrompt('${p.id}')">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" width="13" height="13"><path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/></svg>
          使用
        </button>
      </div>`;
    list.appendChild(div);
  });
  renderManageBar();
}

// 渲染 预设库/我的库 切换栏
function renderLibSwitch() {
  let bar = document.getElementById('promptLibSwitch');
  if (!bar) {
    const cats = document.getElementById('promptCats');
    if (!cats) return;
    bar = document.createElement('div');
    bar.id = 'promptLibSwitch';
    bar.className = 'prompt-lib-switch';
    bar.innerHTML = '<button class="lib-btn" data-view="mine" onclick="setPromptLibView(\'mine\')">我的库</button>'
      + '<button class="lib-btn" data-view="preset" onclick="setPromptLibView(\'preset\')">预设库</button>';
    cats.parentNode.insertBefore(bar, cats);
  }
  bar.querySelectorAll('.lib-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.view === state.promptLibView);
  });
}

// 切换焚决库视图
function setPromptLibView(view) {
  state.promptLibView = view;
  localStorage.setItem('gpt_promptLibView', view);
  if (view === 'preset') state.manageMode = false;
  renderPrompts();
}

// 从预设库获取焚决到我的库
function acquirePrompt(id) {
  const p = getAllPresets().find(x => x.id === id);
  if (!p) return;
  if (state.customPrompts.some(x => x.id === 'got-' + id)) {
    showToast('该焚决已在你的库中');
    return;
  }
  state.customPrompts.push({
    id: 'got-' + id,
    name: p.name,
    category: p.category,
    prompt: p.prompt,
    tags: (p.tags || []).slice(),
    builtin: false,
    source: p.source || 'preset',
    acquired: true,
  });
  localStorage.setItem('gpt_customPrompts', JSON.stringify(state.customPrompts));
  renderPrompts();
  showToast('已获取「' + p.name + '」到我的库');
}

// 统一复制文本：优先原生剪贴板，fallback navigator.clipboard，兜底 execCommand
function copyText(text) {
  return new Promise((resolve) => {
    // 1. 原生桥剪贴板 (最可靠)
    if (hasNativeBridge() && typeof NativeBridge.copyToClipboard === 'function') {
      try {
        NativeBridge.copyToClipboard(text);
        console.log('[copy] native bridge ok');
        resolve(true);
        return;
      } catch (e) { console.log('[copy] bridge fail', e); /* 继续 fallback */ }
    }
    // 2. navigator.clipboard
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function() { console.log('[copy] web ok'); resolve(true); })
        .catch(function() { console.log('[copy] web fail, exec'); resolve(execCopy(text)); });
      return;
    }
    // 3. execCommand 兜底
    console.log('[copy] use exec');
    resolve(execCopy(text));
  });
}

// execCommand 兜底复制
function execCopy(text) {
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none;';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch (e) { return false; }
}

// 复制提示词 (按当前视图查找: 预设库/我的库)
function copyPrompt(id) {
  const p = findPromptById(id);
  if (!p) { showToast('焚决不存在', 'error'); return; }
  copyText(p.prompt).then(function(ok) {
    showToast(ok ? '提示词已复制' : '复制失败', ok ? 'ok' : 'error');
  });
}

// 分享焚决 (复制可导入的分享文本) — 保留函数但按钮已隐藏
function sharePrompt(id) {
  const p = findPromptById(id);
  if (!p) return;
  const shareText = '【焚决】' + p.name + '\n分类:' + getPromptCatLabel(p.category) + '\n提示词:\n' + p.prompt + '\n\n— 来自 GPTImage Studio';
  copyText(shareText).then(function(ok) {
    showToast(ok ? '分享文本已复制' : '复制失败', ok ? 'ok' : 'error');
  });
}

// 按当前视图查找焚决 (预设库或我的库)
function findPromptById(id) {
  if (state.promptLibView === 'preset') {
    return getAllPresets().find(x => x.id === id);
  }
  return getAllPrompts().find(x => x.id === id);
}

// ===== 收藏 =====
function toggleFavPrompt(id) {
  const idx = state.favPrompts.indexOf(id);
  if (idx >= 0) {
    state.favPrompts.splice(idx, 1);
    showToast('已取消收藏');
  } else {
    state.favPrompts.push(id);
    showToast('已收藏，AI 生成时作为参考');
  }
  localStorage.setItem('gpt_favPrompts', JSON.stringify(state.favPrompts));
  renderPrompts();
  renderManageBar();
}

function getFavCount() {
  return state.favPrompts.filter(fid => getAllPrompts().some(p => p.id === fid)).length;
}

// ===== 焚决管理 (多选/批量) =====
function toggleManageMode() {
  // 预设库不支持管理：先切到我的库
  if (state.promptLibView === 'preset') {
    state.promptLibView = 'mine';
    localStorage.setItem('gpt_promptLibView', 'mine');
  }
  state.manageMode = !state.manageMode;
  state.selectedIds = [];
  renderPrompts();
  renderManageBar();
  showToast(state.manageMode ? '已进入管理模式' : '已退出管理模式');
}

function toggleSelectPrompt(id) {
  const idx = state.selectedIds.indexOf(id);
  if (idx >= 0) { state.selectedIds.splice(idx, 1); }
  else { state.selectedIds.push(id); }
  renderPrompts();
  renderManageBar();
}

// 全选当前分类
function selectAllPrompts() {
  const all = getAllPrompts();
  const filtered = state.promptCat === 'all' ? all : all.filter(p => p.category === state.promptCat);
  const allSel = filtered.length > 0 && filtered.every(p => state.selectedIds.includes(p.id));
  if (allSel) {
    state.selectedIds = state.selectedIds.filter(id => !filtered.some(p => p.id === id));
  } else {
    state.selectedIds = state.selectedIds.concat(
      filtered.filter(p => !state.selectedIds.includes(p.id)).map(p => p.id)
    );
  }
  renderPrompts();
  renderManageBar();
}

// 批量删除选中的焚决（仅限自定义；内置不可删）
function batchDeletePrompts() {
  if (state.selectedIds.length === 0) { showToast('请先勾选要删除的焚决', 'error'); return; }
  const removable = state.selectedIds.filter(id => !getAllPrompts().find(p => p.id === id)?.builtin);
  if (removable.length === 0) { showToast('选中的均为内置焚决，需先添加副本', 'error'); return; }
  showConfirmDialog('删除焚决', '确定删除选中的 ' + removable.length + ' 条焚决？（内置焚决需先通过导入添加副本才能删除）', () => {
    state.customPrompts = state.customPrompts.filter(p => !removable.includes(p.id));
    state.selectedIds = [];
    localStorage.setItem('gpt_customPrompts', JSON.stringify(state.customPrompts));
    renderPrompts();
    renderManageBar();
    showToast('已删除 ' + removable.length + ' 条焚决');
  });
}

// 批量收藏选中
function batchFavPrompts() {
  if (state.selectedIds.length === 0) { showToast('请先勾选焚决', 'error'); return; }
  state.selectedIds.forEach(id => { if (!state.favPrompts.includes(id)) state.favPrompts.push(id); });
  localStorage.setItem('gpt_favPrompts', JSON.stringify(state.favPrompts));
  renderPrompts();
  renderManageBar();
  showToast('已收藏 ' + state.selectedIds.length + ' 条');
}

// 渲染管理工具条 (焚决页工具栏下方)
function renderManageBar() {
  let bar = document.getElementById('promptManageBar');
  if (!state.manageMode) { if (bar) bar.style.display = 'none'; return; }
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'promptManageBar';
    bar.className = 'prompt-manage-bar';
    bar.innerHTML = `
      <button class="btn-sm" onclick="selectAllPrompts()">全选</button>
      <span class="pm-count" id="pmCount">已选 0</span>
      <button class="btn-sm" onclick="batchFavPrompts()">收藏</button>
      <button class="btn-sm" style="color:var(--error)" onclick="batchDeletePrompts()">删除</button>
      <button class="btn-sm" onclick="toggleManageMode()">退出</button>`;
    const list = document.getElementById('promptList');
    list.parentNode.insertBefore(bar, list);
  }
  bar.style.display = 'flex';
  const count = document.getElementById('pmCount');
  if (count) count.textContent = '已选 ' + state.selectedIds.length;
}

// 使用焚决 (填入生成页提示词并切过去)
function usePrompt(id) {
  const p = findPromptById(id);
  if (!p) { showToast('焚决不存在', 'error'); return; }
  const promptInput = document.getElementById('promptInput');
  promptInput.value = p.prompt;
  document.getElementById('charCount').textContent = p.prompt.length;
  savePromptHistory(p.prompt);
  switchTab('generate');
  showToast('已填入「' + p.name + '」，点击生成');
}

// 添加自定义焚决
function addPrompt() {
  showInputDialog('焚决名称', '', '给焚决起个名字', (name) => {
    if (!name) return;
    showInputDialog('焚决分类', 'reality', '分类 key: reality/anime/illustration/landscape/sci-fi/portrait/photo/design', (cat) => {
      if (!cat) return;
      showInputDialog('焚决提示词', '', '输入完整的 AI 生图提示词（可多行）', (promptText) => {
        if (!promptText) return;
        const id = 'c-' + Date.now();
        state.customPrompts.push({ id, name, category: cat, prompt: promptText, tags: [], builtin: false });
        localStorage.setItem('gpt_customPrompts', JSON.stringify(state.customPrompts));
        renderPrompts();
        showToast('焚决已添加');
      }, true);
    });
  });
}

// 删除自定义焚决
function deletePrompt(id) {
  const p = state.customPrompts.find(x => x.id === id);
  if (!p) return;
  showConfirmDialog('删除焚决', '确定删除「' + p.name + '」？', () => {
    state.customPrompts = state.customPrompts.filter(x => x.id !== id);
    localStorage.setItem('gpt_customPrompts', JSON.stringify(state.customPrompts));
    renderPrompts();
    showToast('焚决已删除');
  });
}

// 编辑焚决内容(单窗口: 名称+内容; 自定义直接改; 内置的编辑会存为副本)
function editPrompt(id) {
  // 优先找自定义
  let p = state.customPrompts.find(x => x.id === id);
  if (!p) {
    const builtin = getAllPresets().find(x => x.id === id);
    if (!builtin) { showToast('焚决不存在', 'error'); return; }
    p = { id: 'edit-' + id, name: builtin.name, category: builtin.category, prompt: builtin.prompt, tags: (builtin.tags || []).slice(), builtin: false };
    state.customPrompts.push(p);
  }
  // 单窗口编辑: 名称 + 内容(多行)
  const mask = document.getElementById('dialog');
  document.getElementById('efName').value = p.name;
  document.getElementById('efPrompt').value = p.prompt;
  mask.dataset.mode = 'edit';
  _dialogCb = { type: 'edit', p: p };
  mask.classList.remove('hidden');
}

// ===== 焚决生成 LLM 配置 (独立 API) =====
const AI_PRESET_DEFAULT =
  '你是 AI 生图提示词专家，最擅长「元气可爱甜美少女」题材（现实或二次元风格）。用户给出题材主题和分类，你生成可直接用于 AI 生图的完整中文提示词。要求：人物必须是元气可爱甜美少女——大眼睛水汪汪、灿烂甜美的笑容、灵动俏皮的神态、年轻充满朝气；发型(双马尾/齐刘海/长发飘飘等)、瞳色、发饰(蝴蝶结/发箍/猫耳/兔耳等)、服饰(水手服/连衣裙/萝莉装/运动服/女仆装等)、配饰、姿态(双手捧脸/歪头甜笑/挥手/奔跑/回眸一笑/举手比耶等可爱动作)都要详细描述；再补光线、背景、画面风格。贴合分类（现实写真用写实人像，二次元用动漫插画/赛璐璐）。描写尽量详细，注意细节，不要遗漏服饰、瞳色、发色、发饰、配饰、表情、姿态、光线、背景、画面风格等（包含但不仅限于这些，有什么描述什么，能判断出的细节都写进去）。';

const AI_OPTIMIZE_DEFAULT =
  '你是一个图像生成提示词优化专家。用户会给你一个简短的描述，你需要将其扩展为详细、生动、适合AI图像生成的提示词。保留用户原始意图，添加构图、光影、风格、氛围等细节。只输出优化后的提示词，不要解释。';

const AI_REVERSE_DEFAULT =
  '你是图像反推专家。用户给一张图片，你直接输出一段可用于 AI 生图的中文提示词。要求：描写尽量详细，注意细节，不要遗漏人物外貌、服饰、瞳色、发色、发饰、配饰、表情、姿态、服装材质、光线、背景、环境氛围、画面风格等（包含但不仅限于这些，有什么描述什么，能判断出的细节都写进去）。只输出提示词本身，不要任何解释、标题、编号或格式标记。';

const AI_REVERSE_SIMPLE =
  '你是图像反推专家。用户给一张图片，你直接输出一段可用于 AI 生图的中文提示词，包含人物外貌、表情、姿态、服装、光线、背景、氛围、风格等关键细节。只输出提示词本身，不要任何解释、标题、编号或格式标记。';
const AI_REVERSE_POSE =
  '你是人物姿态反推专家。用户给一张人物图片，你专门反推出人物的姿态与肢体动作（用于复制动作）。必须覆盖：动作姿势（全身姿态、重心、身体朝向、靠/坐/站/蹲/跪/躺/跳跃/行走等）、手部动作（手型、手势、是否叉腰/扶脸/抱臂/指物/握持等）、面部表情与神情（喜怒哀乐、眼神、视线方向、嘴角、眉毛）、情绪状态、肢体语言细节。输出一段可直接用于 AI 生图的中文姿态描述，聚焦姿态/动作/表情/神情，不要描写外貌服饰和背景环境。只输出描述本身，不要任何解释、标题、编号或格式标记。';

// LLM 配置（独立 API，永远不复用图像生成）
function getLlmConfig() {
  return { baseUrl: state.llmBaseUrl, apiKey: state.llmApiKey, model: state.llmModel || 'deepseek-chat' };
}

// 保存独立 LLM 配置
function setLlmConfig(field, value) {
  if (field === 'baseUrl') state.llmBaseUrl = (value || '').replace(/\/+$/, '');
  else if (field === 'apiKey') state.llmApiKey = value || '';
  else if (field === 'model') state.llmModel = value || '';
  localStorage.setItem('gpt_llm' + field[0].toUpperCase() + field.slice(1), field === 'model' ? (value || '') : (field === 'baseUrl' ? state.llmBaseUrl : state.llmApiKey));
  saveProfiles();
  renderLlmConfig();
}

// LLM 配置增删 (用对话框编辑)
function editLlmField(field) {
  const cur = field === 'baseUrl' ? state.llmBaseUrl : (field === 'apiKey' ? state.llmApiKey : state.llmModel);
  const placeholder = field === 'baseUrl' ? 'https://api.deepseek.com' : (field === 'apiKey' ? 'sk-...' : 'deepseek-chat / gpt-4o-mini / qwen-plus');
  showInputDialog(field === 'baseUrl' ? 'LLM Base URL' : (field === 'apiKey' ? 'LLM API Key' : 'LLM 模型'), cur, placeholder, (v) => {
    if (v === null || v === undefined) return;
    setLlmConfig(field, v.trim());
    showToast('LLM 配置已更新');
  });
}

// AI 生成焚决预设提示词 (可编辑)
function editAiPreset() {
  showInputDialog('编辑 AI 生成预设提示词', state.aiPresetPrompt || AI_PRESET_DEFAULT,
    '指导 AI 如何生成焚决的 system 提示词', (v) => {
      if (v === null || v === undefined) return;
      state.aiPresetPrompt = v.trim();
      localStorage.setItem('gpt_aiPresetPrompt', state.aiPresetPrompt);
      renderAiPreset();
      showToast('AI 预设提示词已保存');
    }, true);
}

// AI 优化提示词预设 (可编辑)
function editAiOptimizePreset() {
  showInputDialog('编辑 AI 优化提示词预设', state.aiOptimizePrompt || AI_OPTIMIZE_DEFAULT,
    '指导 AI 如何优化提示词的 system 提示词', (v) => {
      if (v === null || v === undefined) return;
      state.aiOptimizePrompt = v.trim();
      localStorage.setItem('gpt_aiOptimizePrompt', state.aiOptimizePrompt);
      renderAiPreset();
      showToast('AI 优化提示词预设已保存');
    }, true);
}

// 编辑反推要求入口: 先选择类型, 再编辑"本次临时"的要求(仅对下一次反推生效, 用后恢复默认)
function editReversePreset() {
  showOptionDialog('编辑本次反推要求（仅生效一次）', [
    { label: '提示词反推要求', val: 'prompt', hint: '仅本次反推提示词使用，结束后恢复默认' },
    { label: '姿态反推要求', val: 'pose', hint: '仅本次姿态反推使用，结束后恢复默认' },
  ], function(sel) {
    if (sel === 'pose') editTempPosePrompt();
    else if (sel === 'prompt') editTempReversePrompt();
  });
}

// 本次临时反推要求(不持久化, 反推一次后自动清空恢复默认)
function editTempReversePrompt() {
  var cur = state.tempReversePrompt || getReverseDefault();
  showInputDialog('本次反推要求（提示词，仅一次）', cur,
    '仅下一次反推提示词生效，用后自动恢复默认', (v) => {
      if (v === null || v === undefined) return;
      state.tempReversePrompt = v.trim();
      showToast('已设为本次反推要求（仅生效一次）');
    }, true);
}

function editTempPosePrompt() {
  var cur = state.tempPosePrompt || AI_REVERSE_POSE;
  showInputDialog('本次反推要求（姿态，仅一次）', cur,
    '仅下一次姿态反推生效，用后自动恢复默认', (v) => {
      if (v === null || v === undefined) return;
      state.tempPosePrompt = v.trim();
      showToast('已设为本次姿态反推要求（仅生效一次）');
    }, true);
}

// 设置页入口: 编辑持久化的提示词反推默认要求(custom 模式)
function editReversePresetPrompt() {
  var cur = state.reversePresetPrompt || getReverseDefault();
  showInputDialog('编辑反推要求（提示词）', cur,
    '指导 AI 如何反推图片的 system 提示词（可写详细要求，不用每次修改）', (v) => {
      if (v === null || v === undefined) return;
      state.reversePresetPrompt = v.trim();
      localStorage.setItem('gpt_reversePresetPrompt', state.reversePresetPrompt);
      showToast('提示词反推要求已保存');
    }, true);
}

// 当前反推默认预设(按模式)
function getReverseDefault() {
  if (state.reversePresetMode === 'simple') return AI_REVERSE_SIMPLE;
  if (state.reversePresetMode === 'custom') return state.reversePresetPrompt || AI_REVERSE_DEFAULT;
  return AI_REVERSE_DEFAULT;
}
// 姿态反推默认预设(自定义优先)
function getPoseDefault() {
  return state.posePresetPrompt || AI_REVERSE_POSE;
}

// 切换反推预设模式(细节/简洁/自定义)
function setReversePreset(mode) {
  if (mode === 'custom' && !state.reversePresetPrompt) {
    // 首次选自定义但还没编辑过, 先打开编辑框
    state.reversePresetMode = 'custom';
    localStorage.setItem('gpt_reversePresetMode', 'custom');
    syncReversePresetBtns();
    editReversePresetPrompt();
    return;
  }
  state.reversePresetMode = mode;
  localStorage.setItem('gpt_reversePresetMode', mode);
  syncReversePresetBtns();
  var label = mode === 'simple' ? '已切换简洁版' : (mode === 'custom' ? '已切换自定义' : '已切换细节版');
  showToast(label);
}

function syncReversePresetBtns() {
  document.querySelectorAll('.reverse-preset-btn').forEach(function(b) {
    b.classList.toggle('active', b.dataset.val === state.reversePresetMode);
  });
  var eb = document.getElementById('editReverseBtn');
  var rb = document.getElementById('resetReverseBtn');
  if (eb) eb.style.display = state.reversePresetMode === 'custom' ? 'inline-flex' : 'none';
  if (rb) rb.style.display = state.reversePresetMode === 'custom' ? 'inline-flex' : 'none';
}

// 重置反推要求为默认
function resetReversePreset() {
  state.reversePresetPrompt = '';
  localStorage.removeItem('gpt_reversePresetPrompt');
  showToast('已重置为默认');
}

function renderLlmConfig() {
  const urlEl = document.getElementById('llmBaseUrlVal');
  const keyEl = document.getElementById('llmApiKeyVal');
  const modelEl = document.getElementById('llmModelVal');
  const vUrl = document.getElementById('visionBaseUrlVal');
  const vKey = document.getElementById('visionApiKeyVal');
  const vModel = document.getElementById('visionModelVal');
  if (urlEl) urlEl.textContent = state.llmBaseUrl || '未配置';
  if (keyEl) keyEl.textContent = state.llmApiKey ? '已配置' : '未配置';
  if (modelEl) modelEl.textContent = state.llmModel || 'deepseek-chat';
  if (vUrl) vUrl.textContent = state.visionBaseUrl || '未配置';
  if (vKey) vKey.textContent = state.visionApiKey ? '已配置' : '未配置';
  if (vModel) vModel.textContent = state.visionModel || '未配置';
}

// 编辑视觉模型
function editVisionField(field) {
  const cur = field === 'baseUrl' ? state.visionBaseUrl : (field === 'apiKey' ? state.visionApiKey : state.visionModel);
  const placeholder = field === 'baseUrl' ? 'https://api.deepseek.com' : (field === 'apiKey' ? 'sk-...' : 'deepseek-v4-flash-vision-exp / gpt-4o / qwen-vl-plus');
  const title = field === 'baseUrl' ? '视觉模型 Base URL' : (field === 'apiKey' ? '视觉模型 API Key' : '视觉模型');
  showInputDialog(title, cur, placeholder, function(v) {
    if (v === null || v === undefined) return;
    if (field === 'baseUrl') state.visionBaseUrl = v.trim();
    else if (field === 'apiKey') state.visionApiKey = v.trim();
    else state.visionModel = v.trim();
    saveProfiles();
    renderLlmConfig();
    showToast('视觉模型已保存');
  });
}

function renderAiPreset() {
  const el = document.getElementById('aiPresetVal');
  if (el) el.textContent = (state.aiPresetPrompt ? '已自定义' : '使用默认预设');
}

// AI 生成新焚决 (一个窗口填 题材/分类/数量, 自动入库)
function aiGeneratePrompt() {
  const cfg = getLlmConfig();
  if (!cfg.apiKey) { showToast('请先配置焚决生成的 LLM API Key', 'error'); return; }
  showAiGenerateDialog();
}

// 表单对话框: 一次填题材/分类/数量
function showAiGenerateDialog() {
  const mask = document.getElementById('dialog');
  document.getElementById('dfTopic').value = '';
  document.getElementById('dfCat').value = 'reality';
  document.getElementById('dfCount').value = '3';
  mask.dataset.mode = 'form';
  _dialogCb = { type: 'form' };
  mask.classList.remove('hidden');
}

async function doAiGenerate(topic, cat, count) {
  const cfg = getLlmConfig();
  if (!cfg.apiKey) { showToast('请先配置 LLM API Key', 'error'); return; }
  showToast('AI 正在生成 ' + count + ' 条焚决...');
  try {
    const url = apiUrl(cfg.baseUrl, '/chat/completions');
    // 收藏焚决 + 收藏历史提示词作为 few-shot 参考（仅风格参考，不覆盖用户指定要求）
    const favs = getAllPrompts().filter(p => state.favPrompts.includes(p.id)).slice(0, 5);
    const favHistPrompts = state.favPromptHistory.slice(0, 5);
    const refParts = [];
    if (favs.length) refParts.push('收藏的优质焚决:\n' + favs.map(f => '- "' + f.name + '": ' + f.prompt).join('\n'));
    if (favHistPrompts.length) refParts.push('收藏的历史提示词:\n' + favHistPrompts.map(p => '- ' + p).join('\n'));
    const favPromptText = refParts.length
      ? '以下是收藏的参考（仅供风格参考，生成结果仍须满足用户要求）:\n' + refParts.join('\n')
      : '(无收藏参考)';
    const systemPrompt = state.aiPresetPrompt || AI_PRESET_DEFAULT;
    const resp = await apiRequest(url, 'POST', {
      'Authorization': 'Bearer ' + cfg.apiKey,
      'Content-Type': 'application/json',
    }, {
      model: cfg.model,
      messages: [
        { role: 'system', content: systemPrompt + '\n' + favPromptText +
          '\n重要：要有创造性！不要从固定词库/模板来回组合，要基于题材真正创作新颖独特的内容——场景、氛围、光影、道具、姿势都要有独创想象，避免陈词滥调。' +
          '\n请严格只输出一个 JSON 数组，每个元素形如 {"name":"焚决名","prompt":"完整提示词","tags":["标签1","标签2"]}，数组长度固定为 ' + count + '，不要输出任何多余文字。' },
        { role: 'user', content: '请生成 ' + count + ' 条题材为「' + topic + '」、分类为「' + cat + '」的优质焚决。要求：每条焚决必须基于题材做差异化，不应雷同——在场景、发色、发型、服饰、姿态、氛围上各有变化（例如少女在不同场景/造型/光线下），每条都是独立有代表性的元气可爱甜美少女。' },
      ],
      max_tokens: count * 400,
    });
    const data = JSON.parse(resp.body);
    if (resp.status !== 200) throw new Error(data.error?.message || ('HTTP ' + resp.status));
    const content = data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
    if (!content) throw new Error('LLM 未返回内容');
    // 解析 JSON 数组 (去掉 markdown + 兜底抠出数组)
    let list;
    try {
      list = JSON.parse(content.trim().replace(/^```json?/i, '').replace(/```$/, '').trim());
    } catch {
      const m = content.match(/\[[\s\S]*\]/);
      if (!m) throw new Error('无法解析 LLM 返回');
      list = JSON.parse(m[0]);
    }
    if (!Array.isArray(list)) list = [list];
    const added = [];
    list.slice(0, count).forEach(item => {
      const id = 'ai-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
      state.customPrompts.push({
        id, name: item.name || topic, category: cat, prompt: item.prompt,
        tags: Array.isArray(item.tags) ? item.tags : [], builtin: false,
      });
      added.push(item.name || topic);
    });
    localStorage.setItem('gpt_customPrompts', JSON.stringify(state.customPrompts));
    renderPrompts();
    showToast('AI 已生成 ' + added.length + ' 条焚决');
  } catch (e) {
    showToast('AI 生成失败: ' + e.message, 'error');
  }
}

// 导出焚决 (JSON)
function exportPrompts() {
  const all = getAllPrompts();
  const blob = new Blob([JSON.stringify(all, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'GPTImage_Fenjue_' + Date.now() + '.json';
  a.click();
  URL.revokeObjectURL(url);
  showToast('焚决已导出 (' + all.length + ' 条)');
}

// 导入焚决 (JSON)
function importPrompts() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json';
  input.onchange = (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        if (!Array.isArray(data)) throw new Error('格式错误');
        const imported = data.filter(x => x && x.name && x.prompt).map(x => ({
          id: x.id || 'c-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
          name: x.name, category: x.category || 'reality',
          prompt: x.prompt, tags: x.tags || [], builtin: false,
        }));
        state.customPrompts = state.customPrompts.concat(imported);
        localStorage.setItem('gpt_customPrompts', JSON.stringify(state.customPrompts));
        renderPrompts();
        showToast('已导入 ' + imported.length + ' 条焚决');
      } catch (err) {
        showToast('导入失败: ' + err.message, 'error');
      }
    };
    reader.readAsText(file);
  };
  input.click();
}


