//
// WiFi Channel Analyzer
//
// Este módulo fornece funções para analisar uma lista de redes WiFi,
// calcular a congestão dos canais e sugerir canais ideais para as
// bandas de 2.4GHz e 5GHz.
//

var ChannelAnalyzer = {
  // Para a banda de 2.4GHz, canais se sobrepõem. Consideramos que um
  // canal interfere com outros até 4 canais de distância.
  // Ex: Canal 6 interfere com os canais de 2 a 10.
  _2_4GHZ_OVERLAP_RANGE: 4,

  // Canais não sobrepostos na banda 2.4GHz, que são os melhores candidatos.
  _2_4GHZ_CANDIDATE_CHANNELS: [1, 6, 11],

  // Canais comuns na banda 5GHz (excluindo canais DFS para simplificar a sugestão).
  _5GHZ_CANDIDATE_CHANNELS: [36, 40, 44, 48, 149, 153, 157, 161, 165],

  /**
   * Analisa uma lista de redes e retorna um relatório detalhado.
   * @param {Array<Object>} networks - Uma lista de objetos de rede.
   * @returns {Object} Um objeto contendo a análise para as bandas 2.4GHz e 5GHz.
   */
  analyze: function (networks) {
    // 1. Separa as redes por banda de frequência.
    const networks24 = networks.filter(
      (n) => n.frequency < 3000 && n.channel <= 14
    );
    const networks5 = networks.filter((n) => n.frequency >= 5000);

    // 2. Executa a análise para cada banda.
    const analysis24 = this._analyze24GHz(networks24);
    const analysis5 = this._analyze5GHz(networks5);

    // 3. Retorna o relatório combinado.
    return {
      "2.4GHz": analysis24,
      "5GHz": analysis5,
    };
  },

  /**
   * Realiza a análise detalhada para a banda de 2.4GHz.
   * @private
   * @param {Array<Object>} networks - Redes da banda de 2.4GHz.
   * @returns {Object} Análise da banda de 2.4GHz.
   */
  _analyze24GHz: function (networks) {
    const channelDetails = new Map();

    // Inicializa os detalhes para os canais 1 a 14.
    for (let i = 1; i <= 14; i++) {
      channelDetails.set(i, {
        networks: [],
        interferenceScore: 0,
      });
    }

    // Agrupa as redes por canal.
    for (const network of networks) {
      if (channelDetails.has(network.channel)) {
        channelDetails.get(network.channel).networks.push(network);
      }
    }

    // Calcula a pontuação de interferência para cada canal.
    // A pontuação é baseada no número e na força do sinal das redes
    // em canais sobrepostos.
    for (let targetChannel = 1; targetChannel <= 14; targetChannel++) {
      let score = 0;
      for (const network of networks) {
        if (
          Math.abs(network.channel - targetChannel) <=
          this._2_4GHZ_OVERLAP_RANGE
        ) {
          // Uma rede forte contribui mais para a interferência.
          // Adicionamos 1 para que mesmo redes fracas contem.
          score += network.signal + 1;
        }
      }
      channelDetails.get(targetChannel).interferenceScore = score;
    }

    // Sugere o melhor canal entre os candidatos (1, 6, 11).
    let suggestion = {
      channel: null,
      score: Infinity,
      reason: "Nenhum canal ideal encontrado.",
    };
    if (networks.length > 0) {
      for (const candidateChannel of this._2_4GHZ_CANDIDATE_CHANNELS) {
        const details = channelDetails.get(candidateChannel);
        if (details && details.interferenceScore < suggestion.score) {
          suggestion.score = details.interferenceScore;
          suggestion.channel = candidateChannel;
        }
      }
      if (suggestion.channel !== null) {
        const networkCount = channelDetails.get(suggestion.channel).networks
          .length;
        if (networkCount === 0) {
          suggestion.reason =
            "Canal livre e com menor interferência de vizinhos.";
        } else {
          suggestion.reason = `Canal com menor interferência (${networkCount} rede(s) diretamente nele).`;
        }
      }
    } else {
      suggestion.channel = 1; // Se não há redes, qualquer um serve.
      suggestion.score = 0;
      suggestion.reason =
        "A banda está livre. Canal 1 é uma boa escolha padrão.";
    }

    return {
      channelDetails: Object.fromEntries(channelDetails), // Converte Map para Objeto para facilitar o uso
      suggestion: suggestion,
    };
  },

  /**
   * Realiza a análise para a banda de 5GHz.
   * @private
   * @param {Array<Object>} networks - Redes da banda de 5GHz.
   * @returns {Object} Análise da banda de 5GHz.
   */
  _analyze5GHz: function (networks) {
    const channelDetails = new Map();

    // Agrupa as redes por canal.
    for (const network of networks) {
      if (!channelDetails.has(network.channel)) {
        channelDetails.set(network.channel, { networks: [] });
      }
      channelDetails.get(network.channel).networks.push(network);
    }

    // Na banda 5GHz, a sobreposição é menos problemática. A sugestão
    // baseia-se em encontrar um canal com o menor número de redes.
    let suggestion = {
      channel: null,
      score: Infinity,
      reason: "Nenhum canal ideal encontrado.",
    };
    if (networks.length > 0) {
      for (const candidateChannel of this._5GHZ_CANDIDATE_CHANNELS) {
        if (channelDetails.has(candidateChannel)) {
          const networkCount =
            channelDetails.get(candidateChannel).networks.length;
          if (networkCount < suggestion.score) {
            suggestion.score = networkCount;
            suggestion.channel = candidateChannel;
          }
        } else {
          // Encontramos um canal candidato que está completamente livre.
          suggestion.score = 0;
          suggestion.channel = candidateChannel;
          break; // É a melhor opção, não precisa procurar mais.
        }
      }
      if (suggestion.channel !== null) {
        if (suggestion.score === 0) {
          suggestion.reason = "Canal candidato livre encontrado.";
        } else {
          suggestion.reason = `Canal candidato com o menor número de redes (${suggestion.score}).`;
        }
      }
    } else {
      suggestion.channel = 36; // Padrão se a banda estiver vazia.
      suggestion.score = 0;
      suggestion.reason =
        "A banda está livre. Canal 36 é uma boa escolha padrão.";
    }

    return {
      channelDetails: Object.fromEntries(channelDetails),
      suggestion: suggestion,
    };
  },
};
