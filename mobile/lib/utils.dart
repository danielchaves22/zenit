import 'package:intl/intl.dart';

import 'models/orcamento.dart';
import 'models/tipo_distribuicao_entrada.dart';
import 'services/app_config.dart';
import 'services/clock_service.dart';

DateTime get dataDeTrabalhoAtual => ClockService.instance.businessDate;
bool get modoDev => AppConfig.instance.modoDev;
TipoDistribuicaoEntrada get defaultDistribuicaoEntrada => TipoDistribuicaoEntrada.principal;

DateTime dataDeTrabalho() {
  return ClockService.instance.businessDate;
}

DateTime agoraUtc() {
  return ClockService.instance.nowUtc();
}

String formatarMoeda(int valorEmCentavos) {
  final formatter = NumberFormat.currency(
    locale: 'pt_BR',
    symbol: 'R\$',
    decimalDigits: 2,
  );
  return formatter.format(valorEmCentavos / 100);
}

int parseValorEmCentavos(String rawValue) {
  final normalized = rawValue
      .trim()
      .replaceAll(RegExp(r'[^0-9,.-]'), '')
      .replaceAll('.', '')
      .replaceAll(',', '.');

  if (normalized.isEmpty) {
    return 0;
  }

  final parsed = double.tryParse(normalized);
  if (parsed == null) {
    return 0;
  }

  return (parsed * 100).round();
}

int dividirCentavos(int valorEmCentavos, int divisor) {
  if (divisor <= 0) {
    return 0;
  }

  return (valorEmCentavos / divisor).round();
}

void recalcularOrcamentoDiarioAtual(Orcamento orcamento) {
  final diasRestantes = orcamento.diasRestantes;
  if (diasRestantes <= 0) {
    return;
  }

  orcamento.orcamentoDiarioAtualEmCentavos =
      dividirCentavos(orcamento.saldoDisponivelOrcamentoEmCentavos, diasRestantes);
  orcamento.dataOrcamentoDiarioAtual = dataDeTrabalhoAtual;
}
