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
      // ToolbarView provê topo padrão GNOME
      const toolbarView = new Adw.ToolbarView();
      this.set_child(toolbarView);

      // Header bar secundária para controles locais da página
      const headerBar = new Adw.HeaderBar();
      headerBar.set_title_widget(new Adw.WindowTitle({ title: "Gráficos" }));

      this._pauseButton = new Gtk.ToggleButton({ icon_name: "media-playback-pause-symbolic", tooltip_text: "Pausar/Retomar", css_classes: ["flat", "accent"] });
      this._pauseButton.connect("toggled", () => {
        if (this._pauseButton.get_active()) { this._stopUpdates(); this._pauseButton.set_icon_name("media-playback-start-symbolic"); }
        else { this._startRealTimeUpdates(); this._pauseButton.set_icon_name("media-playback-pause-symbolic"); }
      });

      this._clearButton = new Gtk.Button({ icon_name: "edit-clear-symbolic", tooltip_text: "Limpar Dados", css_classes: ["flat"] });
      this._clearButton.connect("clicked", () => this._clearAllData());

      const selectAllBtn = new Gtk.Button({ icon_name: "object-select-symbolic", tooltip_text: "Selecionar/Deselecionar Todas", css_classes: ["flat"] });
      selectAllBtn.connect("clicked", () => {
        if (this._selectedNetworks.size === this._lastNetworksSize) { this._selectedNetworks.clear(); }
        else { (this._lastNetworksList || []).forEach(n => this._selectedNetworks.set(n.ssid, this._selectedNetworks.get(n.ssid) || [])); }
        this._updateNetworksList(this._lastNetworksList || []);
        this._updateCharts();
      });

      const headerBoxEnd = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 6 });
      headerBoxEnd.append(selectAllBtn);
      headerBoxEnd.append(this._pauseButton);
      headerBoxEnd.append(this._clearButton);
      headerBar.pack_end(headerBoxEnd);
      toolbarView.add_top_bar(headerBar);

      // Conteúdo principal com Paned
      const paned = new Gtk.Paned({ orientation: Gtk.Orientation.HORIZONTAL, hexpand: true, vexpand: true });
      this._leftPanel = this._createNetworkSelectionPanel();
      this._rightPanel = this._createChartsPanel();
      paned.set_start_child(this._leftPanel);
      paned.set_end_child(this._rightPanel);
      paned.set_position(280);
      toolbarView.set_content(paned);
    }

    _createNetworkSelectionPanel() {
      const clamp = new Adw.Clamp({ tightening_threshold: 320 });
      const box = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 6, vexpand: true });

      const title = new Gtk.Label({ label: "Redes", css_classes: ["title-4"], xalign: 0 });
      box.append(title);

      this._networksList = new Gtk.ListBox({ selection_mode: Gtk.SelectionMode.NONE, vexpand: true, css_classes: ["boxed-list"] });
      const scrolled = new Gtk.ScrolledWindow({ child: this._networksList, vexpand: true });
      box.append(scrolled);
      clamp.set_child(box);
      return clamp;
    }

    _createChartsPanel() {
      const outer = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 0, hexpand: true, vexpand: true });
      const clamp = new Adw.Clamp({ tightening_threshold: 600 });
      const box = new Gtk.Box({ orientation: Gtk.Orientation.VERTICAL, spacing: 12, vexpand: true });

      const switcherBar = new Gtk.Box({ orientation: Gtk.Orientation.HORIZONTAL, spacing: 12, css_classes: ["toolbar"] });
      const label = new Gtk.Label({ label: "Visualização", css_classes: ["dim-label"], xalign: 0 });
      this._viewSelector = new Adw.ViewSwitcher();
      const viewStack = new Adw.ViewStack();
      this._viewSelector.set_stack(viewStack);
      switcherBar.append(label);
      switcherBar.append(this._viewSelector);

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

      this._emptyStatus = new Adw.StatusPage({ icon_name: "info-symbolic", title: "Nenhuma rede selecionada", description: "Ative os interruptores na lista à esquerda para visualizar dados." });
      const overlay = new Gtk.Overlay({ child: viewStack });
      overlay.add_overlay(this._emptyStatus);
      this._emptyStatus.set_visible(true);

      box.append(switcherBar);
      box.append(overlay);
      clamp.set_child(box);
      outer.append(clamp);
      return outer;
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
      networks.forEach(net => {
        const row = new Adw.ActionRow({ title: net.ssid || "(Oculta)", subtitle: `${net.signal}% • Ch ${net.channel}` });
        const toggle = new Gtk.Switch({ active: this._selectedNetworks.has(net.ssid), valign: Gtk.Align.CENTER });
        toggle.connect("notify::active", () => {
          if (toggle.get_active()) this._selectedNetworks.set(net.ssid, this._selectedNetworks.get(net.ssid) || []); else this._selectedNetworks.delete(net.ssid);
          this._updateCharts();
        });
        row.add_suffix(toggle);
        this._networksList.append(row);
      });
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
    destroy() { this._stopUpdates(); super.destroy(); }
  }
);
