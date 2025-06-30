import 'package:orcamento_app/utils.dart';
import 'package:flutter/material.dart';
import 'package:hive/hive.dart';
import 'package:intl/intl.dart';
import '../models/movimentacao.dart';
import '../models/orcamento.dart';
import 'lista_orcamentos_page.dart';
import 'criar_orcamento_page.dart';
import '../widgets/app_drawer.dart';

class ResumoOrcamentoPage extends StatefulWidget {
  final Orcamento orcamento; // Orçamento passado por parâmetro

  const ResumoOrcamentoPage({Key? key, required this.orcamento})
      : super(key: key);

  @override
  State<ResumoOrcamentoPage> createState() => _ResumoOrcamentoPageState();
}

class _ResumoOrcamentoPageState extends State<ResumoOrcamentoPage> {
  late Box<Orcamento> box;

  @override
  void initState() {
    super.initState();
    box = Hive.box<Orcamento>('orcamentos');
  }

  // Função auxiliar para converter status em string
  String _statusToString(StatusOrcamento status) {
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
    final orcamento = widget.orcamento;
    final bool isActive = orcamento.status == StatusOrcamento.ativo;
    final movimentacoes = orcamento.movimentacoes;
    final movimentacoesAgrupadas = <String, List<Movimentacao>>{};
    for (var mov in movimentacoes) {
      final dataFormatada = DateFormat('dd/MM/yyyy').format(mov.data);
      movimentacoesAgrupadas.putIfAbsent(dataFormatada, () => []).add(mov);
    }
    final diasOrdenados = movimentacoesAgrupadas.keys.toList()
      ..sort((a, b) => DateFormat('dd/MM/yyyy')
          .parse(b)
          .compareTo(DateFormat('dd/MM/yyyy').parse(a)));
    final hojeFormatado = DateFormat('dd/MM/yyyy').format(dataDeTrabalhoAtual);

    // Cálculo da mensagem amigável (para orçamentos ativos)
    String friendlyMessage = "";
    Color friendlyColor = Colors.black;
    if (isActive) {
      if (orcamento.tipo == TipoOrcamento.gasto) {
        double gastosHoje = orcamento.gastosDeHoje();
        double dailyBudget = orcamento.orcamentoDiarioAtual;
        double difference = dailyBudget - gastosHoje;
        if (difference > 0) {
          friendlyMessage =
              "Hoje estou economizando R\$ ${difference.toStringAsFixed(2)}";
          friendlyColor = Colors.green;
        } else if (difference == 0) {
          friendlyMessage = "Hoje atingi meu limite de gasto";
          friendlyColor = Colors.amber;
        } else {
          friendlyMessage =
              "Hoje gastei R\$ ${(-difference).toStringAsFixed(2)} além do previsto";
          friendlyColor = Colors.red;
        }
      } else {
        double entradasHoje = orcamento.movimentacoes.where((m) {
          final hoje = dataDeTrabalhoAtual;
          return m.tipo == TipoMovimentacao.entrada &&
              m.data.year == hoje.year &&
              m.data.month == hoje.month &&
              m.data.day == hoje.day;
        }).fold(0.0, (sum, m) => sum + m.valor);
        double dailyTarget = orcamento.orcamentoDiarioAtual;
        double diff = entradasHoje - dailyTarget;
        if (diff < 0) {
          friendlyMessage =
              "Hoje ainda preciso guardar R\$ ${(-diff).toStringAsFixed(2)}";
          friendlyColor = Colors.red;
        } else if (diff == 0) {
          friendlyMessage = "Hoje atingi minha meta de economia";
          friendlyColor = Colors.green;
        } else {
          friendlyMessage =
              "Hoje guardei R\$ ${diff.toStringAsFixed(2)} a mais que o planejado";
          friendlyColor = Colors.green;
        }
      }
    }

    // Previsão para amanhã (utilizando o getter do model)
    String forecastMessage =
        "Projeção para amanhã: R\$ ${orcamento.previsaoOrcamentoDiarioAmanha.toStringAsFixed(2)}";

    return Scaffold(
      drawer: const AppDrawer(),
      appBar: AppBar(
        title: Row(
          children: [
            Text(
              "Orçamento ${orcamento.codigo}",
              style: const TextStyle(fontSize: 20),
            ),
            const SizedBox(width: 8),
            // Se ativo e de trabalho, mostra o chip "Orçamento de Trabalho"
            if (isActive && orcamento.isTrabalho)
              Chip(
                label: const Text(
                  "Orçamento de Trabalho",
                  style: TextStyle(fontSize: 12, color: Colors.white),
                ),
                backgroundColor: Theme.of(context).colorScheme.primary,
              )
            // Se inativo, mostra o chip com o status, em preto e branco
            else if (!isActive)
              Chip(
                label: Text(
                  _statusToString(orcamento.status),
                  style: const TextStyle(fontSize: 12, color: Colors.white),
                ),
                backgroundColor: Colors.black,
              ),
          ],
        ),
        actions: [
          PopupMenuButton<String>(
            tooltip: "Mais ações",
            onSelected: (value) => _handleSecondaryAction(value, orcamento),
            itemBuilder: (context) => [
              const PopupMenuItem(
                value: "clonar",
                child: Text("Clonar"),
              ),
              if (isActive)
                PopupMenuItem(
                  value: "arquivar",
                  child: const Text("Arquivar"),
                )
              else
                PopupMenuItem(
                  value: "reativar",
                  child: const Text("Reativar"),
                ),
              if (isActive && !orcamento.isTrabalho)
                const PopupMenuItem(
                  value: "definir_trabalho",
                  child: Text("Definir como orçamento de trabalho"),
                ),
              const PopupMenuItem(
                value: "excluir",
                child: Text("Excluir"),
              ),
            ],
          ),
        ],
      ),
      body: SingleChildScrollView(
        child: Padding(
          padding: const EdgeInsets.all(16.0),
          child: isActive
              ? Column(
                  children: [
                    // Seção superior: mensagem amigável e previsão
                    Center(
                      child: Column(
                        children: [
                          Text(
                            friendlyMessage,
                            style: TextStyle(
                                fontSize: 24,
                                fontWeight: FontWeight.bold,
                                color: friendlyColor),
                            textAlign: TextAlign.center,
                          ),
                          const SizedBox(height: 8),
                          Text(
                            forecastMessage,
                            style:
                                TextStyle(fontSize: 18, color: friendlyColor),
                            textAlign: TextAlign.center,
                          ),
                        ],
                      ),
                    ),
                    const SizedBox(height: 16),
                    // Ações primárias: botões "Gastar" e "Guardar"
                    Row(
                      mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                      children: [
                        ElevatedButton.icon(
                          onPressed: () {
                            Navigator.pushNamed(
                              context,
                              '/movimentacao',
                              arguments: {
                                'orcamento': orcamento,
                                'tipoFixo': TipoMovimentacao.saida,
                              },
                            ).then((_) => setState(() {}));
                          },
                          icon: const Icon(Icons.arrow_downward,
                              color: Colors.red),
                          label: const Text("Gastar"),
                        ),
                        ElevatedButton.icon(
                          onPressed: () {
                            Navigator.pushNamed(
                              context,
                              '/movimentacao',
                              arguments: {
                                'orcamento': orcamento,
                                'tipoFixo': TipoMovimentacao.entrada,
                              },
                            ).then((_) => setState(() {}));
                          },
                          icon: const Icon(Icons.arrow_upward,
                              color: Colors.green),
                          label: const Text("Guardar"),
                        ),
                      ],
                    ),
                    const SizedBox(height: 16),
                    _buildDetailsSection(isActive),
                  ],
                )
              : _buildDetailsSection(isActive),
        ),
      ),
    );
  }

