// networkDetailsDialog.js - Network information dialog with hunt mode integration

print("DEBUG: networkDetailsDialog.js está sendo carregado");

const { GObject, Gtk, Adw, Gio, GLib, Gdk } = imports.gi;

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
      const { networkData, networkManager } = params;
      
      // Construtor básico sem parâmetros extras
      super._init({
        title: "Detalhes da Rede",
        default_width: 500,
        default_height: 600,
        modal: true,
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

      // Botão Modo Monitor - usar ícone mais universal
      this._huntButton = new Gtk.ToggleButton({
        label: "🎯", // Emoji como fallback visual
        tooltip_text: "Adicionar/Remover do Modo Monitor",
        visible: true,
        css_classes: ["flat"],
        valign: Gtk.Align.CENTER,
        halign: Gtk.Align.CENTER,
        width_request: 40,
        height_request: 40,
        margin_start: 6,
        margin_end: 6
      });
      
      // Tentar definir ícone, mas manter emoji como fallback
      try {
        this._huntButton.set_icon_name("starred-symbolic");
        this._huntButton.set_label(""); // Limpar emoji se ícone funcionou
      } catch (e) {
        print(`INFO: Usando emoji como ícone do botão Monitor Mode`);
        // Manter emoji como fallback
      }

      // Botões de ação diretos (substituindo menu que não funciona em Adw.Window)
      const actionsBox = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        spacing: 6
      });

      // Botão exportar
      const exportButton = new Gtk.Button({
        icon_name: "document-save-symbolic",
        tooltip_text: "Exportar dados desta rede",
        css_classes: ["flat"]
      });
      exportButton.connect('clicked', () => this._exportNetworkData());

      // Botão copiar BSSID
      const copyBssidButton = new Gtk.Button({
        icon_name: "edit-copy-symbolic",
        tooltip_text: "Copiar BSSID",
        css_classes: ["flat"]
      });
      copyBssidButton.connect('clicked', () => {
        this._copyBssidToClipboard("BSSID copiado do cabeçalho");
      });

      // Botão telemetria
      const telemetryButton = new Gtk.Button({
        icon_name: "utilities-system-monitor-symbolic", 
        tooltip_text: "Abrir telemetria",
        css_classes: ["flat"]
      });
      telemetryButton.connect('clicked', () => this._openTelemetryWindow());

      actionsBox.append(exportButton);
      actionsBox.append(copyBssidButton); 
      actionsBox.append(telemetryButton);

      headerBar.pack_start(this._huntButton);
      headerBar.pack_end(actionsBox);

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
      // contentBox.append(this._createTechnicalSection());
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
        this._copyBssidToClipboard("BSSID copiado da seção de informações");
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

    // Seção de Informações Técnicas removida por não conter dados obrigatórios

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
      // Garantir que o botão Monitor Mode sempre esteja visível
      this._huntButton.set_visible(true);
      
      // Verificar se é alvo do modo monitor
      if (this._networkManager) {
        this._isHuntTarget = this._networkManager.isHuntTarget(this._networkData.bssid);
        this._huntButton.set_active(this._isHuntTarget);
        this._updateHuntButtonStyle();
      } else {
        // Mesmo sem networkManager, mostrar botão em estado inativo
        print("AVISO: NetworkManager não disponível, botão Monitor Mode em modo limitado");
        this._isHuntTarget = false;
        this._huntButton.set_active(false);
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
        } else {
          // Sem networkManager, mostrar aviso mas permitir que o botão funcione visualmente
          this._showToast(`⚠️ Modo Monitor: NetworkManager não disponível`);
          print(`DEBUG: Tentativa de ${this._isHuntTarget ? 'adicionar' : 'remover'} ${this._networkData.bssid} ao hunt mode sem networkManager`);
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
        // Botão ativo - em modo monitor
        this._huntButton.set_css_classes(["destructive-action"]);
        this._huntButton.set_tooltip_text("Remover do Modo Monitor");
        
        // Tentar diferentes ícones para ver qual está disponível
        const activeIcons = [
          "starred-symbolic",           // Estrela preenchida
          "bookmark-new-symbolic",      // Marcador
          "view-pin-symbolic",         // Pin padrão 
          "security-high-symbolic",    // Shield
          "emblem-important-symbolic", // Importante
          "preferences-system-symbolic", // Sistema (muito comum)
          "applications-system-symbolic", // Apps sistema
          "folder-symbolic"            // Pasta (muito básico)
        ];
        
        let iconSet = false;
        for (const iconName of activeIcons) {
          try {
            this._huntButton.set_icon_name(iconName);
            iconSet = true;
            break;
          } catch (e) {
            continue;
          }
        }
        
        if (!iconSet) {
          // Fallback: usar emoji/texto se ícone não funcionar
          this._huntButton.set_label("🎯✓"); // Emoji ativo
          this._huntButton.set_icon_name(""); // Limpar ícone para mostrar texto
        } else {
          // Garantir que label está limpo quando ícone está definido
          this._huntButton.set_label("");
        }
        
      } else {
        // Botão inativo - não em modo monitor
        this._huntButton.set_css_classes(["flat"]);
        this._huntButton.set_tooltip_text("Adicionar ao Modo Monitor");
        
        // Ícones para estado inativo
        const inactiveIcons = [
          "non-starred-symbolic",       // Estrela vazia
          "bookmark-new-symbolic",      // Marcador
          "view-pin-symbolic",         // Pin
          "security-low-symbolic",     // Shield baixo
          "emblem-default-symbolic",   // Padrão
          "applications-utilities-symbolic", // Utilitários
          "view-refresh-symbolic",     // Refresh (muito comum)
          "document-new-symbolic"      // Documento (muito básico)
        ];
        
        let iconSet = false;
        for (const iconName of inactiveIcons) {
          try {
            this._huntButton.set_icon_name(iconName);
            iconSet = true;
            break;
          } catch (e) {
            continue;
          }
        }
        
        if (!iconSet) {
          // Fallback: usar emoji/texto se ícone não funcionar
          this._huntButton.set_label("🎯"); // Emoji inativo
          this._huntButton.set_icon_name(""); // Limpar ícone para mostrar texto
        } else {
          // Garantir que label está limpo quando ícone está definido
          this._huntButton.set_label("");
        }
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
          metadata: {
            exportTime: new Date().toISOString(),
            exportType: "single-network",
            exportVersion: "1.0",
            source: "WiFi Analyzer"
          },
          network: {
            ssid: this._networkData.ssid,
            bssid: this._networkData.bssid,
            channel: this._networkData.channel,
            frequency: this._networkData.frequency,
            signal: this._networkData.signal,
            security: this._networkData.security,
            firstSeen: this._networkData.firstSeen,
            lastSeen: this._networkData.lastSeen,
            location: this._networkData.location,
            signalHistory: this._networkData.signalHistory || [],
            detectionCount: this._networkData.detectionCount || 1,
            analysis: {
              signalQuality: this._calculateSignalQuality(this._networkData.signal),
              estimatedDistance: this._estimateDistance(this._networkData.signal, this._networkData.frequency),
              securityLevel: this._evaluateSecurityLevel(this._networkData.security)
            }
          }
        };

        // Mostrar dialog de escolha de formato
        await this._showExportDialog(data);
        
      } catch (error) {
        this._showToast(`❌ Erro na exportação: ${error.message}`);
        print(`ERRO na exportação: ${error.message}`);
      }
    }

    async _showExportDialog(data) {
      // Criar dialog de exportação
      const dialog = new Adw.MessageDialog({
        heading: "Exportar Dados da Rede",
        body: `Escolha o formato de exportação para a rede: ${this._networkData.ssid || 'Rede Oculta'}`,
        modal: true,
        transient_for: this
      });

      // Adicionar botões de formato
      dialog.add_response("json", "JSON");
      dialog.add_response("csv", "CSV"); 
      dialog.add_response("clipboard", "Área de Transferência");
      dialog.add_response("cancel", "Cancelar");

      dialog.set_default_response("json");
      dialog.set_close_response("cancel");

      const response = await new Promise((resolve) => {
        dialog.connect('response', (dialog, response) => {
          resolve(response);
          dialog.close();
        });
        dialog.present();
      });

      switch (response) {
        case "json":
          await this._exportAsJSON(data);
          break;
        case "csv":
          await this._exportAsCSV(data);
          break;
        case "clipboard":
          await this._exportToClipboard(data);
          break;
        default:
          return; // Cancelado
      }
    }

    async _exportAsJSON(data) {
      try {
        const jsonData = JSON.stringify(data, null, 2);
        const filename = `wifi_network_${this._networkData.bssid?.replace(/:/g, '_')}_${new Date().toISOString().split('T')[0]}.json`;
        
        await this._saveToFile(jsonData, filename, "application/json");
        this._showToast(`✅ Dados exportados como JSON`);
      } catch (error) {
        this._showToast(`❌ Erro ao exportar JSON: ${error.message}`);
      }
    }

    async _exportAsCSV(data) {
      try {
        const csvHeaders = [
          "SSID", "BSSID", "Canal", "Frequencia_MHz", "Sinal_dBm", 
          "Seguranca", "Primeira_Deteccao", "Ultima_Deteccao", "Contagem_Deteccoes",
          "Qualidade_Sinal", "Distancia_Estimada", "Nivel_Seguranca"
        ];

        const csvRow = [
          `"${data.network.ssid || ''}"`,
          `"${data.network.bssid}"`,
          data.network.channel,
          data.network.frequency,
          data.network.signal,
          `"${data.network.security || 'Aberta'}"`,
          `"${data.network.firstSeen}"`,
          `"${data.network.lastSeen}"`,
          data.network.detectionCount,
          `"${data.network.analysis.signalQuality}%"`,
          `"${data.network.analysis.estimatedDistance}m"`,
          `"${data.network.analysis.securityLevel.description}"`
        ];

        const csvData = csvHeaders.join(',') + '\n' + csvRow.join(',');
        const filename = `wifi_network_${this._networkData.bssid?.replace(/:/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`;
        
        await this._saveToFile(csvData, filename, "text/csv");
        this._showToast(`✅ Dados exportados como CSV`);
      } catch (error) {
        this._showToast(`❌ Erro ao exportar CSV: ${error.message}`);
      }
    }

    async _exportToClipboard(data) {
      try {
        const textData = `Exportação de Rede WiFi - ${data.metadata.exportTime}
        
Informações da Rede:
- SSID: ${data.network.ssid || 'Rede Oculta'}
- BSSID: ${data.network.bssid}
- Canal: ${data.network.channel} (${data.network.frequency} MHz)
- Força do Sinal: ${data.network.signal} dBm
- Segurança: ${data.network.security || 'Aberta'}
- Qualidade: ${data.network.analysis.signalQuality}%
- Distância Estimada: ${data.network.analysis.estimatedDistance}m
- Nível de Segurança: ${data.network.analysis.securityLevel.description}
- Primeira Detecção: ${data.network.firstSeen}
- Última Detecção: ${data.network.lastSeen}
- Contagem de Detecções: ${data.network.detectionCount}`;

        // Usar o método de clipboard robusto já implementado
        this._copyBssidToClipboard("Dados da rede copiados", textData);
      } catch (error) {
        this._showToast(`❌ Erro ao copiar: ${error.message}`);
      }
    }

    async _saveToFile(content, filename, mimeType) {
      try {
        // Usar Gtk.FileChooserNative para integração nativa com GNOME/Nautilus
        const fileDialog = new Gtk.FileChooserNative({
          title: "Salvar arquivo de exportação",
          action: Gtk.FileChooserAction.SAVE,
          transient_for: this,
          modal: true,
          accept_label: "Salvar",
          cancel_label: "Cancelar"
        });

        // Definir nome padrão do arquivo
        fileDialog.set_current_name(filename);

        // Adicionar filtros de arquivo baseados no tipo MIME
        const filter = new Gtk.FileFilter();
        
        if (mimeType === "application/json") {
          filter.set_name("Arquivos JSON (*.json)");
          filter.add_mime_type("application/json");
          filter.add_pattern("*.json");
        } else if (mimeType === "text/csv") {
          filter.set_name("Arquivos CSV (*.csv)");
          filter.add_mime_type("text/csv");
          filter.add_pattern("*.csv");
        } else {
          filter.set_name("Todos os arquivos (*.*)");
          filter.add_pattern("*");
        }
        
        fileDialog.add_filter(filter);

        // Tentar definir diretório padrão (Downloads ou Documentos)
        try {
          const homeDir = GLib.get_home_dir();
          const downloadsDir = GLib.build_filenamev([homeDir, "Downloads"]);
          const documentsDir = GLib.build_filenamev([homeDir, "Documentos"]);
          
          // Verificar se Downloads existe, senão usar Documentos
          if (GLib.file_test(downloadsDir, GLib.FileTest.IS_DIR)) {
            const downloadsFile = Gio.File.new_for_path(downloadsDir);
            fileDialog.set_current_folder(downloadsFile);
          } else if (GLib.file_test(documentsDir, GLib.FileTest.IS_DIR)) {
            const documentsFile = Gio.File.new_for_path(documentsDir);
            fileDialog.set_current_folder(documentsFile);
          }
        } catch (e) {
          print(`Aviso: Não foi possível definir diretório padrão: ${e.message}`);
        }

        const response = await new Promise((resolve) => {
          fileDialog.connect('response', (dialog, response_id) => {
            resolve(response_id);
          });
          fileDialog.show();
        });

        if (response === Gtk.ResponseType.ACCEPT) {
          const file = fileDialog.get_file();
          const filePath = file.get_path();
          
          // Salvar arquivo usando GLib/Gio de forma robusta
          try {
            const success = file.replace_contents(
              content, 
              null, // etag
              false, // make_backup
              Gio.FileCreateFlags.REPLACE_DESTINATION,
              null // cancellable
            );
            
            if (success[0]) {
              this._showToast(`✅ Arquivo salvo: ${GLib.path_get_basename(filePath)}`);
              print(`Arquivo salvo em: ${filePath}`);
            } else {
              throw new Error("Falha ao escrever arquivo");
            }
          } catch (writeError) {
            print(`Erro ao escrever arquivo: ${writeError.message}`);
            // Fallback para método alternativo
            const outputStream = file.replace(null, false, Gio.FileCreateFlags.REPLACE_DESTINATION, null);
            const bytes = new GLib.Bytes(content);
            outputStream.write_bytes(bytes, null);
            outputStream.close(null);
            
            this._showToast(`✅ Arquivo salvo: ${GLib.path_get_basename(filePath)}`);
          }
        }

        fileDialog.destroy();
      } catch (error) {
        print(`Erro no save dialog: ${error.message}`);
        // Fallback robusto: copiar para clipboard
        this._copyBssidToClipboard("Falha ao salvar arquivo, dados copiados", content);
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

    _copyBssidToClipboard(toastMessage, customText = null) {
      try {
        // Definir o texto a ser copiado
        const textToCopy = customText || this._networkData.bssid;
        
        // Verificar se há texto para copiar
        if (!textToCopy) {
          this._showToast("❌ Erro: Nenhum texto disponível para copiar");
          return;
        }

        // Tentar diferentes métodos de acesso ao clipboard
        let success = false;
        
        // Método 1: Usando Gdk.Display
        try {
          const display = this.get_display();
          const clipboard = display.get_clipboard();
          
          // Tentar diferentes APIs do clipboard
          if (clipboard.set_text) {
            clipboard.set_text(textToCopy);
            success = true;
          } else if (clipboard.set) {
            clipboard.set(textToCopy);
            success = true;
          } else if (clipboard.set_content) {
            const content = Gdk.ContentProvider.new_for_value(textToCopy);
            clipboard.set_content(content);
            success = true;
          }
        } catch (e) {
          print(`Método 1 falhou: ${e.message}`);
        }
        
        // Método 2: Usando this.get_clipboard() se método 1 falhou
        if (!success) {
          try {
            const clipboard = this.get_clipboard();
            if (clipboard && clipboard.set_text) {
              clipboard.set_text(textToCopy);
              success = true;
            }
          } catch (e) {
            print(`Método 2 falhou: ${e.message}`);
          }
        }
        
        // Método 3: Usando Gtk.Clipboard (fallback para versões antigas)
        if (!success) {
          try {
            const clipboard = Gtk.Clipboard.get(Gdk.SELECTION_CLIPBOARD);
            if (clipboard && clipboard.set_text) {
              clipboard.set_text(textToCopy, -1);
              success = true;
            }
          } catch (e) {
            print(`Método 3 falhou: ${e.message}`);
          }
        }

        // Método 4: Usando ContentProvider moderno (GTK4)
        if (!success) {
          try {
            const display = this.get_display();
            const clipboard = display.get_clipboard();
            const provider = Gdk.ContentProvider.new_for_value(textToCopy);
            clipboard.set_content(provider);
            success = true;
          } catch (e) {
            print(`Método 4 falhou: ${e.message}`);
          }
        }

        // Método 5: Último recurso - async set_text
        if (!success) {
          try {
            const display = this.get_display();
            const clipboard = display.get_clipboard();
            clipboard.set_text(textToCopy);
            success = true;
          } catch (e) {
            print(`Método 5 falhou: ${e.message}`);
          }
        }
        
        if (!success) {
          throw new Error("Todos os métodos de clipboard falharam - verifique se as permissões estão corretas");
        }
        
        // Confirmar com toast personalizado
        const finalMessage = customText ? 
          `✅ ${toastMessage || "Dados copiados"}` :
          `✅ ${toastMessage || "BSSID copiado"}: ${textToCopy}`;
        this._showToast(finalMessage);
        
        print(`DEBUG: Texto copiado com sucesso: ${customText ? '[dados da rede]' : textToCopy}`);
        
        // Feedback visual adicional - breve animação no botão
        this._addCopyFeedback();
        
      } catch (error) {
        print(`ERRO ao copiar BSSID: ${error.message}`);
        this._showToast(`❌ Erro ao copiar BSSID: ${error.message}`);
      }
    }

    _addCopyFeedback() {
      // Adicionar feedback visual temporário aos botões de cópia
      try {
        // Encontrar todos os botões de cópia e dar feedback visual
        const copyButtons = [];
        
        // Buscar botões na hierarquia (método simplificado)
        const searchForCopyButtons = (widget) => {
          if (!widget) return;
          
          try {
            if (widget.get_icon_name && widget.get_icon_name() === "edit-copy-symbolic") {
              copyButtons.push(widget);
            }
            
            // Tentar buscar filhos se possível
            if (widget.get_first_child) {
              let child = widget.get_first_child();
              while (child) {
                searchForCopyButtons(child);
                child = child.get_next_sibling();
              }
            }
          } catch (e) {
            // Ignorar erros de busca
          }
        };
        
        searchForCopyButtons(this);
        
        // Aplicar animação de feedback nos botões encontrados
        copyButtons.forEach(button => {
          try {
            button.add_css_class("success");
            GLib.timeout_add(GLib.PRIORITY_DEFAULT, 1000, () => {
              try {
                button.remove_css_class("success");
              } catch (e) {
                // Ignorar se botão foi destruído
              }
              return GLib.SOURCE_REMOVE;
            });
          } catch (e) {
            // Ignorar erros de animação
          }
        });
        
      } catch (error) {
        // Feedback visual é opcional, não interromper o fluxo
        print(`DEBUG: Erro no feedback visual: ${error.message}`);
      }
    }

    _showToast(message) {
      // Sistema de toast melhorado que usa a janela principal
      try {
        // Primeira tentativa: usar janela transient_for (janela principal)
        const transientFor = this.get_transient_for();
        if (transientFor && transientFor.showToast) {
          transientFor.showToast(message);
          return;
        }

        // Segunda tentativa: buscar na aplicação
        const app = this.get_application?.();
        if (app) {
          const mainWindow = app.get_active_window?.();
          if (mainWindow && mainWindow.showToast) {
            mainWindow.showToast(message);
            return;
          }
          
          // Fallback para método add_toast direto
          if (mainWindow && mainWindow._toastOverlay) {
            const toast = new Adw.Toast({
              title: message,
              timeout: 3
            });
            mainWindow._toastOverlay.add_toast(toast);
            return;
          }
        }

        // Fallback final: imprimir na saída para debug
        print(`TOAST: ${message}`);
      } catch (error) {
        print(`TOAST FALLBACK: ${message} (Erro: ${error.message})`);
      }
    }
  }
);
