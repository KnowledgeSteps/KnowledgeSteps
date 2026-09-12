set -eu
id knowledgesteps >/dev/null 2>&1 || sudo useradd --system --home /opt/knowledgesteps --shell /usr/sbin/nologin knowledgesteps
sudo install -d -o knowledgesteps -g knowledgesteps -m 750 /opt/knowledgesteps /var/lib/knowledgesteps
sudo install -d -o root -g knowledgesteps -m 750 /etc/knowledgesteps
sudo install -d -m 755 /var/www/knowledgesteps /var/www/letsencrypt
sudo install -m 644 ~/knowledgesteps-upload/learning-backend-0.1.0.jar /opt/knowledgesteps/app.jar
sudo tar -xzf ~/knowledgesteps-upload/frontend-deploy.tar.gz -C /var/www/knowledgesteps
sudo chmod -R a+rX /var/www/knowledgesteps
sudo install -m 644 ~/knowledgesteps-upload/knowledgesteps.service /etc/systemd/system/knowledgesteps.service
sudo install -m 644 ~/knowledgesteps-upload/ksteps-http.conf /etc/nginx/sites-available/knowledgesteps
sudo ln -sf /etc/nginx/sites-available/knowledgesteps /etc/nginx/sites-enabled/knowledgesteps
sudo nginx -t
sudo systemctl reload nginx
sudo systemctl daemon-reload
sudo certbot certonly --webroot -w /var/www/letsencrypt -d ksteps.yinbo.online --non-interactive --agree-tos --register-unsafely-without-email
