import 'package:flutter/material.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:intl/intl.dart';

import '../models/movimentacao.dart';
import '../models/orcamento.dart';
import '../services/app_services.dart';
import '../utils.dart';
import '../widgets/app_drawer.dart';

class ResumoOrcamentoPage extends StatelessWidget {
  const ResumoOrcamentoPage({super.key, required this.orcamento});

  final Orcamento orcamento;

  @override
  Widget build(BuildContext context) {
    final box = AppServices.budgetRepository.listenableBox;

    return ValueListenableBuilder(
      valueListenable: box.listenable(),
      builder: (context, _, __) {
        final current = box.get(orcamento.id) ?? orcamento;
        final isActive = current.status == StatusOrcamento.ativo;

        return Scaffold(
          drawer: const AppDrawer(),
          appBar: AppBar(
            title: Row(
              children: [
                Text('Orcamento ${current.codigo}', style: const TextStyle(fontSize: 20)),
                const SizedBox(width: 8),
                if (isActive && current.isTrabalho)
                  Chip(
                    label: const Text(
                      'Orcamento de Trabalho',
                      style: TextStyle(fontSize: 12, color: Colors.white),
                    ),
                    backgroundColor: Theme.of(context).colorScheme.primary,
                  )
                else if (!isActive)
                  Chip(
                    label: Text(
                      _statusToString(current.status),
                      style: const TextStyle(fontSize: 12, color: Colors.white),
                    ),
                    backgroundColor: Colors.black,
                  ),
              ],
            ),
            actions: [
              PopupMenuButton<String>(
                tooltip: 'Mais acoes',
                onSelected: (value) => _handleSecondaryAction(context, value, current),
                itemBuilder: (context) => [
                  const PopupMenuItem(
                    value: 'clonar',
                    child: Text('Clonar'),
                  ),
                  if (isActive)
                    const PopupMenuItem(
                      value: 'arquivar',
                      child: Text('Arquivar'),
                    )
                  else
                    const PopupMenuItem(
                      value: 'reativar',
                      child: Text('Reativar'),
                    ),
                  if (isActive && !current.isTrabalho)
                    const PopupMenuItem(
                      value: 'definir_trabalho',
                      child: Text('Definir como orcamento de trabalho'),
                    ),
                  const PopupMenuItem(
                    value: 'excluir',
                    child: Text('Excluir'),
                  ),
                ],
              ),
            ],
          ),
          body: SingleChildScrollView(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: isActive
                  ? Column(
                      children: [
                        _buildHeadline(context, current),
                        const SizedBox(height: 16),
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                          children: [
                            ElevatedButton.icon(
                              onPressed: () {
                                Navigator.pushNamed(
                                  context,
                                  '/movimentacao',
                                  arguments: {
                                    'orcamento': current,
                                    'tipoFixo': TipoMovimentacao.saida,
                                  },
                                );
                              },
                              icon: const Icon(Icons.arrow_downward, color: Colors.red),
                              label: const Text('Gastar'),
                            ),
                            ElevatedButton.icon(
                              onPressed: () {
                                Navigator.pushNamed(
                                  context,
                                  '/movimentacao',
                                  arguments: {
                                    'orcamento': current,
                                    'tipoFixo': TipoMovimentacao.entrada,
                                  },
                                );
                              },
                              icon: const Icon(Icons.arrow_upward, color: Colors.green),
                              label: const Text('Guardar'),
                            ),
                          ],
                        ),
                        const SizedBox(height: 16),
                        _buildDetailsSection(context, current, isActive),
                      ],
                    )
                  : _buildDetailsSection(context, current, isActive),
            ),
          ),
        );
      },
    );
  }

  Widget _buildHeadline(BuildContext context, Orcamento orcamento) {
    final message = _buildFriendlyMessage(orcamento);
    final forecastMessage =
        'Projecao para amanha: ${formatarMoeda(orcamento.previsaoOrcamentoDiarioAmanhaEmCentavos)}';

    return Center(
      child: Column(
        children: [
          Text(
            message.text,
            style: TextStyle(
              fontSize: 24,
              fontWeight: FontWeight.bold,
              color: message.color,
            ),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 8),
          Text(
            forecastMessage,
            style: TextStyle(fontSize: 18, color: message.color),
            textAlign: TextAlign.center,
          ),
        ],
      ),
    );
  }

  Widget _buildDetailsSection(BuildContext context, Orcamento orcamento, bool isActive) {
    final movimentacoesAgrupadas = <String, List<Movimentacao>>{};
    for (final movimentacao in orcamento.movimentacoes) {
      final dataFormatada = DateFormat('dd/MM/yyyy').format(movimentacao.data);
      movimentacoesAgrupadas.putIfAbsent(dataFormatada, () => []).add(movimentacao);
    }

    final diasOrdenados = movimentacoesAgrupadas.keys.toList()
      ..sort(
        (a, b) => DateFormat('dd/MM/yyyy').parse(b).compareTo(
              DateFormat('dd/MM/yyyy').parse(a),
            ),
      );
    final hojeFormatado = DateFormat('dd/MM/yyyy').format(dataDeTrabalhoAtual);

    return ExpansionTile(
      title: const Text('Detalhes'),
      initiallyExpanded: !isActive,
      children: [
        Card(
          elevation: 2,
          margin: EdgeInsets.zero,
          child: Padding(
            padding: const EdgeInsets.all(16),
            child: Row(
              children: [
                Expanded(
                  child: _buildBudgetColumn(
                    title: 'Inicial',
                    saldo: formatarMoeda(orcamento.valorInicialEmCentavos),
                    dias: '${orcamento.diasTotais}',
                    orcamentoDiario: formatarMoeda(orcamento.orcamentoDiarioInicialEmCentavos),
                  ),
                ),
                Expanded(
                  child: _buildBudgetColumn(
                    title: 'Atual',
                    saldo: formatarMoeda(orcamento.saldoAtualEmCentavos),
                    dias: '${orcamento.diasRestantes}',
                    orcamentoDiario: formatarMoeda(orcamento.orcamentoDiarioAtualEmCentavos),
                  ),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 16),
        ...diasOrdenados.map((dia) {
          final lista = movimentacoesAgrupadas[dia]!;
          final isHoje = dia == hojeFormatado;
          final entradas = lista
              .where((mov) => mov.tipo == TipoMovimentacao.entrada)
              .fold<int>(0, (sum, mov) => sum + mov.valorEmCentavos);
          final saidas = lista
              .where((mov) => mov.tipo == TipoMovimentacao.saida)
              .fold<int>(0, (sum, mov) => sum + mov.valorEmCentavos);
          final saldoDia = entradas - saidas;
          final resultadoBom = orcamento.tipo == TipoOrcamento.gasto
              ? saidas <= orcamento.orcamentoDiarioAtualEmCentavos
              : saldoDia >= orcamento.orcamentoDiarioAtualEmCentavos;
          final corTotal = resultadoBom ? Colors.green : Colors.red;
          final textoResumo = orcamento.tipo == TipoOrcamento.gasto
              ? 'Total do dia: ${formatarMoeda(saidas)}'
              : 'Total economizado: ${formatarMoeda(saldoDia)}';

          return Card(
            elevation: 2,
            margin: const EdgeInsets.symmetric(vertical: 8),
            child: ExpansionTile(
              title: Text(
                isHoje ? 'Movimentos de hoje' : 'Movimentos do dia $dia',
                style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16),
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
                        formatarMoeda(mov.valorEmCentavos),
                        style: TextStyle(
                          fontWeight: FontWeight.w500,
                          color: mov.tipo == TipoMovimentacao.entrada
                              ? Colors.green
                              : Colors.red,
                        ),
                      ),
                      subtitle: Text(
                        mov.descricao?.trim().isNotEmpty == true
                            ? mov.descricao!
                            : (mov.tipo == TipoMovimentacao.entrada ? 'Entrada' : 'Saida'),
                      ),
                    )),
                Padding(
                  padding: const EdgeInsets.only(left: 16, bottom: 8, top: 8),
                  child: Text(
                    textoResumo,
                    style: TextStyle(fontWeight: FontWeight.bold, color: corTotal),
                  ),
                ),
              ],
            ),
          );
        }),
      ],
    );
  }

  Widget _buildBudgetColumn({
    required String title,
    required String saldo,
    required String dias,
    required String orcamentoDiario,
  }) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: const TextStyle(fontWeight: FontWeight.bold, fontSize: 16)),
        const SizedBox(height: 8),
        Text('Saldo: $saldo', style: const TextStyle(fontSize: 16)),
        Text('Dias: $dias', style: const TextStyle(fontSize: 16)),
        Text('Orcamento diario: $orcamentoDiario', style: const TextStyle(fontSize: 16)),
      ],
    );
  }

  Future<void> _handleSecondaryAction(
    BuildContext context,
    String action,
    Orcamento orcamento,
  ) async {
    if (action == 'clonar') {
      Navigator.pushNamed(context, '/criarClone', arguments: orcamento);
      return;
    }

    if (action == 'arquivar') {
      final confirm = await _showConfirmationDialog(
        context,
        'Arquivar',
        'Tem certeza que deseja arquivar este orcamento?',
      );
      if (confirm) {
        await AppServices.budgetService.arquivar(orcamento);
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Orcamento arquivado.')),
          );
        }
      }
      return;
    }

    if (action == 'reativar') {
      final confirm = await _showConfirmationDialog(
        context,
        'Reativar',
        'Tem certeza que deseja reativar este orcamento?',
      );
      if (confirm) {
        await AppServices.budgetService.reativar(orcamento);
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Orcamento reativado.')),
          );
        }
      }
      return;
    }

    if (action == 'definir_trabalho') {
      final confirm = await _showConfirmationDialog(
        context,
        'Definir',
        'Tem certeza que deseja definir este orcamento como de trabalho?',
      );
      if (confirm) {
        await AppServices.budgetService.definirComoTrabalho(orcamento);
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Orcamento definido como de trabalho.')),
          );
        }
      }
      return;
    }

    if (action == 'excluir') {
      final confirm = await _showConfirmationDialog(
        context,
        'Excluir',
        'Tem certeza que deseja excluir este orcamento?',
      );
      if (confirm) {
        await AppServices.budgetService.excluir(orcamento);
        if (context.mounted) {
          ScaffoldMessenger.of(context).showSnackBar(
            const SnackBar(content: Text('Orcamento excluido.')),
          );
          Navigator.pushReplacementNamed(context, '/lista');
        }
      }
    }
  }

  Future<bool> _showConfirmationDialog(
    BuildContext context,
    String title,
    String message,
  ) async {
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

  String _statusToString(StatusOrcamento status) {
    switch (status) {
      case StatusOrcamento.arquivado:
        return 'Arquivado';
      case StatusOrcamento.expirado:
        return 'Expirado';
      case StatusOrcamento.excluido:
        return 'Excluido';
      default:
        return '';
    }
  }

  _FriendlyMessage _buildFriendlyMessage(Orcamento orcamento) {
    if (orcamento.tipo == TipoOrcamento.gasto) {
      final difference = orcamento.orcamentoDiarioAtualEmCentavos - orcamento.gastosDeHoje();
      if (difference > 0) {
        return _FriendlyMessage(
          'Hoje estou economizando ${formatarMoeda(difference)}',
          Colors.green,
        );
      }
      if (difference == 0) {
        return const _FriendlyMessage('Hoje atingi meu limite de gasto', Colors.amber);
      }
      return _FriendlyMessage(
        'Hoje gastei ${formatarMoeda(-difference)} alem do previsto',
        Colors.red,
      );
    }

    final diff = orcamento.entradasDeHoje() - orcamento.orcamentoDiarioAtualEmCentavos;
    if (diff < 0) {
      return _FriendlyMessage(
        'Hoje ainda preciso guardar ${formatarMoeda(-diff)}',
        Colors.red,
      );
    }
    if (diff == 0) {
      return const _FriendlyMessage('Hoje atingi minha meta de economia', Colors.green);
    }
    return _FriendlyMessage(
      'Hoje guardei ${formatarMoeda(diff)} a mais que o planejado',
      Colors.green,
    );
  }
}

class _FriendlyMessage {
  const _FriendlyMessage(this.text, this.color);

  final String text;
  final Color color;
}
