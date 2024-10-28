#!/bin/bash

# Cores para output
RED='\033[0;31m'
GREEN='\033[0;32m'
NC='\033[0m'

echo -e "${GREEN}Iniciando setup do servidor...${NC}"

# Atualizar sistema
echo -e "${GREEN}Atualizando sistema...${NC}"
sudo apt-get update
sudo apt-get upgrade -y

# Instalar dependências básicas
echo -e "${GREEN}Instalando dependências básicas...${NC}"
sudo apt-get install -y curl git build-essential

# Instalar Node.js
echo -e "${GREEN}Instalando Node.js...${NC}"
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verificar instalação
node --version
npm --version

# Instalar PM2 globalmente
echo -e "${GREEN}Instalando PM2...${NC}"
sudo npm install -g pm2

# Criar diretórios necessários
echo -e "${GREEN}Criando diretórios...${NC}"
mkdir -p /home/ubuntu/task-management/logs
mkdir -p /home/ubuntu/task-management/backups

# Configurar permissões
sudo chown -R ubuntu:ubuntu /home/ubuntu/task-management

# Instalar e configurar Nginx
echo -e "${GREEN}Configurando Nginx...${NC}"
sudo apt-get install -y nginx
sudo rm /etc/nginx/sites-enabled/default
sudo cp /home/ubuntu/task-management/deploy/nginx.conf /etc/nginx/sites-available/task-management
sudo ln -s /etc/nginx/sites-available/task-management /etc/nginx/sites-enabled/

# Instalar e configurar Certbot para HTTPS
echo -e "${GREEN}Configurando HTTPS...${NC}"
sudo apt-get install -y certbot python3-certbot-nginx

# Configurar firewall
echo -e "${GREEN}Configurando firewall...${NC}"
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw --force enable

# Instalar fail2ban para segurança
echo -e "${GREEN}Configurando fail2ban...${NC}"
sudo apt-get install -y fail2ban
sudo cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local
sudo systemctl enable fail2ban
sudo systemctl start fail2ban

# Instalar CloudWatch agent
echo -e "${GREEN}Instalando CloudWatch agent...${NC}"
wget https://s3.amazonaws.com/amazoncloudwatch-agent/ubuntu/amd64/latest/amazon-cloudwatch-agent.deb
sudo dpkg -i amazon-cloudwatch-agent.deb
sudo cp /home/ubuntu/task-management/deploy/cloudwatch-config.json /opt/aws/amazon-cloudwatch-agent/bin/config.json
sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-ctl -a fetch-config -m ec2 -s -c file:/opt/aws/amazon-cloudwatch-agent/bin/config.json

# Configurar backup automático
echo -e "${GREEN}Configurando backup automático...${NC}"
sudo cp /home/ubuntu/task-management/deploy/backup.sh /home/ubuntu/task-management/
sudo chmod +x /home/ubuntu/task-management/backup.sh
(crontab -l 2>/dev/null; echo "0 0 * * * /home/ubuntu/task-management/backup.sh") | crontab -

# Instalar dependências do projeto
echo -e "${GREEN}Instalando dependências do projeto...${NC}"
cd /home/ubuntu/task-management
npm install --production

# Iniciar aplicação com PM2
echo -e "${GREEN}Iniciando aplicação...${NC}"
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup

# Reiniciar Nginx
sudo systemctl restart nginx

echo -e "${GREEN}Setup concluído!${NC}"
echo -e "${GREEN}Não esqueça de configurar o arquivo .env e o certificado SSL${NC}"