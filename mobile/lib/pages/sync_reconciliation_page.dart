import 'package:flutter/material.dart';

import '../services/app_services.dart';
import '../services/sync_service.dart';
import '../widgets/app_drawer.dart';

class SyncReconciliationPage extends StatefulWidget {
  const SyncReconciliationPage({super.key});

  @override
  State<SyncReconciliationPage> createState() => _SyncReconciliationPageState();
}

class _SyncReconciliationPageState extends State<SyncReconciliationPage> {
  bool _loading = false;
  String? _error;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      drawer: const AppDrawer(),
      appBar: AppBar(title: const Text('Resolver sincronizacao')),
      body: ValueListenableBuilder<PendingReconciliation?>(
        valueListenable: AppServices.syncService.pendingReconciliationListenable,
        builder: (context, pending, _) {
          if (pending == null) {
            return const Center(
              child: Text('Nenhuma reconciliacao pendente.'),
            );
          }

          return ListView(
            padding: const EdgeInsets.all(16),
            children: [
              const Text(
                'Este aparelho ja tem dados locais e a nuvem tambem ja possui orcamentos para essa conta.',
              ),
              const SizedBox(height: 16),
              _SummaryCard(
                title: 'Dados locais',
                count: pending.localBudgetCount,
                primaryBudgetCode: pending.localPrimaryBudget?.codigo,
              ),
              const SizedBox(height: 12),
              _SummaryCard(
                title: 'Dados da nuvem',
                count: pending.remoteBudgetCount,
                primaryBudgetCode: pending.remotePrimaryBudget?.codigo,
              ),
              if (_error != null) ...[
                const SizedBox(height: 12),
                Text(
                  _error!,
                  style: const TextStyle(color: Colors.red),
                ),
              ],
              const SizedBox(height: 24),
              ElevatedButton(
                onPressed: _loading ? null : _useCloud,
                child: _loading
                    ? const SizedBox(
                        width: 18,
                        height: 18,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Text('Usar dados da nuvem'),
              ),
              const SizedBox(height: 12),
              OutlinedButton(
                onPressed: _loading ? null : _importLocalAsNew,
                child: const Text('Importar meus dados locais como novos orcamentos'),
              ),
              const SizedBox(height: 12),
              TextButton(
                onPressed: _loading ? null : _cancel,
                child: const Text('Cancelar'),
              ),
            ],
          );
        },
      ),
    );
  }

  Future<void> _useCloud() async {
    await _runAction(() async {
      await AppServices.syncService.adoptRemoteBudgets();
      if (!mounted) {
        return;
      }
      Navigator.pushNamedAndRemoveUntil(context, '/', (route) => false);
    });
  }

  Future<void> _importLocalAsNew() async {
    await _runAction(() async {
      await AppServices.syncService.importLocalBudgetsAsNew();
      if (!mounted) {
        return;
      }
      Navigator.pushNamedAndRemoveUntil(context, '/', (route) => false);
    });
  }

  void _cancel() {
    Navigator.pushNamedAndRemoveUntil(context, '/', (route) => false);
  }

  Future<void> _runAction(Future<void> Function() action) async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      await action();
    } catch (error) {
      if (!mounted) {
        return;
      }
      setState(() {
        _error = error.toString().replaceFirst('Exception: ', '');
      });
    } finally {
      if (mounted) {
        setState(() {
          _loading = false;
        });
      }
    }
  }
}

class _SummaryCard extends StatelessWidget {
  const _SummaryCard({
    required this.title,
    required this.count,
    this.primaryBudgetCode,
  });

  final String title;
  final int count;
  final String? primaryBudgetCode;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: ListTile(
        title: Text(title),
        subtitle: Text(
          primaryBudgetCode == null
              ? '$count orcamento(s)'
              : '$count orcamento(s) • principal: $primaryBudgetCode',
        ),
      ),
    );
  }
}
