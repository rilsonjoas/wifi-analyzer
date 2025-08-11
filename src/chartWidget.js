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
        spacing: 0,
        hexpand: true,
        vexpand: true,
        css_classes: ["chart-widget"],
        ...params,
      });

      this._chartType = this.chart_type;
      this._data = []; // Array de séries
      // Paleta inspirada no Mission Center - cores mais vibrantes e modernas
      this._palette = [
        [0.13, 0.59, 0.95], // azul vibrante (similar Mission Center)
        [0.91, 0.16, 0.22], // vermelho mais saturado
        [0.20, 0.83, 0.56], // verde esmeralda
        [1.00, 0.84, 0.10], // amarelo dourado
        [0.68, 0.32, 0.87], // roxo vibrante
        [0.97, 0.56, 0.13], // laranja energético
        [0.26, 0.71, 0.96], // azul claro
        [0.89, 0.30, 0.58], // rosa/magenta
      ];

      this._placeholder = new Gtk.Label({
        label: "Nenhuma rede selecionada",
        css_classes: ["dim-label", "caption-heading"],
        halign: Gtk.Align.CENTER,
        valign: Gtk.Align.CENTER,
        justify: Gtk.Justification.CENTER,
        wrap: true,
      });

      this._area = new Gtk.DrawingArea({
        hexpand: true,
        vexpand: true,
        css_classes: ["chart-area"],
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
      // Fundo moderno inspirado no Mission Center - gradiente sutil
      const pattern = new Cairo.LinearGradient(0, 0, 0, height);
      pattern.addColorStopRGBA(0, 0.09, 0.09, 0.11, 1.0); // tom escuro no topo
      pattern.addColorStopRGBA(1, 0.07, 0.07, 0.09, 1.0); // ainda mais escuro embaixo
      cr.setSource(pattern);
      cr.rectangle(0, 0, width, height);
      cr.fill();

      // Borda sutil
      cr.setSourceRGBA(1, 1, 1, 0.08);
      cr.setLineWidth(1);
      cr.rectangle(0.5, 0.5, width - 1, height - 1);
      cr.stroke();

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
      const padL = 60, padR = 20, padT = 20, padB = 40;
      
      // Grid principal mais sutil (inspirado Mission Center)
      cr.setSourceRGBA(1, 1, 1, 0.06);
      cr.setLineWidth(1);
      
      // Grades horizontais mais espaçadas e elegantes
      const steps = 4;
      for (let i = 0; i <= steps; i++) {
        const y = padT + ((height - padT - padB) * i) / steps;
        cr.moveTo(padL, y);
        cr.lineTo(width - padR, y);
        cr.stroke();
      }
      
      // Grades verticais sutis
      const vSteps = 6;
      for (let i = 0; i <= vSteps; i++) {
        const x = padL + ((width - padL - padR) * i) / vSteps;
        cr.moveTo(x, padT);
        cr.lineTo(x, height - padB);
        cr.stroke();
      }

      // Eixos principais mais destacados
      cr.setSourceRGBA(1, 1, 1, 0.2);
      cr.setLineWidth(1.5);
      cr.moveTo(padL, padT);
      cr.lineTo(padL, height - padB);
      cr.lineTo(width - padR, height - padB);
      cr.stroke();

      // Labels no eixo Y com fonte mais moderna
      for (let i = 0; i <= steps; i++) {
        const y = padT + ((height - padT - padB) * i) / steps;
        const val = maxY - ((maxY - minY) * i) / steps;
        cr.setSourceRGBA(1, 1, 1, 0.75);
        cr.selectFontFace("Inter, system-ui, sans-serif", Cairo.FontSlant.NORMAL, Cairo.FontWeight.NORMAL);
        cr.setFontSize(11);
        const text = Math.round(val).toString();
        const textExtent = cr.textExtents(text);
        cr.moveTo(padL - textExtent.width - 8, y + textExtent.height / 2);
        cr.showText(text);
      }

      // Label do eixo Y mais estilizado
      if (yLabel) {
        cr.save();
        cr.translate(18, height / 2);
        cr.rotate(-Math.PI / 2);
        cr.setSourceRGBA(1, 1, 1, 0.65);
        cr.selectFontFace("Inter, system-ui, sans-serif", Cairo.FontSlant.NORMAL, Cairo.FontWeight.BOLD);
        cr.setFontSize(12);
        const textExtent = cr.textExtents(yLabel);
        cr.moveTo(-textExtent.width / 2, textExtent.height / 2);
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

      const ctx = this._commonAxes(cr, width, height, { minX, maxX, minY, maxY, yLabel: "Sinal %" });

      // Desenhar linhas com gradiente e sombra (estilo Mission Center)
      this._data.forEach((series, idx) => {
        const color = this._palette[idx % this._palette.length];
        
        // Área preenchida com gradiente sutil
        if (series.data.length > 1) {
          const areaGradient = new Cairo.LinearGradient(0, ctx.padT, 0, ctx.padT + ctx.plotH);
          areaGradient.addColorStopRGBA(0, ...color, 0.25);
          areaGradient.addColorStopRGBA(1, ...color, 0.05);
          
          cr.setSource(areaGradient);
          cr.moveTo(ctx.padL + ((series.data[0].x - minX) / (maxX - minX || 1)) * ctx.plotW, height - ctx.padB);
          
          series.data.forEach((p, i) => {
            const x = ctx.padL + ((p.x - minX) / (maxX - minX || 1)) * ctx.plotW;
            const y = ctx.padT + ((maxY - p.y) / (maxY - minY || 1)) * ctx.plotH;
            cr.lineTo(x, y);
          });
          
          cr.lineTo(ctx.padL + ((series.data[series.data.length-1].x - minX) / (maxX - minX || 1)) * ctx.plotW, height - ctx.padB);
          cr.closePath();
          cr.fill();
        }
        
        // Linha principal mais espessa e suave
        cr.setSourceRGBA(...color, 0.95);
        cr.setLineWidth(3);
        cr.setLineCap(Cairo.LineCap.ROUND);
        cr.setLineJoin(Cairo.LineJoin.ROUND);
        
        series.data.forEach((p, i) => {
          const x = ctx.padL + ((p.x - minX) / (maxX - minX || 1)) * ctx.plotW;
          const y = ctx.padT + ((maxY - p.y) / (maxY - minY || 1)) * ctx.plotH;
          if (i === 0) cr.moveTo(x, y); else cr.lineTo(x, y);
        });
        cr.stroke();
        
        // Pontos destacados no estilo Mission Center
        cr.setSourceRGBA(...color, 1.0);
        series.data.forEach((p, i) => {
          if (i % 3 === 0 || i === series.data.length - 1) { // mostrar alguns pontos
            const x = ctx.padL + ((p.x - minX) / (maxX - minX || 1)) * ctx.plotW;
            const y = ctx.padT + ((maxY - p.y) / (maxY - minY || 1)) * ctx.plotH;
            cr.arc(x, y, 3, 0, 2 * Math.PI);
            cr.fill();
          }
        });
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
      const ctx = this._commonAxes(cr, width, height, { minX, maxX, minY, maxY, yLabel: "Sinal %" });

      // Desenhar áreas sobrepostas com gradientes mais sofisticados
      this._data.forEach((series, idx) => {
        const color = this._palette[idx % this._palette.length];
        
        // Gradiente vertical para área
        const gradient = new Cairo.LinearGradient(0, ctx.padT, 0, ctx.padT + ctx.plotH);
        gradient.addColorStopRGBA(0, ...color, 0.6);
        gradient.addColorStopRGBA(0.5, ...color, 0.3);
        gradient.addColorStopRGBA(1, ...color, 0.05);
        
        cr.setSource(gradient);
        cr.moveTo(ctx.padL, height - ctx.padB);
        
        series.data.forEach((p, i) => {
          const x = ctx.padL + ((p.x - minX) / (maxX - minX || 1)) * ctx.plotW;
          const y = ctx.padT + ((maxY - p.y) / (maxY - minY || 1)) * ctx.plotH;
          cr.lineTo(x, y);
        });
        
        cr.lineTo(ctx.padL + ctx.plotW, height - ctx.padB);
        cr.closePath();
        cr.fill();
        
        // Linha de contorno
        cr.setSourceRGBA(...color, 0.9);
        cr.setLineWidth(2);
        cr.setLineCap(Cairo.LineCap.ROUND);
        
        series.data.forEach((p, i) => {
          const x = ctx.padL + ((p.x - minX) / (maxX - minX || 1)) * ctx.plotW;
          const y = ctx.padT + ((maxY - p.y) / (maxY - minY || 1)) * ctx.plotH;
          if (i === 0) cr.moveTo(x, y); else cr.lineTo(x, y);
        });
        cr.stroke();
      });

      this._drawLegend(cr, width, height);
    }

    _drawChannelChart(cr, width, height) {
      const allPoints = this._data.flatMap(s => s.data);
      if (allPoints.length === 0) return;
      const minX = Math.min(...allPoints.map(p => p.x));
      const maxX = Math.max(...allPoints.map(p => p.x));
      const minY = 0; const maxY = 100;
      const ctx = this._commonAxes(cr, width, height, { minX, maxX, minY, maxY, yLabel: "Sinal %" });

      // Desenhar pontos com efeito de glow (estilo Mission Center)
      this._data.forEach((series, idx) => {
        const color = this._palette[idx % this._palette.length];
        
        series.data.forEach(p => {
          const x = ctx.padL + ((p.x - minX) / (maxX - minX || 1)) * ctx.plotW;
          const y = ctx.padT + ((maxY - p.y) / (maxY - minY || 1)) * ctx.plotH;
          
          // Efeito glow/halo
          cr.setSourceRGBA(...color, 0.3);
          cr.arc(x, y, 8, 0, 2 * Math.PI);
          cr.fill();
          
          // Ponto principal
          cr.setSourceRGBA(...color, 0.9);
          cr.arc(x, y, 5, 0, 2 * Math.PI);
          cr.fill();
          
          // Centro brilhante
          cr.setSourceRGBA(1, 1, 1, 0.8);
          cr.arc(x, y, 2, 0, 2 * Math.PI);
          cr.fill();
        });
      });

      this._drawLegend(cr, width, height);
    }

    _drawBarsChart(cr, width, height) {
      // Dados: [{name, value}]
      const items = this._data;
      const maxVal = Math.max(100, ...items.map(i => i.value));
      const pad = 60; const barGap = 16;
      const plotH = height - 80; const plotW = width - pad * 2;

      // Grid de fundo mais elegante
      cr.setSourceRGBA(1, 1, 1, 0.05);
      cr.setLineWidth(1);
      for (let i = 0; i <= 4; i++) {
        const y = 20 + (plotH * i) / 4;
        cr.moveTo(pad, y);
        cr.lineTo(width - pad, y);
        cr.stroke();
      }

      // Eixos principais
      cr.setSourceRGBA(1, 1, 1, 0.2);
      cr.setLineWidth(1.5);
      cr.moveTo(pad, 20); 
      cr.lineTo(pad, plotH + 20); 
      cr.lineTo(width - pad, plotH + 20); 
      cr.stroke();

      const barWidth = Math.max(20, (plotW - barGap * (items.length - 1)) / (items.length || 1));
      
      items.forEach((it, idx) => {
        const h = (it.value / maxVal) * plotH;
        const x = pad + idx * (barWidth + barGap);
        const y = 20 + (plotH - h);
        const color = this._palette[idx % this._palette.length];
        
        // Gradiente para as barras (estilo Mission Center)
        const barGradient = new Cairo.LinearGradient(0, y, 0, y + h);
        barGradient.addColorStopRGBA(0, ...color, 0.9);
        barGradient.addColorStopRGBA(1, ...color, 0.6);
        
        cr.setSource(barGradient);
        // Barras com cantos arredondados
        this._roundedRect(cr, x, y, barWidth, h, 4);
        cr.fill();
        
        // Borda sutil
        cr.setSourceRGBA(...color, 1.0);
        cr.setLineWidth(1);
        this._roundedRect(cr, x, y, barWidth, h, 4);
        cr.stroke();
        
        // Valor no topo com fonte moderna
        cr.setSourceRGBA(1, 1, 1, 0.9); 
        cr.selectFontFace("Inter, system-ui, sans-serif", Cairo.FontSlant.NORMAL, Cairo.FontWeight.BOLD); 
        cr.setFontSize(11);
        const valueText = Math.round(it.value) + "%";
        const textExtent = cr.textExtents(valueText);
        cr.moveTo(x + barWidth/2 - textExtent.width/2, y - 8); 
        cr.showText(valueText);
        
        // Nome da rede com rotação elegante
        cr.save();
        cr.translate(x + barWidth/2, plotH + 35);
        cr.rotate(-Math.PI/6);
        cr.setSourceRGBA(1, 1, 1, 0.7);
        cr.selectFontFace("Inter, system-ui, sans-serif", Cairo.FontSlant.NORMAL, Cairo.FontWeight.NORMAL);
        cr.setFontSize(10);
        const nameText = it.name.substring(0, 12) + (it.name.length > 12 ? "..." : "");
        const nameExtent = cr.textExtents(nameText);
        cr.moveTo(-nameExtent.width/2, nameExtent.height/2);
        cr.showText(nameText);
        cr.restore();
      });
    }

    // Função auxiliar para retângulos com cantos arredondados
    _roundedRect(cr, x, y, width, height, radius) {
      cr.newPath();
      cr.arc(x + radius, y + radius, radius, Math.PI, 3 * Math.PI / 2);
      cr.arc(x + width - radius, y + radius, radius, 3 * Math.PI / 2, 0);
      cr.arc(x + width - radius, y + height - radius, radius, 0, Math.PI / 2);
      cr.arc(x + radius, y + height - radius, radius, Math.PI / 2, Math.PI);
      cr.closePath();
    }

    _drawLegend(cr, width, height) {
      const itemHeight = 18;
      const startX = width - 180;
      const startY = 20;
      const maxItems = Math.min(8, this._data.length);
      
      // Fundo da legenda com borda arredondada (estilo Mission Center)
      if (maxItems > 0) {
        cr.setSourceRGBA(0.05, 0.05, 0.07, 0.8);
        this._roundedRect(cr, startX - 8, startY - 8, 168, maxItems * (itemHeight + 4) + 8, 8);
        cr.fill();
        
        cr.setSourceRGBA(1, 1, 1, 0.1);
        cr.setLineWidth(1);
        this._roundedRect(cr, startX - 8, startY - 8, 168, maxItems * (itemHeight + 4) + 8, 8);
        cr.stroke();
      }
      
      this._data.slice(0, maxItems).forEach((series, idx) => {
        const color = this._palette[idx % this._palette.length];
        const yPos = startY + idx * (itemHeight + 4);
        
        // Indicador de cor com bordas arredondadas
        cr.setSourceRGBA(...color, 0.9);
        this._roundedRect(cr, startX, yPos, 16, 14, 3);
        cr.fill();
        
        // Texto da legenda com fonte moderna
        cr.setSourceRGBA(1, 1, 1, 0.95);
        cr.selectFontFace("Inter, system-ui, sans-serif", Cairo.FontSlant.NORMAL, Cairo.FontWeight.NORMAL);
        cr.setFontSize(11);
        const text = series.name.substring(0, 20) + (series.name.length > 20 ? "..." : "");
        cr.moveTo(startX + 22, yPos + 11);
        cr.showText(text);
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