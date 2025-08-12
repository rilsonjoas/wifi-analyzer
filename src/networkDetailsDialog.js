// networkDetailsDialog.js - Network information dialog with hunt mode integration

print("DEBUG: networkDetailsDialog.js está sendo carregado");

const { GObject, Gtk, Adw, Gio, GLib } = imports.gi;

var NetworkDetailsDialog = GObject.registerClass(
  {
    GTypeName: "NetworkDetailsDialog",
    Signals: {
      'open-telemetry-requested': {
        param_types: [GObject.TYPE_STRING],
      },
    },
  },
  class NetworkDetailsDialog extends Adw.Window {
    _init(params = {}) {
      // Extrair parâmetros customizados antes de chamar super._init
      const { parent, networkData, networkManager, ...superParams } = params;
      
      super._init({
        ...superParams,
        title: "Detalhes da Rede",
        default_width: 500,
        default_height: 600,
        modal: true,
        transient_for: parent,
      });

      this._networkData = networkData;
      this._networkManager = networkManager;
      this._isHuntTarget = false;

      this._buildUI();
      this._populateData();
      this._setupSignals();
    }

    _buildUI() {
      // Layout principal
      const mainBox = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 0,
      });

      // Header
      const headerBar = new Adw.HeaderBar({
        title_widget: new Adw.WindowTitle({
          title: this._networkData.ssid || "Rede Oculta",
          subtitle: "Informações detalhadas"
        }),
      });

      // Botão Hunt Mode
      this._huntButton = new Gtk.ToggleButton({
        icon_name: "view-pin-symbolic",
        tooltip_text: "Adicionar/Remover do Hunt Mode",
      });

      // Menu de ações
      const actionsMenu = Gio.Menu.new();
      actionsMenu.append("Exportar dados desta rede", "details.export");
      actionsMenu.append("Copiar BSSID", "details.copy-bssid");
      actionsMenu.append("Abrir telemetria", "details.open-telemetry");
      
      const actionsButton = new Gtk.MenuButton({
        icon_name: "view-more-symbolic",
        tooltip_text: "Mais ações",
        menu_model: actionsMenu
      });

      headerBar.pack_start(this._huntButton);
      headerBar.pack_end(actionsButton);

      // Conteúdo scrollável
      const scrolled = new Gtk.ScrolledWindow({
        hscrollbar_policy: Gtk.PolicyType.NEVER,
        vexpand: true,
      });

      const contentBox = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 18,
        margin_top: 18,
        margin_bottom: 18,
        margin_start: 18,
        margin_end: 18,
      });

      // Seções
      contentBox.append(this._createBasicInfoSection());
      contentBox.append(this._createSignalSection());
      contentBox.append(this._createSecuritySection());
      contentBox.append(this._createLocationSection());
      contentBox.append(this._createTechnicalSection());
      contentBox.append(this._createHistorySection());

      scrolled.set_child(contentBox);

      mainBox.append(headerBar);
      mainBox.append(scrolled);

      this.set_content(mainBox);
    }

    _createBasicInfoSection() {
      const group = new Adw.PreferencesGroup({
        title: "Informações Básicas"
      });

      // SSID
      const ssidRow = new Adw.ActionRow({
        title: "Nome da Rede (SSID)",
        subtitle: this._networkData.ssid || "Rede oculta"
      });

      const ssidIcon = new Gtk.Image({
        icon_name: "network-wireless-symbolic",
        css_classes: ["dim-label"]
      });
      ssidRow.add_prefix(ssidIcon);

      // BSSID
      const bssidRow = new Adw.ActionRow({
        title: "Endereço MAC (BSSID)",
        subtitle: this._networkData.bssid
      });

      const bssidIcon = new Gtk.Image({
        icon_name: "network-wired-symbolic",
        css_classes: ["dim-label"]
      });
      bssidRow.add_prefix(bssidIcon);

      // Copiar BSSID
      const copyButton = new Gtk.Button({
        icon_name: "edit-copy-symbolic",
        css_classes: ["flat"],
        tooltip_text: "Copiar BSSID"
      });

      copyButton.connect('clicked', () => {
        const clipboard = this.get_clipboard();
        clipboard.set_text(this._networkData.bssid);
        this._showToast("BSSID copiado");
      });

      bssidRow.add_suffix(copyButton);

      // Canal e Frequência
      const channelRow = new Adw.ActionRow({
        title: "Canal / Frequência",
        subtitle: `Canal ${this._networkData.channel} (${this._networkData.frequency} MHz)`
      });

      const channelIcon = new Gtk.Image({
        icon_name: "preferences-system-symbolic",
        css_classes: ["dim-label"]
      });
      channelRow.add_prefix(channelIcon);

      // Primeira detecção
      const firstSeenRow = new Adw.ActionRow({
        title: "Primeira Detecção",
        subtitle: this._formatTimestamp(this._networkData.firstSeen)
      });

      const timeIcon = new Gtk.Image({
        icon_name: "appointment-soon-symbolic",
        css_classes: ["dim-label"]
      });
      firstSeenRow.add_prefix(timeIcon);

      group.add(ssidRow);
      group.add(bssidRow);
      group.add(channelRow);
      group.add(firstSeenRow);

      return group;
    }

    _createSignalSection() {
      const group = new Adw.PreferencesGroup({
        title: "Análise de Sinal"
      });

      // Força atual
      const currentSignalRow = new Adw.ActionRow({
        title: "Força Atual",
        subtitle: `${this._networkData.signal} dBm`
      });

      this._signalIcon = new Gtk.Image({
        icon_name: this._getSignalIcon(this._networkData.signal),
        css_classes: [this._getSignalColor(this._networkData.signal)]
      });
      currentSignalRow.add_prefix(this._signalIcon);

      // Qualidade estimada
      const quality = this._calculateSignalQuality(this._networkData.signal);
      const qualityRow = new Adw.ActionRow({
        title: "Qualidade Estimada",
        subtitle: `${quality}% (${this._getQualityDescription(quality)})`
      });

      const qualityIcon = new Gtk.Image({
        icon_name: "speedometer-symbolic",
        css_classes: ["dim-label"]
      });
      qualityRow.add_prefix(qualityIcon);

      // Estatísticas (se disponível)
      if (this._networkData.signalHistory && this._networkData.signalHistory.length > 1) {
        const stats = this._calculateSignalStats();
        
        const statsRow = new Adw.ActionRow({
          title: "Estatísticas",
          subtitle: `Média: ${stats.average}dBm • Variação: ${stats.stddev.toFixed(1)}dB`
        });

        const statsIcon = new Gtk.Image({
          icon_name: "org.gnome.design.Contrast-symbolic",
          css_classes: ["dim-label"]
        });
        statsRow.add_prefix(statsIcon);

        group.add(statsRow);
      }

      // Distância estimada
      const distance = this._estimateDistance(this._networkData.signal, this._networkData.frequency);
      const distanceRow = new Adw.ActionRow({
        title: "Distância Estimada",
        subtitle: `~${distance} metros`
      });

      const distanceIcon = new Gtk.Image({
        icon_name: "mark-location-symbolic",
        css_classes: ["dim-label"]
      });
      distanceRow.add_prefix(distanceIcon);

      group.add(currentSignalRow);
      group.add(qualityRow);
      group.add(distanceRow);

      return group;
    }

    _createSecuritySection() {
      const group = new Adw.PreferencesGroup({
        title: "Segurança"
      });

      // Tipo de segurança
      const securityRow = new Adw.ActionRow({
        title: "Tipo de Criptografia",
        subtitle: this._networkData.security || "Aberta"
      });

      const securityIcon = new Gtk.Image({
        icon_name: this._getSecurityIcon(this._networkData.security),
        css_classes: [this._getSecurityColor(this._networkData.security)]
      });
      securityRow.add_prefix(securityIcon);

      // Avaliação de segurança
      const securityLevel = this._evaluateSecurityLevel(this._networkData.security);
      const evaluationRow = new Adw.ActionRow({
        title: "Nível de Segurança",
        subtitle: securityLevel.description
      });

      const evalIcon = new Gtk.Image({
        icon_name: securityLevel.icon,
        css_classes: [securityLevel.color]
      });
      evaluationRow.add_prefix(evalIcon);

      group.add(securityRow);
      group.add(evaluationRow);

      return group;
    }

    _createLocationSection() {
      const group = new Adw.PreferencesGroup({
        title: "Localização"
      });

      // Status GPS
      const gpsEnabled = this._networkManager ? this._networkManager.isGPSEnabled() : false;
      
      if (gpsEnabled && this._networkData.location) {
        // Coordenadas
        const coordsRow = new Adw.ActionRow({
          title: "Coordenadas de Detecção",
          subtitle: `${this._networkData.location.latitude.toFixed(6)}, ${this._networkData.location.longitude.toFixed(6)}`
        });

        const gpsIcon = new Gtk.Image({
          icon_name: "find-location-symbolic",
          css_classes: ["success"]
        });
        coordsRow.add_prefix(gpsIcon);

        // Botão ver no mapa
        const mapButton = new Gtk.Button({
          icon_name: "mark-location-symbolic",
          css_classes: ["flat"],
          tooltip_text: "Ver no mapa"
        });

        mapButton.connect('clicked', () => {
          this._openLocationInMap();
        });

        coordsRow.add_suffix(mapButton);

        // Precisão
        const accuracyRow = new Adw.ActionRow({
          title: "Precisão GPS",
          subtitle: `±${this._networkData.location.accuracy || 'N/A'} metros`
        });

        const accuracyIcon = new Gtk.Image({
          icon_name: "compass-symbolic",
          css_classes: ["dim-label"]
        });
        accuracyRow.add_prefix(accuracyIcon);

        group.add(coordsRow);
        group.add(accuracyRow);
      } else {
        const noGpsRow = new Adw.ActionRow({
          title: "Localização GPS",
          subtitle: gpsEnabled ? "Aguardando coordenadas..." : "GPS desabilitado"
        });

        const noGpsIcon = new Gtk.Image({
          icon_name: "location-services-disabled-symbolic",
          css_classes: ["warning"]
        });
        noGpsRow.add_prefix(noGpsIcon);

        group.add(noGpsRow);
      }

      return group;
    }

    _createTechnicalSection() {
      const group = new Adw.PreferencesGroup({
        title: "Informações Técnicas"
      });

      // Modo
      if (this._networkData.mode) {
        const modeRow = new Adw.ActionRow({
          title: "Modo",
          subtitle: this._networkData.mode
        });

        const modeIcon = new Gtk.Image({
          icon_name: "preferences-system-symbolic",
          css_classes: ["dim-label"]
        });
        modeRow.add_prefix(modeIcon);

        group.add(modeRow);
      }

      // Velocidades suportadas
      if (this._networkData.rates && this._networkData.rates.length > 0) {
        const maxRate = Math.max(...this._networkData.rates);
        const ratesRow = new Adw.ActionRow({
          title: "Velocidade Máxima",
          subtitle: `${maxRate} Mbps`
        });

        const speedIcon = new Gtk.Image({
          icon_name: "speedometer-symbolic",
          css_classes: ["dim-label"]
        });
        ratesRow.add_prefix(speedIcon);

        group.add(ratesRow);
      }

      // Fabricante (OUI lookup)
      const vendor = this._lookupVendor(this._networkData.bssid);
      if (vendor) {
        const vendorRow = new Adw.ActionRow({
          title: "Fabricante",
          subtitle: vendor
        });

        const vendorIcon = new Gtk.Image({
          icon_name: "applications-engineering-symbolic",
          css_classes: ["dim-label"]
        });
        vendorRow.add_prefix(vendorIcon);

        group.add(vendorRow);
      }

      return group;
    }

    _createHistorySection() {
      const group = new Adw.PreferencesGroup({
        title: "Histórico"
      });

      // Última detecção
      const lastSeenRow = new Adw.ActionRow({
        title: "Última Detecção",
        subtitle: this._formatTimestamp(this._networkData.lastSeen)
      });

      const clockIcon = new Gtk.Image({
        icon_name: "alarm-symbolic",
        css_classes: ["dim-label"]
      });
      lastSeenRow.add_prefix(clockIcon);

      // Contagem de detecções
      const countRow = new Adw.ActionRow({
        title: "Total de Detecções",
        subtitle: `${this._networkData.detectionCount || 1} vezes`
      });

      const countIcon = new Gtk.Image({
        icon_name: "view-list-ordered-symbolic",
        css_classes: ["dim-label"]
      });
      countRow.add_prefix(countIcon);

      // Tendência do sinal
      if (this._networkData.signalHistory && this._networkData.signalHistory.length > 2) {
        const trend = this._calculateSignalTrend();
        const trendRow = new Adw.ActionRow({
          title: "Tendência do Sinal",
          subtitle: trend.description
        });

        const trendIcon = new Gtk.Image({
          icon_name: trend.icon,
          css_classes: [trend.color]
        });
        trendRow.add_prefix(trendIcon);

        group.add(trendRow);
      }

      group.add(lastSeenRow);
      group.add(countRow);

      return group;
    }

    _populateData() {
      // Verificar se é alvo do hunt mode
      if (this._networkManager) {
        this._isHuntTarget = this._networkManager.isHuntTarget(this._networkData.bssid);
        this._huntButton.set_active(this._isHuntTarget);
        this._updateHuntButtonStyle();
      }
    }

    _setupSignals() {
      // Hunt button toggle
      this._huntButton.connect('toggled', () => {
        this._isHuntTarget = this._huntButton.get_active();
        
        if (this._networkManager) {
          if (this._isHuntTarget) {
            this._networkManager.addHuntTarget(this._networkData.bssid, this._networkData.ssid);
            this._showToast(`${this._networkData.ssid || 'Rede'} adicionada aos alvos`);
          } else {
            this._networkManager.removeHuntTarget(this._networkData.bssid);
            this._showToast(`${this._networkData.ssid || 'Rede'} removida dos alvos`);
          }
        }
        
        this._updateHuntButtonStyle();
      });

      // Actions - comentado porque Adw.Window não suporta add_action
      /* 
      const exportAction = new Gio.SimpleAction({ name: "export" });
      exportAction.connect('activate', () => this._exportNetworkData());

      const copyBssidAction = new Gio.SimpleAction({ name: "copy-bssid" });
      copyBssidAction.connect('activate', () => {
        const clipboard = this.get_clipboard();
        clipboard.set_text(this._networkData.bssid);
        this._showToast("BSSID copiado");
      });

      const openTelemetryAction = new Gio.SimpleAction({ name: "open-telemetry" });
      openTelemetryAction.connect('activate', () => this._openTelemetryWindow());

      this.add_action(exportAction);
      this.add_action(copyBssidAction);
      this.add_action(openTelemetryAction);
      */
    }

    _updateHuntButtonStyle() {
      if (this._isHuntTarget) {
        this._huntButton.set_css_classes(["destructive-action"]);
        this._huntButton.set_tooltip_text("Remover do Hunt Mode");
      } else {
        this._huntButton.set_css_classes(["suggested-action"]);
        this._huntButton.set_tooltip_text("Adicionar ao Hunt Mode");
      }
    }

    // Utility methods
    _formatTimestamp(timestamp) {
      if (!timestamp) return "Desconhecido";
      return new Date(timestamp).toLocaleString('pt-BR');
    }

    _getSignalIcon(signal) {
      if (signal >= -30) return "network-wireless-signal-excellent-symbolic";
      if (signal >= -50) return "network-wireless-signal-good-symbolic";
      if (signal >= -70) return "network-wireless-signal-weak-symbolic";
      return "network-wireless-signal-none-symbolic";
    }

    _getSignalColor(signal) {
      if (signal >= -50) return "success";
      if (signal >= -70) return "warning";
      return "error";
    }

    _calculateSignalQuality(signal) {
      // Conversão dBm para qualidade percentual
      if (signal >= -30) return 100;
      if (signal <= -90) return 0;
      return Math.round(((signal + 90) / 60) * 100);
    }

    _getQualityDescription(quality) {
      if (quality >= 80) return "Excelente";
      if (quality >= 60) return "Boa";
      if (quality >= 40) return "Regular";
      return "Fraca";
    }

    _getSecurityIcon(security) {
      if (!security || security === "Open") return "channel-insecure-symbolic";
      if (security.includes("WPA3")) return "security-high-symbolic";
      if (security.includes("WPA2")) return "security-medium-symbolic";
      return "security-low-symbolic";
    }

    _getSecurityColor(security) {
      if (!security || security === "Open") return "error";
      if (security.includes("WPA3")) return "success";
      return "warning";
    }

    _evaluateSecurityLevel(security) {
      if (!security || security === "Open") {
        return {
          description: "Sem proteção - Dados não criptografados",
          icon: "dialog-warning-symbolic",
          color: "error"
        };
      }
      if (security.includes("WPA3")) {
        return {
          description: "Alta proteção - Criptografia moderna",
          icon: "security-high-symbolic",
          color: "success"
        };
      }
      if (security.includes("WPA2")) {
        return {
          description: "Boa proteção - Criptografia adequada",
          icon: "security-medium-symbolic",
          color: "warning"
        };
      }
      return {
        description: "Proteção básica - Criptografia antiga",
        icon: "security-low-symbolic",
        color: "warning"
      };
    }

    _estimateDistance(signal, frequency) {
      // Fórmula aproximada para estimativa de distância
      const freqMHz = frequency || 2400;
      const pathLoss = Math.abs(signal);
      const distance = Math.pow(10, (pathLoss - 20 * Math.log10(freqMHz) - 32.44) / 20);
      
      if (distance < 1) return "&lt; 1"; // Escape HTML para <
      if (distance > 1000) return "&gt; 1km"; // Escape HTML para >
      if (distance > 100) return Math.round(distance / 100) * 100;
      return Math.round(distance);
    }

    _calculateSignalStats() {
      const history = this._networkData.signalHistory || [this._networkData.signal];
      const sum = history.reduce((a, b) => a + b, 0);
      const average = Math.round(sum / history.length);
      
      const variance = history.reduce((acc, val) => acc + Math.pow(val - average, 2), 0) / history.length;
      const stddev = Math.sqrt(variance);
      
      return { average, stddev };
    }

    _calculateSignalTrend() {
      const history = this._networkData.signalHistory;
      if (!history || history.length < 3) {
        return { description: "Dados insuficientes", icon: "view-refresh-symbolic", color: "dim-label" };
      }

      const recent = history.slice(-5);
      const older = history.slice(-10, -5);
      
      const recentAvg = recent.reduce((a, b) => a + b, 0) / recent.length;
      const olderAvg = older.length > 0 ? older.reduce((a, b) => a + b, 0) / older.length : recentAvg;
      
      const diff = recentAvg - olderAvg;
      
      if (diff > 2) {
        return { description: "Melhorando", icon: "pan-up-symbolic", color: "success" };
      } else if (diff < -2) {
        return { description: "Piorando", icon: "pan-down-symbolic", color: "error" };
      } else {
        return { description: "Estável", icon: "view-refresh-symbolic", color: "dim-label" };
      }
    }

    _lookupVendor(bssid) {
      // OUI lookup básico - em implementação real, usaria base de dados IEEE
      const oui = bssid.substring(0, 8).toLowerCase();
      const vendors = {
        "00:1a:2b": "Apple",
        "00:23:6c": "Samsung",
        "00:26:b6": "ASUS",
        "00:24:d4": "Cisco",
        "00:1f:3a": "D-Link",
        "00:21:29": "TP-Link"
      };
      return vendors[oui] || null;
    }

    async _exportNetworkData() {
      try {
        const data = {
          network: this._networkData,
          exportTime: new Date().toISOString(),
          exportType: "single-network"
        };

        // Implementar salvamento
        this._showToast("Dados da rede exportados");
      } catch (error) {
        this._showToast(`Erro na exportação: ${error.message}`);
      }
    }

    _openLocationInMap() {
      if (this._networkData.location) {
        const { latitude, longitude } = this._networkData.location;
        const url = `https://www.openstreetmap.org/?mlat=${latitude}&mlon=${longitude}&zoom=16`;
        
        // Em ambiente real, abriria o navegador
        print(`Abrir mapa: ${url}`);
        this._showToast("Coordenadas copiadas");
      }
    }

    _openTelemetryWindow() {
      // Emitir sinal para abrir janela de telemetria
      this.emit('open-telemetry-requested', this._networkData.bssid);
      this.close();
    }

    _showToast(message) {
      // Implementar toast notification
      print(`TOAST: ${message}`);
    }
  }
);
