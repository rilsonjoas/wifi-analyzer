// window.js

const { GObject, Gtk, Adw, Gio, GLib } = imports.gi;
const { ChartWidget } = imports.chartWidget;
const { ThemeSelector } = imports.themeSelector; // Nosso novo widget
const { NetworkManager } = imports.networkManager;

// Tentar importar os novos módulos
let NetworkDetailsDialog, TelemetryWindow;
try {
  const networkDetailsModule = imports.networkDetailsDialog;
  NetworkDetailsDialog = networkDetailsModule.NetworkDetailsDialog;
  print("DEBUG: NetworkDetailsDialog importado com sucesso");
} catch (error) {
  print(`ERRO: Falha ao importar NetworkDetailsDialog - ${error.message}`);
}

try {
  const telemetryModule = imports.telemetryWindow;
  TelemetryWindow = telemetryModule.TelemetryWindow;
  print("DEBUG: TelemetryWindow importado com sucesso");
} catch (error) {
  print(`ERRO: Falha ao importar TelemetryWindow - ${error.message}`);
}

var WifiAnalyzerWindow = GObject.registerClass(
  {
    GTypeName: "WifiAnalyzerWindow",
  },
  class WifiAnalyzerWindow extends Adw.ApplicationWindow {
    _init(params) {
      super._init({
        ...params,
        title: "WiFi Analyzer",
        default_width: 1200,
        default_height: 750,
      });

      this._selectedNetworks = new Map();
      this._lastNetworks = []; // Para referência
      this._telemetryWindow = null; // Janela de telemetria

      this._buildUI();
      this._setupThemeManagement();

      this._networkManager = new NetworkManager({
        application: this.application,
      });
      this._networkManager.connect("networks-updated", (_source, networks) =>
        this._onNetworksUpdated(networks)
      );
      this._networkManager.startRealTimeMonitoring();
    }

    _buildUI() {
      // Estrutura Principal com OverlaySplitView - SIDEBAR ATÉ O TOPO como Mission Center
      this._splitView = new Adw.OverlaySplitView({
        vexpand: true,
        hexpand: true,
        sidebar_position: Gtk.PackType.START,
        max_sidebar_width: 350,
        min_sidebar_width: 280,
      });

      // 1. Barra Lateral (lado esquerdo) - SEM HeaderBar própria
      this._splitView.set_sidebar(this._createSidebar());

      // 2. Conteúdo principal com ToolbarView (lado direito)
      const toolbarView = new Adw.ToolbarView();
      
      // Criar o painel de gráficos primeiro para obter o ViewSwitcher
      const chartsContent = this._createChartsPanel();
      
      // HeaderBar no conteúdo principal
      const headerBar = new Adw.HeaderBar({
        show_end_title_buttons: true,
        title_widget: chartsContent.viewSwitcher, // Mover as abas para o HeaderBar
      });

      // Menu "Hambúrguer" com ThemeSelector
      const menu = Gio.Menu.new();
      const themeSection = Gio.Menu.new();
      themeSection.append("Modo Claro", "app.theme::light");
      themeSection.append("Modo Escuro", "app.theme::dark");
      themeSection.append("Seguir Sistema", "app.theme::default");
      menu.append_section("Tema", themeSection);
      
      menu.append("Preferências", "app.preferences");
      menu.append("Sobre o WiFi Analyzer", "app.about");
      menu.append("Sair", "app.quit");

      const menuButton = new Gtk.MenuButton({
        menu_model: menu,
        icon_name: "open-menu-symbolic",
      });
      headerBar.pack_end(menuButton);

      // Botão para mostrar/esconder a barra lateral
      this._toggleSidebarButton = new Gtk.ToggleButton({
        icon_name: "sidebar-show-symbolic",
        active: true,
        tooltip_text: "Alternar Painel Lateral",
      });
      headerBar.pack_start(this._toggleSidebarButton);

      // Conectar toggle da sidebar
      this._toggleSidebarButton.connect('toggled', () => {
        this._splitView.show_sidebar = this._toggleSidebarButton.active;
      });

      toolbarView.add_top_bar(headerBar);
      toolbarView.set_content(chartsContent.viewStack); // Usar apenas o ViewStack
      
      this._splitView.set_content(toolbarView);
      
      this.set_content(this._splitView);

      // Ações da janela
      const deselectAllAction = new Gio.SimpleAction({ name: "deselectAll" });
      deselectAllAction.connect("activate", () =>
        this._selectAllNetworks(false)
      );
      this.add_action(deselectAllAction);

      // Ações para tema
      const themeAction = new Gio.SimpleAction({
        name: "theme",
        parameter_type: new GLib.VariantType('s'),
      });
      themeAction.connect("activate", (action, parameter) => {
        this._setTheme(parameter.get_string());
      });
      this.add_action(themeAction);
    }

    // Cria o painel de gráficos à direita
    _createChartsPanel() {
      const viewStack = new Adw.ViewStack({ vexpand: true, hexpand: true });
      const viewSwitcher = new Adw.ViewSwitcher({ 
        stack: viewStack,
        policy: Adw.ViewSwitcherPolicy.WIDE, // Para mostrar os títulos das abas
      });

      this._charts = new Map();
      const chartTypes = [
        { id: "signal-time", title: "Sinal vs Tempo", type: "line", icon: "emblem-favorite-symbolic" },
        { id: "spectrum", title: "Espectro", type: "spectrum", icon: "preferences-system-symbolic" },
        { id: "channel-map", title: "Mapa de Canais", type: "channel", icon: "view-grid-symbolic" },
        { id: "signal-bars", title: "Força do Sinal", type: "bars", icon: "view-list-symbolic" },
      ];

      chartTypes.forEach((chartInfo) => {
        const chart = new ChartWidget({ chart_type: chartInfo.type });
        this._charts.set(chartInfo.id, chart);
        
        // Adicionar ao ViewStack com ícone usando o método que funciona
        viewStack.add_titled(chart, chartInfo.id, chartInfo.title).set_icon_name(chartInfo.icon);
      });

      // Retornar tanto o ViewStack quanto o ViewSwitcher
      return {
        viewStack: viewStack,
        viewSwitcher: viewSwitcher
      };
    }

    // Cria a barra lateral à esquerda - COM HEADER PRÓPRIO como Mission Center
    _createSidebar() {
      const sidebarBox = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        css_classes: ["background"],
      });

      // Header da sidebar com título
      const sidebarHeader = new Adw.HeaderBar({
        show_end_title_buttons: false,
        title_widget: new Adw.WindowTitle({
          title: "Redes WiFi",
        }),
        css_classes: ["flat"],
      });
      
      // Botões de Seleção na Sidebar
      const selectionMenuModel = Gio.Menu.new();
      selectionMenuModel.append("Desselecionar Todas", "win.deselectAll");
      const selectionMenu = new Gtk.MenuButton({
        icon_name: "edit-select-all-symbolic",
        menu_model: selectionMenuModel,
        tooltip_text: "Opções de Seleção",
      });
      sidebarHeader.pack_start(selectionMenu);
      
      // Botão de atualizar na sidebar
      const refreshButton = new Gtk.Button({
        icon_name: "view-refresh-symbolic",
        tooltip_text: "Atualizar Redes",
      });
      refreshButton.connect('clicked', () => {
        this._networkManager.scanNetworks();
      });
      sidebarHeader.pack_end(refreshButton);

      // Botão de telemetria na sidebar
      const telemetryButton = new Gtk.Button({
        icon_name: "speedometer-symbolic",
        tooltip_text: "Abrir Telemetria e Hunt Mode",
      });
      telemetryButton.connect('clicked', () => {
        print("DEBUG: Botão de telemetria no header clicado!");
        print("DEBUG: TelemetryWindow disponível?", !!TelemetryWindow);
        this._openTelemetryWindow();
      });
      sidebarHeader.pack_end(telemetryButton);

      sidebarBox.append(sidebarHeader);

      // Lista de redes
      this._networksList = new Gtk.ListBox({
        selection_mode: Gtk.SelectionMode.NONE,
        css_classes: ["boxed-list"],
      });

      const scrolledWindow = new Gtk.ScrolledWindow({
        hscrollbar_policy: Gtk.PolicyType.NEVER,
        vexpand: true,
        child: this._networksList,
      });

      sidebarBox.append(scrolledWindow);

      return sidebarBox;
    }

    _onNetworksUpdated(networks) {
      this._lastNetworks = [...networks].sort((a, b) => b.signal - a.signal);

      // Automaticamente selecionar novas redes e manter o histórico para os gráficos
      const now = Date.now();
      networks.forEach((n) => {
        // Selecionar automaticamente redes que ainda não estão selecionadas
        if (!this._selectedNetworks.has(n.bssid)) {
          this._selectedNetworks.set(n.bssid, {
            name: n.ssid,
            history: [],
          });
        }
        
        // Manter o histórico para redes selecionadas
        if (this._selectedNetworks.has(n.bssid)) {
          const history = this._selectedNetworks.get(n.bssid).history;
          history.push({
            time: now,
            signal: n.signal,
            channel: n.channel,
            frequency: n.frequency,
          });
          // Limitar histórico a 100 pontos
          if (history.length > 100) history.shift();
        }
      });

      this._updateNetworksList();
      this._updateCharts();
    }

    _updateNetworksList() {
      // Limpa a lista antiga
      let child = this._networksList.get_first_child();
      while (child) {
        this._networksList.remove(child);
        child = this._networksList.get_first_child();
      }

      // Preenche com as redes novas
      this._lastNetworks.forEach((net) => {
        const row = new Adw.ActionRow({
          title: net.ssid || "(Rede Oculta)",
          subtitle: `${net.security} • Canal ${net.channel}`,
        });

        const signalLabel = new Gtk.Label({
          label: `${net.signal}%`,
          css_classes: ["caption"],
        });
        const signalIcon = new Gtk.Image({
          icon_name: this._getSignalIcon(net.signal),
        });
        const signalBox = new Gtk.Box({
          spacing: 6,
        });
        
        signalBox.append(signalIcon);
        signalBox.append(signalLabel);

        const toggle = new Gtk.Switch({
          active: this._selectedNetworks.has(net.bssid),
          valign: Gtk.Align.CENTER,
        });

        toggle.connect("notify::active", () => {
          if (toggle.get_active()) {
            this._selectedNetworks.set(net.bssid, {
              name: net.ssid,
              history: [],
            });
          } else {
            this._selectedNetworks.delete(net.bssid);
          }
          this._updateCharts();
        });

        // Botão de informações detalhadas
        const infoButton = new Gtk.Button({
          icon_name: "dialog-information-symbolic",
          css_classes: ["flat", "circular"],
          tooltip_text: "Ver detalhes da rede",
          valign: Gtk.Align.CENTER,
        });

        infoButton.connect('clicked', () => {
          print(`DEBUG: Botão de informação clicado para rede ${net.ssid || '(Oculta)'}!`);
          print(`DEBUG: BSSID: ${net.bssid}, Canal: ${net.channel}, Sinal: ${net.signal}%`);
          this._showNetworkDetails(net);
        });

        // Container para os controles à direita
        const suffixBox = new Gtk.Box({
          spacing: 6,
          orientation: Gtk.Orientation.HORIZONTAL,
        });

        suffixBox.append(infoButton);
        suffixBox.append(toggle);

        row.add_prefix(signalBox);
        row.add_suffix(suffixBox);
        row.activatable_widget = toggle;

        this._networksList.append(row);
      });
    }

    _updateCharts() {
      const selectedData = Array.from(this._selectedNetworks.entries()).map(
        ([bssid, net]) => ({
          name: net.name || `(${bssid.slice(-5)})`,
          data: net.history,
        })
      );

      // Atualiza cada gráfico com os dados formatados corretamente
      this._charts
        .get("signal-time")
        .setData(
          selectedData.map((s) => ({
            name: s.name,
            data: s.data.map((p) => ({ x: p.time, y: p.signal })),
          }))
        );
      this._charts
        .get("spectrum")
        .setData(
          selectedData.map((s) => ({
            name: s.name,
            data: s.data.map((p) => ({ x: p.frequency, y: p.signal })),
          }))
        );
      this._charts
        .get("channel-map")
        .setData(
          selectedData.map((s) => ({
            name: s.name,
            data: s.data.map((p) => ({ x: p.channel, y: p.signal })),
          }))
        );
      this._charts
        .get("signal-bars")
        .setData(
          selectedData.map((s) => ({
            name: s.name,
            value: s.data.length ? s.data.at(-1).signal : 0,
          }))
        );
    }

    _selectAllNetworks(select) {
      this._lastNetworks.forEach((net) => {
        if (select) {
          if (!this._selectedNetworks.has(net.bssid)) {
            this._selectedNetworks.set(net.bssid, {
              name: net.ssid,
              history: [],
            });
          }
        } else {
          this._selectedNetworks.delete(net.bssid);
        }
      });
      this._updateNetworksList();
      this._updateCharts();
    }

    _getSignalIcon(signal) {
      if (signal >= 75) return "network-wireless-signal-excellent-symbolic";
      if (signal >= 50) return "network-wireless-signal-good-symbolic";
      if (signal >= 25) return "network-wireless-signal-ok-symbolic";
      return "network-wireless-signal-weak-symbolic";
    }

    // Mostrar detalhes de uma rede
    _showNetworkDetails(networkData) {
      print("DEBUG: _showNetworkDetails chamado");
      print("DEBUG: NetworkDetailsDialog disponível?", !!NetworkDetailsDialog);
      print("DEBUG: networkData:", JSON.stringify(networkData, null, 2));
      
      if (!NetworkDetailsDialog) {
        print("ERRO: NetworkDetailsDialog não foi carregado");
        
        // Tentar importar novamente
        try {
          const networkDetailsModule = imports.networkDetailsDialog;
          NetworkDetailsDialog = networkDetailsModule.NetworkDetailsDialog;
          print("DEBUG: NetworkDetailsDialog reimportado com sucesso");
        } catch (error) {
          print(`ERRO: Falha ao reimportar NetworkDetailsDialog - ${error.message}`);
          return;
        }
      }
      
      try {
        print("DEBUG: Criando instância do NetworkDetailsDialog...");
        const detailsDialog = new NetworkDetailsDialog({
          parent: this,
          networkData: networkData,
          networkManager: this._networkManager
        });

        print("DEBUG: Conectando signal open-telemetry-requested...");
        detailsDialog.connect('open-telemetry-requested', (source, bssid) => {
          print("DEBUG: Signal open-telemetry-requested recebido, BSSID:", bssid);
          this._openTelemetryWindow(bssid);
        });

        print("DEBUG: Apresentando dialog...");
        detailsDialog.present();
        print("DEBUG: Dialog de detalhes apresentado com sucesso");
      } catch (error) {
        print(`ERRO: _showNetworkDetails - ${error.message}`);
        print("ERRO: Stack trace:", error.stack);
      }
    }

    // Abrir janela de telemetria
    _openTelemetryWindow(targetBssid = null) {
      print("DEBUG: _openTelemetryWindow chamado");
      print("DEBUG: TelemetryWindow disponível?", !!TelemetryWindow);
      print("DEBUG: targetBssid:", targetBssid);
      
      if (!TelemetryWindow) {
        print("ERRO: TelemetryWindow não foi carregado");
        
        // Tentar importar novamente
        try {
          const telemetryModule = imports.telemetryWindow;
          TelemetryWindow = telemetryModule.TelemetryWindow;
          print("DEBUG: TelemetryWindow reimportado com sucesso");
        } catch (error) {
          print(`ERRO: Falha ao reimportar TelemetryWindow - ${error.message}`);
          return;
        }
      }
      
      try {
        if (this._telemetryWindow) {
          // Se já existe, apenas apresentar
          print("DEBUG: Janela de telemetria já existe, apresentando...");
          this._telemetryWindow.present();
          if (targetBssid) {
            print("DEBUG: Adicionando hunt target:", targetBssid);
            this._telemetryWindow.addHuntTarget(targetBssid);
          }
          return;
        }

        print("DEBUG: Criando nova janela de telemetria...");
        // Criar nova janela de telemetria
        this._telemetryWindow = new TelemetryWindow({
          transient_for: this,
          networkManager: this._networkManager
        });

        print("DEBUG: Conectando signal close-request...");
        // Quando a janela for fechada, limpar a referência
        this._telemetryWindow.connect('close-request', () => {
          print("DEBUG: Janela de telemetria sendo fechada");
          this._telemetryWindow = null;
          return false; // Permitir fechamento
        });

        print("DEBUG: Apresentando janela de telemetria...");
        this._telemetryWindow.present();

        // Se foi solicitado um alvo específico, adicioná-lo
        if (targetBssid) {
          print("DEBUG: Procurando network para targetBssid:", targetBssid);
          const network = this._lastNetworks.find(n => n.bssid === targetBssid);
          if (network) {
            print("DEBUG: Network encontrada, adicionando hunt target:", network.ssid);
            this._telemetryWindow.addHuntTarget(targetBssid, network.ssid);
          } else {
            print("DEBUG: Network não encontrada para BSSID:", targetBssid);
          }
        }
        print("DEBUG: Janela de telemetria criada e apresentada com sucesso");
      } catch (error) {
        print(`ERRO: _openTelemetryWindow - ${error.message}`);
        print("ERRO: Stack trace:", error.stack);
      }
    }

    // Gerenciamento de tema
    _setupThemeManagement() {
      const styleManager = Adw.StyleManager.get_default();
      styleManager.connect("notify::dark", () => this._updateTheme());
      this._updateTheme(); // Aplicar tema inicial

      const settings = new Gio.Settings({
        schema_id: this.application.application_id,
      });
      settings.connect("changed::color-scheme", () =>
        this._applyColorScheme(settings)
      );
      this._applyColorScheme(settings);
    }

    _setTheme(scheme) {
      const styleManager = Adw.StyleManager.get_default();
      
      switch (scheme) {
        case "light":
          styleManager.color_scheme = Adw.ColorScheme.FORCE_LIGHT;
          break;
        case "dark":
          styleManager.color_scheme = Adw.ColorScheme.FORCE_DARK;
          break;
        case "default":
          styleManager.color_scheme = Adw.ColorScheme.DEFAULT;
          break;
      }

      // Salvar preferência
      const settings = new Gio.Settings({
        schema_id: this.application.application_id,
      });
      settings.set_string("color-scheme", scheme === "default" ? "auto" : `force-${scheme}`);
    }

    _updateTheme() {
      const isDark = Adw.StyleManager.get_default().dark;
      this.get_first_child().remove_css_class(isDark ? "light" : "dark");
      this.get_first_child().add_css_class(isDark ? "dark" : "light");
    }

    _applyColorScheme(settings) {
      const scheme = settings.get_string("color-scheme");
      const styleManager = Adw.StyleManager.get_default();

      switch (scheme) {
        case "force-light":
          styleManager.color_scheme = Adw.ColorScheme.FORCE_LIGHT;
          break;
        case "force-dark":
          styleManager.color_scheme = Adw.ColorScheme.FORCE_DARK;
          break;
        default:
          styleManager.color_scheme = Adw.ColorScheme.DEFAULT;
          break;
      }
    }
  }
);
