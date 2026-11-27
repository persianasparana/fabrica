#!/usr/bin/env python3
"""Valida as GUARDAS de um script de deploy contra o checkout real.

Guarda de pré-requisito com string errada = falso alarme que BLOQUEIA o deploy
(aconteceu com a v2.84.0: procurava `acessorios_no_diam` no custo-motor-modal,
string que nunca existiu ali). Este checker extrai cada `grep -q "X" ARQUIVO` e
cada `[ -f ARQUIVO ]` do script e confere no repo.

27/11/2026 — confere também as guardas com EXPRESSÃO REGULAR (`grep -Eq` / `grep -qE`),
rodando o próprio `grep -E` no arquivo: o ensaio da v14.100 abortou numa guarda antiga
que só aceitava a versão do painel em `14.8x`/`14.9x` e o checker não a via.

Uso: checar-guardas.py <repo_dir> <script.sh>
"""
import re
import subprocess
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

# grep -Eq "REGEX" ARQUIVO / grep -qE "REGEX" ARQUIVO — o próprio grep -E decide
padrao_re = re.compile(r'grep -(?:Eq|qE) ([\'"])(.+?)\1 ("?)([^\s\\"]+)\3', re.M)
for m in padrao_re.finditer(texto):
    alvo, arq = m.group(2), m.group(4)
    total += 1
    caminho = repo / arq
    if not caminho.exists():
        print(f'  ✗ ARQUIVO NAO EXISTE: {arq}  (guarda regex "{alvo[:40]}")')
        falhas += 1
        continue
    # entre aspas duplas o shell tira a barra de \" \$ \` \\ — o resto chega ao grep como está
    alvo_real = re.sub(r'\\(["$`\\])', r'\1', alvo) if m.group(1) == '"' else alvo
    rc = subprocess.run(['grep', '-Eq', alvo_real, str(caminho)]).returncode
    if rc == 0:
        print(f'  ✓ {arq} casa com /{alvo_real[:48]}/')
    else:
        print(f'  ✗ FALSO ALARME: {arq} NAO casa com /{alvo_real[:48]}/')
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
