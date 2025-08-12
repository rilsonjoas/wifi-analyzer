const { GObject, Gtk, Adw, GLib } = imports.gi;
const { ChartWidget } = imports.chartWidget;

var RealtimeCharts = GObject.registerClass(
  {
    GTypeName: "RealtimeCharts",
    Signals: {
      "chart-selected": { param_types: [GObject.TYPE_STRING] },
    },
  },
  class RealtimeCharts extends Adw.Bin {
    _init() {
      super._init({});
      this._selectedNetworks = new Map();
      this._updateInterval = null;
      this._currentView = "signal-time";
      this._buildUI();
      this._startRealTimeUpdates();
    }

    _buildUI() {
      // Container principal adaptativo
      this._mainBox = new Gtk.Box({ 
        orientation: Gtk.Orientation.HORIZONTAL, 
        spacing: 0, 
        hexpand: true, 
        vexpand: true,
        css_classes: ["charts-main-box"]
      });
      this.set_child(this._mainBox);

      // Painel esquerdo com controles e lista
      this._leftPanel = this._createNetworkSelectionPanel();
      // Painel direito apenas com gráficos
      this._rightPanel = this._createChartsPanel();
      
      this._mainBox.append(this._leftPanel);
      this._separator = new Gtk.Separator({ orientation: Gtk.Orientation.VERTICAL });
      this._mainBox.append(this._separator);
      this._mainBox.append(this._rightPanel);
      
      // Configurar responsividade usando o box principal
      this._setupResponsiveness();
    }

    _setupResponsiveness() {
      // Usar uma abordagem mais robusta para responsividade
      try {
        this._mainBox.connect('size-allocate', (widget, allocation) => {
          // Obter dimensões de forma compatível
          const width = allocation.width || allocation.get_width?.() || 800;
          const height = allocation.height || allocation.get_height?.() || 600;
          this._handleResize(width, height);
        });
      } catch (e) {
        print('Aviso: responsividade não disponível:', e.message);
        // Fallback: definir layout padrão
        this._handleResize(1200, 800);
      }
    }

    _handleResize(width, height) {
      const isNarrow = width < 768;
      const isMedium = width < 1200 && width >= 768;
      
      if (isNarrow && this._mainBox.get_orientation() === Gtk.Orientation.HORIZONTAL) {
        // Layout vertical para telas pequenas
        this._mainBox.set_orientation(Gtk.Orientation.VERTICAL);
        this._separator.set_orientation(Gtk.Orientation.HORIZONTAL);
        this._leftPanel.set_width_request(-1);
        this._leftPanel.set_height_request(200);
      } else if (!isNarrow && this._mainBox.get_orientation() === Gtk.Orientation.VERTICAL) {
        // Layout horizontal para telas maiores
        this._mainBox.set_orientation(Gtk.Orientation.HORIZONTAL);
        this._separator.set_orientation(Gtk.Orientation.VERTICAL);
        this._leftPanel.set_width_request(300);
        this._leftPanel.set_height_request(-1);
      }
    }

    _createNetworkSelectionPanel() {
      const panel = new Gtk.Box({ 
        orientation: Gtk.Orientation.VERTICAL, 
        spacing: 12, 
        width_request: 300,
        css_classes: ["network-selection-panel"]
      });
      panel.set_margin_start(12);
      panel.set_margin_end(12);
      panel.set_margin_top(12);
      panel.set_margin_bottom(12);

      // Título e instruções
      const headerBox = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 6 });
      const title = new Gtk.Label({ 
        label: "Redes Wi-Fi", 
        css_classes: ["title-4"], 
        xalign: 0 
      });
      const instruction = new Gtk.Label({ 
        label: "Selecione redes para exibir nos gráficos", 
        css_classes: ["dim-label", "caption"], 
        xalign: 0,
        wrap: true
      });
      headerBox.append(title);
      headerBox.append(instruction);

      // Botões de controle próximos à lista
      const controlsBox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 6 });
      
      const selectAllBtn = new Gtk.Button({ 
        icon_name: "object-select-symbolic", 
        tooltip_text: "Selecionar/Deselecionar Todas", 
        css_classes: ["flat"]
      });
      selectAllBtn.connect("clicked", () => {
        if (this._selectedNetworks.size === this._lastNetworksSize) { 
          this._selectedNetworks.clear(); 
        } else { 
          (this._lastNetworksList || []).forEach(n => this._selectedNetworks.set(n.ssid, this._selectedNetworks.get(n.ssid) || [])); 
        }
        this._updateNetworksList(this._lastNetworksList || []);
        this._updateCharts();
      });

      this._pauseButton = new Gtk.ToggleButton({ 
        icon_name: "media-playback-pause-symbolic", 
        tooltip_text: "Pausar/Retomar atualizações", 
        css_classes: ["flat"]
      });
      this._pauseButton.connect("toggled", () => {
        if (this._pauseButton.get_active()) { 
          this._stopUpdates(); 
          this._pauseButton.set_icon_name("media-playback-start-symbolic"); 
        } else { 
          this._startRealTimeUpdates(); 
          this._pauseButton.set_icon_name("media-playback-pause-symbolic"); 
        }
      });

      this._clearButton = new Gtk.Button({ 
        icon_name: "edit-clear-symbolic", 
        tooltip_text: "Limpar todos os dados", 
        css_classes: ["flat", "destructive-action"]
      });
      this._clearButton.connect("clicked", () => this._clearAllData());

      controlsBox.append(selectAllBtn);
      controlsBox.append(this._pauseButton);
      controlsBox.append(this._clearButton);

      // Lista de redes
      this._networksList = new Gtk.ListBox({ 
        selection_mode: Gtk.SelectionMode.NONE, 
        vexpand: true, 
        css_classes: ["boxed-list"] 
      });
      const scrolled = new Gtk.ScrolledWindow({ 
        child: this._networksList, 
        vexpand: true,
        hscrollbar_policy: Gtk.PolicyType.NEVER
      });

      panel.append(headerBox);
      panel.append(controlsBox);
      panel.append(scrolled);
      
      return panel;
    }

    _createChartsPanel() {
      const panel = new Gtk.Box({ 
        orientation: Gtk.Orientation.VERTICAL, 
        spacing: 12, 
        hexpand: true, 
        vexpand: true,
        css_classes: ["charts-panel"]
      });
      panel.set_margin_start(12);
      panel.set_margin_end(12);
      panel.set_margin_top(12);
      panel.set_margin_bottom(12);

      // Seletor de visualização
      const headerBox = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 12 });
      const viewLabel = new Gtk.Label({ 
        label: "Visualização", 
        css_classes: ["title-4"], 
        xalign: 0,
        hexpand: true
      });
      
      this._viewSelector = new Adw.ViewSwitcher();
      const viewStack = new Adw.ViewStack();
      this._viewSelector.set_stack(viewStack);
      
      headerBox.append(viewLabel);
      headerBox.append(this._viewSelector);

      // Criação dos gráficos
      this._charts = new Map();
      const signalChart = new ChartWidget({ chart_type: "line" });
      const spectrumChart = new ChartWidget({ chart_type: "spectrum" });
      const channelChart = new ChartWidget({ chart_type: "channel" });
      const strengthChart = new ChartWidget({ chart_type: "bars" });

      viewStack.add_titled(signalChart, "signal-time", "Tempo").set_icon_name("emblem-favorite-symbolic");
      viewStack.add_titled(spectrumChart, "spectrum", "Espectro").set_icon_name("preferences-system-symbolic");
      viewStack.add_titled(channelChart, "channel-map", "Canais").set_icon_name("view-grid-symbolic");
      viewStack.add_titled(strengthChart, "signal-bars", "Barras").set_icon_name("view-list-symbolic");

      this._charts.set("signal-time", signalChart);
      this._charts.set("spectrum", spectrumChart);
      this._charts.set("channel-map", channelChart);
      this._charts.set("signal-bars", strengthChart);

      // StatusPage melhorada para estado vazio
      this._emptyStatus = new Adw.StatusPage({ 
        icon_name: "network-wireless-symbolic", 
        title: "Selecione redes para visualizar", 
        description: "Use os interruptores na lista à esquerda para escolher quais redes monitorar nos gráficos em tempo real.",
        vexpand: true,
        hexpand: true
      });
      
      const overlay = new Gtk.Overlay({ child: viewStack, vexpand: true, hexpand: true });
      overlay.add_overlay(this._emptyStatus);
      this._emptyStatus.set_visible(true);

      panel.append(headerBox);
      panel.append(overlay);
      
      return panel;
    }

    _startRealTimeUpdates() {
      if (this._updateInterval) {
        GLib.source_remove(this._updateInterval);
      }
      this._updateInterval = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 2, () => {
        this._updateCharts();
        return GLib.SOURCE_CONTINUE;
      });
    }

    _stopUpdates() {
      if (this._updateInterval) {
        GLib.source_remove(this._updateInterval);
        this._updateInterval = null;
      }
    }

    _clearAllData() {
      this._selectedNetworks.clear();
      this._charts.forEach(c => c.clearData());
      this._updateNetworksList(this._lastNetworksList || []);
      this._updateCharts();
    }

    updateNetworks(networks) {
      this._lastNetworksList = networks;
      this._lastNetworksSize = networks.length;
      this._updateNetworksList(networks);
      
      // Auto-selecionar todas as redes na primeira atualização
      if (this._selectedNetworks.size === 0 && networks.length > 0) {
        networks.forEach(network => {
          this._selectedNetworks.set(network.ssid, []);
        });
        this._updateNetworksList(networks); // Atualizar UI para mostrar seleção
      }
      
      const now = Date.now();
      networks.forEach(n => {
        if (this._selectedNetworks.has(n.ssid)) {
          const arr = this._selectedNetworks.get(n.ssid);
          arr.push({ time: now, signal: n.signal, channel: n.channel, frequency: n.frequency });
          if (arr.length > 50) arr.splice(0, arr.length - 50);
        }
      });
      this._updateCharts();
    }

    _updateNetworksList(networks = []) {
      let child = this._networksList.get_first_child();
      while (child) {
        const next = child.get_next_sibling();
        this._networksList.remove(child);
        child = next;
      }
      
      // Ordenar por sinal (mais forte primeiro) para facilitar identificação da rede conectada
      const sortedNetworks = [...networks].sort((a, b) => b.signal - a.signal);
      
      sortedNetworks.forEach(net => {
        const row = new Adw.ActionRow({ 
          title: net.ssid || "(Oculta)", 
          subtitle: `${net.signal}% • Canal ${net.channel} • ${net.frequency} MHz`
        });
        
        // Ícone indicativo de força do sinal
        const signalIcon = this._getSignalIcon(net.signal);
        const strengthClass = net.signal >= 75 ? 'wifi-strong' : net.signal >= 50 ? 'wifi-medium' : 'wifi-weak';
        const iconImg = new Gtk.Image({ 
          icon_name: signalIcon, 
          css_classes: [strengthClass],
          valign: Gtk.Align.CENTER 
        });
        row.add_prefix(iconImg);
        
        const toggle = new Gtk.Switch({ 
          active: this._selectedNetworks.has(net.ssid), 
          valign: Gtk.Align.CENTER 
        });
        toggle.connect("notify::active", () => {
          if (toggle.get_active()) {
            this._selectedNetworks.set(net.ssid, this._selectedNetworks.get(net.ssid) || []);
          } else {
            this._selectedNetworks.delete(net.ssid);
          }
          this._updateCharts();
        });
        row.add_suffix(toggle);
        this._networksList.append(row);
      });
    }

    _getSignalIcon(signal) {
      if (signal >= 75) return "network-wireless-signal-excellent-symbolic";
      if (signal >= 50) return "network-wireless-signal-good-symbolic";
      if (signal >= 25) return "network-wireless-signal-ok-symbolic";
      return "network-wireless-signal-weak-symbolic";
    }

    _updateCharts() {
      const selectedData = Array.from(this._selectedNetworks.entries()).map(([ssid, data]) => ({ ssid, data }));
      const hasData = selectedData.length > 0;
      this._emptyStatus.set_visible(!hasData);
      if (!hasData) { this._charts.forEach(c => c.clearData()); return; }
      this._updateSignalTimeChart(selectedData);
      this._updateSpectrumChart(selectedData);
      this._updateChannelChart(selectedData);
      this._updateStrengthChart(selectedData);
    }

    _updateSignalTimeChart(sd) { const c = this._charts.get("signal-time"); if (!c) return; c.setData(sd.map(({ssid,data}) => ({ name: ssid, data: data.map(p=>({x:p.time,y:p.signal})) }))); }
    _updateSpectrumChart(sd) { const c = this._charts.get("spectrum"); if (!c) return; c.setData(sd.map(({ssid,data}) => ({ name: ssid, data: data.map(p=>({x:p.frequency,y:p.signal})) }))); }
    _updateChannelChart(sd) { const c = this._charts.get("channel-map"); if (!c) return; c.setData(sd.map(({ssid,data}) => ({ name: ssid, data: data.map(p=>({x:p.channel,y:p.signal})) }))); }
    _updateStrengthChart(sd) { const c = this._charts.get("signal-bars"); if (!c) return; c.setData(sd.map(({ssid,data}) => ({ name: ssid, value: data.length ? data[data.length-1].signal : 0 }))); }
    
    // Métodos públicos para controle de seleção
    selectAllNetworks() {
      if (!this._lastNetworksList) return;
      
      this._lastNetworksList.forEach(network => {
        if (!this._selectedNetworks.has(network.ssid)) {
          this._selectedNetworks.set(network.ssid, []);
        }
      });
      
      this._updateNetworksList(this._lastNetworksList);
    }
    
    deselectAllNetworks() {
      this._selectedNetworks.clear();
      if (this._lastNetworksList) {
        this._updateNetworksList(this._lastNetworksList);
      }
    }
    
    destroy() { this._stopUpdates(); super.destroy(); }
  }
);
