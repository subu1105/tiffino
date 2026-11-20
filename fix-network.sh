#!/usr/bin/env bash
# TIFFINO — network badalne ke baad yeh ek script sab theek kar deti hai.
# Usage:  ./fix-network.sh
set -e
cd "$(dirname "$0")"

IP=$(ip route get 1.1.1.1 2>/dev/null | grep -oP 'src \K[0-9.]+')
if [ -z "$IP" ]; then
  echo "❌ Laptop kisi network se juda nahi hai — pehle WiFi/hotspot connect karo."
  exit 1
fi

echo "EXPO_PUBLIC_API_URL=http://$IP:4000" > apps/mobile/.env
pkill -f "expo start" 2>/dev/null || true
sleep 1

echo ""
echo "✅ Laptop IP:        $IP"
echo "✅ Mobile .env set:  http://$IP:4000"
echo "✅ Purana Metro band kar diya"
echo ""
echo "AB YEH KARO:"
echo "  1. cd apps/mobile && npx expo start -c"
echo "  2. Phone pe Expo Go kholo → NAYA QR scan karo (recents se nahi!)"
echo ""
echo "Phone browser test: http://$IP:4000/api/health  (JSON dikhe to connection OK)"
