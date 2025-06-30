// lib/pages/entry_point.dart

import 'package:flutter/material.dart';
import 'package:hive/hive.dart';
import '../models/orcamento.dart';
import 'lista_orcamentos_page.dart';
import 'resumo_orcamento_page.dart';
import '../utils.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:orcamento_app/services/sync_manager.dart';

class EntryPoint extends StatefulWidget {
  const EntryPoint({Key? key}) : super(key: key);

  @override
  State<EntryPoint> createState() => _EntryPointState();
}

class _EntryPointState extends State<EntryPoint> {
  late Box<Orcamento> box;
  Orcamento? orcamentoTrabalho;

  @override
  void initState() {
    super.initState();
    box = Hive.box<Orcamento>('orcamentos');

    // Aqui já obtém o orçamento de trabalho, se existir
    final ativos =
        box.values.where((orc) => orc.status == StatusOrcamento.ativo).toList();
    final trabalhoList = ativos.where((orc) => orc.isTrabalho).toList();
    orcamentoTrabalho = trabalhoList.isNotEmpty ? trabalhoList.first : null;

    // Verifica se a data do orçamento diário precisa ser recalculada
    if (orcamentoTrabalho != null &&
        orcamentoTrabalho!.dataOrcamentoDiarioAtual
            .isBefore(dataDeTrabalhoAtual)) {
      recalcularOrcamentoDiarioAtual(orcamentoTrabalho!);
      box.put(orcamentoTrabalho!.id, orcamentoTrabalho!);
    }

    // --- NOVO: Integração do SyncManager ---
    _startSyncIfNeeded();

    // Navega para a tela certa com base se houver orçamento de trabalho
    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (orcamentoTrabalho != null) {
        Navigator.pushReplacementNamed(context, '/resumo',
            arguments: orcamentoTrabalho);
      } else {
        Navigator.pushReplacementNamed(context, '/lista');
      }
    });
  }

  void _startSyncIfNeeded() {
    // Importa o FirebaseAuth e FirebaseFirestore
    // Certifique-se de ter adicionado a dependência firebase_auth no pubspec.yaml
    // e também que o arquivo sync_manager.dart está disponível em lib/services/
    //
    // Esse código assume que você importou:
    // import 'package:firebase_auth/firebase_auth.dart';
    // import 'package:cloud_firestore/cloud_firestore.dart';
    // import 'package:orcamento_app/services/sync_manager.dart';
    final user = FirebaseAuth.instance.currentUser;
    if (user != null) {
      // Instancia o SyncManager passando o box local e a instância do Firestore
      final syncManager = SyncManager(
        localBox: box,
        firestore: FirebaseFirestore.instance,
      );
      // Inicia a escuta das alterações (push)
      syncManager.startListening();
      // Realiza um pull inicial dos dados do backend
      syncManager.pullOrcamentos();
    }
  }

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(child: CircularProgressIndicator()),
    );
  }
}
