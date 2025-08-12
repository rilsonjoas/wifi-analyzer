// themeSelector.js - Seletor de tema no estilo GNOME Text Editor

const { GObject, Gtk, Gio, Adw } = imports.gi;

var ThemeSelector = GObject.registerClass(
  {
    GTypeName: "ThemeSelector",
    Properties: {
      'theme': GObject.ParamSpec.string(
        'theme',
        'Theme',
        'Current theme selection',
        GObject.ParamFlags.READWRITE,
        'default'
      ),
    },
    Signals: {
      'theme-changed': {
        param_types: [GObject.TYPE_STRING]
      }
    }
  },
  class ThemeSelector extends Gtk.Widget {
    _init(params = {}) {
      super._init(params);
      
      this._theme = 'default';
      
      this._buildUI();
      this._setupStyleManager();
      this._loadSettings();
    }

    _buildUI() {
      // Container principal
      this._box = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        spacing: 12,
        hexpand: true,
        halign: Gtk.Align.CENTER,
        margin_top: 9,
        margin_bottom: 9,
        margin_start: 9,
        margin_end: 9,
      });

      // Botão "Seguir Sistema" (metade clara/metade escura)
      this._followButton = new Gtk.CheckButton({
        css_classes: ['theme-selector', 'follow'],
        hexpand: true,
        halign: Gtk.Align.CENTER,
        focus_on_click: false,
        tooltip_text: 'Seguir Sistema',
      });

      // Botão "Modo Claro"
      this._lightButton = new Gtk.CheckButton({
        css_classes: ['theme-selector', 'light'],
        hexpand: true,
        halign: Gtk.Align.CENTER,
        focus_on_click: false,
        tooltip_text: 'Modo Claro',
      });

      // Botão "Modo Escuro"  
      this._darkButton = new Gtk.CheckButton({
        css_classes: ['theme-selector', 'dark'],
        hexpand: true,
        halign: Gtk.Align.CENTER,
        group: this._lightButton,
        focus_on_click: false,
        tooltip_text: 'Modo Escuro',
      });

      // Configurar grupo de botões
      this._followButton.set_group(this._lightButton);

      // Conectar sinais
      this._followButton.connect('toggled', () => {
        if (this._followButton.get_active()) {
          this._setTheme('default');
        }
      });

      this._lightButton.connect('toggled', () => {
        if (this._lightButton.get_active()) {
          this._setTheme('light');
        }
      });

      this._darkButton.connect('toggled', () => {
        if (this._darkButton.get_active()) {
          this._setTheme('dark');
        }
      });

      // Adicionar botões ao container
      this._box.append(this._followButton);
      this._box.append(this._lightButton);
      this._box.append(this._darkButton);

      // Definir o box como child do widget
      this._box.set_parent(this);

      // Aplicar CSS name
      this.set_css_name('themeselector');
    }

    _setupStyleManager() {
      const styleManager = Adw.StyleManager.get_default();
      
      // Verificar se o sistema suporta esquemas de cor
      const systemSupportsColorSchemes = styleManager.get_system_supports_color_schemes();
      this._followButton.set_visible(systemSupportsColorSchemes);
      
      // Conectar mudanças do sistema
      styleManager.connect('notify::system-supports-color-schemes', () => {
        const supports = styleManager.get_system_supports_color_schemes();
        this._followButton.set_visible(supports);
      });

      styleManager.connect('notify::dark', () => {
        this._updateDarkClass();
      });

      this._updateDarkClass();
    }

    _loadSettings() {
      this._settings = new Gio.Settings({
        schema_id: "com.example.WifiAnalyzer",
      });

      // Carregar tema atual das configurações
      const currentScheme = this._settings.get_string("color-scheme");
      this._updateButtonsFromScheme(currentScheme);

      // Escutar mudanças nas configurações
      this._settings.connect("changed::color-scheme", () => {
        const scheme = this._settings.get_string("color-scheme");
        this._updateButtonsFromScheme(scheme);
      });
    }

    _updateButtonsFromScheme(scheme) {
      // Não disparar eventos durante a atualização programática
      this._settingFromCode = true;
      
      switch (scheme) {
        case 'force-light':
          this._lightButton.set_active(true);
          this._theme = 'light';
          break;
        case 'force-dark':
          this._darkButton.set_active(true);
          this._theme = 'dark';
          break;
        case 'default':
        default:
          this._followButton.set_active(true);
          this._theme = 'default';
          break;
      }
      
      this._settingFromCode = false;
    }

    _updateDarkClass() {
      const styleManager = Adw.StyleManager.get_default();
      const isDark = styleManager.get_dark();
      
      if (isDark) {
        this.add_css_class('dark');
      } else {
        this.remove_css_class('dark');
      }
    }

    _setTheme(theme) {
      if (this._theme === theme || this._settingFromCode) return;
      
      this._theme = theme;
      
      const styleManager = Adw.StyleManager.get_default();
      let schemeValue;
      
      switch (theme) {
        case 'light':
          styleManager.set_color_scheme(Adw.ColorScheme.FORCE_LIGHT);
          schemeValue = 'force-light';
          break;
        case 'dark':
          styleManager.set_color_scheme(Adw.ColorScheme.FORCE_DARK);
          schemeValue = 'force-dark';
          break;
        case 'default':
        default:
          styleManager.set_color_scheme(Adw.ColorScheme.DEFAULT);
          schemeValue = 'default';
          break;
      }
      
      // Salvar nas configurações
      this._settings.set_string("color-scheme", schemeValue);
      
      this.emit('theme-changed', theme);
      this.notify('theme');
    }

    get_theme() {
      return this._theme;
    }

    set_theme(theme) {
      this._setTheme(theme);
    }

    vfunc_dispose() {
      if (this._box) {
        this._box.unparent();
        this._box = null;
      }
      super.vfunc_dispose();
    }
  }
);
