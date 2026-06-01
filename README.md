# PgStudio

An AI-native PostgreSQL desktop client for macOS, Windows, and Linux. Browse schemas, edit tables, write and run SQL with AI assistance — all in a fast native app.

## Features

- **Connection Manager** — Save multiple PostgreSQL connections with secure credential storage
- **SQL Editor** — CodeMirror-powered editor with syntax highlighting, autocomplete, and query history
- **Table Editor** — Browse and edit table data with multi-tab support, row selection, copy/export (CSV, JSON, SQL, HTML), and row deletion
- **Schema Browser** — Explore schemas, tables, columns, primary keys, and foreign key relationships
- **AI Assistant** — Natural language to SQL, query explanation, optimization, and chat (Anthropic Claude, OpenAI, or Google Gemini)
- **Query History** — Persistent history with deduplication and run counts
- **Saved Queries** — Bookmark frequently used queries
- **Export** — Native file save dialog for CSV, JSON, SQL, and styled HTML exports

## Install

### macOS

Download the latest `.dmg` from the [Releases](https://github.com/marcogbarcellos/pgstudio/releases) page, open it, and drag **PgStudio** into your Applications folder.

Since the app is not code-signed, macOS will quarantine it. After installing, run:

```sh
xattr -cr /Applications/PgStudio.app
```

Or install via Homebrew:

```sh
brew tap marcogbarcellos/tap
brew install --cask pgstudio
xattr -cr /Applications/PgStudio.app
```

### Windows

Download the latest `.msi` or `-setup.exe` from the [Releases](https://github.com/marcogbarcellos/pgstudio/releases) page and run the installer.

### Linux

Download from the [Releases](https://github.com/marcogbarcellos/pgstudio/releases) page:

- `.deb` for Debian/Ubuntu: `sudo dpkg -i PgStudio_*.deb`
- `.rpm` for Fedora/RHEL: `sudo rpm -i PgStudio_*.rpm`
- `.AppImage` for any distro: `chmod +x PgStudio_*.AppImage && ./PgStudio_*.AppImage`

## Development Setup

### Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [pnpm](https://pnpm.io/) 8+
- [Rust](https://rustup.rs/) (latest stable)

**Platform-specific:**

- **macOS:** Xcode Command Line Tools (`xcode-select --install`)
- **Linux:** `sudo apt install libwebkit2gtk-4.1-dev libappindicator3-dev librsvg2-dev patchelf libssl-dev libgtk-3-dev libsoup-3.0-dev javascriptcoregtk-4.1-dev`
- **Windows:** [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) with "Desktop development with C++"

### Install and Run

```sh
# Clone the repo
git clone https://github.com/marcogbarcellos/pgstudio.git
cd pgstudio

# Install frontend dependencies
pnpm install

# Run in development mode (starts Vite dev server + native window)
pnpm tauri dev
```

The app will open a native window pointing at `http://localhost:1420`.

### Build for Production

```sh
pnpm tauri build
```

Output will be in `src-tauri/target/release/bundle/`.

## Tech Stack

| Layer    | Technology                           |
| -------- | ------------------------------------ |
| Shell    | Tauri 2                              |
| Frontend | React 18, TypeScript, Vite           |
| Editor   | CodeMirror 6                         |
| Backend  | Rust, tokio-postgres, rusqlite       |
| AI       | Anthropic Claude / OpenAI / Google Gemini (optional) |
| State    | Zustand                              |
| Icons    | Lucide React                         |

## Project Structure

```
pgstudio/
├── src/                   # React frontend
│   ├── views/             # Page-level components
│   ├── components/        # Reusable UI (DataGrid, Sidebar, etc.)
│   ├── stores/            # Zustand stores
│   └── lib/tauri.ts       # Typed Tauri command bindings
├── src-tauri/             # Rust backend
│   ├── src/
│   │   ├── lib.rs         # App setup & plugin registration
│   │   ├── commands.rs    # Tauri command handlers
│   │   ├── db/            # PostgreSQL connection & queries
│   │   ├── storage/       # Local SQLite (history, saved queries, config)
│   │   └── ai/            # AI provider integrations
│   └── capabilities/      # Tauri v2 permission config
└── package.json
```

## Releases

Releases are fully automated via GitHub Actions. To publish a new version:

```sh
# 1. Bump version in package.json and src-tauri/tauri.conf.json
# 2. Commit the version bump
git add -A && git commit -m "Release v0.2.0"

# 3. Tag and push
git tag v0.2.0
git push origin main --tags
```

This triggers the release workflow which:
- Builds for **macOS** (aarch64 + x86_64 + universal), **Windows** (x64), and **Linux** (x64)
- Publishes a GitHub Release with all artifacts and SHA256 checksums
- Auto-updates the Homebrew cask formula

## Contributing

Contributions are welcome! Whether it's bug reports, feature requests, or pull requests — all help is appreciated.

1. **Fork** the repository
2. **Create a branch** for your feature or fix (`git checkout -b my-feature`)
3. **Commit** your changes (`git commit -m "Add my feature"`)
4. **Push** to your branch (`git push origin my-feature`)
5. **Open a Pull Request**

### Guidelines

- Keep PRs focused — one feature or fix per PR
- Follow existing code patterns (inline styles for UI, Tauri commands for backend)
- Test your changes with `pnpm tauri dev` before submitting
- For larger changes, open an issue first to discuss the approach

### Ideas for Contribution

- SSH tunnel connections
- Query result visualization (charts)
- Import from CSV/SQL files
- Keyboard shortcuts
- Themes and customization

## License

MIT
