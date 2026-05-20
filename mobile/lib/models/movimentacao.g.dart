part of 'movimentacao.dart';

class MovimentacaoAdapter extends TypeAdapter<Movimentacao> {
  @override
  final int typeId = 2;

  @override
  Movimentacao read(BinaryReader reader) {
    final numOfFields = reader.readByte();
    final fields = <int, dynamic>{
      for (int i = 0; i < numOfFields; i++) reader.readByte(): reader.read(),
    };

    final tipo = fields[3] as TipoMovimentacao;
    final valorEmCentavos = _readMoneyValue(fields[2]);

    return Movimentacao(
      id: (fields[0] as String?) ?? '',
      data: _readDate(fields[1]),
      valorEmCentavos: valorEmCentavos,
      tipo: tipo,
      descricao: fields[4] as String?,
      createdAt: _readDate(fields[5]),
      updatedAt: fields[6] == null ? null : _readDate(fields[6]),
      impactoSaldoPrincipalEmCentavos:
          fields[7] == null ? null : _readMoneyValue(fields[7]),
    );
  }

  @override
  void write(BinaryWriter writer, Movimentacao obj) {
    writer
      ..writeByte(8)
      ..writeByte(0)
      ..write(obj.id)
      ..writeByte(1)
      ..write(obj.data)
      ..writeByte(2)
      ..write(obj.valorEmCentavos)
      ..writeByte(3)
      ..write(obj.tipo)
      ..writeByte(4)
      ..write(obj.descricao)
      ..writeByte(5)
      ..write(obj.createdAt)
      ..writeByte(6)
      ..write(obj.updatedAt)
      ..writeByte(7)
      ..write(obj.impactoSaldoPrincipalEmCentavos);
  }

  int _readMoneyValue(dynamic rawValue) {
    if (rawValue is int) {
      return rawValue;
    }
    if (rawValue is double) {
      return (rawValue * 100).round();
    }
    if (rawValue is num) {
      return (rawValue.toDouble() * 100).round();
    }
    return 0;
  }

  DateTime _readDate(dynamic rawValue) {
    if (rawValue is DateTime) {
      return rawValue;
    }
    return DateTime.fromMillisecondsSinceEpoch(0, isUtc: true);
  }

  @override
  int get hashCode => typeId.hashCode;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is MovimentacaoAdapter &&
          runtimeType == other.runtimeType &&
          typeId == other.typeId;
}

class TipoMovimentacaoAdapter extends TypeAdapter<TipoMovimentacao> {
  @override
  final int typeId = 1;

  @override
  TipoMovimentacao read(BinaryReader reader) {
    switch (reader.readByte()) {
      case 0:
        return TipoMovimentacao.entrada;
      case 1:
        return TipoMovimentacao.saida;
      case 2:
        return TipoMovimentacao.ajusteManual;
      default:
        return TipoMovimentacao.entrada;
    }
  }

  @override
  void write(BinaryWriter writer, TipoMovimentacao obj) {
    switch (obj) {
      case TipoMovimentacao.entrada:
        writer.writeByte(0);
        break;
      case TipoMovimentacao.saida:
        writer.writeByte(1);
        break;
      case TipoMovimentacao.ajusteManual:
        writer.writeByte(2);
        break;
    }
  }

  @override
  int get hashCode => typeId.hashCode;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is TipoMovimentacaoAdapter &&
          runtimeType == other.runtimeType &&
          typeId == other.typeId;
}
