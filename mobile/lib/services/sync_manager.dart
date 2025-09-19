// lib/services/sync_manager.dart

import 'package:hive/hive.dart';
import 'package:orcamento_app/models/orcamento.dart';
import 'package:orcamento_app/utils.dart';
import 'api_service.dart';

class SyncManager {
  final Box<Orcamento> localBox;
  final ApiService api;

  SyncManager({required this.localBox, required this.api});

  void startListening() {
    localBox.watch().listen((event) {
      if (!event.deleted && event.value != null) {
        Orcamento orc = event.value as Orcamento;
        orc.updatedAt = dataDeTrabalhoAtual;
        pushOrcamento(orc);
      }
    });
  }

  Future<void> pushOrcamento(Orcamento orcamento) async {
    try {
      final Map<String, dynamic> jsonData = orcamentoToJson(orcamento);
      await api.post('/api/mobile/budgets', jsonData);
    } catch (e) {
      print('Erro no push de orcamento ${orcamento.id}: $e');
    }
  }

  Future<void> pullOrcamentos() async {
    try {
      final list = await api.getList('/api/mobile/budgets');
      for (var data in list) {
        Orcamento remote = orcamentoFromJson(data);
        Orcamento? local = localBox.get(remote.id);
        if (local == null || remote.updatedAt.isAfter(local.updatedAt)) {
          localBox.put(remote.id, remote);
        }
      }
    } catch (e) {
      print('Erro no pull dos orcamentos: $e');
    }
  }
}

Map<String, dynamic> orcamentoToJson(Orcamento orc) {
  return {
    'id': orc.id,
    'valorInicial': orc.valorInicial,
    'saldoAtual': orc.saldoAtual,
    'dataFinal': orc.dataFinal.toIso8601String(),
    'saldoFinalDesejado': orc.saldoFinalDesejado,
    'movimentacoes': orc.movimentacoes.map((m) => m.id).toList(),
    'orcamentoDiarioInicial': orc.orcamentoDiarioInicial,
    'orcamentoDiarioAtual': orc.orcamentoDiarioAtual,
    'dataInicio': orc.dataInicio.toIso8601String(),
    'tipo': orc.tipo.index,
    'dataOrcamentoDiarioAtual': orc.dataOrcamentoDiarioAtual.toIso8601String(),
    'codigo': orc.codigo,
    'isTrabalho': orc.isTrabalho,
    'status': orc.status.index,
    'saldoExtraDoDia': orc.saldoExtraDoDia,
    'updatedAt': orc.updatedAt.toIso8601String(),
  };
}

Orcamento orcamentoFromJson(Map<String, dynamic> json) {
  return Orcamento(
    id: json['id'],
    valorInicial: json['valorInicial'],
    saldoAtual: json['saldoAtual'],
    dataFinal: DateTime.parse(json['dataFinal']),
    saldoFinalDesejado: json['saldoFinalDesejado'],
    movimentacoes: [],
    orcamentoDiarioInicial: json['orcamentoDiarioInicial'],
    orcamentoDiarioAtual: json['orcamentoDiarioAtual'],
    dataInicio: DateTime.parse(json['dataInicio']),
    tipo: TipoOrcamento.values[json['tipo']],
    dataOrcamentoDiarioAtual: DateTime.parse(json['dataOrcamentoDiarioAtual']),
    codigo: json['codigo'],
    isTrabalho: json['isTrabalho'],
    status: StatusOrcamento.values[json['status']],
    saldoExtraDoDia: json['saldoExtraDoDia'] ?? 0.0,
    updatedAt: DateTime.parse(json['updatedAt']),
  );
}
