part of 'orcamento.dart';

class OrcamentoAdapter extends TypeAdapter<Orcamento> {
  @override
  final int typeId = 0;

  @override
  Orcamento read(BinaryReader reader) {
    final numOfFields = reader.readByte();
    final fields = <int, dynamic>{
      for (int i = 0; i < numOfFields; i++) reader.readByte(): reader.read(),
    };

    final createdAt = _readDate(fields[16] ?? fields[8] ?? fields[15]);

    return Orcamento(
      id: (fields[0] as String?) ?? '',
      valorInicialEmCentavos: _readMoneyValue(fields[1]),
      saldoAtualEmCentavos: _readMoneyValue(fields[2]),
      dataFinal: _readDate(fields[3]),
      saldoFinalDesejadoEmCentavos: _readMoneyValue(fields[4]),
      movimentacoes: ((fields[5] as List?) ?? const []).cast<Movimentacao>(),
      orcamentoDiarioInicialEmCentavos: _readMoneyValue(fields[6]),
      orcamentoDiarioAtualEmCentavos: _readMoneyValue(fields[7]),
      dataInicio: _readDate(fields[8]),
      tipo: fields[9] as TipoOrcamento? ?? TipoOrcamento.gasto,
      dataOrcamentoDiarioAtual: _readDate(fields[10]),
      codigo: (fields[11] as String?) ?? '',
      isTrabalho: (fields[12] as bool?) ?? false,
      status: fields[13] as StatusOrcamento? ?? StatusOrcamento.ativo,
      saldoExtraDoDiaEmCentavos: _readMoneyValue(fields[14]),
      updatedAt: fields[15] == null ? null : _readDate(fields[15]),
      createdAt: createdAt,
    );
  }

  @override
  void write(BinaryWriter writer, Orcamento obj) {
    writer
      ..writeByte(17)
      ..writeByte(0)
      ..write(obj.id)
      ..writeByte(1)
      ..write(obj.valorInicialEmCentavos)
      ..writeByte(2)
      ..write(obj.saldoAtualEmCentavos)
      ..writeByte(3)
      ..write(obj.dataFinal)
      ..writeByte(4)
      ..write(obj.saldoFinalDesejadoEmCentavos)
      ..writeByte(5)
      ..write(obj.movimentacoes)
      ..writeByte(6)
      ..write(obj.orcamentoDiarioInicialEmCentavos)
      ..writeByte(7)
      ..write(obj.orcamentoDiarioAtualEmCentavos)
      ..writeByte(8)
      ..write(obj.dataInicio)
      ..writeByte(9)
      ..write(obj.tipo)
      ..writeByte(10)
      ..write(obj.dataOrcamentoDiarioAtual)
      ..writeByte(11)
      ..write(obj.codigo)
      ..writeByte(12)
      ..write(obj.isTrabalho)
      ..writeByte(13)
      ..write(obj.status)
      ..writeByte(14)
      ..write(obj.saldoExtraDoDiaEmCentavos)
      ..writeByte(15)
      ..write(obj.updatedAt)
      ..writeByte(16)
      ..write(obj.createdAt);
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
      other is OrcamentoAdapter &&
          runtimeType == other.runtimeType &&
          typeId == other.typeId;
}

class StatusOrcamentoAdapter extends TypeAdapter<StatusOrcamento> {
  @override
  final int typeId = 4;

  @override
  StatusOrcamento read(BinaryReader reader) {
    switch (reader.readByte()) {
      case 0:
        return StatusOrcamento.ativo;
      case 1:
        return StatusOrcamento.arquivado;
      case 2:
        return StatusOrcamento.expirado;
      case 3:
        return StatusOrcamento.excluido;
      default:
        return StatusOrcamento.ativo;
    }
  }

  @override
  void write(BinaryWriter writer, StatusOrcamento obj) {
    switch (obj) {
      case StatusOrcamento.ativo:
        writer.writeByte(0);
        break;
      case StatusOrcamento.arquivado:
        writer.writeByte(1);
        break;
      case StatusOrcamento.expirado:
        writer.writeByte(2);
        break;
      case StatusOrcamento.excluido:
        writer.writeByte(3);
        break;
    }
  }

  @override
  int get hashCode => typeId.hashCode;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is StatusOrcamentoAdapter &&
          runtimeType == other.runtimeType &&
          typeId == other.typeId;
}

class TipoOrcamentoAdapter extends TypeAdapter<TipoOrcamento> {
  @override
  final int typeId = 3;

  @override
  TipoOrcamento read(BinaryReader reader) {
    switch (reader.readByte()) {
      case 0:
        return TipoOrcamento.gasto;
      case 1:
        return TipoOrcamento.economia;
      default:
        return TipoOrcamento.gasto;
    }
  }

  @override
  void write(BinaryWriter writer, TipoOrcamento obj) {
    switch (obj) {
      case TipoOrcamento.gasto:
        writer.writeByte(0);
        break;
      case TipoOrcamento.economia:
        writer.writeByte(1);
        break;
    }
  }

  @override
  int get hashCode => typeId.hashCode;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is TipoOrcamentoAdapter &&
          runtimeType == other.runtimeType &&
          typeId == other.typeId;
}
