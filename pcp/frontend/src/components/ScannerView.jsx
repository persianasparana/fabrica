import React, { useEffect, useMemo, useRef, useState } from 'react';
import JsBarcode from 'jsbarcode';
import {
  ScanLine, Printer, Camera, X, CheckCircle2, AlertCircle, Info,
  PackageCheck, Play, Tag,
} from 'lucide-react';
import { PRODUCT_CATALOG } from '../App.jsx';

/**
 * Leitura de código de barras + etiquetas (rastreio por unidade de peça).
 *
 * Cada unidade física de peça tem um código único:  PP-<pedidoId>-<pecaId>-<n>
 * (ids são alfanuméricos sem hífen, então o split por '-' é seguro).
 *
 * Fluxo: etiqueta impressa e colada na peça -> leitura em "Entrada em
 * produção" marca a unidade como em produção (pedido pendente vira Em Corte)
 * -> leitura em "Baixa" marca a unidade como embalada; quando todas as
 * unidades do pedido estão embaladas, o pedido vira Pronto.
 *
 * O rastreio fica no documento do pedido:
 *   order.rastreio = { "<pecaId>-<n>": { producao, producaoPor, embalado, embaladoPor } }
 *
 * Leitores USB funcionam como teclado (digitam o código + Enter) no campo de
 * leitura; em celulares/Chrome há leitura pela câmera (API BarcodeDetector).
 */

const codigoUnidade = (orderId, pieceId, unit) => `PP-${orderId}-${pieceId}-${unit}`;

function unidadesDoPedido(order) {
  const out = [];
  for (const p of order.pieces || []) {
    const qtd = Math.max(1, Number(p.quantidade) || 1);
    for (let n = 1; n <= qtd; n++) out.push({ piece: p, unit: n, key: `${p.id}-${n}` });
  }
  return out;
}

function progresso(order) {
  const unidades = unidadesDoPedido(order);
  const r = order.rastreio || {};
  return {
    total: unidades.length,
    producao: unidades.filter((u) => r[u.key]?.producao).length,
    embaladas: unidades.filter((u) => r[u.key]?.embalado).length,
  };
}

function beep(ok) {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = ok ? 880 : 220;
    gain.gain.value = 0.08;
    osc.start();
    osc.stop(ctx.currentTime + (ok ? 0.12 : 0.3));
    osc.onended = () => ctx.close();
  } catch {
    /* sem áudio, sem problema */
  }
}

function Barcode({ value, height = 46 }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) {
      JsBarcode(ref.current, value, {
        format: 'CODE128',
        width: 1.5,
        height,
        margin: 0,
        displayValue: false,
        background: 'transparent',
        lineColor: '#1D1D1B',
      });
    }
  }, [value, height]);
  return <svg ref={ref} />;
}

