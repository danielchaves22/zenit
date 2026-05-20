import 'package:flutter/material.dart';

import '../services/app_services.dart';
import '../services/auth_service.dart';
import '../services/sync_state.dart';

class CompanySelectionPage extends StatefulWidget {
  const CompanySelectionPage({super.key});

  @override
  State<CompanySelectionPage> createState() => _CompanySelectionPageState();
}

class _CompanySelectionPageState extends State<CompanySelectionPage> {
  bool _loading = false;
  String? _error;

  @override
  Widget build(BuildContext context) {
    final session = AppServices.authService.currentSession;
    if (session == null) {
      return Scaffold(
        appBar: AppBar(title: const Text('Escolher empresa')),
        body: const Center(
          child: Text('Sua sessao expirou. Entre novamente.'),
        ),
      );
    }

    return Scaffold(
      appBar: AppBar(title: const Text('Escolher empresa ou workspace')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          Text(
            'Conta conectada: ${session.userEmail}',
            style: Theme.of(context).textTheme.titleMedium,
          ),
          const SizedBox(height: 8),
          const Text(
            'Selecione onde deseja sincronizar seus orcamentos. Voce tambem pode continuar autenticado e usar apenas o modo local.',
          ),
          if (_error != null) ...[
            const SizedBox(height: 12),
            Text(
              _error!,
              style: const TextStyle(color: Colors.red),
            ),
          ],
          const SizedBox(height: 24),
          if (session.availableCompanies.isNotEmpty) ...[
            const Text(
              'Empresas com Zenit Cash',
              style: TextStyle(fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 12),
            ...session.availableCompanies.map(_buildCompanyTile),
            const SizedBox(height: 16),
          ],
          OutlinedButton.icon(
            onPressed: _loading ? null : _selectPersonalWorkspace,
            icon: const Icon(Icons.cloud_sync),
            label: const Text('Criar workspace de orcamento'),
          ),
          const SizedBox(height: 12),
          TextButton(
            onPressed: _loading ? null : _continueLocalOnly,
            child: const Text('Agora nao'),
          ),
        ],
      ),
    );
  }

  Widget _buildCompanyTile(AuthCompanyOption company) {
    return Card(
      child: ListTile(
        leading: const Icon(Icons.business),
        title: Text(company.name),
        subtitle: Text(company.isDefault ? 'Empresa padrao' : company.role),
        trailing: _loading
            ? const SizedBox(
                width: 18,
                height: 18,
                child: CircularProgressIndicator(strokeWidth: 2),
              )
            : const Icon(Icons.chevron_right),
        onTap: _loading ? null : () => _selectExistingCompany(company),
      ),
    );
  }

  Future<void> _selectExistingCompany(AuthCompanyOption company) async {
    await _runSelection(
      () => AppServices.scopeService.selectExistingCompany(company.id),
    );
  }

  Future<void> _selectPersonalWorkspace() async {
    await _runSelection(
      AppServices.scopeService.selectPersonalWorkspace,
    );
  }

  Future<void> _continueLocalOnly() async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      await AppServices.scopeService.useLocalOnly();
      if (!mounted) {
        return;
      }
      Navigator.pushNamedAndRemoveUntil(context, '/', (route) => false);
    } catch (error) {
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

  Future<void> _runSelection(Future<bool> Function() action) async {
    setState(() {
      _loading = true;
      _error = null;
    });

    try {
      final requiresReconciliation = await action();
      if (!mounted) {
        return;
      }

      if (requiresReconciliation ||
          AppServices.syncService.stateListenable.value.status ==
              SyncStatus.reconciliationRequired) {
        Navigator.pushReplacementNamed(context, '/sync-reconciliation');
        return;
      }

      Navigator.pushNamedAndRemoveUntil(context, '/', (route) => false);
    } catch (error) {
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
