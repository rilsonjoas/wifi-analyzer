// chartWidget.js

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
        hexpand: true,
        vexpand: true,
        ...params,
      });

      this._chartType = this.chart_type;
      this._data = []; // Estrutura: [{ name: "SSID", data: [...] }]

      // Paleta de cores inspirada no Mission Center para as séries de dados
      this._palette = [
        [0.21, 0.52, 0.89], // #3584e4 - Azul GNOME
        [0.0, 0.83, 0.67], // #00d4aa - Verde Mission Center
        [0.96, 0.38, 0.32], // #f66151 - Vermelho/Coral
        [0.98, 0.76, 0.24], // #f9c23c - Amarelo/Ouro
        [0.45, 0.82, 0.95], // #74d1f3 - Azul Claro
        [0.89, 0.47, 0.76], // #e378c2 - Rosa/Magenta
        [0.67, 0.84, 0.35], // #abc759 - Verde Lima
        [0.95, 0.61, 0.23], // #f39c3a - Laranja
      ];

      this._area = new Gtk.DrawingArea({
        hexpand: true,
        vexpand: true,
        css_classes: ["chart-area"],
      });
      this._area.set_draw_func((_area, cr, w, h) => this._onDraw(cr, w, h));

      this.append(this._area);
    }

    get chart_type() {
      return this._chartType;
    }

    set chart_type(val) {
      if (this._chartType !== val) {
        this._chartType = val;
        this.notify("chart-type");
        if (this._area) {
          this._area.queue_draw();
        }
      }
    }

    setData(data) {
      this._data = data || [];
      if (this._area) {
        this._area.queue_draw();
      }
    }

    clearData() {
      this.setData([]);
    }

    _onDraw(cr, width, height) {
      const styleContext = this.get_style_context();

      // Obter cores do tema dinamicamente
      const [, bgColor] = styleContext.lookup_color("theme_bg_color");
      const [, gridColor] = styleContext.lookup_color(
        "theme_unfocused_fg_color"
      );
      const [, axisColor] = styleContext.lookup_color("theme_fg_color");
      const [, textColor] = styleContext.lookup_color("theme_fg_color");

      // 1. Limpar a área com a cor de fundo do tema
      cr.setSourceRGBA(bgColor.red, bgColor.green, bgColor.blue, bgColor.alpha);
      cr.paint();

      // 2. Lidar com o estado vazio
      if (!this._data || this._data.length === 0) {
        cr.setSourceRGBA(textColor.red, textColor.green, textColor.blue, 0.7);
        cr.selectFontFace(
          "Cantarell, sans-serif",
          Cairo.FontSlant.NORMAL,
          Cairo.FontWeight.NORMAL
        );
        cr.setFontSize(14);
        const text = "Selecione uma ou mais redes para monitorar";
        const extents = cr.textExtents(text);
        cr.moveTo(width / 2 - extents.width / 2, height / 2);
        cr.showText(text);
        return;
      }

      // Passar as cores do tema para as funções de desenho
      const themeColors = { gridColor, axisColor, textColor };

      // 3. Desenhar o gráfico apropriado
      try {
        switch (this._chartType) {
          case "line":
            this._drawLineChart(cr, width, height, themeColors);
            break;
          case "spectrum":
            this._drawSpectrumChart(cr, width, height, themeColors);
            break;
          case "channel":
          case "channel-map":
            this._drawChannelChart(cr, width, height, themeColors);
            break;
          case "bars":
          case "signal-bars":
            this._drawBarsChart(cr, width, height, themeColors);
            break;
          default:
            this._drawLineChart(cr, width, height, themeColors);
        }
      } catch (error) {
        // Desenhar mensagem de erro se algo der errado
        cr.setSourceRGBA(textColor.red, textColor.green, textColor.blue, 0.7);
        cr.selectFontFace(
          "Cantarell, sans-serif",
          Cairo.FontSlant.NORMAL,
          Cairo.FontWeight.NORMAL
        );
        cr.setFontSize(14);
        const errorText = `Erro no gráfico ${this._chartType}: ${error.message}`;
        const extents = cr.textExtents(errorText);
        cr.moveTo(width / 2 - extents.width / 2, height / 2);
        cr.showText(errorText);
        print(`Erro no ChartWidget (${this._chartType}):`, error);
      }
    }

    _commonAxes(cr, width, height, opts, themeColors) {
      const { minX, maxX, minY, maxY, yLabel, xLabel } = opts;
      const { gridColor, axisColor, textColor } = themeColors;
      const padL = 60,
        padR = 20,
        padT = 20,
        padB = 40;

      // Grid sutil
      cr.setSourceRGBA(gridColor.red, gridColor.green, gridColor.blue, 0.2);
      cr.setLineWidth(1);

      const hSteps = 4;
      for (let i = 0; i <= hSteps; i++) {
        const y = padT + ((height - padT - padB) * i) / hSteps;
        cr.moveTo(padL, y);
        cr.lineTo(width - padR, y);
        cr.stroke();
      }

      const vSteps = 6;
      for (let i = 0; i <= vSteps; i++) {
        const x = padL + ((width - padL - padR) * i) / vSteps;
        cr.moveTo(x, padT);
        cr.lineTo(x, height - padB);
        cr.stroke();
      }

      // Eixos principais
      cr.setSourceRGBA(axisColor.red, axisColor.green, axisColor.blue, 0.5);
      cr.setLineWidth(1.5);
      cr.moveTo(padL, padT);
      cr.lineTo(padL, height - padB);
      cr.lineTo(width - padR, height - padB);
      cr.stroke();

      // Labels Y
      cr.setSourceRGBA(textColor.red, textColor.green, textColor.blue, 0.8);
      cr.selectFontFace(
        "Cantarell, sans-serif",
        Cairo.FontSlant.NORMAL,
        Cairo.FontWeight.NORMAL
      );
      cr.setFontSize(11);
      for (let i = 0; i <= hSteps; i++) {
        const y = padT + ((height - padT - padB) * i) / hSteps;
        const val = maxY - ((maxY - minY) * i) / hSteps;
        const text = Math.round(val).toString();
        const te = cr.textExtents(text);
        cr.moveTo(padL - te.width - 8, y + te.height / 2);
        cr.showText(text);
      }

      // Label Y (título do eixo)
      if (yLabel) {
        cr.save();
        cr.translate(18, height / 2);
        cr.rotate(-Math.PI / 2);
        cr.setSourceRGBA(textColor.red, textColor.green, textColor.blue, 0.7);
        cr.selectFontFace(
          "Cantarell, sans-serif",
          Cairo.FontSlant.NORMAL,
          Cairo.FontWeight.BOLD
        );
        cr.setFontSize(12);
        const te = cr.textExtents(yLabel);
        cr.moveTo(-te.width / 2, te.height / 2);
        cr.showText(yLabel);
        cr.restore();
      }

      return {
        padL,
        padR,
        padT,
        padB,
        plotW: width - padL - padR,
        plotH: height - padT - padB,
      };
    }

    _drawLineChart(cr, width, height, themeColors) {
      const allPoints = this._data.flatMap((s) => s.data);
      if (allPoints.length === 0) return;

      const minX = Math.min(...allPoints.map((p) => p.x));
      const maxX = Math.max(...allPoints.map((p) => p.x));
      const minY = 0,
        maxY = 100;

      const ctx = this._commonAxes(
        cr,
        width,
        height,
        { minX, maxX, minY, maxY, yLabel: "Sinal %" },
        themeColors
      );

      this._data.forEach((series, idx) => {
        if (series.data.length < 2) return;

        const color = this._palette[idx % this._palette.length];

        const areaGradient = new Cairo.LinearGradient(
          0,
          ctx.padT,
          0,
          ctx.padT + ctx.plotH
        );
        areaGradient.addColorStopRGBA(0, ...color, 0.25);
        areaGradient.addColorStopRGBA(1, ...color, 0.05);
        cr.setSource(areaGradient);

        const getX = (p) =>
          ctx.padL + ((p.x - minX) / (maxX - minX || 1)) * ctx.plotW;
        const getY = (p) =>
          ctx.padT + ((maxY - p.y) / (maxY - minY || 1)) * ctx.plotH;

        cr.moveTo(getX(series.data[0]), height - ctx.padB);
        series.data.forEach((p) => cr.lineTo(getX(p), getY(p)));
        cr.lineTo(getX(series.data.at(-1)), height - ctx.padB);
        cr.closePath();
        cr.fill();

        cr.setSourceRGBA(...color, 0.95);
        cr.setLineWidth(2.5);
        cr.setLineJoin(Cairo.LineJoin.ROUND);
        series.data.forEach((p, i) =>
          i === 0 ? cr.moveTo(getX(p), getY(p)) : cr.lineTo(getX(p), getY(p))
        );
        cr.stroke();
      });

      this._drawLegend(cr, width, height, themeColors);
    }

    _drawSpectrumChart(cr, width, height, themeColors) {
      // Gráfico de espectro estilo WiFi Analyzer com formato de lombada/trapézio
      const allPoints = this._data.flatMap((s) => s.data || []);
      if (allPoints.length === 0) {
        // Desenhar mensagem de "sem dados"
        const { textColor } = themeColors;
        cr.setSourceRGBA(textColor.red, textColor.green, textColor.blue, 0.7);
        cr.selectFontFace("Cantarell, sans-serif", Cairo.FontSlant.NORMAL, Cairo.FontWeight.NORMAL);
        cr.setFontSize(14);
        const text = "Selecione uma ou mais redes para monitorar";
        const extents = cr.textExtents(text);
        cr.moveTo(width / 2 - extents.width / 2, height / 2);
        cr.showText(text);
        return;
      }

      // Configurações do gráfico
      const padding = { left: 60, right: 40, top: 40, bottom: 60 };
      const plotWidth = width - padding.left - padding.right;
      const plotHeight = height - padding.top - padding.bottom;

      // Range de canais (2.4GHz: 1-14)
      const minChannel = 1;
      const maxChannel = 14;
      const minSignal = -100; // dBm
      const maxSignal = -20;   // dBm

      // Desenhar fundo do gráfico
      const { gridColor, axisColor, textColor, backgroundColor } = themeColors;
      const bgColor = backgroundColor || { red: 0.1, green: 0.1, blue: 0.1 }; // Fallback para bgColor
      
      // Grid horizontal (níveis de sinal)
      cr.setSourceRGBA(gridColor.red, gridColor.green, gridColor.blue, 0.3);
      cr.setLineWidth(0.5);
      
      const signalStep = 10; // Linhas a cada 10 dBm
      for (let signal = minSignal; signal <= maxSignal; signal += signalStep) {
        const y = padding.top + ((maxSignal - signal) / (maxSignal - minSignal)) * plotHeight;
        cr.moveTo(padding.left, y);
        cr.lineTo(padding.left + plotWidth, y);
        cr.stroke();
      }

      // Grid vertical (canais)
      for (let channel = minChannel; channel <= maxChannel; channel++) {
        const x = padding.left + ((channel - minChannel) / (maxChannel - minChannel)) * plotWidth;
        cr.moveTo(x, padding.top);
        cr.lineTo(x, padding.top + plotHeight);
        cr.stroke();
      }

      // Eixos principais
      cr.setSourceRGBA(axisColor.red, axisColor.green, axisColor.blue, 1.0);
      cr.setLineWidth(1.5);
      
      // Eixo Y (esquerda)
      cr.moveTo(padding.left, padding.top);
      cr.lineTo(padding.left, padding.top + plotHeight);
      cr.stroke();
      
      // Eixo X (inferior)
      cr.moveTo(padding.left, padding.top + plotHeight);
      cr.lineTo(padding.left + plotWidth, padding.top + plotHeight);
      cr.stroke();

      // Labels do eixo Y (níveis de sinal em dBm)
      cr.setSourceRGBA(textColor.red, textColor.green, textColor.blue, 1.0);
      cr.selectFontFace("Cantarell, sans-serif", Cairo.FontSlant.NORMAL, Cairo.FontWeight.NORMAL);
      cr.setFontSize(10);
      
      for (let signal = minSignal; signal <= maxSignal; signal += signalStep) {
        const y = padding.top + ((maxSignal - signal) / (maxSignal - minSignal)) * plotHeight;
        const text = `${signal}`;
        const extents = cr.textExtents(text);
        cr.moveTo(padding.left - extents.width - 10, y + extents.height / 2);
        cr.showText(text);
      }

      // Labels do eixo X (canais)
      for (let channel = minChannel; channel <= maxChannel; channel++) {
        const x = padding.left + ((channel - minChannel) / (maxChannel - minChannel)) * plotWidth;
        const text = `${channel}`;
        const extents = cr.textExtents(text);
        cr.moveTo(x - extents.width / 2, padding.top + plotHeight + 20);
        cr.showText(text);
      }

      // Título dos eixos
      cr.setFontSize(12);
      
      // Label Y (dBm)
      cr.save();
      cr.translate(15, height / 2);
      cr.rotate(-Math.PI / 2);
      const yLabelExtents = cr.textExtents("dBm");
      cr.moveTo(-yLabelExtents.width / 2, 0);
      cr.showText("dBm");
      cr.restore();
      
      // Label X (Canal)
      const xLabelExtents = cr.textExtents("Canal");
      cr.moveTo(width / 2 - xLabelExtents.width / 2, height - 15);
      cr.showText("Canal");

      // Desenhar espectro em formato de lombada/trapézio para cada rede
      this._data.forEach((series, seriesIdx) => {
        if (!series.data || series.data.length === 0) return;

        const color = this._palette[seriesIdx % this._palette.length];
        
        series.data.forEach((point) => {
          // Converter frequência para canal (aproximação)
          let channel = this._frequencyToChannel(point.x);
          if (channel < minChannel || channel > maxChannel) return;

          // Converter sinal de % para dBm (aproximação)
          const signalDbm = (point.y / 100) * (maxSignal - minSignal) + minSignal;

          const centerX = padding.left + ((channel - minChannel) / (maxChannel - minChannel)) * plotWidth;
          const peakY = padding.top + ((maxSignal - signalDbm) / (maxSignal - minSignal)) * plotHeight;
          const baseY = padding.top + plotHeight;

          // Largura da lombada (simula largura de banda do canal WiFi)
          const bandwidthWidth = plotWidth / (maxChannel - minChannel) * 0.8; // ~80% da largura do canal
          const halfWidth = bandwidthWidth / 2;

          // Criar formato de lombada/trapézio usando curvas Bézier
          cr.newPath();
          
          // Começar da base esquerda
          cr.moveTo(centerX - halfWidth, baseY);
          
          // Subir pela lateral esquerda (curva suave)
          cr.curveTo(
            centerX - halfWidth * 0.7, baseY,           // ponto de controle 1
            centerX - halfWidth * 0.3, peakY + (baseY - peakY) * 0.3, // ponto de controle 2
            centerX - halfWidth * 0.1, peakY            // ponto final (quase no topo)
          );
          
          // Topo da lombada (pequena área plana)
          cr.lineTo(centerX + halfWidth * 0.1, peakY);
          
          // Descer pela lateral direita (curva suave)
          cr.curveTo(
            centerX + halfWidth * 0.3, peakY + (baseY - peakY) * 0.3, // ponto de controle 1
            centerX + halfWidth * 0.7, baseY,           // ponto de controle 2
            centerX + halfWidth, baseY                  // ponto final (base direita)
          );
          
          // Fechar o caminho pela base
          cr.closePath();

          // Preencher com gradiente
          const gradient = new Cairo.LinearGradient(0, peakY, 0, baseY);
          gradient.addColorStopRGBA(0, ...color, 0.8);
          gradient.addColorStopRGBA(1, ...color, 0.2);
          cr.setSource(gradient);
          cr.fill();

          // Contorno da lombada
          cr.newPath();
          cr.moveTo(centerX - halfWidth, baseY);
          cr.curveTo(
            centerX - halfWidth * 0.7, baseY,
            centerX - halfWidth * 0.3, peakY + (baseY - peakY) * 0.3,
            centerX - halfWidth * 0.1, peakY
          );
          cr.lineTo(centerX + halfWidth * 0.1, peakY);
          cr.curveTo(
            centerX + halfWidth * 0.3, peakY + (baseY - peakY) * 0.3,
            centerX + halfWidth * 0.7, baseY,
            centerX + halfWidth, baseY
          );
          
          cr.setSourceRGBA(...color, 1.0);
          cr.setLineWidth(2);
          cr.stroke();

          // Label da rede no centro da lombada (apenas para sinais fortes)
          const lombadaHeight = baseY - peakY;
          if (lombadaHeight > plotHeight * 0.25) {
            cr.setSourceRGBA(...color, 1.0);
            cr.selectFontFace("Cantarell, sans-serif", Cairo.FontSlant.NORMAL, Cairo.FontWeight.BOLD);
            cr.setFontSize(9);
            const textExtents = cr.textExtents(series.name);
            
            // Posicionar texto no centro da lombada
            const textX = centerX - textExtents.width / 2;
            const textY = peakY + lombadaHeight * 0.3;
            
            // Fundo semi-transparente para melhorar legibilidade
            cr.setSourceRGBA(bgColor.red, bgColor.green, bgColor.blue, 0.8);
            cr.rectangle(textX - 3, textY - textExtents.height, textExtents.width + 6, textExtents.height + 3);
            cr.fill();
            
            // Texto da rede
            cr.setSourceRGBA(...color, 1.0);
            cr.moveTo(textX, textY);
            cr.showText(series.name);
          }
        });
      });

      // Desenhar legenda
      this._drawSpectrumLegend(cr, width, height, themeColors);
    }

    _frequencyToChannel(frequency) {
      // Conversão aproximada de frequência (MHz) para canal
      if (frequency >= 2412 && frequency <= 2484) {
        // 2.4 GHz
        if (frequency === 2484) return 14;
        return Math.round((frequency - 2412) / 5) + 1;
      } else if (frequency >= 5170 && frequency <= 5825) {
        // 5 GHz (aproximação simples)
        return Math.round((frequency - 5000) / 20);
      }
      return 1; // fallback
    }

    _drawSpectrumLegend(cr, width, height, themeColors) {
      if (this._data.length === 0) return;

      const { textColor, backgroundColor } = themeColors;
      const bgColor = backgroundColor || { red: 0.1, green: 0.1, blue: 0.1 }; // Fallback para bgColor
      const legendX = width - 200;
      const legendY = 60;
      const itemHeight = 20;
      const legendWidth = 180;
      const legendHeight = this._data.length * itemHeight + 20;

      // Fundo da legenda
      cr.setSourceRGBA(bgColor.red, bgColor.green, bgColor.blue, 0.9);
      cr.rectangle(legendX, legendY, legendWidth, legendHeight);
      cr.fill();

      // Borda da legenda
      cr.setSourceRGBA(textColor.red, textColor.green, textColor.blue, 0.3);
      cr.setLineWidth(1);
      cr.rectangle(legendX, legendY, legendWidth, legendHeight);
      cr.stroke();

      // Itens da legenda
      cr.setSourceRGBA(textColor.red, textColor.green, textColor.blue, 1.0);
      cr.selectFontFace("Cantarell, sans-serif", Cairo.FontSlant.NORMAL, Cairo.FontWeight.NORMAL);
      cr.setFontSize(10);

      this._data.forEach((series, idx) => {
        const color = this._palette[idx % this._palette.length];
        const y = legendY + 15 + idx * itemHeight;

        // Quadrado colorido
        cr.setSourceRGBA(...color, 0.8);
        cr.rectangle(legendX + 10, y - 8, 12, 12);
        cr.fill();

        // Contorno do quadrado
        cr.setSourceRGBA(...color, 1.0);
        cr.setLineWidth(1);
        cr.rectangle(legendX + 10, y - 8, 12, 12);
        cr.stroke();

        // Nome da série
        cr.setSourceRGBA(textColor.red, textColor.green, textColor.blue, 1.0);
        cr.moveTo(legendX + 30, y);
        cr.showText(series.name);

        // Indicador de conectado (se aplicável)
        if (this._isConnectedNetwork && this._isConnectedNetwork(series.name)) {
          cr.setSourceRGBA(0.0, 0.8, 0.0, 1.0); // Verde
          cr.setFontSize(8);
          cr.moveTo(legendX + 30 + cr.textExtents(series.name).width + 5, y);
          cr.showText("CONECTADO");
          cr.setFontSize(10);
        }
      });
    }

    _drawChannelChart(cr, width, height, themeColors) {
      const allPoints = this._data.flatMap((s) => s.data || []);
      if (allPoints.length === 0) {
        // Desenhar mensagem de "sem dados"
        const { textColor } = themeColors;
        cr.setSourceRGBA(textColor.red, textColor.green, textColor.blue, 0.7);
        cr.selectFontFace("Cantarell, sans-serif", Cairo.FontSlant.NORMAL, Cairo.FontWeight.NORMAL);
        cr.setFontSize(14);
        const text = "Selecione uma ou mais redes para monitorar";
        const extents = cr.textExtents(text);
        cr.moveTo(width / 2 - extents.width / 2, height / 2);
        cr.showText(text);
        return;
      }

      // Gráfico simples de canal vs sinal
      const minX = 1, maxX = 14, minY = 0, maxY = 100;
      
      const ctx = this._commonAxes(
        cr,
        width,
        height,
        { minX, maxX, minY, maxY, yLabel: "Sinal %", xLabel: "Canal" },
        themeColors
      );

      this._data.forEach((series, idx) => {
        if (!series.data || series.data.length === 0) return;

        const color = this._palette[idx % this._palette.length];
        cr.setSourceRGBA(...color, 0.8);
        cr.setLineWidth(3);

        series.data.forEach((point) => {
          const x = ctx.padL + ((point.x - minX) / (maxX - minX || 1)) * ctx.plotW;
          const y = ctx.padT + ((maxY - point.y) / (maxY - minY || 1)) * ctx.plotH;

          // Desenhar ponto/círculo para cada medição
          cr.newPath();
          cr.arc(x, y, 4, 0, 2 * Math.PI);
          cr.fill();
        });
      });

      this._drawLegend(cr, width, height, themeColors);
    }

    _drawBarsChart(cr, width, height, themeColors) {
      if (this._data.length === 0) {
        // Desenhar mensagem de "sem dados"
        const { textColor } = themeColors;
        cr.setSourceRGBA(textColor.red, textColor.green, textColor.blue, 0.7);
        cr.selectFontFace("Cantarell, sans-serif", Cairo.FontSlant.NORMAL, Cairo.FontWeight.NORMAL);
        cr.setFontSize(14);
        const text = "Selecione uma ou mais redes para monitorar";
        const extents = cr.textExtents(text);
        cr.moveTo(width / 2 - extents.width / 2, height / 2);
        cr.showText(text);
        return;
      }

      // Simplificar: apenas mostrar valor atual de cada rede
      const items = this._data.map((s) => ({
        name: s.name,
        value: s.value !== undefined ? s.value : (s.data && s.data.length ? s.data.at(-1).signal : 0),
      }));

      const { textColor } = themeColors;
      const maxVal = 100;
      const padL = 60, padR = 20, padT = 40, padB = 60;
      const plotH = height - padT - padB;
      const plotW = width - padL - padR;

      this._commonAxes(
        cr,
        width,
        height,
        { minX: 0, maxX: items.length, minY: 0, maxY: 100, yLabel: "Sinal %" },
        themeColors
      );

      const totalBarWidth = plotW / (items.length || 1);
      const barWidth = totalBarWidth * 0.6;
      const barGap = totalBarWidth * 0.4;

      items.forEach((item, idx) => {
        const h = (item.value / maxVal) * plotH;
        const x = padL + idx * totalBarWidth + barGap / 2;
        const y = padT + (plotH - h);
        const color = this._palette[idx % this._palette.length];

        // Barra simples sem gradiente
        cr.setSourceRGBA(...color, 0.8);
        this._roundedRect(cr, x, y, barWidth, h, 4);
        cr.fill();

        // Texto do valor
        cr.setSourceRGBA(textColor.red, textColor.green, textColor.blue, 0.9);
        cr.selectFontFace("Cantarell, sans-serif", Cairo.FontSlant.NORMAL, Cairo.FontWeight.BOLD);
        cr.setFontSize(11);
        const valueText = Math.round(item.value) + "%";
        const te = cr.textExtents(valueText);
        cr.moveTo(x + barWidth / 2 - te.width / 2, y - 8);
        cr.showText(valueText);

        // Nome da rede (opcional, rotacionado)
        cr.save();
        cr.translate(x + barWidth / 2, height - padB + 15);
        cr.rotate(-Math.PI / 4);
        cr.setSourceRGBA(textColor.red, textColor.green, textColor.blue, 0.8);
        cr.setFontSize(10);
        const nameText = item.name.substring(0, 12) + (item.name.length > 12 ? "…" : "");
        const ne = cr.textExtents(nameText);
        cr.moveTo(-ne.width / 2, 0);
        cr.showText(nameText);
        cr.restore();
      });
    }

    _roundedRect(cr, x, y, width, height, radius) {
      cr.newPath();
      if (height < 0) {
        y += height;
        height = -height;
      }
      cr.arc(x + radius, y + radius, radius, Math.PI, (3 * Math.PI) / 2);
      cr.arc(x + width - radius, y + radius, radius, (3 * Math.PI) / 2, 0);
      cr.arc(x + width - radius, y + height - radius, radius, 0, Math.PI / 2);
      cr.arc(x + radius, y + height - radius, radius, Math.PI / 2, Math.PI);
      cr.closePath();
    }

    _drawLegend(cr, width, height, themeColors) {
      const { textColor } = themeColors;
      const [, legendBgColor] = this.get_style_context().lookup_color(
        "theme_unfocused_bg_color"
      );

      const itemHeight = 20;
      const startX = width - 180;
      const startY = 20;
      const maxItems = Math.min(8, this._data.length);

      if (maxItems > 0) {
        cr.setSourceRGBA(
          legendBgColor.red,
          legendBgColor.green,
          legendBgColor.blue,
          0.8
        );
        this._roundedRect(
          cr,
          startX - 8,
          startY - 8,
          168,
          maxItems * itemHeight + 8,
          8
        );
        cr.fill();
      }

      this._data.slice(0, maxItems).forEach((series, idx) => {
        const color = this._palette[idx % this._palette.length];
        const yPos = startY + idx * itemHeight;

        cr.setSourceRGBA(...color, 0.9);
        this._roundedRect(cr, startX, yPos, 14, 14, 3);
        cr.fill();

        cr.setSourceRGBA(textColor.red, textColor.green, textColor.blue, 0.95);
        cr.selectFontFace(
          "Cantarell, sans-serif",
          Cairo.FontSlant.NORMAL,
          Cairo.FontWeight.NORMAL
        );
        cr.setFontSize(11);
        const text =
          series.name.substring(0, 18) + (series.name.length > 18 ? "…" : "");
        cr.moveTo(startX + 22, yPos + 11);
        cr.showText(text);
      });
    }
  }
);
