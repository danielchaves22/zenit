---
title: Redis reactivation
slug: /docs/operations/infra/redis-reactivation
type: operations-guide
audience: ops
visibility: restricted
status: active
owner: ops
last_reviewed: 2026-06-04
summary: Runbook para reativar Redis quando a operacao do backend deixar de comportar memory store local.
tags:
  - infra
  - redis
  - backend
related:
  - /docs/operations/site/zenitapp-public-site-setup
---

# Redis reactivation

## Quando usar

Reative Redis quando o backend precisar sair do modo simplificado com memory store local e passar a operar com requisitos mais fortes de coordenacao e persistencia operacional.

Sinais tipicos:

- multiplas instancias do backend;
- necessidade de rate limiting persistente;
- problemas de memoria com store em processo;
- operacao em cluster ou balanceador;
- aumento consistente do volume de usuarios simultaneos.

## Pre-requisitos

- ambiente com Redis provisionado ou container Redis disponivel;
- acesso aos arquivos de ambiente e `docker-compose`;
- capacidade de reiniciar os servicos afetados.

## Passos

1. habilitar `REDIS_ENABLED=true` no ambiente apropriado;
2. configurar host, porta e senha, quando aplicavel;
3. reativar o servico Redis no `docker-compose` ou no ambiente equivalente;
4. adicionar dependencia do backend em relacao ao Redis quando houver orquestracao por compose;
5. subir Redis e backend;
6. validar conectividade e healthcheck do servico.

## Riscos

- backend subir antes do Redis e falhar em inicializacao;
- credenciais ou host incorretos causarem indisponibilidade parcial;
- diferenca entre configuracao local e Docker gerar diagnostico enganoso.

## Rollback

- restaurar `REDIS_ENABLED=false` no ambiente alvo;
- remover a dependencia operacional do Redis do compose ou do deploy;
- reiniciar backend com o modo anterior.

## Verificacao final

- Redis responde a `PING`;
- backend inicializa sem erro de conexao;
- recursos que dependem de store compartilhado passam a operar com comportamento consistente entre instancias.
