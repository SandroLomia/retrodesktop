// ======= RetroOS XP - Core System =======
(function () {
  'use strict';

  let windowId = 0;
  let activeWindowId = null;
  let dragState = null;
  let resizeState = null;
  const openWindows = {};
  const defaultFS = {
    'home': { 'user': { 'Documents': { 'readme.txt': 'Welcome to RetroLinux!\nThis is your home folder.', 'notes.txt': 'Shopping List:\n- Milk\n- Bread\n- Coffee', 'todo.txt': 'TODO:\n1. Learn Bash\n2. Configure dotfiles\n3. Profit!' }, 'Desktop': {}, 'Pictures': {}, 'Downloads': {} } },
    'usr': { 'bin': {}, 'share': {} },
    'etc': { 'passwd': '', 'fstab': '' },
    'var': { 'log': {} }
  };
  const fsListeners = new Set();
  const trashListeners = new Set();
  let fileSystem;
  try { fileSystem = JSON.parse(localStorage.getItem('retrofs')); } catch (e) { }
  if (!fileSystem || typeof fileSystem !== 'object') fileSystem = JSON.parse(JSON.stringify(defaultFS));
  function notifyListeners(listeners) {
    listeners.forEach((listener) => {
      try { listener(); } catch (e) { }
    });
  }
  function subscribeToFS(listener) {
    fsListeners.add(listener);
    return () => fsListeners.delete(listener);
  }
  function subscribeToTrash(listener) {
    trashListeners.add(listener);
    return () => trashListeners.delete(listener);
  }
  function saveFS() {
    try {
      localStorage.setItem('retrofs', JSON.stringify(fileSystem));
      updateDesktopIcons();
      notifyListeners(fsListeners);
    } catch (e) { }
  }
  let trashBin = [];
  try { trashBin = JSON.parse(localStorage.getItem('retrotrash')) || []; } catch (e) { trashBin = []; }
  function saveTrash() {
    try {
      localStorage.setItem('retrotrash', JSON.stringify(trashBin));
      notifyListeners(trashListeners);
    } catch (e) { }
  }

  function getFileIcon(name, val) {
    if (typeof val === 'object') return '📁';
    const ext = name.split('.').pop().toLowerCase();
    const icons = { txt: '📄', html: '🌐', htm: '🌐', css: '🎨', js: '⚡', json: '📋', md: '📝', py: '🐍', jpg: '🖼️', png: '🖼️', gif: '🖼️', mp3: '🎵', wav: '🎵', pdf: '📕' };
    return icons[ext] || '📄';
  }

  function updateDesktopIcons() {
    const desktopEl = document.getElementById('desktop-icons');
    if (!desktopEl) return;
    document.querySelectorAll('.user-desktop-item').forEach(el => el.remove());
    const desktopNode = getNode('/home/user/Desktop');
    if (desktopNode && typeof desktopNode === 'object') {
      Object.entries(desktopNode).forEach(([name, val]) => {
        const isDir = typeof val === 'object';
        const el = document.createElement('div');
        el.className = 'desktop-icon user-desktop-item';
        el.dataset.name = name;
        el.dataset.isdir = isDir;
        el.innerHTML = `<div class="explorer-item-icon" style="font-size:32px;margin-bottom:4px">${getFileIcon(name, val)}</div><span style="word-break:break-word;text-align:center">${name}</span>`;
        el.setAttribute('draggable', 'true');
        el.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData('text/plain', JSON.stringify({ name: name, isDir: isDir, fromPath: '/home/user/Desktop' }));
          e.dataTransfer.effectAllowed = 'move';
          el.style.opacity = '0.5';
        });
        el.addEventListener('dragend', () => { el.style.opacity = '1'; });
        // custom drag & drop for desktop positioning
        el.addEventListener('mousedown', (e) => {
          playSound('click');
          document.querySelectorAll('.desktop-icon').forEach(i => i.classList.remove('selected'));
          el.classList.add('selected');
          draggedIcon = el;
          const rect = el.getBoundingClientRect();
          if (el.style.position !== 'absolute') {
            el.style.position = 'absolute';
            document.getElementById('desktop').appendChild(el);
            el.style.left = rect.left + 'px'; el.style.top = rect.top + 'px';
          }
          dragOffX = e.clientX - rect.left; dragOffY = e.clientY - rect.top;
          el.style.zIndex = 1000; e.stopPropagation();
        });
        el.addEventListener('dblclick', () => {
          const path = '/home/user/Desktop/' + name;
          if (isDir) { openFileExplorer(path); }
          else { const content = getNode(path); if (typeof content === 'string') openNotepadWith(name, path, content); }
        });
        el.addEventListener('contextmenu', (e) => {
          e.preventDefault(); e.stopPropagation();
          document.querySelectorAll('.desktop-icon').forEach(i => i.classList.remove('selected'));
          el.classList.add('selected');
          showExplorerCtx(e.clientX, e.clientY, name, isDir, '/home/user/Desktop', updateDesktopIcons);
        });
        desktopEl.appendChild(el);
      });
    }
  }

  let currentDir = '/home/user';

  function isDirectory(node) {
    return !!node && typeof node === 'object' && !Array.isArray(node);
  }

  function cloneNode(node) {
    return JSON.parse(JSON.stringify(node));
  }

  function normalizePath(pathStr) {
    const rawPath = typeof pathStr === 'string' && pathStr.trim() ? pathStr.trim() : '/';
    const parts = rawPath.split('/');
    const resolved = [];

    parts.forEach((part) => {
      if (!part || part === '.') return;
      if (part === '..') resolved.pop();
      else resolved.push(part);
    });

    return '/' + resolved.join('/');
  }

  function joinPath(basePath, name) {
    const normalizedBase = normalizePath(basePath);
    return normalizePath((normalizedBase === '/' ? '' : normalizedBase) + '/' + name);
  }

  function getBaseName(pathStr) {
    const normalized = normalizePath(pathStr);
    if (normalized === '/') return '/';
    return normalized.split('/').filter(Boolean).pop();
  }

  function isValidNodeName(name) {
    return typeof name === 'string'
      && name.trim() !== ''
      && name !== '.'
      && name !== '..'
      && !/[\\/]/.test(name);
  }

  function getNode(pathStr) {
    const normalized = normalizePath(pathStr);
    if (normalized === '/') return fileSystem;

    let node = fileSystem;
    for (const part of normalized.slice(1).split('/')) {
      if (isDirectory(node) && Object.prototype.hasOwnProperty.call(node, part)) {
        node = node[part];
      } else {
        return undefined;
      }
    }

    return node;
  }

  function getParentAndName(pathStr) {
    const normalized = normalizePath(pathStr);
    if (normalized === '/') return { parent: null, name: '', parentPath: null };

    const parts = normalized.split('/').filter(Boolean);
    const name = parts.pop();
    const parentPath = parts.length ? '/' + parts.join('/') : '/';
    return { parent: getNode(parentPath), name, parentPath };
  }

  function setNode(pathStr, value, options = {}) {
    const { overwrite = true } = options;
    const { parent, name } = getParentAndName(pathStr);

    if (!isDirectory(parent) || !isValidNodeName(name)) return false;
    if (!overwrite && Object.prototype.hasOwnProperty.call(parent, name)) return false;

    parent[name] = value;
    saveFS();
    return true;
  }

  function deleteNode(pathStr, skipSave = false) {
    const normalized = normalizePath(pathStr);
    if (normalized === '/') return false;

    const { parent, name } = getParentAndName(normalized);
    if (!isDirectory(parent) || !Object.prototype.hasOwnProperty.call(parent, name)) return false;

    delete parent[name];
    if (!skipSave) saveFS();
    return true;
  }

  function getUniqueChildName(dirPath, preferredName) {
    const dir = getNode(dirPath);
    if (!isDirectory(dir) || !preferredName) return preferredName;
    if (!Object.prototype.hasOwnProperty.call(dir, preferredName)) return preferredName;

    const dotIndex = preferredName.lastIndexOf('.');
    const hasExtension = dotIndex > 0;
    const base = hasExtension ? preferredName.slice(0, dotIndex) : preferredName;
    const ext = hasExtension ? preferredName.slice(dotIndex) : '';
    let counter = 1;
    let nextName = preferredName;

    while (Object.prototype.hasOwnProperty.call(dir, nextName)) {
      nextName = `${base} (${counter})${ext}`;
      counter += 1;
    }

    return nextName;
  }

  function copyNode(srcPath, destPath) {
    const normalizedSrc = normalizePath(srcPath);
    const normalizedDest = normalizePath(destPath);
    const srcNode = getNode(normalizedSrc);
    const { parent, name } = getParentAndName(normalizedDest);

    if (srcNode === undefined || !isDirectory(parent) || !isValidNodeName(name)) return false;
    if (Object.prototype.hasOwnProperty.call(parent, name)) return false;
    if (isDirectory(srcNode) && normalizedDest.startsWith(normalizedSrc + '/')) return false;

    parent[name] = cloneNode(srcNode);
    saveFS();
    return true;
  }

  function moveNode(oldPath, newPath) {
    const normalizedOld = normalizePath(oldPath);
    const normalizedNew = normalizePath(newPath);
    const node = getNode(normalizedOld);
    const { parent: newParent, name: newName } = getParentAndName(normalizedNew);

    if (normalizedOld === '/' || normalizedOld === normalizedNew || node === undefined) return false;
    if (!isDirectory(newParent) || !isValidNodeName(newName)) return false;
    if (Object.prototype.hasOwnProperty.call(newParent, newName)) return false;
    if (isDirectory(node) && normalizedNew.startsWith(normalizedOld + '/')) return false;

    const { parent: oldParent, name: oldName } = getParentAndName(normalizedOld);
    if (!isDirectory(oldParent) || !Object.prototype.hasOwnProperty.call(oldParent, oldName)) return false;

    newParent[newName] = cloneNode(node);
    delete oldParent[oldName];
    saveFS();
    return true;
  }

  function moveNodeIntoDirectory(srcPath, dirPath) {
    return moveNode(srcPath, joinPath(dirPath, getBaseName(srcPath)));
  }

  function trashNode(pathStr) {
    const normalized = normalizePath(pathStr);
    if (normalized === '/') return false;

    const node = getNode(normalized);
    if (node === undefined) return false;

    const { name, parentPath } = getParentAndName(normalized);
    trashBin.push({ name, content: cloneNode(node), from: parentPath });
    saveTrash();
    deleteNode(normalized);
    return true;
  }

  function restoreTrashEntry(entry) {
    if (!entry) return false;

    const preferredDir = isDirectory(getNode(entry.from)) ? normalizePath(entry.from) : '/home/user';
    const restoreName = getUniqueChildName(preferredDir, entry.name);
    return setNode(joinPath(preferredDir, restoreName), cloneNode(entry.content), { overwrite: false });
  }

  function getNearestExistingDirectory(pathStr) {
    let currentPath = normalizePath(pathStr || '/home/user');
    while (currentPath !== '/' && !isDirectory(getNode(currentPath))) {
      currentPath = getParentAndName(currentPath).parentPath || '/';
    }
    if (isDirectory(getNode(currentPath))) return currentPath;
    return '/home/user';
  }
  const cmdHistory = [];
  let cmdHistoryIdx = -1;

  let soundEnabled = true;
  let audioCtx = null;
  function playSound(type) {
    if (!soundEnabled) return;
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    const now = audioCtx.currentTime;
    if (type === 'click') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(800, now + 0.05);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.05);
      osc.start(now);
      osc.stop(now + 0.05);
    } else if (type === 'alert') {
      osc.type = 'square';
      osc.frequency.setValueAtTime(400, now);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
      osc.start(now);
      osc.stop(now + 0.2);
    } else if (type === 'boot') {
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.setValueAtTime(440, now + 0.2);
      osc.frequency.setValueAtTime(660, now + 0.4);
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.2, now + 0.1);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.6);
      osc.start(now);
      osc.stop(now + 0.6);
    } else if (type === 'recycle') {
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(300, now);
      osc.frequency.exponentialRampToValueAtTime(100, now + 0.2);
      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
      osc.start(now);
      osc.stop(now + 0.2);
    } else if (type === 'restore') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(400, now);
      osc.frequency.exponentialRampToValueAtTime(800, now + 0.2);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
      osc.start(now);
      osc.stop(now + 0.2);
    }
  }

  // Boot sequence
  setTimeout(() => {
    document.getElementById('boot-screen').style.display = 'none';
    document.getElementById('login-screen').style.display = 'flex';
  }, 3000);

  document.getElementById('login-user-btn').addEventListener('click', () => {
    document.getElementById('login-screen').style.display = 'none';
    document.getElementById('desktop').style.display = 'block';
    playSound('boot');
    updateDesktopIcons();
    updateClock();
    setInterval(updateClock, 1000);
  });

  function updateClock() {
    const now = new Date();
    let h = now.getHours(), m = now.getMinutes();
    const ampm = h >= 12 ? 'PM' : 'AM';
    h = h % 12 || 12;
    document.getElementById('clock').textContent = `${h}:${m.toString().padStart(2, '0')} ${ampm}`;
  }

  // Start menu
  document.getElementById('start-button').addEventListener('click', (e) => {
    e.stopPropagation();
    const sm = document.getElementById('start-menu');
    sm.style.display = sm.style.display === 'none' ? 'block' : 'none';
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#start-menu') && !e.target.closest('#start-button')) {
      document.getElementById('start-menu').style.display = 'none';
    }
    document.getElementById('context-menu').style.display = 'none';
  });

  // Context menu
  document.getElementById('desktop').addEventListener('contextmenu', (e) => {
    if (e.target.closest('.window') || e.target.closest('#taskbar')) return;
    e.preventDefault();
    const cm = document.getElementById('context-menu');
    cm.style.display = 'block';
    cm.style.left = e.clientX + 'px';
    cm.style.top = e.clientY + 'px';
  });

  document.getElementById('ctx-refresh').addEventListener('click', () => location.reload());

  // Desktop "New" menu items - create in /home/user/Desktop
  document.querySelectorAll('.ctx-new-item').forEach(item => {
    item.addEventListener('click', () => {
      document.getElementById('context-menu').style.display = 'none';
      createNewItem('/home/user/Desktop', item.dataset.type);
      playSound('click');
    });
  });
  document.getElementById('ctx-open-home').addEventListener('click', () => {
    document.getElementById('context-menu').style.display = 'none';
    openFileExplorer('/home/user');
  });
  document.getElementById('ctx-open-terminal').addEventListener('click', () => {
    document.getElementById('context-menu').style.display = 'none';
    openTerminal();
  });
  document.getElementById('ctx-properties').addEventListener('click', () => {
    document.getElementById('context-menu').style.display = 'none';
    openSettings();
  });

  // Desktop icon click and drag logic
  let draggedIcon = null;
  let dragOffX = 0, dragOffY = 0;

  document.querySelectorAll('.desktop-icon').forEach(icon => {
    icon.addEventListener('dblclick', () => { playSound('click'); openApp(icon.dataset.app); });
    icon.addEventListener('mousedown', (e) => {
      playSound('click');
      document.querySelectorAll('.desktop-icon').forEach(i => i.classList.remove('selected'));
      icon.classList.add('selected');

      // Start drag
      draggedIcon = icon;
      const rect = icon.getBoundingClientRect();
      if (icon.style.position !== 'absolute') {
        icon.style.position = 'absolute';
        document.getElementById('desktop').appendChild(icon); // move to desktop to break out of flex container
        icon.style.left = rect.left + 'px';
        icon.style.top = rect.top + 'px';
      }
      dragOffX = e.clientX - rect.left;
      dragOffY = e.clientY - rect.top;
      icon.style.zIndex = 1000;
      e.stopPropagation();
    });
  });

  document.addEventListener('mousemove', (e) => {
    if (draggedIcon) {
      draggedIcon.style.left = (e.clientX - dragOffX) + 'px';
      draggedIcon.style.top = (e.clientY - dragOffY) + 'px';
    }
  });

  document.addEventListener('mouseup', (e) => {
    if (draggedIcon) {
      const dropTarget = e.target.closest('#icon-recyclebin');
      if (dropTarget && draggedIcon.classList.contains('user-desktop-item')) {
        const name = draggedIcon.dataset.name;
        const srcFull = joinPath('/home/user/Desktop', name);
        if (trashNode(srcFull)) {
          playSound('recycle');
          draggedIcon = null;
          updateDesktopIcons();
          return;
        }
      }
      draggedIcon.style.zIndex = '1';
      draggedIcon = null;
    }
  });

  document.getElementById('desktop').addEventListener('click', (e) => {
    if (!e.target.closest('.desktop-icon')) {
      document.querySelectorAll('.desktop-icon').forEach(i => i.classList.remove('selected'));
    }
  });

  const recycleBin = document.getElementById('icon-recyclebin');
  recycleBin.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; recycleBin.classList.add('drag-over'); });
  recycleBin.addEventListener('dragleave', () => { recycleBin.classList.remove('drag-over'); });
  recycleBin.addEventListener('drop', (e) => {
    e.preventDefault(); recycleBin.classList.remove('drag-over');
    try {
      const data = JSON.parse(e.dataTransfer.getData('text/plain'));
      const srcFull = joinPath(data.fromPath, data.name);
      if (trashNode(srcFull)) {
        playSound('recycle');
        updateDesktopIcons();
      }
    } catch (err) { }
  });

  // Start menu items
  document.querySelectorAll('.start-menu-item[data-app], .start-menu-item-right[data-app]').forEach(item => {
    item.addEventListener('click', () => {
      playSound('click');
      openApp(item.dataset.app);
      document.getElementById('start-menu').style.display = 'none';
    });
  });

  document.getElementById('btn-shutdown').addEventListener('click', () => {
    document.getElementById('desktop').style.display = 'none';
    document.getElementById('start-menu').style.display = 'none';
    document.getElementById('shutdown-screen').style.display = 'flex';
  });

  document.getElementById('btn-logoff').addEventListener('click', () => {
    document.getElementById('desktop').style.display = 'none';
    document.getElementById('start-menu').style.display = 'none';
    document.getElementById('login-screen').style.display = 'flex';
    Object.keys(openWindows).forEach(id => removeWindow(id));
  });

  // ======= Window Management =======
  function createWindow(opts) {
    const id = 'win-' + (++windowId);
    const w = document.createElement('div');
    w.className = 'window active';
    w.id = id;
    w.style.width = (opts.width || 640) + 'px';
    w.style.height = (opts.height || 480) + 'px';
    w.style.left = (60 + (windowId % 8) * 26) + 'px';
    w.style.top = (40 + (windowId % 8) * 26) + 'px';

    let html = `<div class="window-titlebar" data-winid="${id}">
      <div class="window-title-text">${opts.title || 'Window'}</div>
      <div class="window-controls">
        <button class="window-btn minimize" data-winid="${id}" title="Minimize">_</button>
        <button class="window-btn maximize" data-winid="${id}" title="Maximize">□</button>
        <button class="window-btn close" data-winid="${id}" title="Close">✕</button>
      </div>
    </div>`;
    if (opts.menubar) html += opts.menubar;
    if (opts.toolbar) html += opts.toolbar;
    if (opts.addressbar) html += opts.addressbar;
    html += `<div class="window-body" id="${id}-body">${opts.body || ''}</div>`;
    if (opts.statusbar !== false) html += `<div class="window-statusbar"><span class="status-section">${opts.status || 'Ready'}</span></div>`;
    html += `<div class="window-resize" data-winid="${id}"></div>`;
    w.innerHTML = html;

    document.getElementById('windows-container').appendChild(w);
    setActiveWindow(id);

    // Taskbar entry
    const tb = document.createElement('div');
    tb.className = 'taskbar-app active';
    tb.id = 'tb-' + id;
    tb.dataset.winid = id;
    tb.innerHTML = `<span class="taskbar-app-icon">${opts.tbIcon || '📄'}</span><span>${opts.title || 'Window'}</span>`;
    tb.addEventListener('click', () => toggleWindow(id));
    document.getElementById('taskbar-apps').appendChild(tb);

    openWindows[id] = { title: opts.title, maximized: false, prevStyle: null, cleanupFns: [] };

    // Events
    w.querySelector('.window-btn.close').addEventListener('click', () => closeWindow(id));
    w.querySelector('.window-btn.minimize').addEventListener('click', () => minimizeWindow(id));
    w.querySelector('.window-btn.maximize').addEventListener('click', () => maximizeWindow(id));
    w.addEventListener('mousedown', () => setActiveWindow(id));

    if (opts.onReady) opts.onReady(id, w);
    return id;
  }

  function setActiveWindow(id) {
    document.querySelectorAll('.window').forEach(w => w.classList.remove('active'));
    document.querySelectorAll('.taskbar-app').forEach(t => t.classList.remove('active'));
    const w = document.getElementById(id);
    if (w) { w.classList.add('active'); w.style.zIndex = ++windowId + 100; }
    const tb = document.getElementById('tb-' + id);
    if (tb) tb.classList.add('active');
    activeWindowId = id;
  }

  function closeWindow(id) {
    const w = document.getElementById(id);
    if (!w) return;
    w.classList.add('closing');
    setTimeout(() => removeWindow(id), 150);
  }

  function removeWindow(id) {
    const info = openWindows[id];
    if (info?.cleanupFns) {
      info.cleanupFns.forEach((cleanup) => {
        try { cleanup(); } catch (e) { }
      });
    }
    const w = document.getElementById(id);
    if (w) w.remove();
    const tb = document.getElementById('tb-' + id);
    if (tb) tb.remove();
    delete openWindows[id];
  }

  function registerWindowCleanup(id, cleanupFn) {
    if (!cleanupFn || !openWindows[id]) return;
    openWindows[id].cleanupFns.push(cleanupFn);
  }

  function minimizeWindow(id) {
    const w = document.getElementById(id);
    if (w) w.classList.add('minimized');
    const tb = document.getElementById('tb-' + id);
    if (tb) tb.classList.remove('active');
  }

  function maximizeWindow(id) {
    const w = document.getElementById(id);
    if (!w) return;
    const info = openWindows[id];
    if (info.maximized) {
      w.style.cssText = info.prevStyle;
      info.maximized = false;
    } else {
      info.prevStyle = w.style.cssText;
      w.style.left = '0'; w.style.top = '0';
      w.style.width = '100%'; w.style.height = 'calc(100vh - 36px)';
      info.maximized = true;
    }
    setActiveWindow(id);
  }

  function toggleWindow(id) {
    const w = document.getElementById(id);
    if (!w) return;
    if (w.classList.contains('minimized')) {
      w.classList.remove('minimized');
      setActiveWindow(id);
    } else if (activeWindowId === id) {
      minimizeWindow(id);
    } else {
      setActiveWindow(id);
    }
  }

  // Drag & Resize
  document.addEventListener('mousedown', (e) => {
    const titlebar = e.target.closest('.window-titlebar');
    if (titlebar && !e.target.closest('.window-btn')) {
      const wid = titlebar.dataset.winid;
      const w = document.getElementById(wid);
      if (!w || openWindows[wid]?.maximized) return;
      dragState = { wid, startX: e.clientX, startY: e.clientY, origL: parseInt(w.style.left), origT: parseInt(w.style.top) };
      setActiveWindow(wid);
      e.preventDefault();
    }
    const resizeHandle = e.target.closest('.window-resize');
    if (resizeHandle) {
      const wid = resizeHandle.dataset.winid;
      const w = document.getElementById(wid);
      if (!w) return;
      resizeState = { wid, startX: e.clientX, startY: e.clientY, origW: w.offsetWidth, origH: w.offsetHeight };
      e.preventDefault();
    }
  });

  document.addEventListener('mousemove', (e) => {
    if (dragState) {
      const w = document.getElementById(dragState.wid);
      if (w) {
        w.style.left = (dragState.origL + e.clientX - dragState.startX) + 'px';
        w.style.top = (dragState.origT + e.clientY - dragState.startY) + 'px';
      }
    }
    if (resizeState) {
      const w = document.getElementById(resizeState.wid);
      if (w) {
        w.style.width = Math.max(300, resizeState.origW + e.clientX - resizeState.startX) + 'px';
        w.style.height = Math.max(200, resizeState.origH + e.clientY - resizeState.startY) + 'px';
      }
    }
  });

  document.addEventListener('mouseup', () => { dragState = null; resizeState = null; });

  // ======= App Launchers =======
  function openApp(name) {
    const launchers = {
      terminal: openTerminal, notepad: openNotepad, calculator: openCalculator,
      paint: openPaint, mycomputer: openMyComputer, mydocuments: openMyDocuments, files: openMyDocuments,
      internet: openInternet, recyclebin: openRecycleBin, mediaplayer: openMediaPlayer,
      minesweeper: openMinesweeper, settings: openSettings, ide: openIDE, agent: openAIAgent,
      snake: openSnake, tetris: openTetris, game2048: open2048, tictactoe: openTicTacToe
    };
    if (launchers[name]) launchers[name]();
  }

  // ======= TERMINAL =======
  function openTerminal(initialCommand = '') {
    const id = createWindow({
      title: 'Command Prompt', width: 680, height: 420, tbIcon: '>_', status: '',
      body: '<div class="terminal-body" id="TERBODY"></div>',
      statusbar: false,
      onReady: (winId) => {
        const body = document.getElementById(winId + '-body');
        const tb = body.querySelector('.terminal-body');
        tb.id = winId + '-term';
        initTerminal(winId, tb, initialCommand);
      }
    });
  }

  function initTerminal(winId, container, initialCommand = '') {
    const state = { history: [], histIdx: -1, cwd: '/home/user' };
    addTermLine(container, 'RetroLinux bash [Kernel 2.4.31]');
    addTermLine(container, 'Type "help" to see popular shell commands.\n');
    addPromptLine(container, state);

    if (initialCommand) {
      const inp = container.querySelector('.terminal-input:last-of-type');
      if (inp) {
        inp.value = initialCommand;
        inp.disabled = true;
        state.history.push(initialCommand);
        state.histIdx = state.history.length;
        processCommand(container, state, initialCommand);
      }
    }

    container.addEventListener('click', () => {
      const inp = container.querySelector('.terminal-input:last-of-type');
      if (inp) inp.focus();
    });
  }

  function addTermLine(container, text) {
    const pre = document.createElement('pre');
    pre.textContent = text;
    container.appendChild(pre);
  }

  function addPromptLine(container, state) {
    const line = document.createElement('div');
    line.className = 'terminal-input-line';
    const promptText = state.agentMode ? 'agent> ' : `user@linux:${state.cwd}$ `;
    line.innerHTML = `<span class="terminal-prompt">${escapeHtml(promptText)}</span>&nbsp;<input class="terminal-input" type="text" spellcheck="false" autocomplete="off">`;
    container.appendChild(line);
    const inp = line.querySelector('.terminal-input');
    inp.focus();
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const cmd = inp.value;
        inp.disabled = true;
        state.history.push(cmd);
        state.histIdx = state.history.length;
        processCommand(container, state, cmd);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (state.histIdx > 0) { state.histIdx--; inp.value = state.history[state.histIdx]; }
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (state.histIdx < state.history.length - 1) { state.histIdx++; inp.value = state.history[state.histIdx]; }
        else { state.histIdx = state.history.length; inp.value = ''; }
      } else if (e.key === 'Tab') {
        e.preventDefault();
      }
    });
    container.scrollTop = container.scrollHeight;
  }

  function resolvePath(cwd, pathStr) {
    if (!pathStr) return normalizePath(cwd);
    if (pathStr === '~') return '/home/user';
    if (pathStr.startsWith('~/')) return normalizePath('/home/user/' + pathStr.slice(2));
    if (pathStr.startsWith('/')) return normalizePath(pathStr);
    return normalizePath(normalizePath(cwd) + '/' + pathStr);
  }

  const AGENT_STORAGE = {
    provider: 'retro_agent_provider',
    openaiKey: 'retro_agent_openai_key',
    geminiKey: 'retro_agent_gemini_key',
    claudeKey: 'retro_agent_claude_key',
    openaiModel: 'retro_agent_openai_model',
    geminiModel: 'retro_agent_gemini_model',
    claudeModel: 'retro_agent_claude_model',
    desktopControl: 'retro_agent_control_mode'
  };
  const AGENT_DEFAULT_MODELS = {
    openai: 'gpt-4o-mini',
    gemini: 'gemini-1.5-flash',
    claude: 'claude-haiku-4-5-20251001'
  };
  const AGENT_CONTROL_SCHEMA = {
    type: 'object',
    additionalProperties: false,
    required: ['reply', 'actions'],
    properties: {
      reply: { type: 'string' },
      actions: {
        type: 'array',
        maxItems: 10,
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            type: { type: 'string' },
            app: { type: 'string' },
            path: { type: 'string' },
            url: { type: 'string' },
            command: { type: 'string' },
            content: { type: 'string' },
            source_path: { type: 'string' },
            destination_directory: { type: 'string' },
            title: { type: 'string' },
            target: { type: 'string' },
            label: { type: 'string' },
            text: { type: 'string' },
            key: { type: 'string' },
            action: { type: 'string' },
            amount: { type: 'number' },
            game: { type: 'string' },
            append: { type: 'boolean' },
            x: { type: 'number' },
            y: { type: 'number' },
            start_x: { type: 'number' },
            start_y: { type: 'number' },
            end_x: { type: 'number' },
            end_y: { type: 'number' },
            ms: { type: 'number' }
          },
          required: ['type']
        }
      }
    }
  };

  function getAgentStoredKey(provider) {
    if (provider === 'openai') return localStorage.getItem(AGENT_STORAGE.openaiKey) || '';
    if (provider === 'claude') return localStorage.getItem(AGENT_STORAGE.claudeKey) || '';
    return localStorage.getItem(AGENT_STORAGE.geminiKey) || '';
  }

  function getAgentStoredModel(provider) {
    if (provider === 'openai') return localStorage.getItem(AGENT_STORAGE.openaiModel) || AGENT_DEFAULT_MODELS.openai;
    if (provider === 'claude') return localStorage.getItem(AGENT_STORAGE.claudeModel) || AGENT_DEFAULT_MODELS.claude;
    return localStorage.getItem(AGENT_STORAGE.geminiModel) || AGENT_DEFAULT_MODELS.gemini;
  }

  async function callOpenAI(messages, systemPrompt, expectJson = false, visionContext = null) {
    const apiKey = getAgentStoredKey('openai');
    const model = getAgentStoredModel('openai');
    const openaiMessages = messages.map(m => ({ role: m.role || 'user', content: m.content }));
    if (systemPrompt) {
      const systemRole = (model.includes('o1') || model.includes('o3')) ? 'developer' : 'system';
      openaiMessages.unshift({ role: systemRole, content: systemPrompt });
    }
    if (visionContext) {
      const visionContent = [{ type: 'text', text: visionContext.text }];
      if (visionContext.imageUrl) visionContent.push({ type: 'image_url', image_url: { url: visionContext.imageUrl } });
      openaiMessages.push({ role: 'user', content: visionContent });
    }
    const payload = { model, messages: openaiMessages, ...(expectJson ? { response_format: { type: 'json_object' } } : {}) };
    if (model.includes('o1') || model.includes('o3')) payload.max_completion_tokens = 2000;
    else payload.max_tokens = 2000;
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
      body: JSON.stringify(payload)
    });
    if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error?.message || `HTTP ${response.status}`); }
    const data = await response.json();
    return data.choices?.[0]?.message?.content?.trim() || '';
  }

  async function callGemini(messages, systemPrompt, expectJson = false, visionContext = null) {
    const apiKey = getAgentStoredKey('gemini');
    const model = getAgentStoredModel('gemini');
    const contents = messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: Array.isArray(m.content) ? m.content : [{ text: m.content }] }));
    if (visionContext) {
      const parts = [{ text: visionContext.text }];
      if (visionContext.base64Data) parts.push({ inlineData: { mimeType: visionContext.mimeType || 'image/jpeg', data: visionContext.base64Data } });
      contents.push({ role: 'user', parts });
    }
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({ system_instruction: { parts: [{ text: systemPrompt }] }, contents, generationConfig: { temperature: 0.5, ...(expectJson ? { responseMimeType: 'application/json', responseJsonSchema: AGENT_CONTROL_SCHEMA } : {}) } })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || 'Gemini failed.');
    return ((data.candidates || [])[0]?.content?.parts || []).map(p => p.text || '').join('').trim();
  }

  async function callClaude(messages, systemPrompt, expectJson = false) {
    const apiKey = getAgentStoredKey('claude');
    const model = getAgentStoredModel('claude');
    const merged = [];
    messages.forEach(m => {
      const role = m.role === 'assistant' ? 'assistant' : 'user';
      if (merged.length && merged[merged.length - 1].role === role) merged[merged.length - 1].content += '\n\n' + m.content;
      else merged.push({ role, content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) });
    });
    if (merged.length && merged[0].role !== 'user') merged.unshift({ role: 'user', content: '(start)' });
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify({ model, max_tokens: 2000, system: systemPrompt || '', messages: merged, temperature: expectJson ? 0.3 : 0.7 })
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error?.message || `HTTP ${response.status}`);
    return data.content?.find(b => b.type === 'text')?.text?.trim() || '';
  }

  function callAI(messages, systemPrompt, expectJson = false, visionContext = null) {
    const provider = localStorage.getItem(AGENT_STORAGE.provider) || 'openai';
    if (provider === 'openai') return callOpenAI(messages, systemPrompt, expectJson, visionContext);
    if (provider === 'claude') return callClaude(messages, systemPrompt, expectJson);
    return callGemini(messages, systemPrompt, expectJson, visionContext);
  }

  function parseAgentEnvelope(text) {
    if (!text) return { reply: 'Error: Empty.', actions: [] };
    let clean = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();
    const first = clean.indexOf('{'), last = clean.lastIndexOf('}');
    if (first !== -1 && last > first) {
      try { const p = JSON.parse(clean.slice(first, last + 1)); return { reply: p.reply || p.explanation || p.message || clean.slice(0, first).trim() || '...', actions: Array.isArray(p.actions) ? p.actions : [] }; } catch (e) { }
    }
    return { reply: text, actions: [] };
  }

  async function getControlEnvelope(messages, systemPrompt) {
    const imageUrl = await captureDesktopSnapshot();
    const visionContext = {
      imageUrl,
      mimeType: 'image/jpeg',
      base64Data: imageUrl && imageUrl.includes(',') ? imageUrl.split(',')[1] : '',
      text: [`Screen context for simulator state.`, getAgentUIScreenMap()].join('\n')
    };
    const responseText = await callAI(messages, systemPrompt, true, visionContext);
    return parseAgentEnvelope(responseText);
  }

  async function executeAgentAction(action, logger = console.log) {
    const type = String(action?.type || '').trim();
    if (!type) return 'Invalid action.';
    const log = (m) => { logger(m); return m; };

    if (type === 'open_app') {
      const app = String(action.app || '').toLowerCase();
      if (!app) return 'Missing app.';
      await animateAgentToElement(getActionTarget(app));
      openApp(app);
      return log(`Opened app: ${app}`);
    }
    if (type === 'open_folder') {
      const path = normalizePath(action.path || '/home/user');
      await animateAgentToElement(getActionTarget('files'));
      openFileExplorer(path);
      return log(`Opened folder: ${path}`);
    }
    if (type === 'write_file') {
      const path = normalizePath(action.path || '');
      if (setNode(path, action.content || '')) return log(`Wrote file: ${path}`);
      return log(`Failed to write: ${path}`);
    }
    if (type === 'click_label' || type === 'double_click_label') {
      const label = String(action.label || action.target || '').trim();
      const res = findClickableByLabel(label, action.title || 'active');
      if (!res) return log(`"${label}" not found`);
      if (res.record?.title && res.record.title !== 'Desktop') await focusWindow(res.record.title);
      await animateAgentToElement(res.element);
      res.element.click();
      if (type === 'double_click_label') res.element.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
      return log(`${type.replace('_', ' ')}: ${label}`);
    }
    if (type === 'type_text') {
      const res = resolveTextTarget(action.target, action.title || 'active');
      if (!res) return log(`Target ${action.target} not found`);
      await focusWindow(res.record.title);
      await animateAgentToElement(res.element);
      res.element.focus();
      res.element.value = action.append ? res.element.value + (action.text || '') : (action.text || '');
      res.element.dispatchEvent(new Event('input', { bubbles: true }));
      return log(`Typed into ${action.target}`);
    }
    if (type === 'submit') {
      const res = (action.target === 'terminal') ? resolveTextTarget(action.target, action.title || 'active') : resolveButtonTarget(action.target, action.title || 'active');
      if (!res) return log(`Target ${action.target} not found`);
      await focusWindow(res.record.title);
      await animateAgentToElement(res.element);
      if (action.target === 'terminal') res.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      else res.element.click();
      return log(`Submitted ${action.target}`);
    }
    if (type === 'wait') { await sleep(action.ms || 300); return log(`Waited ${action.ms || 300}ms`); }
    return log(`Action ${type} simulated.`);
  }

  function resolvePath(cwd, pathStr) {
    if (!pathStr) return normalizePath(cwd);
    if (pathStr === '~') return '/home/user';
    if (pathStr.startsWith('~/')) return normalizePath('/home/user/' + pathStr.slice(2));
    if (pathStr.startsWith('/')) return normalizePath(pathStr);
    return normalizePath(normalizePath(cwd) + '/' + pathStr);
  }

  async function processCommand(container, state, cmdLine) {
    const trimmed = cmdLine.trim();
    if (!trimmed) { addPromptLine(container, state); return; }

    // Interactive Agent Mode
    if (state.agentMode) {
      if (trimmed.toLowerCase() === 'exit' || trimmed.toLowerCase() === 'quit') {
        state.agentMode = false;
        state.agentHistory = [];
        addTermLine(container, 'Exited AI Agent mode.');
        addPromptLine(container, state);
        return;
      }
      await runAgentCLI(container, state, trimmed);
      addPromptLine(container, state);
      return;
    }
    // Track command history
    if (!container._cmdHistory) container._cmdHistory = [];
    container._cmdHistory.push(trimmed);
    if (container._cmdHistory.length > 100) container._cmdHistory.shift();
    // Handle simple output redirection: cmd > file and cmd >> file
    const redirectMatch = trimmed.match(/^(.+?)\s*(>>?)\s*([^\s]+)$/);

    if (redirectMatch && !trimmed.startsWith('echo') === false) {
      const beforeRedir = redirectMatch[1].trim();
      const op = redirectMatch[2];
      const destFile = redirectMatch[3];
      // Only handle echo redirection for now
      if (beforeRedir.startsWith('echo ') || beforeRedir.startsWith('echo\t')) {
        const content = beforeRedir.slice(5).replace(/^["']|["']$/g, '');
        const destPath = resolvePath(state.cwd, destFile);
        const existing = getNode(destPath);
        const newContent = op === '>>' && typeof existing === 'string' ? existing + '\n' + content : content;
        setNode(destPath, newContent);
        addTermLine(container, '');
        addPromptLine(container, state);
        return;
      }
    }
    const parts = trimmed.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1).map(a => a.replace(/"/g, ''));
    let output = '';

    switch (cmd) {
      case 'clear':
        container.innerHTML = '';
        addPromptLine(container, state);
        return;
      case 'ls': {
        const target = args[0] ? resolvePath(state.cwd, args[0]) : state.cwd;
        const node = getNode(target);
        if (node === undefined) {
          output = `ls: cannot access '${args[0]}': No such file or directory`;
          break;
        }
        if (!isDirectory(node)) {
          output = getBaseName(target);
          break;
        }
        const entries = Object.entries(node)
          .sort((a, b) => {
            const aRank = isDirectory(a[1]) ? 0 : 1;
            const bRank = isDirectory(b[1]) ? 0 : 1;
            return aRank - bRank || a[0].localeCompare(b[0]);
          })
          .map(([name, val]) => isDirectory(val) ? `${name}/` : name);
        output = entries.join('   ') || '(empty)';
        break;
      }
      case 'tree': {
        const target = args[0] ? resolvePath(state.cwd, args[0]) : state.cwd;
        const node = getNode(target);
        if (node === undefined) {
          output = `tree: cannot access '${args[0]}': No such file or directory`;
          break;
        }
        if (!isDirectory(node)) {
          output = getBaseName(target);
          break;
        }
        const rootLabel = target === '/' ? '/' : `${getBaseName(target)}/`;
        output = `${rootLabel}\n${buildTree(node, '')}`.trimEnd();
        break;
      }
      case 'cd': {
        if (!args[0]) { state.cwd = '/home/user'; break; }
        const newPath = resolvePath(state.cwd, args[0]);
        const node = getNode(newPath);
        if (isDirectory(node)) { state.cwd = newPath; }
        else { output = `bash: cd: ${args[0]}: No such file or directory`; }
        break;
      }
      case 'pwd':
        output = state.cwd;
        break;
      case 'echo':
        output = args.join(' ');
        break;
      case 'cat': {
        if (!args[0]) { output = 'cat: missing file operand'; break; }
        const fp = resolvePath(state.cwd, args[0]);
        const node = getNode(fp);
        if (node === undefined) output = `cat: ${args[0]}: No such file or directory`;
        else if (isDirectory(node)) output = `cat: ${args[0]}: Is a directory`;
        else output = node;
        break;
      }
      case 'mkdir': {
        if (!args[0]) { output = 'mkdir: missing operand'; break; }
        const dirPath = resolvePath(state.cwd, args[0]);
        const { parent, name } = getParentAndName(dirPath);
        if (!isValidNodeName(name)) output = `mkdir: cannot create directory '${args[0]}': Invalid name`;
        else if (!isDirectory(parent)) output = `mkdir: cannot create directory '${args[0]}': No such file or directory`;
        else if (getNode(dirPath) !== undefined) output = `mkdir: cannot create directory '${args[0]}': File exists`;
        else setNode(dirPath, {}, { overwrite: false });
        break;
      }
      case 'rm': {
        const recursive = args.includes('-r') || args.includes('-rf') || args.includes('-fr');
        const targetArg = args.find(arg => !arg.startsWith('-'));
        if (!targetArg) { output = 'rm: missing operand'; break; }
        const targetPath = resolvePath(state.cwd, targetArg);
        const node = getNode(targetPath);
        if (node === undefined) output = `rm: cannot remove '${targetArg}': No such file or directory`;
        else if (isDirectory(node) && !recursive) output = `rm: cannot remove '${targetArg}': Is a directory`;
        else if (!deleteNode(targetPath)) output = `rm: cannot remove '${targetArg}'`;
        break;
      }
      case 'touch': {
        if (!args[0]) { output = 'touch: missing file operand'; break; }
        const tp = resolvePath(state.cwd, args[0]);
        const existing = getNode(tp);
        const { parent, name } = getParentAndName(tp);
        if (!isValidNodeName(name)) output = `touch: cannot touch '${args[0]}': Invalid name`;
        else if (!isDirectory(parent)) output = `touch: cannot touch '${args[0]}': No such file or directory`;
        else if (isDirectory(existing)) output = `touch: cannot touch '${args[0]}': Is a directory`;
        else if (existing === undefined) setNode(tp, '', { overwrite: false });
        break;
      }
      case 'cp': {
        const recursive = args.includes('-r') || args.includes('-rf') || args.includes('-fr');
        const positional = args.filter(arg => !arg.startsWith('-'));
        if (positional.length < 2) { output = 'cp: missing operand'; break; }
        const src = resolvePath(state.cwd, positional[0]);
        const srcNode = getNode(src);
        if (srcNode === undefined) {
          output = `cp: cannot stat '${positional[0]}': No such file or directory`;
          break;
        }
        if (isDirectory(srcNode) && !recursive) {
          output = `cp: -r not specified; omitting directory '${positional[0]}'`;
          break;
        }
        let dest = resolvePath(state.cwd, positional[1]);
        if (isDirectory(getNode(dest))) dest = joinPath(dest, getBaseName(src));
        if (getNode(dest) !== undefined) {
          output = `cp: cannot create '${positional[1]}': File exists`;
          break;
        }
        if (!copyNode(src, dest)) output = `cp: cannot copy '${positional[0]}'`;
        break;
      }
      case 'mv': {
        if (args.length < 2) { output = 'mv: missing operand'; break; }
        const mvSrc = resolvePath(state.cwd, args[0]);
        const mvNode = getNode(mvSrc);
        if (mvNode === undefined) {
          output = `mv: cannot stat '${args[0]}': No such file or directory`;
          break;
        }
        let mvDest = resolvePath(state.cwd, args[1]);
        if (isDirectory(getNode(mvDest))) mvDest = joinPath(mvDest, getBaseName(mvSrc));
        if (mvDest === mvSrc) break;
        if (getNode(mvDest) !== undefined) {
          output = `mv: cannot move to '${args[1]}': File exists`;
          break;
        }
        if (!moveNode(mvSrc, mvDest)) output = `mv: cannot move '${args[0]}'`;
        break;
      }
      case 'date':
        output = new Date().toString();
        break;
      case 'uptime':
        output = ' 12:34:56 up 2 days, 4:20,  1 user,  load average: 0.12, 0.05, 0.02';
        break;
      case 'uname':
        output = 'Linux RetroLinux 2.4.31 i686 GNU/Linux';
        break;
      case 'ifconfig':
        output = `eth0      Link encap:Ethernet  HWaddr 00:1A:2B:3C:4D:5E  
          inet addr:192.168.1.${Math.floor(Math.random() * 254) + 1}  Bcast:192.168.1.255  Mask:255.255.255.0
          UP BROADCAST RUNNING MULTICAST  MTU:1500  Metric:1
          RX packets:3101 errors:0 dropped:0 overruns:0 frame:0
          TX packets:2840 errors:0 dropped:0 overruns:0 carrier:0`;
        break;
      case 'ping': {
        const host = args[0] || 'localhost';
        const ip = host === 'localhost' ? '127.0.0.1' : `${Math.floor(Math.random() * 223) + 1}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`;
        output = `Pinging ${host} [${ip}] with 32 bytes of data:\n`;
        for (let i = 0; i < 4; i++) {
          const ms = Math.floor(Math.random() * 50) + 1;
          output += `Reply from ${ip}: bytes=32 time=${ms}ms TTL=128\n`;
        }
        output += `\nPing statistics for ${ip}:\n    Packets: Sent = 4, Received = 4, Lost = 0 (0% loss)`;
        break;
      }
      case 'ps':
        output = `  PID TTY          TIME CMD
    1 ?        00:00:02 init
  234 ?        00:00:00 syslogd
 1045 tty1     00:00:00 login
 1056 tty1     00:00:00 bash
 2048 tty1     00:00:00 ps`;
        break;
      case 'calc':
        openCalculator();
        output = '';
        break;
      case 'agent': {
        const prompt = args.join(' ').trim();
        if (!prompt || prompt.toLowerCase() === 'cli') {
          state.agentMode = true;
          state.agentHistory = [];
          addTermLine(container, 'Entering AI Agent CLI mode. Type "exit" or "quit" to leave.');
          addPromptLine(container, state);
          return;
        }
        await runAgentCLI(container, state, prompt);
        break;
      }

      case 'snake':
        openSnake();
        output = 'Opening Snake...';
        break;
      case 'tetris':
        openTetris();
        output = 'Opening Tetris...';
        break;
      case '2048':
        open2048();
        output = 'Opening 2048...';
        break;
      case 'games':
        output = `Available games:\n  snake     - Classic snake game\n  tetris    - Tetris\n  2048      - Merge tiles to reach 2048\n  minesweeper - Classic minesweeper (or: mine)`;
        break;
      case 'mine':
      case 'minesweeper':
        openMinesweeper();
        output = 'Opening Minesweeper...';
        break;
      case 'nano':
      case 'vi':
      case 'vim': {
        if (!args[0]) { openNotepad(); output = ''; break; }
        const notePath = resolvePath(state.cwd, args[0]);
        const noteNode = getNode(notePath);
        if (isDirectory(noteNode)) { output = `${cmd}: ${args[0]}: Is a directory`; break; }
        openNotepadWith(getBaseName(notePath), notePath, typeof noteNode === 'string' ? noteNode : '');
        output = '';
        break;
      }
      case 'grep': {
        const flags = args.filter(a => a.startsWith('-'));
        const positional = args.filter(a => !a.startsWith('-'));
        const pattern = positional[0];
        const fileArg = positional[1];
        if (!pattern) { output = 'grep: missing pattern'; break; }
        if (!fileArg) { output = 'grep: missing file operand (piping not yet supported)'; break; }
        const fp = resolvePath(state.cwd, fileArg);
        const node = getNode(fp);
        if (node === undefined) { output = `grep: ${fileArg}: No such file or directory`; break; }
        if (isDirectory(node)) { output = `grep: ${fileArg}: Is a directory`; break; }
        const ignoreCase = flags.includes('-i');
        const lineNum = flags.includes('-n');
        const invertMatch = flags.includes('-v');
        const lines = node.split('\n');
        const regex = new RegExp(pattern, ignoreCase ? 'i' : '');
        const results = [];
        lines.forEach((line, i) => {
          const matches = regex.test(line);
          if (matches !== invertMatch) results.push(lineNum ? `${i + 1}:${line}` : line);
        });
        output = results.length ? results.join('\n') : `(no matches for '${pattern}')`;
        break;
      }
      case 'find': {
        const searchPath = args.find(a => !a.startsWith('-') && !args[args.indexOf(a) - 1]?.startsWith('-')) || state.cwd;
        const nameIdx = args.indexOf('-name');
        const namePattern = nameIdx !== -1 ? args[nameIdx + 1] : null;
        const typeIdx = args.indexOf('-type');
        const typeFilter = typeIdx !== -1 ? args[typeIdx + 1] : null;
        const rootPath = resolvePath(state.cwd, searchPath.startsWith('-') ? '.' : searchPath);
        const rootNode = getNode(rootPath);
        if (rootNode === undefined) { output = `find: '${searchPath}': No such file or directory`; break; }
        const results = [];
        function findRecursive(node, path) {
          if (isDirectory(node)) {
            Object.entries(node).forEach(([name, child]) => {
              const childPath = `${path}/${name}`;
              const matchName = !namePattern || new RegExp('^' + namePattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$').test(name);
              const matchType = !typeFilter || (typeFilter === 'd' ? isDirectory(child) : !isDirectory(child));
              if (matchName && matchType) results.push(childPath);
              if (isDirectory(child)) findRecursive(child, childPath);
            });
          }
        }
        findRecursive(rootNode, rootPath === '/' ? '' : rootPath);
        output = results.length ? results.join('\n') : '(no results)';
        break;
      }
      case 'head': {
        const nFlag = args.indexOf('-n');
        const n = nFlag !== -1 ? parseInt(args[nFlag + 1]) || 10 : 10;
        const fileArg = args.find(a => !a.startsWith('-') && isNaN(parseInt(a)));
        if (!fileArg) { output = 'head: missing file operand'; break; }
        const node = getNode(resolvePath(state.cwd, fileArg));
        if (node === undefined) { output = `head: ${fileArg}: No such file or directory`; break; }
        if (isDirectory(node)) { output = `head: ${fileArg}: Is a directory`; break; }
        output = node.split('\n').slice(0, n).join('\n');
        break;
      }
      case 'tail': {
        const nFlag = args.indexOf('-n');
        const n = nFlag !== -1 ? parseInt(args[nFlag + 1]) || 10 : 10;
        const fileArg = args.find(a => !a.startsWith('-') && isNaN(parseInt(a)));
        if (!fileArg) { output = 'tail: missing file operand'; break; }
        const node = getNode(resolvePath(state.cwd, fileArg));
        if (node === undefined) { output = `tail: ${fileArg}: No such file or directory`; break; }
        if (isDirectory(node)) { output = `tail: ${fileArg}: Is a directory`; break; }
        output = node.split('\n').slice(-n).join('\n');
        break;
      }
      case 'wc': {
        const fileArg = args.find(a => !a.startsWith('-'));
        if (!fileArg) { output = 'wc: missing file operand'; break; }
        const node = getNode(resolvePath(state.cwd, fileArg));
        if (node === undefined) { output = `wc: ${fileArg}: No such file or directory`; break; }
        if (isDirectory(node)) { output = `wc: ${fileArg}: Is a directory`; break; }
        const lc = node.split('\n').length, wc2 = node.split(/\s+/).filter(Boolean).length, cc = node.length;
        output = `  ${lc}  ${wc2}  ${cc} ${fileArg}`;
        break;
      }
      case 'sort': {
        const fileArg = args.find(a => !a.startsWith('-'));
        if (!fileArg) { output = 'sort: missing file operand'; break; }
        const node = getNode(resolvePath(state.cwd, fileArg));
        if (node === undefined) { output = `sort: ${fileArg}: No such file or directory`; break; }
        const reverse = args.includes('-r');
        const lines2 = node.split('\n').sort();
        output = (reverse ? lines2.reverse() : lines2).join('\n');
        break;
      }
      case 'uniq': {
        const fileArg = args.find(a => !a.startsWith('-'));
        if (!fileArg) { output = 'uniq: missing file operand'; break; }
        const node = getNode(resolvePath(state.cwd, fileArg));
        if (node === undefined) { output = `uniq: ${fileArg}: No such file or directory`; break; }
        const lines3 = node.split('\n');
        output = lines3.filter((l, i) => i === 0 || l !== lines3[i - 1]).join('\n');
        break;
      }
      case 'whoami':
        output = 'user';
        break;
      case 'hostname':
        output = 'retrolinux';
        break;
      case 'id':
        output = 'uid=1000(user) gid=1000(user) groups=1000(user),4(adm),24(cdrom),27(sudo)';
        break;
      case 'df': {
        const used = Math.round(JSON.stringify(fileSystem).length / 1024);
        output = `Filesystem     1K-blocks   Used Available Use% Mounted on\n/dev/sda1        4096000 ${used.toString().padStart(6)}   ${(4096000 - used).toString().padStart(9)} ${Math.round(used / 40960)}% /\ntmpfs             524288      0    524288   0% /dev/shm`;
        break;
      }
      case 'du': {
        const duPath = args.find(a => !a.startsWith('-')) || state.cwd;
        const duNode = getNode(resolvePath(state.cwd, duPath));
        if (duNode === undefined) { output = `du: ${duPath}: No such file or directory`; break; }
        const size = Math.max(4, Math.round(JSON.stringify(duNode).length / 1024));
        output = `${size}\t${duPath}`;
        break;
      }
      case 'top':
        output = `top - ${new Date().toLocaleTimeString()}  up 2 days, 4:20,  1 user,  load average: 0.12, 0.08, 0.05
Tasks: 12 total,   1 running,  11 sleeping,   0 stopped,   0 zombie
%Cpu(s):  3.2 us,  1.1 sy,  0.0 ni, 95.4 id,  0.3 wa
MiB Mem:   2048.0 total,   812.4 free,   840.2 used,   395.4 buff/cache

  PID USER     PR  NI    VIRT    RES  SHR S  %CPU  %MEM   TIME+    COMMAND
    1 root     20   0   18640   2876  2608 S   0.0   0.1   0:02.34  init
  234 syslog   20   0  224936   5824  5120 S   0.0   0.3   0:00.04  rsyslogd
 1045 root     20   0   63548   4736  4224 S   0.0   0.2   0:00.00  login
 1056 user     20   0   22880   5748  4840 S   0.0   0.3   0:00.04  bash
 2048 user     20   0   60156   4096  3584 R   3.2   0.2   0:00.01  top
 4096 root     20   0  147840  12288 10240 S   0.0   0.6   0:00.12  retrolinux`;
        break;
      case 'kill': {
        const pid = args.find(a => !a.startsWith('-'));
        if (!pid) { output = 'kill: usage: kill [-signal] pid'; break; }
        output = `Sent signal to process ${pid}.`;
        break;
      }
      case 'history': {
        const hist = container._cmdHistory || [];
        output = hist.length ? hist.map((h, i) => `${(i + 1).toString().padStart(4)}  ${h}`).join('\n') : '(no history)';
        break;
      }
      case 'env':
      case 'printenv':
        output = `PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin\nHOME=/home/user\nUSER=user\nLOGNAME=user\nSHELL=/bin/bash\nTERM=xterm-256color\nLANG=en_US.UTF-8\nPWD=${state.cwd}`;
        break;
      case 'export':
        output = args[0] ? `export: ${args[0]}: (environment variables are read-only in this simulator)` : 'declare -x HOME="/home/user"\ndeclare -x PATH="/usr/local/bin:/usr/bin:/bin"\ndeclare -x USER="user"';
        break;
      case 'alias':
        output = `alias ll='ls -la'\nalias la='ls -a'\nalias l='ls'\nalias grep='grep --color=auto'`;
        break;
      case 'which': {
        const cmds = { ls: 'usr/bin/ls', cat: '/usr/bin/cat', grep: '/usr/bin/grep', find: '/usr/bin/find', nano: '/usr/bin/nano', vi: '/usr/bin/vi', bash: '/usr/bin/bash', python: '/usr/bin/python3', node: '/usr/bin/node', git: '/usr/bin/git', curl: '/usr/bin/curl' };
        output = args[0] ? (cmds[args[0]] || `which: no ${args[0]} in PATH`) : 'which: missing argument';
        break;
      }
      case 'man': {
        const manPages = {
          ls: 'ls - list directory contents\nUsage: ls [OPTION]... [FILE]...',
          cat: 'cat - concatenate files and print on the standard output\nUsage: cat [FILE]...',
          grep: 'grep - print lines that match patterns\nUsage: grep [OPTION]... PATTERN [FILE]...\n  -i  ignore case\n  -n  print line numbers\n  -v  invert match',
          find: 'find - search for files in a directory hierarchy\nUsage: find [path] [-name pattern] [-type f|d]',
          rm: 'rm - remove files or directories\nUsage: rm [-r] FILE...',
          cp: 'cp - copy files and directories\nUsage: cp [-r] SOURCE DEST',
          mv: 'mv - move (rename) files\nUsage: mv SOURCE DEST',
          mkdir: 'mkdir - make directories\nUsage: mkdir DIRECTORY...',
          head: 'head - output the first part of files\nUsage: head [-n N] FILE',
          tail: 'tail - output the last part of files\nUsage: tail [-n N] FILE',
          wc: 'wc - print newline, word, and byte counts\nUsage: wc [FILE]'
        };
        if (!args[0]) { output = 'man: what manual page do you want?'; break; }
        output = manPages[args[0]] ? `Manual page: ${args[0]}\n\n${manPages[args[0]]}` : `man: no manual entry for ${args[0]}`;
        break;
      }
      case 'chmod':
      case 'chown': {
        if (args.length < 2) { output = `${cmd}: missing operand`; break; }
        const targetPath = resolvePath(state.cwd, args[args.length - 1]);
        if (getNode(targetPath) === undefined) { output = `${cmd}: cannot access '${args[args.length - 1]}': No such file or directory`; break; }
        output = '';
        break;
      }
      case 'ln':
        output = `ln: symbolic links are not supported in this simulator`;
        break;
      case 'python':
      case 'python3':
        output = `Python 3.11.0 (RetroLinux build)\nType "help" for more information.\n>>> (interactive mode not supported — use the Code Studio IDE instead)`;
        break;
      case 'node':
        output = `Node.js v20.0.0 (RetroLinux build)\n> (interactive mode not supported — use the Code Studio IDE instead)`;
        break;
      case 'git': {
        const sub = args[0] || '';
        if (!sub) { output = `usage: git [--version] [--help] <command> [<args>]\n\nCommon commands: init, status, log, add, commit, push, pull, clone, diff, branch`; break; }
        if (sub === 'init') { output = `Initialized empty Git repository in ${state.cwd}/.git/`; break; }
        if (sub === 'status') { output = `On branch main\nNothing to commit, working tree clean`; break; }
        if (sub === 'log') { output = `commit a1b2c3d4e5f6 (HEAD -> main)\nAuthor: user <user@retrolinux>\nDate:   ${new Date().toDateString()}\n\n    Initial commit`; break; }
        if (sub === 'branch') { output = `* main`; break; }
        if (sub === 'diff') { output = `(no changes)`; break; }
        output = `git: '${sub}' command simulated — no actual git repository`;
        break;
      }
      case 'curl': {
        if (!args[0]) { output = 'curl: no URL specified'; break; }
        const url = args.find(a => !a.startsWith('-'));
        if (url) { openInternet(url); output = `Opening ${url} in browser...`; }
        else output = 'curl: could not resolve host';
        break;
      }
      case 'wget': {
        if (!args[0]) { output = 'wget: missing URL'; break; }
        const wurl = args.find(a => !a.startsWith('-'));
        output = `--${new Date().toISOString()}--  ${wurl}\nResolving host... connected.\nHTTP request sent, awaiting response... 200 OK\nLength: 4096 (4.0K)\nSaving to: '${getBaseName(wurl || 'index.html')}'\n\nDownload complete. (simulated)`;
        break;
      }
      case 'sudo': {
        if (!args[0]) { output = 'sudo: usage: sudo command'; break; }
        const sudoCmd = args[0]; const sudoArgs = args.slice(1);
        if (sudoCmd === 'apt-get' || sudoCmd === 'apt') { output = `[sudo] password for user: \n(simulated — see 'apt-get' for package management)`; break; }
        output = `[sudo] running '${[sudoCmd, ...sudoArgs].join(' ')}' as root...\n(Note: sudo has no additional effect in this simulator)`;
        break;
      }
      case 'apt-get':
      case 'apt': {
        const sub2 = args[0];
        if (!sub2) { output = `Usage: apt-get [install|remove|update|upgrade|search] <package>`; break; }
        if (sub2 === 'update') { output = `Hit:1 http://archive.ubuntu.com retro InRelease\nReading package lists... Done\nAll packages are up to date.`; break; }
        if (sub2 === 'upgrade') { output = `Reading package lists... Done\nBuilding dependency tree... Done\n0 upgraded, 0 newly installed, 0 to remove.`; break; }
        if (sub2 === 'install') {
          const pkg = args[1];
          if (!pkg) { output = `E: No packages found`; break; }
          output = `Reading package lists... Done\nBuilding dependency tree\nThe following NEW packages will be installed: ${pkg}\n0 upgraded, 1 newly installed.\nSetting up ${pkg}...\nPackage '${pkg}' installed successfully. (simulated)`;
          break;
        }
        if (sub2 === 'remove') { output = `Removing ${args[1] || '<package>'}... Done (simulated)`; break; }
        if (sub2 === 'search') { output = `Sorting... Done\nFull-Text Search... Done\n${args[1] || ''}: A simulated package available in the RetroLinux repository.`; break; }
        output = `E: Invalid operation ${sub2}`;
        break;
      }
      case 'pacman': {
        const psub = args[0];
        if (!psub) { output = `usage: pacman <operation> [options] [targets]\n  -S  install\n  -R  remove\n  -Syu upgrade\n  -Ss search`; break; }
        if (psub === '-Syu' || psub === '-Su') { output = `:: Synchronizing package databases...\n:: Starting full system upgrade...\n There is nothing to do.`; break; }
        if (psub === '-S') { output = `resolving dependencies...\nlooking for conflicting packages...\nPackages installed successfully. (simulated)`; break; }
        if (psub === '-R') { output = `removing ${args[1] || '<package>'}... done (simulated)`; break; }
        if (psub === '-Ss') { output = `core/${args[1] || '*'} 1.0.0-1\n    Simulated package in RetroLinux repository`; break; }
        output = `error: invalid option '${psub}'`;
        break;
      }
      case 'make': {
        output = `make: Entering directory '${state.cwd}'\ncc -o program main.c\nBuild complete. (simulated)`;
        break;
      }
      case 'gcc':
      case 'g++': {
        if (!args[0]) { output = `${cmd}: fatal error: no input files`; break; }
        const out = args[args.indexOf('-o') + 1] || 'a.out';
        const src = args.find(a => !a.startsWith('-') && a !== out);
        const srcNode = src ? getNode(resolvePath(state.cwd, src)) : undefined;
        if (src && srcNode === undefined) { output = `${cmd}: ${src}: No such file or directory`; break; }
        output = `Compiling ${src || args[0]}...\nLinked output: ./${out}\nBuild successful. (simulated)`;
        break;
      }
      case 'tar': {
        const flags3 = args[0] || '';
        if (flags3.includes('x')) { output = `Extracting archive... done (simulated)`; break; }
        if (flags3.includes('c')) { output = `Creating archive... done (simulated)`; break; }
        output = `Usage: tar [-czxvf] archive.tar [files...]`;
        break;
      }
      case 'zip':
        output = `Compressing to ${args[1] || 'archive.zip'}... done (simulated)`;
        break;
      case 'unzip':
        output = `Extracting ${args[0] || 'archive.zip'}... done (simulated)`;
        break;
      case 'ssh':
        output = `ssh: connect to host ${args[0] || '<host>'}: Network simulation not supported.`;
        break;
      case 'scp':
        output = `scp: Network transfer simulation not supported.`;
        break;
      case 'open':
      case 'xdg-open': {
        const openArg = args[0];
        if (!openArg) { output = 'open: missing argument'; break; }
        if (openArg.startsWith('http')) { openInternet(openArg); output = `Opening ${openArg}...`; break; }
        const openPath = resolvePath(state.cwd, openArg);
        const openNode = getNode(openPath);
        if (openNode === undefined) { output = `open: ${openArg}: No such file or directory`; break; }
        if (isDirectory(openNode)) { openFileExplorer(openPath); output = ''; break; }
        if (typeof openNode === 'string') { openNotepadWith(getBaseName(openPath), openPath, openNode); output = ''; break; }
        output = `open: cannot open ${openArg}`;
        break;
      }
      case 'code':
      case 'studio': {
        const codePath = args[0] ? resolvePath(state.cwd, args[0]) : state.cwd;
        openApp('ide');
        output = `Opening Code Studio${args[0] ? ` at ${codePath}` : ''}...`;
        break;
      }
      case 'clear-history':
        container._cmdHistory = [];
        output = 'Command history cleared.';
        break;
      case 'exit':
      case 'logout': {
        const winEl = container.closest('.window');
        if (winEl) closeWindow(winEl.id);
        return;
      }
      case 'shutdown':
      case 'reboot':
        window.location.reload();
        return;
      case 'help':
      case '?':
        output = `RetroLinux Bash — Available commands:

  FILE SYSTEM
  ls [-a]           List directory      tree             Show tree
  cd <dir>          Change directory    pwd              Print cwd
  cat <file>        Show file           head/tail [-n]   First/last lines
  mkdir             Make directory      rm [-r]          Remove
  touch <file>      Create file         cp [-r] src dst  Copy
  mv src dst        Move/rename         grep [-inv]      Search in file
  find [-name][-type] Find files        wc               Word count
  sort [-r]         Sort lines          uniq             Remove duplicates

  EDITORS
  nano / vi / vim   Open text editor    code / studio    Open Code Studio

  SYSTEM
  date              Current date        uptime           System uptime
  uname             System info         hostname         Hostname
  whoami            Current user        id               User info
  ps                Process list        top              Live processes
  kill <pid>        Kill process        df               Disk free
  du [path]         Disk usage          env              Environment vars
  history           Command history     alias            List aliases
  which <cmd>       Find command        man <cmd>        Manual page
  chmod/chown       File permissions (simulated)

  NETWORK
  ifconfig          Network info        ping <host>      Ping
  curl <url>        Fetch URL           wget <url>       Download
  ssh               SSH (simulated)

  DEVELOPMENT
  git [cmd]         Git (simulated)     python / python3 Python info
  node              Node.js info        gcc / g++        Compile (simulated)
  make              Build (simulated)   tar / zip / unzip Archives

  PACKAGES
  apt-get / apt     Package manager     pacman           Arch package mgr
  sudo <cmd>        Run as root

  APPS
  calc              Calculator          nano/vi          Text editor
  games             List games          snake            Play Snake
  tetris            Play Tetris         2048             Play 2048
  minesweeper       Minesweeper         agent            Interactive AI CLI
  agent [prompt]    AI execution        exit / logout    Close terminal
  open / xdg-open   Open file/URL

  exit / logout     Close terminal      shutdown/reboot  Restart`;
        break;
      default:
        output = `bash: ${cmd}: command not found\nType 'help' to see available commands.`;
    }
    if (output) addTermLine(container, output);
    if (!state.agentMode) addPromptLine(container, state);
  }

  async function runAgentCLI(container, state, prompt) {
    const provider = localStorage.getItem(AGENT_STORAGE.provider) || 'openai';
    const apiKey = getAgentStoredKey(provider);
    if (!apiKey) {
      addTermLine(container, `Error: No ${provider} API key. Configure in AI Agent app or Code Studio.`);
      return;
    }

    if (!state.agentHistory) state.agentHistory = [];
    state.agentHistory.push({ role: 'user', content: prompt });

    const loader = document.createElement('div');
    loader.className = 'cs-t-line cs-t-info';
    loader.textContent = 'Thinking...';
    container.appendChild(loader);
    container.scrollTop = container.scrollHeight;

    try {
      const controlMode = localStorage.getItem(AGENT_STORAGE.desktopControl) === '1';
      const systemPrompt = controlMode
        ? `You are RetroLinux AI Agent CLI. You can operate the computer. State:\n${getAgentDesktopState()}`
        : `You are RetroLinux AI CLI Assistant.`;

      const res = await (controlMode ? getControlEnvelope(state.agentHistory, systemPrompt) : callAI(state.agentHistory, systemPrompt));
      loader.remove();

      if (controlMode) {
        addTermLine(container, `Agent: ${res.reply}`);
        state.agentHistory.push({ role: 'assistant', content: res.reply });
        if (res.actions?.length) {
          addTermLine(container, `Executing ${res.actions.length} action(s)...`);
          for (const action of res.actions) {
            await executeAgentAction(action, (m) => {
              const logEntry = document.createElement('div');
              logEntry.className = 'cs-t-line cs-t-info';
              logEntry.textContent = `  - ${m}`;
              container.appendChild(logEntry);
            });
          }
        }
      } else {
        addTermLine(container, `Agent: ${res}`);
        state.agentHistory.push({ role: 'assistant', content: res });
      }
    } catch (err) {
      if (loader.parentNode) loader.remove();
      addTermLine(container, `Error: ${err.message}`);
    }
    container.scrollTop = container.scrollHeight;
  }


  function buildTree(node, prefix) {
    if (!isDirectory(node)) return '';
    const entries = Object.entries(node).sort((a, b) => {
      const aRank = isDirectory(a[1]) ? 0 : 1;
      const bRank = isDirectory(b[1]) ? 0 : 1;
      return aRank - bRank || a[0].localeCompare(b[0]);
    });
    let result = '';
    entries.forEach(([name, val], i) => {
      const isLast = i === entries.length - 1;
      const connector = isLast ? '└── ' : '├── ';
      const isDir = isDirectory(val);
      result += prefix + connector + name + (isDir ? '/' : '') + '\n';
      if (isDir) result += buildTree(val, prefix + (isLast ? '    ' : '│   '));
    });
    return result;
  }

  // ======= NOTEPAD =======
  function openNotepad() {
    createWindow({
      title: 'Untitled - Notepad', width: 560, height: 400, tbIcon: '📝',
      menubar: '<div class="window-menubar"><span>File</span><span>Edit</span><span>Format</span><span>View</span><span>Help</span></div>',
      body: '<textarea class="notepad-textarea" spellcheck="false" placeholder=""></textarea>',
      status: 'Ln 1, Col 1'
    });
  }

  // ======= CALCULATOR =======
  function openCalculator() {
    const btns = ['MC', 'MR', 'MS', 'M+', '←', 'CE', 'C', '±', '7', '8', '9', '/', '4', '5', '6', '*', '1', '2', '3', '-', '0', '.', '=', '+'];
    let btnHtml = '';
    btns.forEach(b => {
      let cls = 'calc-btn';
      if (['/', '*', '-', '+'].includes(b)) cls += ' operator';
      if (b === '=') cls += ' equals';
      if (['CE', 'C'].includes(b)) cls += ' clear';
      btnHtml += `<button class="${cls}" data-val="${b}">${b}</button>`;
    });
    const id = createWindow({
      title: 'Calculator', width: 260, height: 340, tbIcon: '🔢',
      menubar: '<div class="window-menubar"><span>View</span><span>Edit</span><span>Help</span></div>',
      body: `<div class="calculator-body"><input class="calc-display" type="text" value="0" readonly><div class="calc-buttons">${btnHtml}</div></div>`,
      statusbar: false,
      onReady: (winId) => {
        const body = document.getElementById(winId + '-body');
        const display = body.querySelector('.calc-display');
        let current = '0', prev = '', op = '', reset = false;
        body.querySelectorAll('.calc-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            const v = btn.dataset.val;
            if ('0123456789'.includes(v)) {
              current = (current === '0' || reset) ? v : current + v;
              reset = false;
            } else if (v === '.') {
              if (reset) { current = '0.'; reset = false; }
              else if (!current.includes('.')) current += '.';
            } else if (['+', '-', '*', '/'].includes(v)) {
              if (prev && op && !reset) { current = String(calc(parseFloat(prev), parseFloat(current), op)); }
              prev = current; op = v; reset = true;
            } else if (v === '=') {
              if (prev && op) { current = String(calc(parseFloat(prev), parseFloat(current), op)); prev = ''; op = ''; reset = true; }
            } else if (v === 'C') { current = '0'; prev = ''; op = ''; }
            else if (v === 'CE') { current = '0'; }
            else if (v === '←') { current = current.slice(0, -1) || '0'; }
            else if (v === '±') { current = String(-parseFloat(current)); }
            display.value = current;
          });
        });
      }
    });
  }
  function calc(a, b, op) { return op === '+' ? a + b : op === '-' ? a - b : op === '*' ? a * b : op === '/' ? (b === 0 ? 'Error' : a / b) : 0; }

  // ======= PAINT =======
  function openPaint() {
    const colors = ['#000', '#fff', '#808080', '#c0c0c0', '#800000', '#ff0000', '#808000', '#ffff00', '#008000', '#00ff00', '#008080', '#00ffff', '#000080', '#0000ff', '#800080', '#ff00ff', '#ff8000', '#ff69b4'];
    let colorHtml = colors.map((c, i) => `<div class="color-btn ${i === 0 ? 'active' : ''}" style="background:${c}" data-color="${c}"></div>`).join('');
    const id = createWindow({
      title: 'untitled - Paint', width: 700, height: 500, tbIcon: '🎨',
      menubar: '<div class="window-menubar"><span>File</span><span>Edit</span><span>View</span><span>Image</span><span>Colors</span><span>Help</span></div>',
      body: `<div class="paint-body">
        <div class="paint-tools">
          <button class="paint-tool-btn active" data-tool="brush" title="Brush">✏️</button>
          <button class="paint-tool-btn" data-tool="eraser" title="Eraser">🧹</button>
          <button class="paint-tool-btn" data-tool="fill" title="Fill">🪣</button>
          <div class="paint-sizes">
            <button class="size-btn active" data-size="2"><div class="size-dot" style="width:4px;height:4px"></div></button>
            <button class="size-btn" data-size="5"><div class="size-dot" style="width:8px;height:8px"></div></button>
            <button class="size-btn" data-size="10"><div class="size-dot" style="width:12px;height:12px"></div></button>
          </div>
        </div>
        <div class="paint-toolbar">${colorHtml}</div>
        <div class="paint-canvas-wrapper"><canvas width="640" height="400"></canvas></div>
      </div>`,
      status: 'For Help, click Help Topics on the Help Menu.',
      onReady: (winId) => {
        const body = document.getElementById(winId + '-body');
        const canvas = body.querySelector('canvas');
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, 640, 400);
        let drawing = false, color = '#000', tool = 'brush', size = 2;
        canvas.addEventListener('mousedown', (e) => {
          drawing = true;
          const r = canvas.getBoundingClientRect();
          const x = e.clientX - r.left, y = e.clientY - r.top;
          if (tool === 'fill') { ctx.fillStyle = color; ctx.fillRect(0, 0, 640, 400); drawing = false; return; }
          ctx.beginPath(); ctx.moveTo(x, y);
        });
        canvas.addEventListener('mousemove', (e) => {
          if (!drawing) return;
          const r = canvas.getBoundingClientRect();
          ctx.lineWidth = size; ctx.lineCap = 'round';
          ctx.strokeStyle = tool === 'eraser' ? '#fff' : color;
          ctx.lineTo(e.clientX - r.left, e.clientY - r.top);
          ctx.stroke();
        });
        canvas.addEventListener('mouseup', () => { drawing = false; });
        canvas.addEventListener('mouseleave', () => { drawing = false; });
        body.querySelectorAll('.color-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            body.querySelectorAll('.color-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active'); color = btn.dataset.color;
          });
        });
        body.querySelectorAll('.paint-tool-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            body.querySelectorAll('.paint-tool-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active'); tool = btn.dataset.tool;
          });
        });
        body.querySelectorAll('.size-btn').forEach(btn => {
          btn.addEventListener('click', () => {
            body.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active'); size = parseInt(btn.dataset.size);
          });
        });
      }
    });
  }

  // ======= MY COMPUTER (root partition view) =======
  function openMyComputer() {
    createWindow({
      title: 'Computer', width: 640, height: 440, tbIcon: '💻',
      menubar: '<div class="window-menubar"><span>File</span><span>Edit</span><span>View</span><span>Bookmarks</span><span>Help</span></div>',
      toolbar: '<div class="window-toolbar"><button>Back</button><button>Forward</button><button>Up</button><button>Search</button></div>',
      addressbar: '<div class="window-address"><label>Address</label><input value="computer:///" readonly><button>Go</button></div>',
      body: `<div class="explorer-body">
        <div class="explorer-sidebar" style="background: #3c3c3c; color: white;"><div class="explorer-sidebar-title" style="color: #93c5fd;">System Links</div>
          <div class="explorer-sidebar-item">View system information</div>
          <div class="explorer-sidebar-item" data-app="settings">System settings</div>
        </div>
        <div class="explorer-content">
          <div class="explorer-item mc-drive" data-path="/"><div class="explorer-item-icon">💽</div><div class="explorer-item-name">Filesystem Root (/)</div></div>
          <div class="explorer-item mc-drive" data-path="/home/user"><div class="explorer-item-icon">🏠</div><div class="explorer-item-name">Files (/home/user)</div></div>
          <div class="explorer-item"><div class="explorer-item-icon">📀</div><div class="explorer-item-name">CD/DVD Drive (/dev/sr0)</div></div>
          <div class="explorer-item"><div class="explorer-item-icon">🖧</div><div class="explorer-item-name">Network</div></div>
        </div>
      </div>`,
      status: '4 object(s)',
      onReady: (winId) => {
        const body = document.getElementById(winId + '-body');
        body.querySelectorAll('.mc-drive').forEach(drive => {
          drive.addEventListener('dblclick', () => {
            closeWindow(winId);
            openFileExplorer(drive.dataset.path);
          });
        });
        body.querySelectorAll('.explorer-sidebar-item[data-app]').forEach(item => {
          item.addEventListener('click', () => {
            playSound('click');
            openApp(item.dataset.app);
          });
        });
      }
    });
  }

  // ======= FILE EXPLORER (My Documents / Home) =======
  function openFileExplorer(startPath) {
    const navPath = normalizePath(startPath || '/home/user');
    createWindow({
      title: 'File Manager', width: 680, height: 460, tbIcon: '📁',
      menubar: '<div class="window-menubar"><span>File</span><span>Edit</span><span>View</span><span>Tools</span><span>Help</span></div>',
      toolbar: '<div class="window-toolbar"><button class="exp-back-btn">← Back</button><button class="exp-fwd-btn">→ Fwd</button><button class="exp-up-btn">↑ Up</button></div>',
      addressbar: '<div class="window-address"><label>Address</label><input class="exp-addr" value=""><button class="exp-go-btn">Go</button></div>',
      body: '<div class="explorer-body"><div class="explorer-sidebar"><div class="explorer-sidebar-title">Tasks</div><div class="explorer-sidebar-item exp-new-folder">📁 New Folder</div><div class="explorer-sidebar-item exp-new-txt">📄 New Text File</div><div class="explorer-sidebar-item exp-new-html">🌐 New HTML File</div><div class="explorer-sidebar-item exp-new-css">🎨 New CSS File</div><div class="explorer-sidebar-item exp-new-js">⚡ New JS File</div><div class="explorer-sidebar-item exp-new-json">📋 New JSON File</div><div class="explorer-sidebar-item exp-new-md">📝 New Markdown File</div></div><div class="explorer-content"></div></div>',
      status: 'Ready',
      onReady: (winId) => {
        const body = document.getElementById(winId + '-body');
        const content = body.querySelector('.explorer-content');
        const addr = body.querySelector('.exp-addr');
        const goBtn = body.querySelector('.exp-go-btn');
        const statusBar = body.closest('.window').querySelector('.status-section');
        let curPath = navPath;
        let history = [navPath], histIdx = 0;
        let selectedItem = null;

        function renderDir() {
          const node = getNode(curPath);
          content.classList.remove('drag-over');
          addr.value = curPath;
          if (!isDirectory(node)) {
            content.innerHTML = '<div style="padding:20px;color:#888;font-size:12px">Cannot open this location.</div>';
            if (statusBar) statusBar.textContent = 'Unavailable';
            return;
          }
          const entries = Object.entries(node);
          if (entries.length === 0) { content.innerHTML = '<div style="padding:20px;color:#888;font-size:12px">This folder is empty.</div>'; }
          else {
            const sorted = entries.sort((a, b) => {
              const aDir = isDirectory(a[1]) ? 0 : 1;
              const bDir = isDirectory(b[1]) ? 0 : 1;
              return aDir - bDir || a[0].localeCompare(b[0]);
            });
            content.innerHTML = sorted.map(([name, val]) => {
              const icon = getFileIcon(name, val);
              const isDir = isDirectory(val);
              return `<div class="explorer-item" draggable="true" data-name="${name}" data-isdir="${isDir}"><div class="explorer-item-icon">${icon}</div><div class="explorer-item-name">${name}</div></div>`;
            }).join('');
          }
          if (statusBar) statusBar.textContent = `${entries.length} object(s)`;
          const w = body.closest('.window');
          if (w) w.querySelector('.window-title-text').textContent = curPath;
          bindItems();
        }

        function navigate(path) {
          const normalizedPath = normalizePath(path);
          const node = getNode(normalizedPath);
          if (!isDirectory(node)) return;
          curPath = normalizedPath;
          history = history.slice(0, histIdx + 1);
          history.push(normalizedPath);
          histIdx = history.length - 1;
          selectedItem = null;
          renderDir();
        }

        function bindItems() {
          content.querySelectorAll('.explorer-item').forEach(item => {
            const name = item.dataset.name;
            const isDir = item.dataset.isdir === 'true';
            item.addEventListener('click', (e) => {
              e.stopPropagation();
              content.querySelectorAll('.explorer-item').forEach(i => i.classList.remove('selected'));
              item.classList.add('selected');
              selectedItem = name;
            });
            item.addEventListener('dblclick', () => {
              const fullPath = joinPath(curPath, name);
              if (isDir) navigate(fullPath);
              else {
                const val = getNode(fullPath);
                if (typeof val === 'string') openNotepadWith(name, fullPath, val);
              }
            });
            // Drag start
            item.addEventListener('dragstart', (e) => {
              e.dataTransfer.setData('text/plain', JSON.stringify({ name, fromPath: curPath }));
              e.dataTransfer.effectAllowed = 'move';
              item.style.opacity = '0.5';
            });
            item.addEventListener('dragend', () => { item.style.opacity = '1'; });
            // Drop target (folders only)
            if (isDir) {
              item.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; item.classList.add('drag-over'); });
              item.addEventListener('dragleave', () => { item.classList.remove('drag-over'); });
              item.addEventListener('drop', (e) => {
                e.preventDefault(); item.classList.remove('drag-over');
                try {
                  const data = JSON.parse(e.dataTransfer.getData('text/plain'));
                  const srcFull = joinPath(data.fromPath, data.name);
                  const destDir = joinPath(curPath, name);
                  if (moveNodeIntoDirectory(srcFull, destDir)) renderDir();
                } catch (err) { }
              });
            }
            // Right click context menu on items
            item.addEventListener('contextmenu', (e) => {
              e.preventDefault(); e.stopPropagation();
              content.querySelectorAll('.explorer-item').forEach(i => i.classList.remove('selected'));
              item.classList.add('selected'); selectedItem = name;
              showExplorerCtx(e.clientX, e.clientY, name, isDir, curPath, renderDir);
            });
          });
        }

        // Click empty space deselects
        content.addEventListener('click', (e) => { if (!e.target.closest('.explorer-item')) { content.querySelectorAll('.explorer-item').forEach(i => i.classList.remove('selected')); selectedItem = null; } });
        content.addEventListener('dragover', (e) => {
          if (e.target.closest('.explorer-item[data-isdir="true"]')) return;
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          content.classList.add('drag-over');
        });
        content.addEventListener('dragleave', (e) => {
          if (content.contains(e.relatedTarget)) return;
          content.classList.remove('drag-over');
        });
        content.addEventListener('drop', (e) => {
          if (e.target.closest('.explorer-item[data-isdir="true"]')) return;
          e.preventDefault();
          content.classList.remove('drag-over');
          try {
            const data = JSON.parse(e.dataTransfer.getData('text/plain'));
            const srcFull = joinPath(data.fromPath, data.name);
            if (moveNodeIntoDirectory(srcFull, curPath)) renderDir();
          } catch (err) { }
        });
        // Right click empty space - new file menu
        content.addEventListener('contextmenu', (e) => {
          if (e.target.closest('.explorer-item')) return;
          e.preventDefault();
          showExplorerNewCtx(e.clientX, e.clientY, curPath, renderDir);
        });

        // Navigation buttons
        body.querySelector('.exp-back-btn').addEventListener('click', () => { if (histIdx > 0) { histIdx--; curPath = history[histIdx]; renderDir(); } });
        body.querySelector('.exp-fwd-btn').addEventListener('click', () => { if (histIdx < history.length - 1) { histIdx++; curPath = history[histIdx]; renderDir(); } });
        body.querySelector('.exp-up-btn').addEventListener('click', () => {
          const parts = curPath.split('/').filter(Boolean);
          if (parts.length > 0) {
            parts.pop();
            navigate('/' + parts.join('/'));
          }
        });
        goBtn.addEventListener('click', () => {
          const target = normalizePath(addr.value);
          if (isDirectory(getNode(target))) navigate(target);
        });
        addr.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') goBtn.click();
        });
        // Sidebar new item buttons
        body.querySelector('.exp-new-folder').addEventListener('click', () => createNewItem(curPath, 'folder', renderDir));
        body.querySelector('.exp-new-txt').addEventListener('click', () => createNewItem(curPath, 'txt', renderDir));
        body.querySelector('.exp-new-html').addEventListener('click', () => createNewItem(curPath, 'html', renderDir));
        body.querySelector('.exp-new-css').addEventListener('click', () => createNewItem(curPath, 'css', renderDir));
        body.querySelector('.exp-new-js').addEventListener('click', () => createNewItem(curPath, 'js', renderDir));
        body.querySelector('.exp-new-json').addEventListener('click', () => createNewItem(curPath, 'json', renderDir));
        body.querySelector('.exp-new-md').addEventListener('click', () => createNewItem(curPath, 'md', renderDir));
        registerWindowCleanup(winId, subscribeToFS(() => {
          curPath = getNearestExistingDirectory(curPath);
          renderDir();
        }));

        renderDir();
      }
    });
  }
  function openMyDocuments() { openFileExplorer('/home/user'); }

  // ======= Create New Items =======
  function createNewItem(dirPath, type, refreshFn) {
    const templates = {
      folder: { name: 'New Folder', content: null },
      txt: { name: 'New File.txt', content: '' },
      html: { name: 'index.html', content: '<!DOCTYPE html>\n<html>\n<head>\n  <title>Page</title>\n</head>\n<body>\n  <h1>Hello World</h1>\n</body>\n</html>' },
      css: { name: 'styles.css', content: '/* Styles */\nbody {\n  margin: 0;\n  font-family: sans-serif;\n}' },
      js: { name: 'script.js', content: '// JavaScript\nconsole.log("Hello!");' },
      json: { name: 'data.json', content: '{\n  "key": "value"\n}' },
      md: { name: 'README.md', content: '# Title\n\nDescription here.' }
    };
    const tpl = templates[type] || templates.txt;
    const dir = getNode(dirPath);
    if (!isDirectory(dir)) return false;

    const suggestedName = getUniqueChildName(dirPath, tpl.name);
    const inputName = prompt('Create item as:', suggestedName);
    if (inputName === null) return false;

    const finalName = inputName.trim();
    if (!isValidNodeName(finalName)) {
      alert('Please enter a valid name.');
      return false;
    }
    if (getNode(joinPath(dirPath, finalName)) !== undefined) {
      alert(`"${finalName}" already exists in this folder.`);
      return false;
    }

    const didCreate = setNode(joinPath(dirPath, finalName), tpl.content === null ? {} : tpl.content, { overwrite: false });
    if (didCreate) {
      if (refreshFn) refreshFn();
      playSound('click');
    }
    return didCreate;
  }

  // ======= Explorer Context Menus =======
  function showExplorerCtx(x, y, name, isDir, dirPath, refreshFn) {
    removeExplorerCtx();
    const menu = document.createElement('div');
    menu.className = 'exp-context-menu';
    menu.style.left = x + 'px'; menu.style.top = y + 'px';
    const fullPath = dirPath === '/' ? '/' + name : dirPath + '/' + name;
    menu.innerHTML = `
      ${isDir ? '<div class="ctx-item exp-ctx-open">📂 Open</div>' : '<div class="ctx-item exp-ctx-open">📄 Open</div>'}
      <div class="ctx-separator"></div>
      <div class="ctx-item exp-ctx-rename">✏️ Rename</div>
      <div class="ctx-item exp-ctx-delete">🗑️ Delete</div>
      <div class="ctx-separator"></div>
      <div class="ctx-item exp-ctx-props">ℹ️ Properties</div>`;
    document.body.appendChild(menu);
    menu.querySelector('.exp-ctx-open').addEventListener('click', () => {
      removeExplorerCtx();
      if (isDir) openFileExplorer(fullPath);
      else {
        const val = getNode(fullPath);
        if (typeof val === 'string') openNotepadWith(name, fullPath, val);
      }
    });
    menu.querySelector('.exp-ctx-rename').addEventListener('click', () => {
      removeExplorerCtx();
      const inputName = prompt('Rename to:', name);
      if (inputName === null) return;

      const newName = inputName.trim();
      if (!newName || newName === name) return;
      if (!isValidNodeName(newName)) {
        alert('Please enter a valid name.');
        return;
      }

      const newPath = joinPath(dirPath, newName);
      if (getNode(newPath) !== undefined) {
        alert(`"${newName}" already exists in this folder.`);
        return;
      }
      if (moveNode(fullPath, newPath)) refreshFn();
    });
    menu.querySelector('.exp-ctx-delete').addEventListener('click', () => {
      removeExplorerCtx();
      if (confirm(`Delete "${name}"?`)) {
        if (trashNode(fullPath)) refreshFn();
      }
    });
    menu.querySelector('.exp-ctx-props').addEventListener('click', () => {
      removeExplorerCtx();
      const node = getNode(fullPath);
      const size = typeof node === 'string' ? node.length + ' bytes' : Object.keys(node || {}).length + ' items';
      alert(`Name: ${name}\nType: ${isDir ? 'Folder' : 'File'}\nSize: ${size}\nLocation: ${dirPath}`);
    });
    setTimeout(() => document.addEventListener('click', removeExplorerCtx, { once: true }), 10);
  }

  function showExplorerNewCtx(x, y, dirPath, refreshFn) {
    removeExplorerCtx();
    const menu = document.createElement('div');
    menu.className = 'exp-context-menu';
    menu.style.left = x + 'px'; menu.style.top = y + 'px';
    menu.innerHTML = `
      <div class="ctx-item exp-nctx" data-type="folder">📁 New Folder</div>
      <div class="ctx-separator"></div>
      <div class="ctx-item exp-nctx" data-type="txt">📄 Text Document</div>
      <div class="ctx-item exp-nctx" data-type="html">🌐 HTML File</div>
      <div class="ctx-item exp-nctx" data-type="css">🎨 CSS File</div>
      <div class="ctx-item exp-nctx" data-type="js">⚡ JavaScript File</div>
      <div class="ctx-item exp-nctx" data-type="json">📋 JSON File</div>
      <div class="ctx-item exp-nctx" data-type="md">📝 Markdown File</div>
      <div class="ctx-separator"></div>
      <div class="ctx-item exp-ctx-refresh">🔄 Refresh</div>`;
    document.body.appendChild(menu);
    menu.querySelectorAll('.exp-nctx').forEach(item => {
      item.addEventListener('click', () => { removeExplorerCtx(); createNewItem(dirPath, item.dataset.type, refreshFn); });
    });
    menu.querySelector('.exp-ctx-refresh').addEventListener('click', () => { removeExplorerCtx(); refreshFn(); });
    setTimeout(() => document.addEventListener('click', removeExplorerCtx, { once: true }), 10);
  }

  function removeExplorerCtx() { document.querySelectorAll('.exp-context-menu').forEach(m => m.remove()); }

  // ======= Open file in Notepad =======
  function openNotepadWith(name, fullPath, content) {
    createWindow({
      title: name + ' - Text Editor', width: 560, height: 400, tbIcon: '📝',
      menubar: '<div class="window-menubar"><span class="np-save-btn">💾 Save</span><span>Edit</span><span>Format</span><span>Help</span></div>',
      body: '<textarea class="notepad-textarea" spellcheck="false"></textarea>',
      status: fullPath,
      onReady: (winId) => {
        const body = document.getElementById(winId + '-body');
        const ta = body.querySelector('.notepad-textarea');
        ta.value = content;
        body.closest('.window').querySelector('.np-save-btn').addEventListener('click', () => {
          if (setNode(fullPath, ta.value)) playSound('click');
          else alert(`Could not save "${name}".`);
        });
      }
    });
  }

  // ======= TRASH =======
  function openRecycleBin() {
    createWindow({
      title: 'Recycle Bin', width: 560, height: 420, tbIcon: '🗑️',
      menubar: '<div class="window-menubar"><span>File</span><span>Edit</span><span>View</span><span>Help</span></div>',
      body: '<div class="explorer-body"><div class="explorer-sidebar"><div class="explorer-sidebar-title">Trash Tasks</div><div class="explorer-sidebar-item trash-empty-btn">🗑️ Empty Trash</div><div class="explorer-sidebar-item trash-restore-btn">♻️ Restore All</div></div><div class="explorer-content trash-content"></div></div>',
      status: '0 object(s)',
      onReady: (winId) => {
        const body = document.getElementById(winId + '-body');
        const content = body.querySelector('.trash-content');
        const statusBar = body.closest('.window').querySelector('.status-section');
        function renderTrash() {
          if (trashBin.length === 0) { content.innerHTML = '<div style="padding:20px;color:#888;font-size:12px">The Recycle Bin is empty.</div>'; }
          else {
            content.innerHTML = trashBin.map((item, idx) => `
              <div class="explorer-item" data-idx="${idx}">
                <div class="explorer-item-icon">${getFileIcon(item.name, item.content)}</div>
                <div class="explorer-item-name">${item.name}<br><small style="color:#888">From: ${item.from}</small></div>
              </div>`).join('');
          }
          if (statusBar) statusBar.textContent = trashBin.length + ' object(s)';
          content.querySelectorAll('.explorer-item').forEach(item => {
            item.addEventListener('contextmenu', (e) => {
              e.preventDefault(); e.stopPropagation();
              const idx = parseInt(item.dataset.idx);
              const entry = trashBin[idx];
              if (!entry) return;
              removeExplorerCtx();
              const menu = document.createElement('div');
              menu.className = 'exp-context-menu';
              menu.style.left = e.clientX + 'px'; menu.style.top = e.clientY + 'px';
              menu.innerHTML = '<div class="ctx-item trash-restore-one">♻️ Restore</div><div class="ctx-item trash-delete-one">❌ Delete Permanently</div>';
              document.body.appendChild(menu);
              menu.querySelector('.trash-restore-one').addEventListener('click', () => {
                removeExplorerCtx();
                if (restoreTrashEntry(entry)) {
                  trashBin.splice(idx, 1);
                  saveTrash();
                  renderTrash();
                  playSound('restore');
                }
              });
              menu.querySelector('.trash-delete-one').addEventListener('click', () => {
                removeExplorerCtx();
                trashBin.splice(idx, 1);
                saveTrash();
                renderTrash();
                playSound('click');
              });
              setTimeout(() => document.addEventListener('click', removeExplorerCtx, { once: true }), 10);
            });
          });
        }
        body.querySelector('.trash-empty-btn').addEventListener('click', () => {
          if (trashBin.length > 0 && confirm('Are you sure you want to permanently delete all items in the Recycle Bin?')) {
            trashBin = []; saveTrash(); renderTrash(); playSound('click');
          }
        });
        body.querySelector('.trash-restore-btn').addEventListener('click', () => {
          if (trashBin.length === 0) return;
          const remaining = [];
          trashBin.forEach((item) => {
            if (!restoreTrashEntry(item)) remaining.push(item);
          });
          trashBin = remaining;
          saveTrash();
          renderTrash();
          playSound('restore');
        });
        registerWindowCleanup(winId, subscribeToTrash(renderTrash));
        renderTrash();
      }
    });
  }

  // ======= AI AGENT =======
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function ensureAgentCursor() {
    let cursor = document.getElementById('agent-cursor');
    if (!cursor) {
      cursor = document.createElement('div');
      cursor.id = 'agent-cursor';
      cursor.innerHTML = '<div class="agent-cursor-pointer"></div><div class="agent-cursor-ring"></div>';
      document.body.appendChild(cursor);
    }
    return cursor;
  }

  async function animateAgentCursorTo(x, y, click = false) {
    const cursor = ensureAgentCursor();
    const startRect = cursor.getBoundingClientRect();
    const startX = startRect.width ? startRect.left : window.innerWidth * 0.5;
    const startY = startRect.height ? startRect.top : window.innerHeight * 0.5;
    const endX = Math.max(6, Math.min(x, window.innerWidth - 16));
    const endY = Math.max(6, Math.min(y, window.innerHeight - 16));
    const distance = Math.hypot(endX - startX, endY - startY);
    const duration = Math.min(900, Math.max(260, distance * 1.5));
    const started = performance.now();
    cursor.style.display = 'block';

    await new Promise((resolve) => {
      function step(now) {
        const progress = Math.min(1, (now - started) / duration);
        const eased = 1 - Math.pow(1 - progress, 3);
        const curX = startX + (endX - startX) * eased;
        const curY = startY + (endY - startY) * eased;
        cursor.style.transform = `translate(${curX}px, ${curY}px)`;
        if (progress < 1) requestAnimationFrame(step);
        else resolve();
      }
      requestAnimationFrame(step);
    });

    if (click) {
      cursor.classList.add('clicking');
      await sleep(140);
      cursor.classList.remove('clicking');
    }
  }

  async function animateAgentToElement(element, click = true) {
    if (!element) {
      await animateAgentCursorTo(window.innerWidth * 0.5, window.innerHeight * 0.35, false);
      return;
    }
    const rect = element.getBoundingClientRect();
    await animateAgentCursorTo(rect.left + rect.width * 0.5, rect.top + rect.height * 0.5, click);
  }

  function hideAgentCursor() {
    const cursor = document.getElementById('agent-cursor');
    if (cursor) cursor.style.display = 'none';
  }

  function getWindowCapabilities(title) {
    const text = String(title || '');
    if (/Command Prompt/i.test(text)) return 'terminal input';
    if (/Text Editor|Notepad/i.test(text)) return 'text editor, save';
    if (/File Manager/i.test(text)) return 'folder view, address bar';
    if (/Web Browser/i.test(text)) return 'address bar, go, back, forward, refresh, home';
    if (/Code Studio/i.test(text)) return 'file tree, code editor, save, live preview';
    if (/System Settings/i.test(text)) return 'settings toggle';
    if (/AI Agent/i.test(text)) return 'chat input, send';
    return 'window controls';
  }

  function getWindowRecords() {
    return Array.from(document.querySelectorAll('.window')).map((element) => {
      const title = element.querySelector('.window-title-text')?.textContent?.trim() || 'Window';
      let detail = '';
      if (/File Manager/i.test(title)) {
        detail = `Path: ${element.querySelector('.exp-addr')?.value || '/'}`;
      } else if (/Web Browser/i.test(title)) {
        detail = `URL: ${element.querySelector('.ie-addr-input')?.value || 'about:blank'}`;
      } else if (/Terminal|Command Prompt/i.test(title)) {
        const lines = Array.from(element.querySelectorAll('pre')).slice(-5).map(l => l.textContent.trim()).filter(Boolean);
        const prompt = element.querySelector('.terminal-prompt:last-of-type')?.textContent?.trim() || '';
        detail = `Prompt: ${prompt}${lines.length ? ' | Recent output: ' + lines.join('; ') : ''}`;
      } else if (/Text Editor|Notepad/i.test(title)) {
        const path = element.querySelector('.status-section')?.textContent?.trim() || 'unsaved';
        const content = element.querySelector('.notepad-textarea')?.value || '';
        detail = `File: ${path} | Size: ${content.length} chars`;
      } else if (/Code Studio/i.test(title)) {
        const workspace = element.querySelector('#cs-workspace-label')?.textContent?.trim() || 'none';
        const file = element.querySelector('.cs-tab.active .cs-tab-name')?.textContent || 'none';
        detail = `Project: ${workspace} | File: ${file}`;
      } else if (/System Settings/i.test(title)) {
        detail = element.querySelector('#toggle-sound')?.checked ? 'sound on' : 'sound off';
      }

      return {
        id: element.id,
        title,
        detail,
        isActive: element.classList.contains('active'),
        isMinimized: element.classList.contains('minimized'),
        left: parseInt(element.style.left, 10) || 0,
        top: parseInt(element.style.top, 10) || 0,
        element
      };
    }).sort((a, b) => {
      if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;
      return (parseInt(b.element.style.zIndex, 10) || 0) - (parseInt(a.element.style.zIndex, 10) || 0);
    });
  }

  function findWindowRecord(query = '') {
    const records = getWindowRecords();
    const normalized = String(query || '').trim().toLowerCase();
    if (!normalized || normalized === 'active') return records.find((record) => record.isActive) || records[0] || null;
    return records.find((record) => record.title.toLowerCase() === normalized)
      || records.find((record) => record.title.toLowerCase().includes(normalized))
      || null;
  }

  function isAgentWindowElement(element) {
    const windowEl = element?.closest?.('.window');
    const title = windowEl?.querySelector('.window-title-text')?.textContent || '';
    return /AI Agent/i.test(title);
  }

  function isElementVisible(element) {
    if (!element || !element.isConnected) return false;
    const style = window.getComputedStyle(element);
    if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity || '1') < 0.05) return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 4 && rect.height > 4;
  }

  function extractElementLabel(element) {
    if (!element) return '';
    if (element.matches('input[type="password"]')) {
      return element.getAttribute('placeholder') || 'password field';
    }
    const directText = [
      element.getAttribute('aria-label'),
      element.getAttribute('title'),
      element.getAttribute('placeholder'),
      element.value,
      element.dataset?.app,
      element.querySelector?.('span')?.textContent,
      element.textContent
    ].find((value) => typeof value === 'string' && value.trim());
    return String(directText || '').replace(/\s+/g, ' ').trim();
  }

  function getAgentUIScreenMap() {
    const selectors = [
      '.window.active',
      '.window',
      '.desktop-icon',
      '.taskbar-app',
      '.start-menu-item',
      '.start-menu-item-right',
      '.explorer-item',
      '.explorer-sidebar-item',
      '.cs-action-btn',
      '.cs-picker-row',
      '.cs-ft-row',
      '.window-btn',
      '.ie-nav-btn',
      '.ie-go-btn',
      '.np-save-btn',
      'button',
      'input',
      'textarea'
    ];
    const seen = new Set();
    const lines = [];
    document.querySelectorAll(selectors.join(',')).forEach((element) => {
      if (!isElementVisible(element) || seen.has(element)) return;
      if (isAgentWindowElement(element)) return;
      seen.add(element);
      const label = extractElementLabel(element);
      if (!label) return;
      const rect = element.getBoundingClientRect();
      const role = element.matches('textarea') ? 'textarea'
        : element.matches('input') ? `input:${element.type || 'text'}`
          : element.matches('button, .window-btn, .ie-nav-btn, .ie-go-btn, .np-save-btn, .cs-action-btn') ? 'button'
            : element.matches('.desktop-icon, .taskbar-app, .start-menu-item, .start-menu-item-right') ? 'launcher'
              : element.matches('.explorer-item, .cs-picker-row, .cs-ft-row') ? 'item'
                : 'ui';
      lines.push(`- ${role} "${label}" @ (${Math.round(rect.left)}, ${Math.round(rect.top)}) size ${Math.round(rect.width)}x${Math.round(rect.height)}`);
    });
    return lines.slice(0, 80).join('\n') || '(no visible interactive elements)';
  }

  function getSnapshotStyleText() {
    const chunks = [];
    const maxStyleSize = 50000; // Limit style size to prevent SVG failure
    let totalSize = 0;
    Array.from(document.styleSheets).forEach((sheet) => {
      if (totalSize > maxStyleSize) return;
      try {
        if (!sheet.cssRules) return;
        const css = Array.from(sheet.cssRules).map((rule) => {
          // Skip font-face and complex imports that break foreignObject SVGs
          if (rule.type === CSSRule.FONT_FACE_RULE || rule.cssText.includes('@font-face')) return '';
          return rule.cssText;
        }).join('\n');
        chunks.push(css);
        totalSize += css.length;
      } catch (error) { }
    });
    return chunks.join('\n').replace(/<\/style/gi, '<\\/style').slice(0, maxStyleSize);
  }

  function prepareSnapshotClone(cloneRoot, sourceRoot) {
    if (!cloneRoot || !sourceRoot) return;
    const cloneNodes = [cloneRoot, ...cloneRoot.querySelectorAll('*')];
    const sourceNodes = [sourceRoot, ...sourceRoot.querySelectorAll('*')];

    cloneNodes.forEach((cloneNode, index) => {
      const sourceNode = sourceNodes[index];
      if (!cloneNode || !sourceNode) return;
      if (cloneNode.id === 'agent-cursor') {
        cloneNode.remove();
        return;
      }

      const tagName = cloneNode.tagName?.toLowerCase?.();
      if (!tagName) return;

      if (tagName === 'iframe') {
        const placeholder = document.createElement('div');
        placeholder.className = cloneNode.className || '';
        placeholder.style.cssText = cloneNode.getAttribute('style') || '';
        placeholder.style.display = 'flex';
        placeholder.style.alignItems = 'center';
        placeholder.style.justifyContent = 'center';
        placeholder.style.background = 'linear-gradient(180deg, #f8fafc, #dbe7f8)';
        placeholder.style.color = '#37517a';
        placeholder.style.fontFamily = 'Tahoma, sans-serif';
        placeholder.style.fontSize = '12px';
        placeholder.style.textAlign = 'center';
        placeholder.style.padding = '12px';
        placeholder.textContent = sourceNode.getAttribute('src') ? `Embedded page: ${sourceNode.getAttribute('src')}` : 'Embedded content';
        cloneNode.replaceWith(placeholder);
        return;
      }

      if (tagName === 'canvas') {
        try {
          const image = document.createElement('img');
          image.src = sourceNode.toDataURL('image/png');
          image.width = sourceNode.width;
          image.height = sourceNode.height;
          image.style.cssText = sourceNode.getAttribute('style') || '';
          cloneNode.replaceWith(image);
        } catch (error) { }
        return;
      }

      if (tagName === 'textarea') {
        cloneNode.textContent = sourceNode.value || '';
        cloneNode.setAttribute('value', sourceNode.value || '');
      }

      if (tagName === 'input') {
        if (sourceNode.type === 'checkbox' || sourceNode.type === 'radio') {
          if (sourceNode.checked) cloneNode.setAttribute('checked', 'checked');
          else cloneNode.removeAttribute('checked');
        } else if (sourceNode.type === 'password') {
          cloneNode.setAttribute('value', '••••••••');
        } else {
          cloneNode.setAttribute('value', sourceNode.value || '');
        }
      }

      if (tagName === 'select') {
        Array.from(cloneNode.options || []).forEach((option, optionIndex) => {
          option.selected = sourceNode.selectedIndex === optionIndex;
        });
      }
    });
  }

  async function captureDesktopSnapshot() {
    const desktop = document.getElementById('desktop');
    if (!desktop || !isElementVisible(desktop)) return null;

    const rect = desktop.getBoundingClientRect();
    const width = Math.max(320, Math.round(rect.width));
    const height = Math.max(220, Math.round(rect.height));
    const clone = desktop.cloneNode(true);
    clone.querySelectorAll('.window').forEach((windowEl) => {
      const title = windowEl.querySelector('.window-title-text')?.textContent || '';
      if (/AI Agent/i.test(title)) windowEl.remove();
    });
    clone.querySelectorAll('.taskbar-app').forEach((taskbarEl) => {
      const text = taskbarEl.textContent || '';
      if (/AI Agent/i.test(text)) taskbarEl.remove();
    });
    prepareSnapshotClone(clone, desktop);
    const styleText = getSnapshotStyleText();

    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
        <foreignObject x="0" y="0" width="100%" height="100%">
          <div xmlns="http://www.w3.org/1999/xhtml" style="width:${width}px;height:${height}px;overflow:hidden;background:#1f5fbf;">
            <style>${styleText}</style>
            ${clone.outerHTML}
          </div>
        </foreignObject>
      </svg>`;

    const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    return await new Promise((resolve) => {
      const image = new Image();
      image.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const scale = Math.min(1, 1100 / width);
          canvas.width = Math.max(320, Math.round(width * scale));
          canvas.height = Math.max(220, Math.round(height * scale));
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#1f5fbf';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.86));
        } catch (error) {
          console.error('Snapshot capture failed:', error);
          resolve(null);
        }
      };
      image.onerror = () => resolve(null);
      image.src = svgUrl;
    });
  }

  function getAgentDesktopState() {
    const windows = getWindowRecords();
    const desktopApps = Array.from(document.querySelectorAll('.desktop-icon[data-app]'))
      .map((el) => `${el.dataset.app}:${el.querySelector('span')?.textContent || el.dataset.app}`)
      .join(', ');
    const homeTree = buildTree(getNode('/home/user'), '').trim().split('\n').slice(0, 28).join('\n') || '(empty)';
    const windowLines = windows.length
      ? windows.map((record) => {
        const flags = `${record.isActive ? 'active' : 'background'}${record.isMinimized ? ', minimized' : ''}`;
        const detail = record.detail ? ` | ${record.detail}` : '';
        return `- ${record.title} [${flags}] @ (${record.left}, ${record.top}) | controls: ${getWindowCapabilities(record.title)}${detail}`;
      }).join('\n')
      : '(none)';

    // Extra context: open file contents and terminal history
    const extraContext = [];
    windows.forEach((record) => {
      const el = record.element;
      if (/Text Editor|Notepad/i.test(record.title)) {
        const ta = el.querySelector('.notepad-textarea');
        const path = el.querySelector('.status-section')?.textContent?.trim() || 'unsaved';
        if (ta) extraContext.push(`[Notepad content at "${path}"]:\n${ta.value.slice(0, 600)}${ta.value.length > 600 ? '\n...(truncated)' : ''}`);
      }
      if (/Code Studio/i.test(record.title)) {
        const editor = el.querySelector('#cs-code-input');
        const tab = el.querySelector('.cs-tab.active .cs-tab-name')?.textContent || 'unknown';
        if (editor) extraContext.push(`[Code Studio, active file "${tab}"]:\n${editor.value.slice(0, 600)}${editor.value.length > 600 ? '\n...(truncated)' : ''}`);
      }
      if (/Terminal|Command Prompt/i.test(record.title)) {
        const lines = Array.from(el.querySelectorAll('.terminal-output-line, pre')).slice(-12).map(l => l.textContent.trim()).filter(Boolean);
        if (lines.length) extraContext.push(`[Terminal recent output]:\n${lines.join('\n').slice(0, 400)}`);
      }
      if (/Web Browser/i.test(record.title)) {
        const url = el.querySelector('.ie-addr-input')?.value || 'about:blank';
        extraContext.push(`[Browser URL]: ${url}`);
      }
    });

    return [
      'Open windows:',
      windowLines,
      `Desktop apps: ${desktopApps}`,
      'Filesystem /home/user:',
      homeTree,
      ...(extraContext.length ? ['', 'Open content snapshots:', ...extraContext] : [])
    ].join('\n');
  }

  function openAIAgent(initialPrompt = '') {
    // Check for existing Agent window
    for (const [id, info] of Object.entries(openWindows)) {
      if (info.title === 'AI Agent') {
        setActiveWindow(id);
        if (initialPrompt) {
          const body = document.getElementById(id + '-body');
          const input = body?.querySelector('#agent-input');
          const sendBtn = body?.querySelector('#agent-send-btn');
          if (input && sendBtn) {
            input.value = initialPrompt;
            sendBtn.click();
          }
        }
        return;
      }
    }

    createWindow({
      title: 'AI Agent', width: 860, height: 620, tbIcon: '🤖',
      body: `<div class="agent-root">
        <div class="agent-sidebar">
          <div class="agent-sidebar-title">Provider</div>
          <div class="agent-provider-grid">
            <button class="agent-provider-btn" data-provider="openai">OpenAI</button>
            <button class="agent-provider-btn" data-provider="gemini">Gemini</button>
            <button class="agent-provider-btn" data-provider="claude">Claude</button>
          </div>
          <div class="agent-provider-help" id="agent-provider-help"></div>

          <label class="agent-field">
            <span>Model</span>
            <input type="text" id="agent-model-input" placeholder="gpt-4o-mini">
          </label>

          <label class="agent-field">
            <span>API Key</span>
            <input type="password" id="agent-key-input" placeholder="Paste API key">
          </label>

          <div class="agent-sidebar-actions">
            <button class="agent-btn primary" id="agent-save-config">Save</button>
            <button class="agent-btn" id="agent-clear-chat">Clear Chat</button>
          </div>

          <label class="agent-toggle">
            <input type="checkbox" id="agent-control-toggle">
            <span>Desktop control mode</span>
          </label>

          <div class="agent-note">
            Keys are stored only in this browser via local storage. This is for local testing only. Production apps should proxy AI requests through a backend instead of exposing API keys in the browser.
          </div>

          <div class="agent-state-box">
            <div class="agent-sidebar-title">Agent Status</div>
            <div class="agent-status" id="agent-status-label" style="font-size:11px; font-weight:bold; color:#000; background:#fff; border:1px solid #808080; padding:2px 4px; margin-bottom:8px; display:inline-block;">Ready</div>
            <div class="agent-sidebar-title">Debug Logs</div>
            <div id="agent-debug-log" style="font-family:monospace; font-size:10px; height:80px; overflow-y:auto; background:#fff; border:1px solid #808080; padding:4px; line-height:1.2; word-break:break-all; margin-bottom:8px; color:#000;"></div>
            <div class="agent-sidebar-title">Desktop State</div>
            <pre id="agent-state-preview"></pre>
          </div>
        </div>

        <div class="agent-main">
          <div class="agent-chat" id="agent-chat"></div>
          <div class="agent-action-log" id="agent-action-log"></div>
          <div class="agent-compose">
            <textarea id="agent-input" placeholder="Ask for help, or enable Desktop control mode and ask the agent to operate the simulator..."></textarea>
            <div class="agent-compose-actions">
              <span class="agent-status" id="agent-status">Ready</span>
              <button class="agent-btn primary" id="agent-send-btn">Send</button>
            </div>
          </div>
        </div>
      </div>`,
      status: 'Ready',
      onReady: (winId) => {
        const STORAGE = {
          provider: 'retro_agent_provider',
          openaiKey: 'retro_agent_openai_key',
          geminiKey: 'retro_agent_gemini_key',
          claudeKey: 'retro_agent_claude_key',
          openaiModel: 'retro_agent_openai_model',
          geminiModel: 'retro_agent_gemini_model',
          claudeModel: 'retro_agent_claude_model',
          desktopControl: 'retro_agent_control_mode'
        };
        const DEFAULT_MODELS = {
          openai: 'gpt-4o-mini',
          gemini: 'gemini-1.5-flash',
          claude: 'claude-haiku-4-5-20251001'
        };
        const CONTROL_RESPONSE_SCHEMA = {
          type: 'object',
          additionalProperties: false,
          required: ['reply', 'actions'],
          properties: {
            reply: { type: 'string' },
            actions: {
              type: 'array',
              maxItems: 10,
              items: {
                type: 'object',
                additionalProperties: false,
                properties: {
                  type: { type: 'string' },
                  app: { type: 'string' },
                  path: { type: 'string' },
                  url: { type: 'string' },
                  command: { type: 'string' },
                  content: { type: 'string' },
                  source_path: { type: 'string' },
                  destination_directory: { type: 'string' },
                  title: { type: 'string' },
                  target: { type: 'string' },
                  label: { type: 'string' },
                  text: { type: 'string' },
                  key: { type: 'string' },
                  action: { type: 'string' },
                  amount: { type: 'number' },
                  game: { type: 'string' },
                  append: { type: 'boolean' },
                  x: { type: 'number' },
                  y: { type: 'number' },
                  start_x: { type: 'number' },
                  start_y: { type: 'number' },
                  end_x: { type: 'number' },
                  end_y: { type: 'number' },
                  ms: { type: 'number' }
                },
                required: ['type']
              }
            }
          }
        };
        const PROVIDER_HELP = {
          openai: 'Use an API key from the OpenAI API platform.',
          gemini: 'Use an API key from Google AI Studio.',
          claude: 'Use an API key from console.anthropic.com. Models: claude-haiku-4-5-20251001, claude-sonnet-4-6, claude-opus-4-6.'
        };
        const body = document.getElementById(winId + '-body');
        const refs = {
          providerButtons: Array.from(body.querySelectorAll('.agent-provider-btn')),
          providerHelp: body.querySelector('#agent-provider-help'),
          modelInput: body.querySelector('#agent-model-input'),
          keyInput: body.querySelector('#agent-key-input'),
          saveConfig: body.querySelector('#agent-save-config'),
          clearChat: body.querySelector('#agent-clear-chat'),
          controlToggle: body.querySelector('#agent-control-toggle'),
          statePreview: body.querySelector('#agent-state-preview'),
          chat: body.querySelector('#agent-chat'),
          actionLog: body.querySelector('#agent-action-log'),
          input: body.querySelector('#agent-input'),
          sendBtn: body.querySelector('#agent-send-btn'),
          status: body.querySelector('#agent-status'),
          statusLabel: body.querySelector('#agent-status-label'),
          debugLog: body.querySelector('#agent-debug-log')
        };
        const state = {
          provider: localStorage.getItem(STORAGE.provider) || 'openai',
          conversation: [],
          busy: false
        };

        function getStoredKey(provider) {
          if (provider === 'openai') return localStorage.getItem(STORAGE.openaiKey) || '';
          if (provider === 'claude') return localStorage.getItem(STORAGE.claudeKey) || '';
          return localStorage.getItem(STORAGE.geminiKey) || '';
        }

        function getStoredModel(provider) {
          if (provider === 'openai') return localStorage.getItem(STORAGE.openaiModel) || DEFAULT_MODELS.openai;
          if (provider === 'claude') return localStorage.getItem(STORAGE.claudeModel) || DEFAULT_MODELS.claude;
          return localStorage.getItem(STORAGE.geminiModel) || DEFAULT_MODELS.gemini;
        }

        function setStatus(text) {
          if (refs.status) refs.status.textContent = text;
          if (refs.statusLabel) refs.statusLabel.textContent = text;
        }

        function appendDebugLog(msg) {
          if (!refs.debugLog) return;
          const entry = document.createElement('div');
          entry.style.borderBottom = '1px solid #d4d0c8';
          entry.style.padding = '1px 0';
          entry.style.fontSize = '10px';
          entry.style.color = '#000';
          entry.textContent = `[${new Date().toLocaleTimeString().split(' ')[0]}] ${msg}`;
          refs.debugLog.prepend(entry);
        }

        function appendActionLog(text) {
          const entry = document.createElement('div');
          entry.className = 'agent-action-entry';
          entry.textContent = text;
          refs.actionLog.appendChild(entry);
          refs.actionLog.scrollTop = refs.actionLog.scrollHeight;
        }

        function appendMessage(role, text, persist = true) {
          if (persist) state.conversation.push({ role, content: text });
          const bubble = document.createElement('div');
          bubble.className = `agent-msg ${role}`;
          bubble.innerHTML = `<div class="agent-msg-role">${role === 'user' ? 'You' : 'Agent'}</div><div class="agent-msg-body"></div>`;
          bubble.querySelector('.agent-msg-body').textContent = text;
          refs.chat.appendChild(bubble);
          refs.chat.scrollTop = refs.chat.scrollHeight;
        }

        function renderProviderUI() {
          refs.providerButtons.forEach((button) => {
            button.classList.toggle('active', button.dataset.provider === state.provider);
          });
          refs.providerHelp.textContent = PROVIDER_HELP[state.provider];
          refs.modelInput.value = getStoredModel(state.provider);
          refs.keyInput.value = getStoredKey(state.provider);
          refs.modelInput.placeholder = DEFAULT_MODELS[state.provider];
          refs.keyInput.placeholder = state.provider === 'openai' ? 'sk-...' : state.provider === 'claude' ? 'sk-ant-...' : 'AIza...';
        }

        function renderDesktopState() {
          refs.statePreview.textContent = getAgentDesktopState();
        }

        function parseAgentEnvelope(text) {
          if (!text) return { reply: 'Error: Empty response.', actions: [] };
          appendDebugLog(`Raw Response Length: ${text.length} chars`);

          let clean = text.trim();
          // Remove Markdown code fences if present
          clean = clean.replace(/^```(?:json)?\s*/i, '').replace(/```$/, '').trim();

          const firstBrace = clean.indexOf('{');
          const lastBrace = clean.lastIndexOf('}');

          if (firstBrace !== -1 && lastBrace > firstBrace) {
            const jsonPart = clean.slice(firstBrace, lastBrace + 1);
            try {
              const parsed = JSON.parse(jsonPart);
              return {
                reply: parsed.reply || parsed.explanation || parsed.message || (clean.slice(0, firstBrace).trim() || 'Processing...'),
                actions: Array.isArray(parsed.actions) ? parsed.actions : []
              };
            } catch (err) {
              appendDebugLog(`JSON Parse Error: ${err.message}`);
            }
          }

          // If no JSON found, treat the whole thing as a reply with no actions
          return { reply: text, actions: [] };
        }

        async function callOpenAI(messages, systemPrompt, expectJson = false, visionContext = null) {
          const apiKey = getStoredKey('openai');
          const model = refs.modelInput.value.trim() || DEFAULT_MODELS.openai;

          const openaiMessages = messages.map((m) => ({
            role: m.role || 'user',
            content: m.content
          }));

          if (systemPrompt) {
            const systemRole = (model.includes('o1') || model.includes('o3')) ? 'developer' : 'system';
            openaiMessages.unshift({ role: systemRole, content: systemPrompt });
          }

          if (visionContext) {
            const visionContent = [{ type: 'text', text: visionContext.text }];
            if (visionContext.imageUrl) {
              visionContent.push({ type: 'image_url', image_url: { url: visionContext.imageUrl } });
            }
            openaiMessages.push({ role: 'user', content: visionContent });
          }

          const payload = {
            model,
            messages: openaiMessages,
            ...(expectJson ? { response_format: { type: 'json_object' } } : {})
          };

          // Use appropriate token limit parameter based on model family
          if (model.includes('o1') || model.includes('o3')) {
            payload.max_completion_tokens = 2000;
          } else {
            payload.max_tokens = 2000;
          }

          async function send(body) {
            const endpoint = 'https://api.openai.com/v1/chat/completions';
            const response = await fetch(endpoint, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`
              },
              body: JSON.stringify(body)
            });

            if (!response.ok) {
              const data = await response.json().catch(() => ({}));
              const msg = data.error?.message || `HTTP ${response.status}`;
              if (response.status === 401) throw new Error('Invalid API Key. Check your settings.');
              if (response.status === 404) throw new Error(`Model "${model}" not found. Try gpt-4o-mini.`);
              if (response.status === 429) throw new Error('Rate limit exceeded. Wait a moment and try again.');
              throw new Error(msg);
            }

            const data = await response.json();
            return data.choices?.[0]?.message?.content?.trim() || '';
          }

          return await send(payload).catch((err) => {
            console.error('OpenAI API Error:', err);
            throw err;
          });
        }

        async function callGemini(messages, systemPrompt, expectJson = false, visionContext = null) {
          const apiKey = getStoredKey('gemini');
          const model = refs.modelInput.value.trim() || DEFAULT_MODELS.gemini;
          const contents = messages.map((message) => ({
            role: message.role === 'assistant' ? 'model' : 'user',
            parts: Array.isArray(message.content)
              ? message.content
              : [{ text: message.content }]
          }));
          if (visionContext) {
            const parts = [{ text: visionContext.text }];
            if (visionContext.base64Data) {
              parts.push({
                inlineData: {
                  mimeType: visionContext.mimeType || 'image/jpeg',
                  data: visionContext.base64Data
                }
              });
            }
            contents.push({ role: 'user', parts });
          }
          async function send() {
            const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': apiKey
              },
              body: JSON.stringify({
                system_instruction: { parts: [{ text: systemPrompt }] },
                contents,
                generationConfig: {
                  temperature: 0.5,
                  ...(expectJson ? {
                    responseMimeType: 'application/json',
                    responseJsonSchema: CONTROL_RESPONSE_SCHEMA
                  } : {})
                }
              })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error?.message || 'Gemini request failed.');
            const text = ((data.candidates || [])[0]?.content?.parts || []).map((part) => part.text || '').join('').trim();
            if (text) return text;
            throw new Error(data.promptFeedback?.blockReason || data.candidates?.[0]?.finishReason || 'Gemini returned no text.');
          }
          return await send().catch((err) => {
            console.error('Gemini API Error:', err);
            throw err;
          });
        }

        async function callClaude(messages, systemPrompt, expectJson = false) {
          const apiKey = getStoredKey('claude');
          const model = refs.modelInput.value.trim() || DEFAULT_MODELS.claude;
          const claudeMessages = messages.map((m) => ({
            role: m.role === 'assistant' ? 'assistant' : 'user',
            content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content)
          }));
          // Claude requires alternating user/assistant. Merge consecutive same-role messages.
          const merged = [];
          for (const msg of claudeMessages) {
            if (merged.length && merged[merged.length - 1].role === msg.role) {
              merged[merged.length - 1].content += '\n\n' + msg.content;
            } else {
              merged.push({ ...msg });
            }
          }
          // Ensure first message is user
          if (merged.length && merged[0].role !== 'user') merged.unshift({ role: 'user', content: '(start)' });

          const payload = {
            model,
            max_tokens: 2000,
            system: systemPrompt || '',
            messages: merged,
            ...(expectJson ? { temperature: 0.3 } : { temperature: 0.7 })
          };
          const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': apiKey,
              'anthropic-version': '2023-06-01',
              'anthropic-dangerous-direct-browser-access': 'true'
            },
            body: JSON.stringify(payload)
          });
          const data = await response.json();
          if (!response.ok) {
            const msg = data.error?.message || `HTTP ${response.status}`;
            if (response.status === 401) throw new Error('Invalid Claude API Key. Check your settings.');
            if (response.status === 404) throw new Error(`Claude model "${model}" not found.`);
            if (response.status === 429) throw new Error('Claude rate limit exceeded. Wait a moment.');
            throw new Error(msg);
          }
          return data.content?.find((b) => b.type === 'text')?.text?.trim() || '';
        }

        function callAI(messages, systemPrompt, expectJson = false, visionContext = null) {
          if (state.provider === 'openai') return callOpenAI(messages, systemPrompt, expectJson, visionContext);
          if (state.provider === 'claude') return callClaude(messages, systemPrompt, expectJson);
          return callGemini(messages, systemPrompt, expectJson, visionContext);
        }

        async function repairControlEnvelope(rawText) {
          const repairMessages = [{
            role: 'user',
            content: `Convert the following response into valid JSON with keys "reply" and "actions" only. Keep actions as an array. If no actions are possible, use an empty array.\n\n${rawText}`
          }];
          const repairPrompt = 'Return only valid JSON. No markdown fences. No explanation.';
          const repairedText = await callAI(repairMessages, repairPrompt, true);
          return parseAgentEnvelope(repairedText);
        }

        async function getControlEnvelope(messages, systemPrompt) {
          const imageUrl = await captureDesktopSnapshot();
          const visionContext = {
            imageUrl,
            mimeType: 'image/jpeg',
            base64Data: imageUrl && imageUrl.includes(',') ? imageUrl.split(',')[1] : '',
            text: [
              'Rendered screen context for the current simulator state.',
              'The screenshot is authoritative for what is visibly on screen.',
              'Use this UI map to find visible labels and positions:',
              getAgentUIScreenMap()
            ].join('\n')
          };
          const responseText = await callAI(messages, systemPrompt, true, visionContext);
          let envelope = parseAgentEnvelope(responseText);
          if (!envelope.actions.length && envelope.reply === responseText && responseText.trim() && !responseText.trim().startsWith('{')) {
            appendActionLog('Repairing malformed control response...');
            envelope = await repairControlEnvelope(responseText);
          }
          return envelope;
        }

        function getActionTarget(app) {
          return document.querySelector(`.desktop-icon[data-app="${app}"]`)
            || document.querySelector(`.start-menu-item[data-app="${app}"]`)
            || document.querySelector(`.start-menu-item-right[data-app="${app}"]`);
        }

        async function focusWindow(title = 'active') {
          const record = findWindowRecord(title);
          if (!record) return null;
          if (record.element.classList.contains('minimized')) record.element.classList.remove('minimized');
          await animateAgentToElement(record.element.querySelector('.window-titlebar') || record.element);
          setActiveWindow(record.id);
          return findWindowRecord(record.title);
        }

        function getWindowCandidates(title = 'active') {
          const normalized = String(title || '').trim().toLowerCase();
          if (normalized && normalized !== 'active') {
            const match = findWindowRecord(title);
            return match ? [match] : [];
          }
          return getWindowRecords();
        }

        function resolveTextTarget(target, title = 'active') {
          const normalized = String(target || '').trim().toLowerCase();
          for (const record of getWindowCandidates(title)) {
            const element = record?.element;
            if (!element) continue;
            const targetEl = normalized === 'terminal' || normalized === 'active_terminal'
              ? element.querySelector('.terminal-input:last-of-type')
              : normalized === 'notepad' || normalized === 'active_notepad'
                ? element.querySelector('.notepad-textarea')
                : normalized === 'browser_address' || normalized === 'active_browser_address'
                  ? element.querySelector('.ie-addr-input')
                  : normalized === 'ide_editor' || normalized === 'active_ide_editor'
                    ? element.querySelector('#cs-code-input')
                    : normalized === 'agent_input' || normalized === 'active_agent_input'
                      ? element.querySelector('#agent-input')
                      : null;
            if (targetEl) return { record, element: targetEl };
          }
          return null;
        }

        function resolveButtonTarget(target, title = 'active') {
          const normalized = String(target || '').trim().toLowerCase();
          for (const record of getWindowCandidates(title)) {
            const element = record?.element;
            if (!element) continue;
            const targetEl = normalized === 'browser_go'
              ? element.querySelector('.ie-go-btn')
              : normalized === 'browser_back'
                ? element.querySelector('.ie-nav-btn[data-action="back"]')
                : normalized === 'browser_forward'
                  ? element.querySelector('.ie-nav-btn[data-action="forward"]')
                  : normalized === 'browser_refresh'
                    ? element.querySelector('.ie-nav-btn[data-action="refresh"]')
                    : normalized === 'browser_home'
                      ? element.querySelector('.ie-nav-btn[data-action="home"]')
                      : normalized === 'browser_external'
                        ? element.querySelector('.ie-nav-btn[data-action="external"]')
                        : normalized === 'notepad_save'
                          ? element.querySelector('.np-save-btn')
                          : normalized === 'ide_save'
                            ? element.querySelector('#cs-save-btn')
                            : normalized === 'ide_run'
                              ? element.querySelector('#cs-run-btn')
                              : normalized === 'agent_send'
                                ? element.querySelector('#agent-send-btn')
                                : normalized === 'settings_sound_toggle'
                                  ? element.querySelector('#toggle-sound')
                                  : null;
            if (targetEl) return { record, element: targetEl };
          }
          return null;
        }

        function getClickableRoots(title = 'active') {
          const normalized = String(title || '').trim().toLowerCase();
          if (normalized === 'desktop') {
            return [{ title: 'Desktop', element: document.getElementById('desktop') }];
          }
          const roots = getWindowCandidates(title).filter((record) => !/AI Agent/i.test(record.title || ''));
          const desktopRoot = document.getElementById('desktop');
          if (desktopRoot) roots.push({ title: 'Desktop', element: desktopRoot });
          return roots;
        }

        function findClickableByLabel(label, title = 'active') {
          const normalizedLabel = String(label || '').trim().toLowerCase();
          if (!normalizedLabel) return null;
          const selector = [
            'button',
            '.desktop-icon',
            '.taskbar-app',
            '.start-menu-item',
            '.start-menu-item-right',
            '.explorer-item',
            '.explorer-sidebar-item',
            '.cs-action-btn',
            '.cs-picker-row',
            '.cs-ft-row',
            '.window-btn',
            '.ie-nav-btn',
            '.ie-go-btn',
            '.np-save-btn',
            '.ctx-item'
          ].join(',');
          const matches = [];
          getClickableRoots(title).forEach((record) => {
            if (!record?.element) return;
            record.element.querySelectorAll(selector).forEach((element) => {
              if (!isElementVisible(element)) return;
              const text = extractElementLabel(element).toLowerCase();
              if (!text) return;
              const exact = text === normalizedLabel;
              const starts = text.startsWith(normalizedLabel);
              const includes = text.includes(normalizedLabel);
              if (!exact && !starts && !includes) return;
              matches.push({
                record,
                element,
                rank: exact ? 0 : starts ? 1 : 2,
                text
              });
            });
          });
          matches.sort((a, b) => a.rank - b.rank || a.text.length - b.text.length);
          return matches[0] || null;
        }

        async function openWorkspaceInIDE(path) {
          const desiredPath = getNearestExistingDirectory(path || '/home/user');
          let record = findWindowRecord('Code Studio');
          if (!record) {
            await animateAgentToElement(getActionTarget('ide'));
            openApp('ide');
            await sleep(260);
            record = findWindowRecord('Code Studio');
          }
          if (!record) return `open_workspace failed: Code Studio not available`;
          await focusWindow(record.title);

          const panel = record.element;
          const picker = panel.querySelector('#cs-folder-picker');
          const openFolderButton = panel.querySelector('#cs-open-folder-top') || panel.querySelector('#cs-open-folder-btn');
          if (!picker || !openFolderButton) return 'open_workspace failed: Code Studio picker unavailable';

          if (picker.style.display === 'none' || !picker.style.display) {
            await animateAgentToElement(openFolderButton);
            openFolderButton.click();
            await sleep(120);
          }

          const rootButton = picker.querySelector('#cs-picker-root');
          if (!rootButton) return 'open_workspace failed: picker root button unavailable';
          await animateAgentToElement(rootButton);
          rootButton.click();
          await sleep(100);

          let currentPath = '/';
          const segments = desiredPath.split('/').filter(Boolean);
          for (const segment of segments) {
            const nextPath = joinPath(currentPath, segment);
            const row = Array.from(picker.querySelectorAll('.cs-picker-row')).find((item) => item.dataset.path === nextPath);
            if (!row) return `open_workspace failed: could not navigate to ${nextPath}`;
            await animateAgentToElement(row);
            row.click();
            await sleep(110);
            currentPath = nextPath;
          }

          const openButton = picker.querySelector('#cs-picker-open');
          if (!openButton) return 'open_workspace failed: picker open button unavailable';
          await animateAgentToElement(openButton);
          openButton.click();
          await sleep(220);
          return `Opened workspace: ${desiredPath}`;
        }

        async function openTreeItemInIDE(path) {
          const fullPath = normalizePath(path || '');
          const node = getNode(fullPath);
          if (node === undefined) return `open_tree_item failed: ${fullPath} not found`;
          const workspacePath = isDirectory(node) ? fullPath : getParentAndName(fullPath).parentPath;
          const workspaceResult = await openWorkspaceInIDE(workspacePath);
          if (workspaceResult.startsWith('open_workspace failed')) return workspaceResult.replace('open_workspace', 'open_tree_item');
          const record = findWindowRecord('Code Studio');
          if (!record) return 'open_tree_item failed: Code Studio not found';
          const row = Array.from(record.element.querySelectorAll('.cs-ft-row')).find((item) => item.dataset.path === fullPath);
          if (!row) return `open_tree_item failed: ${fullPath} is not visible in the tree`;
          await focusWindow(record.title);
          await animateAgentToElement(row);
          row.click();
          await sleep(140);
          return `Opened in Code Studio: ${fullPath}`;
        }

        async function executeAction(action) {
          const type = String(action?.type || '').trim();
          if (!type) return 'Skipped invalid action.';

          if (type === 'open_app') {
            const app = String(action.app || '').toLowerCase();
            if (!app) return 'open_app failed: missing app.';
            await animateAgentToElement(getActionTarget(app));
            openApp(app);
            return `Opened app: ${app}`;
          }

          if (type === 'open_folder') {
            const path = normalizePath(action.path || '/home/user');
            if (!isDirectory(getNode(path))) return `open_folder failed: ${path} not found.`;
            await animateAgentToElement(getActionTarget('files'));
            openFileExplorer(path);
            return `Opened folder: ${path}`;
          }

          if (type === 'open_url') {
            const url = String(action.url || '').trim();
            if (!url) return 'open_url failed: missing url.';
            await animateAgentToElement(getActionTarget('internet'));
            openInternet(url);
            return `Opened URL: ${url}`;
          }

          if (type === 'launch_terminal') {
            const command = String(action.command || '').trim();
            await animateAgentToElement(getActionTarget('terminal'));
            openTerminal(command);
            return command ? `Opened terminal and ran: ${command}` : 'Opened terminal';
          }

          if (type === 'open_path') {
            const path = normalizePath(action.path || '');
            const node = getNode(path);
            if (node === undefined) return `open_path failed: ${path} not found`;
            await animateAgentToElement(getActionTarget('files'));
            if (isDirectory(node)) {
              openFileExplorer(path);
              return `Opened folder: ${path}`;
            }
            if (typeof node === 'string') {
              openNotepadWith(getBaseName(path), path, node);
              return `Opened file: ${path}`;
            }
            return `open_path failed: unsupported node at ${path}`;
          }

          if (type === 'create_folder') {
            const path = normalizePath(action.path || '');
            const { parent, name } = getParentAndName(path);
            await animateAgentToElement(getActionTarget('files'), false);
            if (!isDirectory(parent) || !isValidNodeName(name)) return `create_folder failed: invalid path ${path}`;
            if (!setNode(path, {}, { overwrite: false })) return `create_folder failed: ${path} already exists`;
            return `Created folder: ${path}`;
          }

          if (type === 'create_file') {
            const path = normalizePath(action.path || '');
            const content = typeof action.content === 'string' ? action.content : '';
            const { parent, name } = getParentAndName(path);
            await animateAgentToElement(getActionTarget('files'), false);
            if (!isDirectory(parent) || !isValidNodeName(name)) return `create_file failed: invalid path ${path}`;
            if (!setNode(path, content, { overwrite: false })) return `create_file failed: ${path} already exists`;
            return `Created file: ${path}`;
          }

          if (type === 'write_file') {
            const path = normalizePath(action.path || '');
            const content = typeof action.content === 'string' ? action.content : '';
            const { parent, name } = getParentAndName(path);
            await animateAgentToElement(getActionTarget('files'), false);
            if (!isDirectory(parent) || !isValidNodeName(name)) return `write_file failed: invalid path ${path}`;
            if (!setNode(path, content)) return `write_file failed: could not write ${path}`;
            return `Wrote file: ${path}`;
          }

          if (type === 'move_item') {
            const sourcePath = normalizePath(action.source_path || '');
            const destinationDirectory = normalizePath(action.destination_directory || '');
            await animateAgentToElement(getActionTarget('files'), false);
            if (!getNode(sourcePath)) return `move_item failed: ${sourcePath} not found`;
            if (!isDirectory(getNode(destinationDirectory))) return `move_item failed: ${destinationDirectory} not found`;
            if (!moveNodeIntoDirectory(sourcePath, destinationDirectory)) return `move_item failed: could not move ${sourcePath}`;
            return `Moved ${sourcePath} into ${destinationDirectory}`;
          }

          if (type === 'focus_window') {
            const title = String(action.title || 'active').trim();
            const record = await focusWindow(title);
            return record ? `Focused window: ${record.title}` : `focus_window failed: ${title} not found`;
          }

          if (type === 'close_window' || type === 'minimize_window' || type === 'maximize_window') {
            const title = String(action.title || 'active').trim();
            const record = await focusWindow(title);
            if (!record) return `${type} failed: ${title} not found`;
            const controlName = type === 'close_window' ? 'close' : type === 'minimize_window' ? 'minimize' : 'maximize';
            const button = record.element.querySelector(`.window-btn.${controlName}`);
            if (!button) return `${type} failed: control missing on ${record.title}`;
            await animateAgentToElement(button);
            if (type === 'close_window') closeWindow(record.id);
            if (type === 'minimize_window') minimizeWindow(record.id);
            if (type === 'maximize_window') maximizeWindow(record.id);
            return `${type.replace('_', ' ')}: ${record.title}`;
          }

          if (type === 'move_window') {
            const title = String(action.title || 'active').trim();
            const x = Number(action.x);
            const y = Number(action.y);
            const record = await focusWindow(title);
            if (!record) return `move_window failed: ${title} not found`;
            if (!Number.isFinite(x) || !Number.isFinite(y)) return 'move_window failed: x and y are required numbers';
            if (openWindows[record.id]?.maximized) maximizeWindow(record.id);
            await animateAgentToElement(record.element.querySelector('.window-titlebar') || record.element);
            record.element.style.left = `${Math.max(0, x)}px`;
            record.element.style.top = `${Math.max(0, y)}px`;
            return `Moved window ${record.title} to (${Math.max(0, x)}, ${Math.max(0, y)})`;
          }

          if (type === 'type_text') {
            const target = String(action.target || '').trim();
            const text = typeof action.text === 'string' ? action.text : (typeof action.content === 'string' ? action.content : '');
            const append = Boolean(action.append);
            if (!target) return 'type_text failed: missing target';
            const title = String(action.title || 'active').trim();
            const resolved = resolveTextTarget(target, title);
            if (!resolved) return `type_text failed: target ${target} not found`;
            if (/AI Agent/i.test(resolved.record.title || '')) return 'type_text failed: AI Agent self-control is disabled';
            await focusWindow(resolved.record.title);
            await animateAgentToElement(resolved.element);
            resolved.element.focus();
            resolved.element.value = append ? `${resolved.element.value}${text}` : text;
            resolved.element.dispatchEvent(new Event('input', { bubbles: true }));
            resolved.element.dispatchEvent(new Event('change', { bubbles: true }));
            return `Typed into ${target} on ${resolved.record.title}`;
          }

          if (type === 'submit') {
            const target = String(action.target || '').trim();
            const title = String(action.title || 'active').trim();
            if (target === 'terminal' || target === 'active_terminal') {
              const resolvedInput = resolveTextTarget(target, title);
              if (!resolvedInput) return 'submit failed: terminal target missing';
              if (/AI Agent/i.test(resolvedInput.record.title || '')) return 'submit failed: AI Agent self-control is disabled';
              await focusWindow(resolvedInput.record.title);
              await animateAgentToElement(resolvedInput.element);
              resolvedInput.element.focus();
              resolvedInput.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
              return `Submitted terminal command in ${resolvedInput.record.title}`;
            }
            const resolvedButton = resolveButtonTarget(target === 'browser_address' ? 'browser_go' : target, title)
              || resolveButtonTarget(`browser_${target}`, title);
            if (!resolvedButton) return `submit failed: ${target} button not found`;
            if (/AI Agent/i.test(resolvedButton.record.title || '')) return 'submit failed: AI Agent self-control is disabled';
            await focusWindow(resolvedButton.record.title);
            await animateAgentToElement(resolvedButton.element);
            resolvedButton.element.click();
            return `Submitted ${target} in ${resolvedButton.record.title}`;
          }

          if (type === 'press_button') {
            const target = String(action.target || '').trim();
            const title = String(action.title || 'active').trim();
            const resolved = resolveButtonTarget(target, title);
            if (!resolved) return `press_button failed: ${target} not found`;
            if (/AI Agent/i.test(resolved.record.title || '')) return 'press_button failed: AI Agent self-control is disabled';
            await focusWindow(resolved.record.title);
            await animateAgentToElement(resolved.element);
            resolved.element.click();
            return `Pressed ${target} in ${resolved.record.title}`;
          }

          if (type === 'browser_nav') {
            const actionName = String(action.action || '').trim().toLowerCase();
            const title = String(action.title || 'active').trim();
            const resolved = resolveButtonTarget(`browser_${actionName}`, title);
            if (!resolved) return `browser_nav failed: ${actionName} unavailable`;
            await focusWindow(resolved.record.title);
            await animateAgentToElement(resolved.element);
            resolved.element.click();
            return `Browser action ${actionName} in ${resolved.record.title}`;
          }

          if (type === 'wait') {
            const ms = Math.max(0, Math.min(4000, Number(action.ms) || 300));
            await sleep(ms);
            return `Waited ${ms}ms`;
          }

          if (type === 'click_label' || type === 'double_click_label') {
            const label = String(action.label || action.target || action.text || '').trim();
            const title = String(action.title || 'active').trim();
            if (!label) return `${type} failed: missing label`;
            const resolved = findClickableByLabel(label, title);
            if (!resolved) return `${type} failed: "${label}" not found`;
            if (/AI Agent/i.test(resolved.record?.title || '')) return `${type} failed: AI Agent self-control is disabled`;
            if (resolved.record?.title && resolved.record.title !== 'Desktop') {
              await focusWindow(resolved.record.title);
            }
            await animateAgentToElement(resolved.element);
            resolved.element.click();
            if (type === 'double_click_label') {
              resolved.element.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
            }
            return `${type.replace('_', ' ')}: ${label}`;
          }

          if (type === 'run_command') {
            // Convenience: open terminal (if needed), type command, and submit — all in one action
            const command = String(action.command || '').trim();
            if (!command) return 'run_command failed: missing command';
            let record = findWindowRecord('Terminal');
            if (!record || record.isMinimized) {
              await animateAgentToElement(getActionTarget('terminal'));
              openTerminal(command);
              return `Ran terminal command: ${command}`;
            }
            await focusWindow(record.title);
            const inputEl = record.element.querySelector('.terminal-input:last-of-type');
            if (!inputEl) return 'run_command failed: terminal input not found';
            await animateAgentToElement(inputEl);
            inputEl.focus();
            inputEl.value = command;
            inputEl.dispatchEvent(new Event('input', { bubbles: true }));
            inputEl.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
            return `Ran command: ${command}`;
          }

          if (type === 'open_game') {
            const game = String(action.app || action.game || '').toLowerCase().trim();
            const gameMap = { snake: 'snake', tetris: 'tetris', '2048': 'game2048', minesweeper: 'minesweeper', mine: 'minesweeper' };
            const appKey = gameMap[game];
            if (!appKey) return `open_game failed: unknown game "${game}". Available: snake, tetris, 2048, minesweeper`;
            await animateAgentToElement(getActionTarget(appKey));
            openApp(appKey);
            return `Opened game: ${game}`;
          }

          if (type === 'open_workspace') {
            return openWorkspaceInIDE(action.path || '/home/user');
          }

          if (type === 'open_tree_item') {
            return openTreeItemInIDE(action.path || '');
          }

          if (type === 'read_file') {
            const path = normalizePath(action.path || '');
            const node = getNode(path);
            if (node === undefined) return `read_file failed: ${path} not found`;
            if (typeof node !== 'string') return `read_file failed: ${path} is a directory, not a file`;
            return `File "${path}" contents:\n${node.slice(0, 1200)}${node.length > 1200 ? '\n...(truncated)' : ''}`;
          }

          if (type === 'append_file') {
            const path = normalizePath(action.path || '');
            const content = typeof action.content === 'string' ? action.content : '';
            const existing = getNode(path);
            if (existing === undefined) return `append_file failed: ${path} not found`;
            if (typeof existing !== 'string') return `append_file failed: ${path} is a directory`;
            if (!setNode(path, existing + content)) return `append_file failed: could not write ${path}`;
            return `Appended to file: ${path}`;
          }

          if (type === 'scroll_window') {
            const title = String(action.title || 'active').trim();
            const record = findWindowRecord(title);
            if (!record) return `scroll_window failed: ${title} not found`;
            const amount = Number(action.y || action.amount || 200);
            const scrollTarget = record.element.querySelector('.agent-chat, .terminal-output, .file-list, .ie-body, .notepad-textarea, .cs-editor-area, .window-body')
              || record.element.querySelector('.window-body')
              || record.element;
            scrollTarget.scrollTop += amount;
            return `Scrolled ${title} by ${amount}px`;
          }

          // New Actions: press_key, drag_mouse
          if (type === 'press_key') {
            const target = String(action.target || '').trim();
            const key = String(action.key || '').trim();
            const titleCtx = String(action.title || 'active').trim();
            const resolved = resolveTextTarget(target, titleCtx);
            if (resolved) {
              await focusWindow(resolved.record.title);
              await animateAgentToElement(resolved.element);
              resolved.element.focus();
              resolved.element.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
              resolved.element.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
              return `Pressed key "${key}" on ${target}`;
            }
            return `press_key failed: target "${target}" not found`;
          }

          if (type === 'drag_mouse') {
            const { start_x, start_y, end_x, end_y } = action;
            const cursor = document.getElementById('agent-cursor');

            // Move to start
            await animateAgentCursorTo(start_x, start_y);
            cursor.classList.add('clicking');

            // Dispatch mousedown
            const startEl = document.elementFromPoint(start_x, start_y) || document.body;
            startEl.dispatchEvent(new MouseEvent('mousedown', { clientX: start_x, clientY: start_y, bubbles: true }));

            await sleep(100);

            // Move to end (smoothly)
            await animateAgentCursorTo(end_x, end_y, 400);
            const endEl = document.elementFromPoint(end_x, end_y) || document.body;
            endEl.dispatchEvent(new MouseEvent('mousemove', { clientX: end_x, clientY: end_y, bubbles: true }));

            await sleep(50);

            // Dispatch mouseup
            endEl.dispatchEvent(new MouseEvent('mouseup', { clientX: end_x, clientY: end_y, bubbles: true }));
            cursor.classList.remove('clicking');

            return `Dragged from ${start_x},${start_y} to ${end_x},${end_y}`;
          }

          return `Action ${type} not implemented or failed.`;
        }

        async function executeAgentActions(actions) {
          const results = [];
          for (const action of actions.slice(0, 8)) {
            const summary = await executeAction(action);
            appendActionLog(summary);
            results.push(summary);
            await sleep(180);
          }
          await sleep(200);
          hideAgentCursor();
          renderDesktopState();
          return results;
        }

        async function sendPrompt(autoPrompt = '') {
          if (state.busy) {
            state.busy = false; // This will trigger the 'break' in the controlMode while loop
            return;
          }
          const message = autoPrompt || refs.input.value.trim();
          if (!message) return;
          const apiKey = getStoredKey(state.provider);
          if (!apiKey) {
            alert(`Add your ${state.provider === 'openai' ? 'OpenAI' : 'Gemini'} API key first.`);
            return;
          }

          state.busy = true;
          refs.sendBtn.textContent = 'Stop';
          refs.sendBtn.classList.add('danger');
          appendMessage('user', message);
          refs.input.value = '';
          setStatus(state.provider === 'openai' ? 'Contacting OpenAI...' : state.provider === 'claude' ? 'Contacting Claude...' : 'Contacting Gemini...');
          renderDesktopState();

          const controlMode = refs.controlToggle.checked;
          const systemPrompt = controlMode
            ? `You are RetroLinux AI Agent — an intelligent assistant embedded in this retro Linux desktop simulator. You can read files, control apps, and complete multi-step tasks autonomously.

## OUTPUT FORMAT
Return ONLY a valid JSON object — no markdown fences, no prose outside the JSON:
{
  "reply": "Brief description of what you are doing or have done",
  "actions": [ { "type": "...", ...params } ]
}

## HOW TO REASON
Before choosing actions, mentally answer:
1. What is the current state? (check open windows, file contents in the state below)
2. What is the very next step toward the goal?
3. Do I need to read a file first before writing or editing it?
Use "read_file" to check a file's content before overwriting it. Use "wait" if an operation needs a moment to settle.

## RULES
- Return ONLY JSON. No other text.
- Max 10 actions per turn. For long tasks, do a few steps and continue next turn.
- NEVER target the "AI Agent" window — never type into your own input or click your own buttons.
- Prefer click_label / double_click_label over raw coordinate clicks.
- After launch_terminal / run_command, use a "wait" (ms:600) then observe terminal output in the next turn's state snapshot.
- To run a shell command in an already-open terminal, prefer "run_command" over type_text+submit.
- Terminal has: ls/cd/cat/mkdir/rm/cp/mv/grep/find/head/tail/wc/sort/uniq, plus git/curl/wget/apt-get/sudo/python/node/gcc, and games: snake/tetris/2048/minesweeper.
- Use read_file to verify file contents before editing.

## ACTION REFERENCE

### Apps & Navigation
- open_app       { app: computer|files|internet|terminal|notepad|calculator|paint|mediaplayer|minesweeper|snake|tetris|game2048|settings|ide }
- open_game      { app: snake|tetris|2048|minesweeper }   — open a game directly
- open_path      { path }            — opens folder in Files or file in Notepad
- open_url       { url }             — opens URL in Browser
- launch_terminal { command }        — opens Terminal and runs a command
- run_command    { command }         — types + submits a command in the active/open terminal (most efficient)
- open_workspace  { path }           — opens folder in Code Studio
- open_tree_item  { path }           — opens file in Code Studio tree

### File System
- read_file      { path }            — read file content (returned as action result)
- create_file    { path, content }   — create new file (fails if exists)
- write_file     { path, content }   — create or overwrite file
- append_file    { path, content }   — append text to existing file
- create_folder  { path }
- move_item      { source_path, destination_directory }

### Window Management
- focus_window / close_window / minimize_window / maximize_window  { title }
- move_window    { title, x, y }
- scroll_window  { title, y }        — scroll window body by y pixels (negative = up)

### Input
- type_text      { target: terminal|notepad|ide_editor|browser_address, text, title?, append? }
- submit         { target, title? }
- press_button   { target: browser_go|browser_back|browser_forward|browser_refresh|browser_home|notepad_save|ide_save|ide_run, title? }
- press_key      { target: terminal|notepad|ide_editor|browser_address, key, title? }
- click_label    { label, title? }
- double_click_label { label, title? }
- drag_mouse     { start_x, start_y, end_x, end_y }
- browser_nav    { action: back|forward|refresh|home, title? }
- wait           { ms: 0–4000 }

## CURRENT DESKTOP STATE
${getAgentDesktopState()}`
            : `You are RetroLinux AI Assistant — a helpful, concise technical assistant embedded in a retro Linux desktop simulator. Answer questions clearly. When the user asks about the simulator (apps, filesystem, terminal commands), give accurate, practical answers. Keep replies short unless detail is needed.`;

          try {
            if (controlMode) {
              let loopCount = 0;
              let pendingMessages = state.conversation.slice();
              while (loopCount < 100) {
                if (!state.busy) {
                  appendActionLog('Agent execution stopped by user.');
                  break;
                }

                setStatus(`Thinking... (step ${loopCount + 1}/100)`);
                appendDebugLog(`Requesting Control Envelope...`);
                const envelope = await getControlEnvelope(pendingMessages, systemPrompt);
                appendDebugLog(`Received: ${envelope.reply.slice(0, 30)}... [${envelope.actions.length} actions]`);

                appendMessage('assistant', envelope.reply || '(Executing actions...)');

                if (!envelope.actions || !envelope.actions.length) {
                  appendActionLog('Task completed - no further actions.');
                  break;
                }

                setStatus(`Executing ${envelope.actions.length} action(s)...`);
                const results = await executeAgentActions(envelope.actions);

                loopCount += 1;
                if (loopCount >= 100) {
                  appendActionLog('Iteration limit reached (100).');
                  break;
                }

                await sleep(500);

                const readResults = results.filter((r) => r.startsWith('File "') && r.includes('contents:'));
                const actionResults = results.filter((r) => !r.startsWith('File "'));
                const followUp = [
                  '## Action results from last turn:',
                  ...actionResults.map((r) => `- ${r}`),
                  ...(readResults.length ? ['', '## File read results:', ...readResults] : []),
                  '',
                  '## Updated desktop state:',
                  getAgentDesktopState(),
                  '',
                  'Continue toward the goal. If the task is fully complete, return an empty actions array [].'
                ].join('\n');
                pendingMessages = pendingMessages.concat([
                  { role: 'assistant', content: envelope.reply || 'Done.' },
                  { role: 'user', content: followUp }
                ]);
              }
            } else {
              const responseText = await callAI(state.conversation, systemPrompt, false);
              appendMessage('assistant', responseText || 'No response.');
            }
            setStatus('Ready');
          } catch (error) {
            const extraHint = location.protocol === 'file:' ? ' If this is running from file://, try http://localhost instead.' : '';
            appendMessage('assistant', `Request failed: ${error.message}${extraHint}`, false);
            setStatus('Error');
          } finally {
            state.busy = false;
            refs.sendBtn.textContent = 'Send';
            refs.sendBtn.classList.remove('danger');
            refs.sendBtn.disabled = false;
            refs.input.focus();
          }
        }

        refs.providerButtons.forEach((button) => {
          button.addEventListener('click', () => {
            state.provider = button.dataset.provider;
            localStorage.setItem(STORAGE.provider, state.provider);
            renderProviderUI();
          });
        });

        refs.saveConfig.addEventListener('click', () => {
          const model = refs.modelInput.value.trim() || DEFAULT_MODELS[state.provider];
          const key = refs.keyInput.value.trim();
          const modelKey = state.provider === 'openai' ? STORAGE.openaiModel : state.provider === 'claude' ? STORAGE.claudeModel : STORAGE.geminiModel;
          const apiKey = state.provider === 'openai' ? STORAGE.openaiKey : state.provider === 'claude' ? STORAGE.claudeKey : STORAGE.geminiKey;
          localStorage.setItem(modelKey, model);
          localStorage.setItem(apiKey, key);
          localStorage.setItem(STORAGE.desktopControl, refs.controlToggle.checked ? '1' : '0');
          const label = state.provider === 'openai' ? 'OpenAI' : state.provider === 'claude' ? 'Claude' : 'Gemini';
          setStatus(`${label} settings saved.`);
        });

        refs.clearChat.addEventListener('click', () => {
          state.conversation = [];
          refs.chat.innerHTML = '';
          refs.actionLog.innerHTML = '';
          setStatus('Chat cleared.');
        });

        refs.controlToggle.checked = localStorage.getItem(STORAGE.desktopControl) === '1';
        refs.controlToggle.addEventListener('change', () => {
          localStorage.setItem(STORAGE.desktopControl, refs.controlToggle.checked ? '1' : '0');
        });

        refs.sendBtn.addEventListener('click', () => sendPrompt());
        refs.input.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendPrompt();
            return;
          }
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') sendPrompt();
        });

        registerWindowCleanup(winId, subscribeToFS(renderDesktopState));
        registerWindowCleanup(winId, () => hideAgentCursor());

        renderProviderUI();
        renderDesktopState();
        appendMessage('assistant', 'Select OpenAI or Gemini, save your API key, then start chatting. Enable Desktop control mode if you want the agent to operate the simulator.', false);
        if (location.protocol === 'file:') {
          appendMessage('assistant', 'If requests fail from a local file tab, serve the project over http://localhost instead of file:// for more reliable browser networking.', false);
        }
        refs.input.focus();
        if (initialPrompt) {
          refs.input.value = initialPrompt;
          if (getStoredKey(state.provider)) sendPrompt(initialPrompt);
        }
      }
    });
  }

  // ======= INTERNET EXPLORER =======
  function openInternet(initialUrl = '') {
    createWindow({
      title: 'Web Browser', width: 920, height: 620, tbIcon: '🌐',
      menubar: '<div class="window-menubar"><span>File</span><span>Edit</span><span>View</span><span>Favorites</span><span>Tools</span><span>Help</span></div>',
      toolbar: `<div class="window-toolbar ie-toolbar">
        <button class="ie-nav-btn" data-action="back">← Back</button>
        <button class="ie-nav-btn" data-action="forward">→ Forward</button>
        <button class="ie-nav-btn" data-action="refresh">🔄 Refresh</button>
        <button class="ie-nav-btn" data-action="home">🏠 Home</button>
        <button class="ie-nav-btn" data-action="external">↗ Open External</button>
      </div>`,
      addressbar: '<div class="window-address"><label>Address</label><input class="ie-addr-input" value="https://example.com"><button class="ie-go-btn">Go</button></div>',
      body: `<div class="ie-body">
        <div class="ie-browser-start">
          <div class="ie-start-hero">
            <div class="ie-start-badge">RetroLinux Browser</div>
            <h2>Open real websites where embedding is allowed.</h2>
            <p>Major sites like Google, Gmail, YouTube, and many banks block iframe embedding for security reasons. Use <strong>Open External</strong> for those.</p>
          </div>
          <div class="ie-quick-grid">
            <button class="ie-quick-link" data-url="https://www.google.com">Google</button>
            <button class="ie-quick-link" data-url="https://en.wikipedia.org/wiki/Main_Page">Wikipedia</button>
            <button class="ie-quick-link" data-url="https://example.com">Example</button>
            <button class="ie-quick-link" data-url="https://developer.mozilla.org/">MDN</button>
            <button class="ie-quick-link" data-url="https://news.ycombinator.com">Hacker News</button>
            <button class="ie-quick-link" data-url="https://www.bbc.com">BBC</button>
          </div>
          <div class="ie-browser-tip">Tip: type a full URL like <code>https://example.com</code> or a search phrase like <code>linux commands</code>.</div>
        </div>
        <div class="ie-browser-frame-wrap" style="display:none;">
          <div class="ie-browser-note" id="ie-browser-note">
            Some sites refuse to load inside another webpage. If this tab stays blank, use <strong>Open External</strong>.
          </div>
          <iframe
            class="ie-browser-frame"
            id="ie-browser-frame"
            referrerpolicy="no-referrer"
            sandbox="allow-forms allow-modals allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"
          ></iframe>
        </div>
      </div>`,
      status: 'Ready',
      onReady: (winId) => {
        const body = document.getElementById(winId + '-body');
        const win = body.closest('.window');
        const titleEl = win.querySelector('.window-title-text');
        const statusEl = win.querySelector('.status-section');
        const addrInput = win.querySelector('.ie-addr-input');
        const goBtn = win.querySelector('.ie-go-btn');
        const frame = body.querySelector('#ie-browser-frame');
        const startView = body.querySelector('.ie-browser-start');
        const frameWrap = body.querySelector('.ie-browser-frame-wrap');
        const note = body.querySelector('#ie-browser-note');
        const history = [];
        let historyIndex = -1;
        let currentUrl = '';

        function setStatus(text) {
          if (statusEl) statusEl.textContent = text;
        }

        function showHome() {
          startView.style.display = 'flex';
          frameWrap.style.display = 'none';
          addrInput.value = '';
          currentUrl = '';
          titleEl.textContent = 'Web Browser';
          setStatus('Home');
        }

        function normalizeUrl(rawInput) {
          const input = rawInput.trim();
          if (!input) return null;
          if (/^(javascript|data|file|vbscript):/i.test(input)) return null;
          if (/\s/.test(input) && !/^https?:\/\//i.test(input)) {
            return `https://www.google.com/search?q=${encodeURIComponent(input)}`;
          }
          if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(input)) {
            return `https://${input}`;
          }
          return input;
        }

        function updateTitle(url) {
          try {
            const parsed = new URL(url);
            titleEl.textContent = `${parsed.hostname} - Web Browser`;
            note.innerHTML = /(^|\.)google\.com$/i.test(parsed.hostname)
              ? 'Google usually blocks iframe embedding. Use <strong>Open External</strong> if it does not render here.'
              : 'Some sites refuse to load inside another webpage. If this tab stays blank, use <strong>Open External</strong>.';
          } catch (err) {
            titleEl.textContent = 'Web Browser';
          }
        }

        function renderPage(url, addToHistory = true) {
          const normalized = normalizeUrl(url);
          if (!normalized) {
            alert('This browser only allows normal web URLs and search queries.');
            return;
          }

          startView.style.display = 'none';
          frameWrap.style.display = 'flex';
          addrInput.value = normalized;
          frame.src = normalized;
          currentUrl = normalized;
          updateTitle(normalized);
          setStatus(`Loading ${normalized}`);

          if (addToHistory) {
            history.splice(historyIndex + 1);
            history.push(normalized);
            historyIndex = history.length - 1;
          }
        }

        function navigateHistory(direction) {
          const nextIndex = historyIndex + direction;
          if (nextIndex < 0 || nextIndex >= history.length) return;
          historyIndex = nextIndex;
          renderPage(history[historyIndex], false);
        }

        win.querySelectorAll('.ie-nav-btn').forEach((button) => {
          button.addEventListener('click', () => {
            const action = button.dataset.action;
            if (action === 'back') navigateHistory(-1);
            if (action === 'forward') navigateHistory(1);
            if (action === 'refresh' && currentUrl) renderPage(currentUrl, false);
            if (action === 'home') showHome();
            if (action === 'external' && currentUrl) window.open(currentUrl, '_blank', 'noopener,noreferrer');
          });
        });

        goBtn.addEventListener('click', () => renderPage(addrInput.value, true));
        addrInput.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') renderPage(addrInput.value, true);
        });

        body.querySelectorAll('.ie-quick-link').forEach((button) => {
          button.addEventListener('click', () => renderPage(button.dataset.url, true));
        });

        frame.addEventListener('load', () => {
          setStatus(currentUrl ? `Loaded ${currentUrl}` : 'Ready');
        });

        showHome();
        if (initialUrl) renderPage(initialUrl, true);
      }
    });
  }

  // ======= MEDIA PLAYER =======
  function openMediaPlayer() {
    let bars = '';
    for (let i = 0; i < 12; i++) bars += '<div class="mp-bar"></div>';
    createWindow({
      title: 'Windows Media Player', width: 360, height: 340, tbIcon: '🎵',
      body: `<div class="mediaplayer-body">
        <div class="mp-visualizer">${bars}</div>
        <div class="mp-title">♪ RetroOS Theme — Unknown Artist</div>
        <div class="mp-progress"><div class="mp-progress-bar"></div></div>
        <div class="mp-controls">
          <span class="mp-btn">⏮</span><span class="mp-btn">⏪</span>
          <span class="mp-btn" style="font-size:26px;">⏸</span>
          <span class="mp-btn">⏩</span><span class="mp-btn">⏭</span>
        </div>
      </div>`,
      statusbar: false
    });
  }

  // ======= MINESWEEPER =======
  function openMinesweeper() {
    const rows = 9, cols = 9, mines = 10;
    const id = createWindow({
      title: 'Minesweeper', width: 280, height: 360, tbIcon: '💣',
      menubar: '<div class="window-menubar"><span>Game</span><span>Help</span></div>',
      body: '<div class="minesweeper-body" id="MINEBODY"></div>',
      statusbar: false,
      onReady: (winId) => {
        const body = document.getElementById(winId + '-body').querySelector('.minesweeper-body');
        body.id = winId + '-mine';
        initMinesweeper(body, rows, cols, mines);
      }
    });
  }

  function initMinesweeper(container, rows, cols, mineCount) {
    let grid = [], gameOver = false, flagCount = 0, revealed = 0;
    const total = rows * cols;

    function init() {
      grid = []; gameOver = false; flagCount = 0; revealed = 0;
      for (let r = 0; r < rows; r++) {
        grid[r] = [];
        for (let c = 0; c < cols; c++) grid[r][c] = { mine: false, revealed: false, flagged: false, count: 0 };
      }
      let placed = 0;
      while (placed < mineCount) {
        const r = Math.floor(Math.random() * rows), c = Math.floor(Math.random() * cols);
        if (!grid[r][c].mine) { grid[r][c].mine = true; placed++; }
      }
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        if (grid[r][c].mine) continue;
        let cnt = 0;
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
          const nr = r + dr, nc = c + dc;
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && grid[nr][nc].mine) cnt++;
        }
        grid[r][c].count = cnt;
      }
      render();
    }

    function render() {
      let html = `<div class="mine-header">
        <div class="mine-counter">${String(mineCount - flagCount).padStart(3, '0')}</div>
        <div class="mine-face" id="mine-reset">😊</div>
        <div class="mine-counter">000</div>
      </div>`;
      html += `<div class="mine-grid" style="grid-template-columns:repeat(${cols},24px)">`;
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        const cell = grid[r][c];
        let cls = 'mine-cell', content = '';
        if (cell.revealed) {
          cls += ' revealed';
          if (cell.mine) content = '💣';
          else if (cell.count > 0) content = `<span class="num-${cell.count}">${cell.count}</span>`;
        } else if (cell.flagged) cls += ' flagged';
        html += `<div class="${cls}" data-r="${r}" data-c="${c}">${content}</div>`;
      }
      html += '</div>';
      container.innerHTML = html;
      container.querySelector('#mine-reset').addEventListener('click', init);
      container.querySelectorAll('.mine-cell').forEach(el => {
        el.addEventListener('click', () => {
          if (gameOver) return;
          const r = +el.dataset.r, c = +el.dataset.c;
          if (grid[r][c].flagged) return;
          revealCell(r, c);
          render();
        });
        el.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          if (gameOver) return;
          const r = +el.dataset.r, c = +el.dataset.c;
          if (grid[r][c].revealed) return;
          grid[r][c].flagged = !grid[r][c].flagged;
          flagCount += grid[r][c].flagged ? 1 : -1;
          render();
        });
      });
    }

    function revealCell(r, c) {
      if (r < 0 || r >= rows || c < 0 || c >= cols) return;
      const cell = grid[r][c];
      if (cell.revealed || cell.flagged) return;
      cell.revealed = true; revealed++;
      if (cell.mine) {
        gameOver = true;
        for (let rr = 0; rr < rows; rr++) for (let cc = 0; cc < cols; cc++) if (grid[rr][cc].mine) grid[rr][cc].revealed = true;
        setTimeout(() => { const face = container.querySelector('#mine-reset'); if (face) face.textContent = '😵'; }, 50);
        return;
      }
      if (revealed === total - mineCount) {
        gameOver = true;
        setTimeout(() => { const face = container.querySelector('#mine-reset'); if (face) face.textContent = '😎'; }, 50);
      }
      if (cell.count === 0) {
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) revealCell(r + dr, c + dc);
      }
    }
    init();
  }

  // ======= SNAKE =======
  function openSnake() {
    createWindow({
      title: 'Snake', width: 440, height: 500, tbIcon: '🐍',
      menubar: '<div class="window-menubar"><span>Game</span><span>Help</span></div>',
      body: `<div style="display:flex;flex-direction:column;align-items:center;justify-content:flex-start;height:100%;background:#0a0a0a;padding:10px;gap:8px;">
        <div style="display:flex;justify-content:space-between;width:400px;align-items:center;">
          <span style="color:#4ade80;font-family:monospace;font-size:13px;">Score: <b id="snake-score">0</b></span>
          <span style="color:#facc15;font-family:monospace;font-size:13px;">Best: <b id="snake-best">0</b></span>
          <button id="snake-restart" style="background:#22c55e;color:#000;border:none;border-radius:4px;padding:4px 12px;cursor:pointer;font-size:12px;font-weight:700;">New Game</button>
        </div>
        <canvas id="snake-canvas" width="400" height="400" style="border:2px solid #22c55e;border-radius:4px;display:block;"></canvas>
        <div id="snake-msg" style="color:#facc15;font-family:monospace;font-size:12px;text-align:center;">Use arrow keys to move. Press any arrow or New Game to start.</div>
      </div>`,
      onReady: (winId) => {
        const body = document.getElementById(winId + '-body');
        const canvas = body.querySelector('#snake-canvas');
        const ctx = canvas.getContext('2d');
        const scoreEl = body.querySelector('#snake-score');
        const bestEl = body.querySelector('#snake-best');
        const msgEl = body.querySelector('#snake-msg');
        const restartBtn = body.querySelector('#snake-restart');
        const CELL = 20, COLS = 20, ROWS = 20;
        let snake, dir, nextDir, food, score, best = 0, interval = null, running = false;

        function rnd(n) { return Math.floor(Math.random() * n); }
        function placeFood() {
          const flat = [];
          for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++)
            if (!snake.some(s => s.r === r && s.c === c)) flat.push({ r, c });
          return flat.length ? flat[rnd(flat.length)] : { r: 0, c: 0 };
        }
        function draw() {
          ctx.fillStyle = '#0d1117'; ctx.fillRect(0, 0, 400, 400);
          // Grid dots
          ctx.fillStyle = '#1a2332';
          for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { ctx.fillRect(c * CELL + 9, r * CELL + 9, 2, 2); }
          // Food
          ctx.fillStyle = '#f87171';
          ctx.beginPath(); ctx.arc(food.c * CELL + CELL / 2, food.r * CELL + CELL / 2, CELL / 2 - 2, 0, Math.PI * 2); ctx.fill();
          // Snake
          snake.forEach((seg, i) => {
            const grd = ctx.createLinearGradient(seg.c * CELL, seg.r * CELL, seg.c * CELL + CELL, seg.r * CELL + CELL);
            grd.addColorStop(0, i === 0 ? '#86efac' : '#22c55e');
            grd.addColorStop(1, i === 0 ? '#4ade80' : '#16a34a');
            ctx.fillStyle = grd;
            ctx.beginPath(); ctx.roundRect(seg.c * CELL + 1, seg.r * CELL + 1, CELL - 2, CELL - 2, 3); ctx.fill();
          });
        }
        function step() {
          dir = nextDir;
          const head = { r: snake[0].r + dir.r, c: snake[0].c + dir.c };
          if (head.r < 0 || head.r >= ROWS || head.c < 0 || head.c >= COLS || snake.some(s => s.r === head.r && s.c === head.c)) {
            clearInterval(interval); running = false;
            if (score > best) { best = score; bestEl.textContent = best; }
            msgEl.textContent = `Game Over! Score: ${score}. Press New Game to restart.`;
            msgEl.style.color = '#f87171';
            return;
          }
          snake.unshift(head);
          if (head.r === food.r && head.c === food.c) {
            score++; scoreEl.textContent = score;
            food = placeFood();
            if (score > best) { best = score; bestEl.textContent = best; }
          } else { snake.pop(); }
          draw();
        }
        function startGame() {
          clearInterval(interval);
          snake = [{ r: 10, c: 10 }, { r: 10, c: 9 }, { r: 10, c: 8 }];
          dir = { r: 0, c: 1 }; nextDir = { r: 0, c: 1 };
          food = placeFood(); score = 0;
          scoreEl.textContent = 0;
          msgEl.textContent = 'Use arrow keys to move.'; msgEl.style.color = '#facc15';
          running = true;
          const speed = 130;
          interval = setInterval(step, speed);
          draw(); canvas.focus();
        }
        canvas.setAttribute('tabindex', '0');
        canvas.addEventListener('keydown', (e) => {
          const map = { ArrowUp: { r: -1, c: 0 }, ArrowDown: { r: 1, c: 0 }, ArrowLeft: { r: 0, c: -1 }, ArrowRight: { r: 0, c: 1 } };
          if (map[e.key]) {
            e.preventDefault();
            const d = map[e.key];
            if (d.r !== -dir.r || d.c !== -dir.c) nextDir = d;
            if (!running) startGame();
          }
        });
        restartBtn.addEventListener('click', startGame);
        // Draw idle screen
        ctx.fillStyle = '#0d1117'; ctx.fillRect(0, 0, 400, 400);
        ctx.fillStyle = '#22c55e'; ctx.font = 'bold 32px monospace'; ctx.textAlign = 'center';
        ctx.fillText('🐍 SNAKE', 200, 190); ctx.font = '14px monospace'; ctx.fillStyle = '#64748b';
        ctx.fillText('Press an arrow key or New Game', 200, 220);
        registerWindowCleanup(winId, () => clearInterval(interval));
      }
    });
  }

  // ======= TETRIS =======
  function openTetris() {
    createWindow({
      title: 'Tetris', width: 400, height: 560, tbIcon: '🧩',
      menubar: '<div class="window-menubar"><span>Game</span><span>Help</span></div>',
      body: `<div style="display:flex;gap:12px;align-items:flex-start;height:100%;background:#0a0a0a;padding:10px;justify-content:center;">
        <canvas id="tetris-canvas" width="200" height="400" style="border:2px solid #6366f1;border-radius:4px;"></canvas>
        <div style="display:flex;flex-direction:column;gap:10px;min-width:110px;">
          <div style="background:#111;border:1px solid #333;border-radius:6px;padding:10px;">
            <div style="color:#94a3b8;font-family:monospace;font-size:10px;margin-bottom:4px;">SCORE</div>
            <div id="tet-score" style="color:#a5b4fc;font-family:monospace;font-size:18px;font-weight:700;">0</div>
          </div>
          <div style="background:#111;border:1px solid #333;border-radius:6px;padding:10px;">
            <div style="color:#94a3b8;font-family:monospace;font-size:10px;margin-bottom:4px;">LEVEL</div>
            <div id="tet-level" style="color:#86efac;font-family:monospace;font-size:18px;font-weight:700;">1</div>
          </div>
          <div style="background:#111;border:1px solid #333;border-radius:6px;padding:10px;">
            <div style="color:#94a3b8;font-family:monospace;font-size:10px;margin-bottom:4px;">LINES</div>
            <div id="tet-lines" style="color:#fde68a;font-family:monospace;font-size:18px;font-weight:700;">0</div>
          </div>
          <div style="background:#111;border:1px solid #333;border-radius:6px;padding:10px;">
            <div style="color:#94a3b8;font-family:monospace;font-size:10px;margin-bottom:6px;">NEXT</div>
            <canvas id="tetris-next" width="80" height="80"></canvas>
          </div>
          <button id="tet-start" style="background:#6366f1;color:#fff;border:none;border-radius:6px;padding:8px;cursor:pointer;font-size:12px;font-weight:700;">New Game</button>
          <div style="color:#475569;font-family:monospace;font-size:9px;line-height:1.5;">← → Move<br>↑ Rotate<br>↓ Soft drop<br>Space: Drop</div>
        </div>
      </div>`,
      onReady: (winId) => {
        const body = document.getElementById(winId + '-body');
        const canvas = body.querySelector('#tetris-canvas');
        const ctx = canvas.getContext('2d');
        const nextCanvas = body.querySelector('#tetris-next');
        const nctx = nextCanvas.getContext('2d');
        const scoreEl = body.querySelector('#tet-score');
        const levelEl = body.querySelector('#tet-level');
        const linesEl = body.querySelector('#tet-lines');
        const startBtn = body.querySelector('#tet-start');
        const COLS = 10, ROWS = 20, SZ = 20;
        const PIECES = [
          { shape: [[1, 1, 1, 1]], color: '#22d3ee' },  // I
          { shape: [[1, 1], [1, 1]], color: '#facc15' }, // O
          { shape: [[0, 1, 0], [1, 1, 1]], color: '#a855f7' }, // T
          { shape: [[1, 0, 0], [1, 1, 1]], color: '#f97316' }, // L
          { shape: [[0, 0, 1], [1, 1, 1]], color: '#3b82f6' }, // J
          { shape: [[0, 1, 1], [1, 1, 0]], color: '#4ade80' }, // S
          { shape: [[1, 1, 0], [0, 1, 1]], color: '#f87171' }  // Z
        ];
        let board, cur, curX, curY, next, score, level, lines, interval, running = false;

        function rotate(m) { return m[0].map((_, i) => m.map(r => r[i]).reverse()); }
        function rndPiece() { return JSON.parse(JSON.stringify(PIECES[Math.floor(Math.random() * PIECES.length)])); }
        function fits(shape, x, y) {
          for (let r = 0; r < shape.length; r++) for (let c = 0; c < shape[r].length; c++)
            if (shape[r][c] && (y + r >= ROWS || x + c < 0 || x + c >= COLS || board[y + r][x + c])) return false;
          return true;
        }
        function place() {
          for (let r = 0; r < cur.shape.length; r++) for (let c = 0; c < cur.shape[r].length; c++)
            if (cur.shape[r][c]) board[curY + r][curX + c] = cur.color;
          let cleared = 0;
          for (let r = ROWS - 1; r >= 0; r--) {
            if (board[r].every(c => c)) { board.splice(r, 1); board.unshift(Array(COLS).fill(0)); cleared++; r++; }
          }
          if (cleared) { lines += cleared; score += [0, 100, 300, 500, 800][cleared] * level; level = Math.floor(lines / 10) + 1; }
          scoreEl.textContent = score; levelEl.textContent = level; linesEl.textContent = lines;
          cur = next; curX = Math.floor((COLS - cur.shape[0].length) / 2); curY = 0; next = rndPiece();
          drawNext();
          if (!fits(cur.shape, curX, curY)) { clearInterval(interval); running = false; ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.fillRect(0, 0, 200, 400); ctx.fillStyle = '#f87171'; ctx.font = 'bold 20px monospace'; ctx.textAlign = 'center'; ctx.fillText('GAME OVER', 100, 190); ctx.font = '13px monospace'; ctx.fillStyle = '#94a3b8'; ctx.fillText(`Score: ${score}`, 100, 215); }
        }
        function draw() {
          ctx.fillStyle = '#0d1117'; ctx.fillRect(0, 0, 200, 400);
          for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
            if (board[r][c]) { ctx.fillStyle = board[r][c]; ctx.fillRect(c * SZ + 1, r * SZ + 1, SZ - 2, SZ - 2); ctx.fillStyle = 'rgba(255,255,255,0.15)'; ctx.fillRect(c * SZ + 1, r * SZ + 1, SZ - 2, 4); }
            else { ctx.strokeStyle = '#1a2332'; ctx.strokeRect(c * SZ + 0.5, r * SZ + 0.5, SZ, SZ); }
          }
          // Ghost
          let gy = curY; while (fits(cur.shape, curX, gy + 1)) gy++;
          if (gy > curY) { ctx.globalAlpha = 0.25; cur.shape.forEach((row, r) => row.forEach((v, c) => { if (v) { ctx.fillStyle = cur.color; ctx.fillRect((curX + c) * SZ + 1, (gy + r) * SZ + 1, SZ - 2, SZ - 2); } })); ctx.globalAlpha = 1; }
          // Current piece
          cur.shape.forEach((row, r) => row.forEach((v, c) => { if (v) { ctx.fillStyle = cur.color; ctx.fillRect((curX + c) * SZ + 1, (curY + r) * SZ + 1, SZ - 2, SZ - 2); ctx.fillStyle = 'rgba(255,255,255,0.2)'; ctx.fillRect((curX + c) * SZ + 1, (curY + r) * SZ + 1, SZ - 2, 4); } }));
        }
        function drawNext() {
          nctx.fillStyle = '#0d1117'; nctx.fillRect(0, 0, 80, 80);
          const ns = next.shape, ox = Math.floor((4 - ns[0].length) / 2) * 16, oy = Math.floor((4 - ns.length) / 2) * 16;
          ns.forEach((row, r) => row.forEach((v, c) => { if (v) { nctx.fillStyle = next.color; nctx.fillRect(ox + c * 16 + 1, oy + r * 16 + 1, 14, 14); } }));
        }
        function startGame() {
          board = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
          cur = rndPiece(); next = rndPiece(); curX = Math.floor((COLS - cur.shape[0].length) / 2); curY = 0;
          score = 0; level = 1; lines = 0; running = true;
          scoreEl.textContent = 0; levelEl.textContent = 1; linesEl.textContent = 0;
          clearInterval(interval); interval = setInterval(() => { if (!fits(cur.shape, curX, curY + 1)) { place(); } else { curY++; } draw(); }, Math.max(80, 500 - level * 40));
          drawNext(); draw(); canvas.focus();
        }
        canvas.setAttribute('tabindex', '0');
        canvas.addEventListener('keydown', (e) => {
          if (!running) return;
          if (e.key === 'ArrowLeft' && fits(cur.shape, curX - 1, curY)) { curX--; draw(); e.preventDefault(); }
          else if (e.key === 'ArrowRight' && fits(cur.shape, curX + 1, curY)) { curX++; draw(); e.preventDefault(); }
          else if (e.key === 'ArrowDown' && fits(cur.shape, curX, curY + 1)) { curY++; score++; scoreEl.textContent = score; draw(); e.preventDefault(); }
          else if (e.key === 'ArrowUp') { const r = rotate(cur.shape); if (fits(r, curX, curY)) { cur.shape = r; draw(); } e.preventDefault(); }
          else if (e.key === ' ') { while (fits(cur.shape, curX, curY + 1)) { curY++; score += 2; } scoreEl.textContent = score; place(); draw(); e.preventDefault(); }
        });
        startBtn.addEventListener('click', startGame);
        ctx.fillStyle = '#0d1117'; ctx.fillRect(0, 0, 200, 400); ctx.fillStyle = '#6366f1'; ctx.font = 'bold 20px monospace'; ctx.textAlign = 'center'; ctx.fillText('🧩 TETRIS', 100, 195); ctx.font = '11px monospace'; ctx.fillStyle = '#64748b'; ctx.fillText('Click New Game', 100, 220);
        registerWindowCleanup(winId, () => clearInterval(interval));
      }
    });
  }

  // ======= 2048 =======
  function open2048() {
    createWindow({
      title: '2048', width: 380, height: 480, tbIcon: '🔢',
      menubar: '<div class="window-menubar"><span>Game</span><span>Help</span></div>',
      body: `<div style="display:flex;flex-direction:column;align-items:center;gap:10px;height:100%;background:#faf8ef;padding:12px;">
        <div style="display:flex;justify-content:space-between;width:340px;align-items:center;">
          <div style="font-size:28px;font-weight:900;color:#776e65;font-family:'Tahoma',sans-serif;">2048</div>
          <div style="display:flex;gap:8px;">
            <div style="background:#bbada0;border-radius:6px;padding:6px 12px;text-align:center;">
              <div style="font-size:9px;color:#eee4da;font-weight:700;">SCORE</div>
              <div id="g2048-score" style="font-size:16px;font-weight:700;color:#fff;">0</div>
            </div>
            <div style="background:#bbada0;border-radius:6px;padding:6px 12px;text-align:center;">
              <div style="font-size:9px;color:#eee4da;font-weight:700;">BEST</div>
              <div id="g2048-best" style="font-size:16px;font-weight:700;color:#fff;">0</div>
            </div>
          </div>
        </div>
        <div id="g2048-msg" style="font-size:12px;color:#776e65;font-family:'Tahoma',sans-serif;">Join the numbers to get 2048! Use arrow keys.</div>
        <div id="g2048-board" style="background:#bbada0;border-radius:8px;padding:8px;display:grid;grid-template-columns:repeat(4,75px);grid-template-rows:repeat(4,75px);gap:8px;width:340px;height:340px;" tabindex="0"></div>
        <button id="g2048-new" style="background:#8f7a66;color:#fff;border:none;border-radius:6px;padding:8px 24px;cursor:pointer;font-size:13px;font-weight:700;font-family:'Tahoma',sans-serif;">New Game</button>
      </div>`,
      onReady: (winId) => {
        const body = document.getElementById(winId + '-body');
        const boardEl = body.querySelector('#g2048-board');
        const scoreEl = body.querySelector('#g2048-score');
        const bestEl = body.querySelector('#g2048-best');
        const msgEl = body.querySelector('#g2048-msg');
        const newBtn = body.querySelector('#g2048-new');
        const COLORS = { 0: '#cdc1b4', 2: '#eee4da', 4: '#ede0c8', 8: '#f2b179', 16: '#f59563', 32: '#f67c5f', 64: '#f65e3b', 128: '#edcf72', 256: '#edcc61', 512: '#edc850', 1024: '#edc53f', 2048: '#edc22e' };
        const FGCOLORS = { 0: 'transparent', 2: '#776e65', 4: '#776e65', 8: '#f9f6f2', 16: '#f9f6f2', 32: '#f9f6f2', 64: '#f9f6f2', 128: '#f9f6f2', 256: '#f9f6f2', 512: '#f9f6f2', 1024: '#f9f6f2', 2048: '#f9f6f2' };
        let grid, score, best = 0, won = false;

        function newGrid() { return Array.from({ length: 4 }, () => Array(4).fill(0)); }
        function addTile(g) {
          const empty = []; for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) if (!g[r][c]) empty.push({ r, c });
          if (!empty.length) return; const { r, c } = empty[Math.floor(Math.random() * empty.length)]; g[r][c] = Math.random() < 0.9 ? 2 : 4;
        }
        function render() {
          boardEl.innerHTML = '';
          for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
            const v = grid[r][c]; const cell = document.createElement('div');
            const fs = v >= 1024 ? 20 : v >= 256 ? 22 : v >= 16 ? 24 : 26;
            cell.style.cssText = `background:${COLORS[v] || '#3c3a32'};border-radius:4px;display:flex;align-items:center;justify-content:center;font-size:${fs}px;font-weight:900;color:${FGCOLORS[v] || '#f9f6f2'};font-family:'Tahoma',sans-serif;transition:all 0.1s;`;
            cell.textContent = v || ''; boardEl.appendChild(cell);
          }
          scoreEl.textContent = score; bestEl.textContent = best;
        }
        function slide(row) {
          let r = row.filter(v => v); let pts = 0;
          for (let i = 0; i < r.length - 1; i++) if (r[i] === r[i + 1]) { pts += r[i] * 2; r[i] *= 2; r.splice(i + 1, 1); i++; }
          while (r.length < 4) r.push(0); return { row: r, pts };
        }
        function move(dir) {
          let changed = false;
          if (dir === 'left') for (let r = 0; r < 4; r++) { const { row, pts } = slide(grid[r]); if (pts || JSON.stringify(row) !== JSON.stringify(grid[r])) { grid[r] = row; score += pts; changed = true; } }
          if (dir === 'right') for (let r = 0; r < 4; r++) { const { row, pts } = slide([...grid[r]].reverse()); const nr = [...row].reverse(); if (pts || JSON.stringify(nr) !== JSON.stringify(grid[r])) { grid[r] = nr; score += pts; changed = true; } }
          if (dir === 'up') for (let c = 0; c < 4; c++) { const col = grid.map(r => r[c]); const { row, pts } = slide(col); if (pts || JSON.stringify(row) !== JSON.stringify(col)) { row.forEach((v, r) => grid[r][c] = v); score += pts; changed = true; } }
          if (dir === 'down') for (let c = 0; c < 4; c++) { const col = grid.map(r => r[c]).reverse(); const { row, pts } = slide(col); const nr = [...row].reverse(); if (pts || JSON.stringify(nr) !== JSON.stringify(grid.map(r => r[c]))) { nr.forEach((v, r) => grid[r][c] = v); score += pts; changed = true; } }
          if (changed) { if (score > best) { best = score; } addTile(grid); if (!won && grid.flat().includes(2048)) { msgEl.textContent = '🎉 You reached 2048! Keep going!'; msgEl.style.color = '#f67c5f'; won = true; } render(); checkLose(); }
        }
        function checkLose() {
          if (grid.flat().includes(0)) return;
          for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) if ((c < 3 && grid[r][c] === grid[r][c + 1]) || (r < 3 && grid[r][c] === grid[r + 1][c])) return;
          msgEl.textContent = 'Game over! No more moves.'; msgEl.style.color = '#f87171';
        }
        function startGame() { grid = newGrid(); score = 0; won = false; addTile(grid); addTile(grid); msgEl.textContent = 'Join the numbers to get 2048! Use arrow keys.'; msgEl.style.color = '#776e65'; render(); boardEl.focus(); }
        boardEl.addEventListener('keydown', (e) => {
          const map = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
          if (map[e.key]) { e.preventDefault(); move(map[e.key]); }
        });
        newBtn.addEventListener('click', startGame);
        startGame();
      }
    });
  }

  // ======= Desktop Background =======
  function applyDesktopBackground(bgType) {
    const desktop = document.getElementById('desktop');
    if (!desktop) return;

    if (bgType === 'bliss') {
      desktop.style.background = 'url("https://upload.wikimedia.org/wikipedia/en/2/21/Bliss_%28Windows_background%29.jpg") no-repeat center center fixed';
      desktop.style.backgroundSize = 'cover';
    } else if (bgType === 'teal') {
      desktop.style.background = '#008080';
    } else {
      desktop.style.background = 'linear-gradient(135deg, #3a223a 0%, #2a1b2a 50%, #1a1a2a 100%)';
      desktop.style.backgroundSize = 'cover';
    }
  }

  // ======= SETTINGS =======
  function openSettings() {
    const currentBg = localStorage.getItem('retro_bg') || 'classic';
    createWindow({
      title: 'System Settings', width: 340, height: 320, tbIcon: '⚙️',
      statusbar: false,
      body: `<div style="padding: 20px; font-family: 'Tahoma', sans-serif;">
        <h3 style="margin-top:0; font-size: 16px;">Audio Settings</h3>
        <label style="display:flex; align-items:center; gap: 8px; cursor: pointer; font-size: 13px; margin-top: 15px;">
          <input type="checkbox" id="toggle-sound" ${soundEnabled ? 'checked' : ''}>
          Enable System Sounds
        </label>

        <h3 style="margin-top:20px; font-size: 16px;">Desktop Background</h3>
        <select id="bg-selector" style="margin-top: 10px; padding: 4px; width: 100%; font-family: 'Tahoma';">
          <option value="classic" ${currentBg === 'classic' ? 'selected' : ''}>Classic Retro</option>
          <option value="bliss" ${currentBg === 'bliss' ? 'selected' : ''}>Windows Bliss</option>
          <option value="teal" ${currentBg === 'teal' ? 'selected' : ''}>Solid Teal</option>
        </select>
        <p style="color:#666; margin-top:20px; font-size: 12px; line-height: 1.4;">Changes are saved automatically.</p>
      </div>`,
      onReady: (winId) => {
        const body = document.getElementById(winId + '-body');
        const cb = body.querySelector('#toggle-sound');
        cb.addEventListener('change', (e) => {
          soundEnabled = e.target.checked;
          if (soundEnabled) playSound('click');
        });
        const bgSel = body.querySelector('#bg-selector');
        bgSel.addEventListener('change', (e) => {
          const bg = e.target.value;
          localStorage.setItem('retro_bg', bg);
          applyDesktopBackground(bg);
        });
      }
    });
  }

  // Init Background
  applyDesktopBackground(localStorage.getItem('retro_bg') || 'classic');

  // ======= TIC TAC TOE =======
  function openTicTacToe() {
    createWindow({
      title: 'Tic Tac Toe', width: 300, height: 360, tbIcon: '❌',
      menubar: '<div class="window-menubar"><span>Game</span><span>Help</span></div>',
      body: `<div style="display:flex;flex-direction:column;align-items:center;gap:10px;height:100%;background:#ece9d8;padding:12px;font-family:'Tahoma',sans-serif;">
        <div id="ttt-msg" style="font-size:16px;font-weight:bold;color:#333;margin-bottom:10px;">Player X's Turn</div>
        <div id="ttt-board" style="display:grid;grid-template-columns:repeat(3,70px);grid-template-rows:repeat(3,70px);gap:4px;background:#333;padding:4px;border:2px inset #fff;">
          <button class="ttt-cell" data-idx="0" style="background:#fff;border:none;font-size:36px;font-weight:bold;cursor:pointer;color:#333;"></button>
          <button class="ttt-cell" data-idx="1" style="background:#fff;border:none;font-size:36px;font-weight:bold;cursor:pointer;color:#333;"></button>
          <button class="ttt-cell" data-idx="2" style="background:#fff;border:none;font-size:36px;font-weight:bold;cursor:pointer;color:#333;"></button>
          <button class="ttt-cell" data-idx="3" style="background:#fff;border:none;font-size:36px;font-weight:bold;cursor:pointer;color:#333;"></button>
          <button class="ttt-cell" data-idx="4" style="background:#fff;border:none;font-size:36px;font-weight:bold;cursor:pointer;color:#333;"></button>
          <button class="ttt-cell" data-idx="5" style="background:#fff;border:none;font-size:36px;font-weight:bold;cursor:pointer;color:#333;"></button>
          <button class="ttt-cell" data-idx="6" style="background:#fff;border:none;font-size:36px;font-weight:bold;cursor:pointer;color:#333;"></button>
          <button class="ttt-cell" data-idx="7" style="background:#fff;border:none;font-size:36px;font-weight:bold;cursor:pointer;color:#333;"></button>
          <button class="ttt-cell" data-idx="8" style="background:#fff;border:none;font-size:36px;font-weight:bold;cursor:pointer;color:#333;"></button>
        </div>
        <button id="ttt-reset" style="margin-top:10px;padding:4px 16px;cursor:pointer;">Restart Game</button>
      </div>`,
      statusbar: false,
      onReady: (winId) => {
        const body = document.getElementById(winId + '-body');
        const cells = body.querySelectorAll('.ttt-cell');
        const msg = body.querySelector('#ttt-msg');
        const resetBtn = body.querySelector('#ttt-reset');

        let board = Array(9).fill(null);
        let xIsNext = true;
        let gameOver = false;

        function checkWinner() {
          const lines = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
          for (let line of lines) {
            const [a,b,c] = line;
            if (board[a] && board[a] === board[b] && board[a] === board[c]) {
              return board[a];
            }
          }
          return board.includes(null) ? null : 'Draw';
        }

        function handleClick(e) {
          if (gameOver) return;
          const idx = e.target.dataset.idx;
          if (board[idx]) return;

          board[idx] = xIsNext ? 'X' : 'O';
          e.target.textContent = board[idx];
          e.target.style.color = xIsNext ? '#d9534f' : '#337ab7';

          playSound('click');

          const winner = checkWinner();
          if (winner) {
            gameOver = true;
            msg.textContent = winner === 'Draw' ? "It's a Draw!" : `Player ${winner} Wins!`;
          } else {
            xIsNext = !xIsNext;
            msg.textContent = `Player ${xIsNext ? 'X' : 'O'}'s Turn`;
          }
        }

        cells.forEach(cell => cell.addEventListener('click', handleClick));

        resetBtn.addEventListener('click', () => {
          board = Array(9).fill(null);
          xIsNext = true;
          gameOver = false;
          msg.textContent = "Player X's Turn";
          cells.forEach(cell => {
            cell.textContent = '';
            cell.style.color = '#333';
          });
        });
      }
    });
  }

  // ======= IDE APP =======
  function openIDE() {
    createWindow({
      title: 'Code Studio', width: 1080, height: 680, tbIcon: '👨‍💻',
      body: `<div class="cs-root">
        <div class="cs-activitybar">
          <div class="cs-ab-btn active" id="cs-ab-explorer" title="Explorer">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/></svg>
          </div>
          <div class="cs-ab-btn" id="cs-ab-folder" title="Open Folder">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"/><path d="M12 11v6"/><path d="M9 14h6"/></svg>
          </div>
          <div class="cs-ab-btn" id="cs-ab-agent" title="AI Agent">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="10"/><path d="M12 8v4l3 3"/></svg>
          </div>
          <div class="cs-ab-spacer"></div>
          <div class="cs-ab-btn" id="cs-ab-settings" title="Settings">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z"/></svg>
          </div>
        </div>

        <div class="cs-sidepanel" id="cs-sidepanel">
          <div class="cs-sp-header">EXPLORER</div>
          <div class="cs-sp-section">
            <div class="cs-sp-section-title">
              <span class="cs-chevron">▾</span> WORKSPACE
            </div>
            <div class="cs-workspace-meta">
              <div class="cs-workspace-label" id="cs-workspace-label">No folder selected</div>
              <div class="cs-workspace-actions">
                <button class="cs-action-btn primary" id="cs-open-folder-btn">Open Folder</button>
                <button class="cs-action-btn" id="cs-new-file-btn">New File</button>
                <button class="cs-action-btn" id="cs-new-folder-btn">New Folder</button>
              </div>
            </div>
            <div class="cs-filetree" id="cs-filetree"></div>
          </div>
        </div>

        <div class="cs-sidepanel" id="cs-agent-panel" style="display:none;">
          <div class="cs-sp-header">AI AGENT</div>
          <div class="cs-sp-section">
            <div class="cs-sp-section-title">CONFIGURATION</div>
            <div class="cs-agent-config-form">
              <label class="cs-agent-field">
                <span>Provider</span>
                <select id="cs-agent-provider">
                  <option value="openai">OpenAI</option>
                  <option value="gemini">Gemini</option>
                  <option value="claude">Claude</option>
                </select>
              </label>
              <label class="cs-agent-field">
                <span>Model</span>
                <input type="text" id="cs-agent-model" placeholder="gpt-4o-mini">
              </label>
              <label class="cs-agent-field">
                <span>API Key</span>
                <input type="password" id="cs-agent-key" placeholder="••••••••">
              </label>
              <button class="cs-action-btn primary" id="cs-agent-save" style="margin-top:10px; width:100%;">Save & Sync</button>
            </div>
            <div class="cs-agent-helper-text" style="font-size:11px; color:#888; margin-top:12px; line-height:1.4;">
              Settings are shared with the global AI Agent. Use "agent [prompt]" in the terminal below to interact.
            </div>
          </div>
        </div>

        <div class="cs-main">
          <div class="cs-tabbar">
            <div class="cs-tabs-area" id="cs-tabs-area"></div>
            <div class="cs-tabbar-actions">
              <button class="cs-action-btn" id="cs-open-folder-top">Open Folder</button>
              <button class="cs-action-btn" id="cs-save-btn">Save</button>
              <button class="cs-golive-btn" id="cs-run-btn">
                <span class="cs-golive-dot"></span> Go Live
              </button>
            </div>
          </div>

          <div class="cs-breadcrumbs" id="cs-breadcrumbs"></div>

          <div class="cs-editor-area">
            <div class="cs-editor-wrapper">
              <div class="cs-editor-empty" id="cs-editor-empty">
                <div class="cs-empty-title">Choose a folder to start editing.</div>
                <div class="cs-empty-copy">Code Studio now works with real files from your RetroLinux filesystem.</div>
              </div>
              <div class="cs-editor-pane" id="cs-editor-pane">
                <div class="cs-line-numbers" id="cs-line-numbers"></div>
                <div class="cs-code-surface">
                  <pre class="cs-code-highlight" id="cs-code-highlight"></pre>
                  <textarea class="cs-code-input" id="cs-code-input" spellcheck="false" wrap="off"></textarea>
                </div>
              </div>
            </div>

            <div class="cs-preview-panel" id="cs-preview-panel" style="display:none;">
              <div class="cs-preview-chrome">
                <div class="cs-preview-tab-bar">
                  <div class="cs-preview-tab">
                    <span class="cs-preview-dot green"></span>
                    <span>Live Preview</span>
                  </div>
                  <button class="cs-preview-close" id="cs-close-preview">×</button>
                </div>
                <div class="cs-preview-addr">
                  <span class="cs-addr-icon">🔒</span>
                  <span class="cs-addr-text" id="cs-preview-addr-text">Choose a folder first</span>
                  <span class="cs-addr-reload" id="cs-reload-preview">↻</span>
                </div>
              </div>
              <iframe id="cs-iframe" sandbox="allow-scripts allow-same-origin"></iframe>
            </div>
          </div>

          <div class="cs-terminal-panel" id="cs-terminal-panel">
            <div class="cs-terminal-tabs">
              <div class="cs-term-tab-group">
                <span class="cs-term-tab active">TERMINAL</span>
                <span class="cs-term-tab">PROBLEMS</span>
                <span class="cs-term-tab">OUTPUT</span>
              </div>
              <div class="cs-term-actions">
                <span class="cs-term-action cs-term-toggle" id="cs-term-toggle" title="Toggle Panel">⌃</span>
              </div>
            </div>
            <div class="cs-terminal-body" id="cs-terminal-body"></div>
          </div>

          <div class="cs-statusbar">
            <div class="cs-sb-left">
              <span class="cs-sb-item cs-sb-branch">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 012 2v7"/><line x1="6" y1="9" x2="6" y2="21"/></svg>
                workspace
              </span>
              <span class="cs-sb-item" id="cs-sb-state">Choose a folder to start editing.</span>
            </div>
            <div class="cs-sb-right">
              <span class="cs-sb-item" id="cs-sb-cursor">Ln 1, Col 1</span>
              <span class="cs-sb-item">Spaces: 2</span>
              <span class="cs-sb-item">UTF-8</span>
              <span class="cs-sb-item" id="cs-sb-lang">Plain Text</span>
              <span class="cs-sb-item cs-sb-prettier">Live Save</span>
            </div>
          </div>
        </div>

        <div class="cs-folder-picker" id="cs-folder-picker">
          <div class="cs-picker-panel">
            <div class="cs-picker-header">Open Folder</div>
            <div class="cs-picker-path">
              <button class="cs-action-btn" id="cs-picker-root">Root</button>
              <button class="cs-action-btn" id="cs-picker-home">Home</button>
              <button class="cs-action-btn" id="cs-picker-up">Up</button>
              <div class="cs-picker-current" id="cs-picker-current"></div>
            </div>
            <div class="cs-picker-copy">Choose the folder you want to edit, then open it as your workspace.</div>
            <div class="cs-picker-list" id="cs-picker-list"></div>
            <div class="cs-picker-actions">
              <button class="cs-action-btn" id="cs-picker-cancel">Cancel</button>
              <button class="cs-action-btn primary" id="cs-picker-open">Open Current Folder</button>
            </div>
          </div>
        </div>
      </div>`,
      statusbar: false,
      onReady: (winId) => {
        const body = document.getElementById(winId + '-body');
        const refs = {
          root: body.querySelector('.cs-root'),
          sidePanel: body.querySelector('#cs-sidepanel'),
          workspaceLabel: body.querySelector('#cs-workspace-label'),
          fileTree: body.querySelector('#cs-filetree'),
          tabsArea: body.querySelector('#cs-tabs-area'),
          breadcrumbs: body.querySelector('#cs-breadcrumbs'),
          empty: body.querySelector('#cs-editor-empty'),
          editorPane: body.querySelector('#cs-editor-pane'),
          lineNumbers: body.querySelector('#cs-line-numbers'),
          codeHighlight: body.querySelector('#cs-code-highlight'),
          codeInput: body.querySelector('#cs-code-input'),
          previewPanel: body.querySelector('#cs-preview-panel'),
          previewAddr: body.querySelector('#cs-preview-addr-text'),
          iframe: body.querySelector('#cs-iframe'),
          terminalPanel: body.querySelector('#cs-terminal-panel'),
          terminalBody: body.querySelector('#cs-terminal-body'),
          saveBtn: body.querySelector('#cs-save-btn'),
          runBtn: body.querySelector('#cs-run-btn'),
          statusState: body.querySelector('#cs-sb-state'),
          statusCursor: body.querySelector('#cs-sb-cursor'),
          statusLang: body.querySelector('#cs-sb-lang'),
          picker: body.querySelector('#cs-folder-picker'),
          pickerCurrent: body.querySelector('#cs-picker-current'),
          pickerList: body.querySelector('#cs-picker-list'),
          openFolderBtn: body.querySelector('#cs-open-folder-btn'),
          openFolderTop: body.querySelector('#cs-open-folder-top'),
          newFileBtn: body.querySelector('#cs-new-file-btn'),
          newFolderBtn: body.querySelector('#cs-new-folder-btn'),
          pickerOpen: body.querySelector('#cs-picker-open'),
          abExplorer: body.querySelector('#cs-ab-explorer'),
          abAgent: body.querySelector('#cs-ab-agent'),
          explorerPanel: body.querySelector('#cs-sidepanel'),
          agentPanel: body.querySelector('#cs-agent-panel'),
          agentProvider: body.querySelector('#cs-agent-provider'),
          agentModel: body.querySelector('#cs-agent-model'),
          agentKey: body.querySelector('#cs-agent-key'),
          agentSave: body.querySelector('#cs-agent-save'),
          abFolder: body.querySelector('#cs-ab-folder'),
          abSettings: body.querySelector('#cs-ab-settings')
        };
        const state = {
          workspacePath: '',
          pickerPath: '/home/user',
          openTabs: [],
          activeFilePath: null,
          collapsedDirs: new Set(),
          previewUrl: null,
          sidePanelVisible: 'explorer', // 'explorer' | 'agent'
          termState: { cwd: '/home/user', agentMode: false, agentHistory: [] }
        };
        let suppressInput = false;

        function escapeHtml(text) {
          return String(text ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
        }

        function stashTokens(text, rules) {
          const tokens = [];
          let output = text;
          rules.forEach(([regex, className]) => {
            output = output.replace(regex, (match) => {
              const token = `\u0000${tokens.length}\u0000`;
              tokens.push(`<span class="${className}">${match}</span>`);
              return token;
            });
          });
          return output.replace(/\u0000(\d+)\u0000/g, (_, idx) => tokens[Number(idx)]);
        }

        function getLanguageFromName(name) {
          const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
          if (ext === 'html' || ext === 'htm') return 'html';
          if (ext === 'css') return 'css';
          if (ext === 'js') return 'javascript';
          if (ext === 'json') return 'json';
          if (ext === 'md') return 'markdown';
          if (ext === 'txt') return 'text';
          return 'text';
        }

        function getLanguageLabel(language) {
          const labels = {
            html: 'HTML',
            css: 'CSS',
            javascript: 'JavaScript',
            json: 'JSON',
            markdown: 'Markdown',
            text: 'Plain Text'
          };
          return labels[language] || 'Plain Text';
        }

        function getIconMeta(name, node) {
          if (isDirectory(node)) return { cls: 'cs-icon-folder', text: 'D' };
          const language = getLanguageFromName(name);
          const icons = {
            html: { cls: 'cs-icon-html', text: 'H' },
            css: { cls: 'cs-icon-css', text: 'C' },
            javascript: { cls: 'cs-icon-js', text: 'J' },
            json: { cls: 'cs-icon-json', text: '{' },
            markdown: { cls: 'cs-icon-md', text: 'M' },
            text: { cls: 'cs-icon-file', text: 'T' }
          };
          return icons[language] || icons.text;
        }

        function sortEntries(node) {
          return Object.entries(node || {}).sort((a, b) => {
            const aRank = isDirectory(a[1]) ? 0 : 1;
            const bRank = isDirectory(b[1]) ? 0 : 1;
            return aRank - bRank || a[0].localeCompare(b[0]);
          });
        }

        function getTab(path) {
          return state.openTabs.find((tab) => tab.path === path) || null;
        }

        function getActiveTab() {
          return getTab(state.activeFilePath);
        }

        function getLiveFileContent(path) {
          const openTab = getTab(path);
          if (openTab) return openTab.content;
          const node = getNode(path);
          return typeof node === 'string' ? node : '';
        }

        function updateStatus(message) {
          refs.statusState.textContent = message;
        }

        function updateCursor() {
          const value = refs.codeInput.value.slice(0, refs.codeInput.selectionStart);
          const lines = value.split('\n');
          refs.statusCursor.textContent = `Ln ${lines.length}, Col ${lines[lines.length - 1].length + 1}`;
        }

        function updateLineNumbers(content) {
          const total = Math.max(content.split('\n').length, 20);
          let html = '';
          for (let i = 1; i <= total; i += 1) html += `<div class="cs-ln">${i}</div>`;
          refs.lineNumbers.innerHTML = html;
        }

        function syncEditorScroll() {
          refs.lineNumbers.scrollTop = refs.codeInput.scrollTop;
          refs.codeHighlight.scrollTop = refs.codeInput.scrollTop;
          refs.codeHighlight.scrollLeft = refs.codeInput.scrollLeft;
        }

        function highlightHtml(code) {
          let escaped = escapeHtml(code);
          escaped = escaped.replace(/&lt;!--[\s\S]*?--&gt;/g, (comment) => `<span class="cs-syn-comment">${comment}</span>`);
          return escaped.replace(/&lt;\/?[\w:-]+(?:\s+[\w:-]+(?:=(?:"[^"]*"|'[^']*'))?)*\s*\/?&gt;/g, (tag) => {
            let output = tag.replace(/^(&lt;\/?)([\w:-]+)/, (_, open, name) => `<span class="cs-syn-punctuation">${open}</span><span class="cs-syn-tag">${name}</span>`);
            output = output.replace(/([\w:-]+)(=)("[^"]*"|'[^']*')/g, '<span class="cs-syn-attr">$1</span><span class="cs-syn-punctuation">$2</span><span class="cs-syn-string">$3</span>');
            output = output.replace(/(\/?&gt;)$/, '<span class="cs-syn-punctuation">$1</span>');
            return output;
          });
        }

        function highlightScript(code, isJson = false) {
          let escaped = escapeHtml(code);
          const rules = isJson ? [
            [/"(?:\\.|[^"\\])*"/g, 'cs-syn-string']
          ] : [
            [/\/\*[\s\S]*?\*\//g, 'cs-syn-comment'],
            [/\/\/.*$/gm, 'cs-syn-comment'],
            [/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/g, 'cs-syn-string']
          ];
          escaped = stashTokens(escaped, rules);
          escaped = escaped.replace(/\b(\d+(?:\.\d+)?)\b/g, '<span class="cs-syn-number">$1</span>');
          const keywordPattern = isJson
            ? /\b(true|false|null)\b/g
            : /\b(const|let|var|function|return|if|else|for|while|switch|case|break|continue|new|class|extends|import|from|export|default|async|await|try|catch|finally|throw|this|true|false|null|undefined)\b/g;
          escaped = escaped.replace(keywordPattern, '<span class="cs-syn-keyword">$1</span>');
          if (isJson) escaped = escaped.replace(/&quot;([^"]+)&quot;(?=\s*:)/g, '<span class="cs-syn-attr">&quot;$1&quot;</span>');
          return escaped;
        }

        function highlightCss(code) {
          let escaped = escapeHtml(code);
          escaped = stashTokens(escaped, [
            [/\/\*[\s\S]*?\*\//g, 'cs-syn-comment'],
            [/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, 'cs-syn-string']
          ]);
          escaped = escaped.replace(/(@[\w-]+)/g, '<span class="cs-syn-keyword">$1</span>');
          escaped = escaped.replace(/(^|[{};]\s*)([^{}]+)(?=\s*\{)/gm, (match, prefix, selector) => `${prefix}<span class="cs-syn-selector">${selector.trim()}</span>`);
          escaped = escaped.replace(/([a-z-]+)(\s*:)/gi, '<span class="cs-syn-attr">$1</span>$2');
          escaped = escaped.replace(/\b(\d+(?:\.\d+)?(?:px|em|rem|vh|vw|%|s|ms)?)\b/g, '<span class="cs-syn-number">$1</span>');
          return escaped;
        }

        function highlightMarkdown(code) {
          let escaped = escapeHtml(code);
          escaped = stashTokens(escaped, [
            [/```[\s\S]*?```/g, 'cs-syn-string'],
            [/`[^`\n]+`/g, 'cs-syn-string']
          ]);
          escaped = escaped.replace(/^(#{1,6}.*)$/gm, '<span class="cs-syn-keyword">$1</span>');
          escaped = escaped.replace(/(\*\*[^*]+\*\*|__[^_]+__)/g, '<span class="cs-syn-attr">$1</span>');
          escaped = escaped.replace(/(\[[^\]]+\]\([^)]+\))/g, '<span class="cs-syn-selector">$1</span>');
          escaped = escaped.replace(/^(>.*)$/gm, '<span class="cs-syn-comment">$1</span>');
          return escaped;
        }

        function highlightCode(code, language) {
          if (language === 'html') return highlightHtml(code);
          if (language === 'css') return highlightCss(code);
          if (language === 'javascript') return highlightScript(code, false);
          if (language === 'json') return highlightScript(code, true);
          if (language === 'markdown') return highlightMarkdown(code);
          return escapeHtml(code);
        }

        function refreshBreadcrumbs() {
          if (!state.workspacePath) {
            refs.breadcrumbs.innerHTML = '<span class="cs-bc-item cs-bc-active">No folder open</span>';
            return;
          }

          const items = [`<span class="cs-bc-item">${escapeHtml(getBaseName(state.workspacePath) || state.workspacePath)}</span>`];
          if (state.activeFilePath) {
            const rel = normalizePath(state.activeFilePath).replace(normalizePath(state.workspacePath), '').split('/').filter(Boolean);
            rel.forEach((segment, index) => {
              items.push('<span class="cs-bc-sep">›</span>');
              items.push(`<span class="cs-bc-item ${index === rel.length - 1 ? 'cs-bc-active' : ''}">${escapeHtml(segment)}</span>`);
            });
          }
          refs.breadcrumbs.innerHTML = items.join('');
        }

        function renderTerminal() {
          if (refs.terminalBody.dataset.initialized) {
            return;
          }

          refs.terminalBody.innerHTML = '';
          refs.terminalBody.dataset.initialized = 'true';
          
          addTermLine(refs.terminalBody, 'Code Studio Integrated Terminal');
          addTermLine(refs.terminalBody, `Workspace: ${state.workspacePath || 'none'}`);
          addPromptLine(refs.terminalBody, state.termState);

          refs.terminalBody.addEventListener('keydown', async (e) => {
            if (e.key === 'Enter') {
              const inp = refs.terminalBody.querySelector('.terminal-input:last-of-type');
              if (!inp || inp.disabled) return;
              
              const cmdLine = inp.value;
              inp.disabled = true;
              
              state.termState.cwd = state.workspacePath || state.termState.cwd;
              await processCommand(refs.terminalBody, state.termState, cmdLine);
              
              const nextInp = refs.terminalBody.querySelector('.terminal-input:last-of-type');
              if (nextInp) nextInp.focus();
            }
          });
        }

        function renderTabs() {
          if (!state.openTabs.length) {
            refs.tabsArea.innerHTML = '<div class="cs-tab cs-tab-empty"><span class="cs-tab-name">No file open</span></div>';
            return;
          }

          refs.tabsArea.innerHTML = state.openTabs.map((tab) => {
            const icon = getIconMeta(tab.name, tab.content);
            return `<div class="cs-tab ${tab.path === state.activeFilePath ? 'active' : ''}" data-path="${escapeHtml(tab.path)}">
              <span class="cs-tab-icon ${icon.cls}">${icon.text}</span>
              <span class="cs-tab-name">${escapeHtml(tab.name)}</span>
              ${tab.pendingSave ? '<span class="cs-tab-dirty">●</span>' : ''}
              <span class="cs-tab-close" data-close="${escapeHtml(tab.path)}">×</span>
            </div>`;
          }).join('');
        }

        function renderTreeEntries(dirPath, node, depth) {
          let html = '';
          sortEntries(node).forEach(([name, value]) => {
            const fullPath = joinPath(dirPath, name);
            const icon = getIconMeta(name, value);
            const isDir = isDirectory(value);
            const isCollapsed = state.collapsedDirs.has(fullPath);
            html += `<div class="cs-ft-row ${isDir ? 'cs-ft-dir' : 'cs-ft-file'} ${state.activeFilePath === fullPath ? 'active' : ''}" data-path="${escapeHtml(fullPath)}" data-dir="${isDir}" style="--depth:${depth}">
              <span class="cs-ft-toggle">${isDir ? (isCollapsed ? '▸' : '▾') : ''}</span>
              <span class="cs-ft-icon ${icon.cls}">${icon.text}</span>
              <span class="cs-ft-name">${escapeHtml(name)}</span>
            </div>`;
            if (isDir && !isCollapsed) html += renderTreeEntries(fullPath, value, depth + 1);
          });
          return html;
        }

        function renderWorkspaceTree() {
          if (!state.workspacePath || !isDirectory(getNode(state.workspacePath))) {
            refs.fileTree.innerHTML = '<div class="cs-ft-empty">Choose a folder to load files.</div>';
            return;
          }
          const treeHtml = renderTreeEntries(state.workspacePath, getNode(state.workspacePath), 0);
          refs.fileTree.innerHTML = treeHtml || '<div class="cs-ft-empty">This folder is empty.</div>';
        }

        function refreshWorkspaceChrome() {
          refs.workspaceLabel.textContent = state.workspacePath || 'No folder selected';
          refs.saveBtn.disabled = !state.activeFilePath;
          refs.runBtn.disabled = !state.workspacePath;
          refs.newFileBtn.disabled = !state.workspacePath;
          refs.newFolderBtn.disabled = !state.workspacePath;
          refs.openFolderTop.textContent = state.workspacePath ? 'Switch Folder' : 'Open Folder';
          refs.previewAddr.textContent = state.workspacePath ? `retrofs://${state.workspacePath}` : 'Choose a folder first';
          refreshBreadcrumbs();
          renderTerminal();
        }

        function refreshEditorDecorations() {
          const activeTab = getActiveTab();
          if (!activeTab) return;
          refs.codeHighlight.innerHTML = `${highlightCode(refs.codeInput.value, activeTab.language)}\n`;
          refs.statusLang.textContent = getLanguageLabel(activeTab.language);
          updateLineNumbers(refs.codeInput.value);
          syncEditorScroll();
          updateCursor();
        }

        function loadActiveTabIntoEditor() {
          const activeTab = getActiveTab();
          if (!activeTab) {
            refs.editorPane.classList.remove('active');
            refs.empty.style.display = 'flex';
            refs.statusLang.textContent = 'Plain Text';
            refs.statusCursor.textContent = 'Ln 1, Col 1';
            refs.saveBtn.disabled = true;
            return;
          }

          suppressInput = true;
          refs.codeInput.value = activeTab.content;
          refs.codeInput.dataset.path = activeTab.path;
          suppressInput = false;
          refs.editorPane.classList.add('active');
          refs.empty.style.display = 'none';
          refs.saveBtn.disabled = false;
          refreshEditorDecorations();
          refs.codeInput.focus();
        }

        function syncTabsFromFS() {
          state.openTabs = state.openTabs.filter((tab) => {
            const node = getNode(tab.path);
            if (typeof node !== 'string') {
              if (tab.saveTimer) clearTimeout(tab.saveTimer);
              return false;
            }
            if (!tab.pendingSave) tab.content = node;
            return true;
          });
          if (state.activeFilePath && !getTab(state.activeFilePath)) {
            state.activeFilePath = state.openTabs[0]?.path || null;
          }
        }

        function persistTab(tab) {
          if (!tab) return;
          if (tab.saveTimer) {
            clearTimeout(tab.saveTimer);
            tab.saveTimer = null;
          }
          tab.pendingSave = false;
          if (setNode(tab.path, tab.content)) updateStatus(`Saved ${tab.name}`);
          else updateStatus(`Could not save ${tab.name}`);
          renderTabs();
        }

        function scheduleSave(tab) {
          if (!tab) return;
          if (tab.saveTimer) clearTimeout(tab.saveTimer);
          tab.pendingSave = true;
          updateStatus(`Saving ${tab.name}…`);
          renderTabs();
          tab.saveTimer = setTimeout(() => persistTab(tab), 250);
        }

        function closeTab(path) {
          const tab = getTab(path);
          if (!tab) return;
          if (tab.pendingSave || tab.saveTimer) persistTab(tab);
          state.openTabs = state.openTabs.filter((entry) => entry.path !== path);
          if (state.activeFilePath === path) state.activeFilePath = state.openTabs[state.openTabs.length - 1]?.path || null;
          renderTabs();
          renderWorkspaceTree();
          refreshWorkspaceChrome();
          loadActiveTabIntoEditor();
        }

        function openFileInIDE(path) {
          const node = getNode(path);
          if (typeof node !== 'string') return;
          let tab = getTab(path);
          if (!tab) {
            tab = {
              path,
              name: getBaseName(path),
              language: getLanguageFromName(getBaseName(path)),
              content: node,
              pendingSave: false,
              saveTimer: null
            };
            state.openTabs.push(tab);
          }
          state.activeFilePath = path;
          renderTabs();
          renderWorkspaceTree();
          refreshWorkspaceChrome();
          loadActiveTabIntoEditor();
          updateStatus(`Opened ${tab.name}`);
        }

        function buildPreviewDocument() {
          if (!state.workspacePath) return null;
          const activeHtml = state.activeFilePath && getLanguageFromName(getBaseName(state.activeFilePath)) === 'html' ? state.activeFilePath : null;
          const htmlPath = activeHtml
            || (typeof getNode(joinPath(state.workspacePath, 'index.html')) === 'string' ? joinPath(state.workspacePath, 'index.html') : null)
            || (function findFirstHtml(dirPath) {
              const dir = getNode(dirPath);
              if (!isDirectory(dir)) return null;
              for (const [name, value] of sortEntries(dir)) {
                const fullPath = joinPath(dirPath, name);
                if (!isDirectory(value) && getLanguageFromName(name) === 'html') return fullPath;
              }
              for (const [name, value] of sortEntries(dir)) {
                if (!isDirectory(value)) continue;
                const nested = findFirstHtml(joinPath(dirPath, name));
                if (nested) return nested;
              }
              return null;
            })(state.workspacePath);

          if (!htmlPath) return null;

          let html = getLiveFileContent(htmlPath);
          const css = typeof getNode(joinPath(state.workspacePath, 'styles.css')) === 'string' ? getLiveFileContent(joinPath(state.workspacePath, 'styles.css')) : '';
          const jsPath = typeof getNode(joinPath(state.workspacePath, 'script.js')) === 'string'
            ? joinPath(state.workspacePath, 'script.js')
            : (typeof getNode(joinPath(state.workspacePath, 'app.js')) === 'string' ? joinPath(state.workspacePath, 'app.js') : '');
          const js = jsPath ? getLiveFileContent(jsPath) : '';

          html = html.replace(/<link[^>]+href=["'][^"']+\.css["'][^>]*>/gi, '');
          html = html.replace(/<script[^>]+src=["'][^"']+\.js["'][^>]*>\s*<\/script>/gi, '');

          if (css) {
            if (/<\/head>/i.test(html)) html = html.replace(/<\/head>/i, `<style>${css}</style></head>`);
            else html = `<style>${css}</style>${html}`;
          }
          if (js) {
            if (/<\/body>/i.test(html)) html = html.replace(/<\/body>/i, `<script>${js}<\/script></body>`);
            else html += `<script>${js}<\/script>`;
          }

          return { html, sourcePath: htmlPath };
        }

        function runPreview() {
          const activeTab = getActiveTab();
          if (activeTab?.pendingSave || activeTab?.saveTimer) persistTab(activeTab);
          const preview = buildPreviewDocument();
          if (!preview) {
            alert('No HTML file found in the selected folder.');
            return;
          }
          if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
          state.previewUrl = URL.createObjectURL(new Blob([preview.html], { type: 'text/html' }));
          refs.iframe.src = state.previewUrl;
          refs.previewAddr.textContent = `retrofs://${preview.sourcePath}`;
          refs.previewPanel.style.display = 'flex';
          refs.runBtn.classList.add('cs-live-active');
          updateStatus(`Previewing ${getBaseName(preview.sourcePath)}`);
        }

        function findInitialFile(dirPath) {
          const preferred = ['index.html', 'styles.css', 'script.js', 'app.js', 'README.md'];
          for (const name of preferred) {
            const path = joinPath(dirPath, name);
            if (typeof getNode(path) === 'string') return path;
          }
          const dir = getNode(dirPath);
          if (!isDirectory(dir)) return null;
          for (const [name, value] of sortEntries(dir)) {
            const fullPath = joinPath(dirPath, name);
            if (!isDirectory(value) && typeof value === 'string') return fullPath;
          }
          for (const [name, value] of sortEntries(dir)) {
            if (!isDirectory(value)) continue;
            const nested = findInitialFile(joinPath(dirPath, name));
            if (nested) return nested;
          }
          return null;
        }

        function renderPicker() {
          const directory = getNode(state.pickerPath);
          const safePath = isDirectory(directory) ? state.pickerPath : getNearestExistingDirectory(state.pickerPath);
          if (safePath !== state.pickerPath) state.pickerPath = safePath;
          refs.pickerCurrent.textContent = state.pickerPath;
          refs.pickerOpen.disabled = !isDirectory(getNode(state.pickerPath));

          const dirs = sortEntries(getNode(state.pickerPath)).filter(([, value]) => isDirectory(value));
          refs.pickerList.innerHTML = dirs.length
            ? dirs.map(([name]) => `<button class="cs-picker-row" data-path="${escapeHtml(joinPath(state.pickerPath, name))}"><span>📁</span><span>${escapeHtml(name)}</span></button>`).join('')
            : '<div class="cs-ft-empty">No subfolders here. You can still open the current folder.</div>';
        }

        function showPicker(startPath) {
          state.pickerPath = getNearestExistingDirectory(startPath || state.workspacePath || '/home/user');
          refs.picker.style.display = 'flex';
          renderPicker();
        }

        function hidePicker() {
          refs.picker.style.display = 'none';
        }

        function openWorkspace(path) {
          const normalizedPath = getNearestExistingDirectory(path);
          if (!isDirectory(getNode(normalizedPath))) return;
          state.workspacePath = normalizedPath;
          state.collapsedDirs.clear();
          state.openTabs.forEach((tab) => { if (tab.saveTimer) clearTimeout(tab.saveTimer); });
          state.openTabs = [];
          state.activeFilePath = null;
          hidePicker();
          renderWorkspaceTree();
          renderTabs();
          refreshWorkspaceChrome();
          loadActiveTabIntoEditor();
          const initialFile = findInitialFile(normalizedPath);
          if (initialFile) openFileInIDE(initialFile);
          else updateStatus(`Opened ${normalizedPath}`);
        }

        function createWorkspaceFolder() {
          if (!state.workspacePath) {
            showPicker('/home/user');
            return;
          }
          const baseDir = state.activeFilePath ? getParentAndName(state.activeFilePath).parentPath : state.workspacePath;
          const defaultName = getUniqueChildName(baseDir, 'New Folder');
          const inputName = prompt('New folder name:', defaultName);
          if (inputName === null) return;
          const folderName = inputName.trim();
          if (!isValidNodeName(folderName)) {
            alert('Please enter a valid folder name.');
            return;
          }
          const targetPath = joinPath(baseDir, folderName);
          if (!setNode(targetPath, {}, { overwrite: false })) {
            alert(`"${folderName}" already exists.`);
            return;
          }
          state.collapsedDirs.delete(baseDir);
          renderWorkspaceTree();
          refreshWorkspaceChrome();
          updateStatus(`Created folder ${folderName}`);
        }

        function createWorkspaceFile() {
          if (!state.workspacePath) {
            showPicker('/home/user');
            return;
          }
          const baseDir = state.activeFilePath ? getParentAndName(state.activeFilePath).parentPath : state.workspacePath;
          const defaultName = getUniqueChildName(baseDir, 'untitled.txt');
          const inputName = prompt('New file name:', defaultName);
          if (inputName === null) return;
          const fileName = inputName.trim();
          if (!isValidNodeName(fileName)) {
            alert('Please enter a valid file name.');
            return;
          }
          const targetPath = joinPath(baseDir, fileName);
          if (getNode(targetPath) !== undefined) {
            alert(`"${fileName}" already exists.`);
            return;
          }

          const templates = {
            html: '<!DOCTYPE html>\n<html>\n<head>\n  <title>New Page</title>\n</head>\n<body>\n  <h1>Hello RetroLinux</h1>\n</body>\n</html>',
            css: 'body {\n  margin: 0;\n  font-family: sans-serif;\n}\n',
            javascript: 'console.log("Hello from Code Studio");\n',
            json: '{\n  "name": "retro"\n}\n',
            markdown: '# New Document\n\nStart writing here.\n',
            text: ''
          };
          const language = getLanguageFromName(fileName);
          if (!setNode(targetPath, templates[language] ?? '', { overwrite: false })) {
            alert(`Could not create "${fileName}".`);
            return;
          }
          state.collapsedDirs.delete(baseDir);
          renderWorkspaceTree();
          refreshWorkspaceChrome();
          openFileInIDE(targetPath);
          updateStatus(`Created ${fileName}`);
        }

        refs.codeInput.addEventListener('input', () => {
          if (suppressInput) return;
          const activeTab = getActiveTab();
          if (!activeTab) return;
          activeTab.content = refs.codeInput.value;
          refreshEditorDecorations();
          scheduleSave(activeTab);
        });
        refs.codeInput.addEventListener('scroll', syncEditorScroll);
        refs.codeInput.addEventListener('keyup', updateCursor);
        refs.codeInput.addEventListener('click', updateCursor);
        refs.codeInput.addEventListener('keydown', (e) => {
          if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
            e.preventDefault();
            persistTab(getActiveTab());
            return;
          }
          if (e.key === 'Tab') {
            e.preventDefault();
            const start = refs.codeInput.selectionStart;
            const end = refs.codeInput.selectionEnd;
            refs.codeInput.value = `${refs.codeInput.value.slice(0, start)}  ${refs.codeInput.value.slice(end)}`;
            refs.codeInput.selectionStart = refs.codeInput.selectionEnd = start + 2;
            const activeTab = getActiveTab();
            if (!activeTab) return;
            activeTab.content = refs.codeInput.value;
            refreshEditorDecorations();
            scheduleSave(activeTab);
          }
        });

        refs.tabsArea.addEventListener('click', (e) => {
          const closeTarget = e.target.closest('[data-close]');
          if (closeTarget) {
            e.stopPropagation();
            closeTab(closeTarget.dataset.close);
            return;
          }
          const tab = e.target.closest('.cs-tab[data-path]');
          if (!tab) return;
          state.activeFilePath = tab.dataset.path;
          renderTabs();
          renderWorkspaceTree();
          refreshWorkspaceChrome();
          loadActiveTabIntoEditor();
        });

        refs.fileTree.addEventListener('click', (e) => {
          const row = e.target.closest('.cs-ft-row');
          if (!row) return;
          const path = row.dataset.path;
          if (row.dataset.dir === 'true') {
            if (state.collapsedDirs.has(path)) state.collapsedDirs.delete(path);
            else state.collapsedDirs.add(path);
            renderWorkspaceTree();
            return;
          }
          openFileInIDE(path);
        });

        refs.openFolderBtn.addEventListener('click', () => showPicker(state.workspacePath || '/home/user'));
        refs.openFolderTop.addEventListener('click', () => showPicker(state.workspacePath || '/home/user'));
        refs.newFileBtn.addEventListener('click', createWorkspaceFile);
        refs.newFolderBtn.addEventListener('click', createWorkspaceFolder);
        refs.saveBtn.addEventListener('click', () => persistTab(getActiveTab()));
        refs.runBtn.addEventListener('click', runPreview);
        body.querySelector('#cs-reload-preview').addEventListener('click', runPreview);
        body.querySelector('#cs-close-preview').addEventListener('click', () => {
          refs.previewPanel.style.display = 'none';
          refs.iframe.src = '';
          refs.runBtn.classList.remove('cs-live-active');
        });

        refs.terminalBody.addEventListener('click', () => {
          const input = refs.terminalBody.querySelector('.cs-t-input');
          if (input) input.focus();
        });

        // Initial setup calls
        renderTerminal();
        renderTabs();
        renderWorkspaceTree();
        refreshWorkspaceChrome();
        loadActiveTabIntoEditor();


        body.querySelector('#cs-ab-explorer').addEventListener('click', () => {
          if (state.sidePanelVisible === 'explorer') {
            state.sidePanelVisible = null;
            refs.explorerPanel.style.display = 'none';
            refs.agentPanel.style.display = 'none';
            refs.abExplorer.classList.remove('active');
            refs.abAgent.classList.remove('active');
          } else {
            state.sidePanelVisible = 'explorer';
            refs.explorerPanel.style.display = 'flex';
            refs.agentPanel.style.display = 'none';
            refs.abExplorer.classList.add('active');
            refs.abAgent.classList.remove('active');
          }
        });

        body.querySelector('#cs-ab-agent').addEventListener('click', () => {
          if (state.sidePanelVisible === 'agent') {
            state.sidePanelVisible = null;
            refs.explorerPanel.style.display = 'none';
            refs.agentPanel.style.display = 'none';
            refs.abExplorer.classList.remove('active');
            refs.abAgent.classList.remove('active');
          } else {
            state.sidePanelVisible = 'agent';
            refs.explorerPanel.style.display = 'none';
            refs.agentPanel.style.display = 'flex';
            refs.abExplorer.classList.remove('active');
            refs.abAgent.classList.add('active');
            
            // Sync current folder to terminal if needed
            state.termState.cwd = state.workspacePath || '/home/user';

            // Fill in existing settings
            const provider = localStorage.getItem(AGENT_STORAGE.provider) || 'openai';
            refs.agentProvider.value = provider;
            refs.agentModel.value = getAgentStoredModel(provider);
            refs.agentKey.value = getAgentStoredKey(provider);
          }
        });

        refs.agentSave.addEventListener('click', () => {
          const provider = refs.agentProvider.value;
          const model = refs.agentModel.value.trim();
          const key = refs.agentKey.value.trim();

          localStorage.setItem(AGENT_STORAGE.provider, provider);
          if (provider === 'openai') {
            localStorage.setItem(AGENT_STORAGE.openaiKey, key);
            localStorage.setItem(AGENT_STORAGE.openaiModel, model);
          } else if (provider === 'claude') {
            localStorage.setItem(AGENT_STORAGE.claudeKey, key);
            localStorage.setItem(AGENT_STORAGE.claudeModel, model);
          } else {
            localStorage.setItem(AGENT_STORAGE.geminiKey, key);
            localStorage.setItem(AGENT_STORAGE.geminiModel, model);
          }
          updateStatus('Agent settings synced.');
        });
        
        refs.agentProvider.addEventListener('change', () => {
          const provider = refs.agentProvider.value;
          refs.agentModel.value = getAgentStoredModel(provider);
          refs.agentKey.value = getAgentStoredKey(provider);
          refs.agentModel.placeholder = AGENT_DEFAULT_MODELS[provider];
        });

        const termToggle = body.querySelector('#cs-term-toggle');
        termToggle.addEventListener('click', () => {
          const isVisible = refs.terminalPanel.style.display !== 'none';
          refs.terminalPanel.style.display = isVisible ? 'none' : 'flex';
          termToggle.textContent = isVisible ? '⌄' : '⌃';
        });

        refs.pickerList.addEventListener('click', (e) => {
          const row = e.target.closest('.cs-picker-row');
          if (!row) return;
          state.pickerPath = row.dataset.path;
          renderPicker();
        });
        body.querySelector('#cs-picker-root').addEventListener('click', () => { state.pickerPath = '/'; renderPicker(); });
        body.querySelector('#cs-picker-home').addEventListener('click', () => { state.pickerPath = '/home/user'; renderPicker(); });
        body.querySelector('#cs-picker-up').addEventListener('click', () => {
          state.pickerPath = getParentAndName(state.pickerPath).parentPath || '/';
          renderPicker();
        });
        refs.pickerOpen.addEventListener('click', () => openWorkspace(state.pickerPath));
        body.querySelector('#cs-picker-cancel').addEventListener('click', hidePicker);

        registerWindowCleanup(winId, subscribeToFS(() => {
          if (!state.workspacePath) {
            renderPicker();
            return;
          }
          state.workspacePath = getNearestExistingDirectory(state.workspacePath);
          syncTabsFromFS();
          renderWorkspaceTree();
          renderTabs();
          refreshWorkspaceChrome();
          loadActiveTabIntoEditor();
        }));
        registerWindowCleanup(winId, () => {
          state.openTabs.forEach((tab) => {
            if (tab.pendingSave || tab.saveTimer) persistTab(tab);
          });
          if (state.previewUrl) URL.revokeObjectURL(state.previewUrl);
        });

        body.querySelector('#cs-ab-folder').addEventListener('click', () => {
          showPicker(state.workspacePath || '/home/user');
        });

        body.querySelector('#cs-ab-settings').addEventListener('click', () => {
          updateStatus('Settings panel coming soon...');
        });

        renderTabs();
        renderWorkspaceTree();
        refreshWorkspaceChrome();
        loadActiveTabIntoEditor();
        if (!state.workspacePath) {
          showPicker('/home/user');
        }

      }
    });
  }

})();
