<?php
/**
 * Endpoint: /api/kpis.php
 *
 * Retorna indicadores agregados do sistema.
 *   GET /api/kpis.php
 *
 * Resposta:
 *   {
 *     "total": int,
 *     "abertas": int,
 *     "andamento": int,
 *     "encerradas": int,
 *     "taxa_resolucao": float,
 *     "impacto": { "Alto": int, "Médio": int, "Baixo": int },
 *     "origens": { "Setor": count, ... },
 *     "evolucao": [{ "data_ocorrencia": "YYYY-MM-DD", "c": int }, ...]
 *   }
 *
 * @package PersianasParana\Qualidade\Api
 */

declare(strict_types=1);

require __DIR__ . '/../../src/bootstrap.php';

$auth->requireAuth();
requireMethod('GET');

$repo = new NCRepository($db);
respondJson($repo->getKpis());
