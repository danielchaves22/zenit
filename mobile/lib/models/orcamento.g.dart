// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'orcamento.dart';

// **************************************************************************
// TypeAdapterGenerator
// **************************************************************************

class OrcamentoAdapter extends TypeAdapter<Orcamento> {
  @override
  final int typeId = 0;

  @override
  Orcamento read(BinaryReader reader) {
    final numOfFields = reader.readByte();
    final fields = <int, dynamic>{
      for (int i = 0; i < numOfFields; i++) reader.readByte(): reader.read(),
    };
    return Orcamento(
      id: fields[0] as String,
      valorInicial: fields[1] as double,
      saldoAtual: fields[2] as double,
      dataFinal: fields[3] as DateTime,
      saldoFinalDesejado: fields[4] as double,
      movimentacoes: (fields[5] as List).cast<Movimentacao>(),
      orcamentoDiarioInicial: fields[6] as double,
      orcamentoDiarioAtual: fields[7] as double,
      dataInicio: fields[8] as DateTime,
      tipo: fields[9] as TipoOrcamento,
      dataOrcamentoDiarioAtual: fields[10] as DateTime,
      codigo: fields[11] as String,
      isTrabalho: fields[12] as bool,
      status: fields[13] as StatusOrcamento,
      saldoExtraDoDia: fields[14] as double,
      updatedAt: fields[15] as DateTime?,
    );
  }

  @override
  void write(BinaryWriter writer, Orcamento obj) {
    writer
      ..writeByte(16)
      ..writeByte(0)
      ..write(obj.id)
      ..writeByte(1)
      ..write(obj.valorInicial)
      ..writeByte(2)
      ..write(obj.saldoAtual)
      ..writeByte(3)
      ..write(obj.dataFinal)
      ..writeByte(4)
      ..write(obj.saldoFinalDesejado)
      ..writeByte(5)
      ..write(obj.movimentacoes)
      ..writeByte(6)
      ..write(obj.orcamentoDiarioInicial)
      ..writeByte(7)
      ..write(obj.orcamentoDiarioAtual)
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
      ..write(obj.saldoExtraDoDia)
      ..writeByte(15)
      ..write(obj.updatedAt);
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
