# RetroLinux

A fully interactive Linux desktop environment simulator built entirely with vanilla HTML, CSS, and JavaScript. Experience the nostalgia of early 2000s computing right in your browser -- complete with a boot sequence, login screen, draggable windows, a working file system, and over a dozen built-in applications.

---

## Live Demo

**[Try it live](https://sandrolomia.github.io/retrodesktop/)** -- no install, just click and play.

Or open `index.html` locally in any modern browser. No build tools, no dependencies, no server required.

---

## Features

### Desktop Environment
- **Boot screen & login flow** -- animated boot sequence with loading bar, followed by an XP-style login screen
- **Draggable, resizable windows** -- full window management with minimize, maximize, and close
- **Taskbar & start menu** -- functional taskbar with system tray, clock, and a categorized start menu
- **Right-click context menu** -- create new files/folders, open terminal, refresh desktop
- **Desktop icons** -- drag-and-drop support for files and folders on the desktop
- **System sounds** -- click, boot, and alert sounds (toggleable in Settings)

### Built-in Applications

| App | Description |
|-----|-------------|
| **Terminal** | Bash-like shell with 30+ commands (`ls`, `cd`, `cat`, `mkdir`, `grep`, `curl`, `top`, `neofetch`, and more) |
| **Files** | File explorer with breadcrumb navigation, drag-and-drop, rename, delete, and trash support |
| **Text Editor** | Notepad-style editor for creating and editing text files |
| **Web Browser** | Embedded iframe browser with address bar and navigation controls |
| **Calculator** | Fully functional calculator |
| **Paint** | Drawing application with brush, shapes, colors, and eraser |
| **Media Player** | Audio player with playlist, playback controls, and visualizer |
| **Code Studio** | VS Code-inspired IDE with file tree, syntax highlighting, and integrated AI assistant |
| **AI Agent** | Chat interface with desktop control capabilities (see below) |
| **Settings** | System sound configuration |
| **Computer** | System information viewer |
| **Trash** | Recycle bin with restore and permanent delete |

### Games
- **Minesweeper** -- classic mine-clearing puzzle
- **Snake** -- the timeless snake game
- **Tetris** -- falling blocks with scoring
- **2048** -- slide-and-merge tile game

### Virtual File System
- Persistent file system stored in `localStorage`
- Full directory structure (`/home/user/`, `/usr/`, `/etc/`, `/var/`)
- Create, edit, rename, move, and delete files and folders
- Trash bin with restore functionality

---

## AI Agent

The AI Agent can chat with you and, when **Desktop Control mode** is enabled, actually operate the simulator -- opening apps, creating files, typing commands in the terminal, clicking buttons, and more.

### Supported Providers
- **OpenAI** (default: `gpt-4o-mini`)
- **Google Gemini** (default: `gemini-1.5-flash`)
- **Anthropic Claude** (default: `claude-haiku-4-5-20251001`)

### Privacy & API Key Safety

> **Your API keys never leave your browser.**

- Keys are stored exclusively in your browser's `localStorage`
- They are sent directly from your browser to the respective AI provider's API (OpenAI, Google, or Anthropic)
- **No backend server, no intermediary, no logging** -- this is a purely static site
- Keys are never included in the source code or transmitted anywhere other than the provider's official API endpoint
- You can clear your keys at any time from the AI Agent settings panel
- **This repository is safe to publish on GitHub** -- it contains zero secrets

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Structure | Vanilla HTML |
| Styling | Vanilla CSS (4,500+ lines) |
| Logic | Vanilla JavaScript (4,800+ lines) |
| Fonts | Google Fonts (Tahoma, Pixelify Sans) |
| Storage | Browser `localStorage` |
| AI | Client-side API calls (OpenAI / Gemini / Claude) |

**Zero dependencies. Zero build steps. One `index.html` to rule them all.**

---

## Getting Started

```bash
# Clone the repository
git clone https://github.com/SandroLomia/retrodesktop.git

# Open in your browser
open index.html
```

To use the AI Agent:
1. Open the **AI Agent** app from the desktop or start menu
2. Select a provider (OpenAI, Gemini, or Claude)
3. Paste your API key and click Save
4. Start chatting -- enable **Desktop Control mode** to let the agent operate the simulator

---

## Project Structure

```
.
├── index.html    # Entry point -- boot screen, login, desktop, all app markup
├── styles.css    # All styles -- desktop, windows, apps, animations
├── app.js        # All logic -- window manager, file system, apps, AI agent
└── README.md     # You are here
```

---

## License

This is a fun project -- feel free to fork, remix, and have fun with it.
