// advancedNetworkAnalyzer.js - Advanced network analysis and hunt mode

const { GObject, Gio, GLib } = imports.gi;
const { GPSCoordinate } = imports.gpsManager;

var NetworkHuntTarget = GObject.registerClass(
  {
    GTypeName: "NetworkHuntTarget",
  },
  class NetworkHuntTarget extends GObject.Object {
    _init(params = {}) {
      super._init(params);
      this.bssid = "";
      this.ssid = "";
      this.isActive = false;
      this.history = [];
      this.maxHistorySize = 1000;
      this.strongestSignal = -100;
      this.strongestLocation = new GPSCoordinate();
      this.lastSeen = new Date();
      this.frequency = 0;
      this.channel = 0;
    }

    addDataPoint(signal, location = null, frequency = 0, channel = 0) {
      const now = new Date();
      const dataPoint = {
        timestamp: now,
        signal: signal,
        location: location ? location : new GPSCoordinate(),
        frequency: frequency,
        channel: channel
      };

      this.history.push(dataPoint);
      this.lastSeen = now;
      this.frequency = frequency;
      this.channel = channel;

      // Manter histórico limitado
      if (this.history.length > this.maxHistorySize) {
        this.history.shift();
      }

      // Atualizar sinal mais forte
      if (signal > this.strongestSignal) {
        this.strongestSignal = signal;
        if (location && location.isValid) {
          this.strongestLocation.copy(location);
        }
      }
    }

    getRecentSignalTrend(minutes = 5) {
      const cutoff = new Date(Date.now() - minutes * 60 * 1000);
      const recentData = this.history.filter(point => point.timestamp >= cutoff);
      
      if (recentData.length < 2) return 'stable';
      
      const oldAvg = recentData.slice(0, Math.floor(recentData.length / 2))
        .reduce((sum, point) => sum + point.signal, 0) / Math.floor(recentData.length / 2);
      
      const newAvg = recentData.slice(Math.floor(recentData.length / 2))
        .reduce((sum, point) => sum + point.signal, 0) / Math.ceil(recentData.length / 2);
      
      const diff = newAvg - oldAvg;
      
      if (diff > 5) return 'improving';
      if (diff < -5) return 'degrading';
      return 'stable';
    }

    getSignalStatistics() {
      if (this.history.length === 0) {
        return {
          average: -100,
          minimum: -100,
          maximum: -100,
          variance: 0,
          standardDeviation: 0
        };
      }

      const signals = this.history.map(point => point.signal);
      const average = signals.reduce((sum, signal) => sum + signal, 0) / signals.length;
      const variance = signals.reduce((sum, signal) => sum + Math.pow(signal - average, 2), 0) / signals.length;
      
      return {
        average: Math.round(average * 100) / 100,
        minimum: Math.min(...signals),
        maximum: Math.max(...signals),
        variance: Math.round(variance * 100) / 100,
        standardDeviation: Math.round(Math.sqrt(variance) * 100) / 100
      };
    }
  }
);

