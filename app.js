/* ============================================================
   AI 学习管理 · 逻辑
   三块内容都保存在本机浏览器的 localStorage 里，不上传服务器。
   ============================================================ */

(function () {
  'use strict';

  var KEYS = {
    roadmap: 'aiStudy.roadmap.v1',
    chat: 'aiStudy.chat.v1',
    notes: 'aiStudy.notes.v1',
    settings: 'aiStudy.settings.v1'
  };

  var STATUS_TEXT = { todo: '未开始', doing: '学习中', done: '已完成' };
  var STATUS_ORDER = ['todo', 'doing', 'done'];
  var SCREENS = ['home', 'roadmap', 'chat', 'notes'];

  var DEFAULT_BASE = 'https://api.deepseek.com';
  var DEFAULT_MODEL = 'deepseek-flash';
  var OLD_MODELS = ['deepseek-chat', 'deepseek-reasoner', 'deepseek-v4-flash', 'deepseek-v4-flash-vision-exp'];

  var ATTACH_HINT =
    '支持图片（png / jpg / gif / webp）和文本类文件（txt / md / csv / json / 代码）。可拖拽到这一块，或直接在输入框里 Ctrl+V 粘贴截图。';

  var IMAGE_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tif', 'tiff', 'avif', 'heic', 'heif', 'svg'];
  var IMAGE_MIME = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
  var TEXT_EXT = [
    'txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'log', 'yml', 'yaml', 'ini', 'conf', 'cfg',
    'xml', 'html', 'htm', 'css', 'js', 'mjs', 'cjs', 'ts', 'jsx', 'tsx', 'py', 'java', 'c', 'h',
    'cpp', 'hpp', 'cs', 'go', 'rs', 'rb', 'php', 'sh', 'bat', 'sql', 'r', 'm', 'ipynb', 'tex', 'srt', 'vtt'
  ];
  var MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 单张图片硬上限（接口上限 32 MiB，这里保守些）
  var SOFT_IMAGE_BYTES = 3 * 1024 * 1024; // 超过就先压缩
  var MAX_IMAGE_SIDE = 1600; // 压缩后最长边像素
  var MAX_FILE_BYTES = 1024 * 1024; // 文本文件上限
  var MAX_TEXT_CHARS = 20000; // 单个文本文件最多带入的字符数
  var MAX_ATTACH = 10; // 一次最多附件数
  var MAX_REASON_CHARS = 5000; // 思考过程最多保存的字符数

  var DEFAULT_ROADMAP = [
    '数学基础：线性代数、概率统计、微积分',
    'Python 与数据处理：NumPy / Pandas / Matplotlib',
    '机器学习基础：回归、分类、聚类、评估指标',
    '深度学习入门：神经网络、反向传播、PyTorch',
    '方向选择：计算机视觉 / 自然语言处理 / 强化学习',
    '大模型应用：Transformer、提示工程、RAG、微调',
    '工程与项目：把模型部署成能用的东西，做一个完整项目'
  ];

  var SYSTEM_PROMPT =
    '你是一位耐心、务实的 AI 学习助教，辅导一名人工智能专业的本科学生。' +
    '回答要求：先给一句话结论，再分点讲清楚；能用小例子或类比就用；' +
    '最后给出可执行的下一步（学什么、练什么、大概花多久）。' +
    '如果学生附上了图片或文件，先说明你从中看到的关键信息，再回答。' +
    '输出格式：用 Markdown（小标题、列表、加粗、代码块、表格）；' +
    '数学公式一律用 LaTeX 写，行内公式用 $...$，独立成行的公式用 $$...$$，' +
    '不要用 Unicode 拼凑公式，也不要用图片代替公式；' +
    '普通符号（α、β、∑、≤、→ 等）可以直接写。' +
    '避免空话和鸡汤，也避免超出问题范围的扩展。';

  function $(id) {
    return document.getElementById(id);
  }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function load(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (err) {
      return fallback;
    }
  }

  function save(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
      /* 隐私模式或空间不足时忽略 */
    }
  }

  function fmtTime(ts) {
    var d = new Date(ts);
    function p(n) {
      return n < 10 ? '0' + n : String(n);
    }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  function humanSize(bytes) {
    if (!bytes && bytes !== 0) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  }

  function extOf(name) {
    var i = String(name).lastIndexOf('.');
    return i < 0 ? '' : String(name).slice(i + 1).toLowerCase();
  }

  function kindOf(file) {
    var ext = extOf(file.name);
    var mime = file.type || '';
    // 只要浏览器认为它是图片就交给图片流程：接口不收的格式（BMP/TIFF/HEIC 等）
    // 会由 canvas 尝试转成 JPEG，而不是直接拒绝。
    if (mime.indexOf('image/') === 0 || IMAGE_EXT.indexOf(ext) >= 0) return 'image';
    if (TEXT_EXT.indexOf(ext) >= 0 || mime.indexOf('text/') === 0) return 'text';
    if (mime === 'application/json' || mime === 'application/xml') return 'text';
    return 'unsupported';
  }

  /* ---------------- 图片读取与压缩 ---------------- */

  function fileToDataUrl(file, onDone, onFail) {
    var fr = new FileReader();
    fr.onload = function () {
      onDone(String(fr.result));
    };
    fr.onerror = function () {
      onFail();
    };
    fr.readAsDataURL(file);
  }

  /**
   * 用 canvas 把图片重画成 JPEG：既能兼容 HEIC 等浏览器能解码但接口不收的格式，
   * 也能把手机大图缩小，避免请求过大。失败时回调 onFail，由调用方决定回退策略。
   */
  function shrinkImage(file, onDone, onFail) {
    if (typeof window.createImageBitmap !== 'function') {
      onFail();
      return;
    }
    window
      .createImageBitmap(file)
      .then(function (bitmap) {
        var scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
        var w = Math.max(1, Math.round(bitmap.width * scale));
        var h = Math.max(1, Math.round(bitmap.height * scale));
        var canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        var ctx = canvas.getContext('2d');
        if (!ctx) {
          onFail();
          return;
        }
        ctx.drawImage(bitmap, 0, 0, w, h);
        if (bitmap.close) bitmap.close();
        canvas.toBlob(
          function (blob) {
            if (!blob) {
              onFail();
              return;
            }
            fileToDataUrl(blob, onDone, onFail);
          },
          'image/jpeg',
          0.85
        );
      })
      .catch(function () {
        onFail();
      });
  }

  function miniBtn(label, title, onClick, danger) {
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn mini';
    btn.textContent = label;
    btn.title = title;
    btn.addEventListener('click', onClick);
    if (danger) btn.style.color = 'var(--warn)';
    return btn;
  }

  /* ---------------- 自检与错误提示 ---------------- */

  var APP_VERSION = 'v7';

  function showAlert(text) {
    var el = $('app-alert');
    if (!el) return;
    el.hidden = false;
    el.textContent = text;
  }

  window.addEventListener('error', function (event) {
    showAlert(
      '页面脚本出错：' +
        (event.message || '未知错误') +
        '。请按 Ctrl + F5（Mac：Cmd + Shift + R）强制刷新一次再试。'
    );
  });

  (function selfCheck() {
    var required = [
      'screen-home', 'screen-roadmap', 'screen-chat', 'screen-notes',
      'roadmap-list', 'note-list', 'attach-zone', 'attach-btn', 'attach-input',
      'chat-send', 'chat-log', 'chat-input'
    ];
    var missing = required.filter(function (id) {
      return !$(id);
    });
    if (missing.length) {
      showAlert(
        '页面文件不完整（缺少：' + missing.join('、') + '），几乎可以确定是浏览器缓存了旧版本。' +
          '请按 Ctrl + F5（Mac：Cmd + Shift + R）强制刷新一次。'
      );
    }
  })();

  /* ---------------- 界面切换：主界面 ↔ 子界面 ---------------- */

  function showScreen(name) {
    SCREENS.forEach(function (key) {
      var el = $('screen-' + key);
      if (el) el.classList.toggle('is-active', key === name);
    });
    window.scrollTo(0, 0);
  }

  Array.prototype.slice.call(document.querySelectorAll('[data-screen]')).forEach(function (el) {
    el.addEventListener('click', function (event) {
      if (el.tagName === 'A') event.preventDefault();
      var target = el.dataset.screen;
      showScreen(target);
      if (history.replaceState) history.replaceState(null, '', '#' + target);
    });
  });

  window.addEventListener('hashchange', function () {
    var name = (location.hash || '').replace('#', '');
    showScreen(SCREENS.indexOf(name) >= 0 ? name : 'home');
  });

  var initialScreen = (location.hash || '').replace('#', '');
  showScreen(SCREENS.indexOf(initialScreen) >= 0 ? initialScreen : 'home');

  /* ---------------- ① 学习路线 ---------------- */

  var roadmap = load(KEYS.roadmap, null);
  if (!Array.isArray(roadmap) || roadmap.length === 0) {
    roadmap = DEFAULT_ROADMAP.map(function (title, index) {
      return { id: uid(), title: title, status: index === 0 ? 'doing' : 'todo' };
    });
    save(KEYS.roadmap, roadmap);
  }

  function saveRoadmap() {
    save(KEYS.roadmap, roadmap);
  }

  function renderRoadmap() {
    var list = $('roadmap-list');
    list.textContent = '';

    roadmap.forEach(function (stage, index) {
      var li = document.createElement('li');
      li.className = 'stage' + (stage.status === 'done' ? ' done' : '');

      var badge = document.createElement('button');
      badge.type = 'button';
      badge.className = 'badge ' + stage.status;
      badge.textContent = STATUS_TEXT[stage.status];
      badge.title = '点击切换状态';
      badge.addEventListener('click', function () {
        var next = STATUS_ORDER[(STATUS_ORDER.indexOf(stage.status) + 1) % STATUS_ORDER.length];
        stage.status = next;
        saveRoadmap();
        renderRoadmap();
      });

      var title = document.createElement('span');
      title.className = 'stage-title';
      title.textContent = stage.title;

      var tools = document.createElement('span');
      tools.className = 'stage-tools';
      tools.appendChild(
        miniBtn('↑', '上移', function () {
          if (index === 0) return;
          roadmap.splice(index - 1, 0, roadmap.splice(index, 1)[0]);
          saveRoadmap();
          renderRoadmap();
        })
      );
      tools.appendChild(
        miniBtn('↓', '下移', function () {
          if (index === roadmap.length - 1) return;
          roadmap.splice(index + 1, 0, roadmap.splice(index, 1)[0]);
          saveRoadmap();
          renderRoadmap();
        })
      );
      tools.appendChild(
        miniBtn('删除', '删除这一条', function () {
          if (!confirm('删除「' + stage.title + '」？')) return;
          roadmap.splice(index, 1);
          saveRoadmap();
          renderRoadmap();
        }, true)
      );

      li.appendChild(badge);
      li.appendChild(title);
      li.appendChild(tools);
      list.appendChild(li);
    });

    var done = roadmap.filter(function (s) {
      return s.status === 'done';
    }).length;
    var doing = roadmap.filter(function (s) {
      return s.status === 'doing';
    });
    var total = roadmap.length;

    $('roadmap-empty').hidden = total > 0;
    $('roadmap-bar').style.width = total ? Math.round((done / total) * 100) + '%' : '0%';
    $('roadmap-summary').textContent =
      total === 0
        ? '还没有阶段'
        : '已完成 ' +
          done +
          ' / ' +
          total +
          (doing.length ? ' · 正在学：' + doing[0].title : ' · 当前没有标记「学习中」的阶段');
  }

  function addStage() {
    var input = $('stage-input');
    var text = input.value.trim();
    if (!text) {
      input.focus();
      return;
    }
    roadmap.push({ id: uid(), title: text, status: 'todo' });
    input.value = '';
    saveRoadmap();
    renderRoadmap();
  }

  $('stage-add').addEventListener('click', addStage);
  $('stage-input').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') addStage();
  });

  /* ---------------- ③ 学习笔记 ---------------- */

  var notes = load(KEYS.notes, []);
  if (!Array.isArray(notes)) notes = [];

  function saveNotes() {
    save(KEYS.notes, notes);
  }

  function renderNotes() {
    var list = $('note-list');
    var query = $('note-search').value.trim().toLowerCase();
    list.textContent = '';

    var shown = notes.filter(function (note) {
      if (!query) return true;
      return (
        (note.text || '').toLowerCase().indexOf(query) >= 0 ||
        (note.tag || '').toLowerCase().indexOf(query) >= 0
      );
    });

    shown.forEach(function (note) {
      var li = document.createElement('li');
      li.className = 'note';

      var head = document.createElement('div');
      head.className = 'note-head';
      var time = document.createElement('span');
      time.textContent = fmtTime(note.at);
      head.appendChild(time);
      if (note.tag) {
        var tag = document.createElement('span');
        tag.className = 'note-tag';
        tag.textContent = note.tag;
        head.appendChild(tag);
      }

      var body = document.createElement('div');
      body.className = 'note-body';
      body.textContent = note.text;

      var foot = document.createElement('div');
      foot.className = 'note-foot';
      foot.appendChild(
        miniBtn('删除', '删除这条笔记', function () {
          if (!confirm('删除这条笔记？')) return;
          notes = notes.filter(function (n) {
            return n.id !== note.id;
          });
          saveNotes();
          renderNotes();
          renderFooter();
        }, true)
      );

      li.appendChild(head);
      li.appendChild(body);
      li.appendChild(foot);
      list.appendChild(li);
    });

    $('notes-empty').hidden = shown.length > 0;
    $('notes-empty').textContent = notes.length === 0 ? '还没有笔记。' : '没有匹配的笔记。';
    $('notes-summary').textContent =
      notes.length === 0 ? '还没有笔记' : '共 ' + notes.length + ' 条笔记' + (query ? '（匹配 ' + shown.length + ' 条）' : '');
  }

  function addNote() {
    var input = $('note-input');
    var text = input.value.trim();
    if (!text) {
      input.focus();
      return;
    }
    notes.unshift({ id: uid(), text: text, tag: $('note-tag').value.trim(), at: Date.now() });
    input.value = '';
    $('note-tag').value = '';
    saveNotes();
    renderNotes();
    renderFooter();
  }

  $('note-add').addEventListener('click', addNote);
  $('note-search').addEventListener('input', renderNotes);
  $('note-input').addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') addNote();
  });

  /* ---------------- ② 向 AI 提问：设置 ---------------- */

  var chat = load(KEYS.chat, []);
  if (!Array.isArray(chat)) chat = [];

  var settings = load(KEYS.settings, {});
  if (!settings.base) settings.base = DEFAULT_BASE;
  if (!settings.model || OLD_MODELS.indexOf(settings.model) >= 0) settings.model = DEFAULT_MODEL; // 旧默认值迁移
  if (typeof settings.thinking !== 'boolean') settings.thinking = false;
  if (typeof settings.key !== 'string') settings.key = '';

  /** 仅存在于本次会话内存里的图片数据：消息 id -> [dataURL]。刷新后旧的图片不再随对话发送。 */
  var sessionImages = {};

  function saveSettings() {
    save(KEYS.settings, settings);
  }

  $('api-base').value = settings.base;
  $('api-model').value = settings.model;
  $('api-key').value = settings.key;
  $('api-thinking').checked = settings.thinking;

  function isDeepSeekBase() {
    return (settings.base || '').toLowerCase().indexOf('deepseek') >= 0;
  }

  function modelLooksVisionless() {
    var m = (settings.model || '').toLowerCase();
    return m.indexOf('v4-pro') >= 0 || m.indexOf('deepseek-chat') >= 0 || m.indexOf('reasoner') >= 0;
  }

  function refreshApiState() {
    var ready = !!settings.key;
    $('chat-notice').hidden = ready;
    if (!ready) {
      $('api-status').textContent = '尚未填写 API Key';
      return;
    }
    var bits = [settings.model + ' @ ' + settings.base];
    if (settings.thinking) bits.push('深度思考已开');
    if (modelLooksVisionless()) bits.push('该模型不支持图片');
    $('api-status').textContent = '已就绪：' + bits.join(' · ');
  }

  $('api-save').addEventListener('click', function () {
    settings.base = $('api-base').value.trim() || DEFAULT_BASE;
    settings.model = $('api-model').value.trim() || DEFAULT_MODEL;
    settings.key = $('api-key').value.trim();
    settings.thinking = !!$('api-thinking').checked;
    saveSettings();
    refreshApiState();
    $('chat-status').textContent = settings.key ? '已保存到本机浏览器' : '没有填写 Key';
    setTimeout(function () {
      $('chat-status').textContent = '';
    }, 2500);
  });

  $('api-clear').addEventListener('click', function () {
    settings.key = '';
    $('api-key').value = '';
    saveSettings();
    refreshApiState();
    $('chat-status').textContent = '已清除本机保存的 Key';
  });

  Array.prototype.slice.call(document.querySelectorAll('.presets .chip')).forEach(function (chip) {
    chip.addEventListener('click', function () {
      $('api-model').value = chip.dataset.model;
    });
  });

  /* ---------------- ② 向 AI 提问：附件 ---------------- */

  var pending = [];

  function setAttachStatus(text, sticky) {
    var el = $('attach-status');
    if (!el) return;
    el.textContent = text || ATTACH_HINT;
    el.classList.toggle('warn', !!text);
    if (text && !sticky) {
      window.setTimeout(function () {
        el.textContent = ATTACH_HINT;
        el.classList.remove('warn');
      }, 8000);
    }
  }

  function renderPending() {
    var list = $('attach-list');
    list.textContent = '';
    pending.forEach(function (att) {
      var li = document.createElement('li');
      li.className = 'attach-item';

      if (att.kind === 'image' && att.dataUrl) {
        var img = document.createElement('img');
        img.className = 'attach-thumb';
        img.src = att.dataUrl;
        img.alt = att.name;
        li.appendChild(img);
      }

      var name = document.createElement('span');
      name.className = 'attach-name';
      name.textContent =
        att.name +
        ' · ' +
        humanSize(att.size) +
        (att.kind === 'image' ? ' · 图片' : ' · 文本') +
        (att.note ? '（' + att.note + '）' : '');
      li.appendChild(name);

      var rm = document.createElement('button');
      rm.type = 'button';
      rm.className = 'attach-remove';
      rm.textContent = '×';
      rm.title = '移除这个附件';
      rm.addEventListener('click', function () {
        pending = pending.filter(function (a) {
          return a.id !== att.id;
        });
        renderPending();
      });
      li.appendChild(rm);

      list.appendChild(li);
    });
    $('chat-send').disabled = sending;
  }

  function addFiles(fileList) {
    var queue = Array.prototype.slice.call(fileList || []);
    if (!queue.length) return;
    var notesOut = [];
    var stopped = false;

    function step() {
      if (stopped || !queue.length) {
        renderPending();
        setAttachStatus(notesOut.join('；'), notesOut.length > 0);
        return;
      }
      if (pending.length >= MAX_ATTACH) {
        notesOut.push('一次最多 ' + MAX_ATTACH + ' 个附件');
        stopped = true;
        step();
        return;
      }

      var file = queue.shift();
      var kind = kindOf(file);

      if (kind === 'unsupported') {
        notesOut.push('不支持「' + file.name + '」（目前只支持图片和文本类文件；PDF / Word 请截图上传，或把文字复制进问题）');
        step();
        return;
      }

      if (kind === 'image') {
        var supportedType = IMAGE_MIME.indexOf(file.type) >= 0;

        var accept = function (dataUrl, note) {
          pending.push({
            id: uid(),
            name: file.name,
            size: file.size,
            kind: 'image',
            dataUrl: dataUrl,
            note: note || ''
          });
          step();
        };

        var fallbackRaw = function () {
          if (supportedType && file.size <= MAX_IMAGE_BYTES) {
            fileToDataUrl(
              file,
              function (url) {
                accept(url, '');
              },
              function () {
                notesOut.push('读取「' + file.name + '」失败');
                step();
              }
            );
            return;
          }
          if (!supportedType) {
            notesOut.push(
              '「' + file.name + '」这种图片格式浏览器转不了（iPhone 照片的 HEIC 最常见），请在相册里导出成 JPEG 再上传'
            );
          } else {
            notesOut.push('图片「' + file.name + '」超过 ' + humanSize(MAX_IMAGE_BYTES) + ' 且无法自动压缩，请先压缩');
          }
          step();
        };

        var needsWork = !supportedType || (file.size > SOFT_IMAGE_BYTES && file.type !== 'image/gif');
        if (needsWork) {
          shrinkImage(
            file,
            function (url) {
              accept(url, '已自动压缩');
            },
            fallbackRaw
          );
        } else if (file.size > MAX_IMAGE_BYTES) {
          notesOut.push('图片「' + file.name + '」超过 ' + humanSize(MAX_IMAGE_BYTES) + '，请先压缩后再传');
          step();
        } else {
          fileToDataUrl(
            file,
            function (url) {
              accept(url, '');
            },
            fallbackRaw
          );
        }
        return;
      }

      if (file.size > MAX_FILE_BYTES) {
        notesOut.push('文件「' + file.name + '」超过 ' + humanSize(MAX_FILE_BYTES) + '，请只截取需要的部分');
        step();
        return;
      }
      var tr = new FileReader();
      tr.onload = function () {
        var text = String(tr.result || '');
        var cut = text.length > MAX_TEXT_CHARS;
        pending.push({
          id: uid(),
          name: file.name,
          size: file.size,
          kind: 'text',
          text: cut ? text.slice(0, MAX_TEXT_CHARS) : text,
          truncated: cut
        });
        if (cut) notesOut.push('「' + file.name + '」太长，只带入前 ' + MAX_TEXT_CHARS + ' 个字符');
        step();
      };
      tr.onerror = function () {
        notesOut.push('读取「' + file.name + '」失败');
        step();
      };
      tr.readAsText(file);
    }

    step();
  }

  if ($('attach-btn') && $('attach-input')) {
    $('attach-btn').addEventListener('click', function () {
      $('attach-input').click();
    });
    $('attach-input').addEventListener('change', function (e) {
      addFiles(e.target.files);
      e.target.value = '';
    });
  }

  var zone = $('screen-chat');
  if (zone) {
    ['dragenter', 'dragover'].forEach(function (evt) {
      zone.addEventListener(evt, function (e) {
        e.preventDefault();
        zone.classList.add('drop-active');
      });
    });
    zone.addEventListener('dragleave', function (e) {
      if (!zone.contains(e.relatedTarget)) zone.classList.remove('drop-active');
    });
    zone.addEventListener('drop', function (e) {
      e.preventDefault();
      zone.classList.remove('drop-active');
      if (e.dataTransfer && e.dataTransfer.files) addFiles(e.dataTransfer.files);
    });
  }

  /* ---------------- ② 向 AI 提问：对话 ---------------- */

  function endpoint() {
    var base = (settings.base || DEFAULT_BASE).replace(/\/+$/, '');
    return /\/chat\/completions$/.test(base) ? base : base + '/chat/completions';
  }

  function attachmentChips(msg) {
    var chips = [];
    (msg.attachments || []).forEach(function (a) {
      chips.push({ name: a.name, size: a.size, kind: 'image' });
    });
    (msg.files || []).forEach(function (f) {
      chips.push({ name: f.name, size: f.size, kind: 'text' });
    });
    return chips;
  }

  /**
   * 把 AI 的回答渲染成富文本：Markdown → 净化 → 数学公式。
   * 任何一步缺少依赖或出错都会退回到纯文本，不会让消息显示不出来。
   */
  function renderRichInto(el, text) {
    var marked = window.marked;
    var purify = window.DOMPurify;

    if (!marked || typeof marked.parse !== 'function') {
      el.textContent = text;
      return;
    }

    var html;
    try {
      html = marked.parse(text, { gfm: true, breaks: true });
    } catch (err) {
      el.textContent = text;
      return;
    }

    // 模型输出属于外部内容：一定要净化，避免脚本注入（本地存着 API Key）
    if (purify) {
      html = purify.sanitize(html, {
        FORBID_TAGS: [
          'style', 'script', 'iframe', 'object', 'embed', 'form', 'input', 'button',
          'link', 'meta', 'base', 'img', 'video', 'audio', 'source', 'track'
        ],
        FORBID_ATTR: ['style', 'srcset', 'formaction'],
        ALLOW_DATA_ATTR: false
      });
    }

    el.innerHTML = html;

    // 只允许安全协议的链接，并且统一新窗口打开
    Array.prototype.slice.call(el.querySelectorAll('a')).forEach(function (a) {
      var href = a.getAttribute('href') || '';
      if (!/^(https?:\/\/|mailto:|#)/i.test(href)) {
        a.removeAttribute('href');
        return;
      }
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
    });

    // 数学公式：$...$、$$...$$、\(...\)、\[...\]
    if (window.katex && typeof window.renderMathInElement === 'function') {
      try {
        window.renderMathInElement(el, {
          delimiters: [
            { left: '$$', right: '$$', display: true },
            { left: '\\[', right: '\\]', display: true },
            { left: '$', right: '$', display: false },
            { left: '\\(', right: '\\)', display: false }
          ],
          ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code', 'option'],
          throwOnError: false,
          errorColor: '#b7791f'
        });
      } catch (err) {
        /* 公式渲染失败不影响正文 */
      }
    }
  }

  function renderChat() {
    var log = $('chat-log');
    log.textContent = '';
    chat.forEach(function (msg) {
      var box = document.createElement('div');
      box.className = 'msg ' + msg.role;

      var role = document.createElement('span');
      role.className = 'msg-role';
      role.textContent =
        (msg.role === 'user' ? '你' : msg.role === 'assistant' ? 'AI 助教' : '出错了') + ' · ' + fmtTime(msg.at);
      box.appendChild(role);

      var body = document.createElement('div');
      body.className = 'msg-body';
      if (msg.role === 'assistant') {
        box.classList.add('rich-msg');
        body.classList.add('rich');
        renderRichInto(body, msg.content);
      } else {
        body.textContent = msg.content;
      }
      box.appendChild(body);

      var chips = attachmentChips(msg);
      if (chips.length) {
        var wrap = document.createElement('div');
        wrap.className = 'msg-atts';
        chips.forEach(function (chip) {
          var item = document.createElement('span');
          item.className = 'msg-att';
          var label = document.createElement('span');
          label.textContent = (chip.kind === 'image' ? '图片：' : '文件：') + chip.name + ' · ' + humanSize(chip.size);
          item.appendChild(label);
          wrap.appendChild(item);
        });
        var imgs = sessionImages[msg.id];
        if (imgs && imgs.length) {
          imgs.forEach(function (url) {
            var thumb = document.createElement('span');
            thumb.className = 'msg-att';
            var img = document.createElement('img');
            img.src = url;
            img.alt = '附件图片';
            thumb.appendChild(img);
            wrap.appendChild(thumb);
          });
        }
        box.appendChild(wrap);
      }

      if (msg.role === 'assistant' && msg.reasoning) {
        var det = document.createElement('details');
        det.className = 'reasoning';
        var sum = document.createElement('summary');
        sum.textContent = '查看思考过程';
        var pre = document.createElement('div');
        pre.className = 'reasoning-body';
        pre.textContent = msg.reasoning;
        det.appendChild(sum);
        det.appendChild(pre);
        box.appendChild(det);
      }

      log.appendChild(box);
    });
    if (chat.length) window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  }

  function buildMessages() {
    var doing = roadmap.filter(function (s) {
      return s.status === 'doing';
    });
    var done = roadmap.filter(function (s) {
      return s.status === 'done';
    });
    var context =
      '学生当前的学习状态：正在学「' +
      (doing.length ? doing[0].title : '（未标记）') +
      '」；已完成 ' +
      done.length +
      ' 个阶段' +
      (done.length
        ? '（' +
          done
            .map(function (s) {
              return s.title.split('：')[0];
            })
            .join('、') +
          '）'
        : '') +
      '。';

    var history = chat
      .filter(function (m) {
        return m.role === 'user' || m.role === 'assistant';
      })
      .slice(-12)
      .map(function (m) {
        var text = m.content || '';
        if (m.role !== 'user') return { role: m.role, content: text };

        (m.files || []).forEach(function (f) {
          text += '\n\n【附件：' + f.name + '】\n' + f.text + (f.truncated ? '\n（附件过长，已截断）' : '');
        });

        var imgs = sessionImages[m.id];
        if (imgs && imgs.length) {
          var blocks = [{ type: 'text', text: text || '请看下面的图片并回答。' }];
          imgs.forEach(function (url) {
            blocks.push({ type: 'image_url', image_url: { url: url } });
          });
          return { role: 'user', content: blocks };
        }
        return { role: 'user', content: text };
      });

    return [{ role: 'system', content: SYSTEM_PROMPT + context }].concat(history);
  }

  function requestBody() {
    var body = { model: settings.model, messages: buildMessages(), stream: false };
    if (isDeepSeekBase()) {
      body.thinking = { type: settings.thinking ? 'enabled' : 'disabled' };
      if (settings.thinking) body.reasoning_effort = 'high';
    }
    return body;
  }

  var sending = false;

  function sendQuestion() {
    if (sending) return;

    var input = $('chat-input');
    var text = input.value.trim();
    if (!text && pending.length === 0) {
      input.focus();
      return;
    }

    var msg = { id: uid(), role: 'user', content: text || '（请看下面的图片 / 附件）', at: Date.now() };
    if (pending.length) {
      var imgs = pending.filter(function (a) {
        return a.kind === 'image';
      });
      var files = pending.filter(function (a) {
        return a.kind === 'text';
      });
      if (files.length) {
        msg.files = files.map(function (a) {
          return { name: a.name, size: a.size, text: a.text, truncated: !!a.truncated };
        });
      }
      if (imgs.length) {
        msg.attachments = imgs.map(function (a) {
          return { name: a.name, size: a.size, type: 'image' };
        });
        sessionImages[msg.id] = imgs.map(function (a) {
          return a.dataUrl;
        });
      }
    }

    chat.push(msg);
    input.value = '';
    pending = [];
    renderPending();
    setAttachStatus('');
    save(KEYS.chat, chat);
    renderChat();

    if (!settings.key) {
      $('chat-status').textContent = '未填写 API Key —— 展开上面「AI 设置」填一次，或点「复制问题」';
      return;
    }

    if (msg.attachments && msg.attachments.length && modelLooksVisionless()) {
      chat.push({
        role: 'error',
        content:
          '提示：当前模型「' +
          settings.model +
          '」不支持图片输入，图片不会被读到。请在「AI 设置」里把模型换成 deepseek-flash，再发一次带图的问题。',
        at: Date.now()
      });
      save(KEYS.chat, chat);
      renderChat();
      return;
    }

    sending = true;
    $('chat-send').disabled = true;
    renderPending();
    $('chat-status').textContent = settings.thinking ? '正在深度思考…' : '正在思考…';

    fetch(endpoint(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + settings.key
      },
      body: JSON.stringify(requestBody())
    })
      .then(function (res) {
        return res
          .json()
          .catch(function () {
            return null;
          })
          .then(function (data) {
            if (!res.ok) {
              var reason =
                (data && data.error && (data.error.message || data.error.type)) || 'HTTP ' + res.status;
              throw new Error(reason);
            }
            var message = data && data.choices && data.choices[0] ? data.choices[0].message : null;
            var content = message ? message.content : '';
            var reasoning = message && message.reasoning_content ? String(message.reasoning_content) : '';
            var record = { role: 'assistant', content: (content || '(没有返回内容)').trim(), at: Date.now() };
            if (reasoning) record.reasoning = reasoning.slice(0, MAX_REASON_CHARS);
            chat.push(record);
          });
      })
      .catch(function (err) {
        var extra =
          msg.attachments && msg.attachments.length
            ? '\n（带图片提问时，模型必须支持图片；deepseek-flash 支持，deepseek-v4-pro 不支持）'
            : '';
        chat.push({
          role: 'error',
          content:
            '请求失败：' + err.message + extra + '\n（检查 Key 是否有效、余额是否足够、网络是否可访问该接口）',
          at: Date.now()
        });
      })
      .then(function () {
        sending = false;
        $('chat-send').disabled = false;
        $('chat-status').textContent = '';
        save(KEYS.chat, chat);
        renderChat();
      });
  }

  $('chat-send').addEventListener('click', sendQuestion);
  $('chat-input').addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') sendQuestion();
  });
  $('chat-input').addEventListener('paste', function (e) {
    var files = e.clipboardData && e.clipboardData.files;
    if (files && files.length) {
      e.preventDefault();
      addFiles(files);
    }
  });

  Array.prototype.slice.call(document.querySelectorAll('.quick .chip')).forEach(function (chip) {
    chip.addEventListener('click', function () {
      var input = $('chat-input');
      input.value = chip.dataset.prompt + input.value;
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    });
  });

  $('chat-copy').addEventListener('click', function () {
    var input = $('chat-input');
    var text = input.value.trim();
    if (!text) {
      for (var i = chat.length - 1; i >= 0; i -= 1) {
        if (chat[i].role === 'user') {
          text = chat[i].content;
          break;
        }
      }
    }
    if (!text) {
      $('chat-status').textContent = '没有可复制的内容';
      return;
    }
    var done = function () {
      $('chat-status').textContent = '已复制，可以贴到别处提问';
      setTimeout(function () {
        $('chat-status').textContent = '';
      }, 2500);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () {
        window.prompt('复制下面这段文字：', text);
      });
    } else {
      window.prompt('复制下面这段文字：', text);
    }
  });

  $('chat-clear').addEventListener('click', function () {
    if (chat.length === 0) return;
    if (!confirm('清空全部对话记录？')) return;
    chat = [];
    sessionImages = {};
    save(KEYS.chat, chat);
    renderChat();
  });

  /* ---------------- 备份：导出 / 导入 ---------------- */

  function renderFooter() {
    $('footer-status').textContent =
      '当前：路线 ' +
      roadmap.length +
      ' 个阶段 · 对话 ' +
      chat.length +
      ' 条 · 笔记 ' +
      notes.length +
      ' 条';
  }

  $('data-export').addEventListener('click', function () {
    var payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      roadmap: roadmap,
      chat: chat,
      notes: notes,
      settings: { base: settings.base, model: settings.model, thinking: settings.thinking }
    };
    var blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    var d = new Date();
    function p(n) {
      return n < 10 ? '0' + n : String(n);
    }
    a.href = url;
    a.download = 'ai-study-backup-' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  });

  $('data-import').addEventListener('click', function () {
    $('data-file').click();
  });

  $('data-file').addEventListener('change', function (e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      try {
        var data = JSON.parse(String(reader.result));
        if (!confirm('导入会覆盖当前内容，继续？')) return;
        if (Array.isArray(data.roadmap)) {
          roadmap = data.roadmap;
          saveRoadmap();
        }
        if (Array.isArray(data.chat)) {
          chat = data.chat;
          save(KEYS.chat, chat);
        }
        if (Array.isArray(data.notes)) {
          notes = data.notes;
          saveNotes();
        }
        renderRoadmap();
        renderChat();
        renderNotes();
        renderFooter();
        alert('导入完成。');
      } catch (err) {
        alert('这个文件读不出来，请选择之前导出的 JSON 备份。');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  /* ---------------- 首次渲染 ---------------- */

  refreshApiState();
  renderRoadmap();
  renderChat();
  renderNotes();
  renderFooter();
  setAttachStatus('');
  window.__aiStudyReady = true;
})();
