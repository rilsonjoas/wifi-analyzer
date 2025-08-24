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
      // Gráfico de espectro profissional estilo analisadores como inSSIDer e Acrylic
      // Usa formato trapezoidal característico de canais WiFi reais
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

          // Largura do canal (simula largura de banda real do WiFi)
          // Canal 20MHz típico com formato trapezoidal característico de analisadores profissionais
          const channelBandwidth = plotWidth / (maxChannel - minChannel) * 1.1; // Largura total do trapézio
          const coreWidth = channelBandwidth * 0.5;  // Largura do topo (área plana central)
          const rolloffWidth = channelBandwidth * 0.15; // Largura das bordas inclinadas (roll-off)
          const halfCore = coreWidth / 2;
          const halfBandwidth = channelBandwidth / 2;

          // Criar formato trapezoidal (típico de canais WiFi reais)
          cr.newPath();
          
          // Começar da base esquerda (borda externa do canal)
          cr.moveTo(centerX - halfBandwidth, baseY);
          
          // Subir pela lateral esquerda (slope linear característico)
          // Em analisadores reais, a subida é mais linear que curvilínea
          cr.lineTo(centerX - halfCore, peakY);
          
          // Topo plano do canal (área central de máxima potência)
          // Esta é a região onde a portadora principal está localizada
          cr.lineTo(centerX + halfCore, peakY);
          
          // Descer pela lateral direita (slope linear simétrico)
          cr.lineTo(centerX + halfBandwidth, baseY);
          
          // Fechar o trapézio pela base
          cr.closePath();

          // Preencher com gradiente trapezoidal mais realista
          const gradient = new Cairo.LinearGradient(0, peakY, 0, baseY);
          
          // Gradiente que simula a distribuição de potência real de um canal WiFi
          const signalStrength = (maxSignal - signalDbm) / (maxSignal - minSignal);
          const baseAlpha = 0.15 + (signalStrength * 0.25); // Alpha varia com força do sinal
          const peakAlpha = 0.7 + (signalStrength * 0.25);  // Pico mais intenso para sinais fortes
          
          gradient.addColorStopRGBA(0, ...color, peakAlpha);      // Topo: máxima intensidade
          gradient.addColorStopRGBA(0.7, ...color, peakAlpha * 0.6); // Meio: transição
          gradient.addColorStopRGBA(1, ...color, baseAlpha);       // Base: mínima intensidade
          cr.setSource(gradient);
          cr.fill();

          // Contorno do trapézio (borda definida)
          cr.newPath();
          cr.moveTo(centerX - halfBandwidth, baseY);
          cr.lineTo(centerX - halfCore, peakY);
          cr.lineTo(centerX + halfCore, peakY);
          cr.lineTo(centerX + halfBandwidth, baseY);
          
          // Calcular altura do trapézio para usar nas condições
          const trapezoidHeight = baseY - peakY;

          // Contorno mais fino e definido, típico de analisadores profissionais
          cr.setSourceRGBA(...color, 0.9);
          cr.setLineWidth(1.5);
          cr.stroke();
          
          // Linha de pico no topo do trapézio para indicar frequência central
          if (trapezoidHeight > plotHeight * 0.15) {
            cr.newPath();
            cr.moveTo(centerX - halfCore * 0.8, peakY);
            cr.lineTo(centerX + halfCore * 0.8, peakY);
            cr.setSourceRGBA(...color, 1.0);
            cr.setLineWidth(1);
            cr.stroke();
          }

          // Não desenhar labels individuais aqui para evitar duplicação
          // Os nomes das redes são mostrados na legenda
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
      // Mapa de canais dual-band profissional estilo Sparrow-WiFi
      const allPoints = this._data.flatMap((s) => s.data || []);
      if (allPoints.length === 0) {
        this._drawEmptyChannelMessage(cr, width, height, themeColors);
        return;
      }

      // Detectar bandas presentes nos dados
      const bands = this._detectBands(allPoints);
      const hasBothBands = bands.has('2.4GHz') && bands.has('5GHz');

      if (hasBothBands) {
        this._drawDualBandChannelChart(cr, width, height, themeColors, bands);
      } else if (bands.has('5GHz')) {
        this._drawSingleBandChannelChart(cr, width, height, themeColors, '5GHz');
      } else {
        this._drawSingleBandChannelChart(cr, width, height, themeColors, '2.4GHz');
      }
    }

    _detectBands(allPoints) {
      const bands = new Set();
      
      allPoints.forEach(point => {
        if (point.x >= 1 && point.x <= 14) {
          bands.add('2.4GHz');
        } else if (point.x >= 32 && point.x <= 177) {
          bands.add('5GHz');
        }
      });
      
      return bands;
    }

    _drawEmptyChannelMessage(cr, width, height, themeColors) {
      const { textColor } = themeColors;
      cr.setSourceRGBA(textColor.red, textColor.green, textColor.blue, 0.7);
      cr.selectFontFace("Cantarell, sans-serif", Cairo.FontSlant.NORMAL, Cairo.FontWeight.NORMAL);
      cr.setFontSize(14);
      const text = "Selecione uma ou mais redes para monitorar";
      const extents = cr.textExtents(text);
      cr.moveTo(width / 2 - extents.width / 2, height / 2);
      cr.showText(text);
    }

    _drawDualBandChannelChart(cr, width, height, themeColors, bands) {
      // Layout dividido: 2.4GHz no topo, 5GHz na parte inferior
      const padding = { left: 60, right: 40, top: 30, bottom: 80 };
      const totalHeight = height - padding.top - padding.bottom;
      const bandHeight = totalHeight * 0.45; // 45% para cada banda
      const bandGap = totalHeight * 0.1;     // 10% de gap entre bandas

      // Configurações para 2.4GHz (topo)
      const band24Config = {
        padding: { ...padding, bottom: padding.bottom + bandHeight + bandGap },
        height: bandHeight,
        title: "2.4 GHz",
        channels: this._get24GHzChannels(),
        yOffset: 0
      };

      // Configurações para 5GHz (fundo)
      const band5Config = {
        padding: { ...padding, top: padding.top + bandHeight + bandGap },
        height: bandHeight,
        title: "5 GHz",
        channels: this._get5GHzChannels(),
        yOffset: bandHeight + bandGap
      };

      // Desenhar banda 2.4GHz
      this._drawBandSection(cr, width, height, themeColors, band24Config, '2.4GHz');
      
      // Desenhar banda 5GHz
      this._drawBandSection(cr, width, height, themeColors, band5Config, '5GHz');

      // Legenda combinada
      this._drawDualBandLegend(cr, width, height, themeColors);
    }

    _drawSingleBandChannelChart(cr, width, height, themeColors, band) {
      const padding = { left: 60, right: 40, top: 40, bottom: 80 };
      
      const config = {
        padding: padding,
        height: height - padding.top - padding.bottom,
        title: band,
        channels: band === '5GHz' ? this._get5GHzChannels() : this._get24GHzChannels(),
        yOffset: 0
      };

      this._drawBandSection(cr, width, height, themeColors, config, band);
      this._drawSingleBandLegend(cr, width, height, themeColors, band);
    }

    _get24GHzChannels() {
      // Canais 2.4GHz padrão (1-14)
      const channels = [];
      for (let i = 1; i <= 14; i++) {
        channels.push({
          channel: i,
          frequency: 2412 + (i - 1) * 5, // Fórmula para frequência 2.4GHz
          isNonOverlapping: [1, 6, 11].includes(i)
        });
      }
      return channels;
    }

    _get5GHzChannels() {
      // Canais 5GHz comuns organizados por sub-bandas
      const channels = [
        // UNII-1 (5.15-5.25 GHz)
        { channel: 36, frequency: 5180, band: 'UNII-1', isNonOverlapping: true },
        { channel: 40, frequency: 5200, band: 'UNII-1', isNonOverlapping: true },
        { channel: 44, frequency: 5220, band: 'UNII-1', isNonOverlapping: true },
        { channel: 48, frequency: 5240, band: 'UNII-1', isNonOverlapping: true },
        
        // UNII-2A (5.25-5.35 GHz)
        { channel: 52, frequency: 5260, band: 'UNII-2A', isNonOverlapping: true },
        { channel: 56, frequency: 5280, band: 'UNII-2A', isNonOverlapping: true },
        { channel: 60, frequency: 5300, band: 'UNII-2A', isNonOverlapping: true },
        { channel: 64, frequency: 5320, band: 'UNII-2A', isNonOverlapping: true },
        
        // UNII-2C (5.47-5.725 GHz)
        { channel: 100, frequency: 5500, band: 'UNII-2C', isNonOverlapping: true },
        { channel: 104, frequency: 5520, band: 'UNII-2C', isNonOverlapping: true },
        { channel: 108, frequency: 5540, band: 'UNII-2C', isNonOverlapping: true },
        { channel: 112, frequency: 5560, band: 'UNII-2C', isNonOverlapping: true },
        { channel: 116, frequency: 5580, band: 'UNII-2C', isNonOverlapping: true },
        { channel: 132, frequency: 5660, band: 'UNII-2C', isNonOverlapping: true },
        { channel: 136, frequency: 5680, band: 'UNII-2C', isNonOverlapping: true },
        { channel: 140, frequency: 5700, band: 'UNII-2C', isNonOverlapping: true },
        
        // UNII-3 (5.725-5.875 GHz)
        { channel: 149, frequency: 5745, band: 'UNII-3', isNonOverlapping: true },
        { channel: 153, frequency: 5765, band: 'UNII-3', isNonOverlapping: true },
        { channel: 157, frequency: 5785, band: 'UNII-3', isNonOverlapping: true },
        { channel: 161, frequency: 5805, band: 'UNII-3', isNonOverlapping: true },
        { channel: 165, frequency: 5825, band: 'UNII-3', isNonOverlapping: true }
      ];
      
      return channels;
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

    // Funções auxiliares para o mapa de canais dual-band
    _drawBandSection(cr, width, height, themeColors, config, bandType) {
      const { padding, title, channels } = config;
      const plotWidth = width - padding.left - padding.right;
      const plotHeight = config.height;
      
      // Agrupar dados por canal para esta banda
      const channelGroups = this._groupDataByChannel(channels, bandType);
      
      // Desenhar fundo da banda
      this._drawBandBackground(cr, width, padding, plotWidth, plotHeight, title, themeColors);
      
      // Desenhar canais
      this._drawBandChannels(cr, padding, plotWidth, plotHeight, channels, channelGroups, themeColors);
      
      // Desenhar indicadores especiais (canais recomendados, sub-bandas)
      this._drawBandIndicators(cr, padding, plotWidth, plotHeight, channels, bandType, themeColors);
    }

    _groupDataByChannel(channels, bandType) {
      const channelGroups = new Map();
      
      this._data.forEach((series, seriesIdx) => {
        if (!series.data || series.data.length === 0) return;
        
        series.data.forEach((point) => {
          // Determinar canal baseado na banda
          let targetChannel = null;
          
          if (bandType === '2.4GHz' && point.x >= 1 && point.x <= 14) {
            targetChannel = Math.round(point.x);
          } else if (bandType === '5GHz' && point.x >= 32 && point.x <= 177) {
            targetChannel = Math.round(point.x);
          }
          
          if (!targetChannel) return;
          
          if (!channelGroups.has(targetChannel)) {
            channelGroups.set(targetChannel, []);
          }
          
          channelGroups.get(targetChannel).push({
            name: series.name,
            signal: point.y,
            frequency: this._channelToFrequency(targetChannel, bandType),
            seriesIdx: seriesIdx,
            color: this._palette[seriesIdx % this._palette.length]
          });
        });
      });
      
      return channelGroups;
    }

    _channelToFrequency(channel, bandType) {
      if (bandType === '2.4GHz') {
        return 2412 + (channel - 1) * 5;
      } else if (bandType === '5GHz') {
        // Mapeamento aproximado para 5GHz (simplificado)
        const mapping = {
          36: 5180, 40: 5200, 44: 5220, 48: 5240,
          52: 5260, 56: 5280, 60: 5300, 64: 5320,
          100: 5500, 104: 5520, 108: 5540, 112: 5560, 116: 5580,
          132: 5660, 136: 5680, 140: 5700,
          149: 5745, 153: 5765, 157: 5785, 161: 5805, 165: 5825
        };
        return mapping[channel] || 5000 + channel * 5;
      }
      return 0;
    }

    _drawBandBackground(cr, width, padding, plotWidth, plotHeight, title, themeColors) {
      const { gridColor, axisColor, textColor } = themeColors;
      
      // Grid sutil
      cr.setSourceRGBA(gridColor.red, gridColor.green, gridColor.blue, 0.2);
      cr.setLineWidth(0.5);
      
      // Linhas horizontais (níveis de sinal)
      for (let i = 0; i <= 4; i++) {
        const y = padding.top + (plotHeight * i) / 4;
        cr.moveTo(padding.left, y);
        cr.lineTo(padding.left + plotWidth, y);
        cr.stroke();
      }
      
      // Eixos principais
      cr.setSourceRGBA(axisColor.red, axisColor.green, axisColor.blue, 0.8);
      cr.setLineWidth(1.5);
      
      // Eixo Y (esquerda)
      cr.moveTo(padding.left, padding.top);
      cr.lineTo(padding.left, padding.top + plotHeight);
      cr.stroke();
      
      // Eixo X (inferior)
      cr.moveTo(padding.left, padding.top + plotHeight);
      cr.lineTo(padding.left + plotWidth, padding.top + plotHeight);
      cr.stroke();
      
      // Título da banda
      cr.setSourceRGBA(textColor.red, textColor.green, textColor.blue, 1.0);
      cr.selectFontFace("Cantarell, sans-serif", Cairo.FontSlant.NORMAL, Cairo.FontWeight.BOLD);
      cr.setFontSize(14);
      const titleExtents = cr.textExtents(title);
      cr.moveTo(padding.left, padding.top - 10);
      cr.showText(title);
      
      // Labels do eixo Y (níveis de sinal)
      cr.setFontSize(10);
      for (let i = 0; i <= 4; i++) {
        const y = padding.top + (plotHeight * i) / 4;
        const signalValue = 100 - (i * 25); // 100, 75, 50, 25, 0
        const text = `${signalValue}%`;
        const extents = cr.textExtents(text);
        cr.moveTo(padding.left - extents.width - 8, y + extents.height / 2);
        cr.showText(text);
      }
    }

    _drawBandChannels(cr, padding, plotWidth, plotHeight, channels, channelGroups, themeColors) {
      const channelWidth = plotWidth / channels.length;
      
      channels.forEach((channelInfo, index) => {
        const channel = channelInfo.channel;
        const networks = channelGroups.get(channel) || [];
        
        if (networks.length === 0) return;
        
        const centerX = padding.left + (index + 0.5) * channelWidth;
        
        // Ordenar redes por sinal (mais forte no topo)
        networks.sort((a, b) => b.signal - a.signal);
        
        const hasOverlap = networks.length > 1;
        
        // Desenhar cada rede no canal
        networks.forEach((network, networkIdx) => {
          const signalHeight = (network.signal / 100) * plotHeight;
          const baseY = padding.top + plotHeight;
          const topY = baseY - signalHeight;
          
          // Calcular posição e largura da barra
          let barWidth = channelWidth * 0.7;
          let xOffset = 0;
          
          if (hasOverlap) {
            barWidth = (channelWidth * 0.7) / networks.length;
            xOffset = (barWidth * networkIdx) - ((barWidth * (networks.length - 1)) / 2);
          }
          
          const barX = centerX - barWidth / 2 + xOffset;
          
          // Desenhar barra profissional
          this._drawAdvancedChannelBar(cr, barX, topY, barWidth, signalHeight, network, hasOverlap, channelInfo);
        });
        
        // Label do canal
        this._drawAdvancedChannelLabel(cr, centerX, padding.top + plotHeight + 15, channelInfo, hasOverlap, themeColors);
      });
    }

    _drawAdvancedChannelBar(cr, x, y, width, height, network, hasOverlap, channelInfo) {
      // Gradiente baseado na força do sinal
      const gradient = new Cairo.LinearGradient(0, y, 0, y + height);
      const alpha = hasOverlap ? 0.85 : 0.95;
      
      // Cor mais intensa para sinais fortes
      const signalStrength = network.signal / 100;
      const topAlpha = alpha * (0.6 + signalStrength * 0.4);
      const bottomAlpha = alpha * 0.3;
      
      gradient.addColorStopRGBA(0, ...network.color, topAlpha);
      gradient.addColorStopRGBA(0.6, ...network.color, alpha * 0.7);
      gradient.addColorStopRGBA(1, ...network.color, bottomAlpha);
      
      cr.setSource(gradient);
      this._roundedRect(cr, x, y, width, height, 3);
      cr.fill();

      // Contorno definido
      cr.setSourceRGBA(...network.color, 1.0);
      cr.setLineWidth(hasOverlap ? 2 : 1.5);
      this._roundedRect(cr, x, y, width, height, 3);
      cr.stroke();

      // Indicador de canal especial (não sobreposto em 2.4GHz ou UNII em 5GHz)
      if (channelInfo.isNonOverlapping && height > 20) {
        cr.setSourceRGBA(0.0, 0.9, 0.0, 0.8);
        cr.setLineWidth(1);
        cr.moveTo(x + width * 0.1, y + 3);
        cr.lineTo(x + width * 0.9, y + 3);
        cr.stroke();
      }

      // Nome da rede se altura suficiente
      if (height > 25 && width > 20) {
        cr.setSourceRGBA(...network.color, 1.0);
        cr.selectFontFace("Cantarell, sans-serif", Cairo.FontSlant.NORMAL, Cairo.FontWeight.BOLD);
        cr.setFontSize(Math.min(9, width / 6));
        
        const text = network.name.length > 6 ? network.name.substring(0, 6) + "…" : network.name;
        const textExtents = cr.textExtents(text);
        
        if (textExtents.width < width - 4) {
          cr.save();
          cr.translate(x + width / 2, y + height / 2);
          cr.rotate(-Math.PI / 2);
          cr.moveTo(-textExtents.width / 2, textExtents.height / 2);
          cr.showText(text);
          cr.restore();
        }
      }
    }

    _drawAdvancedChannelLabel(cr, x, y, channelInfo, hasOverlap, themeColors) {
      const { textColor } = themeColors;
      
      cr.setSourceRGBA(textColor.red, textColor.green, textColor.blue, 1.0);
      cr.selectFontFace("Cantarell, sans-serif", Cairo.FontSlant.NORMAL, 
                      hasOverlap ? Cairo.FontWeight.BOLD : Cairo.FontWeight.NORMAL);
      cr.setFontSize(hasOverlap ? 11 : 10);
      
      // Número do canal
      const text = `${channelInfo.channel}`;
      const extents = cr.textExtents(text);
      cr.moveTo(x - extents.width / 2, y);
      cr.showText(text);

      // Frequência (menor)
      if (channelInfo.frequency) {
        cr.setFontSize(8);
        cr.setSourceRGBA(textColor.red, textColor.green, textColor.blue, 0.7);
        const freqText = `${channelInfo.frequency}`;
        const freqExtents = cr.textExtents(freqText);
        cr.moveTo(x - freqExtents.width / 2, y + 12);
        cr.showText(freqText);
      }

      // Indicador de sub-banda para 5GHz
      if (channelInfo.band && hasOverlap) {
        cr.setSourceRGBA(1.0, 0.6, 0.0, 0.9);
        cr.setFontSize(7);
        const bandExtents = cr.textExtents(channelInfo.band);
        cr.moveTo(x - bandExtents.width / 2, y + 22);
        cr.showText(channelInfo.band);
      }
    }

    _drawBandIndicators(cr, padding, plotWidth, plotHeight, channels, bandType, themeColors) {
      const { textColor } = themeColors;
      
      if (bandType === '2.4GHz') {
        // Destacar canais não sobrepostos (1, 6, 11)
        const nonOverlappingChannels = [1, 6, 11];
        const channelWidth = plotWidth / channels.length;
        
        nonOverlappingChannels.forEach(channel => {
          const index = channels.findIndex(c => c.channel === channel);
          if (index === -1) return;
          
          const centerX = padding.left + (index + 0.5) * channelWidth;
          
          // Linha verde sutil indicando canal recomendado
          cr.setSourceRGBA(0.0, 0.8, 0.0, 0.4);
          cr.setLineWidth(3);
          cr.moveTo(centerX, padding.top);
          cr.lineTo(centerX, padding.top + plotHeight);
          cr.stroke();
        });
        
      } else if (bandType === '5GHz') {
        // Desenhar separadores entre sub-bandas UNII
        const uniiBreaks = [48, 64, 140]; // Quebras entre UNII-1/2A, UNII-2A/2C, UNII-2C/3
        
        uniiBreaks.forEach(breakChannel => {
          const index = channels.findIndex(c => c.channel === breakChannel);
          if (index === -1) return;
          
          const channelWidth = plotWidth / channels.length;
          const x = padding.left + (index + 1) * channelWidth;
          
          // Linha separadora sutil (sem dash - não suportado em todas as versões)
          cr.setSourceRGBA(textColor.red, textColor.green, textColor.blue, 0.3);
          cr.setLineWidth(1);
          
          // Simular linha tracejada manualmente
          const dashLength = 5;
          const gapLength = 5;
          const totalLength = padding.top + plotHeight - padding.top;
          let currentY = padding.top;
          
          while (currentY < padding.top + plotHeight) {
            const endY = Math.min(currentY + dashLength, padding.top + plotHeight);
            cr.moveTo(x, currentY);
            cr.lineTo(x, endY);
            cr.stroke();
            currentY = endY + gapLength;
          }
        });
      }
    }

    _drawDualBandLegend(cr, width, height, themeColors) {
      // Legenda compacta para visualização dual-band
      this._drawCompactLegend(cr, width, height, themeColors, true);
    }

    _drawSingleBandLegend(cr, width, height, themeColors, band) {
      // Legenda detalhada para visualização single-band
      this._drawCompactLegend(cr, width, height, themeColors, false, band);
    }

    _drawCompactLegend(cr, width, height, themeColors, isDualBand, band = null) {
      const { textColor, backgroundColor } = themeColors;
      const bgColor = backgroundColor || { red: 0.1, green: 0.1, blue: 0.1 };
      
      const legendX = width - 200;
      const legendY = 20;
      const legendWidth = 180;
      
      const legendItems = [];
      
      // Informações gerais
      const totalNetworks = this._data.length;
      const channelData = this._data.flatMap(s => s.data || []);
      const uniqueChannels = new Set(channelData.map(p => Math.round(p.x))).size;
      
      legendItems.push(`Redes: ${totalNetworks}`);
      legendItems.push(`Canais ativos: ${uniqueChannels}`);
      
      if (isDualBand) {
        const band24 = channelData.filter(p => p.x >= 1 && p.x <= 14).length;
        const band5 = channelData.filter(p => p.x >= 32 && p.x <= 177).length;
        legendItems.push(`2.4GHz: ${band24} • 5GHz: ${band5}`);
      }
      
      legendItems.push("Verde = Recomendado");
      legendItems.push("Laranja = Sobreposição");
      
      const legendHeight = legendItems.length * 16 + 16;
      
      // Fundo da legenda
      cr.setSourceRGBA(bgColor.red, bgColor.green, bgColor.blue, 0.95);
      this._roundedRect(cr, legendX, legendY, legendWidth, legendHeight, 6);
      cr.fill();
      
      // Borda
      cr.setSourceRGBA(textColor.red, textColor.green, textColor.blue, 0.3);
      cr.setLineWidth(1);
      this._roundedRect(cr, legendX, legendY, legendWidth, legendHeight, 6);
      cr.stroke();
      
      // Texto da legenda
      cr.setSourceRGBA(textColor.red, textColor.green, textColor.blue, 1.0);
      cr.selectFontFace("Cantarell, sans-serif", Cairo.FontSlant.NORMAL, Cairo.FontWeight.NORMAL);
      cr.setFontSize(9);
      
      legendItems.forEach((item, idx) => {
        const y = legendY + 12 + idx * 16;
        cr.moveTo(legendX + 8, y);
        cr.showText(item);
      });
    }

    // Funções auxiliares para o mapa de canais profissional (mantidas para compatibilidade)
    _drawChannelBackground(cr, padding, plotWidth, plotHeight, gridColor, axisColor, textColor) {
      // Grid vertical para cada canal
      cr.setSourceRGBA(gridColor.red, gridColor.green, gridColor.blue, 0.3);
      cr.setLineWidth(0.5);
      
      for (let channel = 1; channel <= 14; channel++) {
        const x = padding.left + ((channel - 0.5) / 14) * plotWidth;
        cr.moveTo(x, padding.top);
        cr.lineTo(x, padding.top + plotHeight);
        cr.stroke();
      }

      // Grid horizontal (níveis de sinal)
      const signalSteps = [0, 25, 50, 75, 100];
      signalSteps.forEach(signal => {
        const y = padding.top + ((100 - signal) / 100) * plotHeight;
        cr.moveTo(padding.left, y);
        cr.lineTo(padding.left + plotWidth, y);
        cr.stroke();
      });

      // Eixos principais
      cr.setSourceRGBA(axisColor.red, axisColor.green, axisColor.blue, 1.0);
      cr.setLineWidth(1.5);
      
      // Eixo Y
      cr.moveTo(padding.left, padding.top);
      cr.lineTo(padding.left, padding.top + plotHeight);
      cr.stroke();
      
      // Eixo X
      cr.moveTo(padding.left, padding.top + plotHeight);
      cr.lineTo(padding.left + plotWidth, padding.top + plotHeight);
      cr.stroke();

      // Labels dos eixos
      cr.setSourceRGBA(textColor.red, textColor.green, textColor.blue, 0.9);
      cr.selectFontFace("Cantarell, sans-serif", Cairo.FontSlant.NORMAL, Cairo.FontWeight.NORMAL);
      cr.setFontSize(10);

      // Labels Y (sinal)
      signalSteps.forEach(signal => {
        const y = padding.top + ((100 - signal) / 100) * plotHeight;
        const text = `${signal}%`;
        const extents = cr.textExtents(text);
        cr.moveTo(padding.left - extents.width - 8, y + extents.height / 2);
        cr.showText(text);
      });

      // Título dos eixos
      cr.setFontSize(12);
      
      // Label Y
      cr.save();
      cr.translate(15, padding.top + plotHeight / 2);
      cr.rotate(-Math.PI / 2);
      const yLabel = "Força do Sinal (%)";
      const yExtents = cr.textExtents(yLabel);
      cr.moveTo(-yExtents.width / 2, 0);
      cr.showText(yLabel);
      cr.restore();
      
      // Label X
      const xLabel = "Canais WiFi 2.4GHz";
      const xExtents = cr.textExtents(xLabel);
      cr.moveTo(padding.left + plotWidth / 2 - xExtents.width / 2, padding.top + plotHeight + 60);
      cr.showText(xLabel);
    }

    _drawChannelBar(cr, x, y, width, height, network, hasOverlap) {
      // Barra com gradiente profissional
      const gradient = new Cairo.LinearGradient(0, y, 0, y + height);
      const alpha = hasOverlap ? 0.8 : 0.9;
      
      gradient.addColorStopRGBA(0, ...network.color, alpha);
      gradient.addColorStopRGBA(0.5, ...network.color, alpha * 0.7);
      gradient.addColorStopRGBA(1, ...network.color, alpha * 0.4);
      
      cr.setSource(gradient);
      this._roundedRect(cr, x, y, width, height, 2);
      cr.fill();

      // Contorno da barra
      cr.setSourceRGBA(...network.color, 1.0);
      cr.setLineWidth(hasOverlap ? 2 : 1.5);
      this._roundedRect(cr, x, y, width, height, 2);
      cr.stroke();

      // Label da rede (apenas se altura suficiente)
      if (height > 30) {
        cr.setSourceRGBA(...network.color, 1.0);
        cr.selectFontFace("Cantarell, sans-serif", Cairo.FontSlant.NORMAL, Cairo.FontWeight.BOLD);
        cr.setFontSize(8);
        
        const text = network.name.length > 8 ? network.name.substring(0, 8) + "…" : network.name;
        const textExtents = cr.textExtents(text);
        
        // Rotacionar texto se necessário
        cr.save();
        cr.translate(x + width / 2, y + height / 2);
        cr.rotate(-Math.PI / 2);
        cr.moveTo(-textExtents.width / 2, textExtents.height / 2);
        cr.showText(text);
        cr.restore();
      }
    }

    _drawOverlapIndicator(cr, x, y, color, textColor) {
      // Indicador visual de sobreposição
      cr.setSourceRGBA(1.0, 0.6, 0.0, 0.9); // Laranja para sobreposição
      cr.newPath();
      cr.arc(x + 10, y, 4, 0, 2 * Math.PI);
      cr.fill();
      
      // Borda do indicador
      cr.setSourceRGBA(...color, 1.0);
      cr.setLineWidth(1);
      cr.arc(x + 10, y, 4, 0, 2 * Math.PI);
      cr.stroke();
    }

    _drawChannelLabel(cr, x, y, channel, textColor, hasOverlap) {
      cr.setSourceRGBA(textColor.red, textColor.green, textColor.blue, 1.0);
      cr.selectFontFace("Cantarell, sans-serif", Cairo.FontSlant.NORMAL, 
                      hasOverlap ? Cairo.FontWeight.BOLD : Cairo.FontWeight.NORMAL);
      cr.setFontSize(hasOverlap ? 12 : 11);
      
      const text = `${channel}`;
      const extents = cr.textExtents(text);
      cr.moveTo(x - extents.width / 2, y);
      cr.showText(text);

      // Indicador de canal congestionado
      if (hasOverlap) {
        cr.setSourceRGBA(1.0, 0.4, 0.0, 0.8);
        cr.setFontSize(8);
        const warningText = "⚠";
        const wExtents = cr.textExtents(warningText);
        cr.moveTo(x - wExtents.width / 2, y + 15);
        cr.showText(warningText);
      }
    }

    _drawNonOverlappingChannels(cr, padding, plotWidth, plotHeight, textColor) {
      // Destacar canais não sobrepostos (1, 6, 11) - padrão da indústria
      const nonOverlappingChannels = [1, 6, 11];
      
      nonOverlappingChannels.forEach(channel => {
        const x = padding.left + ((channel - 0.5) / 14) * plotWidth;
        
        // Linha vertical sutil para indicar canais recomendados
        cr.setSourceRGBA(0.0, 0.8, 0.0, 0.3); // Verde translúcido
        cr.setLineWidth(2);
        cr.moveTo(x, padding.top);
        cr.lineTo(x, padding.top + plotHeight);
        cr.stroke();
        
        // Label especial para canais recomendados
        cr.setSourceRGBA(0.0, 0.7, 0.0, 0.8);
        cr.selectFontFace("Cantarell, sans-serif", Cairo.FontSlant.NORMAL, Cairo.FontWeight.BOLD);
        cr.setFontSize(8);
        const text = "OK";
        const extents = cr.textExtents(text);
        cr.moveTo(x - extents.width / 2, padding.top - 5);
        cr.showText(text);
      });
    }

    _drawChannelLegend(cr, width, height, themeColors, channelGroups) {
      const { textColor, backgroundColor } = themeColors;
      const bgColor = backgroundColor || { red: 0.1, green: 0.1, blue: 0.1 };
      
      const legendX = width - 220;
      const legendY = 50;
      const legendWidth = 200;
      
      // Informações da legenda
      const overlapCount = Array.from(channelGroups.values()).filter(networks => networks.length > 1).length;
      const totalNetworks = this._data.length;
      
      const legendItems = [
        `Total de redes: ${totalNetworks}`,
        `Canais com sobreposição: ${overlapCount}`,
        `Canais recomendados: 1, 6, 11`,
        "⚠ = Congestionamento",
        "Verde = Sem sobreposição"
      ];
      
      const legendHeight = legendItems.length * 18 + 20;
      
      // Fundo da legenda
      cr.setSourceRGBA(bgColor.red, bgColor.green, bgColor.blue, 0.95);
      this._roundedRect(cr, legendX, legendY, legendWidth, legendHeight, 8);
      cr.fill();
      
      // Borda da legenda
      cr.setSourceRGBA(textColor.red, textColor.green, textColor.blue, 0.4);
      cr.setLineWidth(1);
      this._roundedRect(cr, legendX, legendY, legendWidth, legendHeight, 8);
      cr.stroke();
      
      // Itens da legenda
      cr.setSourceRGBA(textColor.red, textColor.green, textColor.blue, 1.0);
      cr.selectFontFace("Cantarell, sans-serif", Cairo.FontSlant.NORMAL, Cairo.FontWeight.NORMAL);
      cr.setFontSize(10);
      
      legendItems.forEach((item, idx) => {
        const y = legendY + 15 + idx * 18;
        cr.moveTo(legendX + 10, y);
        cr.showText(item);
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
