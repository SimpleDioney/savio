#!/bin/bash

# Configurações
BACKUP_DIR="/home/ubuntu/task-management/backups"
APP_DIR="/home/ubuntu/task-management"
DATE=$(date +%Y-%m-%d_%H-%M-%S)
BACKUP_NAME="backup_${DATE}"
RETENTION_DAYS=7

# Criar diretório de backup se não existir
mkdir -p $BACKUP_DIR

# Backup do banco de dados
cp $APP_DIR/database.sqlite "${BACKUP_DIR}/${BACKUP_NAME}.sqlite"

# Comprimir backup
cd $BACKUP_DIR
tar -czf "${BACKUP_NAME}.tar.gz" "${BACKUP_NAME}.sqlite"
rm "${BACKUP_NAME}.sqlite"

# Sincronizar com S3 (opcional)
# aws s3 sync $BACKUP_DIR s3://seu-bucket/backups/

# Remover backups antigos (mais de 7 dias)
find $BACKUP_DIR -type f -mtime +$RETENTION_DAYS -delete

# Registrar backup
echo "Backup realizado: ${BACKUP_NAME}" >> $BACKUP_DIR/backup.log