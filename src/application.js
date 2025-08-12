// application.js

const { GObject, Gio, Gdk, Gtk, Adw, GLib } = imports.gi;
const { WifiAnalyzerWindow } = imports.window;
const { PreferencesWindow } = imports.preferencesWindow;

var WifiAnalyzerApplication = GObject.registerClass(
  class WifiAnalyzerApplication extends Adw.Application {
    _init() {
      super._init({
        application_id: "com.example.WifiAnalyzer",
        flags: Gio.ApplicationFlags.DEFAULT_FLAGS,
      });

      // Ações globais do aplicativo
      const quitAction = new Gio.SimpleAction({ name: "quit" });
      quitAction.connect("activate", () => this.quit());
      this.add_action(quitAction);
      this.set_accels_for_action("app.quit", ["<primary>q"]);

      const aboutAction = new Gio.SimpleAction({ name: "about" });
      aboutAction.connect("activate", () => this._showAbout());
      this.add_action(aboutAction);

      const preferencesAction = new Gio.SimpleAction({ name: "preferences" });
      preferencesAction.connect("activate", () => this._showPreferences());
      this.add_action(preferencesAction);

      // Carregar CSS uma vez na inicialização
      this._loadCSS();
    }

    vfunc_activate() {
      let window = this.active_window;

      if (!window) {
        window = new WifiAnalyzerWindow({ application: this });
      }

      window.present();
    }

    _loadCSS() {
      try {
        const provider = new Gtk.CssProvider();
        // Para desenvolvimento, usar caminho absoluto primeiro
        const currentDir = GLib.get_current_dir();
        const paths = [
          `${currentDir}/src/style.css`,                // Desenvolvimento (absoluto)
          "./src/style.css",                            // Desenvolvimento (relativo)
          "src/style.css",                               // Desenvolvimento (simples)
          "/usr/local/share/wifi-analyzer/style.css",  // Instalação local
          "/app/share/wifi-analyzer/style.css",         // Flatpak
        ];
        
        let loaded = false;
        for (const path of paths) {
          try {
            const file = Gio.File.new_for_path(path);
            if (file.query_exists(null)) {
              provider.load_from_path(path);
              loaded = true;
              print(`CSS carregado de: ${path}`);
              break;
            }
          } catch (e) {
            // Continuar tentando outros caminhos
          }
        }
        
        if (!loaded) {
          print("Aviso: Não foi possível carregar o arquivo CSS");
        }
        
        const display = Gdk.Display.get_default();
        if (display) {
          Gtk.StyleContext.add_provider_for_display(
            display,
            provider,
            Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
          );
        }
      } catch (e) {
        console.log("Erro ao carregar CSS:", e.message);
        // Continue sem o CSS personalizado
      }
    }

    _showAbout() {
      if (!this.active_window) return;

      // Use Adw.AboutWindow, que é o padrão moderno
      const about = new Adw.AboutWindow({
        transient_for: this.active_window,
        modal: true,
        application_name: "WiFi Analyzer",
        application_icon: "com.example.WifiAnalyzer",
        developer_name: "Rilson Joás",
        version: "1.0.0",
        developers: ["Rilson Joás <https://github.com/rilsonjoas>"],
        copyright: "© 2025 Rilson Joás",
        license_type: Gtk.License.GPL_3_0,
        website: "https://github.com/rilsonjoas/wifi-analyzer",
        issue_url: "https://github.com/rilsonjoas/wifi-analyzer/issues",
        comments: "Uma aplicação moderna para análise de redes Wi-Fi no GNOME.\n\nEste programa é software livre distribuído sob os termos da Licença Pública Geral GNU v3. Utiliza NetworkManager para escaneamento de redes WiFi e requer permissões apropriadas do sistema.",
      });
      about.present();
    }

    _showPreferences() {
      if (!this.active_window) return;
      
      const prefs = new PreferencesWindow(this.active_window);
      prefs.present();
    }
  }
);
