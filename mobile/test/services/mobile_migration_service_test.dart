import 'package:flutter_test/flutter_test.dart';
import 'package:orcamento_app/models/movimentacao.dart';
import 'package:orcamento_app/models/orcamento.dart';

import '../test_support.dart';

void main() {
  setUpAll(ensureTestEnvironment);

  group('MobileMigrationService', () {
    late TestContext context;

    setUp(() async {
      context = await createTestContext();
    });

    tearDown(() async {
      await context.dispose();
    });

    test('normaliza ids numericos, timestamps invalidos e recalcula orcamento diario defasado', () async {
      final today = businessToday();
      final legacy = buildOrcamento(
        id: '123',
        saldoAtualEmCentavos: 9000,
        saldoFinalDesejadoEmCentavos: 1000,
        orcamentoDiarioAtualEmCentavos: 0,
        dataInicio: today.subtract(const Duration(days: 1)),
        dataFinal: today.add(const Duration(days: 4)),
        dataOrcamentoDiarioAtual: today.subtract(const Duration(days: 1)),
        createdAt: DateTime.fromMillisecondsSinceEpoch(0),
        updatedAt: DateTime.fromMillisecondsSinceEpoch(0),
        movimentacoes: [
          buildMovimentacao(
            id: '456',
            valorEmCentavos: 1200,
            createdAt: DateTime.fromMillisecondsSinceEpoch(0),
            updatedAt: DateTime.fromMillisecondsSinceEpoch(0),
          ),
        ],
      );
      await context.repository.save(legacy);

      await context.migrationService.run();

      expect(context.repository.allBudgets.length, 1);

      final normalized = context.repository.allBudgets.single;
      expect(normalized.id, isNot('123'));
      expect(RegExp(r'^\d+$').hasMatch(normalized.id), isFalse);
      expect(normalized.createdAt.year, greaterThanOrEqualTo(2000));
      expect(normalized.updatedAt.year, greaterThanOrEqualTo(2000));
      expect(normalized.createdAt.isUtc, isTrue);
      expect(normalized.updatedAt.isUtc, isTrue);
      expect(normalized.dataOrcamentoDiarioAtual, today);
      expect(normalized.orcamentoDiarioAtualEmCentavos, 1600);
      expect(normalized.movimentacoes.single.id, isNot('456'));
      expect(RegExp(r'^\d+$').hasMatch(normalized.movimentacoes.single.id), isFalse);
      expect(context.budgetBox.keys.single, normalized.id);
    });

    test('reconstroi impacto principal com consumo de saldo extra em budgets de gasto', () async {
      final today = businessToday();
      final entrada = buildMovimentacao(
        id: 'entry-income',
        data: today,
        valorEmCentavos: 1000,
        tipo: TipoMovimentacao.entrada,
        createdAt: DateTime(2026, 5, 18, 8),
        impactoSaldoPrincipalEmCentavos: 400,
      );
      final saida = buildMovimentacao(
        id: 'entry-expense',
        data: today,
        valorEmCentavos: 700,
        tipo: TipoMovimentacao.saida,
        createdAt: DateTime(2026, 5, 18, 9),
        impactoSaldoPrincipalEmCentavos: 0,
      );
      final legacy = buildOrcamento(
        id: 'budget-gasto',
        tipo: TipoOrcamento.gasto,
        movimentacoes: [saida, entrada],
      );
      await context.repository.save(legacy);

      await context.migrationService.run();

      final normalized = context.repository.getById('budget-gasto')!;
      expect(normalized.movimentacoes.map((mov) => mov.id).toList(), [
        'entry-income',
        'entry-expense',
      ]);
      expect(
        normalized.movimentacoes.first.impactoSaldoPrincipalEmCentavos,
        400,
      );
      expect(
        normalized.movimentacoes.last.impactoSaldoPrincipalEmCentavos,
        -100,
      );
    });
  });
}
