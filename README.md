# WiFi Analyzer - Analisador WiFi Avançado

> Estado: **Versão Beta Avançada** – Funcionalidades principais implementadas, incluindo Hunt Mode, GPS, telemetria e compatibilidade completa com Sparrow-wifi. Interface madura e estável.

## 🚀 Funcionalidades Principais

### 📊 Análise Básica de WiFi
- **Escaneamento em tempo real** de redes WiFi próximas (2.4/5/6 GHz)
- **Gráficos dinâmicos** de sinal vs tempo, espectro, mapa de canais e força do sinal
- **Lista organizada** com informações detalhadas de cada rede
- **Seleção múltipla** para comparar várias redes simultaneamente
- **Agrupamento por banda** e ordenação inteligente

### 🎯 Hunt Mode (Rastreamento Avançado)
- **Modo Hunt** para rastreamento específico de redes-alvo
- **Telemetria em tempo real** com histórico de sinal
- **Análise de tendências** (melhorando/piorando/estável)
- **Interface de telemetria dedicada** com gráficos e estatísticas
- **Compatibilidade total** com Sparrow-wifi

### 📍 Integração GPS
- **Localização automática** com coordenadas GPS
- **Mapeamento de redes** por localização
- **Precisão de posicionamento** para análise geográfica
- **Simulação GPS** para teste (quando hardware não disponível)

### 🔍 Detalhes Avançados de Rede
- **Dialog de informações completas** para cada rede (botão ℹ️)
- **Análise de segurança** com níveis e recomendações
- **Estimativa de distância** baseada em força do sinal
- **Lookup de fabricante** via OUI (Organizationally Unique Identifier)
- **Histórico de detecções** e estatísticas de sinal

### 📁 Exportação e Importação
- **Múltiplos formatos**: JSON, CSV, Sparrow-wifi compatible
- **Exportação seletiva** de redes específicas ou conjuntos completos
- **Compatibilidade total** com dados do Sparrow-wifi
- **Importação de dados** existentes para análise

## Principais Tecnologias
- **GJS** (JavaScript para GNOME)
- **GTK4 + Libadwaita** (UI moderna, ViewStack, HeaderBar, Dialogs, Preferences, Toasts)
- **D‑Bus (NetworkManager)** para descoberta de dispositivos e Access Points
- **Fallback nmcli** quando D‑Bus falha / não disponível
- **Mock interno (Dev Mode)** para testes sem hardware real
- **Cairo** (desenho de gráficos customizados)
- **GSettings** (persistência de preferências: intervalo de atualização, tema, ícones, notificações, dev/debug)
- **Sistema de Notificações** com throttling (cooldowns, silêncio inicial, limite por janela de tempo)
- **Flatpak** (empacotamento e sandbox)
- **CSS moderno** com tokens de tema (root-light / root-dark) e componentes estilizados (pills, barras de sinal, separadores de banda)

## Funcionalidades Já Implementadas
- Scan periódico com fallback inteligente (D‑Bus → nmcli → mock)
- Agrupamento por banda e ordenação por força de sinal
- Indicadores visuais: ícone de intensidade, barra de progresso, pills (segurança, canal, banda)
- Gráficos em tempo real (base existentes prontos para expansão)
- Análise inicial de canais (sugestões para 2.4 GHz e 5 GHz)
- Preferências persistentes (tema, ícones, modo dev, debug, notificações, intervalo)
- Tema dinâmico (tokens prontos + aplicação de classes root-light/root-dark)
- Notificações controladas: novas redes, redes desaparecidas, queda brusca de sinal

## Em Andamento / Próximos Passos (Roadmap)
- Estender redesign visual para todas as páginas e gráficos
- Refinar análise de canais (6 GHz, largura de canal futura)
- Otimização de performance (diff incremental em vez de reconstruir lista)
- Filtro/pesquisa de redes
- Mais métricas nos gráficos (ruído, variação temporal, estabilidade)
- Acessibilidade: foco visível, alto contraste, revisões de cores
- Internacionalização completa (estrutura `po/` já presente)

## Variáveis de Ambiente
| Variável | Efeito |
|----------|--------|
| `WIFI_ANALYZER_DEV=1` | Ativa modo mock (gera redes simuladas) |
| `WIFI_ANALYZER_DEBUG=1` | Log detalhado no console |
| `WIFI_ANALYZER_NO_NOTIF=1` | Desliga notificações de rede independentemente da preferência |

## Preferências (GSettings)
Schema: `com.example.WifiAnalyzer`
- `refresh-interval` (int, segundos)
- `enable-notifications` (bool)
- `color-scheme` (`system`, `light`, `dark`)
- `icon-variant` (`default`, `alt1`, `alt2`)
- `enable-dev-mode` (bool)
- `enable-debug-logging` (bool)

## Build & Execução (Flatpak / Meson)
Pré-requisitos: Flatpak & Flatpak Builder instalados.

1. (Opcional) Inspecione dependências no manifest gerado em `build-dir/files/manifest.json` (ou futuro manifest principal).
2. Compile via Meson para desenvolvimento local (fora de sandbox):
```
meson setup build
meson compile -C build
./build/wifi-analyzer   # se binário/script for gerado localmente
```
3. Executar dentro do Flatpak (padrão durante desenvolvimento):
```
flatpak run --env=WIFI_ANALYZER_DEBUG=1 com.example.WifiAnalyzer
```
(Se instalar localmente via `flatpak-builder` primeiro:)
```
flatpak-builder build-dir com.example.WifiAnalyzer.json --install --user --force-clean
flatpak run com.example.WifiAnalyzer
```

## Estrutura (Resumo)
- `src/` Código principal (application.js, window.js, networkManager.js, *charts*, *analyzers*)
- `data/` Arquivos .desktop, metainfo, schemas GSettings, ícones
- `po/` Internacionalização
- `modern.css` Estilos customizados

## Contribuindo
Contribuições são bem-vindas nesta fase inicial:
1. Abra uma issue descrevendo bug ou proposta.
2. Para PRs: mantenha commits claros e explique mudanças no contexto de UI/UX ou backend.
3. Respeite o estilo atual (GJS + Libadwaita patterns). Evite dependências externas desnecessárias.

## Status de Estabilidade
Muitas APIs internas podem mudar (nomes de métodos, estrutura de objetos de rede, tokens de CSS). Não recomendado empacotar em distros ainda.

## Licença
GPL-3.0 (ver About dialog / futuro arquivo LICENSE).

---
Feedback, sugestões e críticas são essenciais nesta fase. Obrigado por testar!
