const { GObject, Gtk, Gio, Adw, Gdk } = imports.gi;
const { WifiAnalyzerWindow } = imports.window;

// Load modern CSS + icon color tweaks
const cssProvider = new Gtk.CssProvider();
try {
  const display = Gdk.Display.get_default();
  if (display) {
    cssProvider.load_from_data(`
    @define-color accent_fg #3584e4;
    .wifi-strong { color: #2ec27e; }
    .wifi-medium { color: #f5c211; }
    .wifi-weak { color: #e01b24; }
    .symbolic-icon.accent { color: @accent_fg; }
    `);
    cssProvider.load_from_path('/app/share/wifi-analyzer/modern.css');
    Gtk.StyleContext.add_provider_for_display(display, cssProvider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
  }
} catch (e) { print('Could not load CSS file:', e.message); }

var WifiAnalyzerApplication = GObject.registerClass(
  class WifiAnalyzerApplication extends Adw.Application {
    _init() {
      super._init({ application_id: "com.example.WifiAnalyzer", flags: Gio.ApplicationFlags.DEFAULT_FLAGS });
      // GSettings para aplicar preferências iniciais
      this._settings = new Gio.Settings({ schema_id: "com.example.WifiAnalyzer" });
      this._applyAppearance();
      this._settings.connect("changed::color-scheme", () => this._applyAppearance());
      this._settings.connect("changed::icon-variant", () => this._applyAppearance());
      const quit_action = new Gio.SimpleAction({ name: "quit" });
      quit_action.connect("activate", () => { this.quit(); });
      this.add_action(quit_action);
      this.set_accels_for_action("app.quit", ["<primary>q"]);
      const show_about_action = new Gio.SimpleAction({ name: "about" });
      show_about_action.connect("activate", () => { this._showAbout(); });
      this.add_action(show_about_action);
    }

    _applyAppearance() {
      const scheme = this._settings.get_string("color-scheme");
      const variant = this._settings.get_string("icon-variant");
      const styleManager = Adw.StyleManager.get_default();
      switch (scheme) { case 'light': styleManager.set_color_scheme(Adw.ColorScheme.FORCE_LIGHT); break; case 'dark': styleManager.set_color_scheme(Adw.ColorScheme.FORCE_DARK); break; default: styleManager.set_color_scheme(Adw.ColorScheme.DEFAULT); }
      let icon = 'com.example.WifiAnalyzer';
      if (variant === 'alt1') icon = 'com.example.WifiAnalyzer-alt1';
      else if (variant === 'alt2') icon = 'com.example.WifiAnalyzer-alt2';
      // atualiza ícone de janelas existentes
      const wins = this.get_windows();
      for (const w of wins) { w.set_icon_name(icon); this._updateRootThemeClass(w); }
    }

    _updateRootThemeClass(win) {
      const styleManager = Adw.StyleManager.get_default();
      const isDark = styleManager.get_dark();
      const root = win.get_content();
      if (!root) return;
      root.remove_css_class('root-dark'); root.remove_css_class('root-light');
      root.add_css_class(isDark ? 'root-dark' : 'root-light');
    }

    vfunc_activate() { let { active_window } = this; if (!active_window) active_window = new WifiAnalyzerWindow(this); this._updateRootThemeClass(active_window); active_window.present(); }

    _showAbout() { const about = new Adw.AboutWindow({ transient_for: this.active_window, modal: true, application_name: "WiFi Analyzer", application_icon: "com.example.WifiAnalyzer-symbolic", developer_name: "Seu Nome", version: "1.0.0", developers: ["Rilson Joás <rilsonjoas10@gmail.com>"], copyright: "© 2025 Seu Nome", license_type: Gtk.License.GPL_3_0, website: "https://github.com/rilson-joas/wifi-analyzer", issue_url: "https://github.com/rilson-joas/wifi-analyzer/issues" }); about.present(); }
  }
);