  Widget _buildDetailsSection(bool isActive) {
    final orcamento = widget.orcamento;
    final movimentacoes = orcamento.movimentacoes;
    final movimentacoesAgrupadas = <String, List<Movimentacao>>{};
    for (var mov in movimentacoes) {
      final dataFormatada = DateFormat('dd/MM/yyyy').format(mov.data);
      movimentacoesAgrupadas.putIfAbsent(dataFormatada, () => []).add(mov);
    }
    final diasOrdenados = movimentacoesAgrupadas.keys.toList()
      ..sort((a, b) => DateFormat('dd/MM/yyyy')
          .parse(b)
          .compareTo(DateFormat('dd/MM/yyyy').parse(a)));
    final hojeFormatado = DateFormat('dd/MM/yyyy').format(dataDeTrabalhoAtual);

    return ExpansionTile(
      title: const Text("Detalhes"),
      initiallyExpanded: !isActive ? true : false,
      children: [
        Card(
          elevation: 2,
          margin: const EdgeInsets.all(0),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
            side: BorderSide.none,
          ),
          child: Padding(
            padding: const EdgeInsets.all(16.0),
            child: Row(
              children: [
                // Coluna Inicial
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        "Inicial",
                        style: TextStyle(
                            fontWeight: FontWeight.bold, fontSize: 16),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        "Saldo: R\$ ${orcamento.valorInicial.toStringAsFixed(2)}",
                        style: const TextStyle(fontSize: 16),
                      ),
                      Text(
                        "Dias: ${orcamento.diasTotais}",
                        style: const TextStyle(fontSize: 16),
                      ),
                      Text(
                        "Orçamento diário: R\$ ${orcamento.orcamentoDiarioInicial.toStringAsFixed(2)}",
                        style: const TextStyle(fontSize: 16),
                      ),
                    ],
                  ),
                ),
                // Coluna Atual
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      const Text(
                        "Atual",
                        style: TextStyle(
                            fontWeight: FontWeight.bold, fontSize: 16),
                      ),
                      const SizedBox(height: 8),
                      Text(
                        "Saldo: R\$ ${orcamento.saldoAtual.toStringAsFixed(2)}",
                        style: const TextStyle(fontSize: 16),
                      ),
                      Text(
                        "Dias: ${orcamento.diasRestantes}",
                        style: const TextStyle(fontSize: 16),
                      ),
                      Text(
                        "Orçamento diário: R\$ ${orcamento.orcamentoDiarioAtual.toStringAsFixed(2)}",
                        style: const TextStyle(fontSize: 16),
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),
        // Lista de movimentações agrupadas por dia
        ...diasOrdenados.map((dia) {
          final lista = movimentacoesAgrupadas[dia]!;
          final isHoje = dia == hojeFormatado;
          double entradas = 0.0;
          double saidas = 0.0;
          for (var mov in lista) {
            if (mov.tipo == TipoMovimentacao.entrada) {
              entradas += mov.valor;
            } else {
              saidas += mov.valor;
            }
          }
          final saldoDia = entradas - saidas;
          final resultadoBom = orcamento.tipo == TipoOrcamento.gasto
              ? saidas <= orcamento.orcamentoDiarioAtual
              : saldoDia >= orcamento.orcamentoDiarioAtual;
          final corTotal = resultadoBom ? Colors.green : Colors.red;
          final textoResumo = orcamento.tipo == TipoOrcamento.gasto
              ? 'Total do dia: R\$ ${saidas.toStringAsFixed(2)}'
              : 'Total economizado: R\$ ${saldoDia.toStringAsFixed(2)}';
          return Card(
            elevation: 2,
            margin: const EdgeInsets.symmetric(vertical: 8),
            shape: RoundedRectangleBorder(
              borderRadius: BorderRadius.circular(12),
              side: BorderSide.none,
            ),
            child: ExpansionTile(
              title: Text(
                isHoje ? 'Movimentos de hoje' : 'Movimentos do dia $dia',
                style:
                    const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
              ),
              initiallyExpanded: isHoje,
              children: [
                ...lista.reversed.map((mov) => ListTile(
                      leading: Icon(
                        mov.tipo == TipoMovimentacao.entrada
                            ? Icons.arrow_upward
                            : Icons.arrow_downward,
                        color: mov.tipo == TipoMovimentacao.entrada
                            ? Colors.green
                            : Colors.red,
                      ),
                      title: Text(
                        'R\$ ${mov.valor.toStringAsFixed(2)}',
                        style: TextStyle(
                            fontWeight: FontWeight.w500,
                            color: mov.tipo == TipoMovimentacao.entrada
                                ? Colors.green
                                : Colors.red),
                      ),
                      subtitle: Text(mov.tipo == TipoMovimentacao.entrada
                          ? 'Entrada'
                          : 'Saída'),
                    )),
                Padding(
                  padding:
                      const EdgeInsets.only(left: 16.0, bottom: 8.0, top: 8.0),
                  child: Text(
                    textoResumo,
                    style:
                        TextStyle(fontWeight: FontWeight.bold, color: corTotal),
                  ),
                )
              ],
            ),
          );
        }).toList(),
      ],
    );
  }

  void _handleSecondaryAction(String action, Orcamento orcamento) async {
    if (action == "clonar") {
      Navigator.pushNamed(context, '/criarClone', arguments: orcamento);
    } else if (action == "arquivar") {
      final confirm = await _showConfirmationDialog(
          'Arquivar', 'Tem certeza que deseja arquivar este orçamento?');
      if (confirm) {
        orcamento.archive();
        box.put(orcamento.id, orcamento);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Orçamento arquivado.'),
            duration: Duration(seconds: 2),
          ),
        );
        setState(() {});
      }
    } else if (action == "reativar") {
      final confirm = await _showConfirmationDialog(
          'Reativar', 'Tem certeza que deseja reativar este orçamento?');
      if (confirm) {
        orcamento.reactivate();
        box.put(orcamento.id, orcamento);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Orçamento reativado.'),
            duration: Duration(seconds: 2),
          ),
        );
        setState(() {});
      }
    } else if (action == "definir_trabalho") {
      final confirm = await _showConfirmationDialog('Definir',
          'Tem certeza que deseja definir este orçamento como de trabalho?');
      if (confirm) {
        // Desmarca os demais orçamentos ativos que já estão definidos como de trabalho
        for (var element in box.values) {
          if (element is Orcamento) {
            if (element.status == StatusOrcamento.ativo && element.isTrabalho) {
              element.isTrabalho = false;
              box.put(element.id, element);
            }
          }
        }
        orcamento.isTrabalho = true;
        box.put(orcamento.id, orcamento);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Orçamento definido como de trabalho.'),
            duration: Duration(seconds: 2),
          ),
        );
        setState(() {});
      }
    } else if (action == "excluir") {
      final confirm = await _showConfirmationDialog(
          'Excluir', 'Tem certeza que deseja excluir este orçamento?');
      if (confirm) {
        orcamento.exclude();
        box.put(orcamento.id, orcamento);
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(
            content: Text('Orçamento excluído.'),
            duration: Duration(seconds: 2),
          ),
        );
        Navigator.pushReplacementNamed(context, '/lista');
      }
    }
  }

  Future<bool> _showConfirmationDialog(String title, String message) async {
    return await showDialog<bool>(
          context: context,
          builder: (context) => AlertDialog(
            title: Text(title),
            content: Text(message),
            actions: [
              TextButton(
                onPressed: () => Navigator.pop(context, false),
                child: const Text('Cancelar'),
              ),
              TextButton(
                onPressed: () => Navigator.pop(context, true),
                child: const Text('Confirmar'),
              ),
            ],
          ),
        ) ??
        false;
  }
}
