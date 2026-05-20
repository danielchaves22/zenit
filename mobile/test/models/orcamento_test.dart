import 'package:flutter_test/flutter_test.dart';
import 'package:orcamento_app/models/movimentacao.dart';
import 'package:orcamento_app/models/orcamento.dart';

import '../test_support.dart';

void main() {
  setUpAll(ensureTestEnvironment);

  group('Orcamento', () {
    test('saldo do dia nunca fica negativo e so vale para o dia corrente', () {
      final today = businessToday();
      final orcamento = buildOrcamento(
        orcamentoDiarioAtualEmCentavos: 1500,
        movimentacoes: [
          buildMovimentacao(
            data: today,
            valorEmCentavos: 2000,
            tipo: TipoMovimentacao.saida,
          ),
        ],
      );

      expect(orcamento.saldoDeHojeEmCentavos, 0);
      expect(
        orcamento.saldoDoDia(today.subtract(const Duration(days: 1))),
        0,
      );
    });

    test('atinge meta de economia quando entradas do dia batem o valor diario', () {
      final today = businessToday();
      final orcamento = buildOrcamento(
        tipo: TipoOrcamento.economia,
        orcamentoDiarioAtualEmCentavos: 1000,
        movimentacoes: [
          buildMovimentacao(
            data: today,
            valorEmCentavos: 1200,
            tipo: TipoMovimentacao.entrada,
          ),
        ],
      );

      expect(orcamento.atingiuMetaEconomiaDoDia, isTrue);
    });

    test('previsao do orcamento de amanha usa um dia restante a menos', () {
      final orcamento = buildOrcamento(
        saldoAtualEmCentavos: 9000,
        saldoFinalDesejadoEmCentavos: 0,
      );

      expect(orcamento.previsaoOrcamentoDiarioAmanhaEmCentavos, 2250);
    });
  });
}
