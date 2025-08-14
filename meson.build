project('wifi-analyzer',
  version: '1.0.0',
  meson_version: '>= 0.59.0',
  license: 'GPL-3.0-or-later',
)

app_id = 'com.example.WifiAnalyzer'
prefix = get_option('prefix')
bindir = prefix / get_option('bindir')
datadir = prefix / get_option('datadir')

# Install main script
install_data('src/main.js', 
  install_dir: bindir, 
  rename: 'wifi-analyzer',
  install_mode: 'rwxr-xr-x'
)

# Install source files
install_data([
  'src/application.js',
  'src/window.js',
  'src/networkScanner.js',
  'src/networkManager.js',
  'src/chartWidget.js',
  'src/realtimeCharts.js',
  'src/channelAnalyzer.js',
  'src/advancedChannelAnalyzer.js',
  'src/preferencesWindow.js',
  'src/themeSelector.js',
  'src/gpsManager.js',
  'src/advancedNetworkAnalyzer.js',
  'src/dataExporter.js',
  'src/networkDetailsDialog.js',
  'src/telemetryWindow.js',
  'src/connectionManager.js',
  'src/networkManagementWindow.js',
  'src/style.css',
  'src/advancedCharts.css',
  'src/modern.css',
], install_dir: datadir / 'wifi-analyzer')

# Desktop file (copy as-is for now)
install_data('data/com.example.WifiAnalyzer.desktop.in',
  install_dir: datadir / 'applications',
  rename: app_id + '.desktop'
)

# GSchema
gnome = import('gnome')
gschema_dir = datadir / 'glib-2.0' / 'schemas'
install_data('data/com.example.WifiAnalyzer.gschema.xml',
  install_dir: gschema_dir
)
gnome.post_install(
  gtk_update_icon_cache: true,
  update_desktop_database: true,
  glib_compile_schemas: true,
)

# Metainfo (copy as-is for now)
install_data('data/com.example.WifiAnalyzer.metainfo.xml.in',
  install_dir: datadir / 'metainfo',
  rename: app_id + '.metainfo.xml'
)

# Icons
install_data('data/icons/hicolor/scalable/apps/com.example.WifiAnalyzer.svg',
  install_dir: datadir / 'icons' / 'hicolor' / 'scalable' / 'apps'
)
install_data('data/icons/hicolor/symbolic/apps/com.example.WifiAnalyzer-symbolic.svg',
  install_dir: datadir / 'icons' / 'hicolor' / 'symbolic' / 'apps'
)
install_data('data/icons/hicolor/scalable/apps/com.example.WifiAnalyzer-alt1.svg',
  install_dir: datadir / 'icons' / 'hicolor' / 'scalable' / 'apps'
)
install_data('data/icons/hicolor/scalable/apps/com.example.WifiAnalyzer-alt2.svg',
  install_dir: datadir / 'icons' / 'hicolor' / 'scalable' / 'apps'
)