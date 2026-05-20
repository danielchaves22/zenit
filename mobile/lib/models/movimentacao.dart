import 'package:hive/hive.dart';

part 'movimentacao.g.dart';

@HiveType(typeId: 1)
enum TipoMovimentacao {
  @HiveField(0)
  entrada,
  @HiveField(1)
  saida,
  @HiveField(2)
  ajusteManual,
}

@HiveType(typeId: 2)
class Movimentacao extends HiveObject {
  @HiveField(0)
  String id;

  @HiveField(1)
  DateTime data;

  @HiveField(2)
  int valorEmCentavos;

  @HiveField(3)
  TipoMovimentacao tipo;

  @HiveField(4)
  String? descricao;

  @HiveField(5)
  DateTime createdAt;

  @HiveField(6)
  DateTime updatedAt;

  @HiveField(7)
  int impactoSaldoPrincipalEmCentavos;

  Movimentacao({
    required this.id,
    required this.data,
    required this.valorEmCentavos,
    required this.tipo,
    this.descricao,
    required this.createdAt,
    DateTime? updatedAt,
    int? impactoSaldoPrincipalEmCentavos,
  })  : updatedAt = updatedAt ?? createdAt,
        impactoSaldoPrincipalEmCentavos =
            impactoSaldoPrincipalEmCentavos ??
                (tipo == TipoMovimentacao.entrada ? valorEmCentavos : -valorEmCentavos);

  bool get afetaSaldoPrincipal => impactoSaldoPrincipalEmCentavos != 0;
}
