#!/bin/bash
# ============================================================================
# Script de Backup - Sistema de Qualidade Persianas Paraná
#
# Cria backup compactado do banco de dados e arquivos de configuração.
# Mantém os últimos N backups (padrão: 30 dias) para rotação automática.
#
# Uso recomendado: agendar via cron diário.
#   0 2 * * * /caminho/para/scripts/backup.sh > /var/log/persianas-backup.log 2>&1
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
APP_ROOT="$( dirname "$SCRIPT_DIR" )"
BACKUP_DIR="${APP_ROOT}/backups"
RETENTION_DAYS=30
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/qualidade_${TIMESTAMP}.tar.gz"

# Cria diretório de backup se não existir
mkdir -p "${BACKUP_DIR}"
chmod 750 "${BACKUP_DIR}"

echo "[$(date)] Iniciando backup..."

# Compacta banco de dados e configuração
tar -czf "${BACKUP_FILE}" \
    -C "${APP_ROOT}" \
    data/qualidade.db \
    config/config.php \
    2>/dev/null

if [ -f "${BACKUP_FILE}" ]; then
    SIZE=$(du -h "${BACKUP_FILE}" | cut -f1)
    echo "[$(date)] Backup criado: ${BACKUP_FILE} (${SIZE})"
else
    echo "[$(date)] ERRO: Falha ao criar backup" >&2
    exit 1
fi

# Define permissão restritiva no backup
chmod 640 "${BACKUP_FILE}"

# Remove backups mais antigos que RETENTION_DAYS
DELETED=$(find "${BACKUP_DIR}" -name "qualidade_*.tar.gz" -mtime +${RETENTION_DAYS} -delete -print | wc -l)
if [ "${DELETED}" -gt 0 ]; then
    echo "[$(date)] Removidos ${DELETED} backups antigos (> ${RETENTION_DAYS} dias)"
fi

echo "[$(date)] Backup concluído com sucesso."
