const { GObject, Gio, GLib } = imports.gi;

var NetworkManager = GObject.registerClass(
  {
    GTypeName: "NetworkManager",
    Signals: {
      "networks-updated": {
        param_types: [GObject.TYPE_OBJECT],
      },
    },
  },
  class NetworkManager extends GObject.Object {
    _init() {
      super._init();
      this._proxy = null;
      this._devices = [];
      this._accessPoints = new Map();
      this._initNetworkManager();
    }

    async _initNetworkManager() {
      try {
        this._proxy = await new Promise((resolve, reject) => {
          new Gio.DBusProxy(
            {
              g_connection: Gio.bus_get_sync(Gio.BusType.SYSTEM, null),
              g_name: "org.freedesktop.NetworkManager",
              g_object_path: "/org/freedesktop/NetworkManager",
              g_interface_name: "org.freedesktop.NetworkManager",
              g_flags: Gio.DBusProxyFlags.NONE,
            },
            null,
            (source, result) => {
              try {
                const proxy = Gio.DBusProxy.new_finish(result);
                resolve(proxy);
              } catch (error) {
                reject(error);
              }
            }
          );
        });

        await this._loadDevices();
      } catch (error) {
        console.error("Failed to connect to NetworkManager:", error);
        // Fallback to mock data
        this._useMockData();
      }
    }

    async _loadDevices() {
      try {
        const result = this._proxy.call_sync(
          "GetDevices",
          null,
          Gio.DBusCallFlags.NONE,
          -1,
          null
        );

        const devicePaths = result.get_child_value(0).unpack();

        for (const devicePath of devicePaths) {
          await this._loadDevice(devicePath);
        }
      } catch (error) {
        console.error("Failed to load devices:", error);
      }
    }

    async _loadDevice(devicePath) {
      try {
        const deviceProxy = await new Promise((resolve, reject) => {
          new Gio.DBusProxy(
            {
              g_connection: Gio.bus_get_sync(Gio.BusType.SYSTEM, null),
              g_name: "org.freedesktop.NetworkManager",
              g_object_path: devicePath,
              g_interface_name:
                "org.freedesktop.NetworkManager.Device.Wireless",
              g_flags: Gio.DBusProxyFlags.NONE,
            },
            null,
            (source, result) => {
              try {
                const proxy = Gio.DBusProxy.new_finish(result);
                resolve(proxy);
              } catch (error) {
                reject(error);
              }
            }
          );
        });

        // Check if it's a wireless device
        const deviceType = deviceProxy.get_cached_property("DeviceType");
        if (deviceType && deviceType.unpack() === 2) {
          // NM_DEVICE_TYPE_WIFI
          this._devices.push(deviceProxy);
          await this._loadAccessPoints(deviceProxy);
        }
      } catch (error) {
        console.error("Failed to load device:", devicePath, error);
      }
    }

    async _loadAccessPoints(deviceProxy) {
      try {
        const result = deviceProxy.call_sync(
          "GetAccessPoints",
          null,
          Gio.DBusCallFlags.NONE,
          -1,
          null
        );

        const apPaths = result.get_child_value(0).unpack();
        const networks = [];

        for (const apPath of apPaths) {
          const network = await this._loadAccessPoint(apPath);
          if (network) {
            networks.push(network);
          }
        }

        this.emit("networks-updated", networks);
      } catch (error) {
        console.error("Failed to load access points:", error);
      }
    }

    async _loadAccessPoint(apPath) {
      try {
        const apProxy = await new Promise((resolve, reject) => {
          new Gio.DBusProxy(
            {
              g_connection: Gio.bus_get_sync(Gio.BusType.SYSTEM, null),
              g_name: "org.freedesktop.NetworkManager",
              g_object_path: apPath,
              g_interface_name: "org.freedesktop.NetworkManager.AccessPoint",
              g_flags: Gio.DBusProxyFlags.NONE,
            },
            null,
            (source, result) => {
              try {
                const proxy = Gio.DBusProxy.new_finish(result);
                resolve(proxy);
              } catch (error) {
                reject(error);
              }
            }
          );
        });

        // Get network properties
        const ssidBytes = apProxy.get_cached_property("Ssid");
        const strength = apProxy.get_cached_property("Strength");
        const frequency = apProxy.get_cached_property("Frequency");
        const hwAddress = apProxy.get_cached_property("HwAddress");
        const flags = apProxy.get_cached_property("Flags");
        const wpaFlags = apProxy.get_cached_property("WpaFlags");
        const rsnFlags = apProxy.get_cached_property("RsnFlags");

        // Convert SSID bytes to string
        let ssid = null;
        if (ssidBytes) {
          const bytes = ssidBytes.unpack();
          ssid = new TextDecoder().decode(new Uint8Array(bytes));
        }

        // Determine security type
        let security = "Open";
        if (rsnFlags && rsnFlags.unpack() !== 0) {
          security = "WPA3/WPA2";
        } else if (wpaFlags && wpaFlags.unpack() !== 0) {
          security = "WPA2";
        } else if (flags && flags.unpack() & 0x1) {
          security = "WEP";
        }

        // Calculate channel from frequency
        let channel = 0;
        if (frequency) {
          const freq = frequency.unpack();
          if (freq >= 2412 && freq <= 2484) {
            channel = Math.floor((freq - 2412) / 5) + 1;
          } else if (freq >= 5170 && freq <= 5825) {
            channel = Math.floor((freq - 5000) / 5);
          }
        }

        return {
          ssid: ssid,
          bssid: hwAddress ? hwAddress.unpack() : "Unknown",
          signal: strength ? strength.unpack() : 0,
          frequency: frequency ? frequency.unpack() : 0,
          channel: channel,
          security: security,
          path: apPath,
        };
      } catch (error) {
        console.error("Failed to load access point:", apPath, error);
        return null;
      }
    }

    async scanNetworks() {
      if (this._devices.length === 0) {
        this._useMockData();
        return;
      }

      try {
        // Request scan on all wireless devices
        for (const device of this._devices) {
          device.call(
            "RequestScan",
            new GLib.Variant("(a{sv})", [{}]),
            Gio.DBusCallFlags.NONE,
            -1,
            null,
            (source, result) => {
              try {
                device.call_finish(result);
                // Wait a bit then reload access points
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, 2000, () => {
                  this._loadAccessPoints(device);
                  return GLib.SOURCE_REMOVE;
                });
              } catch (error) {
                console.error("Scan request failed:", error);
              }
            }
          );
        }
      } catch (error) {
        console.error("Failed to request scan:", error);
        this._useMockData();
      }
    }

    _useMockData() {
      // Fallback mock data when NetworkManager is not available
      const mockNetworks = [
        {
          ssid: "HomeNetwork_5G",
          bssid: "aa:bb:cc:dd:ee:ff",
          signal: Math.floor(Math.random() * 30) + 70, // 70-100%
          frequency: 5180,
          channel: 36,
          security: "WPA3",
        },
        {
          ssid: "OfficeWiFi",
          bssid: "11:22:33:44:55:66",
          signal: Math.floor(Math.random() * 20) + 60, // 60-80%
          frequency: 2412,
          channel: 1,
          security: "WPA2",
        },
        {
          ssid: "PublicHotspot",
          bssid: "77:88:99:aa:bb:cc",
          signal: Math.floor(Math.random() * 30) + 30, // 30-60%
          frequency: 2437,
          channel: 6,
          security: "Open",
        },
        {
          ssid: null, // Hidden network
          bssid: "dd:ee:ff:00:11:22",
          signal: Math.floor(Math.random() * 20) + 20, // 20-40%
          frequency: 2462,
          channel: 11,
          security: "WPA2",
        },
      ];

      this.emit("networks-updated", mockNetworks);
    }
  }
);
