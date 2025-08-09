const { GObject, Gtk, Gdk, Adw, GLib, Gio } = imports.gi;
const { NetworkManager } = imports.networkManager;
const { RealtimeCharts } = imports.realtimeCharts;
const { ChannelAnalyzer } = imports.channelAnalyzer;
const { AdvancedChannelAnalyzer } = imports.advancedChannelAnalyzer;
const { PreferencesWindow } = imports.preferencesWindow;

var WifiAnalyzerWindow = GObject.registerClass(
  {
    GTypeName: "WifiAnalyzerWindow",
  },
  class WifiAnalyzerWindow extends Adw.ApplicationWindow {
    _init(application) {
      super._init({
        application,
        title: "WiFi Analyzer",
        default_width: 1000,
        default_height: 700,
        content: null,
      });

      // Initialize network manager
      this.networkManager = new NetworkManager({ application: application });

      this._buildUI();
      this._setupSignals();
      this.networkManager.startRealTimeMonitoring();

      this.connect("destroy", () => { if (this.networkManager) this.networkManager.destroy(); });
      this._lastToastTime = 0;
      this._lastCountShown = -1;

      // Após construir o conteúdo principal, garantir classe root inicial
      this.connect('map', () => {
        const styleManager = Adw.StyleManager.get_default();
        const isDark = styleManager.get_dark();
        const root = this.get_content();
        if (root) {
          root.remove_css_class('root-dark');
          root.remove_css_class('root-light');
          root.add_css_class(isDark ? 'root-dark' : 'root-light');
        }
      });
      Adw.StyleManager.get_default().connect('notify::dark', () => {
        const root = this.get_content();
        if (!root) return;
        const styleManager = Adw.StyleManager.get_default();
        root.remove_css_class('root-dark');
        root.remove_css_class('root-light');
        root.add_css_class(styleManager.get_dark() ? 'root-dark' : 'root-light');
      });
    }

    _buildUI() {
      this._toastOverlay = new Adw.ToastOverlay();
      this.toolbarView = new Adw.ToolbarView();

      // Header principal
      this.headerBar = new Adw.HeaderBar();
      this.headerBar.set_show_start_title_buttons(true);
      this.headerBar.set_show_end_title_buttons(true);
      this.refreshButton = new Gtk.Button({ icon_name: "view-refresh-symbolic", tooltip_text: "Atualizar redes", css_classes: ["flat"] });
      this.headerBar.pack_start(this.refreshButton);

      // Indicador de atividade redesenhado
      this._activityLabel = new Gtk.Label({ label: "Verificando conexões", css_classes: ["dim-label"] });
      this._activitySpinner = new Gtk.Spinner({ spinning: true });
      const activityBox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 6, css_classes: ["dim-label"] });
      activityBox.append(this._activitySpinner);
      activityBox.append(this._activityLabel);
      this.headerBar.pack_start(activityBox);

      // Menu
      this.menuButton = new Gtk.MenuButton({ icon_name: "open-menu-symbolic", tooltip_text: "Menu" });
      const menu = new Gio.Menu();
      menu.append("Preferências", "win.preferences");
      menu.append("Sobre", "app.about");
      menu.append("Sair", "app.quit");
      this.menuButton.set_menu_model(menu);
      this.headerBar.pack_end(this.menuButton);

      // ViewStack + ViewSwitcher para navegação moderna
      this.viewStack = new Adw.ViewStack();
      this._addNetworksPage();
      this._addChartsPage();
      this._addAnalysisPage();
      this._addAdvancedAnalysisPage();

      this.viewSwitcher = new Adw.ViewSwitcher({ stack: this.viewStack, policy: Adw.ViewSwitcherPolicy.WIDE });
      this.headerBar.set_title_widget(this.viewSwitcher);

      // ViewSwitcherBar para janelas estreitas
      this.viewSwitcherBar = new Adw.ViewSwitcherBar({ stack: this.viewStack });

      this.toolbarView.add_top_bar(this.headerBar);
      this.toolbarView.set_content(this.viewStack);
      this.toolbarView.add_bottom_bar(this.viewSwitcherBar);

      this._toastOverlay.set_child(this.toolbarView);
      this.set_content(this._toastOverlay);
    }

    _addNetworksPage() {
      const pageBox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 0 });
      const clamp = new Adw.Clamp({ tightening_threshold: 600 });
      const inner = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 12, margin_top: 12, margin_bottom: 12, margin_start: 12, margin_end: 12 });

      // Placeholder de carregamento inicial
      this._loadingPlaceholder = new Adw.StatusPage({ icon_name: "network-wireless-symbolic", title: "Carregando redes", description: "Aguardando resultados do primeiro scan..." });
      this.networksList = new Gtk.ListBox({ css_classes: ["boxed-list"], selection_mode: Gtk.SelectionMode.SINGLE, vexpand: true });
      const scrolled = new Gtk.ScrolledWindow({ child: this.networksList, vexpand: true });
      this.networksEmptyPage = new Adw.StatusPage({ icon_name: "network-wireless-symbolic", title: "Nenhuma rede", description: "Nenhuma rede detectada ainda." });
      const overlay = new Gtk.Overlay({ child: scrolled });
      overlay.add_overlay(this.networksEmptyPage);
      overlay.add_overlay(this._loadingPlaceholder);
      this.networksEmptyPage.set_visible(false);
      this._loadingPlaceholder.set_visible(true);

      inner.append(overlay);
      clamp.set_child(inner);
      pageBox.append(clamp);

      this.viewStack.add_titled(pageBox, "networks", "Redes").set_icon_name("network-wireless-symbolic");
    }

    _addChartsPage() {
      this.chartsWidget = new RealtimeCharts();
      this.viewStack.add_titled(this.chartsWidget, "charts", "Gráficos").set_icon_name("utilities-system-monitor-symbolic");
    }

    _addAnalysisPage() {
      const page = this._createAnalysisContent();
      this.viewStack.add_titled(page, "analysis", "Análise").set_icon_name("system-search-symbolic");
    }

    _addAdvancedAnalysisPage() {
      this.advancedAnalysisWidget = new AdvancedChannelAnalyzer();
      this.viewStack.add_titled(this.advancedAnalysisWidget, "advanced", "Avançado").set_icon_name("preferences-system-symbolic");
    }

    _createAnalysisContent() {
      const page = new Adw.Clamp({ tightening_threshold: 800 });
      const content = new Adw.PreferencesPage();
      // 2.4GHz
      const group24 = new Adw.PreferencesGroup({ title: "Banda 2.4 GHz", description: "Análise de canais" });
      this.suggestionRow24 = new Adw.ActionRow({ title: "Canal Sugerido", subtitle: "Aguardando análise..." });
      group24.add(this.suggestionRow24); content.add(group24);
      // 5GHz
      const group5 = new Adw.PreferencesGroup({ title: "Banda 5 GHz", description: "Análise de canais" });
      this.suggestionRow5 = new Adw.ActionRow({ title: "Canal Sugerido", subtitle: "Aguardando análise..." });
      group5.add(this.suggestionRow5); content.add(group5);
      page.set_child(content);
      return page;
    }

    _setupSignals() {
      this.networkManager.connect("networks-updated", (_s, networks) => { this._updateUI(networks); });
      this.networkManager.connect("scan-started", () => { this._activitySpinner.set_spinning(true); this._activityLabel.set_label("Verificando conexões"); });
      this.refreshButton.connect("clicked", () => { this._showToast("Atualizando redes..."); this.networkManager.scanNetworks(); });
      this.networksList.connect("row-selected", (_list, row) => { if (row && row.network) this._showNetworkDetails(row.network); });
      const prefsAction = new Gio.SimpleAction({ name: "preferences" });
      prefsAction.connect("activate", () => { this._showPreferences(); });
      this.add_action(prefsAction);
    }

    _updateUI(networks) {
      this._activitySpinner.set_spinning(false);
      this._activityLabel.set_label("Atualizado");
      this._updateNetworksList(networks);
      this.chartsWidget.updateNetworks(networks);
      const analysisReport = ChannelAnalyzer.analyze(networks);
      this._updateAnalysisTab(analysisReport);
      this.advancedAnalysisWidget.updateNetworks(networks);
      const now = Date.now();
      if (networks.length !== this._lastCountShown || (now - this._lastToastTime) > 15000) {
        this._showToast(`Atualizado: ${networks.length} redes`);
        this._lastToastTime = now;
        this._lastCountShown = networks.length;
      }
    }

    _updateNetworksList(networks) {
      // limpar
      let child = this.networksList.get_first_child();
      while (child) { const next = child.get_next_sibling(); this.networksList.remove(child); child = next; }
      // ordenar por banda (2.4,5,6) depois sinal desc e nome
      const bandOrder = { '2.4GHz': 0, '5GHz': 1, '6GHz': 2, 'Outros': 3 };
      const classifyBand = n => { const f = n.frequency || 0; if (f>=2400 && f<2500) return '2.4GHz'; if (f>=4900 && f<6000) return '5GHz'; if (f>=5925 && f<7125) return '6GHz'; return 'Outros'; };
      networks.forEach(n => n._band = classifyBand(n));
      networks.sort((a,b)=> bandOrder[a._band]-bandOrder[b._band] || b.signal - a.signal || a.ssid.localeCompare(b.ssid));
      let currentBand = null;
      networks.forEach(network => {
        if (network._band !== currentBand) { currentBand = network._band; this.networksList.append(this._createBandSeparatorRow(currentBand)); }
        const row = this._createNetworkRow(network); this.networksList.append(row);
      });
      const hasNetworks = networks.length > 0;
      this.networksEmptyPage.set_visible(!hasNetworks && !this._loading);
      if (hasNetworks) this._loadingPlaceholder.set_visible(false);
    }

    _createNetworkRow(network) {
      const row = new Adw.ActionRow({ title: network.ssid || "(Rede Oculta)", subtitle: `${network._band || ''} • BSSID ${network.bssid}` });
      row.add_css_class('network-row');
      row.network = network;
      // Prefix: ícone de sinal
      const signalIcon = this._getSignalIcon(network.signal);
      const strengthClass = network.signal >= 75 ? 'wifi-strong' : network.signal >=50 ? 'wifi-medium' : 'wifi-weak';
      const iconImg = new Gtk.Image({ icon_name: signalIcon, css_classes: [strengthClass] });
      row.add_prefix(iconImg);
      // Sufixos: pills + barra sinal
      const suffixBox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 6, halign: Gtk.Align.END });
      const pill = (text, extra=[]) => { const l = new Gtk.Label({ label: text, css_classes: ['pill', ...extra] }); return l; };
      // Segurança
      if (network.security && network.security !== 'Open') suffixBox.append(pill(network.security, ['secure'])); else suffixBox.append(pill('Open', ['open']));
      // Canal
      suffixBox.append(pill(`Ch ${network.channel||'?'} `, ['channel']));
      // Banda
      if (network._band) suffixBox.append(pill(network._band, []));
      // Barra de nível
      const levelBox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 4, css_classes: ['signal-level'], valign: Gtk.Align.CENTER });
      const pbar = new Gtk.ProgressBar({ fraction: Math.min(1, Math.max(0, network.signal/100)), valign: Gtk.Align.CENTER });
      pbar.set_text(''); pbar.set_show_text(false);
      pbar.set_hexpand(true);
      levelBox.append(pbar);
      levelBox.append(new Gtk.Label({ label: `${network.signal}%`, css_classes: ['signal-label'] }));
      suffixBox.append(levelBox);
      row.add_suffix(suffixBox);
      return row;
    }

    _createBandSeparatorRow(band) {
      const lb = new Gtk.ListBoxRow({ selectable: false, activatable: false, focusable: false });
      const box = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, halign: Gtk.Align.FILL });
      const label = new Gtk.Label({ label: band, xalign: 0, css_classes: ['band-separator'] });
      label.set_halign(Gtk.Align.FILL); label.set_hexpand(true);
      box.append(label); lb.set_child(box); return lb;
    }

    _getSignalIcon(signal) { if (signal >= 75) return "network-wireless-signal-excellent-symbolic"; if (signal >= 50) return "network-wireless-signal-good-symbolic"; if (signal >= 25) return "network-wireless-signal-ok-symbolic"; return "network-wireless-signal-weak-symbolic"; }

    _updateAnalysisTab(report) {
      const setSuggestion = (row, suggestion) => { if (suggestion && suggestion.channel) row.set_subtitle(`Canal ${suggestion.channel} - ${suggestion.reason}`); else row.set_subtitle("Nenhuma sugestão disponível"); };
      setSuggestion(this.suggestionRow24, report["2.4GHz"].suggestion);
      setSuggestion(this.suggestionRow5, report["5GHz"].suggestion);
    }

    _showNetworkDetails(network) {
      const dialog = new Adw.Dialog({ transient_for: this, modal: true });
      const content = new Adw.StatusPage({ title: network.ssid || "(Rede Oculta)", description: network.bssid });
      const box = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 6, margin_top: 12, margin_bottom: 12, margin_start: 12, margin_end: 12 });
      const addRow = (k,v) => box.append(new Gtk.Label({ label: `${k}: ${v}`, xalign: 0 }));
      addRow("Sinal", `${network.signal}%`); addRow("Segurança", network.security); addRow("Canal", network.channel); addRow("Frequência", `${network.frequency} MHz`); addRow("BSSID", network.bssid);
      content.set_child(box);
      dialog.set_content(content);
      dialog.add_response("close", "Fechar");
      dialog.set_default_response("close");
      dialog.present();
    }

    _showToast(message) { const toast = new Adw.Toast({ title: message, timeout: 3, priority: Adw.ToastPriority.LOW }); this._toastOverlay.add_toast(toast); }
    _showPreferences() { const prefsDialog = new PreferencesWindow(this); prefsDialog.present(); }
  }
);
