// networkManagementWindow.js - Complete network management interface

const { GObject, Gtk, Adw, Gio, GLib } = imports.gi;
const { ConnectionManager } = imports.connectionManager;

var NetworkManagementWindow = GObject.registerClass(
  {
    GTypeName: "NetworkManagementWindow",
  },
  class NetworkManagementWindow extends Adw.ApplicationWindow {
    _init(params = {}) {
      super._init({
        title: "Gerenciamento de Redes",
        default_width: 1000,
        default_height: 700,
        modal: false,
      });

      this._connectionManager = new ConnectionManager();
      this._currentData = { saved: [], active: [], devices: [] };
      this._selectedConnection = null;
      this._availableNetworks = [];
      
      this._buildUI();
      this._setupSignals();
      this._loadData();
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
        
        this._updateConnectionsView();
        this._updateDevicesView();
        this._updateWiFiView();
      } catch (error) {
        print(`Erro ao carregar dados: ${error.message}`);
      }
    }

    _updateWiFiView() {
      // Limpar lista atual
      let child;
      while ((child = this._wifiListBox.get_first_child())) {
        this._wifiListBox.remove(child);
      }

      // Adicionar redes disponíveis
      for (const network of this._availableNetworks) {
        const row = this._createWiFiNetworkRow(network);
        this._wifiListBox.append(row);
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

    _updateConnectionsView() {
      // Atualizar conexões ativas
      let child;
      while ((child = this._activeConnectionsList.get_first_child())) {
        this._activeConnectionsList.remove(child);
      }

      for (const connection of this._currentData.active) {
        const row = this._createActiveConnectionRow(connection);
        this._activeConnectionsList.append(row);
      }

      // Atualizar conexões salvas
      while ((child = this._savedConnectionsList.get_first_child())) {
        this._savedConnectionsList.remove(child);
      }

      for (const connection of this._currentData.saved) {
        if (!connection.isActive) {
          const row = this._createSavedConnectionRow(connection);
          this._savedConnectionsList.append(row);
        }
      }
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
      const row = new Adw.ActionRow({
        title: connection.name,
        subtitle: `${connection.type} • ${connection.autoConnect ? 'Auto-conectar' : 'Manual'}`,
      });

      // Ícone do tipo de conexão
      const typeIcon = new Gtk.Image({
        icon_name: this._getConnectionTypeIcon(connection.type),
        css_classes: ["dim-label"],
      });

      row.add_prefix(typeIcon);
      row._connectionData = connection;

      return row;
    }

    _updateDevicesView() {
      let child;
      while ((child = this._devicesList.get_first_child())) {
        this._devicesList.remove(child);
      }

      for (const device of this._currentData.devices) {
        const row = this._createDeviceRow(device);
        this._devicesList.append(row);
      }
    }

    _createDeviceRow(device) {
      const row = new Adw.ActionRow({
        title: device.device,
        subtitle: `${device.type} • ${device.state}`,
      });

      // Ícone do tipo de dispositivo
      const deviceIcon = new Gtk.Image({
        icon_name: this._getDeviceTypeIcon(device.type),
        css_classes: [device.isConnected ? "success" : "dim-label"],
      });

      // Status de conexão
      if (device.connection) {
        const connectionLabel = new Gtk.Label({
          label: device.connection,
          css_classes: ["caption"],
        });
        row.add_suffix(connectionLabel);
      }

      row.add_prefix(deviceIcon);
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

        const result = await this._connectionManager.connectToNetwork(
          ssid,
          password,
          security,
          { hidden: true, autoConnect: autoConnect }
        );

        this._showToast(result.message);
        
        if (result.success) {
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

        const result = await this._connectionManager.createEthernetConnection(connectionConfig);

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

    _showToast(message) {
      print(`TOAST: ${message}`);
    }
  }
);
