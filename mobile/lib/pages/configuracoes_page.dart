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
              return Card(
                child: ListTile(
                  leading: const Icon(Icons.person),
                  title: Text(session?.userName ?? 'Modo guest'),
                  subtitle: Text(
                    session?.userEmail ?? 'Uso local/offline sem conta conectada',
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
                  title: Text('Status: ${syncState.status.name}'),
                  subtitle: Text(
                    syncState.lastSyncAt == null
                        ? (syncState.status == SyncStatus.reconciliationRequired
                            ? 'Reconciliacao pendente antes de qualquer sync.'
                            : (syncState.lastSyncError ?? 'Nenhuma sincronizacao realizada ainda'))
                        : 'Ultima sincronizacao em ${DateFormat('dd/MM/yyyy HH:mm').format(syncState.lastSyncAt!.toLocal())}',
                  ),
                  trailing: TextButton(
                    onPressed: AppServices.authService.isAuthenticated
                        ? () {
                            if (syncState.status ==
                                SyncStatus.reconciliationRequired) {
                              Navigator.pushNamed(context, '/sync-reconciliation');
                            } else {
                              AppServices.syncService.forceSync();
                            }
                          }
                        : null,
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
        ],
      ),
    );
  }
}
