const { GObject, Gtk, Gdk, GLib, Adw } = imports.gi;

var AdvancedChannelAnalyzer = GObject.registerClass(
  {
    GTypeName: "AdvancedChannelAnalyzer",
  },
  class AdvancedChannelAnalyzer extends Gtk.Box {
    _init() {
      super._init({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 0,
        hexpand: true,
        vexpand: true,
      });

      this._networks = [];
      this._interferenceSources = [];
      
      this._buildUI();
    }

    _buildUI() {
      // Main content area
      const mainBox = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        spacing: 0,
        vexpand: true,
      });

      // Left panel - Channel overlap visualization
      const leftPanel = this._createChannelOverlapPanel();
      mainBox.append(leftPanel);

      // Right panel - Interference analysis
      const rightPanel = this._createInterferencePanel();
      mainBox.append(rightPanel);

      this.append(mainBox);
    }

    _createChannelOverlapPanel() {
      const panel = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 0,
        hexpand: true,
      });

      // Header
      const headerBox = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        spacing: 12,
        css_classes: ["toolbar"],
      });

      const titleLabel = new Gtk.Label({
        label: "Sobreposição de Canais 2.4GHz",
        css_classes: ["heading"],
        xalign: 0,
      });

      const refreshButton = new Gtk.Button({
        icon_name: "view-refresh-symbolic",
        tooltip_text: "Atualizar visualização",
        css_classes: ["flat"],
      });
      refreshButton.connect("clicked", () => {
        this._updateAnalysis();
      });

      headerBox.append(titleLabel);
      headerBox.append(new Gtk.Box()); // Spacer
      headerBox.append(refreshButton);

      // Channel overlap visualization
      this._channelOverlapWidget = new ChannelOverlapWidget();
      
      panel.append(headerBox);
      panel.append(this._channelOverlapWidget);

      return new Gtk.ScrolledWindow({
        child: panel,
        vexpand: true,
        hexpand: true,
      });
    }

    _createInterferencePanel() {
      const panel = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 0,
        hexpand: true,
      });

      // Header
      const headerBox = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        spacing: 12,
        css_classes: ["toolbar"],
      });

      const titleLabel = new Gtk.Label({
        label: "Análise de Interferência",
        css_classes: ["heading"],
        xalign: 0,
      });

      headerBox.append(titleLabel);

      // Content
      const contentBox = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 24,
      });

      // Interference sources list
      const interferenceGroup = new Adw.PreferencesGroup({
        title: "Fontes de Interferência Detectadas",
        description: "Problemas identificados na análise de canais",
      });

      this._interferenceList = new Gtk.ListBox({
        css_classes: ["boxed-list"],
        selection_mode: Gtk.SelectionMode.NONE,
      });

      interferenceGroup.add(this._interferenceList);
      contentBox.append(interferenceGroup);

      // Recommendations
      const recommendationsGroup = new Adw.PreferencesGroup({
        title: "Recomendações",
        description: "Sugestões para melhorar a qualidade da rede",
      });

      this._recommendationsLabel = new Gtk.Label({
        label: "Execute uma análise para ver recomendações",
        css_classes: ["dim-label"],
        wrap: true,
        xalign: 0,
      });

      recommendationsGroup.add(this._recommendationsLabel);
      contentBox.append(recommendationsGroup);

      panel.append(headerBox);
      panel.append(contentBox);

      return new Gtk.ScrolledWindow({
        child: panel,
        vexpand: true,
        hexpand: true,
      });
    }

    updateNetworks(networks) {
      this._networks = networks;
      this._updateAnalysis();
    }

    _updateAnalysis() {
      // Update channel overlap visualization
      this._channelOverlapWidget.updateNetworks(this._networks);
      
      // Analyze interference sources
      this._analyzeInterferenceSources();
      
      // Update recommendations
      this._updateRecommendations();
    }

    _analyzeInterferenceSources() {
      // Clear existing list
      let child = this._interferenceList.get_first_child();
      while (child) {
        const next = child.get_next_sibling();
        this._interferenceList.remove(child);
        child = next;
      }

      // Analyze potential interference sources
      const interferenceSources = this._detectInterferenceSources();
      
      interferenceSources.forEach(source => {
        const row = new Adw.ActionRow({
          title: source.name,
          subtitle: source.description,
        });

        // Add severity indicator
        const severityBox = new Gtk.Box({
          orientation: Gtk.Orientation.HORIZONTAL,
          spacing: 4,
          valign: Gtk.Align.CENTER,
        });

        let severityIcon = "dialog-warning-symbolic";
        let severityColor = "warning";
        
        if (source.severity === "high") {
          severityIcon = "dialog-error-symbolic";
          severityColor = "error";
        } else if (source.severity === "low") {
          severityIcon = "dialog-information-symbolic";
          severityColor = "success";
        }

        const icon = new Gtk.Image({
          icon_name: severityIcon,
          css_classes: [severityColor],
        });

        severityBox.append(icon);
        row.add_suffix(severityBox);
        
        this._interferenceList.append(row);
      });
    }

    _detectInterferenceSources() {
      const sources = [];
      
      // Analyze channel congestion
      const channelCounts = new Map();
      this._networks.forEach(network => {
        if (network.frequency < 3000) { // 2.4GHz
          const channel = network.channel;
          channelCounts.set(channel, (channelCounts.get(channel) || 0) + 1);
        }
      });

      // Check for overcrowded channels
      channelCounts.forEach((count, channel) => {
        if (count >= 3) {
          sources.push({
            name: `Canal ${channel} Superlotado`,
            description: `${count} redes no mesmo canal causando interferência`,
            severity: count >= 5 ? "high" : "medium",
            type: "channel_congestion",
            channel: channel,
            count: count
          });
        }
      });

      // Check for overlapping channels
      const overlappingChannels = this._detectOverlappingChannels();
      overlappingChannels.forEach(overlap => {
        sources.push({
          name: `Sobreposição de Canais`,
          description: `Canais ${overlap.channels.join(', ')} se sobrepõem`,
          severity: "medium",
          type: "channel_overlap",
          channels: overlap.channels
        });
      });

      // Check for weak signals that might indicate interference
      const weakSignals = this._networks.filter(net => net.signal < 30);
      if (weakSignals.length > 0) {
        sources.push({
          name: "Sinais Fracos Detectados",
          description: `${weakSignals.length} redes com sinal muito fraco`,
          severity: "low",
          type: "weak_signals",
          count: weakSignals.length
        });
      }

      // Check for potential non-WiFi interference sources
      const nonWifiInterference = this._detectNonWifiInterference();
      sources.push(...nonWifiInterference);

      // Check for frequency hopping patterns
      const frequencyHopping = this._detectFrequencyHopping();
      if (frequencyHopping) {
        sources.push(frequencyHopping);
      }

      return sources;
    }

    _detectNonWifiInterference() {
      const sources = [];
      
      // Analyze signal patterns that might indicate non-WiFi interference
      const networks24 = this._networks.filter(net => net.frequency < 3000);
      
      // Check for unusual signal strength patterns
      const signalStrengths = networks24.map(net => net.signal);
      const avgSignal = signalStrengths.reduce((a, b) => a + b, 0) / signalStrengths.length;
      const signalVariance = signalStrengths.reduce((sum, signal) => sum + Math.pow(signal - avgSignal, 2), 0) / signalStrengths.length;
      
      if (signalVariance > 1000) { // High variance might indicate interference
        sources.push({
          name: "Padrão de Sinal Irregular",
          description: "Variação alta na força do sinal pode indicar interferência",
          severity: "medium",
          type: "signal_variance",
          variance: Math.round(signalVariance)
        });
      }

      // Check for networks with very similar signal strengths (might be interference)
      const similarSignals = this._findSimilarSignalStrengths();
      if (similarSignals.length > 0) {
        sources.push({
          name: "Sinais com Força Similar",
          description: `${similarSignals.length} redes com força de sinal muito similar`,
          severity: "low",
          type: "similar_signals",
          count: similarSignals.length
        });
      }

      return sources;
    }

    _findSimilarSignalStrengths() {
      const networks24 = this._networks.filter(net => net.frequency < 3000);
      const similar = [];
      
      for (let i = 0; i < networks24.length; i++) {
        for (let j = i + 1; j < networks24.length; j++) {
          const diff = Math.abs(networks24[i].signal - networks24[j].signal);
          if (diff <= 5) { // Signals within 5% are considered similar
            similar.push([networks24[i], networks24[j]]);
          }
        }
      }
      
      return similar;
    }

    _detectFrequencyHopping() {
      // This is a simplified detection - in a real implementation,
      // you'd need more sophisticated analysis of signal patterns over time
      const networks24 = this._networks.filter(net => net.frequency < 3000);
      
      if (networks24.length > 15) {
        return {
          name: "Possível Interferência por Salto de Frequência",
          description: "Muitas redes detectadas podem indicar dispositivos com salto de frequência",
          severity: "medium",
          type: "frequency_hopping",
          count: networks24.length
        };
      }
      
      return null;
    }

    _detectOverlappingChannels() {
      const overlaps = [];
      const channels24 = this._networks
        .filter(net => net.frequency < 3000)
        .map(net => net.channel);

      // Check for channels that are too close (overlapping)
      for (let i = 0; i < channels24.length; i++) {
        for (let j = i + 1; j < channels24.length; j++) {
          const diff = Math.abs(channels24[i] - channels24[j]);
          if (diff <= 4 && diff > 0) { // Channels overlap if they're within 4 channels
            overlaps.push({
              channels: [channels24[i], channels24[j]],
              overlap: 5 - diff // How much they overlap
            });
          }
        }
      }

      return overlaps;
    }

    _updateRecommendations() {
      const recommendations = [];

      // Channel recommendations
      const bestChannels = this._findBestChannels();
      if (bestChannels.length > 0) {
        recommendations.push(`• Use os canais ${bestChannels.join(', ')} para menor interferência`);
      }

      // Power recommendations
      const highPowerNetworks = this._networks.filter(net => net.signal > 80);
      if (highPowerNetworks.length > 0) {
        recommendations.push(`• ${highPowerNetworks.length} rede(s) com sinal muito forte - considere reduzir potência`);
      }

      // Interference-specific recommendations
      const interferenceSources = this._detectInterferenceSources();
      const highInterference = interferenceSources.filter(source => source.severity === "high");
      const mediumInterference = interferenceSources.filter(source => source.severity === "medium");

      if (highInterference.length > 0) {
        recommendations.push(`• ${highInterference.length} fonte(s) de interferência alta detectada(s)`);
        recommendations.push("• Considere mudar para banda de 5GHz ou usar canais mais distantes");
      }

      if (mediumInterference.length > 0) {
        recommendations.push(`• ${mediumInterference.length} fonte(s) de interferência média - monitore a qualidade da conexão`);
      }

      // Non-WiFi interference recommendations
      const nonWifiSources = interferenceSources.filter(source => 
        source.type === "signal_variance" || source.type === "frequency_hopping"
      );
      
      if (nonWifiSources.length > 0) {
        recommendations.push("• Possível interferência de dispositivos não-WiFi detectada");
        recommendations.push("• Verifique: telefones sem fio, microondas, Bluetooth, etc.");
      }

      // General recommendations
      if (this._networks.length > 10) {
        recommendations.push("• Muitas redes detectadas - considere usar banda de 5GHz");
      }

      // Channel width recommendations
      const overlappingChannels = this._detectOverlappingChannels();
      if (overlappingChannels.length > 0) {
        recommendations.push("• Canais sobrepostos detectados - use largura de canal de 20MHz");
      }

      if (recommendations.length === 0) {
        recommendations.push("• Configuração atual parece adequada");
      }

      this._recommendationsLabel.set_label(recommendations.join('\n'));
    }

    _findBestChannels() {
      const channelScores = new Map();
      
      // Initialize scores for channels 1, 6, 11 (non-overlapping)
      [1, 6, 11].forEach(channel => {
        channelScores.set(channel, 0);
      });

      // Calculate interference scores
      this._networks.forEach(network => {
        if (network.frequency < 3000) {
          const channel = network.channel;
          [1, 6, 11].forEach(targetChannel => {
            const distance = Math.abs(channel - targetChannel);
            if (distance <= 4) {
              const interference = network.signal / (distance + 1);
              channelScores.set(targetChannel, channelScores.get(targetChannel) + interference);
            }
          });
        }
      });

      // Find channels with lowest interference
      const sortedChannels = Array.from(channelScores.entries())
        .sort((a, b) => a[1] - b[1])
        .map(([channel]) => channel);

      return sortedChannels.slice(0, 2); // Return top 2
    }
  }
);

