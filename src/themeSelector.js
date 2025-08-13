// theme-loader.js
// Utilitário para carregar e aplicar estilos de tema

const { Gtk, Gio, GLib } = imports.gi;

var ThemeLoader = class {
  constructor() {
    this._cssProvider = new Gtk.CssProvider();
    this._loaded = false;
  }

  loadThemeCSS() {
    if (this._loaded) return;

    // CSS inline com os estilos do seletor de tema
    const css = `
      /* Estilo base para checkbuttons do tema */
      checkbutton.selection-mode {
        background: none;
        border: none;
        min-width: 32px;
        min-height: 32px;
        border-radius: 50%;
        outline-offset: 2px;
        padding: 0;
        margin: 0;
      }

      checkbutton.selection-mode check {
        background: none;
        border: none;
        min-width: 32px;
        min-height: 32px;
        border-radius: 50%;
        margin: 0;
        padding: 0;
        box-shadow: inset 0 1px rgba(255, 255, 255, 0.1);
        transition: all 200ms ease;
      }

      /* Remover ícone de check */
      checkbutton.selection-mode check:checked {
        -gtk-icon-source: none;
        background-image: none;
        color: transparent;
      }

      /* Botão "Seguir Sistema" */
      checkbutton.selection-mode.theme-follow check {
        background: linear-gradient(to right, 
          @window_bg_color 0%, 
          @window_bg_color 50%, 
          @headerbar_bg_color 50%, 
          @headerbar_bg_color 100%);
        border: 2px solid @border_color;
      }

      /* Botão "Modo Claro" */
      checkbutton.selection-mode.theme-light check {
        background: @window_bg_color;
        border: 2px solid @border_color;
      }

      /* Botão "Modo Escuro" */
      checkbutton.selection-mode.theme-dark check {
        background: @headerbar_bg_color;
        border: 2px solid @border_color;
      }

      /* Estado hover */
      checkbutton.selection-mode:hover check {
        transform: scale(1.05);
        outline: 2px solid alpha(@accent_color, 0.3);
      }

      /* Estado selecionado */
      checkbutton.selection-mode:checked check {
        border: 3px solid @accent_color;
        outline: 2px solid alpha(@accent_color, 0.15);
        box-shadow: 0 0 0 1px alpha(@accent_color, 0.1);
      }

      /* Estado focus */
      checkbutton.selection-mode:focus check {
        outline: 2px solid @accent_color;
        outline-offset: 2px;
      }

      /* Estado ativo (pressed) */
      checkbutton.selection-mode:active check {
        transform: scale(0.95);
      }

      /* Variações para modo escuro */
      window.dark checkbutton.selection-mode.theme-follow check {
        background: linear-gradient(to right,
          @card_bg_color 0%,
          @card_bg_color 50%,
          @window_bg_color 50%,
          @window_bg_color 100%);
      }

      /* Container do seletor */
      .theme-selector-box {
        padding: 6px;
      }

      .theme-label {
        font-weight: 600;
        font-size: 0.9em;
        opacity: 0.8;
      }
    `;

    try {
      this._cssProvider.load_from_data(css, -1);
      this._loaded = true;
      print("DEBUG: CSS do tema carregado com sucesso");
    } catch (error) {
      print(`ERRO: Falha ao carregar CSS - ${error.message}`);
    }
  }

  applyToDisplay(display) {
    if (!this._loaded) {
      this.loadThemeCSS();
    }

    Gtk.StyleContext.add_provider_for_display(
      display,
      this._cssProvider,
      Gtk.STYLE_PROVIDER_PRIORITY_APPLICATION
    );
    print("DEBUG: CSS aplicado ao display");
  }

  // Método para carregar CSS de arquivo (alternativo)
  loadFromFile(cssFilePath) {
    try {
      const file = Gio.File.new_for_path(cssFilePath);
      if (file.query_exists(null)) {
        this._cssProvider.load_from_file(file);
        this._loaded = true;
        print(`DEBUG: CSS carregado do arquivo: ${cssFilePath}`);
        return true;
      } else {
        print(`ERRO: Arquivo CSS não encontrado: ${cssFilePath}`);
        return false;
      }
    } catch (error) {
      print(`ERRO: Falha ao carregar CSS do arquivo - ${error.message}`);
      return false;
    }
  }

  get cssProvider() {
    return this._cssProvider;
  }
};
