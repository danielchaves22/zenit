import 'package:flutter/material.dart';
import 'package:flutter_speed_dial/flutter_speed_dial.dart';

import '../models/orcamento.dart';
import '../services/app_services.dart';
import '../widgets/app_drawer.dart';

class ListaOrcamentosPage extends StatelessWidget {
  const ListaOrcamentosPage({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      drawer: const AppDrawer(),
      appBar: AppBar(
        title: const Text('Orcamentos Ativos'),
        actions: [
          TextButton.icon(
            style: TextButton.styleFrom(
              foregroundColor: Colors.black,
            ),
            onPressed: () {
              Navigator.pushNamed(context, '/inativos');
            },
            icon: const Icon(Icons.list_alt),
            label: const Text('Inativos'),
          ),
        ],
      ),
      body: ValueListenableBuilder(
        valueListenable: AppServices.budgetRepository.currentBoxListenable,
        builder: (context, _, __) {
          final box = AppServices.budgetRepository.listenableBox;
          final ativos = box.values
              .where((orc) => orc.status == StatusOrcamento.ativo)
              .toList();

          if (ativos.isEmpty) {
            return const Center(child: Text('Nenhum orcamento ativo.'));
          }

          return ListView.builder(
            itemCount: ativos.length,
            itemBuilder: (context, index) {
              final orcamento = ativos[index];
              final iconTipo = orcamento.tipo == TipoOrcamento.gasto
                  ? Icons.money
                  : Icons.savings;
              return Card(
                elevation: 2,
                margin: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                child: ListTile(
                  title: Row(
                    children: [
                      Icon(
                        iconTipo,
                        color: Theme.of(context).colorScheme.primary,
                      ),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          orcamento.codigo,
                          style: const TextStyle(
                            fontWeight: FontWeight.bold,
                            fontSize: 16,
                          ),
                        ),
                      ),
                      if (orcamento.isTrabalho)
                        Chip(
                          label: const Text(
                            'Orcamento de Trabalho',
                            style: TextStyle(fontSize: 12, color: Colors.white),
                          ),
                          backgroundColor: Theme.of(context).colorScheme.primary,
                        ),
                    ],
                  ),
                  trailing: const Icon(Icons.arrow_forward_ios),
                  onTap: () {
                    Navigator.pushReplacementNamed(
                      context,
                      '/resumo',
                      arguments: orcamento,
                    );
                  },
                ),
              );
            },
          );
        },
      ),
      floatingActionButton: SpeedDial(
        icon: Icons.add,
        activeIcon: Icons.close,
        shape: const CircleBorder(),
        backgroundColor: Theme.of(context).colorScheme.primary,
        foregroundColor: Colors.white,
        overlayColor: Colors.black,
        overlayOpacity: 0.2,
        children: [
          SpeedDialChild(
            child: const Icon(Icons.money),
            backgroundColor: Colors.red,
            label: 'Gasto',
            onTap: () {
              Future.delayed(const Duration(milliseconds: 200), () {
                if (!context.mounted) {
                  return;
                }
                Navigator.pushNamed(
                  context,
                  '/criar',
                  arguments: {
                    'tipoFixo': TipoOrcamento.gasto,
                  },
                );
              });
            },
          ),
          SpeedDialChild(
            child: const Icon(Icons.savings),
            backgroundColor: Colors.green,
            label: 'Economia',
            onTap: () {
              Future.delayed(const Duration(milliseconds: 200), () {
                if (!context.mounted) {
                  return;
                }
                Navigator.pushNamed(
                  context,
                  '/criar',
                  arguments: {
                    'tipoFixo': TipoOrcamento.economia,
                  },
                );
              });
            },
          ),
        ],
      ),
    );
  }
}