// Channel Overlap Visualization Widget - GNOME Compatible
var ChannelOverlapWidget = GObject.registerClass(
  {
    GTypeName: "ChannelOverlapWidget",
  },
  class ChannelOverlapWidget extends Gtk.Box {
    _init() {
      super._init({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 16,
        hexpand: true,
        vexpand: true,
      });

      this._networks = [];
      this._buildUI();
    }

    _buildUI() {
      // Create a modern card-based layout
      const card = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 12,
        css_classes: ["card"],
      });

      // Header
      const headerBox = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        spacing: 8,
      });

      const titleLabel = new Gtk.Label({
        label: "Visualização de Canais 2.4GHz",
        css_classes: ["heading"],
        xalign: 0,
      });

      const legendBox = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        spacing: 16,
        css_classes: ["dim-label"],
      });

      // Legend items
      const createLegendItem = (color, text) => {
        const item = new Gtk.Box({
          orientation: Gtk.Orientation.HORIZONTAL,
          spacing: 6,
        });
        
        const colorBox = new Gtk.Box({
          css_classes: ["legend-color"],
          width_request: 12,
          height_request: 12,
        });
        
        const label = new Gtk.Label({ label: text });
        
        item.append(colorBox);
        item.append(label);
        return item;
      };

      legendBox.append(createLegendItem("green", "Sinal Forte (≥75%)"));
      legendBox.append(createLegendItem("yellow", "Sinal Médio (50-74%)"));
      legendBox.append(createLegendItem("red", "Sinal Fraco (<50%)"));

      headerBox.append(titleLabel);
      headerBox.append(new Gtk.Box()); // Spacer
      headerBox.append(legendBox);

      // Channel visualization area
      this._visualizationArea = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 8,
        css_classes: ["channel-visualization"],
        height_request: 200,
      });

      // Status message
      this._statusLabel = new Gtk.Label({
        label: "Aguardando dados de redes...",
        css_classes: ["dim-label"],
        halign: Gtk.Align.CENTER,
        valign: Gtk.Align.CENTER,
      });

      this._visualizationArea.append(this._statusLabel);

      card.append(headerBox);
      card.append(this._visualizationArea);
      this.append(card);
    }

    updateNetworks(networks) {
      this._networks = networks.filter(net => net.frequency < 3000); // Only 2.4GHz
      this._updateVisualization();
    }

    _updateVisualization() {
      // Clear existing content
      let child = this._visualizationArea.get_first_child();
      while (child) {
        const next = child.get_next_sibling();
        this._visualizationArea.remove(child);
        child = next;
      }

      if (this._networks.length === 0) {
        this._statusLabel = new Gtk.Label({
          label: "Nenhuma rede 2.4GHz detectada",
          css_classes: ["dim-label"],
          halign: Gtk.Align.CENTER,
          valign: Gtk.Align.CENTER,
        });
        this._visualizationArea.append(this._statusLabel);
        return;
      }

      // Create channel grid
      const grid = new Gtk.Grid({
        row_spacing: 4,
        column_spacing: 4,
        halign: Gtk.Align.CENTER,
        valign: Gtk.Align.CENTER,
      });

      // Channel headers (1-14)
      for (let i = 1; i <= 14; i++) {
        const headerLabel = new Gtk.Label({
          label: i.toString(),
          css_classes: ["channel-header"],
          halign: Gtk.Align.CENTER,
        });
        grid.attach(headerLabel, i - 1, 0, 1, 1);
      }

      // Create signal bars for each network
      this._networks.forEach((network, index) => {
        const channel = network.channel;
        if (channel >= 1 && channel <= 14) {
          const signalBar = this._createSignalBar(network);
          grid.attach(signalBar, channel - 1, index + 1, 1, 1);
        }
      });

      this._visualizationArea.append(grid);
    }

    _createSignalBar(network) {
      const bar = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 2,
        width_request: 20,
        height_request: 60,
      });

      // Signal strength bar
      const signalHeight = Math.max(10, (network.signal / 100) * 50);
      const signalBar = new Gtk.Box({
        width_request: 16,
        height_request: signalHeight,
        css_classes: [this._getSignalClass(network.signal)],
        halign: Gtk.Align.CENTER,
        valign: Gtk.Align.END,
      });

      // Network name
      const nameLabel = new Gtk.Label({
        label: network.ssid || "Hidden",
        css_classes: ["network-name"],
        halign: Gtk.Align.CENTER,
        max_width_chars: 8,
        ellipsize: 3, // PANGO_ELLIPSIZE_END
      });

      bar.append(signalBar);
      bar.append(nameLabel);

      return bar;
    }

    _getSignalClass(signal) {
      if (signal >= 75) return "signal-excellent";
      if (signal >= 50) return "signal-good";
      return "signal-weak";
    }
  }
);

