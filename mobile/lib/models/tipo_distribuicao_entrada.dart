import 'package:hive/hive.dart';

part 'tipo_distribuicao_entrada.g.dart';

@HiveType(typeId: 5)
enum TipoDistribuicaoEntrada {
  @HiveField(0)
  principal, // Alocar no saldo do orçamento (saldoAtual)
  @HiveField(1)
  extra, // Alocar no saldo extra do dia (saldoExtraDoDia)
}
