#!/usr/bin/env gjs

imports.gi.versions.Gtk = "4.0";
imports.gi.versions.Adw = "1";
imports.gi.versions.GLib = "2.0";
imports.gi.versions.Gio = "2.0";

const { GLib } = imports.gi;
const System = imports.system;

// Garante que o diretório local "src" esteja no searchPath quando rodando em desenvolvimento
const scriptDir = GLib.path_get_dirname(System.programInvocationName);
const projectRoot = GLib.path_get_dirname(scriptDir); // assume estrutura root/src/main.js
const localSrc = GLib.build_filenamev([projectRoot, 'src']);
if (!imports.searchPath.includes(localSrc)) imports.searchPath.unshift(localSrc);
// Mantém também caminho de instalação Flatpak se existir
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
