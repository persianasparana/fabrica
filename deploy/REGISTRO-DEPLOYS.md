# Registro de deploys — produção `aplicativos` (append-only)

> **Convenção da federação (20/07/2026):** todo bloco de deploy termina anexando
> uma linha aqui, commitando e dando push **no próprio servidor**. O repositório
> vira a fonte da verdade sobre o que está no ar — qualquer conversa (e o
> Wellington) confere aqui antes de assumir estado.
>
> Formato: `- AAAA-MM-DD HH:MM | commit <hash> | <processos> | <o que subiu> | <resultado>`

<!-- linhas novas ABAIXO desta marca (não editar as anteriores) -->
- 2026-07-21 19:02 | commit 06f5dbe | fabrica-server | F3 BOM+custo na OC (flag ON; aguarda produto_sku nas estruturas) + selecao de estrutura por SKU do pedido + campo SKU no editor | health OK
- 2026-08-03 19:00 | commit a9009df | fabrica-server | Plano de Corte do pedido via Nucleo de Produtos :3070 (rota /plano-nucleo + pagina imprimivel + produto_sku no item) | health OK
