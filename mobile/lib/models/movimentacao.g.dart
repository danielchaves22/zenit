// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'movimentacao.dart';

// **************************************************************************
// TypeAdapterGenerator
// **************************************************************************

class MovimentacaoAdapter extends TypeAdapter<Movimentacao> {
  @override
  final int typeId = 2;

  @override
  Movimentacao read(BinaryReader reader) {
    final numOfFields = reader.readByte();
    final fields = <int, dynamic>{
      for (int i = 0; i < numOfFields; i++) reader.readByte(): reader.read(),
    };
    return Movimentacao(
      id: fields[0] as String,
      data: fields[1] as DateTime,
      valor: fields[2] as double,
      tipo: fields[3] as TipoMovimentacao,
      descricao: fields[4] as String?,
      createdAt: fields[5] as DateTime,
      updatedAt: fields[6] as DateTime?,
    );
  }

  @override
  void write(BinaryWriter writer, Movimentacao obj) {
    writer
      ..writeByte(7)
      ..writeByte(0)
      ..write(obj.id)
      ..writeByte(1)
      ..write(obj.data)
      ..writeByte(2)
      ..write(obj.valor)
      ..writeByte(3)
      ..write(obj.tipo)
      ..writeByte(4)
      ..write(obj.descricao)
      ..writeByte(5)
      ..write(obj.createdAt)
      ..writeByte(6)
      ..write(obj.updatedAt);
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
