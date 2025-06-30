import 'package:flutter_dotenv/flutter_dotenv.dart';
import 'package:orcamento_app/models/tipo_distribuicao_entrada.dart';
import '../models/orcamento.dart';

late final DateTime dataDeTrabalhoAtual;
bool MODO_DEV = (dotenv.env['MODO_DEV']?.toLowerCase() ?? 'false') == 'true';
TipoDistribuicaoEntrada defaultDistribuicaoEntrada =
    TipoDistribuicaoEntrada.principal;

DateTime dataDeTrabalho() {
  DateTime hoje;

  if (dotenv.env['MODO_DEV'] == 'true' && dotenv.env['DATA_SIMULADA'] != null) {
    try {
      final partes = dotenv.env['DATA_SIMULADA']!.split('-');
      hoje = DateTime(
        int.parse(partes[0]),
        int.parse(partes[1]),
        int.parse(partes[2]),
      );
    } catch (_) {
      hoje = DateTime.now();
    }
  } else {
    hoje = DateTime.now();
  }

  return DateTime(hoje.year, hoje.month, hoje.day);
}

void recalcularOrcamentoDiarioAtual(Orcamento orcamento) {
  final diasRestantes = orcamento.diasRestantes;

  if (diasRestantes <= 0) return;

  final novoValor = orcamento.valorOrcamentoDiarioRecalculado;

  orcamento.orcamentoDiarioAtual = double.parse(novoValor.toStringAsFixed(2));
  orcamento.dataOrcamentoDiarioAtual = dataDeTrabalhoAtual;
}
