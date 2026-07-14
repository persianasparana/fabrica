
## ⚠️ Norma de revisão da federação (14/07/2026)

Toda revisão de código, PR ou análise de impacto — neste e nos demais repos — segue as
**5 lentes** e o formato de saída de **`compras/docs/DIRETRIZES-REVISAO-ERP.md`**:
1) contrato entre módulos (consumidores/compatibilidade), 2) resiliência e idempotência
(retry, saga, sem duplicar NF/lançamento), 3) bounded contexts (sem cross-database, sem
vazamento de domínio), 4) concorrência e N+1, 5) segurança service-to-service (X-Service-Key).
