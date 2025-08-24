const { GObject, Gtk, Adw, Gio } = imports.gi;

// O ID do schema deve corresponder exatamente ao definido no seu arquivo .gschema.xml
const APP_ID = "com.example.WifiAnalyzer";

var PreferencesWindow = GObject.registerClass(
  {
    GTypeName: "PreferencesWindow",
  },
  class PreferencesWindow extends Adw.PreferencesWindow {
    _init(parent) {
      super._init({
        transient_for: parent,
        modal: true,
        title: "Preferências do WiFi Analyzer",
        search_enabled: false,
      });

      this.settings = new Gio.Settings({ schema_id: APP_ID });

      this.add(this._createGeneralPage());
      this.add(this._createDeveloperPage());
    }

    _createGeneralPage() {
      const page = new Adw.PreferencesPage({
        title: "Geral",
        icon_name: "preferences-system-symbolic",
      });

      const scanningGroup = new Adw.PreferencesGroup({
        title: "Monitoramento de Rede",
        description: "Configure como o aplicativo busca por redes.",
      });
      page.add(scanningGroup);

      // Opção para o intervalo de atualização
      const intervalRow = new Adw.ActionRow({
        title: "Intervalo de Scan Automático",
        subtitle: "Tempo em segundos entre cada busca por redes.",
      });
      const intervalSpinButton = new Gtk.SpinButton({
        adjustment: new Gtk.Adjustment({
          lower: 3, // Limite mínimo de 3 segundos
          upper: 120, // Limite máximo de 2 minutos
          step_increment: 1,
        }),
        valign: Gtk.Align.CENTER,
        numeric: true,
      });
      intervalRow.add_suffix(intervalSpinButton);
      intervalRow.activatable_widget = intervalSpinButton;
      scanningGroup.add(intervalRow);
      this.settings.bind("refresh-interval", intervalSpinButton.get_adjustment(), "value", Gio.SettingsBindFlags.DEFAULT);

      // Opção para habilitar/desabilitar notificações
      const notifRow = new Adw.ActionRow({
        title: "Notificações de Rede",
        subtitle: "Alertas quando redes aparecem/desaparecem ou sinal cai.",
      });
      const notifSwitch = new Gtk.Switch({ valign: Gtk.Align.CENTER });
      notifRow.add_suffix(notifSwitch);
      notifRow.activatable_widget = notifSwitch;
      scanningGroup.add(notifRow);
      this.settings.bind("enable-notifications", notifSwitch, "active", Gio.SettingsBindFlags.DEFAULT);

      // Opção para habilitar/desabilitar GPS
      const gpsRow = new Adw.ActionRow({
        title: "Rastreamento GPS",
        subtitle: "Usar GPS para mapear localização das redes WiFi.",
      });
      const gpsSwitch = new Gtk.Switch({ valign: Gtk.Align.CENTER });
      gpsRow.add_suffix(gpsSwitch);
      gpsRow.activatable_widget = gpsSwitch;
      scanningGroup.add(gpsRow);
      this.settings.bind("enable-gps", gpsSwitch, "active", Gio.SettingsBindFlags.DEFAULT);

      // --- Grupo de Localização ---
      const localizationGroup = new Adw.PreferencesGroup({
        title: "Localização e Idioma",
        description: "Configure as preferências de idioma da aplicação.",
      });
      page.add(localizationGroup);

      // Opção para seleção de idioma
      const languageRow = new Adw.ComboRow({
        title: "Idioma da Interface",
        subtitle: "Selecione o idioma para textos e exportações",
        model: new Gtk.StringList({ 
          strings: ["Sistema (Automático)", "Português (Brasil)", "English (US)"] 
        }),
        selected: this._getLanguageIndex()
      });
      
      // Conectar mudança de idioma
      languageRow.connect('notify::selected', () => {
        const selectedIndex = languageRow.get_selected();
        const languages = ['system', 'pt-BR', 'en-US'];
        this.settings.set_string("language", languages[selectedIndex]);
        
        // Mostrar aviso sobre reinicialização
        const toast = new Adw.Toast({
          title: "Reinicie a aplicação para aplicar as mudanças de idioma",
          timeout: 5
        });
        this.get_root().add_toast(toast);
      });
      
      localizationGroup.add(languageRow);

      // --- Grupo de Perfis (Exemplo de funcionalidade futura) ---
      const profilesGroup = new Adw.PreferencesGroup({
        title: "Perfis de Monitoramento (Exemplo)",
        description: "Crie perfis com diferentes configurações de filtro e notificação.",
      });
      page.add(profilesGroup);

      const profileRow = new Adw.ComboRow({
        title: "Perfil Ativo",
        model: new Gtk.StringList({ strings: ["Padrão", "Casa", "Trabalho", "Viagem"] }),
        selected: 0,
      });
      profilesGroup.add(profileRow);

      return page;
    }

    _createDeveloperPage() {
      const page = new Adw.PreferencesPage({ title: "Desenvolvedor", icon_name: "applications-engineering-symbolic" });
      const devGroup = new Adw.PreferencesGroup({ title: "Opções de Desenvolvimento" });
      page.add(devGroup);

      const devModeRow = new Adw.ActionRow({ title: "Modo Mock (Dev)", subtitle: "Usar dados simulados ao invés de escanear o sistema." });
      const devSwitch = new Gtk.Switch({ valign: Gtk.Align.CENTER });
      devModeRow.add_suffix(devSwitch); devModeRow.activatable_widget = devSwitch; devGroup.add(devModeRow);
      this.settings.bind("enable-dev-mode", devSwitch, "active", Gio.SettingsBindFlags.DEFAULT);

      const debugRow = new Adw.ActionRow({ title: "Log de Depuração", subtitle: "Imprimir logs detalhados no console." });
      const debugSwitch = new Gtk.Switch({ valign: Gtk.Align.CENTER });
      debugRow.add_suffix(debugSwitch); debugRow.activatable_widget = debugSwitch; devGroup.add(debugRow);
      this.settings.bind("enable-debug-logging", debugSwitch, "active", Gio.SettingsBindFlags.DEFAULT);

      const infoRow = new Adw.ActionRow({ title: "Reinício Requerido", subtitle: "Alterne opções de dev e reinicie para efeito completo." });
      devGroup.add(infoRow);

      return page;
    }

    _getLanguageIndex() {
      const currentLanguage = this.settings.get_string("language");
      const languages = ['system', 'pt-BR', 'en-US'];
      const index = languages.indexOf(currentLanguage);
      return index >= 0 ? index : 0; // Default to system if not found
    }
  }
);
