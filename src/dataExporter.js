// dataExporter.js - Data export/import system compatible with Sparrow-wifi

const { GObject, Gio, GLib } = imports.gi;

var DataExporter = GObject.registerClass(
  {
    GTypeName: "DataExporter",
  },
  class DataExporter extends GObject.Object {
    _init(params = {}) {
      super._init(params);
      this._supportedFormats = ['json', 'csv', 'sparrow-json'];
    }

    // Exportar dados de redes WiFi
    exportNetworks(networks, format = 'json', includeGPS = true) {
      switch (format.toLowerCase()) {
        case 'json':
          return this._exportNetworksJSON(networks, includeGPS);
        case 'csv':
          return this._exportNetworksCSV(networks, includeGPS);
        case 'sparrow-json':
          return this._exportSparrowFormat(networks, includeGPS);
        default:
          throw new Error(`Formato não suportado: ${format}`);
      }
    }

    _exportNetworksJSON(networks, includeGPS) {
      const exportData = {
        version: "1.0",
        application: "WiFi Analyzer",
        timestamp: new Date().toISOString(),
        totalNetworks: networks.length,
        includesGPS: includeGPS,
        networks: []
      };

      for (const network of networks) {
        const networkData = {
          ssid: network.ssid || "",
          bssid: network.bssid,
          frequency: network.frequency,
          channel: network.channel,
          signal: network.signal,
          security: network.security,
          timestamp: new Date().toISOString()
        };

        if (includeGPS && network.gps && network.gps.isValid) {
          networkData.gps = {
            latitude: network.gps.latitude,
            longitude: network.gps.longitude,
            altitude: network.gps.altitude,
            accuracy: network.gps.accuracy
          };
        }

        exportData.networks.push(networkData);
      }

      return JSON.stringify(exportData, null, 2);
    }

    _exportNetworksCSV(networks, includeGPS) {
      const headers = [
        'SSID', 'BSSID', 'Frequency (MHz)', 'Channel', 'Signal (dBm)', 
        'Security', 'Timestamp'
      ];

      if (includeGPS) {
        headers.push('Latitude', 'Longitude', 'Altitude', 'GPS Accuracy');
      }

      let csv = headers.join(',') + '\n';

      for (const network of networks) {
        const row = [
          network.ssid || 'Hidden',
          network.bssid,
          network.frequency,
          network.channel,
          network.signal,
          network.security,
          new Date().toISOString()
        ];

        if (includeGPS) {
          if (network.gps && network.gps.isValid) {
            row.push(
              network.gps.latitude,
              network.gps.longitude,
              network.gps.altitude,
              network.gps.accuracy
            );
          } else {
            row.push('', '', '', '');
          }
        }

        csv += row.map(field => `"${field}"`).join(',') + '\n';
      }

      return csv;
    }

    _exportSparrowFormat(networks, includeGPS) {
      // Formato compatível com Sparrow-wifi
      const sparrowData = {
        type: "sparrow-wifi-export",
        version: "2.0",
        timestamp: new Date().toISOString(),
        scan_type: "wifi",
        data: []
      };

      for (const network of networks) {
        const sparrowNetwork = {
          type: "wifi",
          ssid: network.ssid || "",
          macAddr: network.bssid,
          frequency: network.frequency,
          channel: network.channel,
          rssi: network.signal,
          security: network.security,
          firstSeen: new Date().toISOString(),
          lastSeen: new Date().toISOString()
        };

        if (includeGPS && network.gps && network.gps.isValid) {
          sparrowNetwork.lat = network.gps.latitude.toString();
          sparrowNetwork.lon = network.gps.longitude.toString();
          sparrowNetwork.alt = network.gps.altitude.toString();
          sparrowNetwork.gpsvalid = "true";
        } else {
          sparrowNetwork.lat = "0.0";
          sparrowNetwork.lon = "0.0";
          sparrowNetwork.alt = "0.0";
          sparrowNetwork.gpsvalid = "false";
        }

        sparrowData.data.push(sparrowNetwork);
      }

      return JSON.stringify(sparrowData, null, 2);
    }

    // Importar dados de scan do iw dev
    importIwScanData(iwOutput) {
      const networks = [];
      const bssBlocks = iwOutput.split('BSS ').slice(1); // Remove primeiro elemento vazio

      for (const block of bssBlocks) {
        try {
          const network = this._parseIwBlock(block);
          if (network) {
            networks.push(network);
          }
        } catch (error) {
          print(`Erro ao parsear bloco iw: ${error.message}`);
        }
      }

      return networks;
    }

    _parseIwBlock(block) {
      const lines = block.split('\n');
      const network = {
        bssid: '',
        ssid: '',
        frequency: 0,
        channel: 0,
        signal: -100,
        security: 'Open'
      };

      // Primeira linha contém BSSID
      const bssidMatch = lines[0].match(/([0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2}:[0-9a-f]{2})/i);
      if (bssidMatch) {
        network.bssid = bssidMatch[1].toUpperCase();
      }

      for (const line of lines) {
        const trimmed = line.trim();

        // SSID
        const ssidMatch = trimmed.match(/SSID:\s*(.+)/);
        if (ssidMatch) {
          network.ssid = ssidMatch[1];
        }

        // Frequência
        const freqMatch = trimmed.match(/freq:\s*(\d+)/);
        if (freqMatch) {
          network.frequency = parseInt(freqMatch[1]);
          network.channel = this._frequencyToChannel(network.frequency);
        }

        // Sinal
        const signalMatch = trimmed.match(/signal:\s*([-\d.]+)\s*dBm/);
        if (signalMatch) {
          network.signal = parseFloat(signalMatch[1]);
        }

        // Segurança
        if (trimmed.includes('Privacy')) {
          network.security = 'WEP';
        } else if (trimmed.includes('WPA')) {
          if (trimmed.includes('WPA2')) {
            network.security = 'WPA2';
          } else {
            network.security = 'WPA';
          }
        }
      }

      return network.bssid ? network : null;
    }

    _frequencyToChannel(frequency) {
      // Converter frequência para canal WiFi
      if (frequency >= 2412 && frequency <= 2484) {
        // 2.4 GHz
        if (frequency === 2484) return 14;
        return Math.floor((frequency - 2412) / 5) + 1;
      } else if (frequency >= 5170 && frequency <= 5825) {
        // 5 GHz
        return Math.floor((frequency - 5000) / 5);
      }
      return 0;
    }

    // Salvar dados em arquivo
    async saveToFile(data, filename, format = 'json') {
      try {
        const file = Gio.File.new_for_path(filename);
        const outputStream = file.create(Gio.FileCreateFlags.REPLACE_DESTINATION, null);
        const dataStream = Gio.DataOutputStream.new(outputStream);

        if (format === 'json' || format === 'sparrow-json') {
          dataStream.put_string(data, null);
        } else {
          dataStream.put_string(data, null);
        }

        dataStream.close(null);
        return true;
      } catch (error) {
        print(`Erro ao salvar arquivo: ${error.message}`);
        return false;
      }
    }

    // Carregar dados de arquivo
    async loadFromFile(filename) {
      try {
        const file = Gio.File.new_for_path(filename);
        const [success, contents] = file.load_contents(null);
        
        if (success) {
          const decoder = new TextDecoder('utf-8');
          const content = decoder.decode(contents);
          
          // Tentar determinar o formato
          if (content.trim().startsWith('{')) {
            return JSON.parse(content);
          } else if (content.includes('BSS ')) {
            // Formato iw scan
            return this.importIwScanData(content);
          } else {
            // Assumir CSV
            return this._parseCSV(content);
          }
        }
        
        return null;
      } catch (error) {
        print(`Erro ao carregar arquivo: ${error.message}`);
        return null;
      }
    }

    _parseCSV(csvData) {
      const lines = csvData.split('\n').filter(line => line.trim());
      if (lines.length < 2) return [];

      const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
      const networks = [];

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.replace(/"/g, '').trim());
        if (values.length !== headers.length) continue;

        const network = {};
        for (let j = 0; j < headers.length; j++) {
          const header = headers[j].toLowerCase();
          if (header.includes('ssid')) network.ssid = values[j];
          else if (header.includes('bssid')) network.bssid = values[j];
          else if (header.includes('frequency')) network.frequency = parseInt(values[j]) || 0;
          else if (header.includes('channel')) network.channel = parseInt(values[j]) || 0;
          else if (header.includes('signal')) network.signal = parseFloat(values[j]) || -100;
          else if (header.includes('security')) network.security = values[j];
        }

        if (network.bssid) {
          networks.push(network);
        }
      }

      return networks;
    }

    // Gerar relatório de análise
    generateAnalysisReport(networks, channelAnalysis = null, huntData = null) {
      const report = {
        summary: this._generateSummary(networks),
        channelDistribution: this._analyzeChannelDistribution(networks),
        securityAnalysis: this._analyzeSecurityTypes(networks),
        signalStrengthAnalysis: this._analyzeSignalStrength(networks)
      };

      if (channelAnalysis) {
        report.channelCongestion = channelAnalysis;
      }

      if (huntData) {
        report.huntTargets = huntData;
      }

      return report;
    }

    _generateSummary(networks) {
      const uniqueSSIDs = new Set(networks.filter(n => n.ssid).map(n => n.ssid));
      
      return {
        totalNetworks: networks.length,
        uniqueSSIDs: uniqueSSIDs.size,
        hiddenNetworks: networks.filter(n => !n.ssid || n.ssid === '').length,
        avgSignalStrength: networks.reduce((sum, n) => sum + n.signal, 0) / networks.length,
        frequencyBands: {
          '2.4GHz': networks.filter(n => n.frequency >= 2400 && n.frequency <= 2500).length,
          '5GHz': networks.filter(n => n.frequency >= 5000 && n.frequency <= 6000).length
        }
      };
    }

    _analyzeChannelDistribution(networks) {
      const channelCounts = {};
      for (const network of networks) {
        channelCounts[network.channel] = (channelCounts[network.channel] || 0) + 1;
      }
      return channelCounts;
    }

    _analyzeSecurityTypes(networks) {
      const securityCounts = {};
      for (const network of networks) {
        const security = network.security || 'Unknown';
        securityCounts[security] = (securityCounts[security] || 0) + 1;
      }
      return securityCounts;
    }

    _analyzeSignalStrength(networks) {
      const ranges = {
        'Excellent (-30 to -50 dBm)': 0,
        'Good (-50 to -60 dBm)': 0,
        'Fair (-60 to -70 dBm)': 0,
        'Weak (-70 to -80 dBm)': 0,
        'Very Weak (-80+ dBm)': 0
      };

      for (const network of networks) {
        const signal = network.signal;
        if (signal >= -50) ranges['Excellent (-30 to -50 dBm)']++;
        else if (signal >= -60) ranges['Good (-50 to -60 dBm)']++;
        else if (signal >= -70) ranges['Fair (-60 to -70 dBm)']++;
        else if (signal >= -80) ranges['Weak (-70 to -80 dBm)']++;
        else ranges['Very Weak (-80+ dBm)']++;
      }

      return ranges;
    }

    getSupportedFormats() {
      return [...this._supportedFormats];
    }
  }
);
