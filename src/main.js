#!/usr/bin/env gjs

// Set versions before importing
imports.gi.versions.Gtk = "4.0";
imports.gi.versions.Adw = "1";
imports.gi.versions.GLib = "2.0";
imports.gi.versions.Gio = "2.0";
imports.gi.versions.Gdk = "4.0";

const { GLib } = imports.gi;
const System = imports.system;

// Configurar caminhos de busca para diferentes ambientes
const scriptDir = GLib.path_get_dirname(System.programInvocationName);
const projectRoot = GLib.path_get_dirname(scriptDir); // assume estrutura root/src/main.js
const localSrc = GLib.build_filenamev([projectRoot, 'src']);

// Adicionar caminhos de busca baseados no ambiente
if (!imports.searchPath.includes(localSrc)) imports.searchPath.unshift(localSrc);

// Caminho de instalação local
if (GLib.file_test("/usr/local/share/wifi-analyzer", GLib.FileTest.IS_DIR) && !imports.searchPath.includes("/usr/local/share/wifi-analyzer")) {
  imports.searchPath.unshift("/usr/local/share/wifi-analyzer");
}

// Caminho Flatpak
if (GLib.file_test("/app/share/wifi-analyzer", GLib.FileTest.IS_DIR) && !imports.searchPath.includes("/app/share/wifi-analyzer")) {
  imports.searchPath.unshift("/app/share/wifi-analyzer");
}

const { WifiAnalyzerApplication } = imports.application;

function main(argv) {
  const application = new WifiAnalyzerApplication();
  return application.run(argv);
}

// Run the application
main(ARGV);
