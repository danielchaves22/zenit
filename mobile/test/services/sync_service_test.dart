import 'dart:convert';

import 'package:flutter_test/flutter_test.dart';
import 'package:http/http.dart' as http;
import 'package:http/testing.dart';
import 'package:orcamento_app/models/movimentacao.dart';
import 'package:orcamento_app/services/auth_service.dart';
import 'package:orcamento_app/services/clock_service.dart';
import 'package:orcamento_app/services/local_scope.dart';
import 'package:orcamento_app/services/sync_state.dart';

import '../test_support.dart';

void main() {
  setUpAll(ensureTestEnvironment);

  group('SyncService', () {
    late TestContext context;

    tearDown(() async {
      await context.dispose();
    });

    test('mantem modo local e marca pendencia quando usuario nao esta autenticado', () async {
      context = await createTestContext();
      await context.syncService.initialize();

      context.syncService.scheduleSync();
      await Future<void>.delayed(const Duration(milliseconds: 25));

      expect(context.syncService.stateListenable.value.status, SyncStatus.localOnly);
      expect(context.syncService.stateListenable.value.hasPendingChanges, isTrue);
    });

    test('conclui o primeiro vinculo sem push quando local e remoto estao vazios', () async {
      var getCalls = 0;
      var putCalls = 0;

      context = await createTestContext(
        httpClient: MockClient((request) async {
          if (request.method == 'GET') {
            getCalls += 1;
            return http.Response(
              jsonEncode({
                'timeZone': 'America/Sao_Paulo',
                'businessDate': _dateOnlyIso(businessToday(), 'America/Sao_Paulo'),
                'budgets': [],
              }),
              200,
            );
          }

          putCalls += 1;
          return http.Response('{}', 500);
        }),
        session: _session(),
      );

      await context.syncService.initialize();
      await context.syncService.switchScope(_companyScopeId(), target: _target());

      final requiresReconciliation =
          await context.syncService.runInitialBindingIfNeeded();

      expect(requiresReconciliation, isFalse);
      expect(getCalls, 1);
      expect(putCalls, 0);
      expect(context.syncService.bindingState.isBound, isTrue);
      expect(context.syncService.bindingState.timeZone, 'America/Sao_Paulo');
      expect(context.syncService.stateListenable.value.status, SyncStatus.synced);
    });

    test('adota o remoto no primeiro vinculo quando o local esta vazio', () async {
      final remoteBudget = _serverBudgetJson(
        id: 'budget-remote',
        codigo: 'Servidor',
      );

      context = await createTestContext(
        httpClient: MockClient((request) async {
          expect(request.method, 'GET');
          return http.Response(
            jsonEncode({
              'timeZone': 'America/Sao_Paulo',
              'businessDate': _dateOnlyIso(businessToday(), 'America/Sao_Paulo'),
              'budgets': [remoteBudget],
            }),
            200,
          );
        }),
        session: _session(),
      );

      await context.syncService.initialize();
      await context.syncService.switchScope(_companyScopeId(), target: _target());

      final requiresReconciliation =
          await context.syncService.runInitialBindingIfNeeded();

      expect(requiresReconciliation, isFalse);
      expect(context.repository.getById('budget-remote')?.codigo, 'Servidor');
      expect(context.syncService.bindingState.isBound, isTrue);
      expect(context.syncService.stateListenable.value.status, SyncStatus.synced);
    });

    test('sobe o local como base inicial quando o remoto esta vazio', () async {
      late Map<String, dynamic> capturedBody;

      context = await createTestContext(
        httpClient: MockClient((request) async {
          if (request.method == 'GET') {
            return http.Response(
              jsonEncode({
                'timeZone': 'America/Sao_Paulo',
                'businessDate': _dateOnlyIso(businessToday(), 'America/Sao_Paulo'),
                'budgets': [],
              }),
              200,
            );
          }

          capturedBody = jsonDecode(request.body) as Map<String, dynamic>;
          return http.Response(
            jsonEncode({
              'timeZone': 'America/Sao_Paulo',
              'businessDate': _dateOnlyIso(businessToday(), 'America/Sao_Paulo'),
              'budgets': capturedBody['budgets'],
              'conflicts': [],
            }),
            200,
          );
        }),
        session: _session(),
      );

      await context.syncService.initialize();
      await context.syncService.switchScope(_companyScopeId(), target: _target());
      await context.repository.save(
        buildOrcamento(id: 'budget-local', codigo: 'Local'),
      );

      final requiresReconciliation =
          await context.syncService.runInitialBindingIfNeeded();

      expect(requiresReconciliation, isFalse);
      expect(capturedBody['deviceId'], isNotEmpty);
      expect(capturedBody['budgets'], hasLength(1));
      expect(capturedBody['budgets'][0]['clientKey'], 'budget-local');
      expect(context.syncService.bindingState.isBound, isTrue);
      expect(context.syncService.stateListenable.value.status, SyncStatus.synced);
    });

    test('exige reconciliacao e importa o local como novos budgets', () async {
      final remoteBudget = _serverBudgetJson(
        id: 'budget-remote',
        codigo: 'Nuvem',
        isPrimary: true,
      );
      late Map<String, dynamic> capturedBody;

      context = await createTestContext(
        httpClient: MockClient((request) async {
          if (request.method == 'GET') {
            return http.Response(
              jsonEncode({
                'timeZone': 'America/Sao_Paulo',
                'businessDate': _dateOnlyIso(businessToday(), 'America/Sao_Paulo'),
                'budgets': [remoteBudget],
              }),
              200,
            );
          }

          capturedBody = jsonDecode(request.body) as Map<String, dynamic>;
          return http.Response(
            jsonEncode({
              'timeZone': 'America/Sao_Paulo',
              'businessDate': _dateOnlyIso(businessToday(), 'America/Sao_Paulo'),
              'budgets': [
                remoteBudget,
                ...(capturedBody['budgets'] as List<dynamic>),
              ],
              'conflicts': [],
            }),
            200,
          );
        }),
        session: _session(),
      );

      await context.syncService.initialize();
      await context.syncService.switchScope(_companyScopeId(), target: _target());
      await context.repository.save(
        buildOrcamento(
          id: 'budget-local',
          codigo: 'Local',
          movimentacoes: [
            buildMovimentacao(
              id: 'entry-local',
              valorEmCentavos: 1000,
              tipo: TipoMovimentacao.entrada,
            ),
          ],
        ),
      );

      final requiresReconciliation =
          await context.syncService.runInitialBindingIfNeeded();

      expect(requiresReconciliation, isTrue);
      expect(
        context.syncService.stateListenable.value.status,
        SyncStatus.reconciliationRequired,
      );
      expect(
        context.syncService.pendingReconciliationListenable.value?.localBudgetCount,
        1,
      );
      expect(
        context.syncService.pendingReconciliationListenable.value?.remoteBudgetCount,
        1,
      );

      await context.syncService.importLocalBudgetsAsNew();

      final imported = capturedBody['budgets'] as List<dynamic>;
      expect(imported, hasLength(1));
      expect(imported.single['clientKey'], isNot('budget-local'));
      expect(imported.single['isPrimary'], isFalse);
      expect(
        (imported.single['entries'] as List<dynamic>).single['clientKey'],
        isNot('entry-local'),
      );
      expect(context.repository.allBudgets.length, 2);
      expect(context.syncService.pendingReconciliationListenable.value, isNull);
      expect(context.syncService.bindingState.isBound, isTrue);
    });

    test('faz pull antes do push e preserva entry remota omitida no payload local', () async {
      var requestIndex = 0;
      late Map<String, dynamic> capturedPutBody;
      final remoteBudget = _serverBudgetJson(
        id: 'budget-1',
        codigo: 'Servidor',
        entries: [
          _serverEntryJson(
            id: 'entry-remote',
            description: 'Remota',
            amountCents: 1500,
            principalImpactAmountCents: 1500,
          ),
        ],
      );

      context = await createTestContext(
        httpClient: MockClient((request) async {
          requestIndex += 1;

          if (request.method == 'GET') {
            return http.Response(
              jsonEncode({
                'timeZone': 'America/Sao_Paulo',
                'businessDate': _dateOnlyIso(businessToday(), 'America/Sao_Paulo'),
                'budgets': [remoteBudget],
              }),
              200,
            );
          }

          capturedPutBody = jsonDecode(request.body) as Map<String, dynamic>;
          return http.Response(
            jsonEncode({
              'timeZone': 'America/Sao_Paulo',
              'businessDate': _dateOnlyIso(businessToday(), 'America/Sao_Paulo'),
              'budgets': [remoteBudget],
              'conflicts': [],
            }),
            200,
          );
        }),
        session: _session(),
      );

      await context.syncService.initialize();
      await context.syncService.switchScope(_companyScopeId(), target: _target());
      await context.syncService.runInitialBindingIfNeeded();

      final staleLocal = buildOrcamento(
        id: 'budget-1',
        codigo: 'Local desatualizado',
        movimentacoes: const [],
        updatedAt: DateTime.utc(2026, 5, 20, 12),
      );
      await context.repository.save(staleLocal);

      await context.syncService.runAuthenticatedSync();

      final putBudget = (capturedPutBody['budgets'] as List<dynamic>).single
          as Map<String, dynamic>;
      expect(putBudget['entries'], hasLength(1));
      expect(
        (putBudget['entries'] as List<dynamic>).single['clientKey'],
        'entry-remote',
      );
      expect(requestIndex, greaterThanOrEqualTo(3));
      expect(context.syncService.stateListenable.value.status, SyncStatus.synced);
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

ActiveCloudTarget _target() {
  return const ActiveCloudTarget(
    companyId: 'company-1',
    name: 'Empresa Teste',
    timeZone: 'America/Sao_Paulo',
  );
}

String _companyScopeId() {
  return LocalScopeId.company(userId: 1, companyId: 'company-1');
}

Map<String, dynamic> _serverBudgetJson({
  required String id,
  required String codigo,
  bool isPrimary = true,
  List<Map<String, dynamic>>? entries,
}) {
  final today = businessToday();
  const timeZone = 'America/Sao_Paulo';

  return {
    'clientKey': id,
    'code': codigo,
    'kind': 'SPENDING',
    'status': 'ACTIVE',
    'initialBalanceCents': 10000,
    'currentBalanceCents': 10000,
    'targetEndingBalanceCents': 0,
    'dailyBudgetInitialCents': 2000,
    'dailyBudgetCurrentCents': 2000,
    'dayExtraBalanceCents': 0,
    'startDate': _dateOnlyIso(today, timeZone),
    'endDate': _dateOnlyIso(today.add(const Duration(days: 4)), timeZone),
    'lastDailyBudgetDate': _dateOnlyIso(today, timeZone),
    'isPrimary': isPrimary,
    'createdAt': DateTime.utc(2026, 5, 19, 12).toIso8601String(),
    'updatedAt': DateTime.utc(2026, 5, 19, 12).toIso8601String(),
    'entries': entries ?? const [],
  };
}

Map<String, dynamic> _serverEntryJson({
  required String id,
  required String description,
  required int amountCents,
  required int principalImpactAmountCents,
}) {
  const timeZone = 'America/Sao_Paulo';
  final today = businessToday();

  return {
    'clientKey': id,
    'entryType': 'INCOME',
    'allocationMode': 'PRINCIPAL',
    'amountCents': amountCents,
    'principalImpactAmountCents': principalImpactAmountCents,
    'occurredAt': _dateOnlyIso(today, timeZone),
    'description': description,
    'affectsBudgetBalance': true,
    'createdAt': DateTime.utc(2026, 5, 19, 12).toIso8601String(),
    'updatedAt': DateTime.utc(2026, 5, 19, 12).toIso8601String(),
  };
}

String _dateOnlyIso(DateTime date, String timeZone) {
  return ClockService.instance.serializeDateOnly(date, timeZone: timeZone);
}
