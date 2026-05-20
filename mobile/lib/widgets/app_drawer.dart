import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../services/app_services.dart';
import '../services/auth_service.dart';
import '../services/sync_state.dart';

class AppDrawer extends StatelessWidget {
  const AppDrawer({super.key});

  @override
  Widget build(BuildContext context) {
    return Drawer(
      child: Column(
        children: [
          ValueListenableBuilder<AuthSession?>(
            valueListenable: AppServices.authService.sessionListenable,
            builder: (context, session, _) {
              final title = session?.userName ?? 'Modo local';
              final subtitle = session?.userEmail ?? 'Sem sincronizacao';

              return UserAccountsDrawerHeader(
                accountName: Text(title),
                accountEmail: Text(subtitle),
                currentAccountPicture: const CircleAvatar(
                  child: Icon(Icons.person, size: 40),
                ),
                decoration: const BoxDecoration(
                  color: Colors.green,
                ),
              );
            },
          ),
          Expanded(
            child: ListView(
              children: [
                ListTile(
                  leading: const Icon(Icons.list),
                  title: const Text('Orcamentos'),
                  onTap: () {
                    Navigator.pushNamedAndRemoveUntil(context, '/lista', (route) => false);
                  },
                ),
                ListTile(
                  leading: const Icon(Icons.settings),
                  title: const Text('Configuracoes'),
                  onTap: () {
                    Navigator.pushNamed(context, '/configuracoes');
                  },
                ),
                const Divider(),
                ValueListenableBuilder<SyncStateSnapshot>(
                  valueListenable: AppServices.syncService.stateListenable,
                  builder: (context, syncState, _) {
                    return ListTile(
                      leading: Icon(_iconForStatus(syncState.status)),
                      title: const Text('Sincronizacao'),
                      subtitle: Text(_subtitleForStatus(syncState)),
                      onTap: () {
                        if (AppServices.authService.isAuthenticated) {
                          if (syncState.status == SyncStatus.reconciliationRequired) {
                            Navigator.pushNamed(context, '/sync-reconciliation');
                          } else {
                            AppServices.syncService.forceSync();
                          }
                        } else {
                          Navigator.pushNamed(context, '/login');
                        }
                      },
                    );
                  },
                ),
                ValueListenableBuilder<AuthSession?>(
                  valueListenable: AppServices.authService.sessionListenable,
                  builder: (context, session, _) {
                    if (session == null) {
                      return ListTile(
                        leading: const Icon(Icons.login),
                        title: const Text('Entrar para sincronizar'),
                        onTap: () {
                          Navigator.pushNamed(context, '/login');
                        },
                      );
                    }

                    return ListTile(
                      leading: const Icon(Icons.logout),
                      title: const Text('Sair da sincronizacao'),
                      onTap: () async {
                        await AppServices.authService.signOut();
                        if (context.mounted) {
                          Navigator.pop(context);
                        }
                      },
                    );
                  },
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  IconData _iconForStatus(SyncStatus status) {
    switch (status) {
      case SyncStatus.reconciliationRequired:
        return Icons.warning_amber_rounded;
      case SyncStatus.syncing:
        return Icons.sync;
      case SyncStatus.synced:
        return Icons.cloud_done;
      case SyncStatus.pending:
        return Icons.cloud_upload;
      case SyncStatus.error:
        return Icons.sync_problem;
      case SyncStatus.localOnly:
        return Icons.sync_disabled;
    }
  }

  String _subtitleForStatus(SyncStateSnapshot snapshot) {
    switch (snapshot.status) {
      case SyncStatus.reconciliationRequired:
        return 'Reconciliacao pendente. Toque para resolver.';
      case SyncStatus.syncing:
        return 'Sincronizando agora';
      case SyncStatus.synced:
        final formattedDate = snapshot.lastSyncAt == null
            ? 'agora'
            : DateFormat('dd/MM/yyyy HH:mm').format(snapshot.lastSyncAt!.toLocal());
        if (snapshot.lastConflictMessage != null) {
          return 'Sincronizado em $formattedDate. ${snapshot.lastConflictMessage}';
        }
        return 'Sincronizado em $formattedDate';
      case SyncStatus.pending:
        return 'Alteracoes locais pendentes';
      case SyncStatus.error:
        return snapshot.lastSyncError ?? 'Erro ao sincronizar. Toque para tentar de novo.';
      case SyncStatus.localOnly:
        return 'Modo guest/local only. Toque para entrar.';
    }
  }
}
