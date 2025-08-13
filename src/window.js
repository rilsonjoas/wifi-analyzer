const { GObject, Gtk, Adw, Gio, GLib } = imports.gi;
const { ChartWidget } = imports.chartWidget;
const { NetworkManager } = imports.networkManager;

let NetworkDetailsDialog, TelemetryWindow;
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

    _buildUI() {
      // Estrutura Principal
      this._splitView = new Adw.OverlaySplitView({
        vexpand: true,
        hexpand: true,
        sidebar_position: Gtk.PackType.START,
        max_sidebar_width: 350,
        min_sidebar_width: 280,
      });
      this.set_content(this._splitView);

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
      sidebarHeader.pack_end(refreshButton);

      const telemetryButton = new Gtk.Button({
        icon_name: "speedometer-symbolic",
        tooltip_text: "Abrir Telemetria e Hunt Mode",
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

    _onNetworksUpdated(networks) {
      this._lastNetworks = [...networks].sort((a, b) => b.signal - a.signal);
      const now = Date.now();

      networks.forEach((n) => {
        if (!this._selectedNetworks.has(n.bssid)) {
          // Por padrão, todas as redes são selecionadas automaticamente
          this._selectedNetworks.set(n.bssid, {
            name: n.ssid,
            history: [],
          });
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

      this._updateNetworksList();
      this._updateCharts();
    }

    _updateNetworksList() {
      // Usar Gtk.ListBox.remove_all() para limpar a lista de forma eficiente
      this._networksList.remove_all();

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
        const signalBox = new Gtk.Box({ spacing: 6 });

        signalBox.append(signalIcon);
        signalBox.append(signalLabel);

        const toggle = new Gtk.Switch({
          active: this._selectedNetworks.has(net.bssid), // Sincronizar com o estado real
          valign: Gtk.Align.CENTER,
        });

        toggle.connect("notify::active", () => {
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
      this._charts.get("spectrum").setData(
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
          transient_for: this,
          networkData: networkData,
          networkManager: this._networkManager,
        });

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
          transient_for: this,
          networkManager: this._networkManager,
        });

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

    _setupThemeManagement() {
      // Sempre seguir o padrão do sistema GNOME
      const styleManager = Adw.StyleManager.get_default();
      styleManager.set_color_scheme(Adw.ColorScheme.DEFAULT);
      
      const update = () => {
        const isDark = styleManager.dark;
        this.get_first_child().remove_css_class(isDark ? "light" : "dark");
        this.get_first_child().add_css_class(isDark ? "dark" : "light");
      };

      styleManager.connect("notify::dark", update);
      update(); // Chamar uma vez para definir o estado inicial
    }
  }
);
