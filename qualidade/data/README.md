# Diretório de dados

Este diretório armazena:
- `qualidade.db` — banco SQLite (criado pelo instalador)
- `logs/` — logs da aplicação (se habilitado)

**ATENÇÃO:**
- Este diretório precisa ter permissão de escrita para o usuário do Apache (`www-data`)
- O acesso direto via HTTP é bloqueado pelo `.htaccess`
- Faça backup regular deste diretório (ver `scripts/backup.sh`)
- Não versione o conteúdo (banco e logs) em sistemas como Git
