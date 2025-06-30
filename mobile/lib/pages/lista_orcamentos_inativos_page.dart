import 'package:flutter/material.dart';
import 'package:hive_flutter/hive_flutter.dart';
import '../models/orcamento.dart';
import '../widgets/app_drawer.dart';

class ListaOrcamentosInativosPage extends StatefulWidget {
  const ListaOrcamentosInativosPage({Key? key}) : super(key: key);

  @override
  _ListaOrcamentosInativosPageState createState() =>
      _ListaOrcamentosInativosPageState();
}

class _ListaOrcamentosInativosPageState
    extends State<ListaOrcamentosInativosPage> {
  late Box<Orcamento> box;

  @override
  void initState() {
    super.initState();
    box = Hive.box<Orcamento>('orcamentos');
  }

  // Função para converter o enum em string
  String statusToString(StatusOrcamento status) {
    switch (status) {
      case StatusOrcamento.arquivado:
        return 'Arquivado';
      case StatusOrcamento.expirado:
        return 'Expirado';
      case StatusOrcamento.excluido:
        return 'Excluído';
      default:
        return '';
    }
  }

  @override
  Widget build(BuildContext context) {
    final inativos = box.values
        .where((orc) =>
            orc.status == StatusOrcamento.arquivado ||
            orc.status == StatusOrcamento.expirado ||
            orc.status == StatusOrcamento.excluido)
        .toList();

    return Scaffold(
      appBar: AppBar(
        title: const Text('Orçamentos Inativos'),
        actions: [
          IconButton(
            onPressed: () {
              Navigator.pushReplacementNamed(context, '/lista');
            },
            icon: const Icon(Icons.arrow_back),
            tooltip: 'Voltar',
          ),
        ],
      ),
      drawer: const AppDrawer(), // Mantém o menu lateral
      body: inativos.isEmpty
          ? const Center(child: Text('Nenhum orçamento inativo.'))
          : ListView.builder(
              itemCount: inativos.length,
              itemBuilder: (context, index) {
                final orcamento = inativos[index];
                final iconTipo = orcamento.tipo == TipoOrcamento.gasto
                    ? Icons.money
                    : Icons.savings;
                return Card(
                  elevation: 2,
                  margin:
                      const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                  child: ListTile(
                    title: Row(
                      children: [
                        Icon(
                          iconTipo,
                          color: Colors.black,
                        ),
                        const SizedBox(width: 8),
                        Expanded(
                          child: Text(
                            '${orcamento.codigo}',
                            style: const TextStyle(
                                fontWeight: FontWeight.bold, fontSize: 16),
                          ),
                        ),
                        Chip(
                          label: Text(
                            statusToString(orcamento.status),
                            style: const TextStyle(color: Colors.white),
                          ),
                          backgroundColor: Colors.black,
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
            ),
    );
  }
}
