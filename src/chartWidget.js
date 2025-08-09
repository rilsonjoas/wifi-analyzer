const { GObject, Gtk, Gdk, GLib } = imports.gi;
const Cairo = imports.cairo;

var ChartWidget = GObject.registerClass(
  {
    GTypeName: "ChartWidget",
    Properties: {
      "chart-type": GObject.ParamSpec.string(
        "chart-type",
        "Chart Type",
        "Type of chart to display",
        GObject.ParamFlags.READWRITE | GObject.ParamFlags.CONSTRUCT,
        "line"
      ),
    },
  },
  class ChartWidget extends Gtk.Box {
    _init(params = {}) {
      super._init({
        orientation: Gtk.Orientation.VERTICAL,
        spacing: 4,
        hexpand: true,
        vexpand: true,
        css_classes: ["chart-widget"],
        ...params,
      });

      this._chartType = this.chart_type;
      this._data = []; // Array de séries
      this._palette = [
        [0.21, 0.52, 0.89], // azul
        [0.88, 0.11, 0.14], // vermelho
        [0.18, 0.76, 0.49], // verde
        [0.96, 0.77, 0.07], // amarelo
        [0.57, 0.25, 0.67], // roxo
        [0.90, 0.43, 0.10], // laranja
      ];

      this._placeholder = new Gtk.Label({
        label: "Selecione redes para exibir os gráficos",
        css_classes: ["dim-label"],
        halign: Gtk.Align.CENTER,
        valign: Gtk.Align.CENTER,
        justify: Gtk.Justification.CENTER,
        wrap: true,
      });

      this._area = new Gtk.DrawingArea({
        hexpand: true,
        vexpand: true,
      });
      this._area.set_draw_func((area, cr, w, h) => this._onDraw(cr, w, h));

      this._stack = new Gtk.Stack({ transition_type: Gtk.StackTransitionType.CROSSFADE });
      this._stack.add_named(this._placeholder, "placeholder");
      this._stack.add_named(this._area, "area");
      this.append(this._stack);
      this._updateVisible();
    }

    set chart_type(val) {
      this._chartType = val;
      this.notify("chart-type");
      this.queue_draw();
    }

    get chart_type() {
      return this._chartType;
    }

    setData(data) {
      this._data = data || [];
      this._updateVisible();
      this._area.queue_draw();
    }

    clearData() {
      this._data = [];
      this._updateVisible();
      this._area.queue_draw();
    }

    _updateVisible() {
      if (this._data && this._data.length > 0) {
        this._stack.set_visible_child_name("area");
      } else {
        this._stack.set_visible_child_name("placeholder");
      }
    }

    queue_draw() {
      if (this._area) this._area.queue_draw();
    }

    _onDraw(cr, width, height) {
      // Fundo
      cr.setSourceRGBA(0.12, 0.12, 0.12, 0.9);
      cr.rectangle(0, 0, width, height);
      cr.fill();

      if (!this._data || this._data.length === 0) return;

      switch (this._chartType) {
        case "line":
          this._drawLineChart(cr, width, height);
          break;
        case "spectrum":
          this._drawSpectrumChart(cr, width, height);
          break;
        case "channel":
        case "channel-map":
          this._drawChannelChart(cr, width, height);
          break;
        case "bars":
        case "signal-bars":
          this._drawBarsChart(cr, width, height);
          break;
        default:
          this._drawLineChart(cr, width, height);
      }
    }

    _commonAxes(cr, width, height, { minX, maxX, minY, maxY, yLabel }) {
      const padL = 50, padR = 10, padT = 10, padB = 30;
      // Eixo Y
      cr.setSourceRGBA(1, 1, 1, 0.3);
      cr.setLineWidth(1);
      cr.moveTo(padL, padT);
      cr.lineTo(padL, height - padB);
      cr.lineTo(width - padR, height - padB);
      cr.stroke();

      // Grades horizontais
      const steps = 5;
      for (let i = 0; i <= steps; i++) {
        const y = padT + ((height - padT - padB) * i) / steps;
        cr.setSourceRGBA(1, 1, 1, 0.08);
        cr.moveTo(padL, y);
        cr.lineTo(width - padR, y);
        cr.stroke();
        const val = maxY - ((maxY - minY) * i) / steps;
        cr.setSourceRGBA(1, 1, 1, 0.5);
        cr.selectFontFace("Sans", Cairo.FontSlant.NORMAL, Cairo.FontWeight.NORMAL);
        cr.setFontSize(10);
        cr.moveTo(8, y + 4);
        cr.showText(Math.round(val).toString());
      }

      // Label Y
      if (yLabel) {
        cr.save();
        cr.translate(15, height / 2);
        cr.rotate(-Math.PI / 2);
        cr.setSourceRGBA(1, 1, 1, 0.6);
        cr.selectFontFace("Sans", Cairo.FontSlant.NORMAL, Cairo.FontWeight.BOLD);
        cr.setFontSize(11);
        cr.showText(yLabel);
        cr.restore();
      }

      return { padL, padR, padT, padB, plotW: width - padL - padR, plotH: height - padT - padB };
    }

    _drawLineChart(cr, width, height) {
      // Preparar ranges
      const allPoints = this._data.flatMap(s => s.data);
      if (allPoints.length === 0) return;
      const minX = Math.min(...allPoints.map(p => p.x));
      const maxX = Math.max(...allPoints.map(p => p.x));
      const minY = 0;
      const maxY = 100; // sinal percentual

      const ctx = this._commonAxes(cr, width, height, { minX, maxX, minY, maxY, yLabel: "% Sinal" });

      this._data.forEach((series, idx) => {
        const color = this._palette[idx % this._palette.length];
        cr.setSourceRGBA(...color, 0.9);
        cr.setLineWidth(2);
        series.data.forEach((p, i) => {
          const x = ctx.padL + ((p.x - minX) / (maxX - minX || 1)) * ctx.plotW;
            const y = ctx.padT + ((maxY - p.y) / (maxY - minY || 1)) * ctx.plotH;
          if (i === 0) cr.moveTo(x, y); else cr.lineTo(x, y);
        });
        cr.stroke();
      });

      this._drawLegend(cr, width, height);
    }

    _drawSpectrumChart(cr, width, height) {
      // Frequência no eixo X, sinal Y
      const allPoints = this._data.flatMap(s => s.data);
      if (allPoints.length === 0) return;
      const minX = Math.min(...allPoints.map(p => p.x));
      const maxX = Math.max(...allPoints.map(p => p.x));
      const minY = 0; const maxY = 100;
      const ctx = this._commonAxes(cr, width, height, { minX, maxX, minY, maxY, yLabel: "% Sinal" });

      this._data.forEach((series, idx) => {
        const color = this._palette[idx % this._palette.length];
        cr.setSourceRGBA(...color, 0.4);
        // Área
        cr.moveTo(ctx.padL, height - ctx.padB);
        series.data.forEach((p, i) => {
          const x = ctx.padL + ((p.x - minX) / (maxX - minX || 1)) * ctx.plotW;
          const y = ctx.padT + ((maxY - p.y) / (maxY - minY || 1)) * ctx.plotH;
          cr.lineTo(x, y);
        });
        cr.lineTo(ctx.padL + ctx.plotW, height - ctx.padB);
        cr.closePath();
        cr.fill();
      });

      this._drawLegend(cr, width, height);
    }

    _drawChannelChart(cr, width, height) {
      const allPoints = this._data.flatMap(s => s.data);
      if (allPoints.length === 0) return;
      const minX = Math.min(...allPoints.map(p => p.x));
      const maxX = Math.max(...allPoints.map(p => p.x));
      const minY = 0; const maxY = 100;
      const ctx = this._commonAxes(cr, width, height, { minX, maxX, minY, maxY, yLabel: "% Sinal" });

      // Desenhar pontos + elipses de canal (simples)
      this._data.forEach((series, idx) => {
        const color = this._palette[idx % this._palette.length];
        cr.setSourceRGBA(...color, 0.8);
        series.data.forEach(p => {
          const x = ctx.padL + ((p.x - minX) / (maxX - minX || 1)) * ctx.plotW;
          const y = ctx.padT + ((maxY - p.y) / (maxY - minY || 1)) * ctx.plotH;
          cr.arc(x, y, 4, 0, 2 * Math.PI);
          cr.fill();
        });
      });

      this._drawLegend(cr, width, height);
    }

    _drawBarsChart(cr, width, height) {
      // Dados: [{name, value}]
      const items = this._data;
      const maxVal = Math.max(100, ...items.map(i => i.value));
      const pad = 40; const barGap = 12;
      const plotH = height - 60; const plotW = width - pad * 2;

      // Eixo
      cr.setSourceRGBA(1,1,1,0.3); cr.setLineWidth(1);
      cr.moveTo(pad, 10); cr.lineTo(pad, plotH + 10); cr.lineTo(width - pad, plotH + 10); cr.stroke();

      const barWidth = (plotW - barGap * (items.length - 1)) / (items.length || 1);
      items.forEach((it, idx) => {
        const h = (it.value / maxVal) * plotH;
        const x = pad + idx * (barWidth + barGap);
        const y = 10 + (plotH - h);
        const color = this._palette[idx % this._palette.length];
        cr.setSourceRGBA(...color, 0.85);
        cr.rectangle(x, y, barWidth, h);
        cr.fill();
        // label
        cr.setSourceRGBA(1,1,1,0.8); cr.selectFontFace("Sans", Cairo.FontSlant.NORMAL, Cairo.FontWeight.NORMAL); cr.setFontSize(10);
        cr.moveTo(x + 2, y - 4); cr.showText(Math.round(it.value)+"%");
        // nome
        cr.save();
        cr.translate(x + barWidth/2, plotH + 22);
        cr.rotate(-Math.PI/4);
        cr.showText(it.name.substring(0,15));
        cr.restore();
      });
    }

    _drawLegend(cr, width, height) {
      const lineH = 16;
      const startX = width - 160;
      const startY = 12;
      this._data.slice(0,8).forEach((series, idx) => {
        const color = this._palette[idx % this._palette.length];
        cr.setSourceRGBA(...color, 0.9);
        cr.rectangle(startX, startY + idx * (lineH + 4), 14, 14);
        cr.fill();
        cr.setSourceRGBA(1,1,1,0.9);
        cr.selectFontFace("Sans", Cairo.FontSlant.NORMAL, Cairo.FontWeight.NORMAL);
        cr.setFontSize(10);
        cr.moveTo(startX + 20, startY + idx * (lineH + 4) + 12);
        cr.showText(series.name.substring(0,18));
      });
    }

    saveToPng(file) {
      try {
        const surface = new Cairo.ImageSurface(Cairo.Format.ARGB32, 800, 400);
        const cr = new Cairo.Context(surface);
        this._onDraw(cr, 800, 400);
        surface.writeToPNG(file);
        return true;
      } catch (e) {
        logError(e);
        return false;
      }
    }
  }
);