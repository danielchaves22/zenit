// lib/services/sync_manager.dart

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:hive/hive.dart';
import 'package:orcamento_app/models/orcamento.dart';
import 'package:orcamento_app/utils.dart';

class SyncManager {
  final Box<Orcamento> localBox;
  final FirebaseFirestore firestore;

  SyncManager({required this.localBox, required this.firestore});

  /// Inicia a escuta das alterações locais para fazer o push automático,
  /// mas somente se o usuário estiver autenticado.
  void startListening() {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return; // Se não estiver autenticado, não sincroniza

    localBox.watch().listen((event) {
      if (!event.deleted && event.value != null) {
        Orcamento orc = event.value as Orcamento;
        // Atualiza o updatedAt e adiciona o uid para sincronização
        orc.updatedAt = dataDeTrabalhoAtual;
        pushOrcamento(orc, user.uid);
      }
    });
  }

  /// Faz o push de um orçamento para o Firestore, incluindo o UID
  Future<void> pushOrcamento(Orcamento orcamento, String uid) async {
    try {
      final Map<String, dynamic> jsonData = orcamentoToJson(orcamento, uid);
      await firestore
          .collection('orcamentos')
          .doc(orcamento.id)
          .set(jsonData, SetOptions(merge: true));
    } catch (e) {
      print('Erro no push de orcamento ${orcamento.id}: $e');
    }
  }

  /// Faz o pull dos orçamentos do Firestore e atualiza o box local se o documento remoto estiver mais atualizado.
  Future<void> pullOrcamentos() async {
    final user = FirebaseAuth.instance.currentUser;
    if (user == null) return; // Sem usuário autenticado, não sincroniza

    try {
      QuerySnapshot snapshot = await firestore
          .collection('orcamentos')
          .where('uid', isEqualTo: user.uid)
          .get();

      for (var doc in snapshot.docs) {
        final data = doc.data() as Map<String, dynamic>;
        Orcamento remoteOrcamento = orcamentoFromJson(data);
        Orcamento? localOrcamento = localBox.get(remoteOrcamento.id);
        if (localOrcamento == null ||
            remoteOrcamento.updatedAt.isAfter(localOrcamento.updatedAt)) {
          localBox.put(remoteOrcamento.id, remoteOrcamento);
        }
      }
    } catch (e) {
      print('Erro no pull dos orçamentos: $e');
    }
  }
}

/// Exemplo simplificado de conversão para JSON, agora incluindo o uid.
Map<String, dynamic> orcamentoToJson(Orcamento orc, String uid) {
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
    'uid': uid, // Associação com o UID do usuário autenticado
  };
}

/// Exemplo simplificado de criação de um Orcamento a partir de JSON.
Orcamento orcamentoFromJson(Map<String, dynamic> json) {
  return Orcamento(
    id: json['id'],
    valorInicial: json['valorInicial'],
    saldoAtual: json['saldoAtual'],
    dataFinal: DateTime.parse(json['dataFinal']),
    saldoFinalDesejado: json['saldoFinalDesejado'],
    movimentacoes: [], // Aqui você deve carregar as movimentações se necessário
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
