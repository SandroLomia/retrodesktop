// ======= RetroOS XP - Core System =======
(function() {
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
  try { fileSystem = JSON.parse(localStorage.getItem('retrofs')); } catch(e) {}
  if (!fileSystem || typeof fileSystem !== 'object') fileSystem = JSON.parse(JSON.stringify(defaultFS));
  function notifyListeners(listeners) {
    listeners.forEach((listener) => {
      try { listener(); } catch(e) {}
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
    } catch(e) {}
  }
  let trashBin = [];
  try { trashBin = JSON.parse(localStorage.getItem('retrotrash')) || []; } catch(e) { trashBin = []; }
  function saveTrash() {
    try {
      localStorage.setItem('retrotrash', JSON.stringify(trashBin));
      notifyListeners(trashListeners);
    } catch(e) {}
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
    document.getElementById('clock').textContent = `${h}:${m.toString().padStart(2,'0')} ${ampm}`;
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
    } catch(err) {}
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
        try { cleanup(); } catch(e) {}
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
      minesweeper: openMinesweeper, settings: openSettings, ide: openIDE
    };
    if (launchers[name]) launchers[name]();
  }

  // ======= TERMINAL =======
  function openTerminal() {
    const id = createWindow({
      title: 'Command Prompt', width: 680, height: 420, tbIcon: '>_', status: '',
      body: '<div class="terminal-body" id="TERBODY"></div>',
      statusbar: false,
      onReady: (winId) => {
        const body = document.getElementById(winId + '-body');
        const tb = body.querySelector('.terminal-body');
        tb.id = winId + '-term';
        initTerminal(winId, tb);
      }
    });
  }

  function initTerminal(winId, container) {
    const state = { history: [], histIdx: -1, cwd: '/home/user' };
    addTermLine(container, 'RetroLinux bash [Kernel 2.4.31]');
    addTermLine(container, 'Type "help" to see popular shell commands.\n');
    addPromptLine(container, state);

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
    line.innerHTML = `<span class="terminal-prompt">user@linux:${state.cwd}$</span>&nbsp;<input class="terminal-input" type="text" spellcheck="false" autocomplete="off">`;
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

  function processCommand(container, state, cmdLine) {
    const trimmed = cmdLine.trim();
    if (!trimmed) { addPromptLine(container, state); return; }
    const parts = trimmed.match(/(?:[^\s"]+|"[^"]*")+/g) || [];
    const cmd = parts[0].toLowerCase();
    const args = parts.slice(1).map(a => a.replace(/"/g, ''));
    let output = '';

    switch(cmd) {
      case 'help':
        output = `Available Linux commands:
  help        - Show this help
  clear       - Clear terminal screen
  ls          - List directory contents
  tree        - Show directory tree
  cd          - Change directory
  echo        - Display a message
  cat         - Display file contents
  mkdir       - Create a directory
  touch       - Create an empty file
  rm          - Delete a file or folder
  cp          - Copy a file or folder
  mv          - Move or rename a file
  date        - Show current date
  uptime      - Show system uptime
  uname       - Show system info
  ifconfig    - Show network config
  ping        - Ping a host
  ps          - Show running processes
  calc        - Open calculator
  nano        - Open text editor
  exit        - Close prompt`;
        break;
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
          inet addr:192.168.1.${Math.floor(Math.random()*254)+1}  Bcast:192.168.1.255  Mask:255.255.255.0
          UP BROADCAST RUNNING MULTICAST  MTU:1500  Metric:1
          RX packets:3101 errors:0 dropped:0 overruns:0 frame:0
          TX packets:2840 errors:0 dropped:0 overruns:0 carrier:0`;
        break;
      case 'ping': {
        const host = args[0] || 'localhost';
        const ip = host === 'localhost' ? '127.0.0.1' : `${Math.floor(Math.random()*223)+1}.${Math.floor(Math.random()*256)}.${Math.floor(Math.random()*256)}.${Math.floor(Math.random()*256)}`;
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
      case 'nano':
      case 'vi':
        if (!args[0]) {
          openNotepad();
          output = '';
          break;
        }
        const notePath = resolvePath(state.cwd, args[0]);
        const noteNode = getNode(notePath);
        if (isDirectory(noteNode)) {
          output = `${cmd}: ${args[0]}: Is a directory`;
          break;
        }
        openNotepadWith(getBaseName(notePath), notePath, typeof noteNode === 'string' ? noteNode : '');
        output = '';
        break;
      case 'exit':
        const winEl = container.closest('.window');
        if (winEl) closeWindow(winEl.id);
        return;
      default:
        output = `'${cmd}' is not recognized as an internal or external command,\noperable program or batch file.`;
    }
    if (output) addTermLine(container, output);
    addPromptLine(container, state);
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
    const btns = ['MC','MR','MS','M+','←','CE','C','±','7','8','9','/','4','5','6','*','1','2','3','-','0','.','=','+'];
    let btnHtml = '';
    btns.forEach(b => {
      let cls = 'calc-btn';
      if (['/','*','-','+'].includes(b)) cls += ' operator';
      if (b === '=') cls += ' equals';
      if (['CE','C'].includes(b)) cls += ' clear';
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
            } else if (['+','-','*','/'].includes(v)) {
              if (prev && op && !reset) { current = String(calc(parseFloat(prev), parseFloat(current), op)); }
              prev = current; op = v; reset = true;
            } else if (v === '=') {
              if (prev && op) { current = String(calc(parseFloat(prev), parseFloat(current), op)); prev = ''; op = ''; reset = true; }
            } else if (v === 'C') { current = '0'; prev = ''; op = ''; }
            else if (v === 'CE') { current = '0'; }
            else if (v === '←') { current = current.slice(0,-1) || '0'; }
            else if (v === '±') { current = String(-parseFloat(current)); }
            display.value = current;
          });
        });
      }
    });
  }
  function calc(a,b,op) { return op==='+' ? a+b : op==='-' ? a-b : op==='*' ? a*b : op==='/' ? (b===0 ? 'Error' : a/b) : 0; }

  // ======= PAINT =======
  function openPaint() {
    const colors = ['#000','#fff','#808080','#c0c0c0','#800000','#ff0000','#808000','#ffff00','#008000','#00ff00','#008080','#00ffff','#000080','#0000ff','#800080','#ff00ff','#ff8000','#ff69b4'];
    let colorHtml = colors.map((c,i) => `<div class="color-btn ${i===0?'active':''}" style="background:${c}" data-color="${c}"></div>`).join('');
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
        ctx.fillStyle = '#fff'; ctx.fillRect(0,0,640,400);
        let drawing = false, color = '#000', tool = 'brush', size = 2;
        canvas.addEventListener('mousedown', (e) => {
          drawing = true;
          const r = canvas.getBoundingClientRect();
          const x = e.clientX - r.left, y = e.clientY - r.top;
          if (tool === 'fill') { ctx.fillStyle = color; ctx.fillRect(0,0,640,400); drawing=false; return; }
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
                } catch(err) {}
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
          } catch(err) {}
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

  // ======= INTERNET EXPLORER =======
  function openInternet() {
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
        const r = Math.floor(Math.random()*rows), c = Math.floor(Math.random()*cols);
        if (!grid[r][c].mine) { grid[r][c].mine = true; placed++; }
      }
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
        if (grid[r][c].mine) continue;
        let cnt = 0;
        for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
          const nr = r+dr, nc = c+dc;
          if (nr>=0 && nr<rows && nc>=0 && nc<cols && grid[nr][nc].mine) cnt++;
        }
        grid[r][c].count = cnt;
      }
      render();
    }

    function render() {
      let html = `<div class="mine-header">
        <div class="mine-counter">${String(mineCount - flagCount).padStart(3,'0')}</div>
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
      if (r<0||r>=rows||c<0||c>=cols) return;
      const cell = grid[r][c];
      if (cell.revealed || cell.flagged) return;
      cell.revealed = true; revealed++;
      if (cell.mine) {
        gameOver = true;
        for (let rr=0;rr<rows;rr++) for (let cc=0;cc<cols;cc++) if(grid[rr][cc].mine) grid[rr][cc].revealed=true;
        setTimeout(() => { const face = container.querySelector('#mine-reset'); if(face) face.textContent='😵'; }, 50);
        return;
      }
      if (revealed === total - mineCount) {
        gameOver = true;
        setTimeout(() => { const face = container.querySelector('#mine-reset'); if(face) face.textContent='😎'; }, 50);
      }
      if (cell.count === 0) {
        for (let dr=-1;dr<=1;dr++) for(let dc=-1;dc<=1;dc++) revealCell(r+dr,c+dc);
      }
    }
    init();
  }

  // ======= SETTINGS =======
  function openSettings() {
    createWindow({
      title: 'System Settings', width: 320, height: 240, tbIcon: '⚙️',
      statusbar: false,
      body: `<div style="padding: 20px; font-family: 'Tahoma', sans-serif;">
        <h3 style="margin-top:0; font-size: 16px;">Audio Settings</h3>
        <label style="display:flex; align-items:center; gap: 8px; cursor: pointer; font-size: 13px; margin-top: 15px;">
          <input type="checkbox" id="toggle-sound" ${soundEnabled ? 'checked' : ''}>
          Enable System Sounds
        </label>
        <p style="color:#666; margin-top:20px; font-size: 12px; line-height: 1.4;">Use this to enable or disable clicks, alerts, and boot sounds in RetroLinux.</p>
      </div>`,
      onReady: (winId) => {
        const body = document.getElementById(winId + '-body');
        const cb = body.querySelector('#toggle-sound');
        cb.addEventListener('change', (e) => {
          soundEnabled = e.target.checked;
          if (soundEnabled) playSound('click');
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
          pickerOpen: body.querySelector('#cs-picker-open')
        };
        const state = {
          workspacePath: '',
          pickerPath: '/home/user',
          openTabs: [],
          activeFilePath: null,
          collapsedDirs: new Set(),
          previewUrl: null,
          sidePanelVisible: true
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
          const cwd = state.workspacePath || '/home/user';
          refs.terminalBody.innerHTML = `
            <div class="cs-t-line"><span class="cs-t-prompt">user@codestudio</span>:<span class="cs-t-dir">${escapeHtml(cwd)}</span>$ <span class="cs-t-cmd">open folder</span></div>
            <div class="cs-t-line cs-t-info">  → Workspace: ${escapeHtml(state.workspacePath || 'none')}</div>
            <div class="cs-t-line cs-t-info">  → Autosave: enabled</div>
            <div class="cs-t-line"><span class="cs-t-prompt">user@codestudio</span>:<span class="cs-t-dir">${escapeHtml(cwd)}</span>$ <span class="cs-t-cursor">▋</span></div>`;
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
        body.querySelector('#cs-ab-folder').addEventListener('click', () => showPicker(state.workspacePath || '/home/user'));
        body.querySelector('#cs-ab-settings').addEventListener('click', openSettings);
        body.querySelector('#cs-ab-explorer').addEventListener('click', () => {
          state.sidePanelVisible = !state.sidePanelVisible;
          refs.sidePanel.style.display = state.sidePanelVisible ? 'flex' : 'none';
          body.querySelector('#cs-ab-explorer').classList.toggle('active', state.sidePanelVisible);
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

        renderTabs();
        renderWorkspaceTree();
        refreshWorkspaceChrome();
        loadActiveTabIntoEditor();
        showPicker('/home/user');
      }
    });
  }

})();
