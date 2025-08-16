# WiFi Analyzer - Advanced WiFi Scanner

> Status: **Alpha 2** – All core features are being implemented. The project is now focused on bug fixes, polishing, and ensuring flawless operation.

## 🚀 Main Features

### 📊 Basic WiFi Analysis
- **Real-time scanning** of nearby WiFi networks (2.4/5/6 GHz)
- **Dynamic charts**: signal vs time, spectrum, channel map, signal strength
- **Organized list** with detailed info for each network
- **Multi-selection** for comparing multiple networks
- **Band grouping** and smart sorting

### 🎯 Hunt Mode (Advanced Tracking)
- **Hunt Mode** for targeted network tracking
- **Live telemetry** with signal history
- **Trend analysis** (improving/worsening/stable)
- **Dedicated telemetry interface** with charts and stats

### 📍 GPS Integration
- **Automatic location** with GPS coordinates
- **Network mapping** by location
- **Precise positioning** for geographic analysis
- **GPS simulation** for testing (when hardware is unavailable)

### 🔍 Advanced Network Details
- **Full info dialog** for each network (ℹ️ button)
- **Security analysis** with levels and recommendations
- **Distance estimation** based on signal strength
- **Manufacturer lookup** via OUI
- **Detection history** and signal statistics

### 📁 Export & Import
- **Multiple formats**: JSON, CSV, Sparrow-wifi compatible
- **Selective export** of specific networks or full sets
- **Full compatibility** with Sparrow-wifi data
- **Import existing data** for analysis

## Technologies
- **GJS** (JavaScript for GNOME)
- **GTK4 + Libadwaita** (modern UI, ViewStack, HeaderBar, Dialogs, Preferences, Toasts)
- **D‑Bus (NetworkManager)** for device and Access Point discovery
- **Fallback nmcli** when D‑Bus is unavailable
- **Internal mock (Dev Mode)** for testing without real hardware
- **Cairo** (custom chart drawing)
- **GSettings** (persistent preferences: refresh interval, theme, icons, notifications, dev/debug)
- **Notification system** with throttling (cooldowns, initial silence, time window limits)
- **Flatpak** (packaging and sandboxing)
- **Modern CSS** with theme tokens (root-light / root-dark) and styled components (pills, signal bars, band separators)

## Implemented Features
- Periodic scan with smart fallback (D‑Bus → nmcli → mock)
- Band grouping and signal strength sorting
- Visual indicators: intensity icon, progress bar, pills (security, channel, band)
- Real-time charts (base ready for expansion)
- Initial channel analysis (suggestions for 2.4 GHz and 5 GHz)
- Persistent preferences (theme, icons, dev mode, debug, notifications, interval)
- Dynamic theme (ready tokens + root-light/root-dark classes)
- Controlled notifications: new networks, disappeared networks, sudden signal drops

## Roadmap / Next Steps
- Polish and bugfix: focus on stability and flawless operation
- Extend visual redesign to all pages and charts
- Refine channel analysis (6 GHz, future channel width)
- Performance optimization (incremental diff instead of full list rebuild)
- Network filter/search
- More metrics in charts (noise, temporal variation, stability)
- Accessibility: visible focus, high contrast, color reviews
- Complete internationalization (existing `po/` structure)
- Create user manual and documentation
  Add donation button
- Add new translations (French, Spanish, etc.)
- Improve onboarding and help dialogs
- Expand developer documentation

## Environment Variables
| Variable | Effect |
|----------|--------|
| `WIFI_ANALYZER_DEV=1` | Enables mock mode (generates simulated networks) |
| `WIFI_ANALYZER_DEBUG=1` | Enables detailed console logging |
| `WIFI_ANALYZER_NO_NOTIF=1` | Disables network notifications regardless of user preference |

## Preferences (GSettings)
Schema: `com.example.WifiAnalyzer`
- `refresh-interval` (int, seconds)
- `enable-notifications` (bool)
- `color-scheme` (`system`, `light`, `dark`)
- `icon-variant` (`default`, `alt1`, `alt2`)
- `enable-dev-mode` (bool)
- `enable-debug-logging` (bool)

## Build & Run (Flatpak / Meson)
Prerequisites: Flatpak & Flatpak Builder installed.

1. (Optional) Inspect dependencies in the manifest at `build-dir/files/manifest.json` (or future main manifest).
2. Compile via Meson for local development (outside sandbox):
```
meson setup build
meson compile -C build
./build/wifi-analyzer   # if binary/script is generated locally
```
3. Run inside Flatpak (default during development):
```
flatpak run --env=WIFI_ANALYZER_DEBUG=1 com.example.WifiAnalyzer
```
(If installing locally via `flatpak-builder` first:)
```
flatpak-builder build-dir com.example.WifiAnalyzer.json --install --user --force-clean
flatpak run com.example.WifiAnalyzer
```

## Structure (Summary)
- `src/` Main code (application.js, window.js, networkManager.js, *charts*, *analyzers*)
- `data/` .desktop files, metainfo, GSettings schemas, icons
- `po/` Internationalization
- `modern.css` Custom styles

## Contributing
Contributions are welcome at this mature stage:
1. Open an issue describing a bug or proposal.
2. For PRs: keep commits clear and explain changes in the context of UI/UX or backend.
3. Respect current style (GJS + Libadwaita patterns). Avoid unnecessary external dependencies.

## Stability Status
Internal APIs may still change (method names, network object structure, CSS tokens). Not recommended for distro packaging yet.

## License
GPL-3.0 (see About dialog / future LICENSE file).

---
Feedback, suggestions, and criticism are essential at this stage. Thank you for testing and supporting the project!