var AdvancedNetworkAnalyzer = GObject.registerClass(
  {
    GTypeName: "AdvancedNetworkAnalyzer",
    Signals: {
      'hunt-target-updated': {
        param_types: [NetworkHuntTarget.$gtype]
      },
      'spectrum-interference-detected': {
        param_types: [GObject.TYPE_STRING, GObject.TYPE_INT]
      },
      'channel-congestion-changed': {
        param_types: [GObject.TYPE_INT, GObject.TYPE_DOUBLE]
      }
    }
  },
  class AdvancedNetworkAnalyzer extends GObject.Object {
    _init(params = {}) {
      super._init(params);
      this._huntTargets = new Map();
      this._huntMode = false;
      this._huntUpdateInterval = 2000; // 2 segundos em hunt mode
      this._normalUpdateInterval = 5000; // 5 segundos em modo normal
      this._currentGPS = null;
      this._channelHistory = new Map();
      this._spectrumInterference = new Map();
      
      // Inicializar histórico de canais
      for (let channel = 1; channel <= 14; channel++) {
        this._channelHistory.set(channel, []);
      }
    }

    setGPSManager(gpsManager) {
      this._gpsManager = gpsManager;
      this._gpsManager.connect('location-updated', (source, location) => {
        this._currentGPS = location;
      });
    }

    enableHuntMode() {
      this._huntMode = true;
      print("Hunt mode enabled - High frequency scanning activated");
    }

    disableHuntMode() {
      this._huntMode = false;
      print("Hunt mode disabled - Normal scanning resumed");
    }

    isHuntModeEnabled() {
      return this._huntMode;
    }

    getUpdateInterval() {
      return this._huntMode ? this._huntUpdateInterval : this._normalUpdateInterval;
    }

    addHuntTarget(bssid, ssid = "") {
      if (!this._huntTargets.has(bssid)) {
        const target = new NetworkHuntTarget();
        target.bssid = bssid;
        target.ssid = ssid;
        target.isActive = true;
        this._huntTargets.set(bssid, target);
        print(`Hunt target added: ${ssid || bssid}`);
      }
      return this._huntTargets.get(bssid);
    }

    removeHuntTarget(bssid) {
      if (this._huntTargets.has(bssid)) {
        this._huntTargets.delete(bssid);
        print(`Hunt target removed: ${bssid}`);
      }
    }

    updateNetworkData(networks) {
      const now = new Date();
      
      // Atualizar alvos de hunt
      for (const network of networks) {
        if (this._huntTargets.has(network.bssid)) {
          const target = this._huntTargets.get(network.bssid);
          target.addDataPoint(
            network.signal, 
            this._currentGPS, 
            network.frequency, 
            network.channel
          );
          
          this.emit('hunt-target-updated', target);
        }
      }

      // Analisar congestionamento de canais
      this._analyzeChannelCongestion(networks);
      
      // Detectar interferência de espectro
      this._detectSpectrumInterference(networks);
    }

    _analyzeChannelCongestion(networks) {
      const channelCounts = new Map();
      const channelSignalSum = new Map();
      
      // Contar redes por canal e somar sinais
      for (const network of networks) {
        const channel = network.channel;
        channelCounts.set(channel, (channelCounts.get(channel) || 0) + 1);
        channelSignalSum.set(channel, (channelSignalSum.get(channel) || 0) + network.signal);
      }

      // Calcular congestionamento por canal
      for (const [channel, count] of channelCounts) {
        const avgSignal = channelSignalSum.get(channel) / count;
        const congestionScore = this._calculateCongestionScore(count, avgSignal);
        
        // Adicionar ao histórico
        const history = this._channelHistory.get(channel) || [];
        history.push({
          timestamp: new Date(),
          networkCount: count,
          averageSignal: avgSignal,
          congestionScore: congestionScore
        });
        
        // Limitar histórico
        if (history.length > 100) {
          history.shift();
        }
        
        this._channelHistory.set(channel, history);
        
        // Emitir evento se congestionamento mudou significativamente
        this.emit('channel-congestion-changed', channel, congestionScore);
      }
    }

    _calculateCongestionScore(networkCount, averageSignal) {
      // Algoritmo simples de score de congestionamento
      // Considera número de redes e força média do sinal
      const networkScore = Math.min(networkCount / 10, 1.0); // Normalizado para 10 redes
      const signalScore = Math.min((averageSignal + 100) / 100, 1.0); // Normalizado para -100 a 0 dBm
      
      return (networkScore * 0.7 + signalScore * 0.3); // Peso maior para número de redes
    }

    _detectSpectrumInterference(networks) {
      // Detectar padrões que podem indicar interferência
      const frequencyMap = new Map();
      
      for (const network of networks) {
        const freq = network.frequency;
        if (!frequencyMap.has(freq)) {
          frequencyMap.set(freq, []);
        }
        frequencyMap.get(freq).push(network);
      }

      // Procurar por frequências com muitas redes próximas
      for (const [frequency, networksOnFreq] of frequencyMap) {
        if (networksOnFreq.length >= 3) {
          const avgSignal = networksOnFreq.reduce((sum, net) => sum + net.signal, 0) / networksOnFreq.length;
          
          if (avgSignal > -60) { // Sinais muito fortes podem indicar interferência
            this.emit('spectrum-interference-detected', 
              `High interference on ${frequency} MHz`, frequency);
          }
        }
      }
    }

    getHuntTargets() {
      return Array.from(this._huntTargets.values());
    }

    getChannelAnalysis(channel) {
      const history = this._channelHistory.get(channel) || [];
      if (history.length === 0) {
        return {
          channel: channel,
          currentCongestion: 0,
          averageCongestion: 0,
          networkCount: 0,
          recommendation: 'no-data'
        };
      }

      const recent = history.slice(-10); // Últimas 10 medições
      const avgCongestion = recent.reduce((sum, entry) => sum + entry.congestionScore, 0) / recent.length;
      const currentEntry = history[history.length - 1];
      
      let recommendation = 'good';
      if (avgCongestion > 0.7) recommendation = 'poor';
      else if (avgCongestion > 0.4) recommendation = 'fair';
      
      return {
        channel: channel,
        currentCongestion: Math.round(currentEntry.congestionScore * 100) / 100,
        averageCongestion: Math.round(avgCongestion * 100) / 100,
        networkCount: currentEntry.networkCount,
        recommendation: recommendation
      };
    }

    exportHuntData(format = 'json') {
      const exportData = {
        timestamp: new Date().toISOString(),
        huntMode: this._huntMode,
        targets: []
      };

      for (const target of this._huntTargets.values()) {
        const targetData = {
          bssid: target.bssid,
          ssid: target.ssid,
          strongestSignal: target.strongestSignal,
          lastSeen: target.lastSeen.toISOString(),
          dataPoints: target.history.length,
          statistics: target.getSignalStatistics(),
          trend: target.getRecentSignalTrend()
        };

        if (target.strongestLocation.isValid) {
          targetData.strongestLocation = {
            latitude: target.strongestLocation.latitude,
            longitude: target.strongestLocation.longitude,
            accuracy: target.strongestLocation.accuracy
          };
        }

        exportData.targets.push(targetData);
      }

      if (format === 'json') {
        return JSON.stringify(exportData, null, 2);
      } else if (format === 'csv') {
        return this._exportToCSV(exportData);
      }
      
      return exportData;
    }

    _exportToCSV(data) {
      const headers = [
        'BSSID', 'SSID', 'Strongest Signal (dBm)', 'Last Seen', 
        'Data Points', 'Avg Signal', 'Signal Trend', 'Latitude', 'Longitude'
      ];
      
      let csv = headers.join(',') + '\n';
      
      for (const target of data.targets) {
        const row = [
          target.bssid,
          target.ssid || 'Hidden',
          target.strongestSignal,
          target.lastSeen,
          target.dataPoints,
          target.statistics.average,
          target.trend,
          target.strongestLocation?.latitude || '',
          target.strongestLocation?.longitude || ''
        ];
        
        csv += row.map(field => `"${field}"`).join(',') + '\n';
      }
      
      return csv;
    }
  }
);
