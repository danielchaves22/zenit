import 'package:hive/hive.dart';

import '../services/clock_service.dart';
import 'movimentacao.dart';

part 'orcamento.g.dart';

@HiveType(typeId: 4)
enum StatusOrcamento {
  @HiveField(0)
  ativo,
  @HiveField(1)
  arquivado,
  @HiveField(2)
  expirado,
  @HiveField(3)
  excluido,
}

@HiveType(typeId: 3)
enum TipoOrcamento {
  @HiveField(0)
  gasto,
  @HiveField(1)
  economia,
}

@HiveType(typeId: 0)
class Orcamento extends HiveObject {
  @HiveField(0)
  String id;

  @HiveField(1)
  int valorInicialEmCentavos;

  @HiveField(2)
  int saldoAtualEmCentavos;

  @HiveField(3)
  DateTime dataFinal;

  @HiveField(4)
  int saldoFinalDesejadoEmCentavos;

  @HiveField(5)
  List<Movimentacao> movimentacoes;

  @HiveField(6)
  int orcamentoDiarioInicialEmCentavos;

  @HiveField(7)
  int orcamentoDiarioAtualEmCentavos;

  @HiveField(8)
  DateTime dataInicio;

  @HiveField(9)
  TipoOrcamento tipo;

  @HiveField(10)
  DateTime dataOrcamentoDiarioAtual;

  @HiveField(11)
  String codigo;

  @HiveField(12)
  bool isTrabalho;

  @HiveField(13)
  StatusOrcamento status;

  @HiveField(14)
  int saldoExtraDoDiaEmCentavos;

  @HiveField(15)
  DateTime updatedAt;

  @HiveField(16)
  DateTime createdAt;

  Orcamento({
    required this.id,
    required this.valorInicialEmCentavos,
    required this.saldoAtualEmCentavos,
    required this.dataFinal,
    required this.saldoFinalDesejadoEmCentavos,
    required this.movimentacoes,
    required this.orcamentoDiarioInicialEmCentavos,
    required this.orcamentoDiarioAtualEmCentavos,
    required this.dataInicio,
    required this.tipo,
    required this.dataOrcamentoDiarioAtual,
    required this.codigo,
    required this.isTrabalho,
    required this.status,
    this.saldoExtraDoDiaEmCentavos = 0,
    required this.createdAt,
    DateTime? updatedAt,
  }) : updatedAt = updatedAt ?? createdAt;

  int get diasRestantes {
    final hoje = dataDeHoje();
    final dataAlvo = DateTime(dataFinal.year, dataFinal.month, dataFinal.day);
    return dataAlvo.difference(hoje).inDays + 1;
  }

  int get diasTotais {
    final inicio = DateTime(dataInicio.year, dataInicio.month, dataInicio.day);
    final fim = DateTime(dataFinal.year, dataFinal.month, dataFinal.day);
    return fim.difference(inicio).inDays + 1;
  }

  bool get atingiuMetaEconomiaDoDia => entradasDeHoje() >= orcamentoDiarioAtualEmCentavos;

  int entradasDoDia(DateTime dia) {
    return movimentacoesDoDia(dia, TipoMovimentacao.entrada);
  }

  int movimentacoesDoDia(DateTime dia, TipoMovimentacao tipoMovimentacao) {
    return movimentacoes
        .where(
          (movimentacao) =>
              movimentacao.data.year == dia.year &&
              movimentacao.data.month == dia.month &&
              movimentacao.data.day == dia.day &&
              movimentacao.tipo == tipoMovimentacao,
        )
        .fold<int>(0, (soma, movimentacao) => soma + movimentacao.valorEmCentavos);
  }

  int gastosDoDia(DateTime dia) {
    return movimentacoesDoDia(dia, TipoMovimentacao.saida);
  }

  int gastosDeHoje() {
    return gastosDoDia(dataDeHoje()).clamp(0, 1 << 31);
  }

  int entradasDeHoje() {
    return entradasDoDia(dataDeHoje()).clamp(0, 1 << 31);
  }

  int saldoDoDia(DateTime dia) {
    final dataDia = DateTime(dia.year, dia.month, dia.day);
    final dataHoje = dataDeHoje();
    if (dataDia != dataHoje) {
      return 0;
    }

    final saldo = orcamentoDiarioAtualEmCentavos - gastosDoDia(dia);
    return saldo < 0 ? 0 : saldo;
  }

  DateTime dataDeHoje() {
    final hoje = ClockService.instance.businessDate;
    return DateTime(hoje.year, hoje.month, hoje.day);
  }

  int get saldoDeHojeEmCentavos => saldoDoDia(dataDeHoje());

  int get saldoTotalDoDiaEmCentavos =>
      orcamentoDiarioAtualEmCentavos + saldoExtraDoDiaEmCentavos;

  int get saldoDisponivelOrcamentoEmCentavos =>
      tipo == TipoOrcamento.gasto
          ? saldoAtualEmCentavos - saldoFinalDesejadoEmCentavos
          : saldoFinalDesejadoEmCentavos - saldoAtualEmCentavos;

  int get valorOrcamentoDiarioRecalculadoEmCentavos =>
      _dividirCentavos(saldoDisponivelOrcamentoEmCentavos, diasRestantes);

  int get previsaoOrcamentoDiarioAmanhaEmCentavos {
    final divisor = diasRestantes - 1;
    if (divisor <= 0) {
      return 0;
    }
    return _dividirCentavos(saldoDisponivelOrcamentoEmCentavos, divisor);
  }

  bool get estouroOrcamentoDiario => gastosDeHoje() > orcamentoDiarioAtualEmCentavos;

  void archive() {
    status = StatusOrcamento.arquivado;
  }

  void reactivate() {
    status = StatusOrcamento.ativo;
  }

  void exclude() {
    status = StatusOrcamento.excluido;
  }

  void incrementarOrcamentoDiario(int valorEmCentavos) {
    if (diasRestantes <= 0) {
      return;
    }

    orcamentoDiarioAtualEmCentavos += _dividirCentavos(valorEmCentavos, diasRestantes);
  }

  static int _dividirCentavos(int valor, int divisor) {
    if (divisor <= 0) {
      return 0;
    }
    return (valor / divisor).round();
  }
}
