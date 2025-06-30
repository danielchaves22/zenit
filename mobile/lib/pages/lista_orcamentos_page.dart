import 'package:flutter/material.dart';
import 'package:flutter_speed_dial/flutter_speed_dial.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:orcamento_app/models/orcamento.dart';
import 'package:orcamento_app/pages/criar_orcamento_page.dart';
import 'package:orcamento_app/pages/lista_orcamentos_inativos_page.dart';
import 'package:orcamento_app/pages/resumo_orcamento_page.dart';
import 'package:orcamento_app/widgets/app_drawer.dart';

class ListaOrcamentosPage extends StatefulWidget {
  const ListaOrcamentosPage({Key? key}) : super(key: key);

  @override
  _ListaOrcamentosPageState createState() => _ListaOrcamentosPageState();
}

class _ListaOrcamentosPageState extends State<ListaOrcamentosPage> {
  late Box<Orcamento> box;

  @override
  void initState() {
    super.initState();
    box = Hive.box<Orcamento>('orcamentos');
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      drawer: const AppDrawer(),
      appBar: AppBar(
        title: const Text('Orçamentos Ativos'),
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
        valueListenable: box.listenable(),
        builder: (context, Box<Orcamento> box, _) {
          final ativos = box.values
              .where((orc) => orc.status == StatusOrcamento.ativo)
              .toList();

          if (ativos.isEmpty) {
            return const Center(child: Text('Nenhum orçamento ativo.'));
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
                      Icon(iconTipo,
                          color: Theme.of(context).colorScheme.primary),
                      const SizedBox(width: 8),
                      Expanded(
                        child: Text(
                          orcamento.codigo,
                          style: const TextStyle(
                              fontWeight: FontWeight.bold, fontSize: 16),
                        ),
                      ),
                      if (orcamento.isTrabalho)
                        Chip(
                          label: const Text("Orçamento de Trabalho",
                              style:
                                  TextStyle(fontSize: 12, color: Colors.white)),
                          backgroundColor:
                              Theme.of(context).colorScheme.primary,
                        ),
                    ],
                  ),
                  trailing: const Icon(Icons.arrow_forward_ios),
                  onTap: () {
                    Navigator.pushReplacementNamed(context, '/resumo',
                        arguments: orcamento);
                  },
                ),
              );
            },
          );
        },
      ),
      // Versão com SpeedDial: botões suspensos ao redor do FAB
      floatingActionButton: SpeedDial(
        /// Usa um ícone "+" quando fechado
        icon: Icons.add,

        /// Quando aberto, mostra o ícone "X"
        activeIcon: Icons.close,

        /// Mantém o botão redondo com o shape padrão
        shape: const CircleBorder(),

        /// Define as cores conforme o estilo anterior (ajuste conforme seu gosto)
        backgroundColor: Theme.of(context)
            .colorScheme
            .primary, // Exemplo: azul (pode ser substituído pela cor antiga)
        foregroundColor: Colors.white,

        /// Configura a opacidade do overlay (opcional)
        overlayColor: Colors.black,
        overlayOpacity: 0.2,

        children: [
          SpeedDialChild(
            child: const Icon(Icons.money),
            backgroundColor: Colors.red,
            label: "Gasto",
            onTap: () {
              Future.delayed(const Duration(milliseconds: 200), () {
                Navigator.pushNamed(
                  context,
                  '/criar',
                  arguments: {
                    "tipoFixo": TipoOrcamento.gasto,
                  },
                );
              });
            },
          ),
          SpeedDialChild(
            child: const Icon(Icons.savings),
            backgroundColor: Colors.green,
            label: "Economia",
            onTap: () {
              Future.delayed(const Duration(milliseconds: 200), () {
                Navigator.pushNamed(
                  context,
                  '/criar',
                  arguments: {
                    "tipoFixo": TipoOrcamento.economia,
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
