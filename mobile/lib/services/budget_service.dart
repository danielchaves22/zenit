import '../models/movimentacao.dart';
import '../models/orcamento.dart';
import '../models/tipo_distribuicao_entrada.dart';
import '../utils.dart';
import 'budget_repository.dart';
import 'id_service.dart';
import 'sync_service.dart';

class BudgetService {
  BudgetService({
    required BudgetRepository repository,
    required SyncService syncService,
  })  : _repository = repository,
        _syncService = syncService;

  final BudgetRepository _repository;
  final SyncService _syncService;

  Future<void> refreshDailyBudgetsIfNeeded() async {
    final updatedBudgets = <Orcamento>[];

    for (final orcamento in _repository.allBudgets) {
      if (orcamento.status != StatusOrcamento.ativo) {
        continue;
      }

      if (orcamento.dataOrcamentoDiarioAtual.isBefore(dataDeTrabalhoAtual)) {
        recalcularOrcamentoDiarioAtual(orcamento);
        orcamento.updatedAt = agoraUtc();
        updatedBudgets.add(orcamento);
      }
    }

    if (updatedBudgets.isNotEmpty) {
      await _repository.saveAll(updatedBudgets);
      _syncService.scheduleSync();
    }
  }

  Future<Orcamento> criarOrcamento({
    required String codigo,
    required int valorInicialEmCentavos,
    required int saldoFinalDesejadoEmCentavos,
    required DateTime dataFinal,
    required TipoOrcamento tipo,
  }) async {
    final diasRestantes =
        dataFinal.difference(DateTime(dataDeTrabalhoAtual.year, dataDeTrabalhoAtual.month, dataDeTrabalhoAtual.day)).inDays +
            1;
    final saldoDisponivel = tipo == TipoOrcamento.gasto
        ? valorInicialEmCentavos - saldoFinalDesejadoEmCentavos
        : saldoFinalDesejadoEmCentavos - valorInicialEmCentavos;
    final orcamentoDiario = dividirCentavos(saldoDisponivel, diasRestantes);
    final createdAt = agoraUtc();
    final hasActive = _repository.allBudgets.any((orcamento) => orcamento.status == StatusOrcamento.ativo);

    final novo = Orcamento(
      id: IdService.instance.next(),
      codigo: codigo.trim(),
      valorInicialEmCentavos: valorInicialEmCentavos,
      saldoAtualEmCentavos: valorInicialEmCentavos,
      dataFinal: dataFinal,
      saldoFinalDesejadoEmCentavos: saldoFinalDesejadoEmCentavos,
      movimentacoes: <Movimentacao>[],
      orcamentoDiarioInicialEmCentavos: orcamentoDiario,
      orcamentoDiarioAtualEmCentavos: orcamentoDiario,
      dataInicio: dataDeTrabalhoAtual,
      tipo: tipo,
      dataOrcamentoDiarioAtual: dataDeTrabalhoAtual,
      isTrabalho: !hasActive,
      status: StatusOrcamento.ativo,
      createdAt: createdAt,
      updatedAt: createdAt,
    );

    await _repository.save(novo);
    _syncService.scheduleSync();
    return novo;
  }

  Future<void> registrarMovimentacao({
    required Orcamento orcamento,
    required int valorEmCentavos,
    required TipoMovimentacao tipoMovimentacao,
    required DateTime data,
    String? descricao,
    TipoDistribuicaoEntrada distribuicaoEntrada = TipoDistribuicaoEntrada.principal,
  }) async {
    final timestamp = agoraUtc();
    var impactoSaldoPrincipalEmCentavos = 0;

    if (tipoMovimentacao == TipoMovimentacao.entrada) {
      if (orcamento.tipo == TipoOrcamento.gasto) {
        if (distribuicaoEntrada == TipoDistribuicaoEntrada.extra) {
          orcamento.saldoExtraDoDiaEmCentavos += valorEmCentavos;
          impactoSaldoPrincipalEmCentavos = 0;
        } else {
          orcamento.saldoAtualEmCentavos += valorEmCentavos;
          orcamento.incrementarOrcamentoDiario(valorEmCentavos);
          impactoSaldoPrincipalEmCentavos = valorEmCentavos;
        }
      } else {
        orcamento.saldoAtualEmCentavos += valorEmCentavos;
        recalcularOrcamentoDiarioAtual(orcamento);
        impactoSaldoPrincipalEmCentavos = valorEmCentavos;
      }
    } else if (tipoMovimentacao == TipoMovimentacao.saida) {
      if (orcamento.saldoExtraDoDiaEmCentavos >= valorEmCentavos) {
        orcamento.saldoExtraDoDiaEmCentavos -= valorEmCentavos;
        impactoSaldoPrincipalEmCentavos = 0;
      } else {
        final restante = valorEmCentavos - orcamento.saldoExtraDoDiaEmCentavos;
        orcamento.saldoExtraDoDiaEmCentavos = 0;
        orcamento.saldoAtualEmCentavos -= restante;
        impactoSaldoPrincipalEmCentavos = -restante;
      }
    }

    final movimentacao = Movimentacao(
      id: IdService.instance.next(),
      data: DateTime(data.year, data.month, data.day),
      valorEmCentavos: valorEmCentavos,
      tipo: tipoMovimentacao,
      descricao: descricao?.trim().isEmpty ?? true ? null : descricao?.trim(),
      createdAt: timestamp,
      updatedAt: timestamp,
      impactoSaldoPrincipalEmCentavos: impactoSaldoPrincipalEmCentavos,
    );

    orcamento.movimentacoes.add(movimentacao);
    orcamento.updatedAt = timestamp;

    await _repository.save(orcamento);
    _syncService.scheduleSync();
  }

  Future<void> arquivar(Orcamento orcamento) async {
    orcamento.archive();
    orcamento.updatedAt = agoraUtc();
    await _repository.save(orcamento);
    _syncService.scheduleSync();
  }

  Future<void> reativar(Orcamento orcamento) async {
    orcamento.reactivate();
    orcamento.updatedAt = agoraUtc();
    await _repository.save(orcamento);
    _syncService.scheduleSync();
  }

  Future<void> excluir(Orcamento orcamento) async {
    orcamento.exclude();
    orcamento.updatedAt = agoraUtc();
    await _repository.save(orcamento);
    _syncService.scheduleSync();
  }

  Future<void> definirComoTrabalho(Orcamento orcamento) async {
    final updated = <Orcamento>[];

    for (final current in _repository.allBudgets) {
      if (current.status != StatusOrcamento.ativo) {
        continue;
      }

      final shouldBeWorkBudget = current.id == orcamento.id;
      if (current.isTrabalho != shouldBeWorkBudget) {
        current.isTrabalho = shouldBeWorkBudget;
        current.updatedAt = agoraUtc();
        updated.add(current);
      }
    }

    if (updated.isNotEmpty) {
      await _repository.saveAll(updated);
      _syncService.scheduleSync();
    }
  }
}
