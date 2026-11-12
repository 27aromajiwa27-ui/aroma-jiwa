#!/usr/bin/env bash
# Pasang Aroma Jiwa Hadir di VPS Ubuntu (Oracle Cloud / GCP) dalam satu perintah.
#
#   cd ~/aroma && sudo bash deploy/setup.sh aromajiwa.duckdns.org email@anda.com
#
# Aman dijalankan berulang kali. Yang dilakukan:
#   1. pasang python3, nginx, certbot (aplikasi ini tidak butuh pip/npm)
#   2. daftarkan systemd service aroma-jiwa (bind 127.0.0.1:4000)
#   3. buka port 80/443 (termasuk iptables bawaan image Oracle Cloud)
#   4. pasang nginx reverse proxy untuk domain Anda
#   5. terbitkan sertifikat HTTPS Let's Encrypt + redirect otomatis
set -euo pipefail

DOMAIN=${1:?Pakai: sudo bash deploy/setup.sh <domain> [email]}
EMAIL=${2:-admin@$DOMAIN}
APP_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
RUN_USER=${SUDO_USER:-root}

if [ "$(id -u)" -ne 0 ]; then
    echo "Jalankan dengan sudo." >&2
    exit 1
fi

echo "== 1/5 paket sistem"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq python3 nginx certbot python3-certbot-nginx curl rsync

echo "== 2/5 service aplikasi ($APP_DIR, user $RUN_USER)"
chown -R "$RUN_USER":"$RUN_USER" "$APP_DIR"
sed -e "s|^User=.*|User=$RUN_USER|" \
    -e "s|^WorkingDirectory=.*|WorkingDirectory=$APP_DIR|" \
    "$APP_DIR/deploy/aroma-jiwa.service" > /etc/systemd/system/aroma-jiwa.service
systemctl daemon-reload
systemctl enable --now aroma-jiwa >/dev/null
sleep 2
if ! curl -fsS -o /dev/null http://127.0.0.1:4000/api/health; then
    echo "Server gagal start. Lihat: journalctl -u aroma-jiwa -n 50" >&2
    exit 1
fi
echo "   server lokal OK"

echo "== 3/5 port 80/443"
if command -v ufw >/dev/null && ufw status | grep -q "Status: active"; then
    ufw allow 80/tcp >/dev/null
    ufw allow 443/tcp >/dev/null
fi
# Image Ubuntu di Oracle Cloud menolak semua port selain 22 lewat iptables.
if command -v iptables >/dev/null; then
    iptables -C INPUT -p tcp --dport 80 -j ACCEPT 2>/dev/null || iptables -I INPUT -p tcp --dport 80 -j ACCEPT
    iptables -C INPUT -p tcp --dport 443 -j ACCEPT 2>/dev/null || iptables -I INPUT -p tcp --dport 443 -j ACCEPT
    command -v netfilter-persistent >/dev/null && netfilter-persistent save >/dev/null 2>&1 || true
fi

echo "== 4/5 nginx untuk $DOMAIN"
NGINX_CONF=/etc/nginx/sites-available/aromajiwa
# Jangan menimpa konfigurasi yang sudah diubah certbot (blok 443 + redirect).
if [ ! -f "$NGINX_CONF" ] || ! grep -q "managed by Certbot" "$NGINX_CONF"; then
    sed "s|aromajiwa.duckdns.org|$DOMAIN|g" "$APP_DIR/deploy/nginx.conf" > "$NGINX_CONF"
fi
ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/aromajiwa
rm -f /etc/nginx/sites-enabled/default
nginx -t >/dev/null
systemctl reload nginx

echo "== 5/5 sertifikat HTTPS"
certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos --redirect \
    --keep-until-expiring -m "$EMAIL" >/dev/null
systemctl enable --now certbot.timer >/dev/null 2>&1 || true

echo
echo "Selesai. Cek dari luar:"
echo "  curl -I https://$DOMAIN"
echo "  curl -I https://$DOMAIN/.well-known/assetlinks.json"
echo
echo "Langkah berikutnya:"
echo "  1. Buka https://$DOMAIN di HP, login, ganti PIN owner 2727 (menu Pengaturan)."
echo "  2. Bungkus jadi APK di https://www.pwabuilder.com (URL: https://$DOMAIN/)."
echo "  3. Timpa app/.well-known/assetlinks.json dengan berkas dari PWABuilder,"
echo "     lalu: sudo systemctl restart aroma-jiwa"
echo "  4. Cadangan harian:"
echo "     (crontab -l; echo '0 2 * * * cd $APP_DIR && /usr/bin/python3 deploy/backup.py') | crontab -"
