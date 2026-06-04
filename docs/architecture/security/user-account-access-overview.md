---
title: User account access
slug: /docs/architecture/security/user-account-access-overview
type: overview
product: zenit-cash
audience: dev
visibility: internal
status: active
owner: engineering
last_reviewed: 2026-06-04
summary: Visao conceitual do controle de acesso a contas financeiras por perfil e por usuario.
tags:
  - security
  - accounts
  - permissions
related:
  - /docs/architecture/backend/account-access-architecture-note
---

# User account access

## Objetivo

Explicar de forma conceitual como funciona o controle de acesso a contas financeiras no ecossistema Zenit Cash.

## Escopo

O modelo combina hierarquia de roles e permissoes explicitamente concedidas para usuarios comuns.

## Publico-alvo

- desenvolvimento;
- operacao tecnica;
- produto que precise entender os limites de acesso.

## Conceitos principais

- `ADMIN`: acesso total a contas e empresas;
- `SUPERUSER`: acesso total dentro da empresa e gestao de permissoes dos `USER`s;
- `USER`: acesso apenas as contas concedidas;
- concessao de acesso pode ser especifica ou total, conforme o endpoint de administracao usado;
- a permissao impacta leitura, agregacao e escrita envolvendo contas.

## Links relacionados

- [Account access architecture](../backend/account-access-architecture-note.md)
