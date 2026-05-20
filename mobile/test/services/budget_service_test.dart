import 'package:flutter_test/flutter_test.dart';
import 'package:orcamento_app/models/movimentacao.dart';
import 'package:orcamento_app/models/orcamento.dart';
import 'package:orcamento_app/models/tipo_distribuicao_entrada.dart';

import '../test_support.dart';

void main() {
  setUpAll(ensureTestEnvironment);

  group('BudgetService', () {
    late TestContext context;

    setUp(() async {
      context = await createTestContext();
    });

    tearDown(() async {
      await context.dispose();
    });

    test('cria orcamento de gasto com valores iniciais calculados', () async {
      final today = businessToday();
      final orcamento = await context.budgetService.criarOrcamento(
        codigo: 'Mercado',
        valorInicialEmCentavos: 10000,
        saldoFinalDesejadoEmCentavos: 2000,
        dataFinal: today.add(const Duration(days: 4)),
        tipo: TipoOrcamento.gasto,
      );

      expect(orcamento.codigo, 'Mercado');
      expect(orcamento.saldoAtualEmCentavos, 10000);
      expect(orcamento.orcamentoDiarioInicialEmCentavos, 1600);
      expect(orcamento.orcamentoDiarioAtualEmCentavos, 1600);
      expect(orcamento.isTrabalho, isTrue);
      expect(orcamento.status, StatusOrcamento.ativo);
      expect(orcamento.createdAt.isUtc, isTrue);
      expect(context.repository.allBudgets.length, 1);
    });

    test('segundo orcamento ativo nao vira orcamento de trabalho automaticamente', () async {
      final today = businessToday();

      await context.budgetService.criarOrcamento(
        codigo: 'Casa',
        valorInicialEmCentavos: 10000,
        saldoFinalDesejadoEmCentavos: 0,
        dataFinal: today.add(const Duration(days: 4)),
        tipo: TipoOrcamento.gasto,
      );

      final segundo = await context.budgetService.criarOrcamento(
        codigo: 'Lazer',
        valorInicialEmCentavos: 8000,
        saldoFinalDesejadoEmCentavos: 1000,
        dataFinal: today.add(const Duration(days: 4)),
        tipo: TipoOrcamento.gasto,
      );

      expect(segundo.isTrabalho, isFalse);
    });

    test('entrada principal em orcamento de gasto aumenta saldo principal e diario', () async {
      final today = businessToday();
      final orcamento = await context.budgetService.criarOrcamento(
        codigo: 'Mercado',
        valorInicialEmCentavos: 10000,
        saldoFinalDesejadoEmCentavos: 0,
        dataFinal: today.add(const Duration(days: 4)),
        tipo: TipoOrcamento.gasto,
      );

      await context.budgetService.registrarMovimentacao(
        orcamento: orcamento,
        valorEmCentavos: 2500,
        tipoMovimentacao: TipoMovimentacao.entrada,
        data: today,
        descricao: '  Reembolso  ',
      );

      expect(orcamento.saldoAtualEmCentavos, 12500);
      expect(orcamento.orcamentoDiarioAtualEmCentavos, 2500);
      expect(orcamento.movimentacoes.single.descricao, 'Reembolso');
      expect(
        orcamento.movimentacoes.single.impactoSaldoPrincipalEmCentavos,
        2500,
      );
    });

    test('entrada extra em orcamento de gasto nao altera saldo principal', () async {
      final today = businessToday();
      final orcamento = await context.budgetService.criarOrcamento(
        codigo: 'Mercado',
        valorInicialEmCentavos: 10000,
        saldoFinalDesejadoEmCentavos: 0,
        dataFinal: today.add(const Duration(days: 4)),
        tipo: TipoOrcamento.gasto,
      );

      await context.budgetService.registrarMovimentacao(
        orcamento: orcamento,
        valorEmCentavos: 1500,
        tipoMovimentacao: TipoMovimentacao.entrada,
        data: today,
        distribuicaoEntrada: TipoDistribuicaoEntrada.extra,
      );

      expect(orcamento.saldoAtualEmCentavos, 10000);
      expect(orcamento.saldoExtraDoDiaEmCentavos, 1500);
      expect(orcamento.orcamentoDiarioAtualEmCentavos, 2000);
      expect(
        orcamento.movimentacoes.single.impactoSaldoPrincipalEmCentavos,
        0,
      );
    });

    test('saida consome saldo extra antes do saldo principal', () async {
      final today = businessToday();
      final orcamento = await context.budgetService.criarOrcamento(
        codigo: 'Mercado',
        valorInicialEmCentavos: 10000,
        saldoFinalDesejadoEmCentavos: 0,
        dataFinal: today.add(const Duration(days: 4)),
        tipo: TipoOrcamento.gasto,
      );

      await context.budgetService.registrarMovimentacao(
        orcamento: orcamento,
        valorEmCentavos: 600,
        tipoMovimentacao: TipoMovimentacao.entrada,
        data: today,
        distribuicaoEntrada: TipoDistribuicaoEntrada.extra,
      );

      await context.budgetService.registrarMovimentacao(
        orcamento: orcamento,
        valorEmCentavos: 1000,
        tipoMovimentacao: TipoMovimentacao.saida,
        data: today,
      );

      expect(orcamento.saldoExtraDoDiaEmCentavos, 0);
      expect(orcamento.saldoAtualEmCentavos, 9600);
      expect(
        orcamento.movimentacoes.last.impactoSaldoPrincipalEmCentavos,
        -400,
      );
    });

    test('entrada em orcamento de economia recalcula orcamento diario', () async {
      final today = businessToday();
      final orcamento = await context.budgetService.criarOrcamento(
        codigo: 'Viagem',
        valorInicialEmCentavos: 10000,
        saldoFinalDesejadoEmCentavos: 15000,
        dataFinal: today.add(const Duration(days: 4)),
        tipo: TipoOrcamento.economia,
      );

      await context.budgetService.registrarMovimentacao(
        orcamento: orcamento,
        valorEmCentavos: 2000,
        tipoMovimentacao: TipoMovimentacao.entrada,
        data: today,
      );

      expect(orcamento.saldoAtualEmCentavos, 12000);
      expect(orcamento.orcamentoDiarioAtualEmCentavos, 600);
      expect(
        orcamento.movimentacoes.single.impactoSaldoPrincipalEmCentavos,
        2000,
      );
    });

    test('refreshDailyBudgetsIfNeeded recalcula apenas orcamentos ativos defasados', () async {
      final today = businessToday();
      final stale = buildOrcamento(
        id: 'active-budget',
        saldoAtualEmCentavos: 9000,
        saldoFinalDesejadoEmCentavos: 1000,
        orcamentoDiarioAtualEmCentavos: 999,
        dataInicio: today.subtract(const Duration(days: 1)),
        dataFinal: today.add(const Duration(days: 4)),
        dataOrcamentoDiarioAtual: today.subtract(const Duration(days: 1)),
        updatedAt: DateTime.utc(2024, 1, 1, 12),
      );
      final archived = buildOrcamento(
        id: 'archived-budget',
        status: StatusOrcamento.arquivado,
        orcamentoDiarioAtualEmCentavos: 1234,
        dataOrcamentoDiarioAtual: today.subtract(const Duration(days: 1)),
      );

      await context.repository.saveAll([stale, archived]);

      await context.budgetService.refreshDailyBudgetsIfNeeded();

      final refreshed = context.repository.getById('active-budget')!;
      final untouched = context.repository.getById('archived-budget')!;

      expect(refreshed.orcamentoDiarioAtualEmCentavos, 1600);
      expect(refreshed.dataOrcamentoDiarioAtual, today);
      expect(refreshed.updatedAt.isAfter(DateTime.utc(2024, 1, 1, 12)), isTrue);
      expect(untouched.orcamentoDiarioAtualEmCentavos, 1234);
    });

    test('definirComoTrabalho troca o principal apenas entre orcamentos ativos', () async {
      final first = buildOrcamento(id: 'first', isTrabalho: true);
      final second = buildOrcamento(id: 'second', isTrabalho: false);
      final archived = buildOrcamento(
        id: 'archived',
        isTrabalho: true,
        status: StatusOrcamento.arquivado,
      );
      await context.repository.saveAll([first, second, archived]);

      await context.budgetService.definirComoTrabalho(second);

      expect(context.repository.getById('first')!.isTrabalho, isFalse);
      expect(context.repository.getById('second')!.isTrabalho, isTrue);
      expect(context.repository.getById('archived')!.isTrabalho, isTrue);
    });

    test('arquivar, reativar e excluir alteram o status esperado', () async {
      final orcamento = buildOrcamento();
      await context.repository.save(orcamento);

      await context.budgetService.arquivar(orcamento);
      expect(orcamento.status, StatusOrcamento.arquivado);

      await context.budgetService.reativar(orcamento);
      expect(orcamento.status, StatusOrcamento.ativo);

      await context.budgetService.excluir(orcamento);
      expect(orcamento.status, StatusOrcamento.excluido);
    });
  });
}
