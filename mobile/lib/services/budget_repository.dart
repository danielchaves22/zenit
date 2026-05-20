import 'package:hive/hive.dart';

import '../models/orcamento.dart';

class BudgetRepository {
  BudgetRepository(this._box);

  final Box<Orcamento> _box;

  Iterable<Orcamento> get allBudgets => _box.values;

  Box<Orcamento> get listenableBox => _box;

  Orcamento? getById(String id) {
    return _box.get(id);
  }

  List<Orcamento> listByStatus(StatusOrcamento status) {
    return _box.values.where((orcamento) => orcamento.status == status).toList();
  }

  Future<void> save(Orcamento orcamento) async {
    await _box.put(orcamento.id, orcamento);
  }

  Future<void> saveAll(Iterable<Orcamento> orcamentos) async {
    final map = <String, Orcamento>{
      for (final orcamento in orcamentos) orcamento.id: orcamento,
    };
    await _box.putAll(map);
  }

  Future<void> replaceAll(Iterable<Orcamento> orcamentos) async {
    await _box.clear();
    await saveAll(orcamentos);
  }
}
