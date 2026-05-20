import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:orcamento_app/services/auth_service.dart';
import 'package:orcamento_app/services/local_scope.dart';
import 'package:orcamento_app/services/sync_state.dart';

import '../test_support.dart';

void main() {
  setUpAll(ensureTestEnvironment);

  group('ScopeService', () {
    late TestContext context;

    tearDown(() async {
      await context.dispose();
    });

    test('promove dados guest para o primeiro escopo da empresa e consome o guest apos binding', () async {
      context = await createTestContext(
        httpClient: MockClient((request) async {
          if (request.method == 'GET') {
            return http.Response(
              jsonEncode({
                'timeZone': 'America/Sao_Paulo',
                'businessDate': '2026-05-20',
                'budgets': [],
              }),
              200,
            );
          }

          final body = jsonDecode(request.body) as Map<String, dynamic>;
          return http.Response(
            jsonEncode({
              'timeZone': 'America/Sao_Paulo',
              'businessDate': '2026-05-20',
              'budgets': body['budgets'],
              'conflicts': [],
            }),
            200,
          );
        }),
        session: _session(),
      );

      await context.scopeService.initialize();
      await context.repository.save(buildOrcamento(id: 'guest-budget', codigo: 'Guest'));

      final requiresReconciliation =
          await context.scopeService.activateTarget(_targetA());

      expect(requiresReconciliation, isFalse);
      expect(context.repository.currentScopeId, _scopeIdA());
      expect(await context.repository.hasAnyBudgetInScope(LocalScopeId.guest), isFalse);
      expect(await context.repository.hasAnyBudgetInScope(_scopeIdA()), isTrue);
      expect(
        await context.repository.getByIdInScope(_scopeIdA(), 'guest-budget'),
        isNotNull,
      );
      expect(context.authService.currentTarget?.companyId, 'company-a');
    });

    test('exige reconciliacao quando guest e remoto ja tem dados e preserva guest ate resolver', () async {
      context = await createTestContext(
        httpClient: MockClient((request) async {
          if (request.method == 'GET') {
            return http.Response(
              jsonEncode({
                'timeZone': 'America/Sao_Paulo',
                'businessDate': '2026-05-20',
                'budgets': [
                  {
                    'clientKey': 'remote-budget',
                    'code': 'Remoto',
                    'kind': 'SPENDING',
                    'status': 'ACTIVE',
                    'initialBalanceCents': 10000,
                    'currentBalanceCents': 10000,
                    'targetEndingBalanceCents': 0,
                    'dailyBudgetInitialCents': 2000,
                    'dailyBudgetCurrentCents': 2000,
                    'dayExtraBalanceCents': 0,
                    'startDate': '2026-05-20',
                    'endDate': '2026-05-24',
                    'lastDailyBudgetDate': '2026-05-20',
                    'isPrimary': true,
                    'createdAt': DateTime.utc(2026, 5, 20, 12).toIso8601String(),
                    'updatedAt': DateTime.utc(2026, 5, 20, 12).toIso8601String(),
                    'entries': const [],
                  },
                ],
              }),
              200,
            );
          }

          throw Exception('Nao deveria fazer push antes da reconciliacao');
        }),
        session: _session(),
      );

      await context.scopeService.initialize();
      await context.repository.save(
        buildOrcamento(id: 'guest-budget', codigo: 'Guest'),
      );

      final requiresReconciliation =
          await context.scopeService.activateTarget(_targetA());

      expect(requiresReconciliation, isTrue);
      expect(
        context.syncService.stateListenable.value.status,
        SyncStatus.reconciliationRequired,
      );
      expect(await context.repository.hasAnyBudgetInScope(LocalScopeId.guest), isTrue);
      expect(await context.repository.hasAnyBudgetInScope(_scopeIdA()), isTrue);
    });

    test('useLocalOnly mantem sessao autenticada mas volta o app para o escopo guest', () async {
      context = await createTestContext(
        httpClient: MockClient((request) async {
          if (request.method == 'GET') {
            return http.Response(
              jsonEncode({
                'timeZone': 'America/Sao_Paulo',
                'businessDate': '2026-05-20',
                'budgets': [],
              }),
              200,
            );
          }

          final body = jsonDecode(request.body) as Map<String, dynamic>;
          return http.Response(
            jsonEncode({
              'timeZone': 'America/Sao_Paulo',
              'businessDate': '2026-05-20',
              'budgets': body['budgets'],
              'conflicts': [],
            }),
            200,
          );
        }),
        session: _session(),
        activeTarget: _targetA(),
      );

      await context.scopeService.initialize();
      expect(context.repository.currentScopeId, _scopeIdA());

      await context.scopeService.useLocalOnly();

      expect(context.authService.currentSession, isNotNull);
      expect(context.authService.currentTarget, isNull);
      expect(context.repository.currentScopeId, LocalScopeId.guest);
      expect(context.syncService.stateListenable.value.status, SyncStatus.localOnly);
    });

    test('trocar entre empresas preserva datasets locais independentes', () async {
      context = await createTestContext(
        httpClient: MockClient((request) async {
          if (request.method == 'GET') {
            return http.Response(
              jsonEncode({
                'timeZone': 'America/Sao_Paulo',
                'businessDate': '2026-05-20',
                'budgets': [],
              }),
              200,
            );
          }

          final body = jsonDecode(request.body) as Map<String, dynamic>;
          return http.Response(
            jsonEncode({
              'timeZone': 'America/Sao_Paulo',
              'businessDate': '2026-05-20',
              'budgets': body['budgets'],
              'conflicts': [],
            }),
            200,
          );
        }),
        session: _session(),
      );

      await context.scopeService.initialize();
      await context.scopeService.activateTarget(_targetA());
      await context.repository.save(buildOrcamento(id: 'budget-a', codigo: 'A'));

      await context.scopeService.activateTarget(_targetB());
      expect(context.repository.currentScopeId, _scopeIdB());
      expect(context.repository.allBudgets, isEmpty);

      await context.scopeService.activateTarget(_targetA());
      expect(context.repository.currentScopeId, _scopeIdA());
      expect(context.repository.getById('budget-a')?.codigo, 'A');
      expect(await context.repository.hasAnyBudgetInScope(_scopeIdB()), isFalse);
    });
  });
}

AuthSession _session() {
  return const AuthSession(
    userId: 1,
    token: 'token-1',
    refreshToken: 'refresh-1',
    userName: 'Usuario',
    userEmail: 'user@example.com',
  );
}

ActiveCloudTarget _targetA() {
  return const ActiveCloudTarget(
    companyId: 'company-a',
    name: 'Empresa A',
    timeZone: 'America/Sao_Paulo',
  );
}

ActiveCloudTarget _targetB() {
  return const ActiveCloudTarget(
    companyId: 'company-b',
    name: 'Empresa B',
    timeZone: 'America/Sao_Paulo',
  );
}

String _scopeIdA() => LocalScopeId.company(userId: 1, companyId: 'company-a');
String _scopeIdB() => LocalScopeId.company(userId: 1, companyId: 'company-b');
