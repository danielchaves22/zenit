import 'package:flutter/material.dart';

import '../models/orcamento.dart';
import '../services/app_services.dart';
import '../services/sync_state.dart';

class EntryPoint extends StatefulWidget {
  const EntryPoint({super.key});

  @override
  State<EntryPoint> createState() => _EntryPointState();
}

class _EntryPointState extends State<EntryPoint> {
  @override
  void initState() {
    super.initState();

    WidgetsBinding.instance.addPostFrameCallback((_) {
      if (AppServices.syncService.stateListenable.value.status ==
          SyncStatus.reconciliationRequired) {
        Navigator.pushReplacementNamed(context, '/sync-reconciliation');
        return;
      }

      final ativos = AppServices.budgetRepository.allBudgets
          .where((orcamento) => orcamento.status == StatusOrcamento.ativo)
          .toList();
      final orcamentoTrabalho = ativos.where((orcamento) => orcamento.isTrabalho).firstOrNull;

      if (orcamentoTrabalho != null) {
        Navigator.pushReplacementNamed(context, '/resumo', arguments: orcamentoTrabalho);
      } else {
        Navigator.pushReplacementNamed(context, '/lista');
      }
    });
  }

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(child: CircularProgressIndicator()),
    );
  }
}

extension<T> on Iterable<T> {
  T? get firstOrNull {
    if (isEmpty) {
      return null;
    }
    return first;
  }
}
