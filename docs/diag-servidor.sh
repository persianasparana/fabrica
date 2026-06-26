#!/usr/bin/env bash
# diag-persianas.sh — Raio-X READ-ONLY do servidor compartilhado Persianas Paraná
# Não altera NADA. Só lê estado (PM2, portas, Postgres/MySQL, Nginx, /var/www, health).
# Uso: bash diag-persianas.sh   (rode como o usuário que tem o PM2; postgres/nginx pedem sudo)

set +e
LARG=78
linha(){ printf '%*s\n' "$LARG" '' | tr ' ' '='; }
titulo(){ linha; printf '== %s\n' "$1"; linha; }
sub(){ printf '\n-- %s --\n' "$1"; }
tem(){ command -v "$1" >/dev/null 2>&1; }

echo "RAIO-X SERVIDOR PERSIANAS PARANÁ — $(date '+%F %T')"
echo "(read-only; cole a saída inteira de volta na conversa de integração)"

titulo "1. SERVIDOR / SO"
echo "host: $(hostname)    usuario: $(whoami)"
echo "uptime:$(uptime -p 2>/dev/null)"
tem hostnamectl && hostnamectl 2>/dev/null | grep -Ei 'Operating|Kernel|Architecture'
sub "IPs"
( ip -4 -o addr show scope global 2>/dev/null | awk '{print $2, $4}' ) || hostname -I

titulo "2. RUNTIMES / VERSÕES"
for c in node npm pm2 nginx psql mysql mariadb; do
  if tem "$c"; then printf '%-8s %s\n' "$c" "$($c --version 2>&1 | head -1)"; else printf '%-8s (ausente)\n' "$c"; fi
done

