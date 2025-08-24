// connectionManager.js - Complete network connection management

const { GObject, Gtk, Adw, Gio, GLib } = imports.gi;

var ConnectionManager = GObject.registerClass(
  {
    GTypeName: "ConnectionManager",
    Signals: {
      'connection-changed': { param_types: [GObject.TYPE_STRING] },
      'profile-updated': { param_types: [GObject.TYPE_JSOBJECT] },
    },
  },
  class ConnectionManager extends GObject.Object {
    _init(params = {}) {
      super._init();
      this._connections = new Map();
      this._activeConnections = new Map();
      this._profiles = new Map();
      this._devices = new Map();
    }

    async scanConnections() {
      try {
        // Verificar se nmcli está disponível
        if (!GLib.find_program_in_path("nmcli")) {
          print(`DEBUG: nmcli não encontrado, retornando dados vazios`);
          return { saved: [], active: [], devices: [] };
        }
        
        // Buscar todas as conexões salvas
        await this._loadSavedConnections();
        
        // Buscar conexões ativas
        await this._loadActiveConnections();
        
        // Buscar dispositivos disponíveis
        await this._loadDevices();
        
        // Buscar redes WiFi disponíveis
        await this._loadAvailableNetworks();
        
        return {
          saved: Array.from(this._connections.values()),
          active: Array.from(this._activeConnections.values()),
          devices: Array.from(this._devices.values())
        };
      } catch (error) {
        print(`Erro ao escanear conexões: ${error.message}`);
        return { saved: [], active: [], devices: [] };
      }
    }

    async _loadSavedConnections() {
      const [, stdout] = GLib.spawn_command_line_sync(
        "nmcli -t -f UUID,NAME,TYPE,AUTOCONNECT,STATE connection show"
      );
      
      const output = new TextDecoder().decode(stdout).trim();
      const lines = output.split('\n');
      
      for (const line of lines) {
        if (!line.trim()) continue;
        
        const [uuid, name, type, autoConnect, state] = line.split(':');
        
        const connection = {
          uuid,
          name,
          type,
          autoConnect: autoConnect === 'yes',
          state,
          isActive: state === 'activated'
        };
        
        // Buscar detalhes adicionais
        try {
          const details = await this._getConnectionDetails(name);
          Object.assign(connection, details);
        } catch (e) {
          print(`Erro ao buscar detalhes de ${name}: ${e.message}`);
        }
        
        this._connections.set(uuid, connection);
      }
    }

    async _loadActiveConnections() {
      const [, stdout] = GLib.spawn_command_line_sync(
        "nmcli -t -f NAME,TYPE,DEVICE,STATE connection show --active"
      );
      
      const output = new TextDecoder().decode(stdout).trim();
      const lines = output.split('\n');
      
      for (const line of lines) {
        if (!line.trim()) continue;
        
        const [name, type, device, state] = line.split(':');
        
        const activeConnection = {
          name,
          type,
          device,
          state,
          isActive: true
        };
        
        // Buscar informações de IP se for uma conexão de rede
        if (type === '802-11-wireless' || type === '802-3-ethernet') {
          try {
            const ipInfo = await this._getIPInformation(name);
            Object.assign(activeConnection, ipInfo);
          } catch (e) {
            print(`Erro ao buscar IP de ${name}: ${e.message}`);
          }
        }
        
        this._activeConnections.set(name, activeConnection);
      }
    }

    async _loadDevices() {
      const [, stdout] = GLib.spawn_command_line_sync(
        "nmcli -t -f DEVICE,TYPE,STATE,CONNECTION device status"
      );
      
      const output = new TextDecoder().decode(stdout).trim();
      const lines = output.split('\n');
      
      for (const line of lines) {
        if (!line.trim()) continue;
        
        const [device, type, state, connection] = line.split(':');
        
        this._devices.set(device, {
          device,
          type,
          state,
          connection: connection || null,
          isConnected: state === 'connected'
        });
      }
    }

    async loadAvailableNetworks() {
      try {
        // Verificar se nmcli está disponível
        if (!GLib.find_program_in_path("nmcli")) {
          print(`DEBUG: nmcli não encontrado para loadAvailableNetworks`);
          return [];
        }
        
        const [, stdout] = GLib.spawn_command_line_sync(
          "nmcli -t -f SSID,SIGNAL,SECURITY,IN-USE device wifi list"
        );
        
        const output = new TextDecoder().decode(stdout).trim();
        const lines = output.split('\n');
        
        const availableNetworks = [];
        
        for (const line of lines) {
          if (!line.trim()) continue;
          
          const [ssid, signal, security, inUse] = line.split(':');
          
          if (ssid && ssid !== '--') {
            availableNetworks.push({
              ssid,
              signal: parseInt(signal) || 0,
              security: security || 'Open',
              inUse: inUse === '*',
              isAvailable: true
            });
          }
        }
        
        return availableNetworks;
      } catch (error) {
        print(`Erro ao buscar redes disponíveis: ${error.message}`);
        return [];
      }
    }

    async _loadAvailableNetworks() {
      return this.loadAvailableNetworks();
    }

    async _getConnectionDetails(connectionName) {
      try {
        const [, stdout] = GLib.spawn_command_line_sync(
          `nmcli -t -f connection.id,connection.type,connection.autoconnect,ipv4.method,ipv4.addresses,ipv4.gateway,ipv4.dns,802-11-wireless.ssid connection show "${connectionName}"`
        );
        
        const output = new TextDecoder().decode(stdout).trim();
        const lines = output.split('\n');
        
        const details = {};
        
        for (const line of lines) {
          const [key, value] = line.split(':', 2);
          
          switch (key) {
            case 'connection.type':
              details.connectionType = value;
              break;
            case 'connection.autoconnect':
              details.autoConnect = value === 'yes';
              break;
            case 'ipv4.method':
              details.ipv4Method = value;
              break;
            case 'ipv4.addresses':
              details.ipv4Addresses = value ? value.split(',') : [];
              break;
            case 'ipv4.gateway':
              details.ipv4Gateway = value;
              break;
            case 'ipv4.dns':
              details.ipv4DNS = value ? value.split(',') : [];
              break;
            case '802-11-wireless.ssid':
              details.ssid = value;
              break;
          }
        }
        
        return details;
      } catch (error) {
        print(`Erro ao buscar detalhes da conexão: ${error.message}`);
        return {};
      }
    }

    async _getIPInformation(connectionName) {
      try {
        const [, stdout] = GLib.spawn_command_line_sync(
          `nmcli -t -f IP4.ADDRESS,IP4.GATEWAY,IP4.DNS,IP4.ROUTE connection show "${connectionName}"`
        );
        
        const output = new TextDecoder().decode(stdout).trim();
        const lines = output.split('\n');
        
        const ipInfo = {
          ipAddresses: [],
          gateway: null,
          dnsServers: [],
          routes: []
        };
        
        for (const line of lines) {
          const [key, value] = line.split(':', 2);
          
          if (key.startsWith('IP4.ADDRESS') && value) {
            ipInfo.ipAddresses.push(value);
          } else if (key === 'IP4.GATEWAY' && value) {
            ipInfo.gateway = value;
          } else if (key.startsWith('IP4.DNS') && value) {
            ipInfo.dnsServers.push(value);
          } else if (key.startsWith('IP4.ROUTE') && value) {
            ipInfo.routes.push(value);
          }
        }
        
        return ipInfo;
      } catch (error) {
        print(`Erro ao buscar informações de IP: ${error.message}`);
        return {};
      }
    }

    async connectToNetwork(ssid, password = null, security = 'WPA2', options = {}) {
      try {
        let command = `nmcli device wifi connect "${ssid}"`;
        
        if (password && security !== 'Open') {
          command += ` password "${password}"`;
        }

        // Suporte para redes ocultas
        if (options.hidden) {
          command += ` hidden yes`;
        }
        
        const [, , exitStatus] = GLib.spawn_command_line_sync(command);
        
        if (exitStatus === 0) {
          // Se especificado autoConnect, configurar o perfil
          if (options.autoConnect !== undefined) {
            try {
              const autoConnectValue = options.autoConnect ? 'yes' : 'no';
              GLib.spawn_command_line_sync(
                `nmcli connection modify "${ssid}" connection.autoconnect ${autoConnectValue}`
              );
            } catch (e) {
              print(`Aviso: Não foi possível configurar auto-conectar: ${e.message}`);
            }
          }

          this.emit('connection-changed', 'connected');
          return { success: true, message: `Conectado à rede ${ssid}` };
        } else {
          return { success: false, message: `Falha ao conectar à rede ${ssid}` };
        }
      } catch (error) {
        return { success: false, message: `Erro: ${error.message}` };
      }
    }

    async disconnectFromNetwork(connectionName) {
      try {
        const [, , exitStatus] = GLib.spawn_command_line_sync(
          `nmcli connection down "${connectionName}"`
        );
        
        if (exitStatus === 0) {
          this.emit('connection-changed', 'disconnected');
          return { success: true, message: `Desconectado de ${connectionName}` };
        } else {
          return { success: false, message: `Falha ao desconectar de ${connectionName}` };
        }
      } catch (error) {
        return { success: false, message: `Erro: ${error.message}` };
      }
    }

    async createEthernetConnection(config) {
      try {
        let command = `nmcli connection add type ethernet con-name "${config.name}"`;
        
        // Configurar método de IP
        if (config.method === 'manual') {
          command += ` ipv4.method manual`;
          command += ` ipv4.addresses "${config.ip}/24"`;
          command += ` ipv4.gateway "${config.gateway}"`;
          
          if (config.dns && config.dns.length > 0) {
            command += ` ipv4.dns "${config.dns.join(',')}"`;
          }
        } else {
          command += ` ipv4.method auto`;
        }
        
        // Configurar auto-conectar
        const autoConnect = config.autoConnect ? 'yes' : 'no';
        command += ` connection.autoconnect ${autoConnect}`;
        
        const [, , exitStatus] = GLib.spawn_command_line_sync(command);
        
        if (exitStatus === 0) {
          this.emit('connection-changed', 'created');
          return { success: true, message: `Conexão ${config.name} criada com sucesso` };
        } else {
          return { success: false, message: `Falha ao criar conexão ${config.name}` };
        }
      } catch (error) {
        return { success: false, message: `Erro: ${error.message}` };
      }
    }

    async deleteConnection(connectionName) {
      try {
        const [, , exitStatus] = GLib.spawn_command_line_sync(
          `nmcli connection delete "${connectionName}"`
        );
        
        if (exitStatus === 0) {
          return { success: true, message: `Perfil ${connectionName} removido` };
        } else {
          return { success: false, message: `Falha ao remover perfil ${connectionName}` };
        }
      } catch (error) {
        return { success: false, message: `Erro: ${error.message}` };
      }
    }

    async editConnection(connectionName, settings) {
      try {
        let commands = [];
        
        // Construir comandos de modificação baseados nas configurações
        if (settings.autoConnect !== undefined) {
          commands.push(`nmcli connection modify "${connectionName}" connection.autoconnect ${settings.autoConnect ? 'yes' : 'no'}`);
        }
        
        if (settings.ipv4Method) {
          commands.push(`nmcli connection modify "${connectionName}" ipv4.method ${settings.ipv4Method}`);
        }
        
        if (settings.ipv4Address && settings.ipv4Method === 'manual') {
          commands.push(`nmcli connection modify "${connectionName}" ipv4.addresses "${settings.ipv4Address}"`);
        }
        
        if (settings.ipv4Gateway && settings.ipv4Method === 'manual') {
          commands.push(`nmcli connection modify "${connectionName}" ipv4.gateway "${settings.ipv4Gateway}"`);
        }
        
        if (settings.ipv4DNS && settings.ipv4Method === 'manual') {
          commands.push(`nmcli connection modify "${connectionName}" ipv4.dns "${settings.ipv4DNS.join(',')}"`);
        }
        
        // Executar comandos
        for (const command of commands) {
          const [, , exitStatus] = GLib.spawn_command_line_sync(command);
          if (exitStatus !== 0) {
            throw new Error(`Falha ao executar: ${command}`);
          }
        }
        
        this.emit('profile-updated', { name: connectionName, settings });
        return { success: true, message: `Perfil ${connectionName} atualizado` };
      } catch (error) {
        return { success: false, message: `Erro: ${error.message}` };
      }
    }

    async createWiFiConnection(ssid, password, security, settings = {}) {
      try {
        let command = `nmcli connection add type wifi con-name "${ssid}" ssid "${ssid}"`;
        
        // Configurar segurança
        if (security !== 'Open' && password) {
          if (security.includes('WPA')) {
            command += ` wifi-sec.key-mgmt wpa-psk wifi-sec.psk "${password}"`;
          }
        }
        
        // Configurações IPv4
        if (settings.ipv4Method === 'manual') {
          command += ` ipv4.method manual`;
          if (settings.ipv4Address) {
            command += ` ipv4.addresses "${settings.ipv4Address}"`;
          }
          if (settings.ipv4Gateway) {
            command += ` ipv4.gateway "${settings.ipv4Gateway}"`;
          }
          if (settings.ipv4DNS && settings.ipv4DNS.length > 0) {
            command += ` ipv4.dns "${settings.ipv4DNS.join(',')}"`;
          }
        }
        
        // Auto-connect
        if (settings.autoConnect !== undefined) {
          command += ` connection.autoconnect ${settings.autoConnect ? 'yes' : 'no'}`;
        }
        
        const [, , exitStatus] = GLib.spawn_command_line_sync(command);
        
        if (exitStatus === 0) {
          return { success: true, message: `Perfil WiFi ${ssid} criado` };
        } else {
          return { success: false, message: `Falha ao criar perfil WiFi ${ssid}` };
        }
      } catch (error) {
        return { success: false, message: `Erro: ${error.message}` };
      }
    }

    async getDetailedDeviceInfo(device) {
      try {
        const [, stdout] = GLib.spawn_command_line_sync(
          `nmcli -t device show "${device}"`
        );
        
        const output = new TextDecoder().decode(stdout).trim();
        const lines = output.split('\n');
        
        const deviceInfo = {};
        
        for (const line of lines) {
          const [key, value] = line.split(':', 2);
          
          switch (key) {
            case 'GENERAL.DEVICE':
              deviceInfo.device = value;
              break;
            case 'GENERAL.TYPE':
              deviceInfo.type = value;
              break;
            case 'GENERAL.STATE':
              deviceInfo.state = value;
              break;
            case 'GENERAL.CONNECTION':
              deviceInfo.connection = value;
              break;
            case 'GENERAL.HWADDR':
              deviceInfo.hwAddress = value;
              break;
            case 'GENERAL.MTU':
              deviceInfo.mtu = value;
              break;
            case 'CAPABILITIES.SPEED':
              deviceInfo.speed = value;
              break;
            case 'WIFI.SSID':
              deviceInfo.ssid = value;
              break;
            case 'WIFI.FREQ':
              deviceInfo.frequency = value;
              break;
            case 'WIFI.RATE':
              deviceInfo.rate = value;
              break;
            case 'WIFI.SIGNAL':
              deviceInfo.signal = value;
              break;
          }
        }
        
        return deviceInfo;
      } catch (error) {
        print(`Erro ao buscar informações do dispositivo: ${error.message}`);
        return {};
      }
    }

    async rescanWiFi() {
      try {
        const [, , exitStatus] = GLib.spawn_command_line_sync("nmcli device wifi rescan");
        return exitStatus === 0;
      } catch (error) {
        print(`Erro ao rescanear WiFi: ${error.message}`);
        return false;
      }
    }

    getConnections() {
      return Array.from(this._connections.values());
    }

    getActiveConnections() {
      return Array.from(this._activeConnections.values());
    }

    getDevices() {
      return Array.from(this._devices.values());
    }
  }
);
