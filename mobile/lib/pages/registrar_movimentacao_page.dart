import 'package:flutter/material.dart';

import '../models/movimentacao.dart';
import '../models/orcamento.dart';
import '../models/tipo_distribuicao_entrada.dart';
import '../services/app_services.dart';
import '../utils.dart';
import '../widgets/app_drawer.dart';

class RegistrarMovimentacaoPage extends StatefulWidget {
  const RegistrarMovimentacaoPage({
    super.key,
    required this.orcamento,
    this.tipoFixo,
  });

  final Orcamento orcamento;
  final TipoMovimentacao? tipoFixo;

  @override
  State<RegistrarMovimentacaoPage> createState() => _RegistrarMovimentacaoPageState();
}

class _RegistrarMovimentacaoPageState extends State<RegistrarMovimentacaoPage> {
  final _formKey = GlobalKey<FormState>();
  final _valorController = TextEditingController();
  final _descricaoController = TextEditingController();
  final _valorFocus = FocusNode();

  final DateTime _data = dataDeTrabalhoAtual;
  late TipoMovimentacao _tipo;
  late TipoDistribuicaoEntrada _distribuicaoEntrada;

  @override
  void initState() {
    super.initState();
    _tipo = widget.tipoFixo ??
        (widget.orcamento.tipo == TipoOrcamento.gasto
            ? TipoMovimentacao.saida
            : TipoMovimentacao.entrada);
    _distribuicaoEntrada = _tipo == TipoMovimentacao.entrada &&
            widget.orcamento.tipo == TipoOrcamento.gasto
        ? defaultDistribuicaoEntrada
        : TipoDistribuicaoEntrada.principal;

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
    final mostrarOpcaoDistribuicao =
        _tipo == TipoMovimentacao.entrada && widget.orcamento.tipo == TipoOrcamento.gasto;

    return Scaffold(
      drawer: const AppDrawer(),
      appBar: AppBar(title: const Text('Nova movimentacao')),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Form(
          key: _formKey,
          child: ListView(
            children: [
              TextFormField(
                controller: _valorController,
                focusNode: _valorFocus,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                decoration: const InputDecoration(labelText: 'Valor'),
                validator: (value) =>
                    value == null || value.trim().isEmpty ? 'Obrigatorio' : null,
              ),
              const SizedBox(height: 12),
              DropdownButtonFormField<TipoMovimentacao>(
                initialValue: _tipo,
                items: TipoMovimentacao.values.map((tipo) {
                  return DropdownMenuItem(
                    value: tipo,
                    child: Text(tipo.name.toUpperCase()),
                  );
                }).toList(),
                onChanged: widget.tipoFixo != null
                    ? null
                    : (value) {
                        if (value != null) {
                          setState(() {
                            _tipo = value;
                          });
                        }
                      },
                decoration: const InputDecoration(labelText: 'Tipo'),
              ),
              const SizedBox(height: 12),
              if (mostrarOpcaoDistribuicao)
                Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text(
                      'Alocar em:',
                      style: TextStyle(fontWeight: FontWeight.bold),
                    ),
                    RadioGroup<TipoDistribuicaoEntrada>(
                      groupValue: _distribuicaoEntrada,
                      onChanged: (value) {
                        if (value != null) {
                          setState(() {
                            _distribuicaoEntrada = value;
                          });
                        }
                      },
                      child: Column(
                        children: const [
                          RadioListTile<TipoDistribuicaoEntrada>(
                            title: Text('Saldo do orcamento'),
                            value: TipoDistribuicaoEntrada.principal,
                          ),
                          RadioListTile<TipoDistribuicaoEntrada>(
                            title: Text('Saldo extra do dia'),
                            value: TipoDistribuicaoEntrada.extra,
                          ),
                        ],
                      ),
                    ),
                  ],
                ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _descricaoController,
                decoration: const InputDecoration(labelText: 'Descricao (opcional)'),
              ),
              const SizedBox(height: 24),
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceEvenly,
                children: [
                  ElevatedButton(
                    onPressed: () => Navigator.pop(context),
                    child: const Text('Cancelar'),
                  ),
                  ElevatedButton(
                    onPressed: _salvar,
                    child: const Text('Salvar'),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _salvar() async {
    if (_formKey.currentState?.validate() != true) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Preencha o campo de valor para prosseguir.')),
      );
      return;
    }

    final valorEmCentavos = parseValorEmCentavos(_valorController.text);
    if (valorEmCentavos <= 0) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('O valor deve ser maior que zero.')),
      );
      return;
    }

    await AppServices.budgetService.registrarMovimentacao(
      orcamento: widget.orcamento,
      valorEmCentavos: valorEmCentavos,
      tipoMovimentacao: _tipo,
      data: _data,
      descricao: _descricaoController.text,
      distribuicaoEntrada: _distribuicaoEntrada,
    );

    if (!mounted) {
      return;
    }

    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Movimentacao registrada com sucesso!')),
    );

    Navigator.pop(context);
  }
}
