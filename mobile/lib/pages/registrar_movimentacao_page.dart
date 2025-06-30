import 'package:flutter/material.dart';
import 'package:hive/hive.dart';
import '../models/movimentacao.dart';
import '../models/orcamento.dart';
import '../models/tipo_distribuicao_entrada.dart';
import '../utils.dart';
import '../widgets/app_drawer.dart';

class RegistrarMovimentacaoPage extends StatefulWidget {
  final Orcamento orcamento;
  final TipoMovimentacao? tipoFixo;

  const RegistrarMovimentacaoPage({
    Key? key,
    required this.orcamento,
    this.tipoFixo,
  }) : super(key: key);

  @override
  State<RegistrarMovimentacaoPage> createState() =>
      _RegistrarMovimentacaoPageState();
}

class _RegistrarMovimentacaoPageState extends State<RegistrarMovimentacaoPage> {
  final _formKey = GlobalKey<FormState>();
  final _valorController = TextEditingController();
  final _descricaoController = TextEditingController();
  DateTime _data = dataDeTrabalhoAtual;
  late TipoMovimentacao _tipo;
  final _valorFocus = FocusNode();

  // Controle da distribuição de entrada (aplicável somente para orçamentos de GASTO)
  late TipoDistribuicaoEntrada _distribuicaoEntrada;

  @override
  void initState() {
    super.initState();
    // Se um tipo fixo for fornecido, utilize-o; senão, determine conforme o tipo do orçamento
    if (widget.tipoFixo != null) {
      _tipo = widget.tipoFixo!;
    } else {
      _tipo = widget.orcamento.tipo == TipoOrcamento.gasto
          ? TipoMovimentacao.saida
          : TipoMovimentacao.entrada;
    }
    // Configura a distribuição: se for entrada em orçamento de GASTO, usa o default global
    if (_tipo == TipoMovimentacao.entrada &&
        widget.orcamento.tipo == TipoOrcamento.gasto) {
      _distribuicaoEntrada = defaultDistribuicaoEntrada;
    } else {
      _distribuicaoEntrada = TipoDistribuicaoEntrada.principal;
    }
    // Foco no campo de valor
    WidgetsBinding.instance.addPostFrameCallback((_) {
      FocusScope.of(context).requestFocus(_valorFocus);
    });
  }

  @override
  void dispose() {
    _valorFocus.dispose();
    _valorController.dispose();
    _descricaoController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    // Exibe a opção de distribuição se for ENTRADA e o orçamento for de GASTO
    bool mostrarOpcaoDistribuicao = (_tipo == TipoMovimentacao.entrada) &&
        (widget.orcamento.tipo == TipoOrcamento.gasto);
    return Scaffold(
      drawer: const AppDrawer(),
      appBar: AppBar(title: const Text('Nova Movimentação')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Form(
          key: _formKey,
          child: ListView(
            children: [
              // Campo de Valor
              TextFormField(
                controller: _valorController,
                focusNode: _valorFocus,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: 'Valor'),
                validator: (value) =>
                    value == null || value.isEmpty ? 'Obrigatório' : null,
              ),
              const SizedBox(height: 12),
              // Campo Tipo: se tipoFixo foi passado, desabilita a alteração
              DropdownButtonFormField<TipoMovimentacao>(
                value: _tipo,
                items: TipoMovimentacao.values.map((tipo) {
                  return DropdownMenuItem(
                    value: tipo,
                    child: Text(tipo.name.toUpperCase()),
                  );
                }).toList(),
                onChanged: widget.tipoFixo != null
                    ? null
                    : (value) {
                        if (value != null) setState(() => _tipo = value);
                      },
                decoration: const InputDecoration(labelText: 'Tipo'),
              ),
              const SizedBox(height: 12),
              // Opção de distribuição para entrada em orçamento de GASTO
              if (mostrarOpcaoDistribuicao)
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Alocar em:',
                      style: TextStyle(fontWeight: FontWeight.bold),
                    ),
                    RadioListTile<TipoDistribuicaoEntrada>(
                      title: const Text('Saldo do orçamento'),
                      value: TipoDistribuicaoEntrada.principal,
                      groupValue: _distribuicaoEntrada,
                      onChanged: (value) {
                        if (value != null) {
                          setState(() {
                            _distribuicaoEntrada = value;
                          });
                        }
                      },
                    ),
                    RadioListTile<TipoDistribuicaoEntrada>(
                      title: const Text('Saldo extra do dia'),
                      value: TipoDistribuicaoEntrada.extra,
                      groupValue: _distribuicaoEntrada,
                      onChanged: (value) {
                        if (value != null) {
                          setState(() {
                            _distribuicaoEntrada = value;
                          });
                        }
                      },
                    ),
                  ],
                ),
              const SizedBox(height: 12),
              // Campo de Descrição (opcional)
              TextFormField(
                controller: _descricaoController,
                decoration:
                    const InputDecoration(labelText: 'Descrição (opcional)'),
              ),
              const SizedBox(height: 24),
              // Linha de botões: Cancelar e Salvar
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: [
                  ElevatedButton(
                    onPressed: () {
                      Navigator.pop(context);
                    },
                    child: const Text("Cancelar"),
                  ),
                  ElevatedButton(
                    onPressed: _salvar,
                    child: const Text("Salvar"),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  void _salvar() {
    if (_formKey.currentState?.validate() != true) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content:
              Text('Por favor, preencha o campo de valor para prosseguir.'),
          duration: Duration(seconds: 3),
        ),
      );
      return;
    }

    final valor = double.tryParse(_valorController.text) ?? 0.0;
    if (valor <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text('O valor deve ser maior que zero.'),
          duration: Duration(seconds: 3),
        ),
      );
      return;
    }

    final movimentacao = Movimentacao(
      id: DateTime.now().millisecondsSinceEpoch.toString(),
      data: _data,
      valor: valor,
      tipo: _tipo,
      descricao: _descricaoController.text,
      createdAt: dataDeTrabalhoAtual,
    );

    final box = Hive.box<Orcamento>('orcamentos');
    Orcamento orcamento = widget.orcamento;
    orcamento.movimentacoes.add(movimentacao);

    // Lógica para movimentação de ENTRADA:
    if (_tipo == TipoMovimentacao.entrada) {
      if (widget.orcamento.tipo == TipoOrcamento.gasto) {
        if (_distribuicaoEntrada == TipoDistribuicaoEntrada.extra) {
          orcamento.saldoExtraDoDia += valor;
        } else {
          orcamento.saldoAtual += valor;
          orcamento.incrementarOrcamentoDiario(valor);
        }
      } else {
        orcamento.saldoAtual += valor;
        recalcularOrcamentoDiarioAtual(orcamento);
      }
    } else if (_tipo == TipoMovimentacao.saida) {
      if (orcamento.saldoExtraDoDia >= valor) {
        orcamento.saldoExtraDoDia -= valor;
      } else {
        final restante = valor - orcamento.saldoExtraDoDia;
        orcamento.saldoExtraDoDia = 0;
        orcamento.saldoAtual -= restante;
      }
    }

    box.put(orcamento.id, orcamento);

    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Movimentação registrada com sucesso!'),
        duration: Duration(seconds: 2),
      ),
    );

    Navigator.pop(context);
  }
}
