const { GObject, Gtk, Adw, Gio, GLib } = imports.gi;
const { ChartWidget } = imports.chartWidget;
const { NetworkManager } = imports.networkManager;

let NetworkDetailsDialog, TelemetryWindow, NetworkManagementWindow;
try {
  const networkDetailsModule = imports.networkDetailsDialog;
  NetworkDetailsDialog = networkDetailsModule.NetworkDetailsDialog;
} catch (e) {
  print(`INFO: Não foi possível importar NetworkDetailsDialog: ${e.message}`);
}

try {
  const telemetryModule = imports.telemetryWindow;
  TelemetryWindow = telemetryModule.TelemetryWindow;
} catch (e) {
  print(`INFO: Não foi possível importar TelemetryWindow: ${e.message}`);
}

try {
  const networkManagementModule = imports.networkManagementWindow;
  NetworkManagementWindow = networkManagementModule.NetworkManagementWindow;
} catch (e) {
  print(`INFO: Não foi possível importar NetworkManagementWindow: ${e.message}`);
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
      this._lastNetworks = [];
      this._telemetryWindow = null;
      this._networkManagementWindow = null;
      this._currentNetworkInfo = null;
      this._networkDevices = [];
      this._isFirstScan = true; // Controle para saber se é a primeira atualização

      this._buildUI();
      this._setupThemeManagement(); // Sempre seguir o padrão do sistema

      this._networkManager = new NetworkManager({
        application: this.application,
      });
      this._networkManager.connect("networks-updated", (_source, networks) =>
        this._onNetworksUpdated(networks)
      );
      this._networkManager.startRealTimeMonitoring();
    }

    // Método público para exibir toasts
    showToast(message, timeout = 3) {
      try {
        const toast = new Adw.Toast({
          title: message,
          timeout: timeout
        });
        
        if (this._toastOverlay) {
          this._toastOverlay.add_toast(toast);
          print(`DEBUG: Toast exibido: ${message}`);
        } else {
          print(`TOAST: ${message}`);
        }
      } catch (error) {
        print(`ERRO ao exibir toast: ${error.message}`);
      }
    }

    _buildUI() {
      // Toast Overlay para notificações
      this._toastOverlay = new Adw.ToastOverlay();
      this.set_content(this._toastOverlay);

      // Estrutura Principal
      this._splitView = new Adw.OverlaySplitView({
        vexpand: true,
        hexpand: true,
        sidebar_position: Gtk.PackType.START,
        max_sidebar_width: 350,
        min_sidebar_width: 280,
      });
      this._toastOverlay.set_child(this._splitView);

      this._splitView.set_sidebar(this._createSidebar());

      const toolbarView = new Adw.ToolbarView();
      const chartsContent = this._createChartsPanel();

      const headerBar = new Adw.HeaderBar({
        show_end_title_buttons: true,
        title_widget: chartsContent.viewSwitcher,
      });

      const menuPopover = this._createMenuPopover();
      const menuButton = new Gtk.MenuButton({
        popover: menuPopover,
        icon_name: "open-menu-symbolic",
      });
      headerBar.pack_end(menuButton);

      this._toggleSidebarButton = new Gtk.ToggleButton({
        icon_name: "sidebar-show-symbolic",
        active: true,
        tooltip_text: "Alternar Painel Lateral",
      });
      headerBar.pack_start(this._toggleSidebarButton);
      this._toggleSidebarButton.connect("toggled", () => {
        this._splitView.show_sidebar = this._toggleSidebarButton.active;
      });

      toolbarView.add_top_bar(headerBar);
      toolbarView.set_content(chartsContent.viewStack);
      this._splitView.set_content(toolbarView);

      const deselectAllAction = new Gio.SimpleAction({ name: "deselectAll" });
      deselectAllAction.connect("activate", () =>
        this._selectAllNetworks(false)
      );
      this.add_action(deselectAllAction);

      const selectAllAction = new Gio.SimpleAction({ name: "selectAll" });
      selectAllAction.connect("activate", () =>
        this._selectAllNetworks(true)
      );
      this.add_action(selectAllAction);
    }

    _createMenuPopover() {
      const menuModel = Gio.Menu.new();
      
      menuModel.append("Preferências", "app.preferences");
      menuModel.append("Sobre o WiFi Analyzer", "app.about");
      menuModel.append("Sair", "app.quit");

      const menuPopover = new Gtk.PopoverMenu({
        menu_model: menuModel,
      });

      return menuPopover;
    }

    _createChartsPanel() {
      const viewStack = new Adw.ViewStack({ vexpand: true, hexpand: true });
      const viewSwitcher = new Adw.ViewSwitcher({
        stack: viewStack,
        policy: Adw.ViewSwitcherPolicy.WIDE,
      });

      this._charts = new Map();
      const chartTypes = [
        {
          id: "signal-time",
          title: "Sinal vs Tempo",
          type: "line",
          icon: "emblem-favorite-symbolic",
        },
        {
          id: "spectrum",
          title: "Espectro",
          type: "spectrum",
          icon: "preferences-system-symbolic",
        },
        {
          id: "channel-map",
          title: "Mapa de Canais",
          type: "channel",
          icon: "view-grid-symbolic",
        },
        {
          id: "signal-bars",
          title: "Força do Sinal",
          type: "bars",
          icon: "view-list-symbolic",
        },
      ];

      chartTypes.forEach((chartInfo) => {
        const chart = new ChartWidget({ chart_type: chartInfo.type });
        this._charts.set(chartInfo.id, chart);
        viewStack
          .add_titled(chart, chartInfo.id, chartInfo.title)
          .set_icon_name(chartInfo.icon);
      });

      return {
        viewStack: viewStack,
        viewSwitcher: viewSwitcher,
      };
    }

    _createSidebar() {
      const sidebarBox = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        css_classes: ["background"],
      });

      const sidebarHeader = new Adw.HeaderBar({
        show_end_title_buttons: false,
        title_widget: new Adw.WindowTitle({
          title: "Redes WiFi",
        }),
        css_classes: ["flat"],
      });

      const selectionMenuModel = Gio.Menu.new();
      selectionMenuModel.append("Selecionar Todas", "win.selectAll");
      selectionMenuModel.append("Desselecionar Todas", "win.deselectAll");
      const selectionMenu = new Gtk.MenuButton({
        icon_name: "edit-select-all-symbolic",
        menu_model: selectionMenuModel,
        tooltip_text: "Opções de Seleção",
      });
      sidebarHeader.pack_start(selectionMenu);

      const refreshButton = new Gtk.Button({
        icon_name: "view-refresh-symbolic",
        tooltip_text: "Atualizar Redes",
      });
      refreshButton.connect("clicked", () => {
        this._networkManager.scanNetworks();
      });
      sidebarHeader.pack_start(refreshButton);

      const networkManagementButton = new Gtk.Button({
        icon_name: "network-workgroup-symbolic",
        tooltip_text: "Gerenciamento de Redes",
      });
      networkManagementButton.connect("clicked", () => {
        this._openNetworkManagementWindow();
      });
      sidebarHeader.pack_end(networkManagementButton);

      const telemetryButton = new Gtk.Button({
        icon_name: "speedometer-symbolic",
        tooltip_text: "Abrir Telemetria e Modo Monitor",
      });
      telemetryButton.connect("clicked", () => {
        this._openTelemetryWindow();
      });
      sidebarHeader.pack_end(telemetryButton);

      sidebarBox.append(sidebarHeader);

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

    _createConnectedNetworkSection() {
      const section = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 12,
        margin_start: 12,
        margin_end: 12,
        margin_top: 12,
        margin_bottom: 12,
      });

      // Cabeçalho da seção
      const headerBox = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        spacing: 8,
      });

      const wifiIcon = new Gtk.Image({
        icon_name: "network-wireless-connected-symbolic",
        css_classes: ["accent"],
      });

      const titleLabel = new Gtk.Label({
        label: "Rede Conectada",
        css_classes: ["heading"],
        halign: Gtk.Align.START,
      });

      headerBox.append(wifiIcon);
      headerBox.append(titleLabel);

      this._connectedNetworkBox = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 8,
        css_classes: ["card", "connected-network-section"],
        margin_top: 8,
        margin_bottom: 8,
        margin_start: 4,
        margin_end: 4,
      });

      this._connectedNetworkContent = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 6,
        css_classes: ["connected-network-content"],
        margin_start: 12,
        margin_end: 12,
        margin_top: 12,
        margin_bottom: 12,
      });

      this._connectedNetworkBox.append(this._connectedNetworkContent);

      section.append(headerBox);
      section.append(this._connectedNetworkBox);

      // Inicialmente oculto
      section.visible = false;

      return section;
    }

    _updateConnectedNetworkSection() {
      if (!this._currentNetworkInfo) {
        this._connectedNetworkSection.visible = false;
        return;
      }

      // Tornar a seção visível
      this._connectedNetworkSection.visible = true;

      // Limpar conteúdo anterior
      let child;
      while ((child = this._connectedNetworkContent.get_first_child())) {
        this._connectedNetworkContent.remove(child);
      }

      // Nome da rede conectada
      const networkName = new Gtk.Label({
        label: this._currentNetworkInfo.ssid || "Rede Desconhecida",
        css_classes: ["title-3"],
        halign: Gtk.Align.START,
        wrap: true,
      });
      this._connectedNetworkContent.append(networkName);

      // Informações da rede
      if (this._currentNetworkInfo.ipAddress) {
        const ipRow = this._createInfoRow("IP Address", this._currentNetworkInfo.ipAddress);
        this._connectedNetworkContent.append(ipRow);
      }

      if (this._currentNetworkInfo.gateway) {
        const gatewayRow = this._createInfoRow("Gateway", this._currentNetworkInfo.gateway);
        this._connectedNetworkContent.append(gatewayRow);
      }

      if (this._currentNetworkInfo.dns && this._currentNetworkInfo.dns.length > 0) {
        const dnsRow = this._createInfoRow("DNS", this._currentNetworkInfo.dns.join(", "));
        this._connectedNetworkContent.append(dnsRow);
      }

      // Dispositivos na rede
      if (this._networkDevices && this._networkDevices.length > 0) {
        const separator = new Gtk.Separator({
          orientation: Gtk.Orientation.HORIZONTAL,
          margin_top: 8,
          margin_bottom: 8,
        });
        this._connectedNetworkContent.append(separator);

        const devicesLabel = new Gtk.Label({
          label: `Dispositivos (${this._networkDevices.length})`,
          css_classes: ["caption", "dim-label"],
          halign: Gtk.Align.START,
          margin_bottom: 4,
        });
        this._connectedNetworkContent.append(devicesLabel);

        this._networkDevices.forEach(device => {
          const deviceRow = this._createDeviceRow(device);
          this._connectedNetworkContent.append(deviceRow);
        });
      }

      this._connectedNetworkSection.visible = true;
    }

    _createInfoRow(label, value) {
      const row = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        spacing: 8,
        margin_top: 2,
        margin_bottom: 2,
      });

      const labelWidget = new Gtk.Label({
        label: label + ":",
        css_classes: ["caption", "dim-label"],
        halign: Gtk.Align.START,
        hexpand: false,
      });

      const valueWidget = new Gtk.Label({
        label: value,
        css_classes: ["caption"],
        halign: Gtk.Align.END,
        hexpand: true,
        ellipsize: 3, // Pango.EllipsizeMode.END
        selectable: true,
      });

      row.append(labelWidget);
      row.append(valueWidget);

      return row;
    }

    _createDeviceRow(device) {
      const row = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        spacing: 8,
        margin_top: 2,
        margin_bottom: 2,
      });

      // Ícone do tipo de dispositivo
      let iconName = "computer-symbolic";
      if (device.type === "router") {
        iconName = "router-symbolic";
      }

      const deviceIcon = new Gtk.Image({
        icon_name: iconName,
        css_classes: ["dim-label"],
        halign: Gtk.Align.START,
      });

      const deviceInfo = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 2,
        hexpand: true,
      });

      const nameLabel = new Gtk.Label({
        label: device.hostname,
        css_classes: ["caption"],
        halign: Gtk.Align.START,
        ellipsize: 3, // Pango.EllipsizeMode.END
      });

      const ipLabel = new Gtk.Label({
        label: device.ip,
        css_classes: ["caption", "dim-label"],
        halign: Gtk.Align.START,
      });

      deviceInfo.append(nameLabel);
      deviceInfo.append(ipLabel);

      row.append(deviceIcon);
      row.append(deviceInfo);

      return row;
    }

    _onNetworksUpdated(networks) {
      this._lastNetworks = [...networks].sort((a, b) => b.signal - a.signal);
      const now = Date.now();

      networks.forEach((n) => {
        if (!this._selectedNetworks.has(n.bssid)) {
          // Só selecionar automaticamente na primeira varredura
          if (this._isFirstScan) {
            this._selectedNetworks.set(n.bssid, {
              name: n.ssid,
              history: [],
            });
          }
        }

        if (this._selectedNetworks.has(n.bssid)) {
          const history = this._selectedNetworks.get(n.bssid).history;
          history.push({
            time: now,
            signal: n.signal,
            channel: n.channel,
            frequency: n.frequency,
          });
          if (history.length > 100) history.shift();
        }
      });

      // Marcar que a primeira varredura foi concluída
      if (this._isFirstScan) {
        this._isFirstScan = false;
      }

      // Buscar informações da rede conectada
      this._updateCurrentNetworkInfo();

      this._updateNetworksList();
      this._updateCharts();
    }

    async _updateCurrentNetworkInfo() {
      try {
        print("DEBUG: Buscando informações da rede conectada...");
        this._currentNetworkInfo = await this._networkManager.getCurrentNetworkInfo();
        print("DEBUG: Informações da rede conectada:", JSON.stringify(this._currentNetworkInfo));
        
        if (this._currentNetworkInfo && this._currentNetworkInfo.gateway) {
          print("DEBUG: Escaneando dispositivos na rede...");
          this._networkDevices = await this._networkManager.getNetworkDevices(this._currentNetworkInfo.gateway);
          print("DEBUG: Dispositivos encontrados:", this._networkDevices.length);
        } else {
          this._networkDevices = [];
        }
      } catch (error) {
        print(`Erro ao atualizar informações da rede conectada: ${error.message}`);
        this._currentNetworkInfo = null;
        this._networkDevices = [];
      }
    }

    _updateNetworksList() {
      // Usar Gtk.ListBox.remove_all() para limpar a lista de forma eficiente
      this._networksList.remove_all();

      this._lastNetworks.forEach((net) => {
        // Verificar se esta é a rede conectada
        const isConnected = this._currentNetworkInfo && 
                           this._currentNetworkInfo.ssid === net.ssid;
        
        print(`DEBUG: Comparando rede ${net.ssid} com conectada ${this._currentNetworkInfo?.ssid} - Conectada: ${isConnected}`);

        const row = new Adw.ActionRow({
          title: net.ssid || "(Rede Oculta)",
          subtitle: `${net.security} • Canal ${net.channel}`,
        });

        // Se for a rede conectada, deixar o título em negrito
        if (isConnected) {
          row.set_title(`<b>${net.ssid || "(Rede Oculta)"}</b>`);
          row.set_use_markup(true);
        }

        const signalLabel = new Gtk.Label({
          label: `${net.signal}%`,
          css_classes: ["caption"],
        });
        const signalIcon = new Gtk.Image({
          icon_name: this._getSignalIcon(net.signal),
        });
        const signalBox = new Gtk.Box({ spacing: 6 });

        signalBox.append(signalIcon);
        signalBox.append(signalLabel);

        const toggle = new Gtk.Switch({
          active: this._selectedNetworks.has(net.bssid), // Sincronizar com o estado real
          valign: Gtk.Align.CENTER,
        });

        toggle.connect("notify::active", () => {
          // Quando o usuário faz uma seleção manual, não deve mais selecionar automaticamente novas redes
          this._isFirstScan = false;
          
          if (toggle.get_active()) {
            if (!this._selectedNetworks.has(net.bssid)) {
              this._selectedNetworks.set(net.bssid, {
                name: net.ssid,
                history: [],
              });
            }
          } else {
            this._selectedNetworks.delete(net.bssid);
          }
          this._updateCharts();
        });

        const infoButton = new Gtk.Button({
          icon_name: "dialog-information-symbolic",
          css_classes: ["flat", "circular"],
          tooltip_text: "Ver detalhes da rede",
          valign: Gtk.Align.CENTER,
        });

        infoButton.connect("clicked", () => {
          this._showNetworkDetails(net);
        });

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

      this._charts.get("signal-time").setData(
        selectedData.map((s) => ({
          name: s.name,
          data: s.data.map((p) => ({ x: p.time, y: p.signal })),
        }))
      );
      
      // Para o gráfico de espectro, passar função para verificar rede conectada
      const spectrumChart = this._charts.get("spectrum");
      spectrumChart._isConnectedNetwork = (networkName) => {
        return this._currentNetworkInfo && this._currentNetworkInfo.ssid === networkName;
      };
      spectrumChart.setData(
        selectedData.map((s) => ({
          name: s.name,
          data: s.data.map((p) => ({ x: p.frequency, y: p.signal })),
        }))
      );
      
      this._charts.get("channel-map").setData(
        selectedData.map((s) => ({
          name: s.name,
          data: s.data.map((p) => ({ x: p.channel, y: p.signal })),
        }))
      );
      this._charts.get("signal-bars").setData(
        selectedData.map((s) => ({
          name: s.name,
          value: s.data.length ? s.data.at(-1).signal : 0,
        }))
      );
    }

    _selectAllNetworks(select) {
      // Quando o usuário faz uma seleção manual, não deve mais selecionar automaticamente novas redes
      this._isFirstScan = false;
      
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

    _showNetworkDetails(networkData) {
      if (!NetworkDetailsDialog) {
        print("ERRO: A classe NetworkDetailsDialog não está disponível.");
        return;
      }

      try {
        const detailsDialog = new NetworkDetailsDialog({
          networkData: networkData,
          networkManager: this._networkManager,
        });
        
        detailsDialog.set_transient_for(this);

        detailsDialog.connect("open-telemetry-requested", (_source, bssid) => {
          this._openTelemetryWindow(bssid);
        });
        detailsDialog.present();
      } catch (error) {
        print(`ERRO ao criar NetworkDetailsDialog: ${error.message}`);
      }
    }

    _openTelemetryWindow(targetBssid = null) {
      if (!TelemetryWindow) {
        print("ERRO: A classe TelemetryWindow não está disponível.");
        return;
      }

      if (this._telemetryWindow) {
        this._telemetryWindow.present();
        if (targetBssid) {
          this._telemetryWindow.addHuntTarget(targetBssid);
        }
        return;
      }

      try {
        this._telemetryWindow = new TelemetryWindow({
          networkManager: this._networkManager,
        });
        
        this._telemetryWindow.set_transient_for(this);

        this._telemetryWindow.connect("close-request", () => {
          this._telemetryWindow = null;
          return false;
        });

        this._telemetryWindow.present();

        if (targetBssid) {
          const network = this._lastNetworks.find(
            (n) => n.bssid === targetBssid
          );
          if (network) {
            this._telemetryWindow.addHuntTarget(targetBssid, network.ssid);
          }
        }
      } catch (error) {
        print(`ERRO ao criar TelemetryWindow: ${error.message}`);
      }
    }

    _openNetworkManagementWindow() {
      if (!NetworkManagementWindow) {
        print("ERRO: A classe NetworkManagementWindow não está disponível.");
        return;
      }

      if (this._networkManagementWindow) {
        this._networkManagementWindow.present();
        return;
      }

      try {
        this._networkManagementWindow = new NetworkManagementWindow({
          networkManager: this._networkManager
        });
        
        this._networkManagementWindow.set_transient_for(this);

        this._networkManagementWindow.connect("close-request", () => {
          this._networkManagementWindow = null;
          return false;
        });

        this._networkManagementWindow.present();
      } catch (error) {
        print(`ERRO ao criar NetworkManagementWindow: ${error.message}`);
      }
    }

    _setupThemeManagement() {
      // Deixar o tema ser gerenciado pela aplicação principal
      // Configuração mínima apenas para garantir que a janela acompanhe mudanças de tema
      const styleManager = Adw.StyleManager.get_default();
      
      const update = () => {
        const isDark = styleManager.dark;
        // Apenas atualizações mínimas de CSS classes se necessário
        if (this.get_first_child()) {
          this.get_first_child().remove_css_class(isDark ? "light" : "dark");
          this.get_first_child().add_css_class(isDark ? "dark" : "light");
        }
      };

      styleManager.connect("notify::dark", update);
      update();
    }
  }
);
