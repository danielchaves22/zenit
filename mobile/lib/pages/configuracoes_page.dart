import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../services/app_services.dart';
import '../services/auth_service.dart';
import '../services/sync_state.dart';
import '../widgets/app_drawer.dart';

class ConfiguracoesPage extends StatelessWidget {
  const ConfiguracoesPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      drawer: const AppDrawer(),
      appBar: AppBar(title: const Text('Configuracoes')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          ValueListenableBuilder<AuthSession?>(
            valueListenable: AppServices.authService.sessionListenable,
            builder: (context, session, _) {
              final target = AppServices.authService.currentTarget;
              return Card(
                child: ListTile(
                  leading: const Icon(Icons.person),
                  title: Text(session?.userName ?? 'Modo guest'),
                  subtitle: Text(
                    session == null
                        ? 'Uso local/offline sem conta conectada'
                        : target == null
                            ? '${session.userEmail}\nSem empresa selecionada'
                            : '${session.userEmail}\nSincronizando com ${target.name}',
                  ),
                ),
              );
            },
          ),
          const SizedBox(height: 12),
          ValueListenableBuilder<SyncStateSnapshot>(
            valueListenable: AppServices.syncService.stateListenable,
            builder: (context, syncState, _) {
              return Card(
                child: ListTile(
                  leading: const Icon(Icons.sync),
                  title: Text('Status: ${_statusLabel(syncState.status)}'),
                  subtitle: Text(
                    syncState.lastSyncAt == null
                        ? (syncState.status == SyncStatus.reconciliationRequired
                            ? 'Reconciliacao pendente antes de qualquer sync.'
                            : (syncState.lastSyncError ?? 'Nenhuma sincronizacao realizada ainda'))
                        : 'Ultima sincronizacao em ${DateFormat('dd/MM/yyyy HH:mm').format(syncState.lastSyncAt!.toLocal())}',
                  ),
                  trailing: TextButton(
                    onPressed: AppServices.authService.currentSession == null
                        ? null
                        : () {
                            if (AppServices.authService.currentTarget == null) {
                              Navigator.pushNamed(context, '/company-selection');
                              return;
                            }
                            if (syncState.status == SyncStatus.reconciliationRequired) {
                              Navigator.pushNamed(context, '/sync-reconciliation');
                              return;
                            }
                            AppServices.syncService.forceSync();
                          },
                    child: Text(
                      syncState.status == SyncStatus.reconciliationRequired
                          ? 'Resolver'
                          : 'Sincronizar',
                    ),
                  ),
                ),
              );
            },
          ),
          const SizedBox(height: 12),
          ValueListenableBuilder<int>(
            valueListenable: AppServices.syncService.pendingScopeCountListenable,
            builder: (context, pendingScopeCount, _) {
              return Card(
                child: ListTile(
                  leading: const Icon(Icons.storage),
                  title: const Text('Escopo atual'),
                  subtitle: Text(
                    'Scope: ${AppServices.budgetRepository.currentScopeId}\nPendencias em $pendingScopeCount escopo(s)',
                  ),
                ),
              );
            },
          ),
          const SizedBox(height: 12),
          ValueListenableBuilder<AuthSession?>(
            valueListenable: AppServices.authService.sessionListenable,
            builder: (context, session, _) {
              if (session == null) {
                return ElevatedButton(
                  onPressed: () {
                    Navigator.pushNamed(context, '/login');
                  },
                  child: const Text('Entrar ou criar conta'),
                );
              }

              return Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  OutlinedButton(
                    onPressed: () {
                      Navigator.pushNamed(context, '/company-selection');
                    },
                    child: Text(
                      AppServices.authService.currentTarget == null
                          ? 'Escolher empresa ou workspace'
                          : 'Trocar empresa ou workspace',
                    ),
                  ),
                  const SizedBox(height: 8),
                  TextButton(
                    onPressed: () async {
                      await AppServices.scopeService.useLocalOnly();
                      if (context.mounted) {
                        ScaffoldMessenger.of(context).showSnackBar(
                          const SnackBar(
                            content: Text('Modo local ativado para este aparelho.'),
                          ),
                        );
                      }
                    },
                    child: const Text('Continuar autenticado em local only'),
                  ),
                ],
              );
            },
          ),
        ],
      ),
    );
  }

  String _statusLabel(SyncStatus status) {
    switch (status) {
      case SyncStatus.localOnly:
        return 'local only';
      case SyncStatus.reconciliationRequired:
        return 'reconciliacao pendente';
      case SyncStatus.syncing:
        return 'sincronizando';
      case SyncStatus.synced:
        return 'sincronizado';
      case SyncStatus.pending:
        return 'pendente';
      case SyncStatus.error:
        return 'erro';
    }
  }
}
