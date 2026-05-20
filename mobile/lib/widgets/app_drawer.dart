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
              final target = AppServices.authService.currentTarget;
              final title = session?.userName ?? 'Modo local';
              final subtitle = session == null
                  ? 'Sem conta conectada'
                  : target == null
                      ? '${session.userEmail}\nLocal only'
                      : '${session.userEmail}\n${target.name}';

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
                      subtitle: Text(
                        _subtitleForStatus(
                          snapshot: syncState,
                          session: AppServices.authService.currentSession,
                          target: AppServices.authService.currentTarget,
                        ),
                      ),
                      onTap: () {
                        final session = AppServices.authService.currentSession;
                        final target = AppServices.authService.currentTarget;

                        if (session == null) {
                          Navigator.pushNamed(context, '/login');
                          return;
                        }

                        if (target == null) {
                          Navigator.pushNamed(context, '/company-selection');
                          return;
                        }

                        if (syncState.status == SyncStatus.reconciliationRequired) {
                          Navigator.pushNamed(context, '/sync-reconciliation');
                          return;
                        }

                        AppServices.syncService.forceSync();
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
                        title: const Text('Entrar ou criar conta'),
                        onTap: () {
                          Navigator.pushNamed(context, '/login');
                        },
                      );
                    }

                    return ListTile(
                      leading: const Icon(Icons.business),
                      title: Text(
                        AppServices.authService.currentTarget == null
                            ? 'Escolher empresa ou workspace'
                            : 'Trocar empresa ou workspace',
                      ),
                      onTap: () {
                        Navigator.pushNamed(context, '/company-selection');
                      },
                    );
                  },
                ),
                ValueListenableBuilder<AuthSession?>(
                  valueListenable: AppServices.authService.sessionListenable,
                  builder: (context, session, _) {
                    if (session == null) {
                      return const SizedBox.shrink();
                    }

                    return ListTile(
                      leading: const Icon(Icons.logout),
                      title: const Text('Sair da sincronizacao'),
                      onTap: () async {
                        await AppServices.scopeService.signOut();
                        if (context.mounted) {
                          Navigator.pushNamedAndRemoveUntil(
                            context,
                            '/',
                            (route) => false,
                          );
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

  String _subtitleForStatus({
    required SyncStateSnapshot snapshot,
    required AuthSession? session,
    required ActiveCloudTarget? target,
  }) {
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
        if (session == null) {
          return 'Modo guest/local only. Toque para entrar.';
        }
        if (target == null) {
          return 'Conta conectada sem empresa selecionada.';
        }
        return 'Uso local somente neste escopo.';
    }
  }
}
