const { GObject, Gio, GLib } = imports.gi;
const { GPSManager } = imports.gpsManager;
const { AdvancedNetworkAnalyzer } = imports.advancedNetworkAnalyzer;
const { DataExporter } = imports.dataExporter;

const APP_ID = "com.example.WifiAnalyzer";
const SIGNAL_DROP_THRESHOLD = 20;
const NOTIFICATION_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutos
const INITIAL_SILENCE_MS = 20 * 1000; // período sem notificações após start
const DISABLE_NET_NOTIFICATIONS = GLib.getenv("WIFI_ANALYZER_NO_NOTIF") === "1";
let ENV_DEV_MODE = GLib.getenv("WIFI_ANALYZER_DEV") === "1";
let ENV_DEBUG = GLib.getenv("WIFI_ANALYZER_DEBUG") === "1";

var NetworkManager = GObject.registerClass(
  { 
    GTypeName: "NetworkManager", 
    Signals: { 
      "networks-updated": { param_types: [GObject.TYPE_JSOBJECT] }, 
      "scan-started": {},
      "hunt-mode-changed": { param_types: [GObject.TYPE_BOOLEAN] },
      "export-completed": { param_types: [GObject.TYPE_STRING] }
    } 
  },
  class NetworkManager extends GObject.Object {
    _init(params = {}) {
      super._init();
      this._application = params.application || null;
      this.settings = new Gio.Settings({ schema_id: APP_ID });
      this._networks = [];
      this._scanning = false;
      this._monitoringInterval = null;
      this._networkHistory = new Map();
      this._notificationCooldowns = new Map();
      this._warnedNoNmcli = false;

      // Novos componentes avançados
      this._gpsManager = new GPSManager();
      this._advancedAnalyzer = new AdvancedNetworkAnalyzer();
      this._dataExporter = new DataExporter();
      
      // Configurar integração GPS com analyzer
      this._advancedAnalyzer.setGPSManager(this._gpsManager);
      
      // Debug / Dev via GSettings (env tem precedência)
      this._devMode = ENV_DEV_MODE || this.settings.get_boolean("enable-dev-mode");
      this._debug = ENV_DEBUG || this.settings.get_boolean("enable-debug-logging");
      this.settings.connect("changed::enable-dev-mode", () => { if (!ENV_DEV_MODE) { this._devMode = this.settings.get_boolean("enable-dev-mode"); } });
      this.settings.connect("changed::enable-debug-logging", () => { if (!ENV_DEBUG) { this._debug = this.settings.get_boolean("enable-debug-logging"); } });
      
      // Estado D-Bus
      this._nmProxy = null;
      this._deviceProxies = [];
      this._dbusReady = false;
      this._initializingDbus = !this._devMode;
      this._startedAt = Date.now();
      this._notificationsDisabled = DISABLE_NET_NOTIFICATIONS || !this.settings.get_boolean("enable-notifications");
      this.settings.connect("changed::enable-notifications", () => { this._notificationsDisabled = DISABLE_NET_NOTIFICATIONS || !this.settings.get_boolean("enable-notifications"); });
      
      // Conectar sinais do analyzer avançado
      this._advancedAnalyzer.connect('hunt-target-updated', (source, target) => {
        this._log(`Hunt target updated: ${target.ssid || target.bssid} - Signal: ${target.strongestSignal}dBm`);
      });
      
      this._advancedAnalyzer.connect('spectrum-interference-detected', (source, message, frequency) => {
        this._log(`Spectrum interference: ${message}`);
      });
      
      if (!this._devMode) this._initDbus();
    }

    _log(...args) { if (this._debug) print("[NetworkManager]", ...args); }

    // Inicialização D-Bus NetworkManager
    async _initDbus() {
      try {
        this._nmProxy = await this._newProxy("org.freedesktop.NetworkManager", "/org/freedesktop/NetworkManager", "org.freedesktop.NetworkManager");
        await this._loadWirelessDevices();
        this._dbusReady = this._deviceProxies.length > 0;
        if (!this._dbusReady) print("Nenhum dispositivo Wi-Fi encontrado via D-Bus. Esperando alguns segundos antes de fallback...");
      } catch (e) {
        print("Falha D-Bus NetworkManager:", e.message);
        this._dbusReady = false;
      } finally {
        this._initializingDbus = false;
        // dispara um scan inicial assim que finalizar init (sucesso ou não)
        this.scanNetworks();
      }
    }

    _newProxy(name, path, iface) {
      return new Promise((resolve, reject) => {
        Gio.DBusProxy.new(
          Gio.bus_get_sync(Gio.BusType.SYSTEM, null),
            Gio.DBusProxyFlags.NONE,
            null,
            name,
            path,
            iface,
            null,
            (obj, res) => {
              try {
                const proxy = Gio.DBusProxy.new_finish(res);
                // Força carregar propriedades cacheadas (algumas flags evitam preload)
                try { proxy.init_sync(null); } catch (e) { /* ignora */ }
                resolve(proxy);
              } catch (e) {
                reject(e);
              }
            }
        );
      });
    }

    async _loadWirelessDevices() {
      try {
        const res = this._nmProxy.call_sync("GetDevices", null, Gio.DBusCallFlags.NONE, -1, null);
        const paths = res.get_child_value(0).unpack();
        this._log("Devices retornados:", paths.map(p => p.unpack ? p.unpack() : String(p)).join(", "));
        for (const p of paths) {
          let pathStr = p.unpack ? p.unpack() : String(p);
          try {
            const devProxy = await this._newProxy("org.freedesktop.NetworkManager", pathStr, "org.freedesktop.NetworkManager.Device");
            let typeVar = devProxy.get_cached_property("DeviceType");
            if (!typeVar) {
              // fallback via Properties.Get
              try {
                const reply = devProxy.call_sync("org.freedesktop.DBus.Properties.Get", new GLib.Variant("(ss)", ["org.freedesktop.NetworkManager.Device", "DeviceType"]), Gio.DBusCallFlags.NONE, -1, null);
                typeVar = reply.get_child_value(0);
              } catch (e) { this._log("Falha Properties.Get DeviceType", e.message); }
            }
            let dtype = null;
            if (typeVar) {
              try { dtype = typeVar.unpack(); } catch (e) { }
            }
            this._log("Device", pathStr, "DeviceType=", dtype);
            if (dtype === 2) { // WIFI
              try {
                const wifiProxy = await this._newProxy("org.freedesktop.NetworkManager", pathStr, "org.freedesktop.NetworkManager.Device.Wireless");
                this._deviceProxies.push(wifiProxy);
                this._log("Adicionado dispositivo Wi-Fi", pathStr);
              } catch (e) { this._log("Falha criar proxy wireless", pathStr, e.message); }
            }
          } catch (e) { this._log("Ignorando device", pathStr, e.message); }
        }
        this._log("Total Wi-Fi devices:", this._deviceProxies.length);
      } catch (e) {
        print("Erro ao carregar devices:", e.message);
      }
    }

    async _loadAccessPoints(deviceProxy) {
      try {
        const result = deviceProxy.call_sync("GetAccessPoints", null, Gio.DBusCallFlags.NONE, -1, null);
        const apPaths = result.get_child_value(0).unpack();
        this._log("AP paths encontrados:", apPaths.length);
        const networks = [];
        for (const apP of apPaths) {
          const apPath = apP && apP.unpack ? apP.unpack() : apP; // FIX: desempacotar objectpath
          try {
            const apProxy = await this._newProxy("org.freedesktop.NetworkManager", apPath, "org.freedesktop.NetworkManager.AccessPoint");
            const fetchProp = (name) => {
              let v = apProxy.get_cached_property(name);
              if (!v) {
                try {
                  const reply = apProxy.call_sync("org.freedesktop.DBus.Properties.Get", new GLib.Variant("(ss)", ["org.freedesktop.NetworkManager.AccessPoint", name]), Gio.DBusCallFlags.NONE, -1, null);
                  v = reply.get_child_value(0);
                } catch (e) { /* ignore */ }
              }
              return v;
            };
            const ssidBytes = fetchProp("Ssid");
            const strength = fetchProp("Strength");
            const frequency = fetchProp("Frequency");
            const hwAddress = fetchProp("HwAddress");
            const flags = fetchProp("Flags");
            const wpaFlags = fetchProp("WpaFlags");
            const rsnFlags = fetchProp("RsnFlags");
            let ssid = null; if (ssidBytes) { try { const bytes = ssidBytes.unpack(); ssid = new TextDecoder().decode(new Uint8Array(bytes)); } catch (e) {} }
            if (!ssid || ssid.length === 0) ssid = "<oculto>";
            let security = "Open";
            try { if (rsnFlags && rsnFlags.unpack() !== 0) security = "WPA3/WPA2"; else if (wpaFlags && wpaFlags.unpack() !== 0) security = "WPA2"; else if (flags && (flags.unpack() & 0x1)) security = "WEP"; } catch (e) {}
            let channel = 0; try { if (frequency) { const freq = frequency.unpack(); if (freq >= 2412 && freq <= 2484) channel = Math.floor((freq - 2412) / 5) + 1; else if (freq >= 5170 && freq <= 5825) channel = Math.floor((freq - 5000) / 5); } } catch (e) {}
            const netObj = { ssid, bssid: hwAddress ? hwAddress.unpack() : "Unknown", signal: strength ? strength.unpack() : 0, frequency: frequency ? frequency.unpack() : 0, channel, security, path: apPath };
            networks.push(netObj);
            this._log("AP coletado:", ssid, apPath);
          } catch (e) { this._log("Falha AP", apPath, e.message); }
        }
        this._log("APs coletados:", networks.length);
        return networks;
      } catch (e) {
        print("Erro APs:", e.message); return [];
      }
    }

    async scanNetworks() {
      if (this._scanning) return; this._scanning = true; this.emit("scan-started");
      if (this._devMode) { this._generateMockNetworks(); this._scanning = false; return; }
      if (this._initializingDbus) { GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => { this._scanning = false; this.scanNetworks(); return GLib.SOURCE_REMOVE; }); return; }
      if (this._dbusReady && this._deviceProxies.length > 0) {
        try {
          for (const dev of this._deviceProxies) { try { dev.call("RequestScan", new GLib.Variant("(a{sv})", [{}]), Gio.DBusCallFlags.NONE, -1, null, null); } catch (e) { } }
          GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2500, () => { this._collectDbusNetworks(true); this._scanning = false; return GLib.SOURCE_REMOVE; });
        } catch (e) { print("Erro scan D-Bus:", e.message); this._scanning = false; }
        return; }
      // fallback nmcli
      if (GLib.find_program_in_path("nmcli")) {
        try {
          let proc = Gio.Subprocess.new(["nmcli", "-t", "-f", "SSID,SIGNAL,SECURITY,FREQ,BSSID", "dev", "wifi", "list", "--rescan", "yes"], Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE);
          proc.communicate_utf8_async(null, null, (p, res) => {
            try { let [, stdout, stderr] = p.communicate_utf8_finish(res); if (p.get_successful()) this._parseAndProcessNetworks(stdout); else { console.error("Falha nmcli:", stderr.trim()); } }
            catch (e) { console.error("Erro nmcli:", e); }
            finally { if (this._networks.length === 0) this._generateMockNetworks(); this._scanning = false; }
          });
        } catch (e) { console.error("Erro iniciar nmcli:", e); if (this._networks.length === 0) this._generateMockNetworks(); this._scanning = false; }
      } else {
        if (!this._warnedNoNmcli) { print("Sem D-Bus ou nmcli utilizáveis. Usando mock."); this._warnedNoNmcli = true; }
        if (this._networks.length === 0) this._generateMockNetworks();
        this._scanning = false;
      }
    }

    async _collectDbusNetworks(fromActiveScan=false) {
      const all = [];
      for (const dev of this._deviceProxies) { const nets = await this._loadAccessPoints(dev); all.push(...nets); }
      const simplified = all.map(n => ({ ssid: n.ssid, bssid: n.bssid, signal: n.signal, security: n.security, frequency: n.frequency, channel: n.channel }));
      this._log("Total redes D-Bus:", simplified.length, "(scan ativo=", fromActiveScan, ")");
      // Fallback adicional: se nenhum AP e nmcli disponível, tenta nmcli uma vez
      if (simplified.length === 0 && GLib.find_program_in_path("nmcli")) {
        this._log("Zero redes via D-Bus, tentando nmcli fallback imediato.");
        try {
          let proc = Gio.Subprocess.new(["nmcli", "-t", "-f", "SSID,SIGNAL,SECURITY,FREQ,BSSID", "dev", "wifi", "list"], Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE);
          proc.communicate_utf8_async(null, null, (p, res) => {
            try { let [, stdout, stderr] = p.communicate_utf8_finish(res); if (p.get_successful()) { this._parseAndProcessNetworks(stdout); } else { this._log("Fallback nmcli falhou:", stderr.trim()); this._processChanges([]); this._networks = []; this.emit("networks-updated", this._networks); } }
            catch (e) { this._log("Erro fallback nmcli:", e.message); }
          });
        } catch (e) { this._log("Erro iniciar fallback nmcli:", e.message); }
        return;
      }
      this._processChanges(simplified);
      this._networks = simplified;
      this.emit("networks-updated", this._networks);
    }

    _parseAndProcessNetworks(output) {
      const newNetworks = [];
      const lines = output.trim().split("\n");

      for (let line of lines) {
        if (!line.trim() || line.startsWith("--")) continue;
        const parts = line.split(":");
        if (parts.length >= 5) {
          const ssid = parts[0].trim().replace(/\\:/g, ":");
          const signal = parseInt(parts[1], 10) || 0;
          const security = parts[2].trim() || "Open";
          const freq = parseInt(parts[3], 10) || 0;
          const bssid = parts[4].trim();

          if (ssid) {
            newNetworks.push({
              ssid: ssid,
              bssid: bssid,
              signal: signal,
              security: security,
              frequency: freq,
              channel: this._frequencyToChannel(freq),
            });
          }
        }
      }

      this._processChanges(newNetworks);
      this._networks = newNetworks;
      this.emit("networks-updated", this._networks);
    }

    _processChanges(newNetworks) {
      const currentSsids = new Set(newNetworks.map((n) => n.ssid));
      const previousSsids = new Set(this._networkHistory.keys());

      for (const ssid of previousSsids) {
        if (!currentSsids.has(ssid)) {
          this._sendNotification(
            `net-disappeared-${ssid}`,
            "Rede Desapareceu",
            `A rede "${ssid}" não está mais visível.`
          );
          this._networkHistory.delete(ssid);
        }
      }

      for (const network of newNetworks) {
        const ssid = network.ssid;
        const history = this._networkHistory.get(ssid);
        if (!history) {
          this._sendNotification(
            `net-new-${ssid}`,
            "Nova Rede Detectada",
            `A rede "${ssid}" apareceu com sinal de ${network.signal}%.`
          );
        } else if (history.signal - network.signal > SIGNAL_DROP_THRESHOLD) {
          this._sendNotification(
            `net-signal-drop-${ssid}`,
            "Alerta de Sinal Fraco",
            `O sinal da rede "${ssid}" caiu de ${history.signal}% para ${network.signal}%.`
          );
        }
        this._networkHistory.set(ssid, { signal: network.signal });
      }
    }

    _sendNotification(id, title, body) {
      if (!this._application) return;
      if (this._notificationsDisabled) return;
      const now = Date.now();
      if (now - this._startedAt < INITIAL_SILENCE_MS) return; // silêncio inicial
      // janela rotativa de 60s máx 5 notificações
      if (now - this._notifWindowStart > 60000) { this._notifWindowStart = now; this._notificationsPerWindow = 0; }
      if (this._notificationsPerWindow >= 5) return;
      const lastNotificationTime = this._notificationCooldowns.get(id);
      if (lastNotificationTime && now - lastNotificationTime < NOTIFICATION_COOLDOWN_MS) return;
      const notification = new Gio.Notification();
      notification.set_title(title);
      notification.set_body(body);
      notification.set_default_action("app.activate");
      this._application.send_notification(id, notification);
      this._notificationCooldowns.set(id, now);
      this._notificationsPerWindow++;
    }

    _generateMockNetworks() {
      const mockNetworks = [
        {
          ssid: "Casa_WiFi",
          bssid: "AA:BB:CC:DD:EE:FF",
          signal: 85,
          security: "WPA2",
          frequency: 2412,
          channel: 1,
        },
        {
          ssid: "Vizinho_5G",
          bssid: "11:22:33:44:55:66",
          signal: 72,
          security: "WPA3",
          frequency: 5180,
          channel: 36,
        },
        {
          ssid: "Café_Livre",
          bssid: "99:88:77:66:55:44",
          signal: 45,
          security: "Open",
          frequency: 2437,
          channel: 6,
        },
        {
          ssid: "Escritório",
          bssid: "AA:11:BB:22:CC:33",
          signal: 60,
          security: "WPA2",
          frequency: 2462,
          channel: 11,
        },
        {
          ssid: "Hotel_Guest",
          bssid: "FF:EE:DD:CC:BB:AA",
          signal: 30,
          security: "WPA2",
          frequency: 5200,
          channel: 40,
        },
      ];

      this._processChanges(mockNetworks);
      this._networks = mockNetworks;
      
      // Adicionar coordenadas GPS aos dados se disponível
      if (this._gpsManager.isValid()) {
        const currentGPS = this._gpsManager.getCurrentLocation();
        for (const network of this._networks) {
          network.gps = currentGPS;
        }
      }
      
      // Atualizar analyzer avançado
      this._advancedAnalyzer.updateNetworkData(this._networks);
      
      this.emit("networks-updated", this._networks);
    }

    // ===== MÉTODOS AVANÇADOS =====
    
    // GPS Management
    enableGPS() {
      this._gpsManager.enable();
      this._log("GPS enabled");
    }

    disableGPS() {
      this._gpsManager.disable();
      this._log("GPS disabled");
    }

    isGPSEnabled() {
      return this._gpsManager.isEnabled();
    }

    getCurrentLocation() {
      return this._gpsManager.getCurrentLocation();
    }

    // Hunt Mode
    enableHuntMode() {
      this._advancedAnalyzer.enableHuntMode();
      
      // Aumentar frequência de scan
      if (this._monitoringInterval) {
        GLib.source_remove(this._monitoringInterval);
        this._monitoringInterval = GLib.timeout_add(
          GLib.PRIORITY_DEFAULT,
          this._advancedAnalyzer.getUpdateInterval(),
          () => {
            this.scanNetworks();
            return GLib.SOURCE_CONTINUE;
          }
        );
      }
      
      this.emit('hunt-mode-changed', true);
      this._log("Hunt mode enabled - High frequency scanning activated");
    }

    disableHuntMode() {
      this._advancedAnalyzer.disableHuntMode();
      
      // Voltar à frequência normal
      if (this._monitoringInterval) {
        GLib.source_remove(this._monitoringInterval);
        this._monitoringInterval = GLib.timeout_add(
          GLib.PRIORITY_DEFAULT,
          this._advancedAnalyzer.getUpdateInterval(),
          () => {
            this.scanNetworks();
            return GLib.SOURCE_CONTINUE;
          }
        );
      }
      
      this.emit('hunt-mode-changed', false);
      this._log("Hunt mode disabled - Normal scanning resumed");
    }

    isHuntModeEnabled() {
      return this._advancedAnalyzer.isHuntModeEnabled();
    }

    addHuntTarget(bssid, ssid = "") {
      return this._advancedAnalyzer.addHuntTarget(bssid, ssid);
    }

    removeHuntTarget(bssid) {
      this._advancedAnalyzer.removeHuntTarget(bssid);
    }

    getHuntTargets() {
      return this._advancedAnalyzer.getHuntTargets();
    }

    isHuntTarget(bssid) {
      const targets = this._advancedAnalyzer.getHuntTargets();
      return targets.some(target => target.bssid === bssid);
    }

    // Data Export/Import
    async exportData(format = 'json', filename = null, includeGPS = true) {
      try {
        const data = this._dataExporter.exportNetworks(this._networks, format, includeGPS);
        
        if (filename) {
          const success = await this._dataExporter.saveToFile(data, filename, format);
          if (success) {
            this.emit('export-completed', filename);
            this._log(`Data exported to ${filename}`);
            return { success: true, filename: filename };
          } else {
            return { success: false, error: "Failed to save file" };
          }
        } else {
          return { success: true, data: data };
        }
      } catch (error) {
        this._log(`Export failed: ${error.message}`);
        return { success: false, error: error.message };
      }
    }

    async importData(filename) {
      try {
        const data = await this._dataExporter.loadFromFile(filename);
        if (data) {
          this._log(`Data imported from ${filename}`);
          return { success: true, data: data };
        } else {
          return { success: false, error: "Failed to load file" };
        }
      } catch (error) {
        this._log(`Import failed: ${error.message}`);
        return { success: false, error: error.message };
      }
    }

    // Channel Analysis
    getChannelAnalysis(channel) {
      return this._advancedAnalyzer.getChannelAnalysis(channel);
    }

    getAllChannelsAnalysis() {
      const analysis = {};
      for (let channel = 1; channel <= 14; channel++) {
        analysis[channel] = this.getChannelAnalysis(channel);
      }
      return analysis;
    }

    // Advanced Reports
    generateAdvancedReport() {
      const huntData = this.getHuntTargets().map(target => ({
        bssid: target.bssid,
        ssid: target.ssid,
        strongestSignal: target.strongestSignal,
        dataPoints: target.history.length,
        statistics: target.getSignalStatistics(),
        trend: target.getRecentSignalTrend()
      }));

      const channelAnalysis = this.getAllChannelsAnalysis();
      
      return this._dataExporter.generateAnalysisReport(
        this._networks, 
        channelAnalysis, 
        huntData
      );
    }

    // Export hunt data specifically
    exportHuntData(format = 'json') {
      return this._advancedAnalyzer.exportHuntData(format);
    }

    _frequencyToChannel(frequency) {
      if (frequency >= 2412 && frequency <= 2484) {
        if (frequency === 2484) return 14;
        return Math.floor((frequency - 2407) / 5);
      } else if (frequency >= 5170 && frequency <= 5825) {
        return Math.floor((frequency - 5000) / 5);
      }
      return 0;
    }

    getNetworks() {
      return this._networks;
    }

    startRealTimeMonitoring() {
      const intervalSeconds = this.settings.get_int("refresh-interval");
      if (this._monitoringInterval) this.stopRealTimeMonitoring();
      // adia primeiro scan se D-Bus ainda inicializando
      if (this._initializingDbus) {
        GLib.timeout_add(GLib.PRIORITY_DEFAULT, 600, () => { this.scanNetworks(); return GLib.SOURCE_REMOVE; });
      } else {
        this.scanNetworks();
      }
      this._monitoringInterval = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, intervalSeconds, () => { this.scanNetworks(); return GLib.SOURCE_CONTINUE; });
    }

    stopRealTimeMonitoring() {
      if (this._monitoringInterval) {
        GLib.source_remove(this._monitoringInterval);
        this._monitoringInterval = null;
      }
    }

    async getCurrentNetworkInfo() {
      try {
        // Obter informações da rede conectada via nmcli
        const [, stdout] = GLib.spawn_command_line_sync("nmcli -t -f NAME,TYPE,DEVICE connection show --active");
        const activeConnections = new TextDecoder().decode(stdout).trim().split('\n');
        
        let wifiConnection = null;
        for (const line of activeConnections) {
          const [name, type, device] = line.split(':');
          if (type === '802-11-wireless') {
            wifiConnection = { name, device };
            break;
          }
        }

        if (!wifiConnection) {
          return null;
        }

        // Obter detalhes da conexão ativa
        const [, detailsStdout] = GLib.spawn_command_line_sync(`nmcli -t -f IP4.ADDRESS,IP4.GATEWAY,IP4.DNS connection show "${wifiConnection.name}"`);
        const details = new TextDecoder().decode(detailsStdout).trim();
        
        const networkInfo = {
          ssid: wifiConnection.name,
          device: wifiConnection.device,
          ipAddress: null,
          gateway: null,
          dns: [],
        };

        details.split('\n').forEach(line => {
          const [key, value] = line.split(':');
          if (key === 'IP4.ADDRESS' && value) {
            networkInfo.ipAddress = value.split('/')[0]; // Remove a máscara de rede
          } else if (key === 'IP4.GATEWAY' && value) {
            networkInfo.gateway = value;
          } else if (key === 'IP4.DNS' && value) {
            networkInfo.dns.push(value);
          }
        });

        return networkInfo;
      } catch (error) {
        this._log("Erro ao obter informações da rede conectada:", error.message);
        return null;
      }
    }

    async getNetworkDevices(gateway) {
      try {
        if (!gateway) return [];

        // Fazer ping no gateway para verificar conectividade
        const [, , exitStatus] = GLib.spawn_command_line_sync(`ping -c 1 -W 1 ${gateway}`);
        if (exitStatus !== 0) {
          return [];
        }

        // Escanear a rede local usando nmap se disponível
        try {
          const networkRange = gateway.substring(0, gateway.lastIndexOf('.')) + '.0/24';
          const [, stdout] = GLib.spawn_command_line_sync(`nmap -sn ${networkRange}`);
          const output = new TextDecoder().decode(stdout);
          
          const devices = [];
          const lines = output.split('\n');
          
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            if (line.includes('Nmap scan report for')) {
              const ipMatch = line.match(/(\d+\.\d+\.\d+\.\d+)/);
              if (ipMatch) {
                const ip = ipMatch[1];
                let hostname = null;
                
                // Extrair hostname se presente
                const hostnameMatch = line.match(/for ([^\s(]+)/);
                if (hostnameMatch && !hostnameMatch[1].match(/\d+\.\d+\.\d+\.\d+/)) {
                  hostname = hostnameMatch[1];
                }

                // Determinar tipo de dispositivo baseado no IP
                let deviceType = 'computer';
                if (ip === gateway) {
                  deviceType = 'router';
                  hostname = hostname || 'Gateway';
                } else if (ip.endsWith('.1')) {
                  deviceType = 'router';
                }

                devices.push({
                  ip,
                  hostname: hostname || `Device (${ip})`,
                  type: deviceType
                });
              }
            }
          }
          
          return devices.sort((a, b) => {
            // Gateway primeiro, depois ordenar por IP
            if (a.type === 'router' && b.type !== 'router') return -1;
            if (b.type === 'router' && a.type !== 'router') return 1;
            return a.ip.localeCompare(b.ip, undefined, { numeric: true });
          });
        } catch (nmapError) {
          this._log("nmap não disponível, usando método alternativo");
          // Fallback: apenas retornar o gateway
          return [{
            ip: gateway,
            hostname: 'Gateway',
            type: 'router'
          }];
        }
      } catch (error) {
        this._log("Erro ao escanear dispositivos da rede:", error.message);
        return [];
      }
    }

    destroy() { this.stopRealTimeMonitoring(); }
  }
);
