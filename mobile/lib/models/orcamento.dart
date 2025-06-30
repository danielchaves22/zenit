import 'package:hive/hive.dart';
import 'movimentacao.dart';
import '../utils.dart';
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
  double valorInicial;

  @HiveField(2)
  double saldoAtual;

  @HiveField(3)
  DateTime dataFinal;

  @HiveField(4)
  double saldoFinalDesejado;

  @HiveField(5)
  List<Movimentacao> movimentacoes;

  @HiveField(6)
  double orcamentoDiarioInicial;

  @HiveField(7)
  double orcamentoDiarioAtual;

  @HiveField(8)
  DateTime dataInicio;

  @HiveField(9)
  late TipoOrcamento tipo;

  @HiveField(10)
  late DateTime dataOrcamentoDiarioAtual;

  // NOVOS CAMPOS:
  @HiveField(11)
  String codigo;

  @HiveField(12)
  bool isTrabalho;

  @HiveField(13)
  StatusOrcamento status;

  // Campo para armazenar valor extra destinado somente para o saldo do dia
  @HiveField(14)
  double saldoExtraDoDia;

  // Campo para controlar a data da última atualização (para sincronização)
  @HiveField(15)
  DateTime updatedAt;

  Orcamento({
    required this.id,
    required this.valorInicial,
    required this.saldoAtual,
    required this.dataFinal,
    required this.saldoFinalDesejado,
    required this.movimentacoes,
    required this.orcamentoDiarioInicial,
    required this.orcamentoDiarioAtual,
    required this.dataInicio,
    required this.tipo,
    required this.dataOrcamentoDiarioAtual,
    required this.codigo,
    required this.isTrabalho,
    required this.status,
    this.saldoExtraDoDia = 0,
    DateTime? updatedAt,
  }) : updatedAt = updatedAt ?? dataDeTrabalhoAtual;

  int get diasRestantes {
    final hoje = dataDeTrabalhoAtual;
    final dataHoje = DateTime(hoje.year, hoje.month, hoje.day);
    final dataAlvo = DateTime(dataFinal.year, dataFinal.month, dataFinal.day);
    return dataAlvo.difference(dataHoje).inDays + 1;
  }

  int get diasTotais {
    final inicio = DateTime(dataInicio.year, dataInicio.month, dataInicio.day);
    final fim = DateTime(dataFinal.year, dataFinal.month, dataFinal.day);

    return fim.difference(inicio).inDays + 1;
  }

  String get descricaoAmigavelPosicaoOrcamentoDiario {
    return "";
  }

  bool get atingiuMetaEconomiaDoDia {
    return entradasDeHoje() >= orcamentoDiarioAtual;
  }

  double entradasDoDia(DateTime dia) {
    return movimentacoesDoDia(dia, TipoMovimentacao.entrada);
  }

  double movimentacoesDoDia(DateTime dia, TipoMovimentacao tipo) {
    return movimentacoes
        .where((m) =>
            m.data.year == dia.year &&
            m.data.month == dia.month &&
            m.data.day == dia.day &&
            m.tipo == tipo)
        .fold(0.0, (soma, m) => soma + m.valor);
  }

  double gastosDoDia(DateTime dia) {
    return movimentacoesDoDia(dia, TipoMovimentacao.saida);
  }

  double gastosDeHoje() {
    return (gastosDoDia(dataDeHoje())).clamp(0.0, double.infinity);
  }

  double entradasDeHoje() {
    return (entradasDoDia(dataDeHoje())).clamp(0.0, double.infinity);
  }

  double saldoDoDia(DateTime dia) {
    final dataDia = DateTime(dia.year, dia.month, dia.day);
    final dataHoje = dataDeHoje();
    if (dataDia != dataHoje) return 0.0;
    return (orcamentoDiarioAtual - gastosDoDia(dia))
        .clamp(0.0, double.infinity);
  }

  DateTime dataDeHoje() {
    final hoje = dataDeTrabalhoAtual;
    return DateTime(hoje.year, hoje.month, hoje.day);
  }

  double get saldoDeHoje {
    final dataHoje = dataDeHoje();
    return saldoDoDia(dataHoje);
  }

  // Saldo Total do Dia = orçamento diário atual + saldoExtraDoDia
  double get saldoTotalDoDia => orcamentoDiarioAtual + saldoExtraDoDia;

  double get saldoDisponivelOrcamento => saldoAtual - saldoFinalDesejado;

  double get valorOrcamentoDiarioRecalculado =>
      saldoDisponivelOrcamento / diasRestantes;

  double get previsaoOrcamentoDiarioAmanha =>
      saldoDisponivelOrcamento / (diasRestantes - 1);

  bool get estouroOrcamentoDiario => gastosDeHoje() > orcamentoDiarioAtual;

  // Métodos de ação:
  void archive() {
    status = StatusOrcamento.arquivado;
  }

  void reactivate() {
    status = StatusOrcamento.ativo;
  }

  void exclude() {
    status = StatusOrcamento.excluido;
  }

  void incrementarOrcamentoDiario(double valor) {
    final diasRestantes = this.diasRestantes;
    if (diasRestantes > 0) {
      double incremento =
          double.parse((valor / diasRestantes).toStringAsFixed(2));
      this.orcamentoDiarioAtual += incremento;
    }
  }
}
