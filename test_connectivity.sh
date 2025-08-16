#!/bin/bash

echo "=== Teste de Conectividade WiFi Analyzer ==="
echo

# Verificar se nmcli está disponível
if command -v nmcli &> /dev/null; then
    echo "✓ nmcli está disponível"
    
    # Verificar conexões ativas
    echo
    echo "Conexões WiFi ativas:"
    nmcli -t -f NAME,TYPE,DEVICE connection show --active | grep 802-11-wireless
    
    # Obter informações da conexão ativa
    active_wifi=$(nmcli -t -f NAME,TYPE connection show --active | grep 802-11-wireless | head -1 | cut -d: -f1)
    
    if [ ! -z "$active_wifi" ]; then
        echo
        echo "Detalhes da conexão '$active_wifi':"
        nmcli -t -f IP4.ADDRESS,IP4.GATEWAY,IP4.DNS connection show "$active_wifi"
    else
        echo "Nenhuma conexão WiFi ativa encontrada"
    fi
else
    echo "✗ nmcli não está disponível"
fi

echo
echo "=== Verificar se nmap está disponível ==="
if command -v nmap &> /dev/null; then
    echo "✓ nmap está disponível para escaneamento de rede"
else
    echo "✗ nmap não está disponível (funcionalidade de escaneamento de dispositivos limitada)"
fi

echo
echo "=== Informações da rede atual ==="
# Obter gateway padrão
gateway=$(ip route | grep default | head -1 | awk '{print $3}')
if [ ! -z "$gateway" ]; then
    echo "Gateway: $gateway"
    
    # Obter IP local
    local_ip=$(ip route get 8.8.8.8 | head -1 | awk '{print $7}')
    echo "IP local: $local_ip"
    
    # Verificar conectividade com gateway
    if ping -c 1 -W 1 "$gateway" &> /dev/null; then
        echo "✓ Conectividade com gateway OK"
    else
        echo "✗ Sem conectividade com gateway"
    fi
else
    echo "✗ Gateway não encontrado"
fi

echo
echo "=== Teste concluído ==="
