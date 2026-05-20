import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../models/orcamento.dart';
import '../services/app_services.dart';
import '../utils.dart';
import '../widgets/app_drawer.dart';

class CriarOrcamentoPage extends StatefulWidget {
  const CriarOrcamentoPage({super.key, this.orcamentoToClone});

  final Orcamento? orcamentoToClone;

  @override
  State<CriarOrcamentoPage> createState() => _CriarOrcamentoPageState();
}

class _CriarOrcamentoPageState extends State<CriarOrcamentoPage> {
  final _formKey = GlobalKey<FormState>();
  final _codigoController = TextEditingController();
  final _valorInicialController = TextEditingController();
  final _saldoFinalController = TextEditingController();
  final FocusNode _codigoFocus = FocusNode();

  DateTime? _dataFinal;
  TipoOrcamento? _tipoSelecionado;
  int? _diasDeVigencia;
  bool _tipoReadOnly = false;

  @override
  void initState() {
    super.initState();

    if (widget.orcamentoToClone != null) {
      final original = widget.orcamentoToClone!;
      _codigoController.text = '${original.codigo} Copia';
      _valorInicialController.text = _formatInputFromCents(original.valorInicialEmCentavos);
      _saldoFinalController.text =
          _formatInputFromCents(original.saldoFinalDesejadoEmCentavos);
      _tipoSelecionado = original.tipo;
      final diasOriginal = original.dataFinal.difference(original.dataInicio).inDays;
      _dataFinal = dataDeTrabalhoAtual.add(Duration(days: diasOriginal));
      _diasDeVigencia = _dataFinal!
              .difference(
                DateTime(
                  dataDeTrabalhoAtual.year,
                  dataDeTrabalhoAtual.month,
                  dataDeTrabalhoAtual.day,
                ),
              )
              .inDays +
          1;
    }

    WidgetsBinding.instance.addPostFrameCallback((_) {
      FocusScope.of(context).requestFocus(_codigoFocus);
    });
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    final args = ModalRoute.of(context)?.settings.arguments;
    if (args is Map && args.containsKey('tipoFixo')) {
      _tipoSelecionado = args['tipoFixo'] as TipoOrcamento;
      _tipoReadOnly = true;
    }
  }

  @override
  void dispose() {
    _codigoController.dispose();
    _valorInicialController.dispose();
    _saldoFinalController.dispose();
    _codigoFocus.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_dataFinal != null) {
      _diasDeVigencia = _dataFinal!
              .difference(
                DateTime(
                  dataDeTrabalhoAtual.year,
                  dataDeTrabalhoAtual.month,
                  dataDeTrabalhoAtual.day,
                ),
              )
              .inDays +
          1;
    }

    final appBarTitle = _tipoReadOnly && _tipoSelecionado != null
        ? 'Novo Orcamento de ${_tipoSelecionado == TipoOrcamento.gasto ? 'Gasto' : 'Economia'}'
        : 'Novo Orcamento';

    return Scaffold(
      appBar: AppBar(title: Text(appBarTitle)),
      drawer: const AppDrawer(),
      body: Padding(
        padding: const EdgeInsets.all(16),
        child: Form(
          key: _formKey,
          child: ListView(
            children: [
              TextFormField(
                controller: _codigoController,
                focusNode: _codigoFocus,
                decoration: const InputDecoration(labelText: 'Codigo'),
                validator: (value) =>
                    value == null || value.trim().isEmpty ? 'Obrigatorio' : null,
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _valorInicialController,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                decoration: const InputDecoration(labelText: 'Valor inicial'),
                validator: (value) {
                  if (value == null || value.trim().isEmpty) {
                    return _tipoSelecionado == TipoOrcamento.gasto ? 'Obrigatorio' : null;
                  }

                  final valor = parseValorEmCentavos(value);
                  if (valor <= 0) {
                    return 'Valor deve ser maior que zero';
                  }
                  return null;
                },
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _saldoFinalController,
                keyboardType: const TextInputType.numberWithOptions(decimal: true),
                decoration: const InputDecoration(labelText: 'Saldo final desejado'),
                validator: (value) {
                  final saldo = parseValorEmCentavos(value ?? '');
                  final valorInicial = parseValorEmCentavos(_valorInicialController.text);

                  if (_tipoSelecionado == TipoOrcamento.gasto) {
                    if ((value ?? '').trim().isEmpty) {
                      return null;
                    }
                    if (saldo >= valorInicial) {
                      return 'Saldo final deve ser menor que o valor inicial';
                    }
                    return null;
                  }

                  if ((value ?? '').trim().isEmpty) {
                    return 'Obrigatorio';
                  }
                  if (saldo <= 0) {
                    return 'Valor deve ser maior que zero';
                  }
                  return null;
                },
              ),
              const SizedBox(height: 12),
              if (!_tipoReadOnly)
                DropdownButtonFormField<TipoOrcamento>(
                  initialValue: _tipoSelecionado,
                  decoration: const InputDecoration(labelText: 'Tipo de orcamento'),
                  items: const [
                    DropdownMenuItem(
                      value: TipoOrcamento.gasto,
                      child: Text('Gasto'),
                    ),
                    DropdownMenuItem(
                      value: TipoOrcamento.economia,
                      child: Text('Economia'),
                    ),
                  ],
                  onChanged: (value) {
                    setState(() {
                      _tipoSelecionado = value;
                    });
                  },
                  validator: (value) => value == null ? 'Selecione o tipo' : null,
                ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: Text(
                      _dataFinal == null
                          ? 'Selecione a data final'
                          : 'Data final: ${DateFormat('dd/MM/yyyy').format(_dataFinal!)}',
                    ),
                  ),
                  TextButton(
                    onPressed: () async {
                      final selecionada = await showDatePicker(
                        context: context,
                        initialDate: dataDeTrabalhoAtual.add(const Duration(days: 1)),
                        firstDate: dataDeTrabalhoAtual,
                        lastDate: dataDeTrabalhoAtual.add(const Duration(days: 365)),
                      );

                      if (selecionada != null) {
                        setState(() {
                          _dataFinal = selecionada;
                        });
                      }
                    },
                    child: const Text('Escolher data'),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              if (_dataFinal != null)
                Text(
                  '${_diasDeVigencia ?? 0} dias',
                  style: const TextStyle(fontSize: 16, fontWeight: FontWeight.bold),
                  textAlign: TextAlign.center,
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
                    onPressed: _salvarOrcamento,
                    child: const Text('Criar orcamento'),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }

  Future<void> _salvarOrcamento() async {
    if (_formKey.currentState?.validate() != true || _dataFinal == null || _tipoSelecionado == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
            'Preencha os campos obrigatorios e escolha a data final.',
          ),
        ),
      );
      return;
    }

    final valorInicialEmCentavos = parseValorEmCentavos(_valorInicialController.text);
    final saldoFinalEmCentavos = parseValorEmCentavos(_saldoFinalController.text);

    await AppServices.budgetService.criarOrcamento(
      codigo: _codigoController.text,
      valorInicialEmCentavos: valorInicialEmCentavos,
      saldoFinalDesejadoEmCentavos: saldoFinalEmCentavos,
      dataFinal: _dataFinal!,
      tipo: _tipoSelecionado!,
    );

    if (!mounted) {
      return;
    }

    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Orcamento criado com sucesso!')),
    );

    Navigator.pushReplacementNamed(context, '/lista');
  }

  String _formatInputFromCents(int valueInCents) {
    return (valueInCents / 100).toStringAsFixed(2);
  }
}
