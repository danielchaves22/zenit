import 'package:flutter/material.dart';
import 'package:hive/hive.dart';
import 'package:intl/intl.dart';
import 'package:orcamento_app/utils.dart';
import '../models/orcamento.dart';
import 'resumo_orcamento_page.dart';
import '../widgets/app_drawer.dart';

class CriarOrcamentoPage extends StatefulWidget {
  final Orcamento? orcamentoToClone;
  const CriarOrcamentoPage({Key? key, this.orcamentoToClone}) : super(key: key);

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
  bool _tipoReadOnly = false; // Se true, não exibe o dropdown

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    // Recupera os argumentos da rota e verifica se há "tipoFixo"
    final args = ModalRoute.of(context)?.settings.arguments;
    if (args is Map && args.containsKey("tipoFixo")) {
      setState(() {
        _tipoSelecionado = args["tipoFixo"] as TipoOrcamento;
        _tipoReadOnly = true;
      });
    }
  }

  @override
  void initState() {
    super.initState();
    // Se for clonagem, pré-carrega os dados
    if (widget.orcamentoToClone != null) {
      final original = widget.orcamentoToClone!;
      _codigoController.text = original.codigo + " Cópia";
      _valorInicialController.text = original.valorInicial.toString();
      _saldoFinalController.text = original.saldoFinalDesejado.toString();
      _tipoSelecionado = original.tipo;
      final diasOriginal =
          original.dataFinal.difference(original.dataInicio).inDays;
      _dataFinal = dataDeTrabalhoAtual.add(Duration(days: diasOriginal));
      _diasDeVigencia = _dataFinal!
              .difference(DateTime(dataDeTrabalhoAtual.year,
                  dataDeTrabalhoAtual.month, dataDeTrabalhoAtual.day))
              .inDays +
          1;
    }
    // Solicita foco no campo de código
    WidgetsBinding.instance.addPostFrameCallback((_) {
      FocusScope.of(context).requestFocus(_codigoFocus);
    });
  }

  @override
  Widget build(BuildContext context) {
    if (_dataFinal != null) {
      _diasDeVigencia = _dataFinal!
              .difference(DateTime(dataDeTrabalhoAtual.year,
                  dataDeTrabalhoAtual.month, dataDeTrabalhoAtual.day))
              .inDays +
          1;
    }
    // Define título conforme se o tipo está fixo ou não
    String appBarTitle = _tipoReadOnly && _tipoSelecionado != null
        ? "Novo Orçamento de " +
            (_tipoSelecionado == TipoOrcamento.gasto ? "Gasto" : "Economia")
        : "Novo Orçamento";

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
                decoration: const InputDecoration(labelText: 'Código'),
                validator: (value) =>
                    value == null || value.isEmpty ? 'Obrigatório' : null,
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _valorInicialController,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: 'Valor inicial'),
                validator: (value) {
                  if (value == null || value.isEmpty) {
                    return _tipoSelecionado == TipoOrcamento.gasto
                        ? 'Obrigatório'
                        : null;
                  }
                  final valor = double.tryParse(value);
                  if (valor == null || valor <= 0) {
                    return 'Valor deve ser maior que zero';
                  }
                  return null;
                },
              ),
              const SizedBox(height: 12),
              TextFormField(
                controller: _saldoFinalController,
                keyboardType: TextInputType.number,
                decoration:
                    const InputDecoration(labelText: 'Saldo final desejado'),
                validator: (value) {
                  if (_tipoSelecionado == TipoOrcamento.gasto) {
                    // Para orçamento de Gasto, campo é opcional (se vazio, assume 0)
                    if (value == null || value.isEmpty) return null;
                    final saldo = double.tryParse(value);
                    final valorInicial =
                        double.tryParse(_valorInicialController.text) ?? 0.0;
                    if (saldo == null) return 'Valor inválido';
                    if (saldo >= valorInicial) {
                      return 'Saldo final deve ser menor que o valor inicial';
                    }
                    return null;
                  } else {
                    // Para orçamento de Economia, campo é obrigatório e deve ser maior que 0
                    if (value == null || value.isEmpty) return 'Obrigatório';
                    final saldo = double.tryParse(value);
                    if (saldo == null || saldo <= 0) {
                      return 'Valor deve ser maior que zero';
                    }
                    return null;
                  }
                },
              ),
              const SizedBox(height: 12),
              // Exibe o dropdown apenas se o tipo não estiver fixo
              if (!_tipoReadOnly)
                DropdownButtonFormField<TipoOrcamento>(
                  value: _tipoSelecionado,
                  decoration:
                      const InputDecoration(labelText: 'Tipo de orçamento'),
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
                  validator: (value) =>
                      value == null ? 'Selecione o tipo' : null,
                ),
              const SizedBox(height: 12),
              Row(
                children: [
                  Expanded(
                    child: Text(_dataFinal == null
                        ? 'Selecione a data final'
                        : 'Data final: ${DateFormat('dd/MM/yyyy').format(_dataFinal!)}'),
                  ),
                  TextButton(
                    onPressed: () async {
                      final hoje = dataDeTrabalhoAtual;
                      final selecionada = await showDatePicker(
                        context: context,
                        initialDate: hoje.add(const Duration(days: 1)),
                        firstDate: hoje,
                        lastDate: hoje.add(const Duration(days: 365)),
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
                  style: const TextStyle(
                      fontSize: 16, fontWeight: FontWeight.bold),
                  textAlign: TextAlign.center,
                ),
              const SizedBox(height: 24),
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
                    onPressed: _salvarOrcamento,
                    child: const Text('Criar orçamento'),
                  ),
                ],
              )
            ],
          ),
        ),
      ),
    );
  }

  void _salvarOrcamento() {
    if (_formKey.currentState?.validate() != true || _dataFinal == null) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(
          content: Text(
              'Por favor, preencha todos os campos obrigatórios e escolha a data final.'),
          duration: Duration(seconds: 3),
        ),
      );
      return;
    }

    final valorInicial = double.tryParse(_valorInicialController.text) ?? 0.0;
    final saldoFinal = _saldoFinalController.text.isEmpty
        ? 0.0
        : double.tryParse(_saldoFinalController.text) ?? 0.0;
    final hoje = dataDeTrabalhoAtual;
    final diasRestantes = _dataFinal!
            .difference(DateTime(hoje.year, hoje.month, hoje.day))
            .inDays +
        1;
    final saldoDisponivel = valorInicial - saldoFinal;
    final orcamentoDiario = saldoDisponivel / diasRestantes;
    final box = Hive.box<Orcamento>('orcamentos');
    final hasActive =
        box.values.any((orc) => orc.status == StatusOrcamento.ativo);
    final isTrabalho = !hasActive;

    final novo = Orcamento(
      id: DateTime.now().millisecondsSinceEpoch.toString(),
      codigo: _codigoController.text,
      valorInicial: valorInicial,
      saldoAtual: valorInicial,
      dataFinal: _dataFinal!,
      saldoFinalDesejado: saldoFinal,
      movimentacoes: [],
      orcamentoDiarioInicial: orcamentoDiario,
      orcamentoDiarioAtual: orcamentoDiario,
      dataInicio: dataDeTrabalhoAtual,
      tipo: _tipoSelecionado!,
      dataOrcamentoDiarioAtual: dataDeTrabalhoAtual,
      isTrabalho: isTrabalho,
      status: StatusOrcamento.ativo,
    );

    box.put(novo.id, novo);

    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(
        content: Text('Orçamento criado com sucesso!'),
        duration: Duration(seconds: 2),
      ),
    );

    Navigator.pushReplacementNamed(context, '/lista');
  }
}
