import 'package:flutter/foundation.dart';
import 'package:hive/hive.dart';

import '../models/orcamento.dart';
import 'local_scope.dart';

class BudgetRepository {
  BudgetRepository(
    Box<Orcamento> guestBox, {
    Future<Box<Orcamento>> Function(String boxName)? boxOpener,
  })  : _boxOpener = boxOpener ?? Hive.openBox<Orcamento>,
        _boxes = <String, Box<Orcamento>>{
          LocalScopeId.guest: guestBox,
        },
        currentScopeListenable = ValueNotifier<String>(LocalScopeId.guest),
        currentBoxListenable = ValueNotifier<Box<Orcamento>>(guestBox);

  final Future<Box<Orcamento>> Function(String boxName) _boxOpener;
  final Map<String, Box<Orcamento>> _boxes;
  final ValueNotifier<String> currentScopeListenable;
  final ValueNotifier<Box<Orcamento>> currentBoxListenable;

  String get currentScopeId => currentScopeListenable.value;
  Box<Orcamento> get listenableBox => currentBoxListenable.value;
  Iterable<Orcamento> get allBudgets => listenableBox.values;

  Orcamento? getById(String id) {
    return listenableBox.get(id);
  }

  List<Orcamento> listByStatus(StatusOrcamento status) {
    return listenableBox.values
        .where((orcamento) => orcamento.status == status)
        .toList();
  }

  Future<void> switchScope(String scopeId) async {
    final box = await _openScope(scopeId);
    if (currentScopeId == scopeId) {
      currentBoxListenable.value = box;
      return;
    }

    currentScopeListenable.value = scopeId;
    currentBoxListenable.value = box;
  }

  Future<List<Orcamento>> listBudgetsForScope(String scopeId) async {
    final box = await _openScope(scopeId);
    return box.values.toList();
  }

  Future<bool> hasAnyBudgetInScope(String scopeId) async {
    final box = await _openScope(scopeId);
    return box.isNotEmpty;
  }

  Future<Orcamento?> getByIdInScope(String scopeId, String id) async {
    final box = await _openScope(scopeId);
    return box.get(id);
  }

  Future<void> save(Orcamento orcamento) async {
    await saveInScope(currentScopeId, orcamento);
  }

  Future<void> saveInScope(String scopeId, Orcamento orcamento) async {
    final box = await _openScope(scopeId);
    await box.put(orcamento.id, orcamento);
  }

  Future<void> saveAll(Iterable<Orcamento> orcamentos) async {
    await saveAllInScope(currentScopeId, orcamentos);
  }

  Future<void> saveAllInScope(String scopeId, Iterable<Orcamento> orcamentos) async {
    final box = await _openScope(scopeId);
    final map = <String, Orcamento>{
      for (final orcamento in orcamentos) orcamento.id: orcamento,
    };
    await box.putAll(map);
  }

  Future<void> replaceAll(Iterable<Orcamento> orcamentos) async {
    await replaceAllInScope(currentScopeId, orcamentos);
  }

  Future<void> replaceAllInScope(String scopeId, Iterable<Orcamento> orcamentos) async {
    final box = await _openScope(scopeId);
    await box.clear();
    final map = <String, Orcamento>{
      for (final orcamento in orcamentos) orcamento.id: orcamento,
    };
    await box.putAll(map);
  }

  Future<void> clearScope(String scopeId) async {
    final box = await _openScope(scopeId);
    await box.clear();
  }

  Future<Box<Orcamento>> _openScope(String scopeId) async {
    final existing = _boxes[scopeId];
    if (existing != null && existing.isOpen) {
      return existing;
    }

    final box = await _boxOpener(LocalScopeId.boxNameForScope(scopeId));
    _boxes[scopeId] = box;
    return box;
  }
}
