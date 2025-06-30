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
  double valor;

  @HiveField(3)
  TipoMovimentacao tipo;

  @HiveField(4)
  String? descricao;

  @HiveField(5)
  DateTime createdAt;

  // Novo campo para rastrear a última atualização
  @HiveField(6)
  DateTime updatedAt;

  Movimentacao({
    required this.id,
    required this.data,
    required this.valor,
    required this.tipo,
    this.descricao,
    required this.createdAt,
    DateTime? updatedAt,
  }) : updatedAt = updatedAt ?? createdAt;
}