titulo "3. PM2 (processos)"
if tem pm2; then
  pm2 jlist 2>/dev/null | (tem node && node -e '
    let d="";process.stdin.on("data",c=>d+=c).on("end",()=>{try{
      const a=JSON.parse(d);if(!a.length){console.log("(nenhum processo PM2 para este usuario)");return;}
      a.forEach(p=>{const e=p.pm2_env||{};console.log(
        (p.name||"?").padEnd(18),"| status:",(e.status||"?").padEnd(8),
        "| restarts:",String(e.restart_time||0).padEnd(4),
        "| mem:",Math.round((p.monit&&p.monit.memory||0)/1048576)+"M",
        "| cwd:",e.pm_cwd||e.cwd||"?","| script:",(e.pm_exec_path||"").split("/").slice(-1)[0]);});
    }catch(err){console.log("(falha ao parsear pm2 jlist — veja pm2 list abaixo)");}});' || cat)
  echo; pm2 list 2>/dev/null
  echo "OBS: se aparecer vazio, rode como o usuario dono do PM2 (ex.: sudo -u <user> pm2 list)."
else echo "(pm2 ausente neste PATH)"; fi

titulo "4. PORTAS ESCUTANDO (LISTEN)"
if tem ss; then sudo ss -tlnp 2>/dev/null | awk 'NR==1||/LISTEN/' || ss -tlnp 2>/dev/null
elif tem netstat; then sudo netstat -tlnp 2>/dev/null
else echo "(sem ss/netstat)"; fi
echo
echo "Portas esperadas pelos repos: 3000=logistica 3010=agenda-api 3011=agenda-admin 3020=fabrica 3030=rh 3040=financeiro 5432=postgres"
echo "(a Fabrica documenta tambem 3001 como 'reservada' — confira se algo escuta nela)"

titulo "5. POSTGRESQL — bancos, donos e roles"
if tem psql; then
  echo ">> Bancos e donos:"
  sudo -u postgres psql -tA -F'|' -c \
    "SELECT d.datname, pg_catalog.pg_get_userbyid(d.datdba) AS owner FROM pg_database d WHERE datistemplate=false ORDER BY 1;" 2>/dev/null \
    || echo "(precisa de sudo -u postgres; rode o bloco como root/sudo)"
  echo; echo ">> Roles:"
  sudo -u postgres psql -tA -c "SELECT rolname FROM pg_roles WHERE rolcanlogin ORDER BY 1;" 2>/dev/null
  echo; echo ">> Donos das TABELAS por banco (bug conhecido: reset p/ postgres):"
  for db in persianas_db agenda_consultores fabrica_db rh_db financeiro_db; do
    out=$(sudo -u postgres psql -tA -F'|' -d "$db" -c \
      "SELECT tableowner, count(*) FROM pg_tables WHERE schemaname='public' GROUP BY 1 ORDER BY 2 DESC;" 2>/dev/null)
    [ -n "$out" ] && { echo "  [$db]"; echo "$out" | sed 's/^/    /'; }
  done
else echo "(psql ausente)"; fi

titulo "6. MYSQL / MARIADB (procurando o ERP / Compras — banco erp_persianas)"
if tem mysql || tem mariadb; then
  MC=$(tem mysql && echo mysql || echo mariadb)
  sudo "$MC" -e "SHOW DATABASES;" 2>/dev/null || $MC -e "SHOW DATABASES;" 2>/dev/null \
    || echo "(MySQL presente mas sem acesso sem senha — confirme manualmente se existe 'erp_persianas')"
else
  echo "(nenhum MySQL/MariaDB instalado — o repo 'compras' diz que o ERP usa MySQL 'erp_persianas';"
  echo " se o ERP roda neste servidor, deveria haver mysql aqui. Se nao houver, o ERP roda em OUTRO lugar.)"
fi

titulo "7. NGINX — vhosts, server_name, listen, locations -> proxy_pass"
if tem nginx; then
  echo ">> sites-enabled:"; ls -l /etc/nginx/sites-enabled/ 2>/dev/null
  echo; echo ">> conf.d:"; ls -l /etc/nginx/conf.d/ 2>/dev/null
  echo; echo ">> nginx -T (server_name / listen / location / proxy_pass / alias / root):"
  sudo nginx -T 2>/dev/null | grep -nEi '(^|\s)(server_name|listen|root|alias)\b|location\s|proxy_pass' \
    | grep -vE '#' | head -200 \
    || echo "(precisa sudo p/ nginx -T)"
  echo; echo ">> teste de config:"; sudo nginx -t 2>&1 | sed 's/^/  /'
else echo "(nginx ausente)"; fi

titulo "8. /var/www (apps em disco)"
ls -la /var/www/ 2>/dev/null
for d in persianas agenda fabrica rh financeiro compras erp; do
  [ -d "/var/www/$d" ] && {
    echo "  ── /var/www/$d (git):"
    git -C "/var/www/$d" rev-parse --abbrev-ref HEAD 2>/dev/null | sed 's/^/      branch: /'
    git -C "/var/www/$d" log -1 --format='      %h %ci %s' 2>/dev/null
  }
done

titulo "9. HEALTHCHECKS (HTTP local em cada porta)"
for p in 3000 3001 3010 3011 3020 3030 3040; do
  for path in /api/health /health /healthz /; do
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 3 "http://127.0.0.1:$p$path" 2>/dev/null)
    if [ "$code" != "000" ] && [ -n "$code" ]; then
      body=$(curl -s --max-time 3 "http://127.0.0.1:$p$path" 2>/dev/null | head -c 160 | tr '\n' ' ')
      printf '  :%s%-13s HTTP %s  %s\n' "$p" "$path" "$code" "$body"
      break
    fi
  done
done
sub "Via Nginx (subpaths, HTTPS)"
for u in /api/health /agenda/api /fabrica/api /rh/api/health /financeiro/api/health /compras; do
  code=$(curl -sk -o /dev/null -w '%{http_code}' --max-time 4 "https://localhost$u" 2>/dev/null)
  printf '  https://localhost%-26s HTTP %s\n' "$u" "$code"
done

titulo "10. CERTIFICADO TLS (validade)"
for crt in /etc/nginx/ssl/*.pem /etc/ssl/persianas* /var/www/*/ssl/* ; do
  [ -f "$crt" ] && tem openssl && {
    echo "  $crt"; openssl x509 -in "$crt" -noout -subject -dates -ext subjectAltName 2>/dev/null | sed 's/^/    /'
  }
done 2>/dev/null
echo "(se vazio, ache o cert em 'sudo nginx -T | grep ssl_certificate')"

titulo "11. DISCO / MEMÓRIA"
df -h / /var 2>/dev/null | sed 's/^/  /'
free -h 2>/dev/null | sed 's/^/  /'

linha; echo "FIM DO RAIO-X — $(date '+%F %T')"; linha
