import 'dart:collection';

import 'package:flutter_test/flutter_test.dart';
import 'package:hive/hive.dart';
import 'package:orcamento_app/models/movimentacao.dart';
import 'package:orcamento_app/models/orcamento.dart';

import '../test_support.dart';

class _FakeBinaryReader extends Fake implements BinaryReader {
  _FakeBinaryReader({
    required List<int> bytes,
    required List<dynamic> values,
  })  : _bytes = Queue<int>.from(bytes),
        _values = Queue<dynamic>.from(values);

  final Queue<int> _bytes;
  final Queue<dynamic> _values;

  @override
  int readByte() => _bytes.removeFirst();

  @override
  dynamic read([int? typeId]) => _values.removeFirst();
}

void main() {
  setUpAll(ensureTestEnvironment);

  group('Hive adapters', () {
    test('MovimentacaoAdapter converte valores double legados para centavos', () {
      final reader = _FakeBinaryReader(
        bytes: [6, 0, 1, 2, 3, 4, 5],
        values: [
          'legacy-entry',
          DateTime(2026, 5, 19),
          12.34,
          TipoMovimentacao.saida,
          'Cafe',
          DateTime.utc(2026, 5, 19, 12),
        ],
      );

      final movimentacao = MovimentacaoAdapter().read(reader);

      expect(movimentacao.valorEmCentavos, 1234);
      expect(movimentacao.updatedAt, movimentacao.createdAt);
      expect(movimentacao.impactoSaldoPrincipalEmCentavos, -1234);
    });

    test('OrcamentoAdapter converte campos monetarios legados e reaproveita dataInicio como createdAt', () {
      final dataInicio = businessToday();
      final dataFinal = dataInicio.add(const Duration(days: 4));
      final updatedAt = DateTime.utc(2026, 5, 19, 13);
      final reader = _FakeBinaryReader(
        bytes: [16, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
        values: [
          'legacy-budget',
          100.5,
          80.25,
          dataFinal,
          10.0,
          <Movimentacao>[],
          18.1,
          16.05,
          dataInicio,
          TipoOrcamento.economia,
          dataInicio,
          'Reserva',
          true,
          StatusOrcamento.ativo,
          2.75,
          updatedAt,
        ],
      );

      final orcamento = OrcamentoAdapter().read(reader);

      expect(orcamento.valorInicialEmCentavos, 10050);
      expect(orcamento.saldoAtualEmCentavos, 8025);
      expect(orcamento.saldoFinalDesejadoEmCentavos, 1000);
      expect(orcamento.orcamentoDiarioInicialEmCentavos, 1810);
      expect(orcamento.orcamentoDiarioAtualEmCentavos, 1605);
      expect(orcamento.saldoExtraDoDiaEmCentavos, 275);
      expect(orcamento.createdAt, dataInicio);
      expect(orcamento.updatedAt, updatedAt);
    });
  });
}
