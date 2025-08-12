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
  }
);
