// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'tipo_distribuicao_entrada.dart';

// **************************************************************************
// TypeAdapterGenerator
// **************************************************************************

class TipoDistribuicaoEntradaAdapter
    extends TypeAdapter<TipoDistribuicaoEntrada> {
  @override
  final int typeId = 5;

  @override
  TipoDistribuicaoEntrada read(BinaryReader reader) {
    switch (reader.readByte()) {
      case 0:
        return TipoDistribuicaoEntrada.principal;
      case 1:
        return TipoDistribuicaoEntrada.extra;
      default:
        return TipoDistribuicaoEntrada.principal;
    }
  }

  @override
  void write(BinaryWriter writer, TipoDistribuicaoEntrada obj) {
    switch (obj) {
      case TipoDistribuicaoEntrada.principal:
        writer.writeByte(0);
        break;
      case TipoDistribuicaoEntrada.extra:
        writer.writeByte(1);
        break;
    }
  }

  @override
  int get hashCode => typeId.hashCode;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is TipoDistribuicaoEntradaAdapter &&
          runtimeType == other.runtimeType &&
          typeId == other.typeId;
}
