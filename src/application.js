const { GObject, Gtk, Gio, Adw, Gdk } = imports.gi;
const { WifiAnalyzerWindow } = imports.window;

var WifiAnalyzerApplication = GObject.registerClass(
  class WifiAnalyzerApplication extends Adw.Application {
    _init() {
      super._init({ application_id: "com.example.WifiAnalyzer", flags: Gio.ApplicationFlags.DEFAULT_FLAGS });
      
      // GSettings para aplicar preferências (sem acessar StyleManager ainda)
      this._settings = new Gio.Settings({ schema_id: "com.example.WifiAnalyzer" });
      
      const quit_action = new Gio.SimpleAction({ name: "quit" });
      quit_action.connect("activate", () => { this.quit(); });
      this.add_action(quit_action);
      this.set_accels_for_action("app.quit", ["<primary>q"]);
      const show_about_action = new Gio.SimpleAction({ name: "about" });
      show_about_action.connect("activate", () => { this._showAbout(); });
      this.add_action(show_about_action);
    }

    _applyAppearance() {
      try {
        const scheme = this._settings.get_string("color-scheme");
        const styleManager = Adw.StyleManager.get_default();
        
        // Aplicar esquema de cores
        switch (scheme) { 
          case 'light': 
            styleManager.set_color_scheme(Adw.ColorScheme.FORCE_LIGHT); 
            break; 
          case 'dark': 
            styleManager.set_color_scheme(Adw.ColorScheme.FORCE_DARK); 
            break; 
          default: 
            styleManager.set_color_scheme(Adw.ColorScheme.DEFAULT); 
        }
        
        // Atualizar tema de todas as janelas existentes
        const wins = this.get_windows();
        for (const w of wins) { 
          this._updateRootThemeClass(w); 
        }
        
        print(`Aplicando esquema de cores: ${scheme}`);
      } catch (e) {
        print('Erro ao aplicar aparência:', e.message);
      }
    }

    _applyIconVariant(window) {
      try {
        const variant = this._settings.get_string("icon-variant");
        let icon = 'com.example.WifiAnalyzer';
        if (variant === 'alt1') icon = 'com.example.WifiAnalyzer-alt1';
        else if (variant === 'alt2') icon = 'com.example.WifiAnalyzer-alt2';
        
        window.set_icon_name(icon);
        print(`Aplicando ícone: ${icon}`);
      } catch (e) {
        print('Erro ao aplicar ícone:', e.message);
      }
    }

    _applyIconToAllWindows() {
      try {
        const variant = this._settings.get_string("icon-variant");
        let icon = 'com.example.WifiAnalyzer';
        if (variant === 'alt1') icon = 'com.example.WifiAnalyzer-alt1';
        else if (variant === 'alt2') icon = 'com.example.WifiAnalyzer-alt2';
        
        // Atualizar ícone de todas as janelas existentes
        const wins = this.get_windows();
        for (const w of wins) { 
          w.set_icon_name(icon); 
          
          // Forçar redesenho do headerbar se necessário
          const headerbar = w.get_child()?.get_first_child?.();
          if (headerbar && headerbar.constructor.name === 'AdwHeaderBar') {
            headerbar.queue_draw();
          }
        }
        
        print(`Atualizando ícone para todas as janelas: ${icon}`);
      } catch (e) {
        print('Erro ao atualizar ícones:', e.message);
      }
    }

    _updateRootThemeClass(win) {
      try {
        const styleManager = Adw.StyleManager.get_default();
        const isDark = styleManager.get_dark();
        const root = win.get_content();
        if (!root) return;
        root.remove_css_class('root-dark'); root.remove_css_class('root-light');
        root.add_css_class(isDark ? 'root-dark' : 'root-light');
      } catch (e) {
        print('Erro ao atualizar classe do tema:', e.message);
      }
    }

    vfunc_activate() { 
      print("DEBUG: vfunc_activate iniciado");
      let { active_window } = this; 
      if (!active_window) {
        print("DEBUG: Criando nova janela");
        try {
          active_window = new WifiAnalyzerWindow(this); 
          print("DEBUG: Janela criada com sucesso");
        } catch (e) {
          print("ERRO: Falha ao criar janela:", e.message);
          return;
        }
        
        // Só agora que a aplicação está ativa, podemos inicializar temas e CSS
        if (!this._initialized) {
          print("DEBUG: Inicializando CSS e temas");
          try {
            this._loadCSS();
            print("DEBUG: CSS carregado");
            this._initializeThemes();
            print("DEBUG: Temas inicializados");
            this._initialized = true;
          } catch (e) {
            print("ERRO: Falha na inicialização:", e.message);
          }
        }
        
        // Aplicar ícone inicial baseado nas configurações
        print("DEBUG: Aplicando ícone");
        this._applyIconVariant(active_window);
      }
      print("DEBUG: Atualizando tema da janela");
      this._updateRootThemeClass(active_window); 
      print("DEBUG: Apresentando janela");
      active_window.present(); 
      print("DEBUG: vfunc_activate concluído");
    }

    _loadCSS() {
      try {
        const cssProvider = new Gtk.CssProvider();
        
        // CSS simplificado sem propriedades problemáticas
        const css = `
        @define-color accent_fg #3584e4;
        .wifi-strong { color: #2ec27e; }
        .wifi-medium { color: #f5c211; }
        .wifi-weak { color: #e01b24; }
        .symbolic-icon.accent { color: @accent_fg; }
        .wifi-chart { 
          background-color: @card_bg_color;
          border-radius: 12px;
          margin: 8px;
          padding: 12px;
        }
        `;
        
        cssProvider.load_from_data(css, -1);
        
        const display = Gdk.Display.get_default();
        if (display && cssProvider) {
          Gtk.StyleContext.add_provider_for_display(display, cssProvider, Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION);
        }
        console.log('DEBUG: CSS carregado');
      } catch (e) { 
        console.error('Erro ao carregar CSS:', e.message); 
      }
    }

    _getCSSPath() {
      const { GLib } = imports.gi;
      
      // Tentar diferentes caminhos baseados no ambiente
      const paths = [
        '/app/share/wifi-analyzer/modern.css',        // Flatpak
        '/usr/local/share/wifi-analyzer/modern.css',  // Instalação local
        GLib.build_filenamev([GLib.get_current_dir(), 'modern.css']), // Desenvolvimento
        GLib.build_filenamev([GLib.path_get_dirname(imports.system.programInvocationName), 'modern.css'])
      ];
      
      for (const path of paths) {
        if (GLib.file_test(path, GLib.FileTest.EXISTS)) {
          return path;
        }
      }
      
      return null;
    }

    _initializeThemes() {
      try {
        // Aplicar aparência inicial
        this._applyAppearance();
        
        // Conectar mudanças de configuração
        this._settings.connect("changed::color-scheme", () => this._applyAppearance());
        this._settings.connect("changed::icon-variant", () => this._applyIconToAllWindows());
      } catch (e) {
        print('Erro ao inicializar temas:', e.message);
      }
    }

    _showAbout() { 
      const about = new Adw.AboutWindow({ 
        transient_for: this.active_window, 
        modal: true, 
        application_name: "WiFi Analyzer", 
        application_icon: "com.example.WifiAnalyzer", 
        developer_name: "Rilson Joás", 
        version: "1.0.0", 
        developers: ["Rilson Joás"], 
        copyright: "© 2025 Rilson Joás", 
        license_type: Gtk.License.GPL_3_0, 
        website: "https://github.com/rilsonjoas/wifi-analyzer", 
        issue_url: "https://github.com/rilsonjoas/wifi-analyzer/issues",
        support_url: "https://github.com/rilsonjoas",
        comments: "Uma aplicação moderna para análise de redes Wi-Fi no GNOME.\n\nEste programa é software livre: você pode redistribuí-lo e/ou modificá-lo sob os termos da Licença Pública Geral GNU conforme publicada pela Free Software Foundation, seja a versão 3 da Licença, ou (a seu critério) qualquer versão posterior.\n\nEste programa é distribuído na esperança de que seja útil, mas SEM QUALQUER GARANTIA; sem mesmo a garantia implícita de COMERCIALIZAÇÃO ou ADEQUAÇÃO A UM PROPÓSITO PARTICULAR. Veja a Licença Pública Geral GNU para mais detalhes."
      }); 
      about.present(); 
    }
  }
);
