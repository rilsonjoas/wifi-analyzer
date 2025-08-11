#!/usr/bin/env gjs

imports.gi.versions.Gtk = "4.0";
imports.gi.versions.Adw = "1";

const { GObject, Gtk, Gio, Adw } = imports.gi;

var TestApp = GObject.registerClass(
  class TestApp extends Adw.Application {
    _init() {
      super._init({ application_id: "com.example.Test", flags: Gio.ApplicationFlags.DEFAULT_FLAGS });
    }

    vfunc_activate() {
      let win = new Adw.ApplicationWindow({ application: this, title: "Test" });
      let label = new Gtk.Label({ label: "Hello World" });
      win.set_content(label);
      win.present();
    }
  }
);

const app = new TestApp();
app.run([]);
