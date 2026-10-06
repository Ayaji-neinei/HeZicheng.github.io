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
  var DEFAULT_BASE = 'https://api.deepseek.com';
  var DEFAULT_MODEL = 'deepseek-chat';
  var SCREENS = ['home', 'roadmap', 'chat', 'notes'];

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

  /* ---------------- ② 向 AI 提问 ---------------- */

  var chat = load(KEYS.chat, []);
  if (!Array.isArray(chat)) chat = [];

  var settings = load(KEYS.settings, {});
  if (!settings.base) settings.base = DEFAULT_BASE;
  if (!settings.model) settings.model = DEFAULT_MODEL;
  if (typeof settings.key !== 'string') settings.key = '';

  function saveSettings() {
    save(KEYS.settings, settings);
  }

  $('api-base').value = settings.base;
  $('api-model').value = settings.model;
  $('api-key').value = settings.key;

  function refreshApiState() {
    var ready = !!settings.key;
    $('chat-notice').hidden = ready;
    $('api-status').textContent = ready
      ? '已就绪：' + settings.model + ' @ ' + settings.base
      : '尚未填写 API Key';
  }

  $('api-save').addEventListener('click', function () {
    settings.base = $('api-base').value.trim() || DEFAULT_BASE;
    settings.model = $('api-model').value.trim() || DEFAULT_MODEL;
    settings.key = $('api-key').value.trim();
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

  function endpoint() {
    var base = (settings.base || DEFAULT_BASE).replace(/\/+$/, '');
    return /\/chat\/completions$/.test(base) ? base : base + '/chat/completions';
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
      var body = document.createElement('div');
      body.textContent = msg.content;
      box.appendChild(role);
      box.appendChild(body);
      log.appendChild(box);
    });
    if (chat.length) window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
  }

  function buildMessages() {
    var context = [];
    var doing = roadmap.filter(function (s) {
      return s.status === 'doing';
    });
    var done = roadmap.filter(function (s) {
      return s.status === 'done';
    });
    context.push(
      '学生当前的学习状态：正在学「' +
        (doing.length ? doing[0].title : '（未标记）') +
        '」；已完成 ' +
        done.length +
        ' 个阶段' +
        (done.length ? '（' + done.map(function (s) { return s.title.split('：')[0]; }).join('、') + '）' : '') +
        '。'
    );

    var history = chat
      .filter(function (m) {
        return m.role === 'user' || m.role === 'assistant';
      })
      .slice(-12)
      .map(function (m) {
        return { role: m.role, content: m.content };
      });

    return [{ role: 'system', content: SYSTEM_PROMPT + context.join('') }].concat(history);
  }

  var sending = false;

  function sendQuestion() {
    if (sending) return;
    var input = $('chat-input');
    var text = input.value.trim();
    if (!text) {
      input.focus();
      return;
    }

    chat.push({ role: 'user', content: text, at: Date.now() });
    input.value = '';
    save(KEYS.chat, chat);
    renderChat();

    if (!settings.key) {
      $('chat-status').textContent = '未填写 API Key —— 展开上面「AI 设置」填一次，或点「复制问题」';
      return;
    }

    sending = true;
    $('chat-send').disabled = true;
    $('chat-status').textContent = '正在思考…';

    fetch(endpoint(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + settings.key
      },
      body: JSON.stringify({ model: settings.model, messages: buildMessages(), stream: false })
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
            var content =
              data && data.choices && data.choices[0] && data.choices[0].message
                ? data.choices[0].message.content
                : '';
            chat.push({ role: 'assistant', content: (content || '(没有返回内容)').trim(), at: Date.now() });
          });
      })
      .catch(function (err) {
        chat.push({
          role: 'error',
          content: '请求失败：' + err.message + '\n（检查 Key 是否有效、余额是否足够、网络是否可访问该接口）',
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

  Array.prototype.slice.call(document.querySelectorAll('.chip')).forEach(function (chip) {
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
      settings: { base: settings.base, model: settings.model }
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
})();
