// telemetryWindow.js - Telemetry/Hunt tracking window

print("DEBUG: telemetryWindow.js está sendo carregado");

const { GObject, Gtk, Adw, Gio, GLib } = imports.gi;

var TelemetryWindow = GObject.registerClass(
  {
    GTypeName: "TelemetryWindow",
    Properties: {
      'network-manager': GObject.ParamSpec.object(
        'network-manager',
        'Network Manager',
        'Network Manager instance',
        GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT_ONLY,
        GObject.Object
      ),
    },
  },
  class TelemetryWindow extends Adw.ApplicationWindow {
    _init(params = {}) {
      // Extrair networkManager antes de chamar super._init
      const { networkManager, ...superParams } = params;
      
      super._init({
        ...superParams,
        title: "Telemetria e Rastreamento",
        default_width: 900,
        default_height: 600,
      });

      this._networkManager = networkManager;
      this._selectedTargets = new Map();
      this._isRecording = false;
      this._recordingStartTime = null;
      
      this._buildUI();
      this._setupSignals();
    }

    _buildUI() {
      // Layout principal
      const mainBox = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 0,
      });

      // Header com controles
      const headerBar = new Adw.HeaderBar({
        title_widget: new Adw.WindowTitle({
          title: "Telemetria WiFi",
          subtitle: "Rastreamento em tempo real"
        }),
      });

      // Botão Hunt Mode
      this._huntModeButton = new Gtk.ToggleButton({
        icon_name: "view-pin-symbolic",
        tooltip_text: "Ativar/Desativar Hunt Mode",
        css_classes: ["suggested-action"]
      });

      // Botão de recording
      this._recordButton = new Gtk.ToggleButton({
        icon_name: "media-record-symbolic",
        tooltip_text: "Iniciar/Parar Gravação",
      });

      // Menu de exportação
      const exportMenu = Gio.Menu.new();
      exportMenu.append("Exportar JSON", "telemetry.export::json");
      exportMenu.append("Exportar CSV", "telemetry.export::csv");
      exportMenu.append("Exportar Sparrow", "telemetry.export::sparrow");
      
      const exportButton = new Gtk.MenuButton({
        icon_name: "document-save-symbolic",
        tooltip_text: "Exportar Dados",
        menu_model: exportMenu
      });

      headerBar.pack_start(this._huntModeButton);
      headerBar.pack_end(exportButton);
      headerBar.pack_end(this._recordButton);

      // Status bar
      this._statusBox = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        spacing: 12,
        margin_top: 6,
        margin_bottom: 6,
        margin_start: 12,
        margin_end: 12,
        css_classes: ["card"]
      });

      this._statusLabels = {
        huntMode: new Gtk.Label({ label: "Hunt Mode: Desativado" }),
        recording: new Gtk.Label({ label: "Gravação: Parada" }),
        targets: new Gtk.Label({ label: "Alvos: 0" }),
        gps: new Gtk.Label({ label: "GPS: Desconectado" })
      };

      for (const label of Object.values(this._statusLabels)) {
        label.set_css_classes(["caption"]);
        this._statusBox.append(label);
      }

      // Painel principal dividido
      const paned = new Gtk.Paned({
        orientation: Gtk.Orientation.HORIZONTAL,
        vexpand: true,
        position: 300
      });

      // Painel esquerdo - Lista de alvos
      const leftPanel = this._createTargetsPanel();
      paned.set_start_child(leftPanel);

      // Painel direito - Gráficos de telemetria
      const rightPanel = this._createTelemetryPanel();
      paned.set_end_child(rightPanel);

      mainBox.append(headerBar);
      mainBox.append(this._statusBox);
      mainBox.append(paned);

      this.set_content(mainBox);
    }

    _createTargetsPanel() {
      const panel = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 6,
        margin_top: 6,
        margin_bottom: 6,
        margin_start: 6,
        margin_end: 3,
      });

      // Cabeçalho do painel
      const headerBox = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        spacing: 6,
      });

      const title = new Gtk.Label({
        label: "Alvos de Rastreamento",
        css_classes: ["heading"]
      });

      const addButton = new Gtk.Button({
        icon_name: "list-add-symbolic",
        tooltip_text: "Adicionar Alvo Manualmente",
        css_classes: ["flat"]
      });

      headerBox.append(title);
      headerBox.append(new Gtk.Box({ hexpand: true })); // spacer
      headerBox.append(addButton);

      // Lista de alvos
      this._targetsList = new Gtk.ListBox({
        selection_mode: Gtk.SelectionMode.SINGLE,
        css_classes: ["boxed-list"]
      });

      const scrolled = new Gtk.ScrolledWindow({
        hscrollbar_policy: Gtk.PolicyType.NEVER,
        vexpand: true,
        child: this._targetsList
      });

      panel.append(headerBox);
      panel.append(scrolled);

      return panel;
    }

    _createTelemetryPanel() {
      const panel = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 6,
        margin_top: 6,
        margin_bottom: 6,
        margin_start: 3,
        margin_end: 6,
      });

      // Notebook com diferentes visualizações
      const notebook = new Gtk.Notebook();

      // Aba 1: Gráfico de sinal em tempo real
      const signalPage = this._createSignalChart();
      notebook.append_page(signalPage, new Gtk.Label({ label: "Sinal" }));

      // Aba 2: Mapa de localização
      const mapPage = this._createLocationMap();
      notebook.append_page(mapPage, new Gtk.Label({ label: "Localização" }));

      // Aba 3: Estatísticas
      const statsPage = this._createStatisticsView();
      notebook.append_page(statsPage, new Gtk.Label({ label: "Estatísticas" }));

      panel.append(notebook);

      return panel;
    }

    _createSignalChart() {
      const chartBox = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 6,
        margin_top: 12,
        margin_bottom: 12,
        margin_start: 12,
        margin_end: 12,
      });

      // Por enquanto, um placeholder que podemos substituir por gráficos reais
      this._signalChart = new Gtk.DrawingArea({
        vexpand: true,
        css_classes: ["card"]
      });

      // Legenda
      const legendBox = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        spacing: 12,
        halign: Gtk.Align.CENTER
      });

      const timeLabel = new Gtk.Label({
        label: "Tempo (últimos 10 min)",
        css_classes: ["caption"]
      });

      const signalLabel = new Gtk.Label({
        label: "Sinal (dBm)",
        css_classes: ["caption"]
      });

      legendBox.append(timeLabel);
      legendBox.append(signalLabel);

      chartBox.append(this._signalChart);
      chartBox.append(legendBox);

      return chartBox;
    }

    _createLocationMap() {
      const mapBox = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 6,
        margin_top: 12,
        margin_bottom: 12,
        margin_start: 12,
        margin_end: 12,
      });

      // Placeholder para mapa
      this._mapArea = new Gtk.DrawingArea({
        vexpand: true,
        css_classes: ["card"]
      });

      // Controles do mapa
      const mapControls = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        spacing: 6,
        halign: Gtk.Align.CENTER
      });

      const centerButton = new Gtk.Button({
        label: "Centralizar",
        css_classes: ["pill"]
      });

      const exportMapButton = new Gtk.Button({
        label: "Exportar Mapa",
        css_classes: ["pill"]
      });

      mapControls.append(centerButton);
      mapControls.append(exportMapButton);

      mapBox.append(this._mapArea);
      mapBox.append(mapControls);

      return mapBox;
    }

    _createStatisticsView() {
      const statsBox = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 12,
        margin_top: 12,
        margin_bottom: 12,
        margin_start: 12,
        margin_end: 12,
      });

      // Grid para estatísticas
      this._statsGrid = new Gtk.Grid({
        row_spacing: 12,
        column_spacing: 24,
        halign: Gtk.Align.CENTER
      });

      const statsLabels = [
        ["Sinal Médio:", "---"],
        ["Sinal Máximo:", "---"],
        ["Sinal Mínimo:", "---"],
        ["Desvio Padrão:", "---"],
        ["Última Atualização:", "---"],
        ["Distância Estimada:", "---"]
      ];

      this._statsValues = new Map();

      for (let i = 0; i < statsLabels.length; i++) {
        const [labelText, defaultValue] = statsLabels[i];
        
        const label = new Gtk.Label({
          label: labelText,
          halign: Gtk.Align.END,
          css_classes: ["body"]
        });

        const value = new Gtk.Label({
          label: defaultValue,
          halign: Gtk.Align.START,
          css_classes: ["heading"]
        });

        this._statsValues.set(labelText, value);
        
        this._statsGrid.attach(label, 0, i, 1, 1);
        this._statsGrid.attach(value, 1, i, 1, 1);
      }

      statsBox.append(this._statsGrid);

      return statsBox;
    }

    _setupSignals() {
      // Hunt Mode toggle
      this._huntModeButton.connect('toggled', () => {
        if (this._huntModeButton.get_active()) {
          this._networkManager.enableHuntMode();
          this._statusLabels.huntMode.set_label("Hunt Mode: Ativo");
          this._huntModeButton.set_css_classes(["destructive-action"]);
        } else {
          this._networkManager.disableHuntMode();
          this._statusLabels.huntMode.set_label("Hunt Mode: Desativado");
          this._huntModeButton.set_css_classes(["suggested-action"]);
        }
      });

      // Recording toggle
      this._recordButton.connect('toggled', () => {
        this._isRecording = this._recordButton.get_active();
        if (this._isRecording) {
          this._recordingStartTime = new Date();
          this._statusLabels.recording.set_label("Gravação: Ativa");
          this._recordButton.set_css_classes(["destructive-action"]);
        } else {
          this._statusLabels.recording.set_label("Gravação: Parada");
          this._recordButton.set_css_classes([]);
        }
      });

      // Network Manager signals
      if (this._networkManager) {
        this._networkManager.connect('hunt-mode-changed', (source, enabled) => {
          this._huntModeButton.set_active(enabled);
        });

        this._networkManager.connect('networks-updated', (source, networks) => {
          this._updateTelemetryData(networks);
        });
      }

      // Ações de exportação
      const exportAction = new Gio.SimpleAction({
        name: "export",
        parameter_type: new GLib.VariantType('s')
      });

      exportAction.connect('activate', (action, parameter) => {
        const format = parameter.get_string();
        this._exportTelemetryData(format);
      });

      this.add_action(exportAction);
    }

    _updateTelemetryData(networks) {
      // Atualizar contadores
      const huntTargets = this._networkManager.getHuntTargets();
      this._statusLabels.targets.set_label(`Alvos: ${huntTargets.length}`);

      // Atualizar status GPS
      if (this._networkManager.isGPSEnabled()) {
        const location = this._networkManager.getCurrentLocation();
        if (location.isValid) {
          this._statusLabels.gps.set_label("GPS: Conectado");
        } else {
          this._statusLabels.gps.set_label("GPS: Procurando...");
        }
      } else {
        this._statusLabels.gps.set_label("GPS: Desativado");
      }

      // Atualizar lista de alvos
      this._updateTargetsList(huntTargets);

      // Atualizar estatísticas se há alvo selecionado
      this._updateSelectedTargetStats();
    }

    _updateTargetsList(targets) {
      // Limpar lista existente
      let child = this._targetsList.get_first_child();
      while (child) {
        this._targetsList.remove(child);
        child = this._targetsList.get_first_child();
      }

      // Adicionar alvos atualizados
      for (const target of targets) {
        const row = new Adw.ActionRow({
          title: target.ssid || "Rede Oculta",
          subtitle: `${target.bssid} • ${target.strongestSignal}dBm`
        });

        // Indicador de tendência
        const trend = target.getRecentSignalTrend();
        let trendIcon = "view-refresh-symbolic";
        let trendColor = "dim-label";

        if (trend === 'improving') {
          trendIcon = "pan-up-symbolic";
          trendColor = "success";
        } else if (trend === 'degrading') {
          trendIcon = "pan-down-symbolic";
          trendColor = "error";
        }

        const trendImage = new Gtk.Image({
          icon_name: trendIcon,
          css_classes: [trendColor]
        });

        // Botão remover
        const removeButton = new Gtk.Button({
          icon_name: "edit-delete-symbolic",
          css_classes: ["flat"],
          tooltip_text: "Remover Alvo"
        });

        removeButton.connect('clicked', () => {
          this._networkManager.removeHuntTarget(target.bssid);
        });

        row.add_prefix(trendImage);
        row.add_suffix(removeButton);

        this._targetsList.append(row);
      }
    }

    _updateSelectedTargetStats() {
      // Implementar atualização das estatísticas do alvo selecionado
      // Por enquanto, placeholder
      this._statsValues.get("Última Atualização:").set_label(
        new Date().toLocaleTimeString()
      );
    }

    async _exportTelemetryData(format) {
      try {
        const result = await this._networkManager.exportHuntData(format);
        
        // Salvar arquivo
        const filename = `telemetry_${Date.now()}.${format}`;
        const success = await this._saveTelemetryFile(result, filename);
        
        if (success) {
          this._showSuccessToast(`Dados exportados: ${filename}`);
        } else {
          this._showErrorToast("Falha ao exportar dados");
        }
      } catch (error) {
        this._showErrorToast(`Erro na exportação: ${error.message}`);
      }
    }

    async _saveTelemetryFile(data, filename) {
      // Implementar salvamento de arquivo
      // Por enquanto, simular sucesso
      print(`Salvando telemetria em ${filename}`);
      return true;
    }

    _showSuccessToast(message) {
      const toast = new Adw.Toast({
        title: message,
        timeout: 3
      });
      
      // Precisaria de um ToastOverlay no layout principal
      // Por enquanto, só log
      print(`SUCCESS: ${message}`);
    }

    _showErrorToast(message) {
      const toast = new Adw.Toast({
        title: message,
        timeout: 5
      });
      
      // Precisaria de um ToastOverlay no layout principal
      // Por enquanto, só log
      print(`ERROR: ${message}`);
    }

    // Método público para adicionar alvo externo
    addHuntTarget(bssid, ssid = "") {
      if (this._networkManager) {
        this._networkManager.addHuntTarget(bssid, ssid);
      }
    }
  }
);