const fmtHora = (iso) =>
  new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export default function ScannerView({ orders, onUpdate, currentUser }) {
  const [mode, setMode] = useState('producao'); // producao | baixa
  const [input, setInput] = useState('');
  const [result, setResult] = useState(null); // { tipo: ok|aviso|erro, titulo, detalhe }
  const [labelOrderId, setLabelOrderId] = useState('');
  const [cameraOn, setCameraOn] = useState(false);
  const inputRef = useRef(null);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const busyRef = useRef(false);
  const lastCodeRef = useRef({ code: '', at: 0 });

  const ativos = useMemo(
    () => orders.filter((o) => !['expedido', 'cancelado'].includes(o.status)),
    [orders]
  );
  const labelOrder = orders.find((o) => o.id === labelOrderId) || null;
  const temCamera = typeof window !== 'undefined' && 'BarcodeDetector' in window;

  // Mantém o foco no campo de leitura (leitor USB digita como teclado)
  useEffect(() => {
    if (!cameraOn) inputRef.current?.focus();
  }, [mode, cameraOn, result]);

  const feedback = (tipo, titulo, detalhe) => {
    setResult({ tipo, titulo, detalhe });
    beep(tipo === 'ok');
  };

  const processarCodigo = async (raw, daCamera = false) => {
    const code = String(raw || '').trim();
    if (!code || busyRef.current) return;

    // Anti-repetição SÓ para a câmera (que lê o mesmo código várias vezes
    // por segundo). Leitor USB/teclado é sempre intencional: processa sempre.
    const now = Date.now();
    if (daCamera && lastCodeRef.current.code === code && now - lastCodeRef.current.at < 2500) return;
    lastCodeRef.current = { code, at: now };

    const partes = code.split('-');
    if (partes.length !== 4 || partes[0] !== 'PP') {
      return feedback('erro', 'Código não reconhecido', `"${code}" não é uma etiqueta de peça válida.`);
    }
    const [, orderId, pieceId, unitStr] = partes;
    const order = orders.find((o) => o.id === orderId);
    if (!order) {
      return feedback('erro', 'Pedido não encontrado', 'A etiqueta aponta para um pedido que não existe mais.');
    }
    const piece = (order.pieces || []).find((p) => p.id === pieceId);
    const unit = Number(unitStr);
    const qtd = piece ? Math.max(1, Number(piece.quantidade) || 1) : 0;
    if (!piece || !Number.isInteger(unit) || unit < 1 || unit > qtd) {
      return feedback('erro', 'Peça não encontrada', `O pedido #${order.orderNumber} não tem essa peça/unidade.`);
    }

    const prod = PRODUCT_CATALOG[piece.productKey];
    const nomePeca = `${prod?.name || piece.productKey} — un. ${unit}/${qtd}${piece.ambiente ? ` (${piece.ambiente})` : ''}`;
    const key = `${pieceId}-${unit}`;
    const rastreio = { ...(order.rastreio || {}) };
    const entry = { ...(rastreio[key] || {}) };
    const agora = new Date().toISOString();
    const quem = currentUser?.username || '';
    const upd = { ...order, rastreio, updatedAt: agora };
    let mudouAlgo = false;

    if (mode === 'producao') {
      if (entry.producao) {
        return feedback('aviso', 'Já estava em produção', `${nomePeca} — entrada registrada em ${fmtHora(entry.producao)}.`);
      }
      entry.producao = agora;
      entry.producaoPor = quem;
      rastreio[key] = entry;
      if (order.status === 'pendente') upd.status = 'cortando';
      mudouAlgo = true;
      const p = progresso(upd);
      feedback('ok', 'Entrada em produção registrada',
        `#${order.orderNumber} · ${nomePeca} — ${p.producao}/${p.total} unidades em produção.`);
    } else {
      if (entry.embalado) {
        return feedback('aviso', 'Baixa já registrada', `${nomePeca} — embalada em ${fmtHora(entry.embalado)}.`);
      }
      let obs = '';
      if (!entry.producao) {
        // Tolerante: peça embalada sem leitura de entrada — registra as duas
        entry.producao = agora;
        entry.producaoPor = quem;
        obs = ' (entrada em produção não tinha sido lida; registrada agora)';
      }
      entry.embalado = agora;
      entry.embaladoPor = quem;
      rastreio[key] = entry;
      mudouAlgo = true;
      const p = progresso(upd);
      if (p.embaladas === p.total && !['pronto', 'expedido'].includes(order.status)) {
        upd.status = 'pronto';
        feedback('ok', 'Pedido COMPLETO — todas as peças embaladas',
          `#${order.orderNumber} · ${nomePeca} — pedido marcado como Pronto.${obs}`);
      } else {
        feedback('ok', 'Baixa registrada',
          `#${order.orderNumber} · ${nomePeca} — ${p.embaladas}/${p.total} unidades embaladas.${obs}`);
      }
    }

    if (mudouAlgo) {
      busyRef.current = true;
      try {
        await onUpdate(upd);
      } finally {
        busyRef.current = false;
      }
    }
  };

  const onSubmit = (e) => {
    e.preventDefault();
    const v = input;
    setInput('');
    processarCodigo(v);
  };

  // ---- Câmera (BarcodeDetector — Chrome/Android) ----
  const pararCamera = () => {
    setCameraOn(false);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  const ligarCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      setCameraOn(true);
      const detector = new window.BarcodeDetector({ formats: ['code_128'] });
      const tick = async () => {
        if (!streamRef.current) return;
        const video = videoRef.current;
        if (video && video.readyState >= 2) {
          try {
            const found = await detector.detect(video);
            if (found?.length) processarCodigo(found[0].rawValue, true);
          } catch { /* frame inválido — segue */ }
        }
        if (streamRef.current) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    } catch {
      feedback('erro', 'Câmera indisponível', 'Verifique a permissão de câmera do navegador.');
    }
  };

  useEffect(() => {
    if (cameraOn && videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.play().catch(() => {});
    }
    return () => {};
  }, [cameraOn]);

  useEffect(() => () => pararCamera(), []); // desliga ao sair da tela

  const imprimir = () => window.print();

  return (
    <div className="space-y-5">
      <style>{`
        .labels-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 4mm; }
        .label-card { border: 1px dashed #B6B4AD; border-radius: 4px; padding: 8px 10px; break-inside: avoid; background: #fff; }
        @media print {
          .labels-grid { grid-template-columns: repeat(3, 1fr); }
          .label-card { border-color: #999; }
        }
      `}</style>

      <header className="flex items-center justify-between pb-3 border-b border-stone-800 no-print">
        <div>
          <h2 className="text-xl font-bold text-stone-100" style={{ fontFamily: "'Galano Grotesque', 'Manrope', sans-serif" }}>
            Leitura de Código de Barras
          </h2>
          <div className="text-[10px] font-mono uppercase tracking-wider text-stone-500 mt-1">
            Entrada em produção · Baixa por embalagem · Etiquetas
          </div>
        </div>
      </header>

      {/* Seleção de modo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 no-print">
        <button
          onClick={() => setMode('producao')}
          className={`flex items-center gap-3 px-4 py-3 border rounded-sm text-left transition ${
            mode === 'producao'
              ? 'border-amber-500 bg-amber-500/10 text-amber-400'
              : 'border-stone-800 text-stone-400 hover:bg-stone-900/40'
          }`}
        >
          <Play size={18} />
          <span>
            <span className="block text-sm font-semibold">1 · Entrada em produção</span>
            <span className="block text-xs text-stone-500">Leia a etiqueta da peça que vai começar a ser produzida</span>
          </span>
        </button>
        <button
          onClick={() => setMode('baixa')}
          className={`flex items-center gap-3 px-4 py-3 border rounded-sm text-left transition ${
            mode === 'baixa'
              ? 'border-emerald-500 bg-emerald-600/30 text-emerald-400'
              : 'border-stone-800 text-stone-400 hover:bg-stone-900/40'
          }`}
        >
          <PackageCheck size={18} />
          <span>
            <span className="block text-sm font-semibold">2 · Baixa (peça embalada)</span>
            <span className="block text-xs text-stone-500">Leia a etiqueta da peça embalada para dar baixa na produção</span>
          </span>
        </button>
      </div>

      {/* Campo de leitura */}
      <form onSubmit={onSubmit} className="border border-stone-800 rounded-sm p-4 bg-stone-900/40 no-print">
        <label className="block text-xs font-medium uppercase tracking-wider text-stone-400 mb-1">
          {mode === 'producao' ? 'Ler etiqueta — entrada em produção' : 'Ler etiqueta — baixa de embalagem'}
        </label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <ScanLine size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500" />
            <input
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Aponte o leitor e bipe a etiqueta (ou digite o código e Enter)"
              autoComplete="off"
              autoCapitalize="none"
              className="w-full bg-stone-950 border border-stone-800 rounded-sm pl-9 pr-3 py-2.5 text-base text-stone-100 placeholder:text-stone-600 focus:outline-none focus:border-amber-500/60"
            />
          </div>
          {temCamera && (
            <button
              type="button"
              onClick={cameraOn ? pararCamera : ligarCamera}
              className="px-3 py-2 border border-stone-800 text-stone-400 hover:text-amber-400 hover:border-amber-500/40 rounded-sm flex items-center gap-1.5 text-xs font-mono uppercase tracking-wider"
            >
              {cameraOn ? <X size={14} /> : <Camera size={14} />}
              {cameraOn ? 'Fechar' : 'Câmera'}
            </button>
          )}
        </div>
        <p className="text-[11px] text-stone-500 mt-2">
          O leitor USB funciona como um teclado: deixe o cursor neste campo e bipe a etiqueta.
        </p>
        {cameraOn && (
          <video
            ref={videoRef}
            muted
            playsInline
            className="mt-3 w-full max-w-md rounded-sm border border-stone-800"
          />
        )}
      </form>

      {/* Resultado da última leitura */}
      {result && (
        <div
          role="status"
          className={`flex items-start gap-2 text-sm rounded-sm px-3 py-2.5 border no-print ${
            result.tipo === 'ok'
              ? 'text-green-300 bg-green-500/10 border-green-500/30'
              : result.tipo === 'aviso'
                ? 'text-amber-400 bg-amber-500/10 border-amber-500/40'
                : 'text-red-300 bg-red-500/10 border-red-500/30'
          }`}
        >
          {result.tipo === 'ok' ? <CheckCircle2 size={16} className="mt-0.5 flex-shrink-0" />
            : result.tipo === 'aviso' ? <Info size={16} className="mt-0.5 flex-shrink-0" />
            : <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />}
          <span>
            <strong className="block">{result.titulo}</strong>
            {result.detalhe}
          </span>
        </div>
      )}

      {/* Andamento dos pedidos ativos */}
      <div className="border border-stone-800 rounded-sm overflow-x-auto no-print">
        <table className="w-full text-xs">
          <thead className="bg-stone-900/40">
            <tr className="text-left text-stone-500 font-mono uppercase tracking-wider">
              <th className="px-3 py-2">Pedido</th>
              <th className="px-3 py-2">Cliente</th>
              <th className="px-3 py-2">Em produção</th>
              <th className="px-3 py-2">Embaladas</th>
              <th className="px-3 py-2 text-right">Etiquetas</th>
            </tr>
          </thead>
          <tbody>
            {ativos.map((o) => {
              const p = progresso(o);
              return (
                <tr key={o.id} className="border-t border-stone-800/60">
                  <td className="px-3 py-2 text-stone-200">#{o.orderNumber}</td>
                  <td className="px-3 py-2 text-stone-400">{o.client}</td>
                  <td className="px-3 py-2">
                    <span className={p.producao ? 'text-amber-400' : 'text-stone-600'}>
                      {p.producao}/{p.total}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    <span className={p.embaladas === p.total && p.total > 0 ? 'text-green-400' : p.embaladas ? 'text-amber-400' : 'text-stone-600'}>
                      {p.embaladas}/{p.total}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right">
                    <button
                      onClick={() => setLabelOrderId(labelOrderId === o.id ? '' : o.id)}
                      className="px-2 py-1 border border-stone-800 text-stone-400 hover:text-amber-400 hover:border-amber-500/40 inline-flex items-center gap-1"
                    >
                      <Tag size={11} /> {labelOrderId === o.id ? 'Ocultar' : 'Gerar'}
                    </button>
                  </td>
                </tr>
              );
            })}
            {!ativos.length && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-stone-500 font-mono">
                  Nenhum pedido ativo.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Etiquetas do pedido selecionado (também é a área impressa) */}
      {labelOrder && (
        <div className="border border-stone-800 rounded-sm p-4 bg-stone-900/40 print:border-0 print:bg-transparent print:p-0">
          <div className="flex items-center justify-between mb-3 no-print">
            <div className="text-xs font-mono uppercase tracking-wider text-stone-400 flex items-center gap-1.5">
              <Tag size={12} /> Etiquetas — #{labelOrder.orderNumber} · {labelOrder.client}
            </div>
            <button
              onClick={imprimir}
              className="px-3 py-1.5 text-xs font-mono uppercase tracking-wider bg-amber-500 text-stone-950 hover:bg-amber-400 flex items-center gap-1.5"
            >
              <Printer size={11} /> Imprimir etiquetas
            </button>
          </div>
          <div className="labels-grid">
            {unidadesDoPedido(labelOrder).map(({ piece, unit }) => {
              const prod = PRODUCT_CATALOG[piece.productKey];
              const qtd = Math.max(1, Number(piece.quantidade) || 1);
              const code = codigoUnidade(labelOrder.id, piece.id, unit);
              return (
                <div key={code} className="label-card text-[#1D1D1B]">
                  <div className="flex items-baseline justify-between gap-2">
                    <strong className="text-xs">#{labelOrder.orderNumber}</strong>
                    <span className="text-[10px]">un. {unit}/{qtd}</span>
                  </div>
                  <div className="text-[11px] leading-tight mt-0.5">
                    {prod?.name || piece.productKey}
                    {piece.ambiente ? ` · ${piece.ambiente}` : ''}
                  </div>
                  <div className="text-[10px] text-[#56554F]">
                    {labelOrder.client}{piece.largura && piece.altura ? ` · ${piece.largura}×${piece.altura} cm` : ''}
                  </div>
                  <div className="mt-1.5 flex justify-center overflow-hidden">
                    <Barcode value={code} />
                  </div>
                  <div className="text-center text-[9px] tracking-wider mt-0.5">{code}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
