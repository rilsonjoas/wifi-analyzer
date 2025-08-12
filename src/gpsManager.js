// gpsManager.js - GPS Management for WiFi Analyzer

const { GObject, Gio, GLib } = imports.gi;

var GPSCoordinate = GObject.registerClass(
  {
    GTypeName: "GPSCoordinate",
  },
  class GPSCoordinate extends GObject.Object {
    _init(params = {}) {
      super._init(params);
      this.latitude = 0.0;
      this.longitude = 0.0;
      this.altitude = 0.0;
      this.accuracy = 0.0;
      this.timestamp = new Date();
      this.isValid = false;
      this.speed = 0.0;
      this.heading = 0.0;
    }

    copy(other) {
      this.latitude = other.latitude;
      this.longitude = other.longitude;
      this.altitude = other.altitude;
      this.accuracy = other.accuracy;
      this.timestamp = new Date(other.timestamp);
      this.isValid = other.isValid;
      this.speed = other.speed;
      this.heading = other.heading;
    }

    toJson() {
      return JSON.stringify({
        latitude: this.latitude,
        longitude: this.longitude,
        altitude: this.altitude,
        accuracy: this.accuracy,
        timestamp: this.timestamp.toISOString(),
        isValid: this.isValid,
        speed: this.speed,
        heading: this.heading
      });
    }

    fromJson(jsonStr) {
      const data = JSON.parse(jsonStr);
      this.latitude = data.latitude || 0.0;
      this.longitude = data.longitude || 0.0;
      this.altitude = data.altitude || 0.0;
      this.accuracy = data.accuracy || 0.0;
      this.timestamp = new Date(data.timestamp || Date.now());
      this.isValid = data.isValid || false;
      this.speed = data.speed || 0.0;
      this.heading = data.heading || 0.0;
    }
  }
);

var GPSManager = GObject.registerClass(
  {
    GTypeName: "GPSManager",
    Signals: {
      'location-updated': {
        param_types: [GPSCoordinate.$gtype]
      },
      'gps-status-changed': {
        param_types: [GObject.TYPE_BOOLEAN]
      }
    }
  },
  class GPSManager extends GObject.Object {
    _init(params = {}) {
      super._init(params);
      this._currentLocation = new GPSCoordinate();
      this._isEnabled = false;
      this._mockMode = false;
      this._updateInterval = null;
      this._geoclue = null;
      
      this._initGeoClue();
    }

    _initGeoClue() {
      // Implementação básica - em um ambiente real usaria GeoClue2
      // Por enquanto vamos simular ou usar coordenadas fixas
      this._mockMode = true;
      
      // Coordenadas de exemplo (São Paulo)
      this._currentLocation.latitude = -23.5505;
      this._currentLocation.longitude = -46.6333;
      this._currentLocation.altitude = 760.0;
      this._currentLocation.accuracy = 10.0;
      this._currentLocation.isValid = false; // Desabilitado por padrão
    }

    enable() {
      if (this._isEnabled) return;
      
      this._isEnabled = true;
      
      if (this._mockMode) {
        // Simular atualizações GPS
        this._updateInterval = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 5, () => {
          this._updateMockLocation();
          return GLib.SOURCE_CONTINUE;
        });
      }
      
      this.emit('gps-status-changed', true);
    }

    disable() {
      if (!this._isEnabled) return;
      
      this._isEnabled = false;
      this._currentLocation.isValid = false;
      
      if (this._updateInterval) {
        GLib.source_remove(this._updateInterval);
        this._updateInterval = null;
      }
      
      this.emit('gps-status-changed', false);
    }

    _updateMockLocation() {
      if (!this._isEnabled) return;
      
      // Simular pequenas variações na localização
      const variation = 0.0001; // ~10 metros
      this._currentLocation.latitude += (Math.random() - 0.5) * variation;
      this._currentLocation.longitude += (Math.random() - 0.5) * variation;
      this._currentLocation.timestamp = new Date();
      this._currentLocation.isValid = true;
      
      this.emit('location-updated', this._currentLocation);
    }

    getCurrentLocation() {
      return this._currentLocation;
    }

    isEnabled() {
      return this._isEnabled;
    }

    isValid() {
      return this._currentLocation.isValid;
    }

    // Calcular distância entre duas coordenadas (em metros)
    static calculateDistance(coord1, coord2) {
      const R = 6371000; // Raio da Terra em metros
      const φ1 = coord1.latitude * Math.PI / 180;
      const φ2 = coord2.latitude * Math.PI / 180;
      const Δφ = (coord2.latitude - coord1.latitude) * Math.PI / 180;
      const Δλ = (coord2.longitude - coord1.longitude) * Math.PI / 180;

      const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                Math.cos(φ1) * Math.cos(φ2) *
                Math.sin(Δλ/2) * Math.sin(Δλ/2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

      return R * c;
    }
  }
);
