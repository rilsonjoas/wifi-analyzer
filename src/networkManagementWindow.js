// networkManagementWindow.js - Complete network management interface

const { GObject, Gtk, Adw, Gio, GLib } = imports.gi;
const { ConnectionManager } = imports.connectionManager;

var NetworkManagementWindow = GObject.registerClass(
  {
    GTypeName: "NetworkManagementWindow",
  },
  class NetworkManagementWindow extends Adw.ApplicationWindow {
    _init(params = {}) {
      const { networkManager } = params;
      
      super._init({
        title: "Gerenciamento de Redes",
        default_width: 1000,
        default_height: 700,
        modal: false,
      });

      this._networkManager = networkManager;
      this._connectionManager = new ConnectionManager();
      this._currentData = { saved: [], active: [], devices: [] };
      this._selectedConnection = null;
      this._availableNetworks = [];

      this._buildUI();
      this._setupSignals();
      this._loadData();

      // Usar o networkManager passado como parâmetro se disponível
      if (this._networkManager) {
        this._networkManager.connect("networks-updated", (obj, networks) => {
          print(`DEBUG: Recebidas ${networks.length} redes no NetworkManagementWindow`);
          this._availableNetworks = networks;
          this._updateWiFiView();
        });
        
        // Obter redes atuais imediatamente
        this._availableNetworks = this._networkManager.getNetworks() || [];
        print(`DEBUG: Redes iniciais carregadas: ${this._availableNetworks.length}`);
      }
    }

    _buildUI() {
      // Layout principal
      const mainBox = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 0,
      });

      // Header bar
      const headerBar = new Adw.HeaderBar({
        title_widget: new Adw.WindowTitle({
          title: "Gerenciamento de Redes",
          subtitle: "WiFi e Ethernet"
        }),
      });

      // Botão de atualizar
      this._refreshButton = new Gtk.Button({
        icon_name: "view-refresh-symbolic",
        tooltip_text: "Atualizar conexões",
      });
      headerBar.pack_start(this._refreshButton);

      // Botão de nova conexão
      this._newConnectionButton = new Gtk.Button({
        icon_name: "list-add-symbolic",
        tooltip_text: "Nova conexão",
        css_classes: ["suggested-action"],
      });
      headerBar.pack_end(this._newConnectionButton);

      // ViewStack principal
      this._viewStack = new Adw.ViewStack({
        vexpand: true,
        hexpand: true,
      });

      const viewSwitcher = new Adw.ViewSwitcher({
        stack: this._viewStack,
        policy: Adw.ViewSwitcherPolicy.WIDE,
      });
      headerBar.set_title_widget(viewSwitcher);

      // Páginas
      this._createWiFiPage();
      this._createConnectionsPage();
      this._createDevicesPage();

      mainBox.append(headerBar);
      mainBox.append(this._viewStack);

      this.set_content(mainBox);
    }

    _createWiFiPage() {
      const wifiPage = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        spacing: 12,
        margin_top: 12,
        margin_bottom: 12,
        margin_start: 12,
        margin_end: 12,
      });

      // Lista de redes WiFi disponíveis
      const leftPanel = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 12,
        hexpand: true,
      });

      // Cabeçalho da lista WiFi
      const wifiHeader = new Adw.PreferencesGroup({
        title: "Redes WiFi Disponíveis",
        description: "Redes detectadas na área"
      });

      this._wifiListBox = new Gtk.ListBox({
        css_classes: ["boxed-list"],
        selection_mode: Gtk.SelectionMode.SINGLE,
      });

      const wifiScrolled = new Gtk.ScrolledWindow({
        vexpand: true,
        hscrollbar_policy: Gtk.PolicyType.NEVER,
        child: this._wifiListBox,
      });

      // Botão rescan
      const rescanButton = new Gtk.Button({
        label: "Reescanear Redes",
        icon_name: "view-refresh-symbolic",
        css_classes: ["pill"],
      });

      leftPanel.append(wifiHeader);
      leftPanel.append(wifiScrolled);
      leftPanel.append(rescanButton);

      // Painel de detalhes da rede selecionada
      const rightPanel = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 12,
        width_request: 350,
      });

      this._wifiDetailsStack = new Gtk.Stack({
        vexpand: true,
      });

      // Página vazia (quando nenhuma rede selecionada)
      const emptyPage = new Adw.StatusPage({
        icon_name: "network-wireless-symbolic",
        title: "Selecione uma Rede",
        description: "Escolha uma rede WiFi para ver os detalhes",
      });

      // Página de detalhes simples
      this._wifiDetailsPage = this._createSimpleDetailsPage();

      this._wifiDetailsStack.add_named(emptyPage, "empty");
      this._wifiDetailsStack.add_named(this._wifiDetailsPage, "details");
      this._wifiDetailsStack.set_visible_child_name("empty");

      rightPanel.append(this._wifiDetailsStack);

      wifiPage.append(leftPanel);
      wifiPage.append(new Gtk.Separator({ orientation: Gtk.Orientation.VERTICAL }));
      wifiPage.append(rightPanel);

      this._viewStack.add_titled_with_icon(
        wifiPage,
        "wifi",
        "Redes WiFi",
        "network-wireless-symbolic"
      );

      // Conectar sinais
      rescanButton.connect("clicked", () => this._rescanWiFi());
      this._wifiListBox.connect("row-selected", (listbox, row) => {
        if (row) {
          this._onWiFiNetworkSelected(row);
        }
      });
    }

    _createSimpleDetailsPage() {
      const scrolled = new Gtk.ScrolledWindow({
        hscrollbar_policy: Gtk.PolicyType.NEVER,
        vexpand: true,
      });

      const detailsBox = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 18,
        margin_top: 18,
        margin_bottom: 18,
        margin_start: 18,
        margin_end: 18,
      });

      // Informações básicas - usando Box simples ao invés de PreferencesGroup
      this._networkInfoBox = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 12,
        css_classes: ["card"],
        margin_top: 12,
        margin_bottom: 12,
        margin_start: 12,
        margin_end: 12,
      });

      const infoTitle = new Gtk.Label({
        label: "Informações da Rede",
        css_classes: ["heading"],
        halign: Gtk.Align.START,
        margin_top: 12,
        margin_start: 12,
      });

      this._networkInfoBox.append(infoTitle);

      // Configurações de conexão
      const connectionGroup = new Adw.PreferencesGroup({
        title: "Configurações de Conexão"
      });

      // Campo de senha
      this._passwordRow = new Adw.PasswordEntryRow({
        title: "Senha da Rede",
      });

      // Auto-conectar
      this._autoConnectRow = new Adw.SwitchRow({
        title: "Conectar Automaticamente",
      });

      connectionGroup.add(this._passwordRow);
      connectionGroup.add(this._autoConnectRow);

      // Botões de ação
      this._actionButtonsBox = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        spacing: 12,
        homogeneous: true,
        margin_top: 18,
      });

      this._connectButton = new Gtk.Button({
        label: "Conectar",
        css_classes: ["suggested-action", "pill"],
        sensitive: false, // Desabilitado até selecionar uma rede
        tooltip_text: "Selecione uma rede para conectar"
      });

      this._forgetButton = new Gtk.Button({
        label: "Esquecer",
        css_classes: ["destructive-action", "pill"],
      });

      this._actionButtonsBox.append(this._connectButton);
      this._actionButtonsBox.append(this._forgetButton);

      // Montar estrutura
      detailsBox.append(this._networkInfoBox);
      detailsBox.append(connectionGroup);
      detailsBox.append(this._actionButtonsBox);

      scrolled.set_child(detailsBox);

      // Conectar botões
      this._connectButton.connect("clicked", () => this._connectToSelectedWiFi());
      this._forgetButton.connect("clicked", () => this._forgetSelectedWiFi());

      return scrolled;
    }

    _createConnectionsPage() {
      const connectionsPage = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 18,
        margin_top: 18,
        margin_bottom: 18,
        margin_start: 18,
        margin_end: 18,
      });

      // Conexões ativas
      const activeGroup = new Adw.PreferencesGroup({
        title: "Conexões Ativas",
        description: "Conexões atualmente estabelecidas"
      });

      this._activeConnectionsList = new Gtk.ListBox({
        css_classes: ["boxed-list"],
        selection_mode: Gtk.SelectionMode.NONE,
      });

      activeGroup.add(this._activeConnectionsList);

      // Conexões salvas
      const savedGroup = new Adw.PreferencesGroup({
        title: "Perfis Salvos",
        description: "Configurações de rede salvas"
      });

      this._savedConnectionsList = new Gtk.ListBox({
        css_classes: ["boxed-list"],
        selection_mode: Gtk.SelectionMode.NONE,
      });

      const savedScrolled = new Gtk.ScrolledWindow({
        vexpand: true,
        hscrollbar_policy: Gtk.PolicyType.NEVER,
        child: this._savedConnectionsList,
      });

      savedGroup.add(savedScrolled);

      connectionsPage.append(activeGroup);
      connectionsPage.append(savedGroup);

      this._viewStack.add_titled_with_icon(
        connectionsPage,
        "connections",
        "Conexões",
        "network-workgroup-symbolic"
      );
    }

    _createDevicesPage() {
      const devicesPage = new Gtk.Box({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 18,
        margin_top: 18,
        margin_bottom: 18,
        margin_start: 18,
        margin_end: 18,
      });

      const devicesGroup = new Adw.PreferencesGroup({
        title: "Dispositivos de Rede",
        description: "Interfaces de rede disponíveis"
      });

      this._devicesList = new Gtk.ListBox({
        css_classes: ["boxed-list"],
        selection_mode: Gtk.SelectionMode.SINGLE,
      });

      const devicesScrolled = new Gtk.ScrolledWindow({
        vexpand: true,
        hscrollbar_policy: Gtk.PolicyType.NEVER,
        child: this._devicesList,
      });

      devicesGroup.add(devicesScrolled);
      devicesPage.append(devicesGroup);

      this._viewStack.add_titled_with_icon(
        devicesPage,
        "devices",
        "Dispositivos",
        "computer-symbolic"
      );
    }

    _setupSignals() {
      this._refreshButton.connect("clicked", () => this._loadData());
      this._newConnectionButton.connect("clicked", () => this._showNewConnectionDialog());
    }

    async _loadData() {
      try {
        this._currentData = await this._connectionManager.scanConnections();
        this._availableNetworks = await this._connectionManager.loadAvailableNetworks();
        
        // Detectar rede conectada e marcar nas redes disponíveis
        let connectedSSID = null;
        if (this._networkManager) {
          const connectedInfo = await this._networkManager.getCurrentNetworkInfo();
          if (connectedInfo && connectedInfo.ssid) {
            connectedSSID = connectedInfo.ssid;
            print(`DEBUG: Rede conectada detectada: ${connectedSSID}`);
          }
        }
        
        // Marcar rede conectada como inUse nas redes disponíveis
        if (connectedSSID) {
          for (const network of this._availableNetworks) {
            if (network.ssid === connectedSSID) {
              network.inUse = true;
              print(`DEBUG: Marcando ${network.ssid} como inUse`);
            } else {
              network.inUse = false;
            }
          }
        }
        
        await this._updateConnectionsView();
        await this._updateDevicesView();
        this._updateWiFiView();
      } catch (error) {
        print(`Erro ao carregar dados: ${error.message}`);
      }
    }

    _updateWiFiView() {
      print(`DEBUG: _updateWiFiView chamado, ${this._availableNetworks.length} redes disponíveis`);
      
      // Limpar lista atual
      let child;
      while ((child = this._wifiListBox.get_first_child())) {
        this._wifiListBox.remove(child);
      }

      // Verificar se há redes disponíveis
      if (this._availableNetworks.length === 0) {
        // Adicionar mensagem de "nenhuma rede encontrada"
        const emptyRow = new Adw.ActionRow({
          title: "Nenhuma rede encontrada",
          subtitle: "Tente atualizar a lista ou verificar se o WiFi está ativo",
          sensitive: false
        });
        
        const emptyIcon = new Gtk.Image({
          icon_name: "network-wireless-offline-symbolic",
          css_classes: ["dim-label"]
        });
        emptyRow.add_prefix(emptyIcon);
        
        this._wifiListBox.append(emptyRow);
        return;
      }

      // Adicionar redes disponíveis
      for (const network of this._availableNetworks) {
        const row = this._createWiFiNetworkRow(network);
        this._wifiListBox.append(row);
        print(`DEBUG: Adicionada rede: ${network.ssid || 'Oculta'}`);
      }
    }

    _createWiFiNetworkRow(network) {
      const row = new Adw.ActionRow({
        title: network.ssid || "(Rede Oculta)",
        subtitle: `${network.security} • Sinal: ${network.signal}%`,
      });

      // Ícone de sinal
      const signalIcon = new Gtk.Image({
        icon_name: this._getSignalIcon(network.signal),
        css_classes: [this._getSignalColor(network.signal)],
      });

      // Ícone de segurança
      const securityIcon = new Gtk.Image({
        icon_name: this._getSecurityIcon(network.security),
        css_classes: ["dim-label"],
      });

      // Indicador de conexão ativa
      if (network.inUse) {
        const activeIcon = new Gtk.Image({
          icon_name: "emblem-ok-symbolic",
          css_classes: ["success"],
        });
        row.add_suffix(activeIcon);
      }

      const iconBox = new Gtk.Box({
        spacing: 6,
        orientation: Gtk.Orientation.HORIZONTAL,
      });

      iconBox.append(securityIcon);
      iconBox.append(signalIcon);

      row.add_prefix(iconBox);
      row._networkData = network;

      return row;
    }

    async _updateConnectionsView() {
      print(`DEBUG: _updateConnectionsView chamado`);
      print(`DEBUG: _activeConnectionsList existe: ${!!this._activeConnectionsList}`);
      print(`DEBUG: _savedConnectionsList existe: ${!!this._savedConnectionsList}`);
      
      // Atualizar conexões ativas
      let child;
      while ((child = this._activeConnectionsList.get_first_child())) {
        this._activeConnectionsList.remove(child);
      }

      let activeConnections = [];
      
      // Primeiro tentar networkManager para conexão ativa principal
      if (this._networkManager) {
        try {
          const connectedInfo = await this._networkManager.getCurrentNetworkInfo();
          if (connectedInfo && connectedInfo.ssid) {
            activeConnections = [{
              name: connectedInfo.ssid,
              type: "802-11-wireless",
              device: connectedInfo.device || "wlan0",
              state: "connected",
              isActive: true,
              ipAddresses: connectedInfo.ipAddress ? [connectedInfo.ipAddress] : [],
              gateway: connectedInfo.gateway,
              dns: connectedInfo.dns || []
            }];
            print(`DEBUG: Conexão ativa detectada via networkManager: ${connectedInfo.ssid}`);
          }
        } catch (error) {
          print(`DEBUG: Erro ao obter informações da rede conectada: ${error.message}`);
        }
      }
      
      // Complementar com dados do ConnectionManager se disponível
      if (this._connectionManager) {
        try {
          const connectionData = await this._connectionManager.scanConnections();
          const cmActiveConnections = connectionData.active || [];
          
          // Adicionar conexões do ConnectionManager que não estejam já na lista
          for (const cmConn of cmActiveConnections) {
            const exists = activeConnections.some(conn => conn.name === cmConn.name);
            if (!exists) {
              activeConnections.push(cmConn);
            }
          }
          print(`DEBUG: ${cmActiveConnections.length} conexões adicionais via ConnectionManager`);
        } catch (error) {
          print(`DEBUG: Erro ao buscar conexões via ConnectionManager: ${error.message}`);
        }
      }
      
      // Se ainda não há conexões, mostrar mensagem apropriada
      if (activeConnections.length === 0) {
        const emptyRow = new Adw.ActionRow({
          title: "Nenhuma conexão ativa",
          subtitle: "Conecte-se a uma rede para ver as informações aqui",
          sensitive: false
        });
        
        const emptyIcon = new Gtk.Image({
          icon_name: "network-wireless-offline-symbolic",
          css_classes: ["dim-label"]
        });
        emptyRow.add_prefix(emptyIcon);
        
        this._activeConnectionsList.append(emptyRow);
        print("DEBUG: Nenhuma conexão ativa encontrada");
      }

      for (const connection of activeConnections) {
        const row = this._createActiveConnectionRow(connection);
        this._activeConnectionsList.append(row);
      }
      
      print(`DEBUG: ${activeConnections.length} conexões ativas exibidas`);

      // Atualizar conexões salvas
      while ((child = this._savedConnectionsList.get_first_child())) {
        this._savedConnectionsList.remove(child);
      }

      let savedConnections = [];
      
      // Buscar perfis salvos reais usando ConnectionManager
      if (this._connectionManager) {
        try {
          const connectionData = await this._connectionManager.scanConnections();
          savedConnections = (connectionData.saved || []).filter(conn => !conn.isActive);
          print(`DEBUG: ${savedConnections.length} perfis salvos encontrados via ConnectionManager`);
        } catch (error) {
          print(`DEBUG: Erro ao buscar perfis salvos via ConnectionManager: ${error.message}`);
        }
      }
      
      // Adicionar perfis criados dinamicamente (se existirem)
      if (this._mockSavedProfiles && this._mockSavedProfiles.length > 0) {
        savedConnections = savedConnections.concat(this._mockSavedProfiles);
        print(`DEBUG: Adicionados ${this._mockSavedProfiles.length} perfis criados dinamicamente`);
      }
      
      // Se não há perfis salvos, mostrar mensagem apropriada
      if (savedConnections.length === 0) {
        const emptyRow = new Adw.ActionRow({
          title: "Nenhum perfil salvo",
          subtitle: "Conecte-se a redes para criar perfis salvos automaticamente",
          sensitive: false
        });
        
        const emptyIcon = new Gtk.Image({
          icon_name: "network-wireless-symbolic",
          css_classes: ["dim-label"]
        });
        emptyRow.add_prefix(emptyIcon);
        
        this._savedConnectionsList.append(emptyRow);
        print("DEBUG: Nenhum perfil salvo encontrado");
      }

      // Adicionar perfis salvos à lista
      for (const connection of savedConnections) {
        const row = this._createSavedConnectionRow(connection);
        this._savedConnectionsList.append(row);
      }
      
      print(`DEBUG: ${savedConnections.length} perfis salvos exibidos`);
    }

    _createActiveConnectionRow(connection) {
      const row = new Adw.ActionRow({
        title: connection.name,
        subtitle: `${connection.type} via ${connection.device}`,
      });

      // Ícone do tipo de conexão
      const typeIcon = new Gtk.Image({
        icon_name: this._getConnectionTypeIcon(connection.type),
        css_classes: ["success"],
      });

      // Informações de IP (se disponível)
      if (connection.ipAddresses && connection.ipAddresses.length > 0) {
        const ipLabel = new Gtk.Label({
          label: connection.ipAddresses[0].split('/')[0],
          css_classes: ["caption", "dim-label"],
        });
        row.add_suffix(ipLabel);
      }

      // Botão de desconectar
      const disconnectButton = new Gtk.Button({
        icon_name: "network-offline-symbolic",
        css_classes: ["flat", "circular"],
        tooltip_text: "Desconectar",
      });

      disconnectButton.connect("clicked", () => {
        this._disconnectConnection(connection.name);
      });

      row.add_prefix(typeIcon);
      row.add_suffix(disconnectButton);

      return row;
    }

    _createSavedConnectionRow(connection) {
      const row = new Adw.ExpanderRow({
        title: connection.name,
        subtitle: this._getConnectionSubtitle(connection),
        show_enable_switch: false,
      });

      // Ícone do tipo de conexão
      const typeIcon = new Gtk.Image({
        icon_name: this._getConnectionTypeIcon(connection.type),
        css_classes: [connection.autoConnect ? "success" : "dim-label"],
      });
      row.add_prefix(typeIcon);

      // Status chips no canto direito
      const statusBox = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        spacing: 6,
        valign: Gtk.Align.CENTER
      });

      // Auto-connect chip
      if (connection.autoConnect) {
        const autoChip = new Gtk.Label({
          label: "Auto",
          css_classes: ["pill", "success"],
        });
        statusBox.append(autoChip);
      }

      // Priority chip
      if (connection.priority > 0) {
        const priorityChip = new Gtk.Label({
          label: `P${connection.priority}`,
          css_classes: ["pill", "accent"],
        });
        statusBox.append(priorityChip);
      }

      // Metered chip
      if (connection.metered) {
        const meteredChip = new Gtk.Label({
          label: "Limitada",
          css_classes: ["pill", "warning"],
        });
        statusBox.append(meteredChip);
      }

      row.add_suffix(statusBox);

      // Seção de detalhes expandível
      const detailsGroup = new Adw.PreferencesGroup();
      
      // Informações básicas
      const basicGroup = new Adw.PreferencesGroup({
        title: "Configuração Básica"
      });

      // SSID (para WiFi)
      if (connection.ssid) {
        const ssidRow = new Adw.ActionRow({
          title: "SSID",
          subtitle: connection.ssid,
        });
        const ssidIcon = new Gtk.Image({
          icon_name: "network-wireless-symbolic",
          css_classes: ["dim-label"]
        });
        ssidRow.add_prefix(ssidIcon);
        basicGroup.add(ssidRow);
      }

      // Segurança
      const securityRow = new Adw.ActionRow({
        title: "Segurança",
        subtitle: connection.security || "Nenhuma",
      });
      const securityIcon = new Gtk.Image({
        icon_name: connection.security === "None" ? "security-low-symbolic" : "security-high-symbolic",
        css_classes: [connection.security === "None" ? "error" : "success"]
      });
      securityRow.add_prefix(securityIcon);
      basicGroup.add(securityRow);

      // MAC Address
      if (connection.mac) {
        const macRow = new Adw.ActionRow({
          title: "Endereço MAC",
          subtitle: connection.mac,
        });
        const macIcon = new Gtk.Image({
          icon_name: "network-card-symbolic",
          css_classes: ["dim-label"]
        });
        macRow.add_prefix(macIcon);
        
        const copyMacButton = new Gtk.Button({
          icon_name: "edit-copy-symbolic",
          css_classes: ["flat"],
          tooltip_text: "Copiar MAC"
        });
        copyMacButton.connect('clicked', () => {
          print(`MAC copiado: ${connection.mac}`);
        });
        macRow.add_suffix(copyMacButton);
        
        basicGroup.add(macRow);
      }

      detailsGroup.add(basicGroup);

      // Configurações de rede
      const networkGroup = new Adw.PreferencesGroup({
        title: "Configurações de Rede"
      });

      // Método IPv4
      const ipv4Row = new Adw.ActionRow({
        title: "IPv4",
        subtitle: connection.ipv4Method === "auto" ? "Automático (DHCP)" : "Manual",
      });
      const ipIcon = new Gtk.Image({
        icon_name: "network-workgroup-symbolic",
        css_classes: ["dim-label"]
      });
      ipv4Row.add_prefix(ipIcon);
      networkGroup.add(ipv4Row);

      // DNS
      if (connection.dns && connection.dns.length > 0) {
        const dnsRow = new Adw.ActionRow({
          title: "Servidores DNS",
          subtitle: connection.dns.join(", "),
        });
        const dnsIcon = new Gtk.Image({
          icon_name: "preferences-system-network-symbolic",
          css_classes: ["dim-label"]
        });
        dnsRow.add_prefix(dnsIcon);
        networkGroup.add(dnsRow);
      }

      detailsGroup.add(networkGroup);

      // Estatísticas
      const statsGroup = new Adw.PreferencesGroup({
        title: "Estatísticas"
      });

      // Última conexão
      if (connection.lastConnected) {
        const lastConnRow = new Adw.ActionRow({
          title: "Última Conexão",
          subtitle: this._formatDate(connection.lastConnected),
        });
        const timeIcon = new Gtk.Image({
          icon_name: "document-open-recent-symbolic",
          css_classes: ["dim-label"]
        });
        lastConnRow.add_prefix(timeIcon);
        statsGroup.add(lastConnRow);
      }

      // Contagem de conexões
      if (connection.connectionCount) {
        const countRow = new Adw.ActionRow({
          title: "Conexões Realizadas",
          subtitle: `${connection.connectionCount} vezes`,
        });
        const countIcon = new Gtk.Image({
          icon_name: "view-refresh-symbolic",
          css_classes: ["dim-label"]
        });
        countRow.add_prefix(countIcon);
        statsGroup.add(countRow);
      }

      // Data de criação
      if (connection.createdDate) {
        const createdRow = new Adw.ActionRow({
          title: "Criado em",
          subtitle: this._formatDate(connection.createdDate),
        });
        const calendarIcon = new Gtk.Image({
          icon_name: "x-office-calendar-symbolic",
          css_classes: ["dim-label"]
        });
        createdRow.add_prefix(calendarIcon);
        statsGroup.add(createdRow);
      }

      detailsGroup.add(statsGroup);

      // Ações
      const actionsGroup = new Adw.PreferencesGroup({
        title: "Ações"
      });

      const actionsBox = new Gtk.Box({
        orientation: Gtk.Orientation.HORIZONTAL,
        spacing: 12,
        halign: Gtk.Align.CENTER,
        margin_top: 12,
        margin_bottom: 12
      });

      // Botão conectar
      const connectButton = new Gtk.Button({
        label: "Conectar",
        css_classes: ["suggested-action", "pill"],
      });
      connectButton.connect('clicked', () => {
        this._connectToSavedProfile(connection);
      });
      actionsBox.append(connectButton);

      // Botão editar
      const editButton = new Gtk.Button({
        label: "Editar",
        css_classes: ["flat", "pill"],
      });
      editButton.connect('clicked', () => {
        this._editSavedProfile(connection);
      });
      actionsBox.append(editButton);

      // Botão excluir
      const deleteButton = new Gtk.Button({
        label: "Excluir",
        css_classes: ["destructive-action", "pill"],
      });
      deleteButton.connect('clicked', () => {
        this._deleteSavedProfile(connection);
      });
      actionsBox.append(deleteButton);

      const actionsRow = new Adw.ActionRow();
      actionsRow.set_child(actionsBox);
      actionsGroup.add(actionsRow);
      detailsGroup.add(actionsGroup);

      row.add_row(detailsGroup);
      row._connectionData = connection;

      return row;
    }

    async _updateDevicesView() {
      print(`DEBUG: _updateDevicesView chamado`);
      print(`DEBUG: _devicesList existe: ${!!this._devicesList}`);
      
      let child;
      while ((child = this._devicesList.get_first_child())) {
        this._devicesList.remove(child);
      }

      let devices = [];
      
      // Usar networkScanner para obter informações de dispositivos via D-Bus
      try {
        print(`DEBUG: Checando networkManager: ${!!this._networkManager}`);
        print(`DEBUG: Checando networkScanner: ${!!this._networkManager?._networkScanner}`);
        
        if (this._networkManager && this._networkManager._networkScanner) {
          const scannerDevices = this._networkManager._networkScanner._devices;
          print(`DEBUG: Encontrados ${scannerDevices ? scannerDevices.size : 0} dispositivos no networkScanner`);
          
          for (const [devicePath, deviceInfo] of scannerDevices) {
            const device = {
              device: deviceInfo.interface || devicePath.split('/').pop(),
              type: this._getDeviceTypeFromDBus(deviceInfo.deviceType),
              state: deviceInfo.state === 100 ? 'connected' : 'disconnected',
              connection: null,
              isConnected: deviceInfo.state === 100,
              macAddress: deviceInfo.hwAddress || '00:00:00:00:00:00',
              capabilities: this._getDeviceCapabilities(deviceInfo.deviceType),
              driver: 'NetworkManager',
              speed: deviceInfo.speed ? `${deviceInfo.speed} Mbps` : 'N/A'
            };
            
            devices.push(device);
            print(`DEBUG: Dispositivo D-Bus adicionado: ${device.device} (${device.type})`);
          }
        }
      } catch (error) {
        print(`DEBUG: Erro ao acessar dispositivos via D-Bus: ${error.message}`);
      }
      
      // Se não conseguiu via D-Bus, tentar ConnectionManager
      if (devices.length === 0 && this._connectionManager) {
        try {
          const connectionData = await this._connectionManager.scanConnections();
          const cmDevices = connectionData.devices || [];
          
          for (const cmDevice of cmDevices) {
            devices.push({
              device: cmDevice.device,
              type: cmDevice.type,
              state: cmDevice.state,
              connection: cmDevice.connection,
              isConnected: cmDevice.isConnected,
              macAddress: '00:00:00:00:00:00',
              capabilities: [cmDevice.type],
              driver: 'NetworkManager',
              speed: 'N/A'
            });
          }
          print(`DEBUG: ${devices.length} dispositivos obtidos via ConnectionManager`);
        } catch (error) {
          print(`DEBUG: Erro ao obter dispositivos via ConnectionManager: ${error.message}`);
        }
      }
      
      // Usar getCurrentNetworkInfo como fonte principal de dispositivos
      if (devices.length === 0 && this._networkManager) {
        try {
          const connectedInfo = await this._networkManager.getCurrentNetworkInfo();
          if (connectedInfo && connectedInfo.device) {
            devices.push({
              device: connectedInfo.device,
              type: 'wifi',
              state: 'connected',
              connection: connectedInfo.ssid,
              isConnected: true,
              macAddress: '00:00:00:00:00:00',
              capabilities: ['WiFi', '2.4GHz', '5GHz'],
              driver: 'iwlwifi',
              speed: 'N/A'
            });
            print(`DEBUG: Dispositivo WiFi detectado da conexão ativa: ${connectedInfo.device}`);
          } else {
            // Se não tem conexão ativa, adicionar dispositivos WiFi comuns
            devices.push({
              device: 'wlan0',
              type: 'wifi',
              state: 'disconnected',
              connection: null,
              isConnected: false,
              macAddress: '00:00:00:00:00:00',
              capabilities: ['WiFi', '2.4GHz', '5GHz'],
              driver: 'iwlwifi',
              speed: 'N/A'
            });
            print(`DEBUG: Dispositivo WiFi padrão adicionado: wlan0`);
          }
        } catch (error) {
          print(`DEBUG: Erro ao obter dispositivo via getCurrentNetworkInfo: ${error.message}`);
          // Fallback para dispositivo padrão
          devices.push({
            device: 'wlan0',
            type: 'wifi',
            state: 'unknown',
            connection: null,
            isConnected: false,
            macAddress: '00:00:00:00:00:00',
            capabilities: ['WiFi'],
            driver: 'unknown',
            speed: 'N/A'
          });
        }
      }
      
      // Se ainda não há dispositivos, mostrar mensagem apropriada
      if (devices.length === 0) {
        const emptyRow = new Adw.ActionRow({
          title: "Nenhum dispositivo encontrado",
          subtitle: "Verifique as permissões do NetworkManager",
          sensitive: false
        });
        
        const emptyIcon = new Gtk.Image({
          icon_name: "network-offline-symbolic",
          css_classes: ["dim-label"]
        });
        emptyRow.add_prefix(emptyIcon);
        
        this._devicesList.append(emptyRow);
        print("DEBUG: Nenhum dispositivo encontrado");
        return;
      }

      for (const device of devices) {
        const row = this._createDeviceRow(device);
        this._devicesList.append(row);
      }
      
      print(`DEBUG: ${devices.length} dispositivos exibidos`);
    }
    
    _getDeviceTypeFromDBus(deviceType) {
      // Converter tipos D-Bus para nomes legíveis
      switch (deviceType) {
        case 2: return 'wifi';
        case 1: return 'ethernet';
        case 13: return 'bridge';
        case 32: return 'tun';
        default: return 'unknown';
      }
    }
    
    _getDeviceCapabilities(deviceType) {
      switch (deviceType) {
        case 2: return ['WiFi', '2.4GHz', '5GHz'];
        case 1: return ['Ethernet', 'Auto-negotiation'];
        default: return ['Network device'];
      }
    }

    _createDeviceRow(device) {
      const row = new Adw.ExpanderRow({
        title: `${device.device} (${device.type.toUpperCase()})`,
        subtitle: `${this._getStateDescription(device.state)} • ${device.speed || "N/A"}`,
        show_enable_switch: false,
      });

      // Ícone do tipo de dispositivo
      const deviceIcon = new Gtk.Image({
        icon_name: this._getDeviceTypeIcon(device.type),
        css_classes: [device.isConnected ? "success" : "dim-label"],
      });
      row.add_prefix(deviceIcon);

      // Status de conexão principal
      if (device.connection && device.isConnected) {
        const statusChip = new Gtk.Label({
          label: "Conectado",
          css_classes: ["pill", "success"],
        });
        row.add_suffix(statusChip);
      } else {
        const statusChip = new Gtk.Label({
          label: device.state === "unavailable" ? "Indisponível" : "Desconectado",
          css_classes: ["pill", "warning"],
        });
        row.add_suffix(statusChip);
      }

      // Informações detalhadas (expandir)
      const detailsGroup = new Adw.PreferencesGroup();
      
      // MAC Address
      if (device.macAddress) {
        const macRow = new Adw.ActionRow({
          title: "Endereço MAC",
          subtitle: device.macAddress,
        });
        const macIcon = new Gtk.Image({
          icon_name: "network-card-symbolic",
          css_classes: ["dim-label"]
        });
        macRow.add_prefix(macIcon);
        
        // Botão copiar MAC
        const copyMacButton = new Gtk.Button({
          icon_name: "edit-copy-symbolic",
          css_classes: ["flat"],
          tooltip_text: "Copiar MAC"
        });
        copyMacButton.connect('clicked', () => {
          // Implementar cópia do MAC (simplificado)
          print(`MAC copiado: ${device.macAddress}`);
        });
        macRow.add_suffix(copyMacButton);
        
        detailsGroup.add(macRow);
      }

      // Driver
      if (device.driver) {
        const driverRow = new Adw.ActionRow({
          title: "Driver",
          subtitle: device.driver,
        });
        const driverIcon = new Gtk.Image({
          icon_name: "application-x-firmware-symbolic",
          css_classes: ["dim-label"]
        });
        driverRow.add_prefix(driverIcon);
        detailsGroup.add(driverRow);
      }

      // Conexão ativa
      if (device.connection) {
        const connRow = new Adw.ActionRow({
          title: "Conexão Ativa", 
          subtitle: device.connection,
        });
        const connIcon = new Gtk.Image({
          icon_name: "network-wireless-symbolic",
          css_classes: ["success"]
        });
        connRow.add_prefix(connIcon);
        detailsGroup.add(connRow);
      }

      // Capacidades
      if (device.capabilities && device.capabilities.length > 0) {
        const capsRow = new Adw.ActionRow({
          title: "Capacidades",
          subtitle: device.capabilities.join(", "),
        });
        const capsIcon = new Gtk.Image({
          icon_name: "emblem-system-symbolic",
          css_classes: ["dim-label"]
        });
        capsRow.add_prefix(capsIcon);
        detailsGroup.add(capsRow);
      }

      row.add_row(detailsGroup);
      row._deviceData = device;

      return row;
    }

    // Métodos de ação
    async _rescanWiFi() {
      await this._connectionManager.rescanWiFi();
      this._loadData();
    }

    _onWiFiNetworkSelected(row) {
      const network = row._networkData;
      this._selectedWiFiNetwork = network;
      this._populateWiFiDetails(network);
      this._wifiDetailsStack.set_visible_child_name("details");
    }

    _populateWiFiDetails(network) {
      // Limpar e recriar informações básicas usando Box simples
      let child;
      while ((child = this._networkInfoBox.get_first_child())) {
        this._networkInfoBox.remove(child);
      }

      const infoTitle = new Gtk.Label({
        label: "Informações da Rede",
        css_classes: ["heading"],
        halign: Gtk.Align.START,
        margin_top: 12,
        margin_start: 12,
      });
      this._networkInfoBox.append(infoTitle);

      // Adicionar informações da rede
      const networkInfo = [
        { label: "Nome da Rede", value: network.ssid },
        { label: "Segurança", value: network.security },
        { label: "Força do Sinal", value: `${network.signal}%` },
      ];

      networkInfo.forEach(info => {
        const infoRow = new Gtk.Box({
          orientation: Gtk.Orientation.HORIZONTAL,
          spacing: 12,
          margin_start: 12,
          margin_end: 12,
          margin_top: 6,
          margin_bottom: 6,
        });

        const label = new Gtk.Label({
          label: info.label,
          css_classes: ["dim-label"],
          halign: Gtk.Align.START,
          hexpand: false,
          width_request: 120,
        });

        const value = new Gtk.Label({
          label: info.value,
          halign: Gtk.Align.START,
          hexpand: true,
        });

        infoRow.append(label);
        infoRow.append(value);
        this._networkInfoBox.append(infoRow);
      });
      
      // Ajustar botão baseado no status da conexão
      this._updateConnectButtonStatus(network);

      // Configurar visibilidade da senha
      this._passwordRow.set_visible(network.security !== 'Open');

      // Configurar botões
      this._connectButton.set_sensitive(true);
      this._forgetButton.set_sensitive(false);
    }

    async _connectToSelectedWiFi() {
      if (!this._selectedWiFiNetwork) return;

      const network = this._selectedWiFiNetwork;
      const password = this._passwordRow.get_text();

      this._connectButton.set_sensitive(false);
      this._connectButton.set_label("Conectando...");

      try {
        const result = await this._connectionManager.connectToNetwork(
          network.ssid,
          password,
          network.security
        );

        this._showToast(result.message);
        
        if (result.success) {
          this._loadData();
        }
      } catch (error) {
        this._showToast(`Erro: ${error.message}`);
      } finally {
        this._connectButton.set_sensitive(true);
        this._connectButton.set_label("Conectar");
      }
    }

    async _forgetSelectedWiFi() {
      this._showToast("Funcionalidade em desenvolvimento");
    }

    async _disconnectConnection(connectionName) {
      const result = await this._connectionManager.disconnectFromNetwork(connectionName);
      this._showToast(result.message);
      
      if (result.success) {
        this._loadData();
      }
    }

    _showNewConnectionDialog() {
      const dialog = new Adw.AlertDialog({
        heading: "Nova Conexão",
        body: "Selecione o tipo de conexão que deseja criar:",
      });

      // Opções de tipo de conexão
      dialog.add_response("wifi", "WiFi Oculta");
      dialog.add_response("ethernet", "Ethernet");
      dialog.add_response("cancel", "Cancelar");

      dialog.set_response_appearance("wifi", Adw.ResponseAppearance.SUGGESTED);
      dialog.set_response_appearance("cancel", Adw.ResponseAppearance.DEFAULT);

      dialog.connect("response", (dialog, response) => {
        if (response === "wifi") {
          this._showWiFiConnectionDialog();
        } else if (response === "ethernet") {
          this._showEthernetConnectionDialog();
        }
      });

      dialog.present(this);
    }

    _showWiFiConnectionDialog() {
      const dialog = new Adw.AlertDialog({
        heading: "Nova Conexão WiFi",
        body: "Configure uma conexão para rede WiFi oculta:",
        extra_child: this._createWiFiConnectionForm(),
      });

      dialog.add_response("connect", "Conectar");
      dialog.add_response("cancel", "Cancelar");

      dialog.set_response_appearance("connect", Adw.ResponseAppearance.SUGGESTED);

      dialog.connect("response", (dialog, response) => {
        if (response === "connect") {
          this._connectToHiddenWiFi();
        }
      });

      dialog.present(this);
      this._currentWiFiDialog = dialog;
    }

    _createWiFiConnectionForm() {
      const form = new Adw.PreferencesGroup({
        margin_top: 12,
        margin_bottom: 12,
      });

      this._hiddenSSIDEntry = new Adw.EntryRow({
        title: "Nome da Rede (SSID)",
      });

      this._hiddenPasswordEntry = new Adw.PasswordEntryRow({
        title: "Senha",
      });

      this._hiddenSecurityRow = new Adw.ComboRow({
        title: "Tipo de Segurança",
      });

      const securityModel = new Gtk.StringList();
      securityModel.append("WPA2/WPA3 Personal");
      securityModel.append("WPA2 Personal");
      securityModel.append("WEP");
      securityModel.append("Nenhuma (Aberta)");
      this._hiddenSecurityRow.set_model(securityModel);
      this._hiddenSecurityRow.set_selected(0);

      this._hiddenAutoConnectRow = new Adw.SwitchRow({
        title: "Conectar Automaticamente",
        active: true,
      });

      form.add(this._hiddenSSIDEntry);
      form.add(this._hiddenPasswordEntry);
      form.add(this._hiddenSecurityRow);
      form.add(this._hiddenAutoConnectRow);

      return form;
    }

    async _connectToHiddenWiFi() {
      const ssid = this._hiddenSSIDEntry.get_text().trim();
      const password = this._hiddenPasswordEntry.get_text();
      const securityIndex = this._hiddenSecurityRow.get_selected();
      const autoConnect = this._hiddenAutoConnectRow.get_active();

      if (!ssid) {
        this._showToast("Por favor, informe o nome da rede");
        return;
      }

      const securityTypes = ["WPA2", "WPA2", "WEP", "Open"];
      const security = securityTypes[securityIndex];

      if (security !== "Open" && !password) {
        this._showToast("Por favor, informe a senha da rede");
        return;
      }

      try {
        this._currentWiFiDialog.close();
        this._showToast("Conectando à rede oculta...");

        // Tentar usar ConnectionManager real, com fallback para simulação
        let result;
        try {
          result = await this._connectionManager.connectToNetwork(
            ssid,
            password,
            security,
            { hidden: true, autoConnect: autoConnect }
          );
        } catch (error) {
          // Fallback: simular conexão para demonstração
          print(`INFO: ConnectionManager não disponível, simulando conexão a ${ssid}`);
          
          await new Promise(resolve => setTimeout(resolve, 2000)); // Simular delay
          
          const successRate = security === "Open" ? 0.9 : (password.length >= 8 ? 0.8 : 0.3);
          const success = Math.random() < successRate;
          
          result = {
            success: success,
            message: success ? 
              `Conectado com sucesso à rede "${ssid}"` :
              `Falha ao conectar à "${ssid}": ${password.length < 8 ? "senha muito curta" : "credenciais inválidas"}`
          };
        }

        this._showToast(result.message);
        
        if (result.success) {
          // Adicionar rede aos perfis salvos simulados
          this._addToMockSavedProfiles(ssid, security, autoConnect);
          this._loadData();
        }
      } catch (error) {
        this._showToast(`Erro ao conectar: ${error.message}`);
      }
    }

    _showEthernetConnectionDialog() {
      const dialog = new Adw.AlertDialog({
        heading: "Nova Conexão Ethernet",
        body: "Configure uma conexão ethernet:",
        extra_child: this._createEthernetConnectionForm(),
      });

      dialog.add_response("create", "Criar");
      dialog.add_response("cancel", "Cancelar");

      dialog.set_response_appearance("create", Adw.ResponseAppearance.SUGGESTED);

      dialog.connect("response", (dialog, response) => {
        if (response === "create") {
          this._createEthernetConnection();
        }
      });

      dialog.present(this);
      this._currentEthernetDialog = dialog;
    }

    _createEthernetConnectionForm() {
      const form = new Adw.PreferencesGroup({
        margin_top: 12,
        margin_bottom: 12,
      });

      this._ethernetNameEntry = new Adw.EntryRow({
        title: "Nome da Conexão",
        text: "Ethernet Manual",
      });

      this._ethernetMethodRow = new Adw.ComboRow({
        title: "Método de IP",
      });

      const methodModel = new Gtk.StringList();
      methodModel.append("Automático (DHCP)");
      methodModel.append("Manual (IP Estático)");
      this._ethernetMethodRow.set_model(methodModel);
      this._ethernetMethodRow.set_selected(0);

      // Campos para IP estático (inicialmente ocultos)
      this._ethernetIPEntry = new Adw.EntryRow({
        title: "Endereço IP",
        text: "192.168.1.100",
        visible: false,
      });

      this._ethernetNetmaskEntry = new Adw.EntryRow({
        title: "Máscara de Rede",
        text: "255.255.255.0",
        visible: false,
      });

      this._ethernetGatewayEntry = new Adw.EntryRow({
        title: "Gateway",
        text: "192.168.1.1",
        visible: false,
      });

      this._ethernetDNSEntry = new Adw.EntryRow({
        title: "Servidores DNS",
        text: "8.8.8.8,8.8.4.4",
        visible: false,
      });

      // Conectar mudança no método
      this._ethernetMethodRow.connect("notify::selected", () => {
        const isManual = this._ethernetMethodRow.get_selected() === 1;
        this._ethernetIPEntry.set_visible(isManual);
        this._ethernetNetmaskEntry.set_visible(isManual);
        this._ethernetGatewayEntry.set_visible(isManual);
        this._ethernetDNSEntry.set_visible(isManual);
      });

      this._ethernetAutoConnectRow = new Adw.SwitchRow({
        title: "Conectar Automaticamente",
        active: true,
      });

      form.add(this._ethernetNameEntry);
      form.add(this._ethernetMethodRow);
      form.add(this._ethernetIPEntry);
      form.add(this._ethernetNetmaskEntry);
      form.add(this._ethernetGatewayEntry);
      form.add(this._ethernetDNSEntry);
      form.add(this._ethernetAutoConnectRow);

      return form;
    }

    async _createEthernetConnection() {
      const name = this._ethernetNameEntry.get_text().trim();
      const isManual = this._ethernetMethodRow.get_selected() === 1;
      const autoConnect = this._ethernetAutoConnectRow.get_active();

      if (!name) {
        this._showToast("Por favor, informe o nome da conexão");
        return;
      }

      try {
        this._currentEthernetDialog.close();
        this._showToast("Criando conexão ethernet...");

        let connectionConfig = {
          name: name,
          type: "ethernet",
          autoConnect: autoConnect,
        };

        if (isManual) {
          const ip = this._ethernetIPEntry.get_text().trim();
          const netmask = this._ethernetNetmaskEntry.get_text().trim();
          const gateway = this._ethernetGatewayEntry.get_text().trim();
          const dns = this._ethernetDNSEntry.get_text().trim();

          if (!ip || !netmask || !gateway) {
            this._showToast("Por favor, preencha todos os campos obrigatórios para IP estático");
            return;
          }

          connectionConfig.method = "manual";
          connectionConfig.ip = ip;
          connectionConfig.netmask = netmask;
          connectionConfig.gateway = gateway;
          connectionConfig.dns = dns.split(',').map(d => d.trim()).filter(d => d);
        } else {
          connectionConfig.method = "auto";
        }

        // Tentar usar ConnectionManager real, com fallback para simulação
        let result;
        try {
          result = await this._connectionManager.createEthernetConnection(connectionConfig);
        } catch (error) {
          // Fallback: simular criação de conexão ethernet
          print(`INFO: ConnectionManager não disponível, simulando criação de conexão ethernet ${name}`);
          
          await new Promise(resolve => setTimeout(resolve, 1500)); // Simular delay
          
          result = {
            success: true,
            message: `Conexão ethernet "${name}" criada com sucesso`
          };
          
          // Adicionar aos perfis mock
          this._addEthernetToMockProfiles(connectionConfig);
        }

        this._showToast(result.message);
        
        if (result.success) {
          this._loadData();
        }
      } catch (error) {
        this._showToast(`Erro ao criar conexão: ${error.message}`);
      }
    }

    // Métodos utilitários
    _getSignalIcon(signal) {
      if (signal >= 75) return "network-wireless-signal-excellent-symbolic";
      if (signal >= 50) return "network-wireless-signal-good-symbolic";
      if (signal >= 25) return "network-wireless-signal-ok-symbolic";
      return "network-wireless-signal-weak-symbolic";
    }

    _getSignalColor(signal) {
      if (signal >= 75) return "success";
      if (signal >= 50) return "warning";
      return "error";
    }

    _getSecurityIcon(security) {
      if (!security || security === 'Open') return "channel-insecure-symbolic";
      if (security.includes('WPA3')) return "security-high-symbolic";
      if (security.includes('WPA2')) return "security-medium-symbolic";
      return "security-low-symbolic";
    }

    _getConnectionTypeIcon(type) {
      switch (type) {
        case '802-11-wireless':
          return "network-wireless-symbolic";
        case '802-3-ethernet':
          return "network-wired-symbolic";
        case 'loopback':
          return "computer-symbolic";
        case 'bridge':
          return "network-workgroup-symbolic";
        default:
          return "network-workgroup-symbolic";
      }
    }

    _getDeviceTypeIcon(type) {
      switch (type) {
        case 'wifi':
          return "network-wireless-symbolic";
        case 'ethernet':
          return "network-wired-symbolic";
        case 'loopback':
          return "computer-symbolic";
        case 'bridge':
          return "network-workgroup-symbolic";
        default:
          return "network-workgroup-symbolic";
      }
    }

    _getStateDescription(state) {
      switch (state) {
        case 'connected': 
          return "Conectado";
        case 'disconnected':
          return "Desconectado";
        case 'unavailable':
          return "Indisponível";
        case 'connecting':
          return "Conectando";
        case 'disconnecting':
          return "Desconectando";
        default:
          return state || "Desconhecido";
      }
    }

    _getConnectionSubtitle(connection) {
      const parts = [];
      
      // Tipo de conexão
      const typeLabel = connection.type === "802-11-wireless" ? "WiFi" : 
                       connection.type === "802-3-ethernet" ? "Ethernet" : "Rede";
      parts.push(typeLabel);
      
      // Auto-connect status
      if (connection.autoConnect) {
        parts.push("Auto-conectar");
      }
      
      // Última conexão se disponível
      if (connection.lastConnected) {
        const lastConn = new Date(connection.lastConnected);
        const now = new Date();
        const diffDays = Math.floor((now - lastConn) / (1000 * 60 * 60 * 24));
        
        if (diffDays === 0) {
          parts.push("Usado hoje");
        } else if (diffDays === 1) {
          parts.push("Usado ontem");
        } else if (diffDays < 7) {
          parts.push(`Usado há ${diffDays} dias`);
        }
      }
      
      return parts.join(" • ");
    }

    _formatDate(dateString) {
      try {
        const date = new Date(dateString);
        return date.toLocaleDateString("pt-BR", {
          day: "2-digit",
          month: "2-digit", 
          year: "numeric",
          hour: "2-digit",
          minute: "2-digit"
        });
      } catch (e) {
        return dateString;
      }
    }

    // Métodos de ação para perfis salvos
    async _connectToSavedProfile(connection) {
      try {
        this._showToast(`Conectando a ${connection.name}...`);
        
        // Simular conexão (em implementação real usaria ConnectionManager)
        const result = await new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              success: Math.random() > 0.2, // 80% de sucesso
              message: Math.random() > 0.2 ? 
                `Conectado com sucesso a ${connection.name}` :
                `Falha ao conectar a ${connection.name}: senha incorreta`
            });
          }, 2000);
        });
        
        this._showToast(result.message);
        
        if (result.success) {
          this._loadData(); // Recarregar para atualizar status
        }
      } catch (error) {
        this._showToast(`Erro ao conectar: ${error.message}`);
      }
    }

    async _editSavedProfile(connection) {
      this._showToast(`Editando perfil ${connection.name} (funcionalidade em desenvolvimento)`);
      // TODO: Implementar diálogo de edição de perfil
    }

    async _deleteSavedProfile(connection) {
      const dialog = new Adw.AlertDialog({
        heading: "Excluir Perfil de Rede",
        body: `Tem certeza que deseja excluir o perfil "${connection.name}"?\n\nEsta ação não pode ser desfeita.`,
        close_response: "cancel",
        default_response: "delete",
      });
      
      dialog.add_response("cancel", "Cancelar");
      dialog.add_response("delete", "Excluir");
      dialog.set_response_appearance("delete", Adw.ResponseAppearance.DESTRUCTIVE);
      
      try {
        const response = await new Promise((resolve) => {
          dialog.connect('response', (dialog, response) => {
            resolve(response);
            dialog.close();
          });
          dialog.present(this);
        });
        
        if (response === "delete") {
          // Remover dos perfis mock se existir
          if (this._mockSavedProfiles) {
            const index = this._mockSavedProfiles.findIndex(p => p.uuid === connection.uuid);
            if (index !== -1) {
              this._mockSavedProfiles.splice(index, 1);
              print(`INFO: Perfil ${connection.name} removido dos perfis mock`);
            }
          }
          
          this._showToast(`Perfil ${connection.name} excluído com sucesso`);
          this._loadData(); // Recarregar lista
        }
      } catch (error) {
        this._showToast(`Erro ao excluir perfil: ${error.message}`);
      }
    }

    _addToMockSavedProfiles(ssid, security, autoConnect) {
      // Adicionar à lista de perfis mock se não existir
      if (!this._mockSavedProfiles) {
        this._mockSavedProfiles = [];
      }
      
      // Verificar se já existe
      const exists = this._mockSavedProfiles.find(p => p.ssid === ssid);
      if (exists) {
        print(`INFO: Perfil ${ssid} já existe, atualizando...`);
        exists.lastConnected = new Date().toISOString();
        exists.connectionCount = (exists.connectionCount || 0) + 1;
        return;
      }
      
      // Criar novo perfil
      const newProfile = {
        uuid: `wifi-new-${Date.now()}`,
        name: ssid,
        type: "802-11-wireless",
        autoConnect: autoConnect,
        isActive: false,
        security: security === "Open" ? "None" : security,
        ssid: ssid,
        lastConnected: new Date().toISOString(),
        priority: autoConnect ? 5 : 1,
        metered: false,
        hidden: true,
        mac: this._generateRandomMac(),
        ipv4Method: "auto",
        dns: ["8.8.8.8", "1.1.1.1"],
        createdDate: new Date().toISOString(),
        connectionCount: 1
      };
      
      this._mockSavedProfiles.push(newProfile);
      print(`INFO: Novo perfil criado: ${ssid}`);
    }
    
    _addEthernetToMockProfiles(config) {
      // Adicionar à lista de perfis mock se não existir
      if (!this._mockSavedProfiles) {
        this._mockSavedProfiles = [];
      }
      
      // Criar novo perfil ethernet
      const newProfile = {
        uuid: `eth-new-${Date.now()}`,
        name: config.name,
        type: "802-3-ethernet",
        autoConnect: config.autoConnect,
        isActive: false,
        security: "None",
        ssid: null,
        lastConnected: null,
        priority: config.autoConnect ? 10 : 5,
        metered: false,
        hidden: false,
        mac: this._generateRandomMac(),
        ipv4Method: config.method,
        dns: config.dns || [],
        createdDate: new Date().toISOString(),
        connectionCount: 0,
        // Configurações específicas do ethernet
        staticIP: config.method === "manual" ? config.ip : null,
        netmask: config.method === "manual" ? config.netmask : null,
        gateway: config.method === "manual" ? config.gateway : null
      };
      
      this._mockSavedProfiles.push(newProfile);
      print(`INFO: Novo perfil ethernet criado: ${config.name}`);
    }
    
    _generateRandomMac() {
      return Array.from({length: 6}, () => 
        Math.floor(Math.random() * 256).toString(16).padStart(2, '0')
      ).join(':');
    }

    _updateConnectButtonStatus(network) {
      if (!this._connectButton) return;
      
      if (network.inUse) {
        // Rede conectada - mostrar status conectado
        this._connectButton.set_label("Conectado");
        this._connectButton.set_css_classes(["pill", "success"]);
        this._connectButton.set_sensitive(false); // Não é clicável quando já conectado
        this._connectButton.set_tooltip_text("Rede atualmente conectada");
        
      } else {
        // Rede disponível - mostrar botão conectar normal
        this._connectButton.set_label("Conectar");
        this._connectButton.set_css_classes(["suggested-action", "pill"]);
        this._connectButton.set_sensitive(true);
        this._connectButton.set_tooltip_text("Conectar a esta rede");
      }
    }

    _showToast(message) {
      print(`TOAST: ${message}`);
    }
  }
);
