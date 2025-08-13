#!/usr/bin/env gjs

// Set versions before importing
imports.gi.versions.Gtk = "4.0";
imports.gi.versions.Adw = "1";
imports.gi.versions.GLib = "2.0";
imports.gi.versions.Gio = "2.0";
imports.gi.versions.Gdk = "4.0";

const { GObject, Gtk, Adw, Gio, GLib, Gdk } = imports.gi;
const System = imports.system;

// Configurar caminhos de busca para diferentes ambientes
try {
  const scriptDir = GLib.path_get_dirname(System.programInvocationName);
  const projectRoot = GLib.path_get_dirname(scriptDir); // assume estrutura root/src/main.js
  const localSrc = GLib.build_filenamev([projectRoot, "src"]);

  if (!imports.searchPath.includes(localSrc))
    imports.searchPath.unshift(localSrc);

  if (
    GLib.file_test("/usr/local/share/wifi-analyzer", GLib.FileTest.IS_DIR) &&
    !imports.searchPath.includes("/usr/local/share/wifi-analyzer")
  ) {
    imports.searchPath.unshift("/usr/local/share/wifi-analyzer");
  }

  if (
    GLib.file_test("/app/share/wifi-analyzer", GLib.FileTest.IS_DIR) &&
    !imports.searchPath.includes("/app/share/wifi-analyzer")
  ) {
    imports.searchPath.unshift("/app/share/wifi-analyzer");
  }
} catch (e) {
  logError(e, "Falha ao configurar os caminhos de busca.");
}

// Importar a aplicação principal
const { WifiAnalyzerApplication } = imports.application;

function main(argv) {
  const application = new WifiAnalyzerApplication();
  return application.run(argv);
}

main(ARGV);
