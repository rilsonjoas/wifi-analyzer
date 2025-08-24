# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Architecture Overview

This is a modern GNOME application built with GJS (JavaScript for GNOME) that provides WiFi network analysis capabilities. The application uses GTK4 + Libadwaita for the UI and integrates with NetworkManager via D-Bus for network scanning.

### Core Components

- **Application Entry**: `src/main.js` - Entry point with path setup for different deployment environments
- **Main Application**: `src/application.js` - Adwaita application with global actions and settings management
- **Main Window**: `src/window.js` - Primary interface with network list and controls
- **Network Backend**: `src/networkScanner.js` - D-Bus integration with NetworkManager, fallback to nmcli/mock
- **Data Management**: `src/networkManager.js` - Network data processing and state management
- **Specialized Windows**:
  - `src/telemetryWindow.js` - Hunt mode with real-time tracking
  - `src/networkDetailsDialog.js` - Detailed network information
  - `src/preferencesWindow.js` - Application preferences
  - `src/networkManagementWindow.js` - Network management interface

### Key Features Architecture

- **Multi-layered Scanning**: D-Bus (primary) → nmcli (fallback) → mock data (development)
- **Real-time Updates**: Signal-based network state updates with Chart widgets
- **Theme System**: CSS-based theming with light/dark mode support
- **GPS Integration**: `src/gpsManager.js` for location-based network mapping
- **Data Export**: `src/dataExporter.js` supporting JSON/CSV/Sparrow-wifi formats
- **Channel Analysis**: `src/channelAnalyzer.js` and `src/advancedChannelAnalyzer.js`

## Build and Development Commands

### Meson Build System
```bash
# Setup build directory
meson setup builddir

# Compile the project
meson compile -C builddir

# Install locally (for system testing)
meson install -C builddir
```

### Flatpak Development
```bash
# Build and install Flatpak package
flatpak-builder build-dir com.example.WifiAnalyzer.json --install --user --force-clean

# Run the application
flatpak run com.example.WifiAnalyzer

# Run with debug output
flatpak run --env=WIFI_ANALYZER_DEBUG=1 com.example.WifiAnalyzer

# Run with mock data (no NetworkManager required)
flatpak run --env=WIFI_ANALYZER_DEV=1 com.example.WifiAnalyzer
```

### Testing and Development
```bash
# Simple connectivity test
./test_connectivity.sh

# Run basic GJS test
gjs test.js

# Direct execution (development mode)
gjs src/main.js
```

## Environment Variables

- `WIFI_ANALYZER_DEV=1` - Enables mock mode with simulated networks
- `WIFI_ANALYZER_DEBUG=1` - Enables detailed console logging
- `WIFI_ANALYZER_NO_NOTIF=1` - Disables notifications regardless of settings

## File Structure Patterns

### CSS Architecture
- `src/style.css` - Base styles
- `src/modern.css` - Modern UI tokens and components
- `src/advancedCharts.css` - Chart-specific styling

### Data Flow
1. `networkScanner.js` - Scans and discovers networks via D-Bus/nmcli
2. `networkManager.js` - Processes and manages network data
3. `window.js` - Displays networks in the main interface
4. Specialized components handle specific views (telemetry, details, etc.)

## GSettings Schema

Uses `com.example.WifiAnalyzer` schema with keys:
- `refresh-interval` (int) - Scan interval in seconds
- `enable-notifications` (bool) - Network change notifications
- `color-scheme` (string) - Theme preference
- `icon-variant` (string) - Icon style selection
- `enable-dev-mode` (bool) - Development features
- `enable-debug-logging` (bool) - Debug output

## Development Notes

### Path Resolution
The application supports multiple deployment scenarios with automatic path detection:
- Development: `./src/` relative paths
- Local install: `/usr/local/share/wifi-analyzer/`
- Flatpak: `/app/share/wifi-analyzer/`

### Network Scanner Fallback Chain
1. D-Bus NetworkManager (primary)
2. nmcli command-line (fallback)
3. Mock data (development/testing)

### Chart System
Real-time charts use Cairo for custom drawing in `chartWidget.js` and `realtimeCharts.js`. Charts support signal strength over time, spectrum analysis, and channel mapping.

## Common Development Tasks

When working with network scanning functionality, always test with mock data first using `WIFI_ANALYZER_DEV=1` to avoid requiring actual WiFi hardware during development.

The application follows GNOME HIG patterns and uses Libadwaita components throughout. All UI strings should be marked for translation in the `po/` directory structure.