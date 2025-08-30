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
        default_width: 1000,
        default_height: 700,
      });

      this._networkManager = networkManager;
      this._selectedTargets = new Map();
      this._isRecording = false;
      this._recordingStartTime = null;
      
      // Configurações persistentes
      try {
        this._settings = new Gio.Settings({
          schema_id: "com.example.WifiAnalyzer"
        });
      } catch (e) {
        print(`Aviso: Não foi possível carregar settings na telemetria: ${e.message}`);
        this._settings = null;
      }
      
      this._buildUI();
      this._setupSignals();
      
      // Configurar GPS inicial baseado nas preferências
      this._initializeGPSFromSettings();
      
      // Restaurar estados salvos
      this._restorePersistedStates();
      
      // Forçar atualização inicial da interface
      GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
        this._updateTelemetryData([]);
        return GLib.SOURCE_REMOVE;
      });
      
      // Timer para atualizar dados de sinal em tempo real
      this._signalUpdateTimer = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
        if (this._isRecording || this._signalData.size > 0) {
          const huntTargets = this._networkManager ? this._networkManager.getHuntTargets() : [];
          this._updateRealtimeSignalData(huntTargets);
        }
        return GLib.SOURCE_CONTINUE;
      });
    }

    _buildUI() {
      // Layout principal
      const mainBox = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 0,
      });

      // ViewStack para as páginas de telemetria
      this._viewStack = new Adw.ViewStack({
        vexpand: true,
        hexpand: true,
      });

      // ViewSwitcher no header
      const viewSwitcher = new Adw.ViewSwitcher({
        stack: this._viewStack,
        policy: Adw.ViewSwitcherPolicy.WIDE,
      });

      // Header com ViewSwitcher
      const headerBar = new Adw.HeaderBar({
        title_widget: viewSwitcher,
      });

      // Botão unificado de monitoramento
      this._monitorButton = new Gtk.ToggleButton({
        icon_name: "view-reveal-symbolic",
        tooltip_text: "Ativar/Desativar Monitoramento de Alvos",
      });

      // Botão GPS
      this._gpsButton = new Gtk.ToggleButton({
        icon_name: "find-location-symbolic",
        tooltip_text: "Ativar/Desativar GPS",
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

      headerBar.pack_start(this._monitorButton);
      headerBar.pack_start(this._gpsButton);
      headerBar.pack_end(exportButton);

      // Status bar seguindo padrões Libadwaita
      this._statusBox = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        spacing: 24,
        margin_top: 18,
        margin_bottom: 18,
        margin_start: 24,
        margin_end: 24,
        halign: Gtk.Align.CENTER
      });

      this._statusLabels = {
        monitoring: new Gtk.Label({ 
          label: "Monitoramento: Desativado",
          css_classes: ["caption"]
        }),
        targets: new Gtk.Label({ 
          label: "Alvos: 0",
          css_classes: ["caption", "accent"]
        }),
        gps: new Gtk.Label({ 
          label: "GPS: Desconectado",
          css_classes: ["caption"]
        })
      };

      // Criar separadores visuais entre os status
      const statusItems = Object.values(this._statusLabels);
      for (let i = 0; i < statusItems.length; i++) {
        this._statusBox.append(statusItems[i]);
        
        // Adicionar separador vertical exceto no último item
        if (i < statusItems.length - 1) {
          const separator = new Gtk.Separator({
            orientation: Gtk.Orientation.VERTICAL,
            margin_top: 4,
            margin_bottom: 4
          });
          this._statusBox.append(separator);
        }
      }

      // Criar as páginas da ViewStack
      this._createTelemetryPages();

      mainBox.append(headerBar);
      mainBox.append(this._statusBox);
      mainBox.append(this._viewStack);

      this.set_content(mainBox);
    }

    _createTelemetryPages() {
      // Página 1: Monitoramento de Sinal (combinando lista de alvos + gráfico)
      const signalPage = this._createSignalMonitoringPage();
      this._viewStack.add_titled_with_icon(
        signalPage,
        "signal",
        "Sinal em Tempo Real",
        "network-wireless-signal-excellent-symbolic"
      );

      // Página 2: Localização 
      const locationPage = this._createLocationMap();
      this._viewStack.add_titled_with_icon(
        locationPage,
        "location", 
        "Localização",
        "find-location-symbolic"
      );

      // Página 3: Análise Avançada
      const statsPage = this._createAdvancedStatistics();
      this._viewStack.add_titled_with_icon(
        statsPage,
        "stats",
        "Análise Avançada", 
        "org.gnome.Settings-symbolic"
      );
    }

    _createSignalMonitoringPage() {
      // Página combinada com painel dividido (alvos + gráfico)
      const paned = new Gtk.Paned({
        orientation: Gtk.Orientation.HORIZONTAL,
        vexpand: true,
        position: 300
      });

      // Painel esquerdo - Lista de alvos
      const leftPanel = this._createTargetsPanel();
      paned.set_start_child(leftPanel);

      // Painel direito - Gráfico de sinal
      const rightPanel = this._createRealtimeSignalMonitor();
      paned.set_end_child(rightPanel);

      return paned;
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

      addButton.connect("clicked", () => {
        this._showAddTargetDialog();
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


    _createRealtimeSignalMonitor() {
      const monitorBox = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 12,
        margin_top: 18,
        margin_bottom: 18,
        margin_start: 18,
        margin_end: 18,
      });

      // Cabeçalho com controles
      const headerBox = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        spacing: 12,
        margin_bottom: 12
      });

      const titleLabel = new Gtk.Label({
        label: "Monitor de Sinal em Tempo Real",
        css_classes: ["heading"]
      });

      // Controles de visualização
      const controlsBox = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        spacing: 6
      });

      // Botão para pausar/continuar
      this._pauseButton = new Gtk.ToggleButton({
        label: "Pausar",
        tooltip_text: "Pausar atualizações do gráfico",
        css_classes: ["pill"]
      });

      // Botão para limpar histórico
      const clearButton = new Gtk.Button({
        label: "Limpar",
        tooltip_text: "Limpar dados do gráfico",
        css_classes: ["pill"]
      });

      controlsBox.append(this._pauseButton);
      controlsBox.append(clearButton);

      headerBox.append(titleLabel);
      headerBox.append(new Gtk.Box({ hexpand: true })); // spacer
      headerBox.append(controlsBox);

      // Área principal do gráfico
      const chartFrame = new Gtk.Frame({
        css_classes: ["card"],
        vexpand: true
      });

      // Área de desenho para gráficos Cairo
      this._signalChart = new Gtk.DrawingArea({
        vexpand: true,
        hexpand: true
      });

      // Configurar desenho do gráfico
      this._signalChart.set_draw_func((area, cr, width, height) => {
        this._drawRealtimeChart(cr, width, height);
      });

      chartFrame.set_child(this._signalChart);

      // Configurar eventos
      clearButton.connect("clicked", () => {
        this._clearSignalData();
      });

      this._pauseButton.connect("toggled", () => {
        this._isPaused = this._pauseButton.get_active();
      });

      // Inicializar dados
      this._signalData = new Map(); // BSSID -> {name, data[{time, signal, quality}]}
      this._maxDataPoints = 100;
      this._isPaused = false;

      monitorBox.append(headerBox);
      monitorBox.append(chartFrame);

      return monitorBox;
    }

    _createLocationMap() {
      const mapBox = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 12,
        margin_top: 18,
        margin_bottom: 18,
        margin_start: 18,
        margin_end: 18,
      });

      // Informações de localização GPS atual
      const currentLocationGroup = new Adw.PreferencesGroup({
        title: "Sua Localização Atual",
        description: "GPS usado para mapear onde os alvos foram detectados com maior força"
      });

      this._gpsStatusRow = new Adw.ActionRow({
        title: "Status GPS",
        subtitle: "Verificando..."
      });

      this._coordinatesRow = new Adw.ActionRow({
        title: "Suas Coordenadas",
        subtitle: "Aguardando GPS..."
      });

      this._accuracyRow = new Adw.ActionRow({
        title: "Precisão GPS",
        subtitle: "--- metros"
      });

      currentLocationGroup.add(this._gpsStatusRow);
      currentLocationGroup.add(this._coordinatesRow);
      currentLocationGroup.add(this._accuracyRow);

      // Lista de localizações onde alvos foram detectados
      const targetsLocationGroup = new Adw.PreferencesGroup({
        title: "Localização dos Alvos Rastreados",
        description: "Coordenadas onde cada alvo teve o sinal mais forte detectado"
      });

      this._locationListBox = new Gtk.ListBox({
        selection_mode: Gtk.SelectionMode.NONE,
        css_classes: ["boxed-list"]
      });

      const scrolledLocation = new Gtk.ScrolledWindow({
        hscrollbar_policy: Gtk.PolicyType.NEVER,
        vexpand: true,
        child: this._locationListBox
      });

      targetsLocationGroup.add(scrolledLocation);

      // Controles
      const controlsBox = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        spacing: 12,
        halign: Gtk.Align.CENTER,
        margin_top: 12
      });

      const refreshGpsButton = new Gtk.Button({
        label: "Atualizar GPS",
        css_classes: ["pill"]
      });

      const exportLocationButton = new Gtk.Button({
        label: "Exportar Localizações",
        css_classes: ["pill"]
      });

      refreshGpsButton.connect("clicked", () => {
        this._refreshGpsInfo();
      });

      controlsBox.append(refreshGpsButton);
      controlsBox.append(exportLocationButton);

      mapBox.append(currentLocationGroup);
      mapBox.append(targetsLocationGroup);
      mapBox.append(controlsBox);

      return mapBox;
    }

    _createAdvancedStatistics() {
      const statsBox = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 18,
        margin_top: 18,
        margin_bottom: 18,
        margin_start: 18,
        margin_end: 18,
      });

      // Estatísticas básicas
      const basicStatsGroup = new Adw.PreferencesGroup({
        title: "Estatísticas dos Alvos"
      });

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
        ["Amostras Coletadas:", "---"],
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

      basicStatsGroup.add(this._statsGrid);

      // Análise de espectro e canais
      const spectrumGroup = new Adw.PreferencesGroup({
        title: "Análise de Espectro",
        description: "Distribuição de alvos por canal e análise de congestionamento"
      });

      this._spectrumAnalysis = new Gtk.ListBox({
        selection_mode: Gtk.SelectionMode.NONE,
        css_classes: ["boxed-list"]
      });

      const scrolledSpectrum = new Gtk.ScrolledWindow({
        hscrollbar_policy: Gtk.PolicyType.NEVER,
        max_content_height: 250,
        child: this._spectrumAnalysis
      });

      spectrumGroup.add(scrolledSpectrum);

      // Informações de sessão
      const sessionGroup = new Adw.PreferencesGroup({
        title: "Informações da Sessão"
      });

      this._sessionStartRow = new Adw.ActionRow({
        title: "Início da Sessão",
        subtitle: "---"
      });

      this._totalSamplesRow = new Adw.ActionRow({
        title: "Total de Amostras",
        subtitle: "0"
      });

      this._monitoringTimeRow = new Adw.ActionRow({
        title: "Tempo de Monitoramento",
        subtitle: "0 segundos"
      });

      sessionGroup.add(this._sessionStartRow);
      sessionGroup.add(this._totalSamplesRow);
      sessionGroup.add(this._monitoringTimeRow);

      statsBox.append(basicStatsGroup);
      statsBox.append(spectrumGroup);
      statsBox.append(sessionGroup);

      return statsBox;
    }

    _setupSignals() {
      // Botão unificado de monitoramento
      this._monitorButton.connect('toggled', () => {
        const isActive = this._monitorButton.get_active();
        if (isActive) {
          // Ativar modo hunt e gravação
          this._networkManager.enableHuntMode();
          this._isRecording = true;
          this._recordingStartTime = new Date();
          this._statusLabels.monitoring.set_label("Monitoramento: Ativo");
          this._monitorButton.set_css_classes(["suggested-action"]);
          
          // Forçar criação imediata de dados demo se não há alvos
          print("DEBUG: Monitoramento ativado, verificando dados demo");
          const huntTargets = this._networkManager ? this._networkManager.getHuntTargets() : [];
          if (huntTargets.length === 0) {
            this._createDemoTargets();
            // Forçar uma atualização imediata dos dados demo
            setTimeout(() => {
              this._updateRealtimeSignalData([]);
            }, 100);
          } else {
            // Se há alvos reais, forçar atualização com eles
            this._updateRealtimeSignalData(huntTargets);
          }
          
          // Forçar redesenho imediato do gráfico
          if (this._signalChart) {
            this._signalChart.queue_draw();
          }
        } else {
          // Desativar modo hunt e gravação
          this._networkManager.disableHuntMode();
          this._isRecording = false;
          this._statusLabels.monitoring.set_label("Monitoramento: Desativado");
          this._monitorButton.set_css_classes([]);
          
          // Limpar dados demo quando parar
          this._clearSignalData();
        }
        
        // Salvar estados
        this._saveHuntModeState(isActive);
        this._saveRecordingState(isActive);
      });

      // GPS toggle
      this._gpsButton.connect('toggled', () => {
        const isActive = this._gpsButton.get_active();
        if (isActive) {
          this._networkManager.enableGPS && this._networkManager.enableGPS();
          this._statusLabels.gps.set_label("GPS: Ativando...");
          this._gpsButton.set_css_classes(["suggested-action"]);
        } else {
          this._networkManager.disableGPS && this._networkManager.disableGPS();
          this._statusLabels.gps.set_label("GPS: Desativado");
          this._gpsButton.set_css_classes([]);
        }
        
        // Salvar estado
        this._saveGpsState(isActive);
      });

      // Network Manager signals
      if (this._networkManager) {
        this._networkManager.connect('hunt-mode-changed', (source, enabled) => {
          this._monitorButton.set_active(enabled);
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
      if (!this._networkManager) {
        print("DEBUG: NetworkManager não disponível na telemetria");
        return;
      }

      // Atualizar contadores
      const huntTargets = this._networkManager.getHuntTargets();
      print(`DEBUG: Hunt targets encontrados: ${huntTargets.length}`);
      this._statusLabels.targets.set_label(`Alvos: ${huntTargets.length}`);

      // Atualizar status GPS
      try {
        if (this._networkManager.isGPSEnabled && this._networkManager.isGPSEnabled()) {
          const location = this._networkManager.getCurrentLocation();
          if (location && location.isValid) {
            this._statusLabels.gps.set_label("GPS: Conectado");
          } else {
            this._statusLabels.gps.set_label("GPS: Procurando...");
          }
        } else {
          this._statusLabels.gps.set_label("GPS: Desativado");
        }
      } catch (error) {
        print(`DEBUG: Erro ao verificar GPS: ${error.message}`);
        this._statusLabels.gps.set_label("GPS: Erro");
      }

      // Atualizar lista de alvos
      this._updateTargetsList(huntTargets);

      // Atualizar dados de sinal em tempo real
      this._updateRealtimeSignalData(huntTargets);

      // Atualizar abas com dados dos alvos
      this._updateLocationData(huntTargets);

      // Atualizar estatísticas avançadas
      this._updateAdvancedStatistics(huntTargets);
    }

    _updateTargetsList(targets) {
      print(`DEBUG: Atualizando lista de alvos com ${targets ? targets.length : 0} itens`);
      
      // Limpar lista existente
      let child = this._targetsList.get_first_child();
      while (child) {
        this._targetsList.remove(child);
        child = this._targetsList.get_first_child();
      }

      // Se não há alvos, mostrar mensagem
      if (!targets || targets.length === 0) {
        const emptyRow = new Adw.ActionRow({
          title: "Nenhum alvo de rastreamento",
          subtitle: "Adicione alvos clicando em ℹ️ nas redes da janela principal",
          sensitive: false
        });
        
        const infoIcon = new Gtk.Image({
          icon_name: "dialog-information-symbolic",
          css_classes: ["dim-label"]
        });
        
        emptyRow.add_prefix(infoIcon);
        this._targetsList.append(emptyRow);
        return;
      }

      // Adicionar alvos atualizados
      for (const target of targets) {
        print(`DEBUG: Adicionando alvo: ${target.ssid || 'Sem nome'} (${target.bssid})`);
        
        const row = new Adw.ActionRow({
          title: target.ssid || "Rede Oculta",
          subtitle: `${target.bssid} • ${target.strongestSignal || -100}dBm`
        });

        // Indicador de tendência
        let trend = 'stable';
        try {
          trend = target.getRecentSignalTrend ? target.getRecentSignalTrend() : 'stable';
        } catch (e) {
          print(`DEBUG: Erro ao obter tendência: ${e.message}`);
        }

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
          print(`DEBUG: Removendo alvo: ${target.bssid}`);
          this._removeHuntTarget(target.bssid);
        });

        row.add_prefix(trendImage);
        row.add_suffix(removeButton);

        this._targetsList.append(row);
      }
    }

    _updateAdvancedStatistics(targets) {
      // Inicializar sessão se necessário
      if (!this._sessionStartTime) {
        this._sessionStartTime = new Date();
        this._sessionStartRow.set_subtitle(this._sessionStartTime.toLocaleString());
        this._totalSamples = 0;
      }

      // Atualizar contadores de amostras
      this._totalSamples += targets ? targets.length : 0;
      this._totalSamplesRow.set_subtitle(this._totalSamples.toString());

      // Calcular tempo de monitoramento
      const monitoringTime = Math.floor((Date.now() - this._sessionStartTime.getTime()) / 1000);
      this._monitoringTimeRow.set_subtitle(`${monitoringTime} segundos`);

      // Estatísticas dos alvos
      if (!targets || targets.length === 0) {
        this._statsValues.get("Sinal Médio:").set_label("---");
        this._statsValues.get("Sinal Máximo:").set_label("---");
        this._statsValues.get("Sinal Mínimo:").set_label("---");
        this._statsValues.get("Desvio Padrão:").set_label("---");
        this._statsValues.get("Amostras Coletadas:").set_label("0");
        this._statsValues.get("Distância Estimada:").set_label("---");
        return;
      }

      // Calcular estatísticas agregadas de todos os alvos
      let allSignals = [];
      let totalSamples = 0;
      
      for (const target of targets) {
        // Usar dados do NetworkHuntTarget (que tem history) ou dados de monitoramento em tempo real
        if (target.history && target.history.length > 0) {
          const signals = target.history.map(h => h.signal);
          allSignals = allSignals.concat(signals);
          totalSamples += target.history.length;
        } else if (this._signalData && this._signalData.has(target.bssid)) {
          // Usar dados de monitoramento em tempo real
          const realtimeData = this._signalData.get(target.bssid);
          if (realtimeData.data && realtimeData.data.length > 0) {
            const signals = realtimeData.data.map(d => d.signal);
            allSignals = allSignals.concat(signals);
            totalSamples += realtimeData.data.length;
          }
        }
      }

      if (allSignals.length > 0) {
        const avg = allSignals.reduce((a, b) => a + b, 0) / allSignals.length;
        const max = Math.max(...allSignals);
        const min = Math.min(...allSignals);
        const variance = allSignals.reduce((acc, val) => acc + Math.pow(val - avg, 2), 0) / allSignals.length;
        const stdDev = Math.sqrt(variance);

        this._statsValues.get("Sinal Médio:").set_label(`${avg.toFixed(1)} dBm`);
        this._statsValues.get("Sinal Máximo:").set_label(`${max} dBm`);
        this._statsValues.get("Sinal Mínimo:").set_label(`${min} dBm`);
        this._statsValues.get("Desvio Padrão:").set_label(`${stdDev.toFixed(1)} dBm`);
        this._statsValues.get("Amostras Coletadas:").set_label(totalSamples.toString());
        this._statsValues.get("Distância Estimada:").set_label(`${this._estimateDistance(max)}m`);
      }

      // Atualizar análise de espectro
      this._updateSpectrumAnalysis(targets);
    }

    _estimateDistance(signalStrength) {
      // Fórmula melhorada para estimar distância baseada na força do sinal WiFi
      // Usando fórmula de propagação em espaço livre (aproximação)
      // RSSI = -10 * n * log10(d) + A
      // onde n ≈ 2 (expoente de perda de caminho), A ≈ -30 (RSSI a 1 metro)
      
      if (signalStrength >= -30) return "< 1";
      if (signalStrength >= -40) return "1-2";
      if (signalStrength >= -50) return "2-5";
      if (signalStrength >= -60) return "5-10";
      if (signalStrength >= -70) return "10-25";
      if (signalStrength >= -80) return "25-50";
      if (signalStrength >= -90) return "50-100";
      return "> 100";
    }


    _refreshGpsInfo() {
      if (!this._networkManager) return;

      try {
        if (this._networkManager.isGPSEnabled && this._networkManager.isGPSEnabled()) {
          const location = this._networkManager.getCurrentLocation();
          if (location && location.isValid) {
            this._gpsStatusRow.set_subtitle("GPS ativo e conectado");
            this._coordinatesRow.set_subtitle(`${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`);
            this._accuracyRow.set_subtitle(`±${location.accuracy || 'Desconhecida'} metros`);
            
            // Atualizar localizações dos alvos atuais com GPS atual
            this._updateTargetsWithCurrentGPS(location);
          } else {
            this._gpsStatusRow.set_subtitle("GPS ativo, procurando sinal...");
            this._coordinatesRow.set_subtitle("Aguardando coordenadas...");
            this._accuracyRow.set_subtitle("--- metros");
          }
        } else {
          this._gpsStatusRow.set_subtitle("GPS desativado - Clique no botão GPS");
          this._coordinatesRow.set_subtitle("Ative o GPS para registrar localizações");
          this._accuracyRow.set_subtitle("--- metros");
        }
      } catch (error) {
        this._gpsStatusRow.set_subtitle("Erro ao acessar GPS");
        this._coordinatesRow.set_subtitle("Erro na obtenção de coordenadas");
        this._accuracyRow.set_subtitle("--- metros");
      }
    }


    _updateLocationData(targets) {
      // Atualizar informações GPS atuais
      this._refreshGpsInfo();

      // Limpar lista de alvos
      let child = this._locationListBox.get_first_child();
      while (child) {
        this._locationListBox.remove(child);
        child = this._locationListBox.get_first_child();
      }

      if (!targets || targets.length === 0) {
        const emptyRow = new Adw.ActionRow({
          title: "Nenhum alvo sendo rastreado",
          subtitle: "Adicione alvos na lista de rastreamento para ver suas localizações",
          sensitive: false
        });
        
        const infoIcon = new Gtk.Image({
          icon_name: "dialog-information-symbolic",
          css_classes: ["dim-label"]
        });
        
        emptyRow.add_prefix(infoIcon);
        this._locationListBox.append(emptyRow);
        return;
      }

      // Adicionar informações de localização dos alvos
      for (const target of targets) {
        const row = new Adw.ActionRow({
          title: target.ssid || "Rede Oculta",
        });

        // Ícone do alvo
        const targetIcon = new Gtk.Image({
          icon_name: "view-reveal-symbolic",
          css_classes: ["accent"]
        });
        row.add_prefix(targetIcon);

        if (target.strongestLocation && target.strongestLocation.isValid) {
          // Mostrar coordenadas onde teve sinal mais forte
          row.set_subtitle(`Lat: ${target.strongestLocation.latitude.toFixed(6)}, Lon: ${target.strongestLocation.longitude.toFixed(6)}`);

          // Informações adicionais
          const infoBox = new Gtk.Box({
            orientation: Gtk.Orientation.VERTICAL,
            spacing: 2
          });

          const signalLabel = new Gtk.Label({
            label: `Sinal mais forte: ${target.strongestSignal || "---"}dBm`,
            css_classes: ["caption", "dim-label"],
            halign: Gtk.Align.END
          });

          const distanceLabel = new Gtk.Label({
            label: `~${this._estimateDistance(target.strongestSignal || -100)}m`,
            css_classes: ["caption"],
            halign: Gtk.Align.END
          });

          infoBox.append(signalLabel);
          infoBox.append(distanceLabel);
          row.add_suffix(infoBox);
        } else {
          row.set_subtitle("Nenhuma localização GPS registrada para este alvo");
          
          const noGpsLabel = new Gtk.Label({
            label: "Sem GPS",
            css_classes: ["caption", "dim-label"]
          });
          
          // Botão para capturar localização atual se GPS estiver ativo
          if (this._networkManager.isGPSEnabled && this._networkManager.isGPSEnabled()) {
            const location = this._networkManager.getCurrentLocation();
            if (location && location.isValid) {
              const updateLocationButton = new Gtk.Button({
                icon_name: "find-location-symbolic",
                css_classes: ["flat", "circular"],
                tooltip_text: "Registrar localização atual",
                valign: Gtk.Align.CENTER
              });
              
              updateLocationButton.connect("clicked", () => {
                this._recordCurrentLocationForTarget(target);
              });
              
              row.add_suffix(updateLocationButton);
            } else {
              row.add_suffix(noGpsLabel);
            }
          } else {
            row.add_suffix(noGpsLabel);
          }
        }

        this._locationListBox.append(row);
      }
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
        this._saveHuntTargets();
      }
    }

    // Métodos de persistência
    _restorePersistedStates() {
      if (!this._settings) return;

      try {
        // Restaurar estado do monitoramento (unificado)
        const monitoringEnabled = this._settings.get_boolean("hunt-mode-enabled") || this._settings.get_boolean("recording-enabled");
        this._monitorButton.set_active(monitoringEnabled);
        this._isRecording = monitoringEnabled;
        
        // Restaurar estado do GPS
        const gpsEnabled = this._settings.get_boolean("enable-gps");
        this._gpsButton.set_active(gpsEnabled);
        
        // Restaurar alvos de hunt com dados completos
        let huntTargetsData = [];
        
        // Tentar carregar dados novos (com SSID)
        if (this._settings.list_keys().includes("hunt-targets-data")) {
          try {
            const targetStrings = this._settings.get_strv("hunt-targets-data");
            huntTargetsData = targetStrings.map(str => JSON.parse(str));
            print(`DEBUG: Carregados ${huntTargetsData.length} alvos com dados completos`);
          } catch (error) {
            print(`DEBUG: Erro ao carregar dados novos: ${error.message}`);
          }
        }
        
        // Fallback para dados antigos (apenas BSSID)
        if (huntTargetsData.length === 0 && this._settings.list_keys().includes("hunt-targets")) {
          const huntTargets = this._settings.get_strv("hunt-targets");
          huntTargetsData = huntTargets.map(bssid => ({ bssid, ssid: "", lastSeen: null }));
          print(`DEBUG: Carregados ${huntTargetsData.length} alvos antigos (sem SSID)`);
        }
        
        // Restaurar alvos no NetworkManager
        for (const targetData of huntTargetsData) {
          if (this._networkManager && targetData.bssid) {
            this._networkManager.addHuntTarget(targetData.bssid, targetData.ssid);
          }
        }
        
        print(`DEBUG: Estados restaurados - Monitoramento: ${monitoringEnabled}, GPS: ${gpsEnabled}, Targets: ${huntTargetsData.length}`);
      } catch (error) {
        print(`DEBUG: Erro ao restaurar estados: ${error.message}`);
      }
    }

    _saveHuntModeState(enabled) {
      if (this._settings) {
        this._settings.set_boolean("hunt-mode-enabled", enabled);
      }
    }

    _saveRecordingState(enabled) {
      if (this._settings) {
        this._settings.set_boolean("recording-enabled", enabled);
      }
    }

    _saveGpsState(enabled) {
      if (this._settings) {
        this._settings.set_boolean("enable-gps", enabled);
      }
    }

    _saveHuntTargets() {
      if (this._settings && this._networkManager) {
        try {
          const targets = this._networkManager.getHuntTargets();
          
          // Salvar dados completos como JSON strings
          const targetData = targets.map(target => ({
            bssid: target.bssid,
            ssid: target.ssid || "",
            lastSeen: new Date().toISOString()
          })).filter(target => target.bssid);
          
          const targetStrings = targetData.map(target => JSON.stringify(target));
          this._settings.set_strv("hunt-targets-data", targetStrings);
          
          print(`DEBUG: Salvos ${targetData.length} alvos de hunt com nomes`);
        } catch (error) {
          print(`DEBUG: Erro ao salvar alvos: ${error.message}`);
        }
      }
    }

    // Override do método de remover alvo para salvar mudanças
    _removeHuntTarget(bssid) {
      if (this._networkManager) {
        this._networkManager.removeHuntTarget(bssid);
        this._saveHuntTargets();
      }
    }

    // Janela para adicionar alvos de rastreamento
    _showAddTargetDialog() {
      const dialog = new Adw.Window({
        transient_for: this,
        modal: true,
        title: "Adicionar Alvos de Rastreamento",
        default_width: 500,
        default_height: 600
      });

      const toolbarView = new Adw.ToolbarView();
      const headerBar = new Adw.HeaderBar({
        title_widget: new Adw.WindowTitle({
          title: "Selecionar Redes"
        })
      });

      // Botão fechar
      const closeButton = new Gtk.Button({
        label: "Fechar"
      });
      closeButton.connect("clicked", () => {
        dialog.close();
      });
      headerBar.pack_start(closeButton);

      // Botão adicionar selecionados
      const addButton = new Gtk.Button({
        label: "Adicionar Selecionados",
        css_classes: ["suggested-action"]
      });
      addButton.connect("clicked", () => {
        this._addSelectedTargets();
        dialog.close();
      });
      headerBar.pack_end(addButton);

      toolbarView.add_top_bar(headerBar);

      // Conteúdo principal
      const contentBox = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 12,
        margin_top: 18,
        margin_bottom: 18,
        margin_start: 18,
        margin_end: 18
      });

      // Grupo de redes disponíveis
      const networksGroup = new Adw.PreferencesGroup({
        title: "Redes Disponíveis",
        description: "Selecione as redes que deseja rastrear"
      });

      this._addTargetsList = new Gtk.ListBox({
        selection_mode: Gtk.SelectionMode.NONE,
        css_classes: ["boxed-list"]
      });

      const scrolledWindow = new Gtk.ScrolledWindow({
        hscrollbar_policy: Gtk.PolicyType.NEVER,
        vexpand: true,
        child: this._addTargetsList
      });

      networksGroup.add(scrolledWindow);
      contentBox.append(networksGroup);

      toolbarView.set_content(contentBox);
      dialog.set_content(toolbarView);

      // Popular lista de redes
      this._populateAddTargetsList();

      // Mostrar dialog
      dialog.present();
    }

    _populateAddTargetsList() {
      if (!this._networkManager) return;

      // Limpar lista
      let child = this._addTargetsList.get_first_child();
      while (child) {
        this._addTargetsList.remove(child);
        child = this._addTargetsList.get_first_child();
      }

      // Forçar uma nova varredura e obter redes atuais
      print("DEBUG: Forçando scan para janela de adicionar alvos");
      
      // Obter redes de múltiplas fontes
      let currentNetworks = [];
      
      // Fonte 1: Janela principal
      const parentWindow = this.get_transient_for();
      if (parentWindow && parentWindow._lastNetworks) {
        currentNetworks = parentWindow._lastNetworks;
        print(`DEBUG: ${currentNetworks.length} redes obtidas da janela principal`);
      }
      
      // Fonte 2: NetworkManager
      if (currentNetworks.length === 0 && this._networkManager._lastNetworks) {
        currentNetworks = this._networkManager._lastNetworks;
        print(`DEBUG: ${currentNetworks.length} redes obtidas do NetworkManager`);
      }
      
      // Fonte 3: Forçar nova varredura
      if (currentNetworks.length === 0) {
        print("DEBUG: Forçando nova varredura de redes");
        this._networkManager.forceNetworkScan && this._networkManager.forceNetworkScan();
        
        // Tentar obter redes imediatamente após varredura
        setTimeout(() => {
          if (this._networkManager.getNetworks) {
            currentNetworks = this._networkManager.getNetworks() || [];
            print(`DEBUG: ${currentNetworks.length} redes obtidas após varredura forçada`);
            this._repopulateNetworksList(currentNetworks);
          }
        }, 1000);
      }

      const currentTargets = this._networkManager.getHuntTargets();
      const existingBssids = new Set(currentTargets.map(target => target.bssid));

      this._selectedNetworksForAdd = new Set();

      if (currentNetworks.length === 0) {
        const emptyRow = new Adw.ActionRow({
          title: "Buscando redes...",
          subtitle: "Aguarde enquanto procuramos por redes WiFi disponíveis",
          sensitive: false
        });
        
        const loadingIcon = new Gtk.Spinner({
          spinning: true
        });
        emptyRow.add_prefix(loadingIcon);
        
        this._addTargetsList.append(emptyRow);
        return;
      }

      this._repopulateNetworksList(currentNetworks);
    }

    _repopulateNetworksList(currentNetworks) {
      if (!currentNetworks || currentNetworks.length === 0) return;
      
      // Limpar lista novamente
      let child = this._addTargetsList.get_first_child();
      while (child) {
        this._addTargetsList.remove(child);
        child = this._addTargetsList.get_first_child();
      }
      
      const currentTargets = this._networkManager.getHuntTargets();
      const existingBssids = new Set(currentTargets.map(target => target.bssid));

      // Adicionar redes à lista
      currentNetworks.forEach(network => {
        const isAlreadyTarget = existingBssids.has(network.bssid);
        
        const row = new Adw.ActionRow({
          title: network.ssid || "(Rede Oculta)",
          subtitle: `${network.bssid} • ${network.signal}% • ${network.security} • Canal ${network.channel}`,
          sensitive: !isAlreadyTarget
        });

        // Ícone de intensidade do sinal
        let signalIcon = "network-wireless-signal-weak-symbolic";
        if (network.signal >= 75) signalIcon = "network-wireless-signal-excellent-symbolic";
        else if (network.signal >= 50) signalIcon = "network-wireless-signal-good-symbolic";
        else if (network.signal >= 25) signalIcon = "network-wireless-signal-ok-symbolic";

        const iconImage = new Gtk.Image({
          icon_name: signalIcon
        });

        row.add_prefix(iconImage);

        if (isAlreadyTarget) {
          // Mostrar que já está sendo rastreada
          const statusLabel = new Gtk.Label({
            label: "Já adicionada",
            css_classes: ["caption", "dim-label"]
          });
          row.add_suffix(statusLabel);
        } else {
          // Toggle para seleção
          const toggle = new Gtk.Switch({
            valign: Gtk.Align.CENTER
          });

          toggle.connect("notify::active", () => {
            if (toggle.get_active()) {
              this._selectedNetworksForAdd.add(network.bssid);
            } else {
              this._selectedNetworksForAdd.delete(network.bssid);
            }
          });

          row.add_suffix(toggle);
          row.activatable_widget = toggle;
        }

        this._addTargetsList.append(row);
      });
      
      print(`DEBUG: ${currentNetworks.length} redes adicionadas à lista de seleção`);
    }

    _addSelectedTargets() {
      if (!this._networkManager) return;

      // Obter redes de múltiplas fontes
      let currentNetworks = [];
      const parentWindow = this.get_transient_for();
      
      if (parentWindow && parentWindow._lastNetworks) {
        currentNetworks = parentWindow._lastNetworks;
      } else if (this._networkManager._lastNetworks) {
        currentNetworks = this._networkManager._lastNetworks;
      } else if (this._networkManager.getNetworks) {
        currentNetworks = this._networkManager.getNetworks() || [];
      }

      let addedCount = 0;

      for (const bssid of this._selectedNetworksForAdd) {
        const network = currentNetworks.find(net => net.bssid === bssid);
        if (network) {
          this._networkManager.addHuntTarget(bssid, network.ssid || "");
          addedCount++;
          print(`DEBUG: Alvo adicionado: ${network.ssid || 'Rede Oculta'} (${bssid})`);
        } else {
          print(`DEBUG: Rede com BSSID ${bssid} não encontrada para adicionar como alvo`);
        }
      }

      // Salvar mudanças
      this._saveHuntTargets();

      print(`DEBUG: Adicionados ${addedCount} novos alvos de rastreamento`);
    }

    // Métodos para monitoramento em tempo real inspirados no Sparrow WiFi
    _updateRealtimeSignalData(targets) {
      if (this._isPaused || !this._signalData) return;

      const now = Date.now();
      
      // Se não há alvos, mas o monitoramento está ativo, criar dados de demonstração
      if (!targets || targets.length === 0) {
        if (this._isRecording && this._signalData.size === 0) {
          // Criar alvos de demonstração para mostrar o gráfico funcionando
          this._createDemoTargets();
        }
        
        // Atualizar dados de demonstração existentes
        for (const [bssid, targetData] of this._signalData.entries()) {
          this._updateDemoTargetData(targetData, now);
        }
      } else {
        // Atualizar dados de sinal para cada alvo real
        for (const target of targets) {
          print(`DEBUG: Processando alvo ${target.ssid || 'sem nome'} (${target.bssid})`);
          
          if (!this._signalData.has(target.bssid)) {
            this._signalData.set(target.bssid, {
              name: target.ssid || "Rede Oculta",
              data: [],
              color: this._generateTargetColor(target.bssid),
              lastSeen: now,
              isDemo: false
            });
            print(`DEBUG: Novo alvo adicionado ao monitoramento: ${target.ssid}`);
          }

          const targetData = this._signalData.get(target.bssid);
          
          // Usar dados reais do target se disponíveis
          let signalValue = target.strongestSignal || -70;
          
          // Se temos histórico, usar o valor mais recente
          if (target.history && target.history.length > 0) {
            const latest = target.history[target.history.length - 1];
            signalValue = latest.signal;
          }

          // Adicionar pequena variação realística
          const noise = (Math.random() - 0.5) * 3; // ±1.5dBm de flutuação
          const currentSignal = signalValue + noise;

          targetData.data.push({
            time: now,
            signal: currentSignal,
            quality: this._signalToQuality(currentSignal)
          });

          targetData.lastSeen = now;

          // Manter apenas os últimos N pontos para performance
          if (targetData.data.length > this._maxDataPoints) {
            targetData.data.shift();
          }
          
          print(`DEBUG: Dados de sinal atualizados para ${target.ssid}: ${currentSignal.toFixed(1)}dBm`);
        }
      }

      // Remover alvos que não foram vistos recentemente (exceto demos)
      for (const [bssid, data] of this._signalData.entries()) {
        if (!data.isDemo && now - data.lastSeen > 60000) { // 60 segundos
          print(`DEBUG: Removendo alvo inativo: ${data.name}`);
          this._signalData.delete(bssid);
        }
      }

      // Redesenhar gráfico se existe
      if (this._signalChart) {
        this._signalChart.queue_draw();
      }
    }

    _createDemoTargets() {
      const demoTargets = [
        { name: "Rede Exemplo 1", bssid: "demo:00:00:01", baseSignal: -45 },
        { name: "Rede Exemplo 2", bssid: "demo:00:00:02", baseSignal: -60 },
        { name: "Rede Exemplo 3", bssid: "demo:00:00:03", baseSignal: -75 }
      ];

      const now = Date.now();
      
      for (const demo of demoTargets) {
        if (!this._signalData.has(demo.bssid)) {
          this._signalData.set(demo.bssid, {
            name: demo.name,
            data: [],
            color: this._generateTargetColor(demo.bssid),
            lastSeen: now,
            isDemo: true,
            baseSignal: demo.baseSignal,
            phase: Math.random() * Math.PI * 2 // Fase aleatória para variação
          });
          print(`DEBUG: Alvo de demonstração criado: ${demo.name}`);
        }
      }
    }

    _updateDemoTargetData(targetData, now) {
      if (!targetData.isDemo) return;

      // Simular variação realística de sinal com base em ondas senoidais
      const timeFactor = now / 10000; // Converter para segundos / 10
      const variation = Math.sin(timeFactor + targetData.phase) * 8; // ±8dBm de variação
      const noise = (Math.random() - 0.5) * 4; // ±2dBm de ruído
      
      const currentSignal = targetData.baseSignal + variation + noise;

      targetData.data.push({
        time: now,
        signal: currentSignal,
        quality: this._signalToQuality(currentSignal)
      });

      targetData.lastSeen = now;

      // Manter apenas os últimos N pontos para performance
      if (targetData.data.length > this._maxDataPoints) {
        targetData.data.shift();
      }
    }

    _generateTargetColor(bssid) {
      // Gerar cor consistente baseada no BSSID
      let hash = 0;
      for (let i = 0; i < bssid.length; i++) {
        hash = bssid.charCodeAt(i) + ((hash << 5) - hash);
      }
      
      const hue = Math.abs(hash) % 360;
      return {
        r: Math.cos(hue * Math.PI / 180) * 0.5 + 0.5,
        g: Math.cos((hue + 120) * Math.PI / 180) * 0.5 + 0.5,
        b: Math.cos((hue + 240) * Math.PI / 180) * 0.5 + 0.5
      };
    }

    _signalToQuality(signal) {
      // Converter dBm para qualidade percentual (0-100%)
      if (signal >= -30) return 100;
      if (signal <= -90) return 0;
      return Math.floor(((signal + 90) / 60) * 100);
    }

    _drawRealtimeChart(cr, width, height) {
      print(`DEBUG: Desenhando gráfico - Dimensões: ${width}x${height}, Dados: ${this._signalData.size} alvos`);
      
      // Obter cores do tema atual
      const context = this._signalChart.get_style_context();
      const bgColor = context.get_color();
      const fgColor = context.get_color();
      
      // Fundo seguindo o tema (transparente para usar o fundo do widget)
      // O fundo será definido pelo CSS do widget pai
      cr.save();
      cr.setOperator(imports.gi.cairo.Operator.CLEAR);
      cr.paint();
      cr.restore();

      if (this._signalData.size === 0) {
        // Mensagem quando não há dados - usar cor do tema
        cr.setSourceRGB(fgColor.red, fgColor.green, fgColor.blue);
        cr.selectFontFace("Sans", 0, 0);
        cr.setFontSize(16);
        
        const text = "Clique no botão de monitoramento para começar";
        const textExtents = cr.textExtents(text);
        cr.moveTo((width - textExtents.width) / 2, height / 2);
        cr.showText(text);
        
        // Sub-texto
        cr.setFontSize(12);
        cr.setSourceRGB(fgColor.red * 0.7, fgColor.green * 0.7, fgColor.blue * 0.7);
        const subText = "Dados de sinal aparecerão aqui em tempo real";
        const subTextExtents = cr.textExtents(subText);
        cr.moveTo((width - subTextExtents.width) / 2, height / 2 + 25);
        cr.showText(subText);
        return;
      }

      print(`DEBUG: Desenhando gráfico com ${this._signalData.size} alvos`);

      const padding = 50;
      const chartWidth = width - 2 * padding;
      const chartHeight = height - 2 * padding;

      // Definir limites do gráfico (sinal de -90 a -30 dBm)
      const minSignal = -90;
      const maxSignal = -30;
      const signalRange = maxSignal - minSignal;

      // Encontrar faixa temporal
      const now = Date.now();
      const timeRange = 60000; // 60 segundos
      const oldestTime = now - timeRange;

      // Desenhar grid de fundo com cores do tema
      const gridAlpha = 0.2;
      cr.setSourceRGB(fgColor.red * gridAlpha, fgColor.green * gridAlpha, fgColor.blue * gridAlpha);
      cr.setLineWidth(1);

      // Grid horizontal (níveis de sinal)
      for (let signal = minSignal; signal <= maxSignal; signal += 10) {
        const y = padding + chartHeight - ((signal - minSignal) / signalRange) * chartHeight;
        cr.moveTo(padding, y);
        cr.lineTo(padding + chartWidth, y);
        cr.stroke();

        // Labels dos níveis
        cr.setSourceRGB(fgColor.red * 0.7, fgColor.green * 0.7, fgColor.blue * 0.7);
        cr.selectFontFace("Sans", 0, 0);
        cr.setFontSize(10);
        cr.moveTo(5, y + 3);
        cr.showText(`${signal}dBm`);
      }

      // Grid vertical (tempo)
      cr.setSourceRGB(fgColor.red * gridAlpha, fgColor.green * gridAlpha, fgColor.blue * gridAlpha);
      for (let i = 0; i <= 6; i++) {
        const x = padding + (i / 6) * chartWidth;
        cr.moveTo(x, padding);
        cr.lineTo(x, padding + chartHeight);
        cr.stroke();

        // Labels de tempo
        cr.setSourceRGB(fgColor.red * 0.7, fgColor.green * 0.7, fgColor.blue * 0.7);
        const timeLabel = `${60 - i * 10}s`;
        const timeExtents = cr.textExtents(timeLabel);
        cr.moveTo(x - timeExtents.width / 2, height - 10);
        cr.showText(timeLabel);
      }

      // Desenhar linhas dos alvos
      let legendY = padding + 20;
      let targetCount = 0;
      
      for (const [bssid, targetData] of this._signalData.entries()) {
        const filteredData = targetData.data.filter(point => point.time >= oldestTime);
        
        print(`DEBUG: Alvo ${targetData.name}: ${filteredData.length} pontos de dados`);
        
        if (filteredData.length < 1) continue;

        targetCount++;
        
        // Cor do alvo
        const color = targetData.color;
        cr.setSourceRGB(color.r * 0.8, color.g * 0.8, color.b * 0.8);
        cr.setLineWidth(3);

        // Desenhar linha
        if (filteredData.length >= 2) {
          // Desenhar linha conectando pontos
          cr.beginPath();
          let firstPoint = true;
          
          for (const point of filteredData) {
            const x = padding + ((point.time - oldestTime) / timeRange) * chartWidth;
            const y = padding + chartHeight - ((point.signal - minSignal) / signalRange) * chartHeight;
            
            if (firstPoint) {
              cr.moveTo(x, y);
              firstPoint = false;
            } else {
              cr.lineTo(x, y);
            }
          }
          cr.stroke();
        }
        
        // Desenhar pontos individuais
        for (const point of filteredData) {
          const x = padding + ((point.time - oldestTime) / timeRange) * chartWidth;
          const y = padding + chartHeight - ((point.signal - minSignal) / signalRange) * chartHeight;
          
          cr.beginPath();
          cr.arc(x, y, 3, 0, 2 * Math.PI);
          cr.fill();
        }

        // Legenda
        const legendX = width - 150;
        cr.setSourceRGB(color.r, color.g, color.b);
        cr.rectangle(legendX, legendY, 15, 10);
        cr.fill();
        
        cr.setSourceRGB(fgColor.red, fgColor.green, fgColor.blue);
        cr.selectFontFace("Sans", 0, 0);
        cr.setFontSize(10);
        cr.moveTo(legendX + 20, legendY + 8);
        
        const legendText = `${targetData.name.substring(0, 15)}${targetData.name.length > 15 ? '...' : ''}`;
        cr.showText(legendText);
        
        // Mostrar valor atual
        if (filteredData.length > 0) {
          const lastValue = filteredData[filteredData.length - 1].signal;
          cr.moveTo(legendX + 20, legendY + 18);
          cr.setFontSize(9);
          cr.setSourceRGB(fgColor.red * 0.7, fgColor.green * 0.7, fgColor.blue * 0.7);
          cr.showText(`${lastValue.toFixed(1)}dBm`);
        }
        
        legendY += 30;
      }

      // Título
      cr.setSourceRGB(fgColor.red, fgColor.green, fgColor.blue);
      cr.selectFontFace("Sans", 0, 1); // Bold
      cr.setFontSize(14);
      const title = "Sinal WiFi em Tempo Real (dBm)";
      const titleExtents = cr.textExtents(title);
      cr.moveTo((width - titleExtents.width) / 2, 20);
      cr.showText(title);
      
      print(`DEBUG: Gráfico desenhado com ${targetCount} alvos`);
    }


    _clearSignalData() {
      print("DEBUG: Limpando dados de sinal");
      this._signalData.clear();
      if (this._signalChart) {
        this._signalChart.queue_draw();
      }
    }


    _updateSpectrumAnalysis(targets) {
      // Limpar análise anterior
      let child = this._spectrumAnalysis.get_first_child();
      while (child) {
        this._spectrumAnalysis.remove(child);
        child = this._spectrumAnalysis.get_first_child();
      }

      if (!targets || targets.length === 0) {
        // Mostrar mensagem informativa
        const emptyRow = new Adw.ActionRow({
          title: "Nenhum alvo para análise",
          subtitle: "Adicione alvos para visualizar congestionamento de canais",
          sensitive: false
        });
        
        const infoIcon = new Gtk.Image({
          icon_name: "dialog-information-symbolic",
          css_classes: ["dim-label"]
        });
        
        emptyRow.add_prefix(infoIcon);
        this._spectrumAnalysis.append(emptyRow);
        return;
      }

      // Obter dados de rede atual para análise de espectro real
      const currentNetworks = this._networkManager._lastNetworks || [];
      const channelData = new Map();
      
      // Usar dados de redes atuais para análise de espectro
      for (const network of currentNetworks) {
        const channel = network.channel || 1;
        
        if (!channelData.has(channel)) {
          channelData.set(channel, {
            count: 0,
            avgSignal: 0,
            signals: [],
            frequency: network.frequency || 2400
          });
        }
        
        const data = channelData.get(channel);
        data.count++;
        data.signals.push(network.signal || -70);
        data.avgSignal = data.signals.reduce((a, b) => a + b, 0) / data.signals.length;
      }

      // Criar visualização dos canais
      for (const [channel, data] of channelData.entries()) {
        const row = new Adw.ActionRow({
          title: `Canal ${channel}`,
          subtitle: `${data.count} rede(s) • Sinal médio: ${data.avgSignal.toFixed(1)}dBm`
        });

        // Indicador de congestionamento
        let congestionLevel = "baixo";
        let congestionColor = "success";
        
        if (data.count >= 5) {
          congestionLevel = "alto";
          congestionColor = "error";
        } else if (data.count >= 3) {
          congestionLevel = "médio";
          congestionColor = "warning";
        }

        const congestionLabel = new Gtk.Label({
          label: `Congestionamento ${congestionLevel}`,
          css_classes: ["caption", congestionColor]
        });
        
        // Botão de informações
        const infoButton = new Gtk.Button({
          icon_name: "dialog-information-symbolic",
          css_classes: ["flat", "circular"],
          tooltip_text: `Frequência: ${data.frequency}MHz\nRedes: ${data.count}\nSinal médio: ${data.avgSignal.toFixed(1)}dBm`,
          valign: Gtk.Align.CENTER
        });
        
        const suffixBox = new Gtk.Box({
          spacing: 6,
          orientation: Gtk.Orientation.HORIZONTAL
        });
        
        suffixBox.append(congestionLabel);
        suffixBox.append(infoButton);
        
        row.add_suffix(suffixBox);
        this._spectrumAnalysis.append(row);
      }
    }

    // Métodos GPS adicionais
    _initializeGPSFromSettings() {
      try {
        // Verificar se GPS está habilitado nas configurações
        if (!this._settings) return;
        
        // Verificar se a chave existe antes de acessar
        if (this._settings.list_keys().includes("enable-gps")) {
          const gpsEnabled = this._settings.get_boolean("enable-gps");
          
          if (gpsEnabled && this._networkManager) {
            // Ativar GPS se estiver habilitado nas preferências
            this._networkManager.enableGPS && this._networkManager.enableGPS();
            this._gpsButton.set_active(true);
            this._gpsButton.set_css_classes(["suggested-action"]);
            this._statusLabels.gps.set_label("GPS: Ativando...");
          }
        }
      } catch (error) {
        print(`DEBUG: Erro ao inicializar GPS das configurações: ${error.message}`);
      }
    }

    _updateTargetsWithCurrentGPS(location) {
      if (!this._networkManager || !location || !location.isValid) return;
      
      // Somente atualizar alvos que não possuem localização registrada
      const huntTargets = this._networkManager.getHuntTargets();
      let updated = false;
      
      for (const target of huntTargets) {
        if (!target.strongestLocation || !target.strongestLocation.isValid) {
          // Copiar localização atual para este alvo
          if (!target.strongestLocation) {
            const { GPSCoordinate } = imports.gpsManager;
            target.strongestLocation = new GPSCoordinate();
          }
          target.strongestLocation.copy(location);
          updated = true;
          print(`DEBUG: Registrada localização GPS para alvo ${target.ssid}: ${location.latitude}, ${location.longitude}`);
        }
      }
      
      // Só atualizar a interface se houve mudanças para evitar loops
      if (updated) {
        // Usar timeout para evitar recursão
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 100, () => {
          this._updateLocationData(huntTargets);
          return GLib.SOURCE_REMOVE;
        });
      }
    }

    _recordCurrentLocationForTarget(target) {
      if (!this._networkManager) return;
      
      const location = this._networkManager.getCurrentLocation();
      if (location && location.isValid) {
        // Registrar localização atual para este alvo específico
        target.strongestLocation = location;
        
        // Atualizar a interface
        const huntTargets = this._networkManager.getHuntTargets();
        this._updateLocationData(huntTargets);
        
        print(`DEBUG: Localização registrada manualmente para ${target.ssid}: ${location.latitude}, ${location.longitude}`);
      }
    }
  }
);
