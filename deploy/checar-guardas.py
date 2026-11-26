#!/usr/bin/env python3
"""Valida as GUARDAS de um script de deploy contra o checkout real.

Guarda de pré-requisito com string errada = falso alarme que BLOQUEIA o deploy
(aconteceu com a v2.84.0: procurava `acessorios_no_diam` no custo-motor-modal,
string que nunca existiu ali). Este checker extrai cada `grep -q "X" ARQUIVO` e
cada `[ -f ARQUIVO ]` do script e confere no repo.

Uso: checar-guardas.py <repo_dir> <script.sh>
"""
import re
import sys
from pathlib import Path

repo, script = Path(sys.argv[1]), Path(sys.argv[2])
texto = script.read_text()
falhas = 0
total = 0

# grep -q "PADRAO" ARQUIVO   (aceita aspas simples/duplas e caminho com ou sem aspas)
padrao = re.compile(r'grep -q ([\'"])(.+?)\1 ("?)([^\s\\"]+)\3', re.M)
for m in padrao.finditer(texto):
    alvo, arq = m.group(2), m.group(4)
    total += 1
    alvo_real = alvo.replace('\\"', '"')
    caminho = repo / arq
    if not caminho.exists():
        print(f'  ✗ ARQUIVO NAO EXISTE: {arq}  (guarda "{alvo_real[:40]}")')
        falhas += 1
        continue
    if alvo_real in caminho.read_text():
        print(f'  ✓ {arq} contém "{alvo_real[:48]}"')
    else:
        print(f'  ✗ FALSO ALARME: {arq} NAO contém "{alvo_real[:48]}"')
        falhas += 1

for m in re.finditer(r'\[ -f ([^\s\]]+) \]', texto):
    arq = m.group(1)
    total += 1
    if (repo / arq).exists():
        print(f'  ✓ existe {arq}')
    else:
        print(f'  ✗ FALSO ALARME: {arq} nao existe')
        falhas += 1

print(f'\n{total} guarda(s) · {falhas} falha(s)')
sys.exit(1 if falhas else 0)
