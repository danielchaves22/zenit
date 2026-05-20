import '../models/movimentacao.dart';
import '../models/orcamento.dart';
import '../utils.dart';
import 'budget_repository.dart';
import 'clock_service.dart';
import 'id_service.dart';

class MobileMigrationService {
  MobileMigrationService(this._repository);

  final BudgetRepository _repository;

  Future<void> run() async {
    final normalizedBudgets = _repository.allBudgets.map(_normalizeBudget).toList();
    await _repository.replaceAll(normalizedBudgets);
  }

  Orcamento _normalizeBudget(Orcamento original) {
    final createdAt = _normalizeDate(
      original.createdAt,
      fallback: original.dataInicio,
    );
    final updatedAt = _normalizeDate(
      original.updatedAt,
      fallback: createdAt,
    );
    final normalizedMovimentacoes = _normalizeMovimentacoes(
      original.movimentacoes,
      original.tipo,
    );

    final budget = Orcamento(
      id: _normalizeId(original.id),
      valorInicialEmCentavos: original.valorInicialEmCentavos,
      saldoAtualEmCentavos: original.saldoAtualEmCentavos,
      dataFinal: original.dataFinal,
      saldoFinalDesejadoEmCentavos: original.saldoFinalDesejadoEmCentavos,
      movimentacoes: normalizedMovimentacoes,
      orcamentoDiarioInicialEmCentavos: original.orcamentoDiarioInicialEmCentavos,
      orcamentoDiarioAtualEmCentavos: original.orcamentoDiarioAtualEmCentavos,
      dataInicio: original.dataInicio,
      tipo: original.tipo,
      dataOrcamentoDiarioAtual: original.dataOrcamentoDiarioAtual,
      codigo: original.codigo,
      isTrabalho: original.isTrabalho,
      status: original.status,
      saldoExtraDoDiaEmCentavos: original.saldoExtraDoDiaEmCentavos,
      createdAt: createdAt,
      updatedAt: updatedAt,
    );

    if (budget.status == StatusOrcamento.ativo &&
        budget.dataOrcamentoDiarioAtual.isBefore(dataDeTrabalhoAtual)) {
      recalcularOrcamentoDiarioAtual(budget);
    }

    return budget;
  }

  List<Movimentacao> _normalizeMovimentacoes(
    List<Movimentacao> movimentacoes,
    TipoOrcamento tipoOrcamento,
  ) {
    final sorted = [...movimentacoes]
      ..sort((a, b) {
        final dateCompare = a.data.compareTo(b.data);
        if (dateCompare != 0) {
          return dateCompare;
        }

        final createdCompare = a.createdAt.compareTo(b.createdAt);
        if (createdCompare != 0) {
          return createdCompare;
        }

        return a.id.compareTo(b.id);
      });

    var saldoExtraCorrenteEmCentavos = 0;

    return sorted.map((movimentacao) {
      final createdAt = _normalizeDate(
        movimentacao.createdAt,
        fallback: movimentacao.data,
      );
      final updatedAt = _normalizeDate(
        movimentacao.updatedAt,
        fallback: createdAt,
      );

      int impactoSaldoPrincipal = movimentacao.impactoSaldoPrincipalEmCentavos;
      if (impactoSaldoPrincipal == 0 && movimentacao.tipo != TipoMovimentacao.entrada) {
        impactoSaldoPrincipal = -movimentacao.valorEmCentavos;
      }

      if (tipoOrcamento == TipoOrcamento.gasto) {
        if (movimentacao.tipo == TipoMovimentacao.entrada) {
          if (impactoSaldoPrincipal == 0) {
            impactoSaldoPrincipal = movimentacao.valorEmCentavos;
          }
          final impactoExtra = movimentacao.valorEmCentavos - impactoSaldoPrincipal;
          saldoExtraCorrenteEmCentavos += impactoExtra;
        } else if (movimentacao.tipo == TipoMovimentacao.saida) {
          final valorCobertoPeloExtra = saldoExtraCorrenteEmCentavos >= movimentacao.valorEmCentavos
              ? movimentacao.valorEmCentavos
              : saldoExtraCorrenteEmCentavos;
          saldoExtraCorrenteEmCentavos -= valorCobertoPeloExtra;
          impactoSaldoPrincipal = -(movimentacao.valorEmCentavos - valorCobertoPeloExtra);
        }
      }

      return Movimentacao(
        id: _normalizeId(movimentacao.id),
        data: movimentacao.data,
        valorEmCentavos: movimentacao.valorEmCentavos,
        tipo: movimentacao.tipo,
        descricao: movimentacao.descricao,
        createdAt: createdAt,
        updatedAt: updatedAt,
        impactoSaldoPrincipalEmCentavos: impactoSaldoPrincipal,
      );
    }).toList();
  }

  String _normalizeId(String rawId) {
    final trimmed = rawId.trim();
    if (trimmed.isEmpty || RegExp(r'^\d+$').hasMatch(trimmed)) {
      return IdService.instance.next();
    }
    return trimmed;
  }

  DateTime _normalizeDate(DateTime? rawDate, {required DateTime fallback}) {
    final candidate = rawDate ?? fallback;
    if (candidate.year < 2000) {
      return ClockService.instance.nowUtc();
    }
    return candidate.isUtc ? candidate : candidate.toUtc();
  }
}
